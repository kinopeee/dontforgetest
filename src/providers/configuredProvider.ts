import * as vscode from 'vscode';
import { type AgentProvider } from './provider';
import { CursorAgentProvider } from './cursorAgentProvider';
import { ClaudeCodeProvider } from './claudeCodeProvider';
import { GeminiCliProvider } from './geminiCliProvider';
import { CodexCliProvider } from './codexCliProvider';

/**
 * エージェントプロバイダーの識別子。
 */
export type AgentProviderId = 'cursorAgent' | 'claudeCode' | 'geminiCli' | 'codexCli';

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
  if (trimmed === 'claudeCode') return 'claudeCode';
  if (trimmed === 'geminiCli') return 'geminiCli';
  if (trimmed === 'codexCli') return 'codexCli';
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
  if (id === 'claudeCode') return new ClaudeCodeProvider();
  if (id === 'geminiCli') return new GeminiCliProvider();
  if (id === 'codexCli') return new CodexCliProvider();
  return new CursorAgentProvider();
}
