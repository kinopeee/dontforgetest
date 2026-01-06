import * as vscode from 'vscode';
import { nowMs, type TestGenEvent } from '../core/event';
import { t } from '../core/l10n';
import { type AgentProvider, type AgentRunOptions, type RunningTask } from './provider';
import { DEVIN_API_KEY_ENV, DEVIN_API_PROVIDER_ID } from './providerIds';

type DevinSessionCreateRequest = {
  prompt: string;
  idempotent?: boolean;
  max_acu_limit?: number;
  tags?: string[];
  title?: string;
  unlisted?: boolean;
};

type DevinSessionCreateResponse = {
  session_id?: string;
  url?: string;
  is_new_session?: boolean;
};

type DevinSessionMessage = {
  type?: string;
  message?: string;
  origin?: string;
};

type DevinSessionStatusResponse = {
  session_id?: string;
  status?: string;
  status_enum?: string;
  messages?: DevinSessionMessage[];
};

type DevinEndState = 'blocked' | 'finished' | 'expired';

const DEVIN_PROMPT_MAX_CHARS = 30_000;
// 余裕を持たせて切り詰める（JSONエラー文などが追加されても超えにくくする）
const DEVIN_PROMPT_TARGET_CHARS = 28_000;
// blocked 時に「追加入力なしで完了せよ」を追送する最大回数（MVP）
const DEVIN_AUTO_UNBLOCK_MAX_RETRIES = 1;
// 異常系で API が終了状態を返さない場合に無限ポーリングしないための上限（MVP）
const DEVIN_POLL_MAX_DURATION_MS = 60 * 60 * 1000; // 60分

const PERSPECTIVE_MARKER_END = '<!-- END TEST PERSPECTIVES JSON -->';
const PATCH_MARKER_END = '<!-- END DONTFORGETEST PATCH -->';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function truncateForDevinPrompt(prompt: string): { prompt: string; truncated: boolean; originalLength: number } {
  const originalLength = prompt.length;
  if (originalLength <= DEVIN_PROMPT_MAX_CHARS) {
    return { prompt, truncated: false, originalLength };
  }
  const target = Math.max(1_000, Math.min(DEVIN_PROMPT_TARGET_CHARS, DEVIN_PROMPT_MAX_CHARS - 100));
  const marker = '\n\n...(truncated to fit Devin API prompt limit)...\n\n';
  // 末尾に差分等が付く構造が多いため、まずは末尾を削る（=先頭の制約を優先）
  const sliced = prompt.slice(0, Math.max(0, target - marker.length)) + marker;
  return { prompt: sliced, truncated: true, originalLength };
}

/**
 * プロンプトを論理的な塊に分割し、添付ファイルとしてアップロードする準備をする。
 * 分割戦略:
 * - diff/patch ブロック（```diff や ```patch で囲まれた部分、または unified diff 風のテキスト）
 * - test-perspectives JSON ブロック（マーカーで囲まれた部分）
 * - それ以外（instructions + context）
 * 分割に失敗した場合は全体を context.txt 1本で返す。
 */
