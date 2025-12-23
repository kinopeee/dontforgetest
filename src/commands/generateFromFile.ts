import * as path from 'path';
import * as vscode from 'vscode';
import { ensurePreflight } from '../core/preflight';
import { buildTestGenPrompt } from '../core/promptBuilder';
import { runWithArtifacts } from './runWithArtifacts';
import { type AgentProvider } from '../providers/provider';

/**
 * 現在アクティブなファイルに対してテスト生成を実行する。
 */
export async function generateTestFromActiveFile(provider: AgentProvider, modelOverride?: string): Promise<void> {
  const preflight = await ensurePreflight();
  if (!preflight) {
    return;
  }
  const { workspaceRoot, defaultModel, testStrategyPath, cursorAgentCommand } = preflight;

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('アクティブなエディタがありません。');
    return;
  }
  if (editor.document.uri.scheme !== 'file') {
    vscode.window.showErrorMessage('ファイル以外のドキュメントは対象にできません。');
    return;
  }

  const absolutePath = editor.document.uri.fsPath;
  const relativePath = path.relative(workspaceRoot, absolutePath);

  const { prompt } = await buildTestGenPrompt({
    workspaceRoot,
    targetLabel: '現在のファイル',
    targetPaths: [relativePath],
    testStrategyPath,
  });

  const taskId = `fromFile-${Date.now()}`;
  const generationLabel = `現在のファイル: ${relativePath}`;
  await runWithArtifacts({
    provider,
    workspaceRoot,
    cursorAgentCommand,
    testStrategyPath,
    generationLabel,
    targetPaths: [relativePath],
    generationPrompt: prompt,
    model: modelOverride ?? defaultModel,
    generationTaskId: taskId,
  });
}

