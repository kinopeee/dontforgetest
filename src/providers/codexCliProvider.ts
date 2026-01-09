import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { nowMs, type TestGenEvent } from '../core/event';
import { type AgentProvider, type AgentRunOptions, type RunningTask } from './provider';

type CommandPrompt = { commandName: string; filePath: string; text: string };
type CodexPromptDeps = {
  homedir: () => string;
  readFileSync: (filePath: string, encoding: BufferEncoding) => string;
};

/**
 * Codex CLI（codex）を呼び出してテスト生成を実行するProvider。
 *
 * ~/.codex/prompts のコマンドファイルを読み取り、実行プロンプトへ注入する。
 */
export class CodexCliProvider implements AgentProvider {
  public readonly id: string = 'codex-cli';
  public readonly displayName: string = 'Codex CLI';

  private activeChild: ChildProcessWithoutNullStreams | undefined;
  private activeTaskId: string | undefined;
  private readonly spawnFn: typeof spawn;
  private readonly promptDeps: CodexPromptDeps;

  /**
   * @param spawnFn テスト用に注入可能な spawn 関数（デフォルト: 実際の child_process.spawn）
   * @param deps テスト用に注入可能な依存関係（外部FSに依存しないための hook）
   */
  constructor(spawnFn?: typeof spawn, deps?: Partial<CodexPromptDeps>) {
    this.spawnFn = spawnFn ?? spawn;
    this.promptDeps = {
      homedir: deps?.homedir ?? os.homedir,
      readFileSync: deps?.readFileSync ?? fs.readFileSync,
    };
  }

  public run(options: AgentRunOptions): RunningTask {
    // 多重起動で codex プロセスが残り続けると問題になるため、既存タスクがあれば停止する。
    if (this.activeChild) {
      const prevTaskId = this.activeTaskId ?? 'unknown';
      try {
        this.activeChild.kill();
      } catch {
        // noop
      }
      this.activeChild = undefined;
      this.activeTaskId = undefined;

      options.onEvent({
        type: 'log',
        taskId: options.taskId,
        level: 'warn',
        message: `前回の codex タスク（${prevTaskId}）が終了していなかったため停止しました。`,
        timestampMs: nowMs(),
      });
    }

    const injected = buildPromptWithCodexCommand(options, this.promptDeps);
    const child = this.spawnCodex(options, injected.prompt);
    this.activeChild = child;
    this.activeTaskId = options.taskId;
    this.wireOutput(child, options);

    if (injected.commandPrompt) {
      options.onEvent({
        type: 'log',
        taskId: options.taskId,
        level: 'info',
        message: `codex コマンドプロンプトを注入しました: ${injected.commandPrompt.filePath}`,
        timestampMs: nowMs(),
      });
    } else if (injected.commandName) {
      options.onEvent({
        type: 'log',
        taskId: options.taskId,
        level: 'warn',
        message: `codex コマンドプロンプトが見つからないためスキップしました: ${injected.commandName}`,
        timestampMs: nowMs(),
      });
    }

    const command = options.agentCommand ?? 'codex';
    options.onEvent({
      type: 'started',
      taskId: options.taskId,
      label: 'codex-cli',
      detail: `cmd=${command} format=${options.outputFormat}${options.model ? ` model=${options.model}` : ''}${options.allowWrite ? ' write=on' : ' write=off'}`,
      timestampMs: nowMs(),
    });

    return {
      taskId: options.taskId,
      dispose: () => {
        try {
          child.kill();
        } catch {
          // Ignore kill errors
        } finally {
          if (this.activeChild === child) {
            this.activeChild = undefined;
            this.activeTaskId = undefined;
          }
        }
      },
    };
  }

