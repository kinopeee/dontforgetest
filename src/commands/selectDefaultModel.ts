import * as vscode from 'vscode';
import { getModelSettings, setDefaultModel } from '../core/modelSettings';

type DefaultModelPickMode = 'unset' | 'useCandidate' | 'input' | 'separator';
type DefaultModelPickItem = vscode.QuickPickItem & { mode: DefaultModelPickMode; modelValue?: string };

/**
 * defaultModel を QuickPick で選択して設定する。
 * customModels を候補として提示し、必要なら手入力もできる。
 */
export async function selectDefaultModel(): Promise<void> {
  const { defaultModel, customModels } = getModelSettings();

  const items: DefaultModelPickItem[] = [
    {
      label: '自動選択（未設定）',
      description: 'cursor-agent 側の自動選択に任せます',
      mode: 'unset',
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
    label: 'モデルを入力して設定',
    description: '例: claude-3.5-sonnet',
    mode: 'input',
  });

  const picked = await vscode.window.showQuickPick<DefaultModelPickItem>(items, {
    title: 'TestGen: defaultModel を設定',
    placeHolder: defaultModel ? `現在: ${defaultModel}` : '現在: （未設定）',
  });

  if (!picked) {
    return;
  }

  if (picked.mode === 'unset') {
    await setDefaultModel(undefined);
    void vscode.window.showInformationMessage('defaultModel を未設定（自動選択）にしました。');
    return;
  }

  if (picked.mode === 'useCandidate') {
    const model = (picked.modelValue ?? '').trim();
    if (model.length === 0) {
      return;
    }
    await setDefaultModel(model);
    void vscode.window.showInformationMessage(`defaultModel を設定しました: ${model}`);
    return;
  }

  if (picked.mode === 'input') {
    const input = await vscode.window.showInputBox({
      title: 'defaultModel を入力',
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
      return;
    }
    const model = input.trim();
    await setDefaultModel(model);
    void vscode.window.showInformationMessage(`defaultModel を設定しました: ${model}`);
    return;
  }
}

