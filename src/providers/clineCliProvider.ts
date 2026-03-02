import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import { nowMs, type TestGenEvent } from '../core/event';
import { type AgentProvider, type AgentRunOptions, type RunningTask } from './provider';

/**
 * Cline CLI（cline）を呼び出してテスト生成を実行するProvider。
 *
 * Cline の `--json` 出力（JSON Lines）を1行ずつパースし、
 * 拡張機能側の共通イベント（TestGenEvent）へ正規化して通知する。
 */
export class ClineCliProvider implements AgentProvider {
  public readonly id: string = 'cline-cli';
  public readonly displayName: string = 'Cline CLI';

  private activeChild: ChildProcessWithoutNullStreams | undefined;
  private activeTaskId: string | undefined;
  private readonly spawnFn: typeof spawn;

  /**
   * @param spawnFn テスト用に注入可能な spawn 関数（デフォルト: child_process.spawn）
   */
  constructor(spawnFn?: typeof spawn) {
    this.spawnFn = spawnFn ?? spawn;
  }

  public run(options: AgentRunOptions): RunningTask {
    // 多重起動で cline プロセスが残り続けると問題になるため、既存タスクがあれば停止する。
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
        message: `前回の cline タスク（${prevTaskId}）が終了していなかったため停止しました。`,
        timestampMs: nowMs(),
      });
    }

    const child = this.spawnClineCli(options);
    this.activeChild = child;
    this.activeTaskId = options.taskId;
    this.wireOutput(child, options);

    const command = options.agentCommand ?? 'cline';
    options.onEvent({
      type: 'started',
      taskId: options.taskId,
      label: 'cline-cli',
      detail: `cmd=${command}${options.model ? ` model=${options.model}` : ''}${options.allowWrite ? ' yolo=on' : ' yolo=off'}`,
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

  private spawnClineCli(options: AgentRunOptions): ChildProcessWithoutNullStreams {
    const command = options.agentCommand ?? 'cline';
    const args: string[] = ['--json'];

    if (options.model) {
      args.push('--model', options.model);
    }
    if (options.allowWrite) {
      args.push('-y');
    }

    // prompt は最後に付与（引数として渡す）
    args.push(options.prompt);

    // cline が内部で $EDITOR / $PAGER を呼び、GUI起動で待ち続けるケースを避ける。
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

    // prompt は引数で渡しているため、stdin は明示的に閉じる。
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
        const rawLine = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        const line = rawLine.trim();
        if (line.length > 0) {
          const parsed = tryParseJson(line);
          if (!parsed) {
            onLog('warn', `cline json parse error: ${line}`);
          } else {
            this.handleJsonLine(parsed, options, emitEvent);
          }
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
      onLog('error', `cline 実行エラー: ${err.message}`);
      emitCompleted(null);
    });

    child.on('close', (code: number | null) => {
      if (this.activeChild === child) {
        this.activeChild = undefined;
        this.activeTaskId = undefined;
      }

      const tail = stdoutBuffer.trim();
      if (tail.length > 0) {
        const parsed = tryParseJson(tail);
        if (parsed) {
          this.handleJsonLine(parsed, options, emitEvent);
        } else {
          onLog('warn', `cline json parse error: ${tail}`);
        }
      }

      emitCompleted(code);
    });
  }

  private handleJsonLine(
    obj: Record<string, unknown>,
    options: AgentRunOptions,
    emitEvent: (event: TestGenEvent) => void,
  ): void {
    const type = getString(obj, 'type');
    const say = getString(obj, 'say');
    const ask = getString(obj, 'ask');
    const isPartial = getBoolean(obj, 'partial') === true;
    const isErrorLike = say === 'error' || ask === 'error';

    // text は基本ログに正規化する。
    const text = getString(obj, 'text');
    // partial=true は断片が分割されるため、後段のマーカー抽出を壊さないようログ出力しない。
    if (!isPartial && text && text.trim().length > 0) {
      emitEvent({
        type: 'log',
        taskId: options.taskId,
        level: isErrorLike ? 'error' : 'info',
        message: text.trim(),
        timestampMs: nowMs(),
      });
    }

    // files 配列がある場合は fileWrite を発火する。
    const files = getStringArray(obj, 'files');
    for (const filePath of files) {
      const relative = toWorkspaceRelative(filePath, options.workspaceRoot);
      emitEvent({
        type: 'fileWrite',
        taskId: options.taskId,
        path: relative ?? filePath,
        timestampMs: nowMs(),
      });
    }

    if (!text && type) {
      // text が無いイベントはタイプだけ記録しておく。
      emitEvent({
        type: 'log',
        taskId: options.taskId,
        level: isErrorLike ? 'error' : 'info',
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
  getStringArray,
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

function getStringArray(obj: Record<string, unknown>, key: string): string[] {
  const value = obj[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function getBoolean(obj: Record<string, unknown>, key: string): boolean | undefined {
  const value = obj[key];
  return typeof value === 'boolean' ? value : undefined;
}

function toWorkspaceRelative(filePath: string, workspaceRoot: string): string | undefined {
  // すでに相対パスっぽい場合はそのまま返す
  if (!path.isAbsolute(filePath)) {
    return filePath;
  }
  const relative = path.relative(workspaceRoot, filePath);
  // ルート外の場合は返さない
  if (relative.startsWith('..')) {
    return undefined;
  }
  return relative;
}
