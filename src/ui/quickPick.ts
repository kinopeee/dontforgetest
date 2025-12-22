import * as vscode from 'vscode';
import { generateTestFromLatestCommit } from '../commands/generateFromCommit';
import { generateTestFromCommitRange } from '../commands/generateFromCommitRange';
import { generateTestFromActiveFile } from '../commands/generateFromFile';
import { generateTestFromWorkingTree } from '../commands/generateFromWorkingTree';
import { getModelSettings } from '../core/modelSettings';
import { ensurePreflight } from '../core/preflight';
import { type AgentProvider } from '../providers/provider';

type SourceKind = 'activeFile' | 'latestCommit' | 'commitRange' | 'workingTree';
type SourcePickItem = vscode.QuickPickItem & { source: SourceKind };
type ModelPickMode = 'useConfig' | 'useCandidate' | 'input' | 'separator';
type ModelPickItem = vscode.QuickPickItem & { mode: ModelPickMode; modelValue?: string };

/**
 * QuickPickでソース/モデルを選択してテスト生成を実行する（MVP UI）。
 */
export async function generateTestWithQuickPick(provider: AgentProvider): Promise<void> {
  // 先にプリフライトで「そもそも実行できるか」を確認する
  const preflight = await ensurePreflight();
  if (!preflight) {
    return;
  }

  const source = await pickSource();
  if (!source) {
    return;
  }

  const modelOverride = await pickModelOverride();
  if (modelOverride === null) {
    // キャンセル
    return;
  }

  switch (source) {
    case 'activeFile':
      await generateTestFromActiveFile(provider, modelOverride);
      return;
    case 'latestCommit':
      await generateTestFromLatestCommit(provider, modelOverride);
      return;
    case 'commitRange':
      await generateTestFromCommitRange(provider, modelOverride);
      return;
    case 'workingTree':
      await generateTestFromWorkingTree(provider, modelOverride);
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
      { label: '現在のファイル', description: 'アクティブエディタのファイル', source: 'activeFile' },
      { label: '最新コミット差分', description: 'HEAD の差分', source: 'latestCommit' },
      { label: 'コミット範囲差分', description: 'main..HEAD 等を指定', source: 'commitRange' },
      { label: '未コミット差分', description: 'staged / unstaged を選択', source: 'workingTree' },
    ],
    { title: 'TestGen: 実行ソースを選択', placeHolder: 'どの差分/対象からテストを生成しますか？' },
  );
  return picked?.source;
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
        description: '設定: testgen-agent.customModels',
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
    title: 'TestGen: モデルを選択',
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

