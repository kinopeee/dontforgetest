import * as vscode from 'vscode';
import { findLatestArtifact, getArtifactSettings } from './core/artifacts';
import { generateTestFromLatestCommit } from './commands/generateFromCommit';
import { generateTestFromCommitRange } from './commands/generateFromCommitRange';
import { generateTestFromActiveFile } from './commands/generateFromFile';
import { generateTestFromWorkingTree } from './commands/generateFromWorkingTree';
import { selectDefaultModel } from './commands/selectDefaultModel';
import { CursorAgentProvider } from './providers/cursorAgentProvider';
import { TestGenControlPanelViewProvider } from './ui/controlPanel';
import { showTestGenOutput } from './ui/outputChannel';
import { generateTestWithQuickPick } from './ui/quickPick';
import { initializeTestGenStatusBar } from './ui/statusBar';

/**
 * この関数は拡張機能が有効化されたときに呼ばれます
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('拡張機能 "dontforgetest" が有効化されました');

  const provider = new CursorAgentProvider();
  const controlPanelProvider = new TestGenControlPanelViewProvider(context);
  initializeTestGenStatusBar(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TestGenControlPanelViewProvider.viewId, controlPanelProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dontforgetest.generateTest', async () => {
      await generateTestWithQuickPick(provider);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dontforgetest.openPanel', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.dontforgetest');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dontforgetest.generateTestFromFile', async () => {
      await generateTestFromActiveFile(provider);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dontforgetest.generateTestFromCommit', async () => {
      await generateTestFromLatestCommit(provider);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dontforgetest.generateTestFromCommitRange', async () => {
      await generateTestFromCommitRange(provider);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dontforgetest.generateTestFromWorkingTree', async () => {
      await generateTestFromWorkingTree(provider);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dontforgetest.showTestGeneratorOutput', () => {
      showTestGenOutput(true);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dontforgetest.selectDefaultModel', async () => {
      await selectDefaultModel();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dontforgetest.openSettings', async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'dontforgetest');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dontforgetest.openLatestPerspective', async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        await vscode.window.showWarningMessage('ワークスペースが開かれていません');
        return;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const settings = getArtifactSettings();
      const latestPath = await findLatestArtifact(workspaceRoot, settings.perspectiveReportDir, 'test-perspectives_');

      if (!latestPath) {
        await vscode.window.showInformationMessage('テスト観点表が見つかりませんでした');
        return;
      }

      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(latestPath));
      await vscode.window.showTextDocument(doc);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dontforgetest.openLatestExecutionReport', async () => {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        await vscode.window.showWarningMessage('ワークスペースが開かれていません');
        return;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const settings = getArtifactSettings();
      const latestPath = await findLatestArtifact(workspaceRoot, settings.testExecutionReportDir, 'test-execution_');

      if (!latestPath) {
        await vscode.window.showInformationMessage('テスト実行レポートが見つかりませんでした');
        return;
      }

      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(latestPath));
      await vscode.window.showTextDocument(doc);
    }),
  );
}

/**
 * この関数は拡張機能が無効化されたときに呼ばれます
 */
export function deactivate() {
  console.log('拡張機能 "dontforgetest" が無効化されました');
}
