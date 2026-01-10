import * as path from 'path';
import * as vscode from 'vscode';
import {
  analyzeTestFiles,
  analyzeFile,
  saveAnalysisReport,
  getAnalysisSettings,
  type AnalysisResult,
} from '../core/testAnalyzer';
import { type AnalysisContext, type TestFunction } from '../core/analysis/types';
import { t } from '../core/l10n';
import { getTestGenOutputChannel } from '../ui/outputChannel';

export type AnalysisTarget = 'all' | 'current';

/**
 * テスト分析コマンドを実行する
 *
 * @param target 分析対象（'all': 全テストファイル, 'current': 現在開いているファイル）
 */
export async function analyzeTestsCommand(target?: AnalysisTarget): Promise<void> {
  // 1. ワークスペース確認
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    await vscode.window.showWarningMessage(t('workspace.notOpen'));
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const settings = getAnalysisSettings();

  // 2. 対象選択（引数がない場合は QuickPick で選択）
  let selectedTarget: AnalysisTarget | undefined = target;
  if (!selectedTarget) {
    selectedTarget = await selectAnalysisTarget();
    if (!selectedTarget) {
      return; // ユーザーがキャンセル
    }
  }

  // 3. 分析実行
  let result: AnalysisResult | undefined;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: t('controlPanel.analysis.running'),
      cancellable: false,
    },
    async () => {
      if (selectedTarget === 'current') {
        // 現在のファイルを分析
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
          await vscode.window.showWarningMessage(t('analysis.noActiveEditor'));
          return;
        }
        const filePath = activeEditor.document.uri.fsPath;
        result = await analyzeFile(filePath, workspaceRoot);
      } else {
        // 全テストファイルを分析
        result = await analyzeTestFiles(workspaceRoot, settings.testFilePattern);
      }
    },
  );

  // result が undefined の場合（アクティブエディタなし等により分析が実行されなかったケース）
  if (!result) {
    return;
  }

  // 4. レポート保存
  const savedPath = await saveAnalysisReport(
    workspaceRoot,
    result,
  );
  const relativePath = path.relative(workspaceRoot, savedPath);

  // 5. ログ出力
  getTestGenOutputChannel().appendLine(`[Analysis] ${t('analysis.reportSaved', relativePath)}`);

  // 6. レポートを開く
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(savedPath));
  await vscode.window.showTextDocument(doc, { preview: true });

  // 7. サマリー通知
  const totalIssues = result.issues.length;
  if (totalIssues === 0) {
    await vscode.window.showInformationMessage(t('analysis.noIssues'));
  } else {
    await vscode.window.showInformationMessage(
      t('analysis.reportSaved', relativePath),
    );
  }
}

/**
 * 分析対象を選択する QuickPick
 */
async function selectAnalysisTarget(): Promise<AnalysisTarget | undefined> {
  const items: vscode.QuickPickItem[] = [
    {
      label: t('controlPanel.analysis.allTests'),
      description: t('quickPick.analysis.selectTargetPlaceholder'),
    },
    {
      label: t('controlPanel.analysis.currentFile'),
      description: '',
    },
  ];

  const selected = await vscode.window.showQuickPick(items, {
    title: t('quickPick.analysis.selectTarget'),
    placeHolder: t('quickPick.analysis.selectTargetPlaceholder'),
  });

  if (!selected) {
    return undefined;
  }

  if (selected.label === t('controlPanel.analysis.currentFile')) {
    return 'current';
  }

  return 'all';
}