function splitPromptForAttachments(prompt: string): Array<{ filename: string; content: string }> {
  const files: Array<{ filename: string; content: string }> = [];
  let remaining = prompt;

  // diff/patch ブロックを抽出（```diff ... ``` または ```patch ... ```）
  const diffCodeBlockRegex = /```(?:diff|patch)\s*\n([\s\S]*?)```/g;
  let diffMatch: RegExpExecArray | null;
  const diffs: string[] = [];
  while ((diffMatch = diffCodeBlockRegex.exec(prompt)) !== null) {
    diffs.push(diffMatch[1] ?? '');
  }
  if (diffs.length > 0) {
    const diffContent = diffs.join('\n\n');
    files.push({ filename: 'diff.patch', content: diffContent });
    // remaining から削除
    remaining = remaining.replace(diffCodeBlockRegex, '\n[See attached: diff.patch]\n');
  }

  // unified diff 風のテキスト（diff --git から始まる連続ブロック）を抽出
  // コードブロック内でない場合のフォールバック
  if (diffs.length === 0) {
    const unifiedDiffRegex = /((?:^diff --git .+\n(?:[\s\S]*?)(?=\ndiff --git |\n*$)))/gm;
    const unifiedMatch = unifiedDiffRegex.exec(remaining);
    if (unifiedMatch) {
      // 最初のマッチから末尾まで unified diff として扱う
      const diffStart = remaining.indexOf('diff --git ');
      if (diffStart !== -1) {
        const diffContent = remaining.slice(diffStart);
        files.push({ filename: 'diff.patch', content: diffContent });
        remaining = remaining.slice(0, diffStart) + '\n[See attached: diff.patch]\n';
      }
    }
  }

  // test-perspectives JSON ブロックを抽出
  const perspectivesBegin = '<!-- BEGIN TEST PERSPECTIVES JSON -->';
  const perspectivesEnd = '<!-- END TEST PERSPECTIVES JSON -->';
  const perspectivesStartIdx = remaining.indexOf(perspectivesBegin);
  const perspectivesEndIdx = remaining.indexOf(perspectivesEnd);
  if (perspectivesStartIdx !== -1 && perspectivesEndIdx !== -1 && perspectivesEndIdx > perspectivesStartIdx) {
    const perspectivesContent = remaining.slice(perspectivesStartIdx, perspectivesEndIdx + perspectivesEnd.length);
    files.push({ filename: 'test-perspectives.json', content: perspectivesContent });
    remaining =
      remaining.slice(0, perspectivesStartIdx) +
      '\n[See attached: test-perspectives.json]\n' +
      remaining.slice(perspectivesEndIdx + perspectivesEnd.length);
  }

  // 残りを instructions/context として保存
  const trimmedRemaining = remaining.trim();
  if (trimmedRemaining.length > 0) {
    files.push({ filename: 'instructions.txt', content: trimmedRemaining });
  }

  // ファイルが1件もなければ元の prompt 全体を context.txt として返す
  if (files.length === 0) {
    return [{ filename: 'context.txt', content: prompt }];
  }

  return files;
}

/**
 * アップロードされた添付ファイルの URL を参照する短い prompt を構築する。
 * Devin API の仕様に従い、`ATTACHMENT:"url"` を独立行で列挙する。
 */
function buildShortPromptWithAttachments(uploaded: Array<{ filename: string; url: string }>): string {
  const lines: string[] = [
    'Read the attached files carefully and complete the task.',
    '',
    '## Attached Files',
    '',
  ];
  for (const f of uploaded) {
    lines.push(`ATTACHMENT:"${f.url}"`);
    lines.push(`(${f.filename})`);
    lines.push('');
  }
  lines.push('## Instructions');
  lines.push('');
  lines.push('1. Analyze the attached context (instructions, diff, perspectives if any).');
  lines.push('2. Generate the required output based on the instructions.');
  lines.push('3. Output ONLY between the required markers:');
  lines.push('   - For perspectives: `<!-- BEGIN TEST PERSPECTIVES JSON -->` ... `<!-- END TEST PERSPECTIVES JSON -->`');
  lines.push('   - For patch: `<!-- BEGIN DONTFORGETEST PATCH -->` ... `<!-- END DONTFORGETEST PATCH -->`');
  lines.push('4. Do NOT include anything else outside the markers.');
  lines.push('5. Do NOT ask questions or request repository setup.');
  return lines.join('\n');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const onAbort = () => {
      cleanup();
      clearTimeout(timeout);
      reject(new Error('aborted'));
    };
    const cleanup = () => {
      try {
        signal?.removeEventListener('abort', onAbort);
      } catch {
        // noop
      }
    };
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return 'https://api.devin.ai/v1';
  }
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function isDevinEndState(statusEnum: string | undefined): statusEnum is DevinEndState {
  return statusEnum === 'blocked' || statusEnum === 'finished' || statusEnum === 'expired';
}

