import * as vscode from 'vscode';
import { t } from '../core/l10n';
import { getAgentProviderId, type AgentProviderId } from '../providers/configuredProvider';

type AgentPickItem = vscode.QuickPickItem & { providerId: AgentProviderId };

/**
 * QuickPick で Agent Provider を選択して設定に保存する。
 */
export async function selectAgentProvider(): Promise<void> {
  const currentId = getAgentProviderId();

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
      description: currentId === 'devinApi' ? t('selectAgentProvider.current') : undefined,
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

  const config = vscode.workspace.getConfiguration('dontforgetest');
  const target = vscode.workspace.workspaceFolders?.length
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;

  await config.update('agentProvider', picked.providerId, target);

  void vscode.window.showInformationMessage(
    t('selectAgentProvider.infoSet', picked.label),
  );
}
