import * as assert from 'assert';
import * as vscode from 'vscode';
import { generateTestFromCommitRange } from '../../../commands/generateFromCommitRange';
import * as preflightModule from '../../../core/preflight';
import * as promptBuilderModule from '../../../core/promptBuilder';
import * as diffAnalyzerModule from '../../../git/diffAnalyzer';
import * as runWithArtifactsModule from '../../../commands/runWithArtifacts';
import { createMockExtensionContext } from '../testUtils/vscodeMocks';
import { MockGenerateProvider } from '../testUtils/mockProviders';

suite('commands/generateFromCommitRange.ts', () => {
  // Test Perspectives Table for generateTestFromCommitRange (deterministic branch coverage)
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-GCR-E-01 | showInputBox returns undefined | Boundary – null | ensurePreflight not called; runWithArtifacts not called | 0/min/max/±1 not applicable |
  // | TC-GCR-E-02 | ensurePreflight returns undefined | Error – preflight failure | getCommitRangeDiff not called; runWithArtifacts not called | - |
  // | TC-GCR-E-03 | getCommitRangeDiff throws | Error – git fetch failure | showErrorMessage called once; runWithArtifacts not called | - |
  // | TC-GCR-E-04 | diffText is empty | Boundary – empty | showInformationMessage called; runWithArtifacts not called | - |
  // | TC-GCR-E-05 | runLocation=worktree and extensionContext is undefined | Error – invalid options | showErrorMessage called; runWithArtifacts not called | - |
  // | TC-GCR-N-01 | valid range with local runLocation | Equivalence – normal | runWithArtifacts called; range is trimmed in diff fetch | - |
  // | TC-GCR-N-02 | valid range with worktree runLocation and extensionContext | Equivalence – normal | runWithArtifacts called with runLocation=worktree and extensionContext | - |
  suite('generateTestFromCommitRange deterministic coverage', () => {
    let originalShowInputBox: typeof vscode.window.showInputBox;
    let originalShowErrorMessage: typeof vscode.window.showErrorMessage;
    let originalShowInformationMessage: typeof vscode.window.showInformationMessage;
    let originalEnsurePreflight: typeof preflightModule.ensurePreflight;
    let originalGetCommitRangeDiff: typeof diffAnalyzerModule.getCommitRangeDiff;
    let originalAnalyzeGitUnifiedDiff: typeof diffAnalyzerModule.analyzeGitUnifiedDiff;
    let originalExtractChangedPaths: typeof diffAnalyzerModule.extractChangedPaths;
    let originalBuildTestGenPrompt: typeof promptBuilderModule.buildTestGenPrompt;
    let originalRunWithArtifacts: typeof runWithArtifactsModule.runWithArtifacts;

    let showInputBoxResult: string | undefined;
    let showErrorMessages: string[] = [];
    let showInfoMessages: string[] = [];
    let runWithArtifactsCalls: Array<Parameters<typeof runWithArtifactsModule.runWithArtifacts>[0]> = [];
    let preflightResult: preflightModule.PreflightOk | undefined;
    let lastRange: string | undefined;

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const provider = new MockGenerateProvider();

    setup(() => {
      showInputBoxResult = undefined;
      showErrorMessages = [];
      showInfoMessages = [];
      runWithArtifactsCalls = [];
      lastRange = undefined;
      preflightResult = {
        workspaceRoot,
        defaultModel: `model-${Date.now()}`,
        testStrategyPath: '',
        cursorAgentCommand: 'cursor-agent',
      };

      originalShowInputBox = vscode.window.showInputBox;
      originalShowErrorMessage = vscode.window.showErrorMessage;
      originalShowInformationMessage = vscode.window.showInformationMessage;
      originalEnsurePreflight = preflightModule.ensurePreflight;
      originalGetCommitRangeDiff = diffAnalyzerModule.getCommitRangeDiff;
      originalAnalyzeGitUnifiedDiff = diffAnalyzerModule.analyzeGitUnifiedDiff;
      originalExtractChangedPaths = diffAnalyzerModule.extractChangedPaths;
      originalBuildTestGenPrompt = promptBuilderModule.buildTestGenPrompt;
      originalRunWithArtifacts = runWithArtifactsModule.runWithArtifacts;

      (vscode.window as unknown as { showInputBox: typeof vscode.window.showInputBox }).showInputBox = async () => showInputBoxResult;
      (vscode.window as unknown as { showErrorMessage: typeof vscode.window.showErrorMessage }).showErrorMessage = async (message: string) => {
        showErrorMessages.push(message);
        return undefined;
      };
      (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = async (
        message: string,
      ) => {
        showInfoMessages.push(message);
        return undefined;
      };
      (preflightModule as unknown as { ensurePreflight: typeof preflightModule.ensurePreflight }).ensurePreflight = async () => preflightResult;
      (diffAnalyzerModule as unknown as { getCommitRangeDiff: typeof diffAnalyzerModule.getCommitRangeDiff }).getCommitRangeDiff = async (
        _cwd,
        range,
      ) => {
        lastRange = range;
        return 'diff content';
      };
      (diffAnalyzerModule as unknown as { analyzeGitUnifiedDiff: typeof diffAnalyzerModule.analyzeGitUnifiedDiff }).analyzeGitUnifiedDiff = () => {
        return { files: [] };
      };
      (diffAnalyzerModule as unknown as { extractChangedPaths: typeof diffAnalyzerModule.extractChangedPaths }).extractChangedPaths = () => {
        return ['src/app.test.ts'];
      };
      (promptBuilderModule as unknown as { buildTestGenPrompt: typeof promptBuilderModule.buildTestGenPrompt }).buildTestGenPrompt = async () => {
        return {
          prompt: 'TEST_PROMPT',
          languages: {
            answerLanguage: 'en',
            commentLanguage: 'en',
            perspectiveTableLanguage: 'en',
          },
        };
      };
      (runWithArtifactsModule as unknown as { runWithArtifacts: typeof runWithArtifactsModule.runWithArtifacts }).runWithArtifacts = async (
        input,
      ) => {
        runWithArtifactsCalls.push(input);
      };
    });

    teardown(() => {
      (vscode.window as unknown as { showInputBox: typeof originalShowInputBox }).showInputBox = originalShowInputBox;
      (vscode.window as unknown as { showErrorMessage: typeof originalShowErrorMessage }).showErrorMessage = originalShowErrorMessage;
      (vscode.window as unknown as { showInformationMessage: typeof originalShowInformationMessage }).showInformationMessage =
        originalShowInformationMessage;
      (preflightModule as unknown as { ensurePreflight: typeof originalEnsurePreflight }).ensurePreflight = originalEnsurePreflight;
      (diffAnalyzerModule as unknown as { getCommitRangeDiff: typeof originalGetCommitRangeDiff }).getCommitRangeDiff =
        originalGetCommitRangeDiff;
      (diffAnalyzerModule as unknown as { analyzeGitUnifiedDiff: typeof originalAnalyzeGitUnifiedDiff }).analyzeGitUnifiedDiff =
        originalAnalyzeGitUnifiedDiff;
      (diffAnalyzerModule as unknown as { extractChangedPaths: typeof originalExtractChangedPaths }).extractChangedPaths =
        originalExtractChangedPaths;
      (promptBuilderModule as unknown as { buildTestGenPrompt: typeof originalBuildTestGenPrompt }).buildTestGenPrompt =
        originalBuildTestGenPrompt;
      (runWithArtifactsModule as unknown as { runWithArtifacts: typeof originalRunWithArtifacts }).runWithArtifacts = originalRunWithArtifacts;
    });

    test('TC-GCR-E-01: input canceled returns early', async () => {
      // Given: 入力ボックスがキャンセルされる
      showInputBoxResult = undefined;

      // When: generateTestFromCommitRange を呼び出す
      await generateTestFromCommitRange(provider, undefined, { runLocation: 'local' });

      // Then: preflight も runWithArtifacts も呼ばれない
      assert.strictEqual(runWithArtifactsCalls.length, 0);
      assert.strictEqual(lastRange, undefined);
    });

    test('TC-GCR-E-02: preflight failure returns early', async () => {
      // Given: 入力はあるが preflight が失敗する
      showInputBoxResult = 'HEAD~1..HEAD';
      preflightResult = undefined;

      // When: generateTestFromCommitRange を呼び出す
      await generateTestFromCommitRange(provider, undefined, { runLocation: 'local' });

      // Then: diff 取得も runWithArtifacts も呼ばれない
      assert.strictEqual(runWithArtifactsCalls.length, 0);
      assert.strictEqual(lastRange, undefined);
    });

    test('TC-GCR-E-03: diff fetch error shows error message', async () => {
      // Given: diff 取得が例外を投げる
      showInputBoxResult = 'HEAD~1..HEAD';
      (diffAnalyzerModule as unknown as { getCommitRangeDiff: typeof diffAnalyzerModule.getCommitRangeDiff }).getCommitRangeDiff = async () => {
        throw new Error('diff-failed');
      };

      // When: generateTestFromCommitRange を呼び出す
      await generateTestFromCommitRange(provider, undefined, { runLocation: 'local' });

      // Then: エラーメッセージが表示され、runWithArtifacts は呼ばれない
      assert.strictEqual(showErrorMessages.length, 1);
      assert.ok(showErrorMessages[0]?.length > 0, 'エラーメッセージは空でない');
      assert.strictEqual(runWithArtifactsCalls.length, 0);
    });

    test('TC-GCR-E-04: empty diff shows information message', async () => {
      // Given: diffText が空
      showInputBoxResult = 'HEAD~1..HEAD';
      (diffAnalyzerModule as unknown as { getCommitRangeDiff: typeof diffAnalyzerModule.getCommitRangeDiff }).getCommitRangeDiff = async () => {
        lastRange = 'HEAD~1..HEAD';
        return '   ';
      };

      // When: generateTestFromCommitRange を呼び出す
      await generateTestFromCommitRange(provider, undefined, { runLocation: 'local' });

      // Then: 情報メッセージが表示され、runWithArtifacts は呼ばれない
      assert.strictEqual(showInfoMessages.length, 1);
      assert.ok(showInfoMessages[0]?.length > 0, '情報メッセージは空でない');
      assert.strictEqual(runWithArtifactsCalls.length, 0);
    });

    test('TC-GCR-E-05: worktree without extensionContext shows error', async () => {
      // Given: worktree 実行だが extensionContext が無い
      showInputBoxResult = 'HEAD~1..HEAD';

      // When: generateTestFromCommitRange を呼び出す
      await generateTestFromCommitRange(provider, undefined, { runLocation: 'worktree', extensionContext: undefined });

      // Then: エラーメッセージが表示され、runWithArtifacts は呼ばれない
      assert.strictEqual(showErrorMessages.length, 1);
      assert.ok(showErrorMessages[0]?.length > 0, 'エラーメッセージは空でない');
      assert.strictEqual(runWithArtifactsCalls.length, 0);
    });

    test('TC-GCR-N-01: local mode trims range and calls runWithArtifacts', async () => {
      // Given: 入力レンジが前後空白を含む
      const rawRange = '  HEAD~2..HEAD  ';
      showInputBoxResult = rawRange;

      // When: generateTestFromCommitRange を呼び出す
      await generateTestFromCommitRange(provider, undefined, { runLocation: 'local' });

      // Then: runWithArtifacts が呼ばれ、レンジはトリムされる
      assert.strictEqual(lastRange, 'HEAD~2..HEAD');
      assert.strictEqual(runWithArtifactsCalls.length, 1);
      const call = runWithArtifactsCalls[0];
      assert.strictEqual(call.workspaceRoot, workspaceRoot);
      assert.strictEqual(call.runLocation, 'local');
      assert.deepStrictEqual(call.targetPaths, ['src/app.test.ts']);
      assert.ok(call.generationTaskId.startsWith('fromCommitRange-'), 'generationTaskId に prefix が付く');
      assert.ok(call.generationPrompt.includes('TEST_PROMPT'), 'プロンプトが含まれる');
      assert.ok(call.generationPrompt.includes('diff content'), '差分テキストが含まれる');
    });

    test('TC-GCR-N-02: worktree mode calls runWithArtifacts with extensionContext', async () => {
      // Given: worktree 実行で extensionContext がある
      showInputBoxResult = 'HEAD~1..HEAD';
      const extensionContext = createMockExtensionContext({ workspaceRoot });

      // When: generateTestFromCommitRange を呼び出す
      await generateTestFromCommitRange(provider, undefined, { runLocation: 'worktree', extensionContext });

      // Then: runWithArtifacts が worktree モードで呼ばれる
      assert.strictEqual(runWithArtifactsCalls.length, 1);
      const call = runWithArtifactsCalls[0];
      assert.strictEqual(call.runLocation, 'worktree');
      assert.strictEqual(call.extensionContext, extensionContext);
      assert.strictEqual(call.model, preflightResult?.defaultModel);
    });
  });
});
