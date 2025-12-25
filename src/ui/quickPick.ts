import * as vscode from 'vscode';
import { generateTestFromLatestCommit } from '../commands/generateFromCommit';
import { generateTestFromCommitRange } from '../commands/generateFromCommitRange';
import { generateTestFromWorkingTree } from '../commands/generateFromWorkingTree';
import { getModelSettings } from '../core/modelSettings';
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
      { label: '未コミット差分', description: 'staged / unstaged を選択', source: 'workingTree' },
      { label: '最新コミット差分', description: 'HEAD の差分', source: 'latestCommit' },
      { label: 'コミット範囲差分', description: 'main..HEAD 等を指定', source: 'commitRange' },
    ],
    { title: 'Dontforgetest: 実行ソースを選択', placeHolder: 'どの差分/対象からテストを生成しますか？' },
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
        label: 'Local（現在のワークスペース）',
        description: '生成結果を直接反映する',
        runLocation: 'local',
      },
      {
        label: 'Worktree（一時worktree）',
        description: '隔離して生成し、テスト差分だけを安全に適用する',
        runLocation: 'worktree',
      },
    ],
    {
      title: 'Dontforgetest: 実行先を選択',
      placeHolder: 'どこでテスト生成を実行しますか？',
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
      label: '設定の defaultModel を使用',
      description: defaultModel ? defaultModel : '（未設定: 自動選択）',
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
        description: '設定: dontforgetest.customModels',
        mode: 'useCandidate',
        modelValue: model,
      });
    }
  }

  items.push({
    label: 'モデルを入力して上書き',
    description: '例: claude-3.5-sonnet',
    mode: 'input',
  });

  const picked = await vscode.window.showQuickPick<ModelPickItem>(items, {
    title: 'Dontforgetest: モデルを選択',
    placeHolder: '使用するモデルを選択してください',
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
      title: 'モデルを入力',
      prompt: 'cursor-agent に渡すモデル名を入力してください（空の場合はキャンセル）',
      value: defaultModel ?? '',
      validateInput: (value) => {
        if (value.trim().length === 0) {
          return 'モデル名を入力してください。';
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

