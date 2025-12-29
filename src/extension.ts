import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { findLatestArtifact, getArtifactSettings } from './core/artifacts';
import { t } from './core/l10n';
import { generateTestFromLatestCommit } from './commands/generateFromCommit';
import { generateTestFromCommitRange } from './commands/generateFromCommitRange';
import { generateTestFromWorkingTree } from './commands/generateFromWorkingTree';
import { selectDefaultModel } from './commands/selectDefaultModel';
import { type TestGenerationRunMode } from './commands/runWithArtifacts';
import { CursorAgentProvider } from './providers/cursorAgentProvider';
import { TestGenControlPanelViewProvider } from './ui/controlPanel';
import { showTestGenOutput } from './ui/outputChannel';
import { generateTestWithQuickPick } from './ui/quickPick';
import { initializeTestGenStatusBar } from './ui/statusBar';
import { initializeProgressTreeView } from './ui/progressTreeView';
import { initializeOutputTreeView } from './ui/outputTreeView';

type RunLocation = 'local' | 'worktree';
type RunMode = TestGenerationRunMode;

/**
 * RunLocation 値を正規化する。
 * 'worktree' の場合のみ 'worktree' を返し、それ以外はすべて 'local' を返す。
 *
 * @param value - 正規化する値（コマンド引数から渡される可能性がある任意の型）
 * @returns 'worktree' または 'local'
 */
export function normalizeRunLocation(value: unknown): RunLocation {
  return value === 'worktree' ? 'worktree' : 'local';
}

/**
 * RunMode 値を正規化する。
 * 'perspectiveOnly' の場合のみ 'perspectiveOnly' を返し、それ以外はすべて 'full' を返す。
 */
export function normalizeRunMode(value: unknown): RunMode {
  return value === 'perspectiveOnly' ? 'perspectiveOnly' : 'full';
}

/**
 * この関数は拡張機能が有効化されたときに呼ばれます
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('拡張機能 "dontforgetest" が有効化されました');

  const provider = new CursorAgentProvider();
  const controlPanelProvider = new TestGenControlPanelViewProvider(context);
  initializeTestGenStatusBar(context);
  initializeProgressTreeView(context);
  initializeOutputTreeView(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TestGenControlPanelViewProvider.viewId, controlPanelProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dontforgetest.generateTest', async () => {
      await generateTestWithQuickPick(provider, context);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dontforgetest.openPanel', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.dontforgetest');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'dontforgetest.generateTestFromCommit',
      async (args?: { runLocation?: RunLocation; modelOverride?: string; runMode?: RunMode }) => {
        const runLocation = normalizeRunLocation(args?.runLocation);
        const modelOverride = typeof args?.modelOverride === 'string' ? args.modelOverride : undefined;
        const runMode = normalizeRunMode(args?.runMode);
        await generateTestFromLatestCommit(provider, modelOverride, { runLocation, runMode, extensionContext: context });
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'dontforgetest.generateTestFromCommitRange',
      async (args?: { runLocation?: RunLocation; modelOverride?: string; runMode?: RunMode }) => {
        const runLocation = normalizeRunLocation(args?.runLocation);
        const modelOverride = typeof args?.modelOverride === 'string' ? args.modelOverride : undefined;
        const runMode = normalizeRunMode(args?.runMode);
        await generateTestFromCommitRange(provider, modelOverride, { runLocation, runMode, extensionContext: context });
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dontforgetest.generateTestFromWorkingTree', async (args?: { modelOverride?: string; runMode?: RunMode }) => {
      const modelOverride = typeof args?.modelOverride === 'string' ? args.modelOverride : undefined;
      const runMode = normalizeRunMode(args?.runMode);
      await generateTestFromWorkingTree(provider, modelOverride, { runMode });
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
        await vscode.window.showWarningMessage(t('workspace.notOpen'));
        return;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const settings = getArtifactSettings();
      const latestPath = await findLatestArtifact(workspaceRoot, settings.perspectiveReportDir, 'test-perspectives_');

      if (!latestPath) {
        await vscode.window.showInformationMessage(t('artifact.latestPerspective.notFound'));
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
        await vscode.window.showWarningMessage(t('workspace.notOpen'));
        return;
      }

      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      const settings = getArtifactSettings();
      const latestPath = await findLatestArtifact(workspaceRoot, settings.testExecutionReportDir, 'test-execution_');

      if (!latestPath) {
        await vscode.window.showInformationMessage(t('artifact.latestExecutionReport.notFound'));
        return;
      }

      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(latestPath));
      await vscode.window.showTextDocument(doc);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('dontforgetest.openLatestMergeInstruction', async () => {
      // 手動マージ支援の指示は globalStorage に保存するため、ワークスペース未オープンでも利用できる。
      const baseDir = context.globalStorageUri.fsPath;
      const instructionsDir = path.join(baseDir, 'merge-instructions');
      let entries: string[] = [];
      try {
        entries = await fs.promises.readdir(instructionsDir);
      } catch {
        entries = [];
      }

      const mdFiles = entries.filter((name) => name.toLowerCase().endsWith('.md'));
      if (mdFiles.length === 0) {
        await vscode.window.showInformationMessage(t('artifact.mergeInstruction.notFound'));
        return;
      }

      const withStats = await Promise.all(
        mdFiles.map(async (name) => {
          const fullPath = path.join(instructionsDir, name);
          try {
            const stat = await fs.promises.stat(fullPath);
            return { fullPath, mtimeMs: stat.mtimeMs };
          } catch {
            return { fullPath, mtimeMs: 0 };
          }
        }),
      );

      const latest = withStats.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
      if (!latest) {
        await vscode.window.showInformationMessage(t('artifact.mergeInstruction.notFound'));
        return;
      }

      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(latest.fullPath));
      await vscode.window.showTextDocument(doc, { preview: true });
    }),
  );
}

/**
 * この関数は拡張機能が無効化されたときに呼ばれます
 */
export function deactivate() {
  console.log('拡張機能 "dontforgetest" が無効化されました');
}
