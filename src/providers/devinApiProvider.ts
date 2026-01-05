import * as vscode from 'vscode';
import { nowMs, type TestGenEvent } from '../core/event';
import { t } from '../core/l10n';
import { type AgentProvider, type AgentRunOptions, type RunningTask } from './provider';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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
  public readonly id: string = 'devin-api';
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
    const apiKey = apiKeyRaw.length > 0 ? apiKeyRaw : (process.env.DEVIN_API_KEY ?? '').trim() || undefined;
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

    const session = await this.createSession({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      body: {
        prompt: options.prompt,
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

    while (true) {
      if (params.signal.aborted) {
        return null;
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
        // blocked / expired は MVP では終了扱い（要追加入力/期限切れ）
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
}

