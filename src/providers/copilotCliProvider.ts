import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { nowMs, type TestGenEvent } from '../core/event';
import { type AgentProvider, type AgentRunOptions, type RunningTask } from './provider';

/**
 * GitHub Copilot CLI（copilot -p）を呼び出してテスト生成を実行するProvider。
 *
 * - Copilot CLI は stream-json を提供しないため、stdout を行単位でログとして扱う。
 * - fileWrite の検知は行わない（必要な場合は git diff による補完にフォールバックする）。
 */
export class CopilotCliProvider implements AgentProvider {
  public readonly id: string = 'copilot-cli';
  public readonly displayName: string = 'Copilot CLI';

  private activeChild: ChildProcessWithoutNullStreams | undefined;
  private activeTaskId: string | undefined;
  private readonly spawnFn: typeof spawn;

  /**
   * @param spawnFn テスト用に注入可能な spawn 関数（デフォルト: 実際の child_process.spawn）
   */
  constructor(spawnFn?: typeof spawn) {
    this.spawnFn = spawnFn ?? spawn;
  }

  public run(options: AgentRunOptions): RunningTask {
    // 多重起動で copilot プロセスが残り続けると問題になるため、既存タスクがあれば停止する。
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
        message: `前回の copilot タスク（${prevTaskId}）が終了していなかったため停止しました。`,
        timestampMs: nowMs(),
      });
    }

    const command = options.agentCommand ?? 'copilot';
    const child = this.spawnCopilot(options);
    this.activeChild = child;
    this.activeTaskId = options.taskId;
    this.wireOutput(child, options);

    options.onEvent({
      type: 'started',
      taskId: options.taskId,
      label: 'copilot-cli',
      detail: `cmd=${command}${options.model ? ` model=${options.model}` : ''}${options.allowWrite ? ' write=on' : ' write=off'}`,
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

  private spawnCopilot(options: AgentRunOptions): ChildProcessWithoutNullStreams {
    const command = options.agentCommand ?? 'copilot';
    const args: string[] = [];

    // -p / --prompt: 非対話（ヘッドレス）モード（単発実行）
    args.push('-p');
    args.push(options.prompt);

    // 出力をスクリプト向けに寄せる
    args.push('--silent');
    args.push('--stream', 'off');
    args.push('--no-color');
    args.push('--no-auto-update');
    args.push('--no-custom-instructions');

    // VS Code 拡張からの実行でもワークスペースへのアクセスを許可する
    args.push('--add-dir', options.workspaceRoot);

    if (options.model) {
      args.push('--model', options.model);
    }

    // shell 実行を許可（testExecutionRunner で Bash が必要 - Claude Code と同じ方針）
    // preTestCheck や testExecutionRunner=cursorAgent でシェルコマンド実行が必要なため
    args.push('--allow-tool', 'shell(command:*)');

    // allowWrite に応じてファイル書き込みを許可/拒否する
    if (options.allowWrite) {
      args.push('--allow-tool', 'write');
    } else {
      args.push('--deny-tool', 'write');
    }

    // copilot が内部で $EDITOR / $PAGER を呼び、GUI起動で待ち続けるケースを避ける。
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

    // copilot が標準入力待ちで停止するケースを切り分けるため、stdin を明示的に閉じる。
    try {
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
        const line = stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, '');
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        // 空行はログとしてノイズになりやすいのでスキップ（マーカー行は空にならない想定）
        if (line.trim().length > 0) {
          onLog('info', line);
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
      onLog('error', `copilot 実行エラー: ${err.message}`);
      emitCompleted(null);
    });

    child.on('close', (code: number | null) => {
      if (this.activeChild === child) {
        this.activeChild = undefined;
        this.activeTaskId = undefined;
      }
      const tail = stdoutBuffer.replace(/\r/g, '').trim();
      if (tail.length > 0) {
        onLog('info', tail);
      }
      emitCompleted(code);
    });
  }
}

