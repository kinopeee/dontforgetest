import * as vscode from 'vscode';

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
  const config = vscode.workspace.getConfiguration('testgen-agent');

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
  const config = vscode.workspace.getConfiguration('testgen-agent');
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

