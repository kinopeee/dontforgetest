import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { nowMs, type TestGenEvent } from '../core/event';
import { type AgentProvider, type AgentRunOptions, type RunningTask } from './provider';

/**
 * Claude Code CLI のプロセス監視・しきい値設定（ミリ秒）。
 * 環境や CLI の挙動変化に合わせて調整しやすいよう、定数に集約する。
 */
const CLAUDE_CODE_MONITORING = {
  /** 初回 heartbeat ログを出すまでの待機時間 */
  heartbeatInitialDelayMs: 10_000,
  /** heartbeat ログの間隔 */
  heartbeatIntervalMs: 30_000,
  /** 出力後の無音警告を開始するまでの時間 */
  postOutputSilenceWarnAfterMs: 10_000,
  /** 無音ログの間隔 */
  postOutputSilenceLogIntervalMs: 30_000,
  /** 無音監視チェックの間隔 */
  postOutputSilenceCheckIntervalMs: 5_000,
  /** 無視されたイベントのサマリーを出すまでの静かな時間 */
  ignoredSummaryQuietAfterMs: 30_000,
  /** 自動停止までの最大無音時間 */
  maxSilenceBeforeKillMs: 10 * 60_000,
  /** 大量出力検知: assistant メッセージ長 */
  highOutputMaxAssistantTextLength: 50_000,
  /** 大量出力検知: パース済みイベント数 */
  highOutputMaxParsedEventCount: 5_000,
} as const;

/**
 * Claude Code CLI（claude -p）を呼び出してテスト生成を実行するProvider。
 *
 * `--output-format stream-json` を前提にstdoutを行単位でパースし、
 * 拡張機能側の共通イベント（TestGenEvent）へ正規化して通知する。
 */
export class ClaudeCodeProvider implements AgentProvider {
  public readonly id: string = 'claude-code';
  public readonly displayName: string = 'Claude Code';

  private activeChild: ChildProcessWithoutNullStreams | undefined;
  private activeTaskId: string | undefined;

