import * as vscode from 'vscode';
import { type AgentProvider } from './provider';
import { CursorAgentProvider } from './cursorAgentProvider';
import { ClaudeCodeProvider } from './claudeCodeProvider';

/**
 * エージェントプロバイダーの識別子。
 */
export type AgentProviderId = 'cursorAgent' | 'claudeCode';

/**
 * 設定からエージェントプロバイダーIDを取得する。
 * 無効な値や未設定の場合は 'cursorAgent' を返す。
 */
export function getAgentProviderId(): AgentProviderId {
  const config = vscode.workspace.getConfiguration('dontforgetest');
  const raw = config.get<string>('agentProvider', 'cursorAgent');
  const trimmed = (raw ?? 'cursorAgent').trim();
  if (trimmed === 'claudeCode') {
    return 'claudeCode';
  }
  return 'cursorAgent';
}

/**
 * 設定に応じたエージェントプロバイダーを生成する。
 */
export function createAgentProvider(): AgentProvider {
  return createAgentProviderById(getAgentProviderId());
}

/**
 * 指定された ID に対応するエージェントプロバイダーを生成する。
 * テスト用に公開。
 */
export function createAgentProviderById(id: AgentProviderId): AgentProvider {
  if (id === 'claudeCode') {
    return new ClaudeCodeProvider();
  }
  return new CursorAgentProvider();
}