  private spawnCodex(options: AgentRunOptions, prompt: string): ChildProcessWithoutNullStreams {
    const command = options.agentCommand ?? 'codex';
    const args: string[] = ['exec'];

    if (options.model) {
      args.push('--model', options.model);
    }

    const config = vscode.workspace.getConfiguration('dontforgetest');
    const reasoningEffort = (config.get<string>('codexReasoningEffort') ?? '').trim();
    if (reasoningEffort.length > 0) {
      // TOML パースされるため、文字列はクォート付きで渡す。
      args.push('-c', `model_reasoning_effort="${reasoningEffort}"`);
    }

    // codex exec は prompt を stdin から受け取る（長文でも安全）。
    args.push('-');

    // codex が内部で $EDITOR / $PAGER を呼び、GUI起動で待ち続けるケースを避ける。
    const env: NodeJS.ProcessEnv = { ...process.env };
    const runningInVsCode =
      typeof process.env.VSCODE_IPC_HOOK_CLI === 'string' ||
      typeof process.env.VSCODE_PID === 'string' ||
      typeof process.env.VSCODE_CWD === 'string';
    if (runningInVsCode) {
      env.EDITOR = 'true';
      env.VISUAL = 'true';
      env.GIT_EDITOR = 'true';
      env.PAGER = 'cat';
      env.GIT_PAGER = 'cat';
      env.LESS = 'FRX';
    }

    const child = this.spawnFn(command, args, {
      cwd: options.workspaceRoot,
      env,
      stdio: 'pipe',
    });

    try {
      child.stdin.write(`${prompt}\n`);
      child.stdin.end();
    } catch {
      // noop
    }

    return child;
  }

  private wireOutput(child: ChildProcessWithoutNullStreams, options: AgentRunOptions): void {
    let stdoutBuffer = '';
    let completedEmitted = false;

    const emitEvent = (event: TestGenEvent): void => {
      options.onEvent(event);
    };

    const emitCompleted = (exitCode: number | null): void => {
      if (completedEmitted) {
        return;
      }
      completedEmitted = true;
      emitEvent({
        type: 'completed',
        taskId: options.taskId,
        exitCode,
        timestampMs: nowMs(),
      });
    };

    const onLog = (level: 'info' | 'warn' | 'error', message: string): void => {
      emitEvent({
        type: 'log',
        taskId: options.taskId,
        level,
        message,
        timestampMs: nowMs(),
      });
    };

    child.stdout.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString('utf8');
      let newlineIndex = stdoutBuffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        const trimmed = line.trim();
        if (trimmed.length > 0) {
          onLog('info', trimmed);
        }
        newlineIndex = stdoutBuffer.indexOf('\n');
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      const msg = data.toString('utf8').trim();
      if (msg.length > 0) {
        onLog('error', msg);
      }
    });

    child.on('error', (err: Error) => {
      if (this.activeChild === child) {
        this.activeChild = undefined;
        this.activeTaskId = undefined;
      }
      onLog('error', `codex 実行エラー: ${err.message}`);
      emitCompleted(null);
    });

    child.on('close', (code: number | null) => {
      if (this.activeChild === child) {
        this.activeChild = undefined;
        this.activeTaskId = undefined;
      }
      const tail = stdoutBuffer.trim();
      if (tail.length > 0) {
        onLog('info', tail);
      }
      emitCompleted(code);
    });
  }
}

function buildPromptWithCodexCommand(
  options: AgentRunOptions,
  deps: CodexPromptDeps,
): { prompt: string; commandName?: string; commandPrompt?: CommandPrompt } {
  const config = vscode.workspace.getConfiguration('dontforgetest');
  const commandName = (config.get<string>('codexPromptCommand') ?? '').trim();
  if (commandName.length === 0) {
    return { prompt: options.prompt };
  }

  const commandPrompt = readCodexCommandPrompt(commandName, deps);
  if (!commandPrompt) {
    return { prompt: options.prompt, commandName };
  }

  const injectedPrompt = [commandPrompt.text.trim(), '', options.prompt].join('\n');
  return { prompt: injectedPrompt, commandName: commandPrompt.commandName, commandPrompt };
}

function readCodexCommandPrompt(commandName: string, deps: CodexPromptDeps): CommandPrompt | undefined {
  const promptDir = path.join(deps.homedir(), '.codex', 'prompts');
  const normalized = commandName.endsWith('.md') ? commandName : `${commandName}.md`;
  const filePath = path.join(promptDir, normalized);

  try {
    const text = deps.readFileSync(filePath, 'utf8');
    if (text.trim().length === 0) {
      return undefined;
    }
    return {
      commandName: commandName.trim(),
      filePath,
      text,
    };
  } catch {
    return undefined;
  }
}
