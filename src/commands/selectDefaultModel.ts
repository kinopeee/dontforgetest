import * as vscode from 'vscode';
import { getModelSettings, setDefaultModel } from '../core/modelSettings';
import { t } from '../core/l10n';

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
      label: t('selectDefaultModel.unsetLabel'),
      description: t('selectDefaultModel.unsetDesc'),
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
        description: t('quickPick.customModelsDesc'),
        mode: 'useCandidate',
        modelValue: model,
      });
    }
  }

  items.push({
    label: t('selectDefaultModel.inputLabel'),
    description: t('selectDefaultModel.inputDesc'),
    mode: 'input',
  });

  const picked = await vscode.window.showQuickPick<DefaultModelPickItem>(items, {
    title: t('selectDefaultModel.title'),
    placeHolder: defaultModel ? t('selectDefaultModel.placeholderCurrent', defaultModel) : t('selectDefaultModel.placeholderUnset'),
  });

  if (!picked) {
    return;
  }

  if (picked.mode === 'unset') {
    await setDefaultModel(undefined);
    void vscode.window.showInformationMessage(t('selectDefaultModel.infoUnset'));
    return;
  }

  if (picked.mode === 'useCandidate') {
    const model = (picked.modelValue ?? '').trim();
    if (model.length === 0) {
      return;
    }
    await setDefaultModel(model);
    void vscode.window.showInformationMessage(t('selectDefaultModel.infoSet', model));
    return;
  }

  if (picked.mode === 'input') {
    const input = await vscode.window.showInputBox({
      title: t('selectDefaultModel.inputBoxTitle'),
      prompt: t('selectDefaultModel.inputBoxPrompt'),
      value: defaultModel ?? '',
      validateInput: (value) => {
        if (value.trim().length === 0) {
          return t('selectDefaultModel.inputBoxValidation');
        }
        return undefined;
      },
    });
    if (input === undefined) {
      return;
    }
    const model = input.trim();
    await setDefaultModel(model);
    void vscode.window.showInformationMessage(t('selectDefaultModel.infoSet', model));
    return;
  }
}

