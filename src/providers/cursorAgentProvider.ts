import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import { nowMs, type TestGenEvent } from '../core/event';
import { type AgentProvider, type AgentRunOptions, type RunningTask } from './provider';

/**
 * Cursor CLI（cursor-agent）を呼び出してテスト生成を実行するProvider。
 *
 * `--output-format stream-json` を前提にstdoutを行単位でパースし、
 * 拡張機能側の共通イベント（TestGenEvent）へ正規化して通知する。
 */
export class CursorAgentProvider implements AgentProvider {
  public readonly id: string = 'cursor-agent';
  public readonly displayName: string = 'Cursor Agent';

  private activeChild: ChildProcessWithoutNullStreams | undefined;
  private activeTaskId: string | undefined;

  public run(options: AgentRunOptions): RunningTask {
    // 多重起動で cursor-agent プロセスが残り続けると、Cursor 全体が不安定になる。
    // そのため、すでに実行中のタスクがあれば先に停止する。
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
        message: `前回の cursor-agent タスク（${prevTaskId}）が終了していなかったため停止しました。`,
        timestampMs: nowMs(),
      });
    }

    const command = options.agentCommand ?? 'cursor-agent';
    const child = this.spawnCursorAgent(options);
    this.activeChild = child;
    this.activeTaskId = options.taskId;
    this.wireOutput(child, options);

    options.onEvent({
      type: 'started',
      taskId: options.taskId,
      label: 'cursor-agent',
      detail: `cmd=${command} format=${options.outputFormat}${options.model ? ` model=${options.model}` : ''}${options.allowWrite ? ' write=on' : ' write=off'}`,
      timestampMs: nowMs(),
    });

    return {
      taskId: options.taskId,
      dispose: () => {
        // SIGTERMで止まらない場合もあるが、まずは穏当に終了を試みる。
        child.kill();
        if (this.activeChild === child) {
          this.activeChild = undefined;
          this.activeTaskId = undefined;
        }
      },
    };
  }

  private spawnCursorAgent(options: AgentRunOptions): ChildProcessWithoutNullStreams {
    const command = options.agentCommand ?? 'cursor-agent';
    const args: string[] = [];

    // -p / --print: 非対話（ヘッドレス）モード
    args.push('-p');
    args.push('--output-format', options.outputFormat);

    if (options.model) {
      args.push('--model', options.model);
    }
    if (options.allowWrite) {
      args.push('--force');
    }

    // prompt は最後に付与（引数として渡す）
    args.push(options.prompt);

    const child = spawn(command, args, {
      cwd: options.workspaceRoot,
      env: process.env,
      stdio: 'pipe',
    });

    // cursor-agent が標準入力待ちで停止するケースを切り分けるため、stdin を明示的に閉じる。
    // （prompt は引数で渡しているため、stdin を閉じても問題ない想定）
    try {
      child.stdin.end();
    } catch {
      // 握りつぶす（stdin が閉じられない環境でも動作は継続する）
    }

    return child;
  }

  private wireOutput(child: ChildProcessWithoutNullStreams, options: AgentRunOptions): void {
    let stdoutBuffer = '';
    let lastWritePath: string | undefined;
    const startedAtMs = nowMs();
    let hasAnyOutput = false;
    let lastOutputAtMs = startedAtMs;
    let lastEmitAtMs = startedAtMs;

    // 受信状況（フィルタしたイベントも含む）を把握するための統計
    let parsedEventCount = 0;
    let ignoredThinkingCount = 0;
    let ignoredUserCount = 0;
    let lastParsedType: string | undefined;

    const emitEvent = (event: TestGenEvent): void => {
      lastEmitAtMs = event.timestampMs;
      options.onEvent(event);
    };

    // cursor-agent が無音で長時間待つケースがあるため、一定時間出力が無い場合だけ心拍ログを出す。
    const heartbeatInitialDelayMs = 10_000;
    const heartbeatIntervalMs = 30_000;
    let heartbeatInterval: NodeJS.Timeout | undefined;
    const heartbeatTimeout = setTimeout(() => {
      if (hasAnyOutput) {
        return;
      }

      const emit = () => {
        const elapsedSec = Math.max(0, Math.floor((nowMs() - startedAtMs) / 1000));
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: `cursor-agent 実行中（経過 ${elapsedSec}s）。まだ出力がありません。`,
          timestampMs: nowMs(),
        });
      };
      emit();
      heartbeatInterval = setInterval(() => {
        if (hasAnyOutput) {
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = undefined;
          }
          return;
        }
        emit();
      }, heartbeatIntervalMs);
    }, heartbeatInitialDelayMs);

    const markOutput = () => {
      hasAnyOutput = true;
      lastOutputAtMs = nowMs();
      clearTimeout(heartbeatTimeout);
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = undefined;
      }
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

    // 出力が「一度でもあった」後に、再度無音になるケース（system:init の後に止まる等）もある。
    // その場合もユーザーに状況が伝わるよう、無音監視を行う。
    const postOutputSilenceWarnAfterMs = 10_000;
    const postOutputSilenceLogIntervalMs = 30_000;
    const postOutputSilenceCheckIntervalMs = 5_000;
    const ignoredSummaryQuietAfterMs = 30_000;
    let lastSilenceLogAtMs = startedAtMs;
    let lastIgnoredSummaryAtMs = startedAtMs;
    let lastIgnoredTotalAtSummary = 0;
    const maxSilenceBeforeKillMs = 10 * 60_000;
    let killRequested = false;

    const monitorInterval = setInterval(() => {
      const now = nowMs();
      const silenceMs = now - lastOutputAtMs;

      // 1) いったん出力が出た後に無音が続くケース（= 進捗が見えず不安になりやすい）
      if (hasAnyOutput && silenceMs >= postOutputSilenceWarnAfterMs && now - lastSilenceLogAtMs >= postOutputSilenceLogIntervalMs) {
        lastSilenceLogAtMs = now;
        const elapsedSec = Math.max(0, Math.floor((now - startedAtMs) / 1000));
        const silenceSec = Math.max(0, Math.floor(silenceMs / 1000));
        onLog('info', `cursor-agent 実行中（経過 ${elapsedSec}s）。最終出力から ${silenceSec}s 経過しています。`);
      }

      // 2) thinking / user だけが流れている場合、ユーザー視点では「止まって見える」ためサマリだけ出す
      const ignoredTotal = ignoredThinkingCount + ignoredUserCount;
      if (now - lastEmitAtMs >= ignoredSummaryQuietAfterMs && ignoredTotal > lastIgnoredTotalAtSummary && now - lastIgnoredSummaryAtMs >= ignoredSummaryQuietAfterMs) {
        lastIgnoredSummaryAtMs = now;
        lastIgnoredTotalAtSummary = ignoredTotal;
        onLog(
          'info',
          `cursor-agent 受信中（表示されないイベントが継続）。parsed=${parsedEventCount} ignored(thinking)=${ignoredThinkingCount} ignored(user)=${ignoredUserCount} last=${lastParsedType ?? 'unknown'}`,
        );
      }

      // 3) 完全に無音が続く場合は、プロセスが固まっている可能性が高いので自動停止（プロセス残留防止）
      if (!killRequested && silenceMs >= maxSilenceBeforeKillMs) {
        killRequested = true;
        onLog('error', `cursor-agent が ${Math.floor(maxSilenceBeforeKillMs / 1000)}s 以上無音のため停止します。`);
        try {
          child.kill();
        } catch {
          // noop
        }
      }
    }, postOutputSilenceCheckIntervalMs);

    child.stdout.on('data', (data: Buffer) => {
      markOutput();

      stdoutBuffer += data.toString('utf8');

      let newlineIndex = stdoutBuffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const rawLine = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

        const line = rawLine.trim();
        if (line.length > 0) {
          const parsed = tryParseJson(line);
          if (parsed) {
            parsedEventCount += 1;
            const parsedType = getString(parsed, 'type');
            lastParsedType = parsedType;
            if (parsedType === 'thinking') {
              ignoredThinkingCount += 1;
            } else if (parsedType === 'user') {
              ignoredUserCount += 1;
            }
            const nextWritePath = this.handleStreamJson(parsed, options, lastWritePath, emitEvent);
            if (nextWritePath) {
              lastWritePath = nextWritePath;
            }
          } else {
            // JSONでない出力もあり得るため、warnとして残す
            onLog('warn', line);
          }
        }

        newlineIndex = stdoutBuffer.indexOf('\n');
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      markOutput();
      const msg = data.toString('utf8').trim();
      if (msg.length > 0) {
        onLog('error', msg);
      }
    });

    child.on('error', (err: Error) => {
      clearTimeout(heartbeatTimeout);
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = undefined;
      }
      clearInterval(monitorInterval);
      if (this.activeChild === child) {
        this.activeChild = undefined;
        this.activeTaskId = undefined;
      }

      onLog('error', `cursor-agent 実行エラー: ${err.message}`);
    });

    child.on('close', (code: number | null) => {
      clearTimeout(heartbeatTimeout);
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = undefined;
      }
      clearInterval(monitorInterval);
      if (this.activeChild === child) {
        this.activeChild = undefined;
        this.activeTaskId = undefined;
      }

      emitEvent({
        type: 'completed',
        taskId: options.taskId,
        exitCode: code,
        timestampMs: nowMs(),
      });
    });
  }

  /**
   * stream-jsonの1行イベントを処理し、必要なら lastWritePath の更新値を返す。
   */
  private handleStreamJson(
    obj: Record<string, unknown>,
    options: AgentRunOptions,
    lastWritePath: string | undefined,
    emitEvent: (event: TestGenEvent) => void,
  ): string | undefined {
    const type = getString(obj, 'type');

    // 高頻度イベントはOutput Channelを汚染しやすいので基本的に無視する。
    // - thinking: モデルの内部進捗がdeltaで大量に流れる
    // - user: こちらから渡したプロンプトを反映しただけで実質冗長
    if (type === 'thinking' || type === 'user') {
      return undefined;
    }

    if (type === 'assistant') {
      const message = obj.message;
      const text = extractAssistantText(message);
      if (text) {
        emitEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: text,
          timestampMs: nowMs(),
        });
      }
      return undefined;
    }

    if (type === 'system') {
      const subtype = getString(obj, 'subtype');
      if (subtype) {
        emitEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: `system:${subtype}`,
          timestampMs: nowMs(),
        });
      }
      return undefined;
    }

    if (type === 'result') {
      const durationMs = getNumber(obj, 'duration_ms');
      emitEvent({
        type: 'log',
        taskId: options.taskId,
        level: 'info',
        message: `result: duration_ms=${durationMs ?? 'unknown'}`,
        timestampMs: nowMs(),
      });
      return undefined;
    }

    if (type === 'tool_call') {
      const subtype = getString(obj, 'subtype');
      const toolCall = asRecord(obj.tool_call);
      if (!toolCall) {
        return undefined;
      }

      // cursor-agent の stream-json は tool_call ごとに `xxxToolCall` が入る。
      // 例: { tool_call: { editToolCall: { args: { path }, result: { success: { ... } } } } }
      // ここではファイル書き込み（editToolCall）のみを検知し、ロールバック用に fileWrite を発行する。
      const toolCallName = findToolCallName(toolCall);
      const toolCallBody = toolCallName ? asRecord(toolCall[toolCallName]) : undefined;
      const args = toolCallBody ? asRecord(toolCallBody.args) : undefined;
      const result = toolCallBody ? asRecord(toolCallBody.result) : undefined;
      const success = result ? asRecord(result.success) : undefined;

      const pathFromArgs = args ? getString(args, 'path') : undefined;
      const pathFromSuccess = success ? getString(success, 'path') : undefined;

      // editToolCall のみ「書き込み」として扱う（ls/read 等は除外）
      if (toolCallName === 'editToolCall') {
        if (pathFromArgs) {
          lastWritePath = pathFromArgs;
        }

        if (subtype === 'started') {
          const finalPath = pathFromArgs ?? lastWritePath;
          if (finalPath) {
            const relative = toWorkspaceRelative(finalPath, options.workspaceRoot);
            // 先に fileWrite を出しておく（patchApplier がこの時点の内容をスナップショットできる）
            emitEvent({
              type: 'fileWrite',
              taskId: options.taskId,
              path: relative ?? finalPath,
              timestampMs: nowMs(),
            });
            return finalPath;
          }
          return undefined;
        }

        if (subtype === 'completed') {
          const linesCreated = success ? getNumber(success, 'linesAdded') : undefined;
          const finalPath = pathFromSuccess ?? pathFromArgs ?? lastWritePath;
          if (finalPath) {
            const relative = toWorkspaceRelative(finalPath, options.workspaceRoot);
            emitEvent({
              type: 'fileWrite',
              taskId: options.taskId,
              path: relative ?? finalPath,
              linesCreated,
              timestampMs: nowMs(),
            });
            return finalPath;
          }
          return undefined;
        }

        return undefined;
      }
    }

    // それ以外は最低限ログに残す（必要になったら正規化を拡張する）
    const rawType = type ?? 'unknown';
    emitEvent({
      type: 'log',
      taskId: options.taskId,
      level: 'info',
      message: `event:${rawType}`,
      timestampMs: nowMs(),
    });
    return undefined;
  }
}

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

/**
 * stream-json の tool_call から、`xxxToolCall` のキー名を推定する。
 * 基本的に1つしか入らない想定だが、念のため末尾が ToolCall のものを優先する。
 */
function findToolCallName(toolCall: Record<string, unknown>): string | undefined {
  const keys = Object.keys(toolCall);
  if (keys.length === 0) {
    return undefined;
  }
  const preferred = keys.find((k) => k.endsWith('ToolCall'));
  return preferred ?? keys[0];
}

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

function getNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const value = obj[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function extractAssistantText(message: unknown): string | undefined {
  const messageRec = asRecord(message);
  if (!messageRec) {
    return undefined;
  }
  const content = messageRec.content;
  if (!Array.isArray(content) || content.length === 0) {
    return undefined;
  }
  const first = content[0];
  const firstRec = asRecord(first);
  if (!firstRec) {
    return undefined;
  }
  const text = firstRec.text;
  return typeof text === 'string' ? text : undefined;
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

