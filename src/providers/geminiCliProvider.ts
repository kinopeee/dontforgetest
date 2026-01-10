import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import { nowMs, type TestGenEvent } from '../core/event';
import { type AgentProvider, type AgentRunOptions, type RunningTask } from './provider';

/**
 * Gemini CLI（gemini -p）を呼び出してテスト生成を実行するProvider。
 *
 * `--output-format stream-json` を前提にstdoutを行単位でパースし、
 * 拡張機能側の共通イベント（TestGenEvent）へ正規化して通知する。
 */
export class GeminiCliProvider implements AgentProvider {
  public readonly id: string = 'gemini-cli';
  public readonly displayName: string = 'Gemini CLI';

  private activeChild: ChildProcessWithoutNullStreams | undefined;
  private activeTaskId: string | undefined;

  public run(options: AgentRunOptions): RunningTask {
    // 多重起動で gemini プロセスが残り続けると問題になるため、既存タスクがあれば停止する。
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
        message: `前回の gemini タスク（${prevTaskId}）が終了していなかったため停止しました。`,
        timestampMs: nowMs(),
      });
    }

    const child = this.spawnGeminiCli(options);
    this.activeChild = child;
    this.activeTaskId = options.taskId;
    this.wireOutput(child, options);

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

  private spawnGeminiCli(options: AgentRunOptions): ChildProcessWithoutNullStreams {
    const command = options.agentCommand ?? 'gemini';
    const args: string[] = [];

    // -p / --print: 非対話（ヘッドレス）モード
    args.push('-p');
    args.push(options.prompt);
    args.push('--output-format', options.outputFormat);

    if (options.model) {
      args.push('--model', options.model);
    }

    // Gemini CLI の権限/ツール許可
    if (options.allowWrite) {
      args.push('--approval-mode', 'auto_edit');
    } else {
      args.push('--approval-mode', 'default');
    }

    // gemini が内部で $EDITOR / $PAGER を呼び、GUI起動で待ち続けるケースを避ける。
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

    const child = spawn(command, args, {
      cwd: options.workspaceRoot,
      env,
      stdio: 'pipe',
    });

    // gemini が標準入力待ちで停止するケースを切り分けるため、stdin を明示的に閉じる。
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
    let startedEmitted = false;
    const toolIdToPath = new Map<string, string>();

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

    const emitStarted = (): void => {
      if (startedEmitted) {
        return;
      }
      startedEmitted = true;
      const command = options.agentCommand ?? 'gemini';
      emitEvent({
        type: 'started',
        taskId: options.taskId,
        label: 'gemini-cli',
        detail: `cmd=${command} format=${options.outputFormat}${options.model ? ` model=${options.model}` : ''}${options.allowWrite ? ' write=on' : ' write=off'}`,
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
        if (trimmed.length === 0) {
          newlineIndex = stdoutBuffer.indexOf('\n');
          continue;
        }

        const obj = tryParseJson(trimmed);
        if (!obj) {
          onLog('warn', `gemini stream-json parse error: ${trimmed}`);
          newlineIndex = stdoutBuffer.indexOf('\n');
          continue;
        }

        if (!startedEmitted && getString(obj, 'type') === 'init') {
          emitStarted();
        }

        this.handleStreamJson(obj, options, toolIdToPath, emitStarted, emitEvent);
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

      onLog('error', `gemini 実行エラー: ${err.message}`);
      emitCompleted(null);
    });

    child.on('close', (code: number | null) => {
      if (this.activeChild === child) {
        this.activeChild = undefined;
        this.activeTaskId = undefined;
      }

      emitCompleted(code);
    });
  }

  private handleStreamJson(
    obj: Record<string, unknown>,
    options: AgentRunOptions,
    toolIdToPath: Map<string, string>,
    emitStarted: () => void,
    emitEvent: (event: TestGenEvent) => void,
  ): void {
    const type = getString(obj, 'type');

    if (type === 'init') {
      emitStarted();
      return;
    }

    if (type === 'message') {
      const message = normalizeGeminiMessage(obj);
      const role = message ? getString(message, 'role') : undefined;

      if (role === 'assistant' || role === 'model') {
        const text = extractMessageText(message);
        if (text) {
          emitEvent({
            type: 'log',
            taskId: options.taskId,
            level: 'info',
            message: text,
            timestampMs: nowMs(),
          });
        }
      }
      return;
    }

    if (type === 'tool_use') {
      const toolName = getString(obj, 'tool_name');
      const toolId = getString(obj, 'tool_id');
      if (toolName === 'write_file' || toolName === 'replace') {
        const parameters = asRecord(obj.parameters);
        const filePath = parameters ? getString(parameters, 'file_path') : undefined;
        if (filePath) {
          if (toolId) {
            toolIdToPath.set(toolId, filePath);
          }
          const relative = toWorkspaceRelative(filePath, options.workspaceRoot);
          emitEvent({
            type: 'fileWrite',
            taskId: options.taskId,
            path: relative ?? filePath,
            timestampMs: nowMs(),
          });
        }
      }
      return;
    }

    if (type === 'tool_result') {
      const toolId = getString(obj, 'tool_id');
      if (toolId) {
        const filePath = toolIdToPath.get(toolId);
        const output = extractToolResultOutput(obj);
        if (filePath && output) {
          emitEvent({
            type: 'log',
            taskId: options.taskId,
            level: 'info',
            message: `tool_result: ${output}`,
            timestampMs: nowMs(),
          });
        }
      }
      return;
    }

    if (type === 'error') {
      const message = getString(obj, 'message');
      const detail = message ?? 'gemini error event received';
      emitEvent({
        type: 'log',
        taskId: options.taskId,
        level: 'error',
        message: detail,
        timestampMs: nowMs(),
      });
      return;
    }

    if (type === 'result') {
      const status = getString(obj, 'status');
      emitEvent({
        type: 'log',
        taskId: options.taskId,
        level: 'info',
        message: `result: status=${status ?? 'unknown'}`,
        timestampMs: nowMs(),
      });
      return;
    }

    if (type) {
      emitEvent({
        type: 'log',
        taskId: options.taskId,
        level: 'info',
        message: `event:${type}`,
        timestampMs: nowMs(),
      });
    }
  }
}