/**
 * Devin API（Sessions）を利用して、観点表生成/テスト生成を実行する Provider。
 *
 * 方針:
 * - Devin はローカルワークスペースへ直接アクセスできない前提のため、
 *   生成結果は「ログ出力」として受け取り、拡張機能側で抽出/適用（パッチ）する。
 * - API は REST ポーリングのみ。WebSocket/SSE はない。
 */
export class DevinApiProvider implements AgentProvider {
  public readonly id: string = DEVIN_API_PROVIDER_ID;
  public readonly displayName: string = 'Devin API';

  private activeAbortController: AbortController | undefined;
  private activeTaskId: string | undefined;

  public run(options: AgentRunOptions): RunningTask {
    // 多重起動の残留を避けるため、既存タスクがあれば中断する
    if (this.activeAbortController) {
      const prevTaskId = this.activeTaskId ?? 'unknown';
      try {
        this.activeAbortController.abort();
      } catch {
        // noop
      }
      this.activeAbortController = undefined;
      this.activeTaskId = undefined;
      options.onEvent({
        type: 'log',
        taskId: options.taskId,
        level: 'warn',
        message: `前回の Devin API タスク（${prevTaskId}）が終了していなかったため中断しました。`,
        timestampMs: nowMs(),
      });
    }

    const abortController = new AbortController();
    this.activeAbortController = abortController;
    this.activeTaskId = options.taskId;

    void this.runAsync(options, abortController).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      options.onEvent({
        type: 'log',
        taskId: options.taskId,
        level: 'error',
        message: `Devin API 実行エラー: ${message}`,
        timestampMs: nowMs(),
      });
      options.onEvent({
        type: 'completed',
        taskId: options.taskId,
        exitCode: null,
        timestampMs: nowMs(),
      });
    });

    options.onEvent({
      type: 'started',
      taskId: options.taskId,
      label: 'devin-api',
      detail: `baseUrl=${this.getConfig().baseUrl}`,
      timestampMs: nowMs(),
    });

    return {
      taskId: options.taskId,
      dispose: () => {
        try {
          abortController.abort();
        } catch {
          // noop
        } finally {
          if (this.activeAbortController === abortController) {
            this.activeAbortController = undefined;
            this.activeTaskId = undefined;
          }
        }
      },
    };
  }

  private getConfig(): {
    apiKey: string | undefined;
    baseUrl: string;
    idempotent: boolean;
    maxAcuLimit: number | undefined;
    tags: string[];
    pollInitialDelayMs: number;
    pollMaxDelayMs: number;
  } {
    const config = vscode.workspace.getConfiguration('dontforgetest');
    const apiKeyRaw = (config.get<string>('devinApiKey') ?? '').trim();
    const apiKey = apiKeyRaw.length > 0 ? apiKeyRaw : (process.env[DEVIN_API_KEY_ENV] ?? '').trim() || undefined;
    const baseUrl = normalizeBaseUrl(config.get<string>('devinBaseUrl') ?? 'https://api.devin.ai/v1');

    const idempotentRaw = config.get<boolean>('devinIdempotent', true);
    const idempotent = idempotentRaw !== false;

    const maxAcuRaw = config.get<number>('devinMaxAcuLimit', 10);
    const maxAcuLimit =
      typeof maxAcuRaw === 'number' && Number.isFinite(maxAcuRaw) && maxAcuRaw > 0 ? Math.floor(maxAcuRaw) : undefined;

    const pollInitialDelayMsRaw = config.get<number>('devinPollInitialDelayMs', 5_000);
    const pollMaxDelayMsRaw = config.get<number>('devinPollMaxDelayMs', 30_000);
    const pollInitialDelayMs =
      typeof pollInitialDelayMsRaw === 'number' && Number.isFinite(pollInitialDelayMsRaw) && pollInitialDelayMsRaw > 0
        ? Math.floor(pollInitialDelayMsRaw)
        : 5_000;
    const pollMaxDelayMs =
      typeof pollMaxDelayMsRaw === 'number' && Number.isFinite(pollMaxDelayMsRaw) && pollMaxDelayMsRaw > 0
        ? Math.floor(pollMaxDelayMsRaw)
        : 30_000;

    return {
      apiKey,
      baseUrl,
      idempotent,
      maxAcuLimit,
      tags: ['dontforgetest', 'testing'],
      pollInitialDelayMs,
      pollMaxDelayMs,
    };
  }

  private async runAsync(options: AgentRunOptions, abortController: AbortController): Promise<void> {
    const cfg = this.getConfig();
    if (!cfg.apiKey) {
      options.onEvent({
        type: 'log',
        taskId: options.taskId,
        level: 'error',
        message: t('devinApi.missingApiKey'),
        timestampMs: nowMs(),
      });
      options.onEvent({
        type: 'completed',
        taskId: options.taskId,
        exitCode: null,
        timestampMs: nowMs(),
      });
      return;
    }

    // プロンプトが上限を超える場合は、まず attachments アップロードを試みる
    let finalPrompt: string;
    if (options.prompt.length > DEVIN_PROMPT_MAX_CHARS) {
      const attachmentsResult = await this.tryUploadPromptAsAttachments({
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        originalPrompt: options.prompt,
        taskId: options.taskId,
        onEvent: options.onEvent,
        signal: abortController.signal,
      });
      if (attachmentsResult.ok) {
        finalPrompt = attachmentsResult.shortPrompt;
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: t('devinApi.attachmentsSplit', String(attachmentsResult.uploadedFiles.length)),
          timestampMs: nowMs(),
        });
      } else {
        // アップロード失敗 → truncate フォールバック
        const maybeTruncated = truncateForDevinPrompt(options.prompt);
        finalPrompt = maybeTruncated.prompt;
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'warn',
          message: t(
            'devinApi.attachmentsUploadFailed',
            String(options.prompt.length),
            String(DEVIN_PROMPT_MAX_CHARS),
            attachmentsResult.error,
          ),
          timestampMs: nowMs(),
        });
      }
    } else {
      finalPrompt = options.prompt;
    }

    const session = await this.createSession({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      body: {
        prompt: finalPrompt,
        idempotent: cfg.idempotent,
        max_acu_limit: cfg.maxAcuLimit,
        tags: cfg.tags,
      },
      signal: abortController.signal,
    });

    options.onEvent({
      type: 'log',
      taskId: options.taskId,
      level: 'info',
      message: session.url ? `Devin session: ${session.url}` : `Devin session_id: ${session.sessionId}`,
      timestampMs: nowMs(),
    });

    const exitCode = await this.pollSessionUntilDone({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      sessionId: session.sessionId,
      taskId: options.taskId,
      onEvent: options.onEvent,
      signal: abortController.signal,
      initialDelayMs: cfg.pollInitialDelayMs,
      maxDelayMs: cfg.pollMaxDelayMs,
    });

    options.onEvent({
      type: 'completed',
      taskId: options.taskId,
      exitCode,
      timestampMs: nowMs(),
    });
  }

  /**
   * プロンプトを分割して attachments にアップロードし、短い prompt を構築する。
   * 成功時は ok=true と shortPrompt を返し、失敗時は ok=false と error を返す。
   */
  private async tryUploadPromptAsAttachments(params: {
    baseUrl: string;
    apiKey: string;
    originalPrompt: string;
    taskId: string;
    onEvent: (event: TestGenEvent) => void;
    signal: AbortSignal;
  }): Promise<
    | { ok: true; shortPrompt: string; uploadedFiles: Array<{ filename: string; url: string }> }
    | { ok: false; error: string }
  > {
    try {
      const files = splitPromptForAttachments(params.originalPrompt);
      const uploaded = await this.uploadAttachments({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        files,
        signal: params.signal,
      });
      const shortPrompt = buildShortPromptWithAttachments(uploaded);
      return { ok: true, shortPrompt, uploadedFiles: uploaded };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  private async createSession(params: {
    baseUrl: string;
    apiKey: string;
    body: DevinSessionCreateRequest;
    signal: AbortSignal;
  }): Promise<{ sessionId: string; url?: string; isNewSession?: boolean }> {
    const url = `${params.baseUrl}/sessions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params.body),
      signal: params.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Devin API /sessions failed: ${res.status} ${res.statusText} ${text}`.trim());
    }
    const parsed: unknown = text.length > 0 ? JSON.parse(text) : {};
    const rec = isRecord(parsed) ? (parsed as DevinSessionCreateResponse) : undefined;
    const sessionId = rec?.session_id;
    if (!sessionId) {
      throw new Error('Devin API /sessions returned no session_id');
    }
    return { sessionId, url: rec?.url, isNewSession: rec?.is_new_session };
  }

  private async pollSessionUntilDone(params: {
    baseUrl: string;
    apiKey: string;
    sessionId: string;
    taskId: string;
    onEvent: (event: TestGenEvent) => void;
    signal: AbortSignal;
    initialDelayMs: number;
    maxDelayMs: number;
  }): Promise<number | null> {
    const startedAt = nowMs();
    let delayMs = Math.min(params.maxDelayMs, Math.max(1000, params.initialDelayMs));
    let lastMessageCount = 0;
    let lastStatusEnum: string | undefined;
    let unblockRetries = 0;
    let sawEndMarker = false;

    while (true) {
      if (params.signal.aborted) {
        return null;
      }
      // 全体タイムアウト（異常系で無限に待たない）
      if (nowMs() - startedAt > DEVIN_POLL_MAX_DURATION_MS) {
        params.onEvent({
          type: 'log',
          taskId: params.taskId,
          level: 'error',
          message: `Devin セッションのポーリングがタイムアウトしました（${Math.floor(DEVIN_POLL_MAX_DURATION_MS / 60_000)}分経過）。`,
          timestampMs: nowMs(),
        });
        return 1;
      }

      let res: Response;
      try {
        res = await fetch(`${params.baseUrl}/sessions/${encodeURIComponent(params.sessionId)}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${params.apiKey}` },
          signal: params.signal,
        });
      } catch (e) {
        // 一時的なネットワーク障害はリトライ
        const msg = e instanceof Error ? e.message : String(e);
        params.onEvent({
          type: 'log',
          taskId: params.taskId,
          level: 'warn',
          message: `Devin API poll failed (retry): ${msg}`,
          timestampMs: nowMs(),
        });
        await sleep(delayMs, params.signal);
        delayMs = Math.min(params.maxDelayMs, Math.floor(delayMs * 1.5));
        continue;
      }

      // 429 は backoff してリトライ
      if (res.status === 429) {
        params.onEvent({
          type: 'log',
          taskId: params.taskId,
          level: 'warn',
          message: `Devin API rate limited (429). Retrying in ${Math.floor(delayMs / 1000)}s...`,
          timestampMs: nowMs(),
        });
        await sleep(delayMs, params.signal);
        delayMs = Math.min(params.maxDelayMs, Math.floor(delayMs * 1.5));
        continue;
      }

      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Devin API GET /sessions/{id} failed: ${res.status} ${res.statusText} ${text}`.trim());
      }

      let parsed: unknown = {};
      try {
        parsed = text.length > 0 ? JSON.parse(text) : {};
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        params.onEvent({
          type: 'log',
          taskId: params.taskId,
          level: 'warn',
          message: `Devin API returned invalid JSON (retry): ${msg}`,
          timestampMs: nowMs(),
        });
        await sleep(delayMs, params.signal);
        delayMs = Math.min(params.maxDelayMs, Math.floor(delayMs * 1.5));
        continue;
      }

      const rec = isRecord(parsed) ? (parsed as DevinSessionStatusResponse) : undefined;
      const statusEnum = rec?.status_enum;
      lastStatusEnum = statusEnum ?? lastStatusEnum;
      const messages = Array.isArray(rec?.messages) ? rec?.messages : [];

      // 新規メッセージだけをログへ流す
      if (messages.length > lastMessageCount) {
        const slice = messages.slice(lastMessageCount);
        lastMessageCount = messages.length;
        for (const m of slice) {
          const msg = (m?.message ?? '').trim();
          if (msg.length === 0) {
            continue;
          }
          if (msg.includes(PERSPECTIVE_MARKER_END) || msg.includes(PATCH_MARKER_END)) {
            sawEndMarker = true;
          }
          const type = (m?.type ?? '').trim();
          // initial_user_message はプロンプトの反復になりやすいので抑制
          if (type === 'initial_user_message') {
            continue;
          }
          params.onEvent({
            type: 'log',
            taskId: params.taskId,
            level: 'info',
            message: msg,
            timestampMs: nowMs(),
          });
        }
      }

      if (isDevinEndState(statusEnum)) {
        if (statusEnum === 'finished') {
          return 0;
        }
        // マーカー（END）が取れていれば、blocked でも成果物は回収できているため成功扱いにする
        if (statusEnum === 'blocked' && sawEndMarker) {
          const elapsedSec = Math.max(0, Math.floor((nowMs() - startedAt) / 1000));
          params.onEvent({
            type: 'log',
            taskId: params.taskId,
            level: 'warn',
            message: `Devin セッションは status=blocked で終了しましたが、成果物マーカー（END）が確認できたため成功扱いにします（elapsed=${elapsedSec}s）。`,
            timestampMs: nowMs(),
          });
          return 0;
        }
        // expired は終了扱い
        // blocked は「追加入力待ち」だが、MVP では自動で 1 回だけ追送して継続を試みる
        if (statusEnum === 'blocked' && unblockRetries < DEVIN_AUTO_UNBLOCK_MAX_RETRIES) {
          unblockRetries += 1;
          const elapsedSec = Math.max(0, Math.floor((nowMs() - startedAt) / 1000));
          params.onEvent({
            type: 'log',
            taskId: params.taskId,
            level: 'warn',
            message: `Devin セッションが status=blocked になったため、自動で追加メッセージを送信して続行します（retry=${unblockRetries}/${DEVIN_AUTO_UNBLOCK_MAX_RETRIES}, elapsed=${elapsedSec}s）。`,
            timestampMs: nowMs(),
          });
          try {
            await this.postSessionMessage({
              baseUrl: params.baseUrl,
              apiKey: params.apiKey,
              sessionId: params.sessionId,
              message:
                'Continue the task without asking questions. Do NOT request repository setup. You already have all necessary context in the prompt. Output the final result now.\n' +
                '- For perspectives: output JSON between the required markers.\n' +
                '- For patch: output unified diff between the required markers.\n' +
                'Do not include anything else outside the markers.',
              signal: params.signal,
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            params.onEvent({
              type: 'log',
              taskId: params.taskId,
              level: 'warn',
              message: `Devin /message の送信に失敗しました（続行します）: ${msg}`,
              timestampMs: nowMs(),
            });
          }
          await sleep(delayMs, params.signal);
          continue;
        }

        // blocked / expired は終了扱い（要追加入力/期限切れ）
        const elapsedSec = Math.max(0, Math.floor((nowMs() - startedAt) / 1000));
        params.onEvent({
          type: 'log',
          taskId: params.taskId,
          level: 'warn',
          message:
            statusEnum === 'blocked'
              ? t('devinApi.endedBlocked', String(elapsedSec))
              : t('devinApi.endedExpired', String(elapsedSec)),
          timestampMs: nowMs(),
        });
        return 1;
      }

      // 通常継続
      // 無音が長い場合の心拍ログ
      const elapsedSec = Math.max(0, Math.floor((nowMs() - startedAt) / 1000));
      if (elapsedSec > 0 && elapsedSec % 30 === 0) {
        params.onEvent({
          type: 'log',
          taskId: params.taskId,
          level: 'info',
          message: `Devin API running... (elapsed ${elapsedSec}s, status=${(lastStatusEnum ?? 'unknown').toString()})`,
          timestampMs: nowMs(),
        });
      }

      await sleep(delayMs, params.signal);
      // Exponential backoff（上限あり）
      delayMs = Math.min(params.maxDelayMs, Math.floor(delayMs * 1.2));
    }
  }

  private async postSessionMessage(params: {
    baseUrl: string;
    apiKey: string;
    sessionId: string;
    message: string;
    signal: AbortSignal;
  }): Promise<void> {
    const url = `${params.baseUrl}/sessions/${encodeURIComponent(params.sessionId)}/message`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: params.message }),
      signal: params.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Devin API /sessions/{id}/message failed: ${res.status} ${res.statusText} ${text}`.trim());
    }
  }

  /**
   * Devin API /attachments にファイルをアップロードし、参照 URL を取得する。
   * multipart/form-data で `file` フィールドに送信する。
   */
  private async uploadAttachment(params: {
    baseUrl: string;
    apiKey: string;
    filename: string;
    content: string;
    signal: AbortSignal;
  }): Promise<{ url: string }> {
    const url = `${params.baseUrl}/attachments`;
    const blob = new Blob([params.content], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', blob, params.filename);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        // Content-Type は FormData の場合、fetch が自動設定する（手動設定すると boundary が壊れる）
      },
      body: formData,
      signal: params.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Devin API /attachments failed: ${res.status} ${res.statusText} ${text}`.trim());
    }
    const trimmed = text.trim();

    // 仕様メモ（docs/devin-api-integration.ja.md）では、レスポンスは「URL文字列」。
    // 実装は互換のため、以下を許容する:
    // - JSON string: "https://..."
    // - raw string: https://...
    // - JSON object: { "url": "https://..." }（将来/別仕様）
    let fileUrl: string | undefined;

    if (trimmed.length > 0) {
      // まずは JSON として解釈を試みる（"..." や {"url":...}）
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (typeof parsed === 'string') {
          fileUrl = parsed.trim();
        } else if (isRecord(parsed) && typeof parsed.url === 'string') {
          fileUrl = parsed.url.trim();
        }
      } catch {
        // JSON でなければ raw string として扱う
        fileUrl = trimmed;
      }
    }

    if (!fileUrl || fileUrl.length === 0) {
      throw new Error(`Devin API /attachments returned no url (response: ${trimmed.slice(0, 200)})`.trim());
    }
    return { url: fileUrl };
  }

  /**
   * 複数のファイルを添付アップロードし、各 URL を返す。1 件でも失敗すれば例外をスローする。
   */
  private async uploadAttachments(params: {
    baseUrl: string;
    apiKey: string;
    files: Array<{ filename: string; content: string }>;
    signal: AbortSignal;
  }): Promise<Array<{ filename: string; url: string }>> {
    const results: Array<{ filename: string; url: string }> = [];
    for (const f of params.files) {
      const uploaded = await this.uploadAttachment({
        baseUrl: params.baseUrl,
        apiKey: params.apiKey,
        filename: f.filename,
        content: f.content,
        signal: params.signal,
      });
      results.push({ filename: f.filename, url: uploaded.url });
    }
    return results;
  }
}

