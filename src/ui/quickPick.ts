import * as vscode from 'vscode';
import { generateTestFromLatestCommit } from '../commands/generateFromCommit';
import { generateTestFromCommitRange } from '../commands/generateFromCommitRange';
import { generateTestFromWorkingTree } from '../commands/generateFromWorkingTree';
import { getModelSettings } from '../core/modelSettings';
import { t } from '../core/l10n';
import { ensurePreflight } from '../core/preflight';
import { type AgentProvider } from '../providers/provider';

type SourceKind = 'workingTree' | 'latestCommit' | 'commitRange';
type SourcePickItem = vscode.QuickPickItem & { source: SourceKind };
type ModelPickMode = 'useConfig' | 'useCandidate' | 'input' | 'separator';
type ModelPickItem = vscode.QuickPickItem & { mode: ModelPickMode; modelValue?: string };
type RunLocation = 'local' | 'worktree';
type RunLocationPickItem = vscode.QuickPickItem & { runLocation: RunLocation };

/**
 * QuickPickでソース/モデルを選択してテスト生成を実行する（MVP UI）。
 */
export async function generateTestWithQuickPick(provider: AgentProvider, context: vscode.ExtensionContext): Promise<void> {
  // 先にプリフライトで「そもそも実行できるか」を確認する
  const preflight = await ensurePreflight();
  if (!preflight) {
    return;
  }

  const source = await pickSource();
  if (!source) {
    return;
  }

  const runLocation = await pickRunLocation(source);
  if (!runLocation) {
    return;
  }

  const modelOverride = await pickModelOverride();
  if (modelOverride === null) {
    // キャンセル
    return;
  }

  switch (source) {
    case 'workingTree':
      await generateTestFromWorkingTree(provider, modelOverride);
      return;
    case 'latestCommit':
      await generateTestFromLatestCommit(provider, modelOverride, { runLocation, extensionContext: context });
      return;
    case 'commitRange':
      await generateTestFromCommitRange(provider, modelOverride, { runLocation, extensionContext: context });
      return;
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

async function pickSource(): Promise<SourceKind | undefined> {
  const picked = await vscode.window.showQuickPick<SourcePickItem>(
    [
      { label: t('quickPick.uncommittedDiff'), description: t('quickPick.uncommittedDiffDesc'), source: 'workingTree' },
      { label: t('quickPick.latestCommit'), description: t('quickPick.latestCommitDesc'), source: 'latestCommit' },
      { label: t('quickPick.commitRange'), description: t('quickPick.commitRangeDesc'), source: 'commitRange' },
    ],
    { title: `Dontforgetest: ${t('quickPick.selectSource')}`, placeHolder: t('quickPick.selectSourcePlaceholder') },
  );
  return picked?.source;
}

async function pickRunLocation(source: SourceKind): Promise<RunLocation | undefined> {
  // 未コミット差分は「その時点の作業ツリー再現」が重くなるため、MVPでは Local のみ。
  if (source === 'workingTree') {
    return 'local';
  }

  const picked = await vscode.window.showQuickPick<RunLocationPickItem>(
    [
      {
        label: t('quickPick.local'),
        description: t('quickPick.localDescription'),
        runLocation: 'local',
      },
      {
        label: t('quickPick.worktree'),
        description: t('quickPick.worktreeDescription'),
        runLocation: 'worktree',
      },
    ],
    {
      title: `Dontforgetest: ${t('quickPick.selectRunLocation')}`,
      placeHolder: t('quickPick.selectRunLocationPlaceholder'),
    },
  );
  return picked?.runLocation;
}

/**
 * モデル上書き値を返す。
 * - undefined: 設定（defaultModel）に従う
 * - string: 入力したモデルで上書き
 * - null: キャンセル
 */
async function pickModelOverride(): Promise<string | undefined | null> {
  const { defaultModel, customModels } = getModelSettings();

  const items: ModelPickItem[] = [
    {
      label: t('quickPick.useConfigModel'),
      description: defaultModel ? defaultModel : t('quickPick.defaultModelNotSet'),
      mode: 'useConfig',
    },
  ];

  if (customModels.length > 0) {
    items.push({
      label: 'customModels',
      kind: vscode.QuickPickItemKind.Separator,
      mode: 'separator',
    });
    for (const model of customModels) {
      items.push({
        label: model,
        description: t('quickPick.customModelsDesc'),
        mode: 'useCandidate',
        modelValue: model,
      });
    }
  }

  items.push({
    label: t('quickPick.inputModel'),
    description: t('quickPick.inputModelDesc'),
    mode: 'input',
  });

  const picked = await vscode.window.showQuickPick<ModelPickItem>(items, {
    title: `Dontforgetest: ${t('quickPick.selectModel')}`,
    placeHolder: t('quickPick.selectModelPlaceholder'),
  });

  if (!picked) {
    return null;
  }

  if (picked.mode === 'useConfig') {
    return undefined;
  }

  if (picked.mode === 'useCandidate') {
    return picked.modelValue;
  }

  if (picked.mode === 'input') {
    const input = await vscode.window.showInputBox({
      title: t('quickPick.inputModelTitle'),
      prompt: t('quickPick.inputModelPrompt'),
      value: defaultModel ?? '',
      validateInput: (value) => {
        if (value.trim().length === 0) {
          return t('quickPick.inputModelValidation');
        }
        return undefined;
      },
    });
    if (input === undefined) {
      return null;
    }

    return input.trim();
  }

  // separator は選択されない想定だが、型のために分岐を残す
  return null;
}