  public run(options: AgentRunOptions): RunningTask {
    // 多重起動で claude プロセスが残り続けると問題になる。
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
        message: `前回の claude タスク（${prevTaskId}）が終了していなかったため停止しました。`,
        timestampMs: nowMs(),
      });
    }

    const command = options.agentCommand ?? 'claude';
    const child = this.spawnClaudeCode(options);
    this.activeChild = child;
    this.activeTaskId = options.taskId;
    this.wireOutput(child, options);

    // Claude Code の --print は「stdin もしくは prompt 引数」の入力が必須。
    // argv の長さ制限・オプション解釈の揺れを避けるため、stdin 経由でプロンプトを渡す。
    try {
      child.stdin.write(options.prompt);
      child.stdin.end();
    } catch {
      // stdin が閉じている等のケースでは、以降の stderr / close ログで判断する
      try {
        child.stdin.end();
      } catch {
        // noop
      }
    }

    options.onEvent({
      type: 'started',
      taskId: options.taskId,
      label: 'claude-code',
      detail: `cmd=${command} format=${options.outputFormat}${options.model ? ` model=${options.model}` : ''}${options.allowWrite ? ' write=on' : ' write=off'}`,
      timestampMs: nowMs(),
    });

    return {
      taskId: options.taskId,
      dispose: () => {
        // SIGTERMで止まらない場合もあるが、まずは穏当に終了を試みる。
        try {
          child.kill();
        } catch {
          // Ignore kill errors
        } finally {
          // kill の成否に関わらず参照はクリアして、次のタスクを開始できるようにする
          if (this.activeChild === child) {
            this.activeChild = undefined;
            this.activeTaskId = undefined;
          }
        }
      },
    };
  }

  private spawnClaudeCode(options: AgentRunOptions): ChildProcessWithoutNullStreams {
    const command = options.agentCommand ?? 'claude';
    const args: string[] = [];

    // -p / --print: 非対話（ヘッドレス）モード
    args.push('-p');
    args.push('--output-format', options.outputFormat);
    // Claude Code CLI 仕様: --print + --output-format=stream-json では --verbose が必須
    if (options.outputFormat === 'stream-json') {
      args.push('--verbose');
    }
    // 入力は stdin 経由で渡す（--print モード用）
    args.push('--input-format', 'text');

    if (options.model) {
      args.push('--model', options.model);
    }

    // Claude Code の権限/ツール許可
    // allowWrite=true のとき --permission-mode acceptEdits を付与
    if (options.allowWrite) {
      args.push('--permission-mode', 'acceptEdits');
    }

    // Bash ツールを許可（安定重視の方針）
    // preTestCheck や testExecutionRunner=cursorAgent で Bash が必要
    args.push('--allowedTools', 'Bash');

    // claude が内部で $EDITOR / $PAGER を呼び、GUI起動で待ち続けるケースを避ける。
    const env: NodeJS.ProcessEnv = { ...process.env };

    // VS Code から起動した場合、シェルの PATH が継承されないことがあるため、
    // claude がインストールされやすい場所を PATH に追加
    const additionalPaths = getDefaultAdditionalPaths();
    const currentPath = env.PATH ?? '';
    const pathSeparator = process.platform === 'win32' ? ';' : ':';
    env.PATH = [...additionalPaths, currentPath].filter(Boolean).join(pathSeparator);

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

    return child;
  }

  private wireOutput(child: ChildProcessWithoutNullStreams, options: AgentRunOptions): void {
    let stdoutBuffer = '';
    let lastWritePath: string | undefined;
    const startedAtMs = nowMs();
    let completedEmitted = false;
    let hasAnyOutput = false;
    let lastOutputAtMs = startedAtMs;
    let lastEmitAtMs = startedAtMs;

    // 受信状況（フィルタしたイベントも含む）を把握するための統計
    let parsedEventCount = 0;
    let ignoredThinkingCount = 0;
    let ignoredUserCount = 0;
    let lastParsedType: string | undefined;
    let maxAssistantTextLength = 0;
    let highOutputLogged = false;

    const emitEvent = (event: TestGenEvent): void => {
      lastEmitAtMs = event.timestampMs;
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

    // claude が無音で長時間待つケースがあるため、一定時間出力が無い場合だけ心拍ログを出す。
    const heartbeatInitialDelayMs = CLAUDE_CODE_MONITORING.heartbeatInitialDelayMs;
    const heartbeatIntervalMs = CLAUDE_CODE_MONITORING.heartbeatIntervalMs;
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
          message: `claude 実行中（経過 ${elapsedSec}s）。まだ出力がありません。`,
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
    const postOutputSilenceWarnAfterMs = CLAUDE_CODE_MONITORING.postOutputSilenceWarnAfterMs;
    const postOutputSilenceLogIntervalMs = CLAUDE_CODE_MONITORING.postOutputSilenceLogIntervalMs;
    const postOutputSilenceCheckIntervalMs = CLAUDE_CODE_MONITORING.postOutputSilenceCheckIntervalMs;
    const ignoredSummaryQuietAfterMs = CLAUDE_CODE_MONITORING.ignoredSummaryQuietAfterMs;
    let lastSilenceLogAtMs = startedAtMs;
    let lastIgnoredSummaryAtMs = startedAtMs;
    let lastIgnoredTotalAtSummary = 0;
    const maxSilenceBeforeKillMs = CLAUDE_CODE_MONITORING.maxSilenceBeforeKillMs;
    let killRequested = false;

    const monitorInterval = setInterval(() => {
      const now = nowMs();
      const silenceMs = now - lastOutputAtMs;

      // 1) いったん出力が出た後に無音が続くケース（= 進捗が見えず不安になりやすい）
      if (hasAnyOutput && silenceMs >= postOutputSilenceWarnAfterMs && now - lastSilenceLogAtMs >= postOutputSilenceLogIntervalMs) {
        lastSilenceLogAtMs = now;
        const elapsedSec = Math.max(0, Math.floor((now - startedAtMs) / 1000));
        const silenceSec = Math.max(0, Math.floor(silenceMs / 1000));
        onLog('info', `claude 実行中（経過 ${elapsedSec}s）。最終出力から ${silenceSec}s 経過しています。`);
      }

      // 2) thinking / user だけが流れている場合、ユーザー視点では「止まって見える」ためサマリだけ出す
      const ignoredTotal = ignoredThinkingCount + ignoredUserCount;
      if (now - lastEmitAtMs >= ignoredSummaryQuietAfterMs && ignoredTotal > lastIgnoredTotalAtSummary && now - lastIgnoredSummaryAtMs >= ignoredSummaryQuietAfterMs) {
        lastIgnoredSummaryAtMs = now;
        lastIgnoredTotalAtSummary = ignoredTotal;
        onLog(
          'info',
          `claude 受信中（表示されないイベントが継続）。parsed=${parsedEventCount} ignored(thinking)=${ignoredThinkingCount} ignored(user)=${ignoredUserCount} last=${lastParsedType ?? 'unknown'}`,
        );
      }

      // 3) 完全に無音が続く場合は、プロセスが固まっている可能性が高いので自動停止（プロセス残留防止）
      if (!killRequested && silenceMs >= maxSilenceBeforeKillMs) {
        killRequested = true;
        onLog('error', `claude が ${Math.floor(maxSilenceBeforeKillMs / 1000)}s 以上無音のため停止します。`);
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

            if (parsedType === 'assistant') {
              const text = extractAssistantText(parsed.message);
              if (text) {
                if (text.length > maxAssistantTextLength) {
                  maxAssistantTextLength = text.length;
                }
              }
            }

            // 大量出力（巨大メッセージ or 高イベント数）が原因でExtension Hostが不安定になる可能性を切り分ける
            if (
              !highOutputLogged &&
              (maxAssistantTextLength >= CLAUDE_CODE_MONITORING.highOutputMaxAssistantTextLength ||
                parsedEventCount >= CLAUDE_CODE_MONITORING.highOutputMaxParsedEventCount)
            ) {
              highOutputLogged = true;
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

      onLog('error', `claude 実行エラー: ${err.message}`);
      emitCompleted(null);
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

      emitCompleted(code);
    });
  }

  /**
   * stream-jsonの1行イベントを処理し、必要なら lastWritePath の更新値を返す。
   *
   * Claude Code の stream-json イベント:
   * - assistant: アシスタントの応答本文
   * - result: 最終結果（本文が含まれる場合があるためログ化する）
   * - tool_call: ツール呼び出し（edit/write からファイルパスを抽出して fileWrite を発行）
   * - thinking / user: 無視
   * - system: サブタイプをログ
   */
  private handleStreamJson(
    obj: Record<string, unknown>,
    options: AgentRunOptions,
    lastWritePath: string | undefined,
    emitEvent: (event: TestGenEvent) => void,
  ): string | undefined {
    const type = getString(obj, 'type');

    // 高頻度イベントは無視
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

      // result に本文が入る可能性があるためログ化（マーカー抽出対策）
      const resultText = extractResultText(obj);
      if (resultText && resultText.length > 0) {
        emitEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: resultText,
          timestampMs: nowMs(),
        });
      }
      return undefined;
    }

    if (type === 'tool_call') {
      const subtype = getString(obj, 'subtype');
      const toolCall = asRecord(obj.tool_call);

      if (!toolCall) {
        return undefined;
      }

      // Claude Code の tool_call から書き込みを検知
      // 複数の形式に対応: Write, Edit, editToolCall など
      const toolCallName = findToolCallName(toolCall);
      const toolCallBody = toolCallName ? asRecord(toolCall[toolCallName]) : undefined;
      const args = toolCallBody ? asRecord(toolCallBody.args) : undefined;
      const result = toolCallBody ? asRecord(toolCallBody.result) : undefined;
      const success = result ? asRecord(result.success) : undefined;

      const pathFromArgs = args ? getString(args, 'path') ?? getString(args, 'file_path') : undefined;
      const pathFromSuccess = success ? getString(success, 'path') : undefined;

      // Write / Edit / editToolCall を「書き込み」として扱う
      const isWriteOperation =
        toolCallName === 'Write' ||
        toolCallName === 'Edit' ||
        toolCallName === 'editToolCall' ||
        toolCallName === 'writeToolCall' ||
        (toolCallName?.toLowerCase().includes('write') ?? false) ||
        (toolCallName?.toLowerCase().includes('edit') ?? false);

      if (isWriteOperation) {
        if (pathFromArgs) {
          lastWritePath = pathFromArgs;
        }

        if (subtype === 'started') {
          const finalPath = pathFromArgs ?? lastWritePath;
          if (finalPath) {
            const relative = toWorkspaceRelative(finalPath, options.workspaceRoot);
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

      // その他の tool_call は無視
      return undefined;
    }

    // それ以外は最低限ログに残す
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

/**
 * テスト専用の内部エクスポート。
 * 本番利用は禁止。
 */
export const __test__ = {
  CLAUDE_CODE_MONITORING,
  extractAssistantText,
};

/**
 * VS Code から起動した場合に PATH が不足しやすいため、追加で探索するパス。
 * - ここは「よくあるインストール先」のみを限定的に追加する（環境依存なので最小限）
 * - 将来は設定（またはより堅牢な解決手段）へ移行する余地あり
 */
function getDefaultAdditionalPaths(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (p: string | undefined): void => {
    if (!p) return;
    const trimmed = p.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    const userProfile = process.env.USERPROFILE;
    push(localAppData ? path.join(localAppData, 'Programs', 'Claude') : undefined);
    push(userProfile ? path.join(userProfile, '.claude', 'local') : undefined);
    return out;
  }

  const homeDir = os.homedir();
  push('/opt/homebrew/bin'); // macOS (Apple Silicon) Homebrew
  push(path.join(homeDir, '.local', 'bin')); // ユーザーローカル
  push('/usr/local/bin'); // macOS/Linux 標準
  push(path.join(homeDir, '.claude', 'local')); // Claude Code のローカル
  return out;
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
 * stream-json の tool_call から、ツール名を推定する。
 */
function findToolCallName(toolCall: Record<string, unknown>): string | undefined {
  const keys = Object.keys(toolCall);
  if (keys.length === 0) {
    return undefined;
  }
  // ToolCall で終わるものを優先、なければ最初のキー
  const preferred = keys.find((k) => k.endsWith('ToolCall') || k === 'Write' || k === 'Edit');
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

/**
 * result イベントから本文テキストを抽出する（Claude の result 形式対応）。
 */
function extractResultText(obj: Record<string, unknown>): string | undefined {
  // result.result に本文が入る場合
  const resultField = obj.result;
  if (typeof resultField === 'string') {
    return resultField;
  }
  const resultRec = asRecord(resultField);
  if (resultRec) {
    const text = resultRec.text ?? resultRec.content ?? resultRec.message;
    if (typeof text === 'string') {
      return text;
    }
    // content が配列の場合
    const contentArr = resultRec.content;
    if (Array.isArray(contentArr) && contentArr.length > 0) {
      const first = asRecord(contentArr[0]);
      if (first && typeof first.text === 'string') {
        return first.text;
      }
    }
  }
  return undefined;
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
