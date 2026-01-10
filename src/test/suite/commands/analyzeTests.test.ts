import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';

import { analyzeTestsCommand } from '../../../commands/analyzeTests';
import * as testAnalyzerModule from '../../../core/testAnalyzer';
import * as outputChannelModule from '../../../ui/outputChannel';
import { t } from '../../../core/l10n';

/**
 * analyzeTestsCommand の実シナリオテスト。
 *
 * 各シナリオで VS Code API（workspaceFolders, showQuickPick, activeTextEditor, withProgress,
 * showWarningMessage, showInformationMessage, openTextDocument, showTextDocument）をスタブ化し、
 * コマンド本体のフロー（UI/進捗/保存/通知/ドキュメントオープン）を検証する。
 */
suite('src/commands/analyzeTests.ts analyzeTestsCommand (real scenario tests)', () => {
  // ============================================================
  // スタブ用のユーティリティ
  // ============================================================

  /**
   * TC-AT-N-04/05 で共通して必要な VS Code UI/保存周りの最小スタブをまとめる。
   * （テストの本質である QuickPick 分岐を読みやすくするため）
   */
  const createMinimalAnalysisUiStubs = (workspaceRoot: string): { restore: () => void } => {
    // saveAnalysisReport / outputChannel / openTextDocument / showTextDocument / showInformationMessage / withProgress を最小スタブ
    const originalSaveReport = testAnalyzerModule.saveAnalysisReport;
    const originalGetChannel = outputChannelModule.getTestGenOutputChannel;
    const originalOpenDoc = vscode.workspace.openTextDocument;
    const originalShowDoc = vscode.window.showTextDocument;
    const originalShowInfo = vscode.window.showInformationMessage;
    const originalWithProgress = vscode.window.withProgress;

    (testAnalyzerModule as unknown as { saveAnalysisReport: typeof testAnalyzerModule.saveAnalysisReport }).saveAnalysisReport =
      async () => ({
        absolutePath: path.join(workspaceRoot, 'docs/test-analysis-reports/test-analysis_mock.md'),
        relativePath: 'docs/test-analysis-reports/test-analysis_mock.md',
      });

    (outputChannelModule as unknown as { getTestGenOutputChannel: typeof outputChannelModule.getTestGenOutputChannel }).getTestGenOutputChannel =
      () => ({
        appendLine: () => { },
        append: () => { },
        clear: () => { },
        show: () => { },
        hide: () => { },
        dispose: () => { },
        name: 'Dontforgetest',
        replace: () => { },
      });

    (vscode.workspace as unknown as Record<string, unknown>).openTextDocument =
      async (uri: vscode.Uri) => ({ uri } as vscode.TextDocument);
    (vscode.window as unknown as { showTextDocument: typeof vscode.window.showTextDocument }).showTextDocument =
      async () => ({} as vscode.TextEditor);

    (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage =
      async () => undefined;

    (vscode.window as unknown as Record<string, unknown>).withProgress =
      async <T>(
        _options: vscode.ProgressOptions,
        task: (
          progress: vscode.Progress<{ message?: string; increment?: number }>,
          token: vscode.CancellationToken,
        ) => Thenable<T>,
      ): Promise<T> => {
        const dummyProgress: vscode.Progress<{ message?: string; increment?: number }> = { report: () => { } };
        const dummyToken: vscode.CancellationToken = {
          isCancellationRequested: false,
          onCancellationRequested: new vscode.EventEmitter<void>().event,
        };
        return await task(dummyProgress, dummyToken);
      };

    return {
      restore: () => {
        (testAnalyzerModule as unknown as { saveAnalysisReport: typeof originalSaveReport }).saveAnalysisReport = originalSaveReport;
        (outputChannelModule as unknown as { getTestGenOutputChannel: typeof originalGetChannel }).getTestGenOutputChannel = originalGetChannel;
        (vscode.workspace as unknown as Record<string, unknown>).openTextDocument = originalOpenDoc;
        (vscode.window as unknown as { showTextDocument: typeof originalShowDoc }).showTextDocument = originalShowDoc;
        (vscode.window as unknown as { showInformationMessage: typeof originalShowInfo }).showInformationMessage = originalShowInfo;
        (vscode.window as unknown as Record<string, unknown>).withProgress = originalWithProgress;
      },
    };
  };

  const setWorkspaceFolders = (folders: vscode.WorkspaceFolder[] | undefined): (() => void) => {
    const workspaceObj = vscode.workspace as unknown as { workspaceFolders?: vscode.WorkspaceFolder[] };
    const hadOwn = Object.prototype.hasOwnProperty.call(workspaceObj, 'workspaceFolders');
    const originalDesc = Object.getOwnPropertyDescriptor(workspaceObj, 'workspaceFolders');
    Object.defineProperty(workspaceObj, 'workspaceFolders', {
      configurable: true,
      get: () => folders,
    });
    return () => {
      if (hadOwn && originalDesc) {
        Object.defineProperty(workspaceObj, 'workspaceFolders', originalDesc);
        return;
      }
      delete workspaceObj.workspaceFolders;
    };
  };

  const setActiveTextEditor = (editor: vscode.TextEditor | undefined): (() => void) => {
    const windowObj = vscode.window as unknown as { activeTextEditor?: vscode.TextEditor };
    const hadOwn = Object.prototype.hasOwnProperty.call(windowObj, 'activeTextEditor');
    const originalDesc = Object.getOwnPropertyDescriptor(windowObj, 'activeTextEditor');
    Object.defineProperty(windowObj, 'activeTextEditor', {
      configurable: true,
      get: () => editor,
    });
    return () => {
      if (hadOwn && originalDesc) {
        Object.defineProperty(windowObj, 'activeTextEditor', originalDesc);
        return;
      }
      delete windowObj.activeTextEditor;
    };
  };

  // ============================================================
  // TC-AT-E-01: workspace 未オープン
  // ============================================================

  test('TC-AT-E-01: workspace 未オープンで showWarningMessage を呼び、早期 return する', async () => {
    // Given: workspaceFolders が undefined
    const restoreWorkspace = setWorkspaceFolders(undefined);

    // showWarningMessage をスタブ
    const originalShowWarning = vscode.window.showWarningMessage;
    let warningMessage: string | undefined;
    (vscode.window as unknown as { showWarningMessage: typeof vscode.window.showWarningMessage }).showWarningMessage =
      async (message: string): Promise<string | undefined> => {
        warningMessage = message;
        return undefined;
      };

    try {
      // When: analyzeTestsCommand を実行する
      await analyzeTestsCommand('all');

      // Then: showWarningMessage が呼ばれ、t('workspace.notOpen') メッセージが渡される
      assert.strictEqual(warningMessage, t('workspace.notOpen'));
    } finally {
      restoreWorkspace();
      (vscode.window as unknown as { showWarningMessage: typeof originalShowWarning }).showWarningMessage = originalShowWarning;
    }
  });

  test('TC-AT-E-02: workspaceFolders が空配列の場合も showWarningMessage を呼び、早期 return する', async () => {
    // Given: workspaceFolders が空配列
    const restoreWorkspace = setWorkspaceFolders([]);

    const originalShowWarning = vscode.window.showWarningMessage;
    let warningMessage: string | undefined;
    (vscode.window as unknown as { showWarningMessage: typeof vscode.window.showWarningMessage }).showWarningMessage =
      async (message: string): Promise<string | undefined> => {
        warningMessage = message;
        return undefined;
      };

    try {
      // When: analyzeTestsCommand を実行する
      await analyzeTestsCommand('all');

      // Then: showWarningMessage が呼ばれる
      assert.strictEqual(warningMessage, t('workspace.notOpen'));
    } finally {
      restoreWorkspace();
      (vscode.window as unknown as { showWarningMessage: typeof originalShowWarning }).showWarningMessage = originalShowWarning;
    }
  });

  // ============================================================
  // TC-AT-E-03: target 未指定 → QuickPick キャンセル
  // ============================================================

  test('TC-AT-E-03: target 未指定で QuickPick がキャンセルされた場合、何もせず早期 return する', async () => {
    // Given: workspace が有効
    const workspaceRoot = process.cwd();
    const restoreWorkspace = setWorkspaceFolders([
      { uri: vscode.Uri.file(workspaceRoot), name: 'test', index: 0 },
    ]);

    // showQuickPick が undefined を返す（ユーザーキャンセル）
    const originalShowQuickPick = vscode.window.showQuickPick;
    (vscode.window as unknown as Record<string, unknown>).showQuickPick =
      async (): Promise<vscode.QuickPickItem | undefined> => {
        return undefined;
      };

    // analyzeTestFiles / analyzeFile が呼ばれないことを確認
    const originalAnalyzeTestFiles = testAnalyzerModule.analyzeTestFiles;
    const originalAnalyzeFile = testAnalyzerModule.analyzeFile;
    let analyzeTestFilesCalled = false;
    let analyzeFileCalled = false;
    (testAnalyzerModule as unknown as { analyzeTestFiles: typeof testAnalyzerModule.analyzeTestFiles }).analyzeTestFiles =
      async () => {
        analyzeTestFilesCalled = true;
        return { analyzedFiles: 0, issues: [], summary: { missingGwt: 0, missingBoundary: 0, missingExceptionMessage: 0, weakAssertion: 0, unverifiedMock: 0, globalStateLeak: 0 }, pattern: '' };
      };
    (testAnalyzerModule as unknown as { analyzeFile: typeof testAnalyzerModule.analyzeFile }).analyzeFile =
      async () => {
        analyzeFileCalled = true;
        return { analyzedFiles: 0, issues: [], summary: { missingGwt: 0, missingBoundary: 0, missingExceptionMessage: 0, weakAssertion: 0, unverifiedMock: 0, globalStateLeak: 0 }, pattern: '' };
      };

    try {
      // When: target を指定せずに analyzeTestsCommand を実行する
      await analyzeTestsCommand();

      // Then: 分析関数は呼ばれない
      assert.strictEqual(analyzeTestFilesCalled, false);
      assert.strictEqual(analyzeFileCalled, false);
    } finally {
      restoreWorkspace();
      (vscode.window as unknown as Record<string, unknown>).showQuickPick = originalShowQuickPick;
      (testAnalyzerModule as unknown as { analyzeTestFiles: typeof originalAnalyzeTestFiles }).analyzeTestFiles = originalAnalyzeTestFiles;
      (testAnalyzerModule as unknown as { analyzeFile: typeof originalAnalyzeFile }).analyzeFile = originalAnalyzeFile;
    }
  });

  test('TC-AT-N-04: target 未指定で QuickPick が「全テスト」を選んだ場合、analyzeTestFiles が呼ばれる', async () => {
    // Given: workspace が有効
    const workspaceRoot = process.cwd();
    const restoreWorkspace = setWorkspaceFolders([
      { uri: vscode.Uri.file(workspaceRoot), name: 'test', index: 0 },
    ]);

    // Given: QuickPick が「全テスト」を返す
    const originalShowQuickPick = vscode.window.showQuickPick;
    (vscode.window as unknown as Record<string, unknown>).showQuickPick =
      async (): Promise<vscode.QuickPickItem | undefined> => {
        return { label: t('controlPanel.analysis.allTests'), description: '' };
      };

    // Given: analyzeTestFiles / analyzeFile をスタブ
    const originalAnalyzeTestFiles = testAnalyzerModule.analyzeTestFiles;
    const originalAnalyzeFile = testAnalyzerModule.analyzeFile;
    let analyzeTestFilesCalled = false;
    let analyzeFileCalled = false;
    (testAnalyzerModule as unknown as { analyzeTestFiles: typeof testAnalyzerModule.analyzeTestFiles }).analyzeTestFiles =
      async () => {
        analyzeTestFilesCalled = true;
        return { analyzedFiles: 0, issues: [], summary: { missingGwt: 0, missingBoundary: 0, missingExceptionMessage: 0, weakAssertion: 0, unverifiedMock: 0, globalStateLeak: 0 }, pattern: '' };
      };
    (testAnalyzerModule as unknown as { analyzeFile: typeof testAnalyzerModule.analyzeFile }).analyzeFile =
      async () => {
        analyzeFileCalled = true;
        return { analyzedFiles: 0, issues: [], summary: { missingGwt: 0, missingBoundary: 0, missingExceptionMessage: 0, weakAssertion: 0, unverifiedMock: 0, globalStateLeak: 0 }, pattern: '' };
      };

    const uiStubs = createMinimalAnalysisUiStubs(workspaceRoot);

    try {
      // When: target を指定せずに analyzeTestsCommand を実行する
      await analyzeTestsCommand();

      // Then: QuickPick の分岐により analyzeTestFiles が呼ばれる
      assert.strictEqual(analyzeTestFilesCalled, true);
      assert.strictEqual(analyzeFileCalled, false);
    } finally {
      restoreWorkspace();
      (vscode.window as unknown as Record<string, unknown>).showQuickPick = originalShowQuickPick;
      (testAnalyzerModule as unknown as { analyzeTestFiles: typeof originalAnalyzeTestFiles }).analyzeTestFiles = originalAnalyzeTestFiles;
      (testAnalyzerModule as unknown as { analyzeFile: typeof originalAnalyzeFile }).analyzeFile = originalAnalyzeFile;
      uiStubs.restore();
    }
  });

  test('TC-AT-N-05: target 未指定で QuickPick が「現在ファイル」を選んだ場合、analyzeFile が呼ばれる', async () => {
    // Given: workspace が有効
    const workspaceRoot = process.cwd();
    const restoreWorkspace = setWorkspaceFolders([
      { uri: vscode.Uri.file(workspaceRoot), name: 'test', index: 0 },
    ]);

    // Given: QuickPick が「現在ファイル」を返す
    const originalShowQuickPick = vscode.window.showQuickPick;
    (vscode.window as unknown as Record<string, unknown>).showQuickPick =
      async (): Promise<vscode.QuickPickItem | undefined> => {
        return { label: t('controlPanel.analysis.currentFile'), description: '' };
      };

    // Given: アクティブエディタが存在する
    const fakeFilePath = path.join(workspaceRoot, 'src', 'dummy.test.ts');
    const restoreEditor = setActiveTextEditor({
      document: { uri: vscode.Uri.file(fakeFilePath) } as vscode.TextDocument,
    } as vscode.TextEditor);

    // Given: analyzeTestFiles / analyzeFile をスタブ
    const originalAnalyzeTestFiles = testAnalyzerModule.analyzeTestFiles;
    const originalAnalyzeFile = testAnalyzerModule.analyzeFile;
    let analyzeTestFilesCalled = false;
    let analyzeFileCalled = false;
    let analyzedFilePath: string | undefined;
    (testAnalyzerModule as unknown as { analyzeTestFiles: typeof testAnalyzerModule.analyzeTestFiles }).analyzeTestFiles =
      async () => {
        analyzeTestFilesCalled = true;
        return { analyzedFiles: 0, issues: [], summary: { missingGwt: 0, missingBoundary: 0, missingExceptionMessage: 0, weakAssertion: 0, unverifiedMock: 0, globalStateLeak: 0 }, pattern: '' };
      };
    (testAnalyzerModule as unknown as { analyzeFile: typeof testAnalyzerModule.analyzeFile }).analyzeFile =
      async (filePath: string) => {
        analyzeFileCalled = true;
        analyzedFilePath = filePath;
        return { analyzedFiles: 1, issues: [], summary: { missingGwt: 0, missingBoundary: 0, missingExceptionMessage: 0, weakAssertion: 0, unverifiedMock: 0, globalStateLeak: 0 }, pattern: '' };
      };

    const uiStubs = createMinimalAnalysisUiStubs(workspaceRoot);

    try {
      // When: target を指定せずに analyzeTestsCommand を実行する
      await analyzeTestsCommand();

      // Then: QuickPick の分岐により analyzeFile が呼ばれる
      assert.strictEqual(analyzeTestFilesCalled, false);
      assert.strictEqual(analyzeFileCalled, true);
      assert.strictEqual(analyzedFilePath, fakeFilePath);
    } finally {
      restoreEditor();
      restoreWorkspace();
      (vscode.window as unknown as Record<string, unknown>).showQuickPick = originalShowQuickPick;
      (testAnalyzerModule as unknown as { analyzeTestFiles: typeof originalAnalyzeTestFiles }).analyzeTestFiles = originalAnalyzeTestFiles;
      (testAnalyzerModule as unknown as { analyzeFile: typeof originalAnalyzeFile }).analyzeFile = originalAnalyzeFile;
      uiStubs.restore();
    }
  });

  // ============================================================
  // TC-AT-N-01: target=all で analyzeTestFiles が呼ばれる
  // ============================================================

  test('TC-AT-N-01: target=all で analyzeTestFiles が呼ばれ、レポート保存・通知が行われる', async () => {
    // Given: workspace が有効
    const workspaceRoot = process.cwd();
    const restoreWorkspace = setWorkspaceFolders([
      { uri: vscode.Uri.file(workspaceRoot), name: 'test', index: 0 },
    ]);

    // analyzeTestFiles をスタブ
    const originalAnalyzeTestFiles = testAnalyzerModule.analyzeTestFiles;
    let analyzeTestFilesCalled = false;
    let passedPattern: string | undefined;
    (testAnalyzerModule as unknown as { analyzeTestFiles: typeof testAnalyzerModule.analyzeTestFiles }).analyzeTestFiles =
      async (_workspaceRoot: string, pattern: string) => {
        analyzeTestFilesCalled = true;
        passedPattern = pattern;
        return {
          analyzedFiles: 5,
          issues: [
            { type: 'missing-gwt' as const, file: 'test.test.ts', line: 10, detail: 'test case' },
          ],
          summary: { missingGwt: 1, missingBoundary: 0, missingExceptionMessage: 0, weakAssertion: 0, unverifiedMock: 0, globalStateLeak: 0 },
          pattern,
        };
      };

    // saveAnalysisReport をスタブ
    const originalSaveReport = testAnalyzerModule.saveAnalysisReport;
    let saveReportCalled = false;
    const mockRelativePath = 'docs/test-analysis-reports/test-analysis_mock.md';
    const mockAbsolutePath = path.join(workspaceRoot, mockRelativePath);
    (testAnalyzerModule as unknown as { saveAnalysisReport: typeof testAnalyzerModule.saveAnalysisReport }).saveAnalysisReport =
      async () => {
        saveReportCalled = true;
        return { absolutePath: mockAbsolutePath, relativePath: mockRelativePath };
      };

    // outputChannel をスタブ
    const originalGetChannel = outputChannelModule.getTestGenOutputChannel;
    let loggedMessage: string | undefined;
    (outputChannelModule as unknown as { getTestGenOutputChannel: typeof outputChannelModule.getTestGenOutputChannel }).getTestGenOutputChannel =
      () => ({
        appendLine: (msg: string) => { loggedMessage = msg; },
        append: () => { },
        clear: () => { },
        show: () => { },
        hide: () => { },
        dispose: () => { },
        name: 'Dontforgetest',
        replace: () => { },
      });

    // openTextDocument / showTextDocument をスタブ
    const originalOpenDoc = vscode.workspace.openTextDocument;
    const originalShowDoc = vscode.window.showTextDocument;
    let openedUri: vscode.Uri | undefined;
    let showDocCalled = false;
    (vscode.workspace as unknown as Record<string, unknown>).openTextDocument =
      async (uri: vscode.Uri) => {
        openedUri = uri;
        return { uri } as vscode.TextDocument;
      };
    (vscode.window as unknown as { showTextDocument: typeof vscode.window.showTextDocument }).showTextDocument =
      async () => {
        showDocCalled = true;
        return {} as vscode.TextEditor;
      };

    // showInformationMessage をスタブ
    const originalShowInfo = vscode.window.showInformationMessage;
    let infoMessage: string | undefined;
    (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage =
      async (message: string): Promise<string | undefined> => {
        infoMessage = message;
        return undefined;
      };

    // withProgress をスタブ（コールバックを即実行）
    const originalWithProgress = vscode.window.withProgress;
    (vscode.window as unknown as Record<string, unknown>).withProgress =
      async <T>(
        _options: vscode.ProgressOptions,
        task: (
          progress: vscode.Progress<{ message?: string; increment?: number }>,
          token: vscode.CancellationToken,
        ) => Thenable<T>,
      ): Promise<T> => {
        const dummyProgress: vscode.Progress<{ message?: string; increment?: number }> = {
          report: () => { },
        };
        const dummyToken: vscode.CancellationToken = {
          isCancellationRequested: false,
          onCancellationRequested: new vscode.EventEmitter<void>().event,
        };
        return await task(dummyProgress, dummyToken);
      };

    try {
      // When: target='all' で analyzeTestsCommand を実行する
      await analyzeTestsCommand('all');

      // Then: analyzeTestFiles が呼ばれる
      assert.strictEqual(analyzeTestFilesCalled, true);
      assert.ok(passedPattern, 'Pattern should be passed to analyzeTestFiles');

      // Then: saveAnalysisReport が呼ばれる
      assert.strictEqual(saveReportCalled, true);

      // Then: ログが出力される
      assert.ok(loggedMessage?.includes('[Analysis]'), 'Log should contain [Analysis]');

      // Then: レポートが開かれる
      assert.ok(openedUri, 'openTextDocument should be called');
      assert.strictEqual(showDocCalled, true);

      // Then: issues があるので t('analysis.reportSaved', relativePath) が通知される
      assert.strictEqual(infoMessage, t('analysis.reportSaved', mockRelativePath));
    } finally {
      restoreWorkspace();
      (testAnalyzerModule as unknown as { analyzeTestFiles: typeof originalAnalyzeTestFiles }).analyzeTestFiles = originalAnalyzeTestFiles;
      (testAnalyzerModule as unknown as { saveAnalysisReport: typeof originalSaveReport }).saveAnalysisReport = originalSaveReport;
      (outputChannelModule as unknown as { getTestGenOutputChannel: typeof originalGetChannel }).getTestGenOutputChannel = originalGetChannel;
      (vscode.workspace as unknown as Record<string, unknown>).openTextDocument = originalOpenDoc;
      (vscode.window as unknown as { showTextDocument: typeof originalShowDoc }).showTextDocument = originalShowDoc;
      (vscode.window as unknown as { showInformationMessage: typeof originalShowInfo }).showInformationMessage = originalShowInfo;
      (vscode.window as unknown as Record<string, unknown>).withProgress = originalWithProgress;
    }
  });

  // ============================================================
  // TC-AT-N-02: target=current + activeEditor あり
  // ============================================================

  test('TC-AT-N-02: target=current で activeEditor があれば analyzeFile が呼ばれる', async () => {
    // Given: workspace が有効
    const workspaceRoot = process.cwd();
    const restoreWorkspace = setWorkspaceFolders([
      { uri: vscode.Uri.file(workspaceRoot), name: 'test', index: 0 },
    ]);

    // activeTextEditor をスタブ
    const mockFilePath = path.join(workspaceRoot, 'src/test/suite/example.test.ts');
    const mockEditor = {
      document: {
        uri: vscode.Uri.file(mockFilePath),
        fsPath: mockFilePath,
      },
    } as unknown as vscode.TextEditor;
    const restoreEditor = setActiveTextEditor(mockEditor);

    // analyzeFile をスタブ
    const originalAnalyzeFile = testAnalyzerModule.analyzeFile;
    let analyzeFileCalled = false;
    let passedFilePath: string | undefined;
    (testAnalyzerModule as unknown as { analyzeFile: typeof testAnalyzerModule.analyzeFile }).analyzeFile =
      async (filePath: string) => {
        analyzeFileCalled = true;
        passedFilePath = filePath;
        return {
          analyzedFiles: 1,
          issues: [],
          summary: { missingGwt: 0, missingBoundary: 0, missingExceptionMessage: 0, weakAssertion: 0, unverifiedMock: 0, globalStateLeak: 0 },
          pattern: filePath,
        };
      };

    // saveAnalysisReport をスタブ
    const originalSaveReport = testAnalyzerModule.saveAnalysisReport;
    const mockRelativePath = 'docs/test-analysis-reports/test-analysis_mock.md';
    const mockAbsolutePath = path.join(workspaceRoot, mockRelativePath);
    (testAnalyzerModule as unknown as { saveAnalysisReport: typeof testAnalyzerModule.saveAnalysisReport }).saveAnalysisReport =
      async () => {
        return { absolutePath: mockAbsolutePath, relativePath: mockRelativePath };
      };

    // outputChannel をスタブ
    const originalGetChannel = outputChannelModule.getTestGenOutputChannel;
    (outputChannelModule as unknown as { getTestGenOutputChannel: typeof outputChannelModule.getTestGenOutputChannel }).getTestGenOutputChannel =
      () => ({
        appendLine: () => { },
        append: () => { },
        clear: () => { },
        show: () => { },
        hide: () => { },
        dispose: () => { },
        name: 'Dontforgetest',
        replace: () => { },
      });

    // openTextDocument / showTextDocument をスタブ
    const originalOpenDoc = vscode.workspace.openTextDocument;
    const originalShowDoc = vscode.window.showTextDocument;
    (vscode.workspace as unknown as Record<string, unknown>).openTextDocument =
      async (uri: vscode.Uri) => {
        return { uri } as vscode.TextDocument;
      };
    (vscode.window as unknown as { showTextDocument: typeof vscode.window.showTextDocument }).showTextDocument =
      async () => {
        return {} as vscode.TextEditor;
      };

    // showInformationMessage をスタブ
    const originalShowInfo = vscode.window.showInformationMessage;
    let infoMessage: string | undefined;
    (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage =
      async (message: string): Promise<string | undefined> => {
        infoMessage = message;
        return undefined;
      };

    // withProgress をスタブ
    const originalWithProgress = vscode.window.withProgress;
    (vscode.window as unknown as Record<string, unknown>).withProgress =
      async <T>(
        _options: vscode.ProgressOptions,
        task: (
          progress: vscode.Progress<{ message?: string; increment?: number }>,
          token: vscode.CancellationToken,
        ) => Thenable<T>,
      ): Promise<T> => {
        const dummyProgress: vscode.Progress<{ message?: string; increment?: number }> = {
          report: () => { },
        };
        const dummyToken: vscode.CancellationToken = {
          isCancellationRequested: false,
          onCancellationRequested: new vscode.EventEmitter<void>().event,
        };
        return await task(dummyProgress, dummyToken);
      };

    try {
      // When: target='current' で analyzeTestsCommand を実行する
      await analyzeTestsCommand('current');

      // Then: analyzeFile が呼ばれる
      assert.strictEqual(analyzeFileCalled, true);
      assert.strictEqual(passedFilePath, mockFilePath);

      // Then: issues=0 なので t('analysis.noIssues') が通知される
      assert.strictEqual(infoMessage, t('analysis.noIssues'));
    } finally {
      restoreWorkspace();
      restoreEditor();
      (testAnalyzerModule as unknown as { analyzeFile: typeof originalAnalyzeFile }).analyzeFile = originalAnalyzeFile;
      (testAnalyzerModule as unknown as { saveAnalysisReport: typeof originalSaveReport }).saveAnalysisReport = originalSaveReport;
      (outputChannelModule as unknown as { getTestGenOutputChannel: typeof originalGetChannel }).getTestGenOutputChannel = originalGetChannel;
      (vscode.workspace as unknown as Record<string, unknown>).openTextDocument = originalOpenDoc;
      (vscode.window as unknown as { showTextDocument: typeof originalShowDoc }).showTextDocument = originalShowDoc;
      (vscode.window as unknown as { showInformationMessage: typeof originalShowInfo }).showInformationMessage = originalShowInfo;
      (vscode.window as unknown as Record<string, unknown>).withProgress = originalWithProgress;
    }
  });

  // ============================================================
  // TC-AT-E-04: target=current + activeEditor なし
  // ============================================================

  test('TC-AT-E-04: target=current で activeEditor がなければ showWarningMessage を呼び、早期 return する', async () => {
    // Given: workspace が有効
    const workspaceRoot = process.cwd();
    const restoreWorkspace = setWorkspaceFolders([
      { uri: vscode.Uri.file(workspaceRoot), name: 'test', index: 0 },
    ]);

    // activeTextEditor を undefined に設定
    const restoreEditor = setActiveTextEditor(undefined);

    // showWarningMessage をスタブ
    const originalShowWarning = vscode.window.showWarningMessage;
    let warningMessage: string | undefined;
    (vscode.window as unknown as { showWarningMessage: typeof vscode.window.showWarningMessage }).showWarningMessage =
      async (message: string): Promise<string | undefined> => {
        warningMessage = message;
        return undefined;
      };

    // saveAnalysisReport が呼ばれないことを確認
    const originalSaveReport = testAnalyzerModule.saveAnalysisReport;
    let saveReportCalled = false;
    (testAnalyzerModule as unknown as { saveAnalysisReport: typeof testAnalyzerModule.saveAnalysisReport }).saveAnalysisReport =
      async () => {
        saveReportCalled = true;
        return { absolutePath: '', relativePath: '' };
      };

    // withProgress をスタブ（コールバックを即実行）
    const originalWithProgress = vscode.window.withProgress;
    (vscode.window as unknown as Record<string, unknown>).withProgress =
      async <T>(
        _options: vscode.ProgressOptions,
        task: (
          progress: vscode.Progress<{ message?: string; increment?: number }>,
          token: vscode.CancellationToken,
        ) => Thenable<T>,
      ): Promise<T> => {
        const dummyProgress: vscode.Progress<{ message?: string; increment?: number }> = {
          report: () => { },
        };
        const dummyToken: vscode.CancellationToken = {
          isCancellationRequested: false,
          onCancellationRequested: new vscode.EventEmitter<void>().event,
        };
        return await task(dummyProgress, dummyToken);
      };

    try {
      // When: target='current' で analyzeTestsCommand を実行する
      await analyzeTestsCommand('current');

      // Then: showWarningMessage が呼ばれ、t('analysis.noActiveEditor') メッセージが渡される
      assert.strictEqual(warningMessage, t('analysis.noActiveEditor'));

      // Then: saveAnalysisReport は呼ばれない
      assert.strictEqual(saveReportCalled, false);
    } finally {
      restoreWorkspace();
      restoreEditor();
      (vscode.window as unknown as { showWarningMessage: typeof originalShowWarning }).showWarningMessage = originalShowWarning;
      (testAnalyzerModule as unknown as { saveAnalysisReport: typeof originalSaveReport }).saveAnalysisReport = originalSaveReport;
      (vscode.window as unknown as Record<string, unknown>).withProgress = originalWithProgress;
    }
  });

  // ============================================================
  // TC-AT-N-03: issues=0 の場合 t('analysis.noIssues') が通知される
  // ============================================================

  test('TC-AT-N-03: issues=0 の場合 t(analysis.noIssues) が通知される', async () => {
    // Given: workspace が有効
    const workspaceRoot = process.cwd();
    const restoreWorkspace = setWorkspaceFolders([
      { uri: vscode.Uri.file(workspaceRoot), name: 'test', index: 0 },
    ]);

    // analyzeTestFiles をスタブ（issues=0）
    const originalAnalyzeTestFiles = testAnalyzerModule.analyzeTestFiles;
    (testAnalyzerModule as unknown as { analyzeTestFiles: typeof testAnalyzerModule.analyzeTestFiles }).analyzeTestFiles =
      async (_workspaceRoot: string, pattern: string) => {
        return {
          analyzedFiles: 5,
          issues: [],
          summary: { missingGwt: 0, missingBoundary: 0, missingExceptionMessage: 0, weakAssertion: 0, unverifiedMock: 0, globalStateLeak: 0 },
          pattern,
        };
      };

    // saveAnalysisReport をスタブ
    const originalSaveReport = testAnalyzerModule.saveAnalysisReport;
    const mockRelativePath = 'docs/test-analysis-reports/test-analysis_mock.md';
    const mockAbsolutePath = path.join(workspaceRoot, mockRelativePath);
    (testAnalyzerModule as unknown as { saveAnalysisReport: typeof testAnalyzerModule.saveAnalysisReport }).saveAnalysisReport =
      async () => {
        return { absolutePath: mockAbsolutePath, relativePath: mockRelativePath };
      };

    // outputChannel をスタブ
    const originalGetChannel = outputChannelModule.getTestGenOutputChannel;
    (outputChannelModule as unknown as { getTestGenOutputChannel: typeof outputChannelModule.getTestGenOutputChannel }).getTestGenOutputChannel =
      () => ({
        appendLine: () => { },
        append: () => { },
        clear: () => { },
        show: () => { },
        hide: () => { },
        dispose: () => { },
        name: 'Dontforgetest',
        replace: () => { },
      });

    // openTextDocument / showTextDocument をスタブ
    const originalOpenDoc = vscode.workspace.openTextDocument;
    const originalShowDoc = vscode.window.showTextDocument;
    (vscode.workspace as unknown as Record<string, unknown>).openTextDocument =
      async (uri: vscode.Uri) => {
        return { uri } as vscode.TextDocument;
      };
    (vscode.window as unknown as { showTextDocument: typeof vscode.window.showTextDocument }).showTextDocument =
      async () => {
        return {} as vscode.TextEditor;
      };

    // showInformationMessage をスタブ
    const originalShowInfo = vscode.window.showInformationMessage;
    let infoMessage: string | undefined;
    (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage =
      async (message: string): Promise<string | undefined> => {
        infoMessage = message;
        return undefined;
      };

    // withProgress をスタブ
    const originalWithProgress = vscode.window.withProgress;
    (vscode.window as unknown as Record<string, unknown>).withProgress =
      async <T>(
        _options: vscode.ProgressOptions,
        task: (
          progress: vscode.Progress<{ message?: string; increment?: number }>,
          token: vscode.CancellationToken,
        ) => Thenable<T>,
      ): Promise<T> => {
        const dummyProgress: vscode.Progress<{ message?: string; increment?: number }> = {
          report: () => { },
        };
        const dummyToken: vscode.CancellationToken = {
          isCancellationRequested: false,
          onCancellationRequested: new vscode.EventEmitter<void>().event,
        };
        return await task(dummyProgress, dummyToken);
      };

    try {
      // When: target='all' で analyzeTestsCommand を実行する
      await analyzeTestsCommand('all');

      // Then: issues=0 なので t('analysis.noIssues') が通知される
      assert.strictEqual(infoMessage, t('analysis.noIssues'));
    } finally {
      restoreWorkspace();
      (testAnalyzerModule as unknown as { analyzeTestFiles: typeof originalAnalyzeTestFiles }).analyzeTestFiles = originalAnalyzeTestFiles;
      (testAnalyzerModule as unknown as { saveAnalysisReport: typeof originalSaveReport }).saveAnalysisReport = originalSaveReport;
      (outputChannelModule as unknown as { getTestGenOutputChannel: typeof originalGetChannel }).getTestGenOutputChannel = originalGetChannel;
      (vscode.workspace as unknown as Record<string, unknown>).openTextDocument = originalOpenDoc;
      (vscode.window as unknown as { showTextDocument: typeof originalShowDoc }).showTextDocument = originalShowDoc;
      (vscode.window as unknown as { showInformationMessage: typeof originalShowInfo }).showInformationMessage = originalShowInfo;
      (vscode.window as unknown as Record<string, unknown>).withProgress = originalWithProgress;
    }
  });
});
