import * as assert from 'assert';
import * as vscode from 'vscode';
import { generateTestFromLatestCommit } from '../../../commands/generateFromCommit';
import * as preflightModule from '../../../core/preflight';
import * as promptBuilderModule from '../../../core/promptBuilder';
import * as gitExecModule from '../../../git/gitExec';
import * as runWithArtifactsModule from '../../../commands/runWithArtifacts';
import { createMockExtensionContext } from '../testUtils/vscodeMocks';
import { MockGenerateProvider } from '../testUtils/mockProviders';

suite('commands/generateFromCommit.ts', () => {
  // Test Perspectives Table for generateTestFromLatestCommit (deterministic branch coverage)
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-GC-E-01 | ensurePreflight returns undefined | Error – preflight failure | git/runner functions are not called; no runWithArtifacts call | 0/min/max/±1 not applicable |
  // | TC-GC-E-02 | HEAD commit hash cannot be resolved | Error – missing data | showErrorMessage called once; runWithArtifacts not called | Message content varies by locale |
  // | TC-GC-E-03 | changedFiles is empty | Boundary – empty | showInformationMessage called once with short commit; runWithArtifacts not called | - |
  // | TC-GC-E-04 | runLocation=worktree and extensionContext is undefined | Error – invalid options | showErrorMessage called; runWithArtifacts not called | - |
  // | TC-GC-N-01 | runLocation=local with valid commit/diff | Equivalence – normal | runWithArtifacts called with targetPaths and model override | - |
  // | TC-GC-N-02 | runLocation=worktree with extensionContext | Equivalence – normal | runWithArtifacts called with runLocation=worktree | - |
  suite('generateTestFromLatestCommit deterministic coverage', () => {
    let originalEnsurePreflight: typeof preflightModule.ensurePreflight;
    let originalExecGitStdout: typeof gitExecModule.execGitStdout;
    let originalBuildTestGenPrompt: typeof promptBuilderModule.buildTestGenPrompt;
    let originalRunWithArtifacts: typeof runWithArtifactsModule.runWithArtifacts;
    let originalShowErrorMessage: typeof vscode.window.showErrorMessage;
    let originalShowInformationMessage: typeof vscode.window.showInformationMessage;

    let execGitStdoutResponses = new Map<string, string | Error>();
    let execGitStdoutCalls: Array<{ cwd: string; args: string[] }> = [];
    let runWithArtifactsCalls: Array<Parameters<typeof runWithArtifactsModule.runWithArtifacts>[0]> = [];
    let showErrorMessages: string[] = [];
    let showInfoMessages: string[] = [];
    let buildPromptInputs: Array<Parameters<typeof promptBuilderModule.buildTestGenPrompt>[0]> = [];
    let preflightResult: preflightModule.PreflightOk | undefined;

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const provider = new MockGenerateProvider();
    const extensionContext = createMockExtensionContext({ workspaceRoot });

    setup(() => {
      execGitStdoutResponses = new Map<string, string | Error>();
      execGitStdoutCalls = [];
      runWithArtifactsCalls = [];
      showErrorMessages = [];
      showInfoMessages = [];
      buildPromptInputs = [];
      preflightResult = {
        workspaceRoot,
        defaultModel: `model-${Date.now()}`,
        testStrategyPath: '',
        agentProviderId: 'cursorAgent',
        agentCommand: 'cursor-agent',
        cursorAgentCommand: 'cursor-agent',
      };

      originalEnsurePreflight = preflightModule.ensurePreflight;
      originalExecGitStdout = gitExecModule.execGitStdout;
      originalBuildTestGenPrompt = promptBuilderModule.buildTestGenPrompt;
      originalRunWithArtifacts = runWithArtifactsModule.runWithArtifacts;
      originalShowErrorMessage = vscode.window.showErrorMessage;
      originalShowInformationMessage = vscode.window.showInformationMessage;

      (preflightModule as unknown as { ensurePreflight: typeof preflightModule.ensurePreflight }).ensurePreflight = async () => preflightResult;
      (gitExecModule as unknown as { execGitStdout: typeof gitExecModule.execGitStdout }).execGitStdout = async (
        cwd,
        args,
      ) => {
        execGitStdoutCalls.push({ cwd, args });
        const key = args[0] ?? '';
        const response = execGitStdoutResponses.get(key);
        if (response instanceof Error) {
          throw response;
        }
        return response ?? '';
      };
      (promptBuilderModule as unknown as { buildTestGenPrompt: typeof promptBuilderModule.buildTestGenPrompt }).buildTestGenPrompt = async (
        input,
      ) => {
        buildPromptInputs.push(input);
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
    });

    teardown(() => {
      (preflightModule as unknown as { ensurePreflight: typeof originalEnsurePreflight }).ensurePreflight = originalEnsurePreflight;
      (gitExecModule as unknown as { execGitStdout: typeof originalExecGitStdout }).execGitStdout = originalExecGitStdout;
      (promptBuilderModule as unknown as { buildTestGenPrompt: typeof originalBuildTestGenPrompt }).buildTestGenPrompt =
        originalBuildTestGenPrompt;
      (runWithArtifactsModule as unknown as { runWithArtifacts: typeof originalRunWithArtifacts }).runWithArtifacts = originalRunWithArtifacts;
      (vscode.window as unknown as { showErrorMessage: typeof originalShowErrorMessage }).showErrorMessage = originalShowErrorMessage;
      (vscode.window as unknown as { showInformationMessage: typeof originalShowInformationMessage }).showInformationMessage =
        originalShowInformationMessage;
    });

    test('TC-GC-E-01: preflight failure returns early', async () => {
      // Given: プリフライトが失敗する
      preflightResult = undefined;

      // When: generateTestFromLatestCommit を呼び出す
      await generateTestFromLatestCommit(provider, undefined, { runLocation: 'local' });

      // Then: git コマンドも runWithArtifacts も呼ばれない
      assert.strictEqual(execGitStdoutCalls.length, 0);
      assert.strictEqual(runWithArtifactsCalls.length, 0);
    });

    test('TC-GC-E-02: missing HEAD commit shows error', async () => {
      // Given: HEAD の解決が失敗する
      execGitStdoutResponses.set('rev-parse', '');

      // When: generateTestFromLatestCommit を呼び出す
      await generateTestFromLatestCommit(provider, undefined, { runLocation: 'local' });

      // Then: エラーメッセージが表示され、runWithArtifacts は呼ばれない
      assert.strictEqual(showErrorMessages.length, 1);
      assert.ok(showErrorMessages[0]?.length > 0, 'エラーメッセージは空でない');
      assert.strictEqual(runWithArtifactsCalls.length, 0);
    });

    test('TC-GC-E-03: empty changed files shows info and returns', async () => {
      // Given: HEAD は解決できるが差分ファイルが空
      execGitStdoutResponses.set('rev-parse', 'abcdef1234567890');
      execGitStdoutResponses.set('diff-tree', '');

      // When: generateTestFromLatestCommit を呼び出す
      await generateTestFromLatestCommit(provider, undefined, { runLocation: 'local' });

      // Then: 情報メッセージが表示され、runWithArtifacts は呼ばれない
      assert.strictEqual(showInfoMessages.length, 1);
      assert.ok(showInfoMessages[0]?.includes('abcdef1'), '短縮コミットが含まれる');
      assert.strictEqual(runWithArtifactsCalls.length, 0);
    });

    test('TC-GC-E-04: worktree without extensionContext shows error', async () => {
      // Given: 差分はあるが worktree 実行に extensionContext が無い
      execGitStdoutResponses.set('rev-parse', 'abcdef1234567890');
      execGitStdoutResponses.set('diff-tree', 'src/app.test.ts');
      execGitStdoutResponses.set('show', 'diff content');

      // When: generateTestFromLatestCommit を呼び出す
      await generateTestFromLatestCommit(provider, undefined, { runLocation: 'worktree', extensionContext: undefined });

      // Then: エラーメッセージが表示され、runWithArtifacts は呼ばれない
      assert.strictEqual(showErrorMessages.length, 1);
      assert.ok(showErrorMessages[0]?.length > 0, 'エラーメッセージは空でない');
      assert.strictEqual(runWithArtifactsCalls.length, 0);
    });

    test('CM-N-PO-NOCTX-01: perspectiveOnly locks runLocation to local and does not require extensionContext', async () => {
      // Given: Valid commit/diff, but requested runLocation=worktree and extensionContext is undefined
      execGitStdoutResponses.set('rev-parse', 'abcdef1234567890');
      execGitStdoutResponses.set('diff-tree', 'src/app.test.ts');
      execGitStdoutResponses.set('show', 'diff content');

      // When: Calling generateTestFromLatestCommit with runMode=perspectiveOnly
      await generateTestFromLatestCommit(provider, undefined, {
        runLocation: 'worktree',
        runMode: 'perspectiveOnly',
        extensionContext: undefined,
      });

      // Then: No worktree-context error, and runWithArtifacts uses effectiveRunLocation=local
      assert.strictEqual(showErrorMessages.length, 0, 'Expected no error message for perspectiveOnly lock');
      assert.strictEqual(runWithArtifactsCalls.length, 1);
      const call = runWithArtifactsCalls[0];
      assert.strictEqual(call.runMode, 'perspectiveOnly');
      assert.strictEqual(call.runLocation, 'local');
    });

    test('TC-GC-N-01: local mode calls runWithArtifacts with model override', async () => {
      // Given: 有効なコミット/差分とモデル上書き
      execGitStdoutResponses.set('rev-parse', 'abcdef1234567890');
      execGitStdoutResponses.set('diff-tree', 'src/app.test.ts');
      execGitStdoutResponses.set('show', 'diff content');
      const modelOverride = `model-${Date.now()}`;

      // When: generateTestFromLatestCommit を呼び出す
      await generateTestFromLatestCommit(provider, modelOverride, { runLocation: 'local' });

      // Then: runWithArtifacts が期待値で呼ばれる
      assert.strictEqual(runWithArtifactsCalls.length, 1);
      const call = runWithArtifactsCalls[0];
      assert.strictEqual(call.workspaceRoot, workspaceRoot);
      assert.strictEqual(call.cursorAgentCommand, preflightResult?.cursorAgentCommand);
      assert.deepStrictEqual(call.targetPaths, ['src/app.test.ts']);
      assert.strictEqual(call.model, modelOverride);
      assert.strictEqual(call.runLocation, 'local');
      assert.ok(call.generationTaskId.startsWith('fromCommit-'), 'generationTaskId に prefix が付く');
      assert.ok(call.generationLabel.includes('abcdef1'), 'generationLabel に短縮コミットが含まれる');
      assert.ok(call.generationPrompt.includes('TEST_PROMPT'), 'プロンプトが含まれる');
      assert.ok(call.generationPrompt.includes('diff content'), '差分テキストが含まれる');
      assert.strictEqual(buildPromptInputs.length, 1);
      assert.deepStrictEqual(buildPromptInputs[0]?.targetPaths, ['src/app.test.ts']);
    });

    test('TC-GC-N-02: worktree mode calls runWithArtifacts with extensionContext', async () => {
      // Given: 有効なコミット/差分と worktree 指定
      execGitStdoutResponses.set('rev-parse', 'abcdef1234567890');
      execGitStdoutResponses.set('diff-tree', 'src/app.test.ts');
      execGitStdoutResponses.set('show', 'diff content');

      // When: generateTestFromLatestCommit を呼び出す
      await generateTestFromLatestCommit(provider, undefined, { runLocation: 'worktree', extensionContext });

      // Then: runWithArtifacts が worktree モードで呼ばれる
      assert.strictEqual(runWithArtifactsCalls.length, 1);
      const call = runWithArtifactsCalls[0];
      assert.strictEqual(call.runLocation, 'worktree');
      assert.strictEqual(call.extensionContext, extensionContext);
      assert.strictEqual(call.model, preflightResult?.defaultModel);
    });
  });
});
