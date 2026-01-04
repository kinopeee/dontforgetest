import * as vscode from 'vscode';
import { type AgentProviderId } from '../providers/configuredProvider';

export interface ModelSettings {
  /** 未設定の場合は undefined（cursor-agent 側の自動選択に委ねる） */
  defaultModel?: string;
  /**
   * モデル候補のフォールバックリスト。
   * Phase 4 で API から動的取得するまでの間、QuickPick 等で利用する。
   */
  customModels: string[];
}

/**
 * モデル設定を読み取り、正規化して返す。
 */
export function getModelSettings(): ModelSettings {
  const config = vscode.workspace.getConfiguration('dontforgetest');

  const defaultModelRaw = (config.get<string>('defaultModel') ?? '').trim();
  const defaultModel = defaultModelRaw.length > 0 ? defaultModelRaw : undefined;

  const customModels = normalizeModelList(config.get<unknown>('customModels'));

  return {
    defaultModel,
    customModels,
  };
}

/**
 * customModels の入力（unknown）を安全に正規化する。
 * - string[] 以外は空扱い
 * - trim、空要素除外
 * - 重複除去（先勝ち）
 */
export function normalizeModelList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') {
      continue;
    }
    const trimmed = item.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * defaultModel を更新する。
 * - undefined: 空文字でクリア（未設定扱い）
 */
export async function setDefaultModel(model: string | undefined): Promise<void> {
  const config = vscode.workspace.getConfiguration('dontforgetest');
  const target = pickUpdateTarget();
  await config.update('defaultModel', (model ?? '').trim(), target);
}

/**
 * UI 等で表示する「候補モデル」を返す。
 * - defaultModel（設定済み）を先頭に含める
 * - customModels とマージして重複除去
 */
export function getModelCandidates(settings: ModelSettings = getModelSettings()): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const pushUnique = (m: string): void => {
    const trimmed = m.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    out.push(trimmed);
  };

  if (settings.defaultModel) {
    pushUnique(settings.defaultModel);
  }
  for (const m of settings.customModels) {
    pushUnique(m);
  }
  return out;
}

function pickUpdateTarget(): vscode.ConfigurationTarget {
  // 基本はワークスペース単位で設定したい（プロジェクトごとにモデルが違い得るため）
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    return vscode.ConfigurationTarget.Workspace;
  }
  return vscode.ConfigurationTarget.Global;
}

/**
 * Claude Code CLI 用のモデル候補を返す。
 */
export function getClaudeCodeModelCandidates(): string[] {
  return ['opus-4.5', 'sonnet-4.5', 'haiku-4.5'];
}

/**
 * Cursor Agent 用のビルトインモデル候補リスト。
 */
const CURSOR_AGENT_BUILTIN_MODELS = [
  'composer-1',
  'auto',
  'sonnet-4.5',
  'sonnet-4.5-thinking',
  'opus-4.5',
  'opus-4.5-thinking',
  'gemini-3-pro',
  'gemini-3-flash',
  'gpt-5.2',
  'gpt-5.1',
  'gpt-5.2-high',
  'gpt-5.1-high',
  'gpt-5.1-codex',
  'gpt-5.1-codex-high',
  'gpt-5.1-codex-max',
  'gpt-5.1-codex-max-high',
  'opus-4.1',
  'grok',
];

/**
 * Cursor Agent 用のモデル候補を返す。
 * ビルトインリストに customModels と defaultModel をマージして返す。
 */
export function getCursorAgentModelCandidates(settings: ModelSettings = getModelSettings()): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const pushUnique = (m: string): void => {
    const trimmed = m.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    out.push(trimmed);
  };

  // ビルトインモデルを追加
  for (const m of CURSOR_AGENT_BUILTIN_MODELS) {
    pushUnique(m);
  }

  // defaultModel を追加（ビルトインに無い場合）
  if (settings.defaultModel) {
    pushUnique(settings.defaultModel);
  }

  // customModels を追加
  for (const m of settings.customModels) {
    pushUnique(m);
  }

  return out;
}

/**
 * Provider ID に応じたモデル候補を返す。
 */
export function getModelCandidatesForProvider(
  providerId: AgentProviderId,
  settings: ModelSettings = getModelSettings(),
): string[] {
  if (providerId === 'claudeCode') {
    return getClaudeCodeModelCandidates();
  }
  return getCursorAgentModelCandidates(settings);
}

/**
 * 現在の Provider に応じた有効なデフォルトモデルを返す。
 * - 設定された defaultModel が現在の Provider の候補に含まれていればそれを返す
 * - 含まれていなければ undefined（Provider のデフォルトに委ねる）
 */
export function getEffectiveDefaultModel(
  providerId: AgentProviderId,
  settings: ModelSettings = getModelSettings(),
): string | undefined {
  const candidates = getModelCandidatesForProvider(providerId, settings);
  const configured = settings.defaultModel;

  // 設定されたモデルが現在の Provider の候補に含まれていればそれを使う
  if (configured && candidates.includes(configured)) {
    return configured;
  }

  // 含まれていなければ undefined（Provider のデフォルトに委ねる）
  return undefined;
}