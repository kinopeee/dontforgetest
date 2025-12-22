import * as vscode from 'vscode';
import { previewLastRun, rollbackLastRun } from './apply/patchApplier';
import { generateTestFromLatestCommit } from './commands/generateFromCommit';
import { generateTestFromCommitRange } from './commands/generateFromCommitRange';
import { generateTestFromActiveFile } from './commands/generateFromFile';
import { generateTestFromWorkingTree } from './commands/generateFromWorkingTree';
import { CursorAgentProvider } from './providers/cursorAgentProvider';
import { showTestGenOutput } from './ui/outputChannel';
import { generateTestWithQuickPick } from './ui/quickPick';
import { initializeTestGenStatusBar } from './ui/statusBar';

/**
 * この関数は拡張機能が有効化されたときに呼ばれます
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('拡張機能 "testgen-agent" が有効化されました');

  const provider = new CursorAgentProvider();
  initializeTestGenStatusBar(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('testgen-agent.generateTest', async () => {
      await generateTestWithQuickPick(provider);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('testgen-agent.generateTestFromFile', async () => {
      await generateTestFromActiveFile(provider);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('testgen-agent.generateTestFromCommit', async () => {
      await generateTestFromLatestCommit(provider);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('testgen-agent.generateTestFromCommitRange', async () => {
      await generateTestFromCommitRange(provider);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('testgen-agent.generateTestFromWorkingTree', async () => {
      await generateTestFromWorkingTree(provider);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('testgen-agent.showTestGeneratorOutput', () => {
      showTestGenOutput(true);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('testgen-agent.previewLastRun', async () => {
      await previewLastRun();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('testgen-agent.rollbackLastRun', async () => {
      await rollbackLastRun();
    }),
  );
}

/**
 * この関数は拡張機能が無効化されたときに呼ばれます
 */
export function deactivate() {
  console.log('拡張機能 "testgen-agent" が無効化されました');
}
