import * as path from 'path';
import * as vscode from 'vscode';
import { recordTouchedPathFromEventPath, startLastRun } from '../apply/patchApplier';
import { ensurePreflight } from '../core/preflight';
import { buildTestGenPrompt } from '../core/promptBuilder';
import { type AgentProvider } from '../providers/provider';
import { appendEventToOutput, showTestGenOutput } from '../ui/outputChannel';
import { handleTestGenEventForStatusBar } from '../ui/statusBar';

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

  showTestGenOutput(true);
  const taskId = `fromFile-${Date.now()}`;
  await startLastRun(taskId, `現在のファイル: ${relativePath}`, workspaceRoot, [relativePath]);

  provider.run({
    taskId,
    workspaceRoot,
    agentCommand: cursorAgentCommand,
    prompt,
    model: modelOverride ?? defaultModel,
    outputFormat: 'stream-json',
    allowWrite: true,
    onEvent: (event) => {
      handleTestGenEventForStatusBar(event);
      appendEventToOutput(event);
      if (event.type === 'fileWrite') {
        recordTouchedPathFromEventPath(workspaceRoot, event.path);
      }
      if (event.type === 'completed') {
        const msg = event.exitCode === 0 ? `テスト生成が完了しました: ${relativePath}` : `テスト生成に失敗しました: ${relativePath} (exit=${event.exitCode ?? 'null'})`;
        if (event.exitCode === 0) {
          vscode.window.showInformationMessage(msg);
        } else {
          vscode.window.showErrorMessage(msg);
        }
      }
    },
  });

  vscode.window.showInformationMessage(`テスト生成を開始しました: ${relativePath}`);
}

