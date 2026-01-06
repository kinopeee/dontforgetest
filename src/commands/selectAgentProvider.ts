import * as vscode from 'vscode';
import { t } from '../core/l10n';
import { getAgentProviderId, type AgentProviderId } from '../providers/configuredProvider';
import { DEVIN_API_KEY_ENV } from '../providers/providerIds';

type AgentPickItem = vscode.QuickPickItem & { providerId: AgentProviderId };

/**
 * Devin API の API Key が設定されているかチェックする。
 * @returns API Key が設定されている場合 true、未設定の場合 false
 */
function isDevinApiKeySet(): boolean {
  const config = vscode.workspace.getConfiguration('dontforgetest');
  const devinApiKeyRaw = (config.get<string>('devinApiKey') ?? '').trim();
  const apiKey = devinApiKeyRaw.length > 0 ? devinApiKeyRaw : (process.env[DEVIN_API_KEY_ENV] ?? '').trim();
  return apiKey.length > 0;
}

/**
 * QuickPick で Agent Provider を選択して設定に保存する。
 */
export async function selectAgentProvider(): Promise<void> {
  const currentId = getAgentProviderId();
  const isDevinApiKeyConfigured = isDevinApiKeySet();

  const devinApiDescriptionParts: string[] = [];
  if (currentId === 'devinApi') {
    devinApiDescriptionParts.push(t('selectAgentProvider.current'));
  }
  if (!isDevinApiKeyConfigured) {
    devinApiDescriptionParts.push(t('selectAgentProvider.devinApi.apiKeyNotSet'));
  }

  const items: AgentPickItem[] = [
    {
      label: t('selectAgentProvider.cursorAgent'),
      description: currentId === 'cursorAgent' ? t('selectAgentProvider.current') : undefined,
      providerId: 'cursorAgent',
    },
    {
      label: t('selectAgentProvider.claudeCode'),
      description: currentId === 'claudeCode' ? t('selectAgentProvider.current') : undefined,
      providerId: 'claudeCode',
    },
    {
      label: t('selectAgentProvider.devinApi'),
      description: devinApiDescriptionParts.length > 0 ? devinApiDescriptionParts.join(' • ') : undefined,
      providerId: 'devinApi',
    },
  ];

  let currentLabel = t('selectAgentProvider.cursorAgent');
  if (currentId === 'claudeCode') {
    currentLabel = t('selectAgentProvider.claudeCode');
  } else if (currentId === 'devinApi') {
    currentLabel = t('selectAgentProvider.devinApi');
  }

  const picked = await vscode.window.showQuickPick<AgentPickItem>(items, {
    title: t('selectAgentProvider.title'),
    placeHolder: t('selectAgentProvider.placeholderCurrent', currentLabel),
  });

  if (!picked) {
    return;
  }

  // Devin API を選択した場合、API Key が未設定なら警告を表示
  if (picked.providerId === 'devinApi' && !isDevinApiKeySet()) {
    const openSettingsLabel = t('devinApi.openSettings');
    const pickedAction = await vscode.window.showWarningMessage(
      t('devinApi.missingApiKey'),
      openSettingsLabel,
    );
    if (pickedAction === openSettingsLabel) {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'dontforgetest.devinApiKey');
    }
    // API Key が未設定でも設定は保存する（ユーザーが後で設定する可能性があるため）
  }

  const config = vscode.workspace.getConfiguration('dontforgetest');
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;

  await config.update('agentProvider', picked.providerId, target);

  void vscode.window.showInformationMessage(
    t('selectAgentProvider.infoSet', picked.label),
  );
}
