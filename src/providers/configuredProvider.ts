import * as vscode from 'vscode';
import { type AgentProvider } from './provider';
import { CursorAgentProvider } from './cursorAgentProvider';
import { ClaudeCodeProvider } from './claudeCodeProvider';
import { DevinApiProvider } from './devinApiProvider';

/**
 * エージェントプロバイダーの識別子。
 */
export type AgentProviderId = 'cursorAgent' | 'claudeCode' | 'devinApi';

/**
 * 設定からエージェントプロバイダーIDを取得する。
 * 無効な値や未設定の場合は 'cursorAgent' を返す。
 */
export function getAgentProviderId(): AgentProviderId {
  const config = vscode.workspace.getConfiguration('dontforgetest');
  // vscode.workspace.getConfiguration().get<T>() は、実値が T でなくてもそのまま返すため、
  // 文字列以外（number / null など）が入っても安全にフォールバックできるように扱う。
  const raw = config.get<unknown>('agentProvider');
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed === 'devinApi') {
    return 'devinApi';
  }
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
  if (id === 'devinApi') {
    return new DevinApiProvider();
  }
  if (id === 'claudeCode') {
    return new ClaudeCodeProvider();
  }
  return new CursorAgentProvider();
}