/**
 * テスト専用の内部エクスポート。
 * 本番利用は禁止。
 */
export const __test__ = {
  tryParseJson,
  asRecord,
  extractMessageText,
  extractToolResultOutput,
  normalizeGeminiMessage,
  toWorkspaceRelative,
};

function tryParseJson(line: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(line);
    const rec = asRecord(parsed);
    return rec ?? undefined;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

function extractMessageText(message: Record<string, unknown> | undefined): string | undefined {
  if (!message) {
    return undefined;
  }
  const delta = getString(message, 'delta');
  if (delta) {
    return delta;
  }
  const content = message.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const texts = content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        const rec = asRecord(item);
        return rec ? getString(rec, 'text') : undefined;
      })
      .filter((item): item is string => typeof item === 'string' && item.length > 0);
    if (texts.length > 0) {
      return texts.join('');
    }
  }
  return undefined;
}

function extractToolResultOutput(obj: Record<string, unknown>): string | undefined {
  const output = getString(obj, 'output');
  if (output) {
    return output;
  }
  const result = asRecord(obj.result);
  if (!result) {
    return undefined;
  }
  const resultOutput = getString(result, 'output');
  if (resultOutput) {
    return resultOutput;
  }
  const content = getString(result, 'content');
  return content;
}

function toWorkspaceRelative(filePath: string, workspaceRoot: string): string | undefined {
  if (!path.isAbsolute(filePath)) {
    return filePath;
  }
  const relative = path.relative(workspaceRoot, filePath);
  if (relative.startsWith('..')) {
    return undefined;
  }
  return relative;
}

function normalizeGeminiMessage(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  const fromMessage = asRecord(obj.message);
  if (fromMessage) {
    return fromMessage;
  }

  const hasRole = Object.prototype.hasOwnProperty.call(obj, 'role');
  const hasContent = Object.prototype.hasOwnProperty.call(obj, 'content');
  const hasDelta = Object.prototype.hasOwnProperty.call(obj, 'delta');

  if (!hasRole && !hasContent && !hasDelta) {
    return undefined;
  }

  const result: Record<string, unknown> = {};
  if (hasRole) {
    result.role = obj.role;
  }
  if (hasContent) {
    result.content = obj.content;
  }
  if (hasDelta) {
    result.delta = obj.delta;
  }
  return result;
}
