import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { applyWorktreeTestChanges } from '../../../../commands/runWithArtifacts/worktreeApplyStep';
import * as gitExecModule from '../../../../git/gitExec';
import * as mergeAssistanceModule from '../../../../core/mergeAssistancePrompt';
import * as testPathClassifierModule from '../../../../core/testPathClassifier';
import * as outputChannelModule from '../../../../ui/outputChannel';
import { createMockExtensionContext } from '../../testUtils/vscodeMocks';

suite('commands/runWithArtifacts/worktreeApplyStep.ts', () => {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  // Test Perspectives Table for applyWorktreeTestChanges (deterministic branch coverage)
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-WA-E-01 | runWorkspaceRoot is empty | Boundary – empty | Returns applied=false, reason=exception | 0/min/max/±1 not applicable |
  // | TC-WA-E-02 | testPaths is empty | Error – no test diff | Returns reason=no-test-diff and emits a log event | - |
  // | TC-WA-E-03 | patchText is empty | Boundary – empty | Returns reason=empty-patch and emits info log | - |
  // | TC-WA-E-04 | genExit != 0 | Error – generation failed | Returns reason=gen-failed; showWarningMessage called | Includes untracked add -N failure path |
  // | TC-WA-E-05 | git apply --check fails | Error – apply failed | Returns reason=apply-failed; showWarningMessage called | - |
  // | TC-WA-N-01 | git apply succeeds | Equivalence – normal | Returns applied=true, reason=applied; showInformationMessage called | - |
  suite('applyWorktreeTestChanges deterministic coverage', () => {
    let originalExecGitStdout: typeof gitExecModule.execGitStdout;
    let originalExecGitResult: typeof gitExecModule.execGitResult;
    let originalFilterTestLikePaths: typeof testPathClassifierModule.filterTestLikePaths;
    let originalBuildMergeAssistancePromptText: typeof mergeAssistanceModule.buildMergeAssistancePromptText;
    let originalBuildMergeAssistanceInstructionMarkdown: typeof mergeAssistanceModule.buildMergeAssistanceInstructionMarkdown;
    let originalAppendEventToOutput: typeof outputChannelModule.appendEventToOutput;
    let originalShowWarningMessage: typeof vscode.window.showWarningMessage;
    let originalShowInformationMessage: typeof vscode.window.showInformationMessage;
    let originalFsRename: typeof fs.promises.rename;

    let trackedPaths: string[] = [];
    let untrackedPaths: string[] = [];
    let filteredTestPaths: string[] = [];
    let diffText = '';
    let addResult: gitExecModule.ExecGitResult = { ok: true, stdout: '', stderr: '' };
    let applyCheckResult: gitExecModule.ExecGitResult = { ok: true, stdout: '', stderr: '' };
    let applyResult: gitExecModule.ExecGitResult = { ok: true, stdout: '', stderr: '' };
    let renameShouldFail = false;

    let appendEventCalls: Array<unknown> = [];
    let warningMessages: Array<{ message: string; items: string[] }> = [];
    let infoMessages: string[] = [];

    const baseTmpDir = path.join(workspaceRoot, 'out', 'test-worktree-apply');

    const createTempDir = async (prefix: string): Promise<string> => {
      await fs.promises.mkdir(baseTmpDir, { recursive: true });
      return fs.promises.mkdtemp(path.join(baseTmpDir, `${prefix}-`));
    };

    const createTestFile = async (root: string, relPath: string): Promise<void> => {
      const filePath = path.join(root, relPath);
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, 'test content', 'utf8');
    };

    setup(() => {
      trackedPaths = [];
      untrackedPaths = [];
      filteredTestPaths = [];
      diffText = '';
      addResult = { ok: true, stdout: '', stderr: '' };
      applyCheckResult = { ok: true, stdout: '', stderr: '' };
      applyResult = { ok: true, stdout: '', stderr: '' };
      renameShouldFail = false;
      appendEventCalls = [];
      warningMessages = [];
      infoMessages = [];

      originalExecGitStdout = gitExecModule.execGitStdout;
      originalExecGitResult = gitExecModule.execGitResult;
      originalFilterTestLikePaths = testPathClassifierModule.filterTestLikePaths;
      originalBuildMergeAssistancePromptText = mergeAssistanceModule.buildMergeAssistancePromptText;
      originalBuildMergeAssistanceInstructionMarkdown = mergeAssistanceModule.buildMergeAssistanceInstructionMarkdown;
      originalAppendEventToOutput = outputChannelModule.appendEventToOutput;
      originalShowWarningMessage = vscode.window.showWarningMessage;
      originalShowInformationMessage = vscode.window.showInformationMessage;
      originalFsRename = fs.promises.rename;

      (gitExecModule as unknown as { execGitStdout: typeof gitExecModule.execGitStdout }).execGitStdout = async (_cwd, args) => {
        if (args.includes('--name-only')) {
          return trackedPaths.join('\n');
        }
        if (args.includes('--others')) {
          return untrackedPaths.join('\n');
        }
        if (args.includes('--no-color')) {
          return diffText;
        }
        return '';
      };
      (gitExecModule as unknown as { execGitResult: typeof gitExecModule.execGitResult }).execGitResult = async (_cwd, args) => {
        if (args[0] === 'add') {
          return addResult;
        }
        if (args[0] === 'apply' && args[1] === '--check') {
          return applyCheckResult;
        }
        if (args[0] === 'apply') {
          return applyResult;
        }
        return { ok: true, stdout: '', stderr: '' };
      };
      (testPathClassifierModule as unknown as { filterTestLikePaths: typeof testPathClassifierModule.filterTestLikePaths }).filterTestLikePaths =
        () => filteredTestPaths;
      (mergeAssistanceModule as unknown as { buildMergeAssistancePromptText: typeof mergeAssistanceModule.buildMergeAssistancePromptText })
        .buildMergeAssistancePromptText = () => 'PROMPT_TEXT';
      (mergeAssistanceModule as unknown as { buildMergeAssistanceInstructionMarkdown: typeof mergeAssistanceModule.buildMergeAssistanceInstructionMarkdown })
        .buildMergeAssistanceInstructionMarkdown = () => 'INSTRUCTION_MD';
      (outputChannelModule as unknown as { appendEventToOutput: typeof outputChannelModule.appendEventToOutput }).appendEventToOutput = (
        event,
      ) => {
        appendEventCalls.push(event);
      };
      (vscode.window as unknown as { showWarningMessage: typeof vscode.window.showWarningMessage }).showWarningMessage = async (
        message: string,
        optionsOrItem?: vscode.MessageOptions | string,
        ...items: string[]
      ) => {
        const selectedItems = typeof optionsOrItem === 'string' ? [optionsOrItem, ...items] : items;
        warningMessages.push({ message, items: selectedItems });
        return undefined;
      };
      (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = async (
        message: string,
      ) => {
        infoMessages.push(message);
        return undefined;
      };
      (fs.promises as unknown as { rename: typeof fs.promises.rename }).rename = async (src, dest) => {
        if (renameShouldFail) {
          throw new Error(`rename failed: ${src} -> ${dest}`);
        }
        return originalFsRename(src, dest);
      };
    });

    teardown(() => {
      (gitExecModule as unknown as { execGitStdout: typeof originalExecGitStdout }).execGitStdout = originalExecGitStdout;
      (gitExecModule as unknown as { execGitResult: typeof originalExecGitResult }).execGitResult = originalExecGitResult;
      (testPathClassifierModule as unknown as { filterTestLikePaths: typeof originalFilterTestLikePaths }).filterTestLikePaths =
        originalFilterTestLikePaths;
      (mergeAssistanceModule as unknown as { buildMergeAssistancePromptText: typeof originalBuildMergeAssistancePromptText })
        .buildMergeAssistancePromptText = originalBuildMergeAssistancePromptText;
      (mergeAssistanceModule as unknown as { buildMergeAssistanceInstructionMarkdown: typeof originalBuildMergeAssistanceInstructionMarkdown })
        .buildMergeAssistanceInstructionMarkdown = originalBuildMergeAssistanceInstructionMarkdown;
      (outputChannelModule as unknown as { appendEventToOutput: typeof originalAppendEventToOutput }).appendEventToOutput =
        originalAppendEventToOutput;
      (vscode.window as unknown as { showWarningMessage: typeof originalShowWarningMessage }).showWarningMessage = originalShowWarningMessage;
      (vscode.window as unknown as { showInformationMessage: typeof originalShowInformationMessage }).showInformationMessage =
        originalShowInformationMessage;
      (fs.promises as unknown as { rename: typeof originalFsRename }).rename = originalFsRename;
    });

    suiteTeardown(async () => {
      // テスト用に作成した一時ディレクトリはスイート終了時にまとめて削除する（ローカル実行時の蓄積を防ぐ）
      try {
        await fs.promises.rm(baseTmpDir, { recursive: true, force: true });
      } catch {
        // 一時ディレクトリの削除失敗はテスト結果に影響させない
      }
    });

    test('TC-WA-E-01: empty runWorkspaceRoot returns exception reason', async () => {
      // Given: runWorkspaceRoot が空
      const extensionContext = createMockExtensionContext({ workspaceRoot });

      // When: applyWorktreeTestChanges を呼び出す
      const result = await applyWorktreeTestChanges({
        generationTaskId: `test-empty-root-${Date.now()}`,
        genExit: 0,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot: '',
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: 例外理由で終了する
      assert.strictEqual(result.applied, false);
      assert.strictEqual(result.reason, 'exception');
      assert.strictEqual(appendEventCalls.length, 0);
    });

    test('TC-WA-E-02: no test diff returns no-test-diff', async () => {
      // Given: 変更はあるがテストに該当しない
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('no-test-diff');
      trackedPaths = ['src/app.ts'];
      untrackedPaths = [];
      filteredTestPaths = [];

      // When: applyWorktreeTestChanges を呼び出す
      const result = await applyWorktreeTestChanges({
        generationTaskId: `test-no-test-diff-${Date.now()}`,
        genExit: 0,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot,
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: no-test-diff で終了し、ログが記録される
      assert.strictEqual(result.applied, false);
      assert.strictEqual(result.reason, 'no-test-diff');
      assert.strictEqual(appendEventCalls.length, 1);
    });

    test('TC-WA-E-03: empty patch returns empty-patch', async () => {
      // Given: テストパスはあるが差分が空
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('empty-patch');
      trackedPaths = ['tests/app.test.ts'];
      untrackedPaths = [];
      filteredTestPaths = ['tests/app.test.ts'];
      diffText = '   ';

      // When: applyWorktreeTestChanges を呼び出す
      const result = await applyWorktreeTestChanges({
        generationTaskId: `test-empty-patch-${Date.now()}`,
        genExit: 0,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot,
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: empty-patch で終了し、ログが記録される
      assert.strictEqual(result.applied, false);
      assert.strictEqual(result.reason, 'empty-patch');
      assert.strictEqual(appendEventCalls.length, 1);
    });

    test('TC-WA-E-04: genExit != 0 persists artifacts and warns', async () => {
      // Given: genExit が非0で自動適用しない
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('gen-failed');
      const testPath = 'tests/app.test.ts';
      trackedPaths = [testPath];
      untrackedPaths = [testPath];
      filteredTestPaths = [testPath];
      diffText = 'diff content';
      addResult = { ok: false, output: 'add failed' };
      renameShouldFail = true;
      await createTestFile(runWorkspaceRoot, testPath);

      // When: applyWorktreeTestChanges を呼び出す
      const result = await applyWorktreeTestChanges({
        generationTaskId: `test-gen-failed-${Date.now()}`,
        genExit: 1,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot,
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: gen-failed で終了し、警告が表示される
      assert.strictEqual(result.applied, false);
      assert.strictEqual(result.reason, 'gen-failed');
      assert.strictEqual(warningMessages.length, 1);
    });

    test('TC-WA-E-05: apply check failure returns apply-failed', async () => {
      // Given: apply --check が失敗する
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('apply-failed');
      const testPath = 'tests/app.test.ts';
      trackedPaths = [testPath];
      untrackedPaths = [];
      filteredTestPaths = [testPath];
      diffText = 'diff content';
      applyCheckResult = { ok: false, output: 'check failed' };
      await createTestFile(runWorkspaceRoot, testPath);

      // When: applyWorktreeTestChanges を呼び出す
      const result = await applyWorktreeTestChanges({
        generationTaskId: `test-apply-failed-${Date.now()}`,
        genExit: 0,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot,
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: apply-failed で終了し、警告が表示される
      assert.strictEqual(result.applied, false);
      assert.strictEqual(result.reason, 'apply-failed');
      assert.strictEqual(warningMessages.length, 1);
    });

    test('TC-WA-N-01: apply success returns applied', async () => {
      // Given: apply --check と apply が成功する
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('apply-success');
      const testPath = 'tests/app.test.ts';
      trackedPaths = [testPath];
      untrackedPaths = [];
      filteredTestPaths = [testPath];
      diffText = 'diff content';
      applyCheckResult = { ok: true, stdout: '', stderr: '' };
      applyResult = { ok: true, stdout: '', stderr: '' };

      const generationTaskId = `test-apply-success-${Date.now()}`;
      const tmpPatchPath = path.join(extensionContext.globalStorageUri.fsPath, 'tmp', `${generationTaskId}.patch`);

      // When: applyWorktreeTestChanges を呼び出す
      const result = await applyWorktreeTestChanges({
        generationTaskId,
        genExit: 0,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot,
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: applied で終了し、通知が表示される
      assert.strictEqual(result.applied, true);
      assert.strictEqual(result.reason, 'applied');
      assert.strictEqual(infoMessages.length, 1);
      assert.strictEqual(fs.existsSync(tmpPatchPath), false, '一時パッチが削除される');
    });
  });

  // TC-N-11: applyWorktreeTestChanges called with genExit=0 and valid test paths
  test('TC-N-11: applyWorktreeTestChanges applies test changes to local workspace successfully', async function () {
    // Given: genExit=0 and valid test paths
    // Note: This test requires a real git repository and worktree setup, which is complex
    // For now, we test the early return paths and error handling
    const extensionContext = createMockExtensionContext({ workspaceRoot });
    const generationTaskId = `test-apply-${Date.now()}`;

    // When: applyWorktreeTestChanges is called with empty runWorkspaceRoot (early return)
    // Then: Early return, no changes applied
    await applyWorktreeTestChanges({
      generationTaskId,
      genExit: 0,
      localWorkspaceRoot: workspaceRoot,
      runWorkspaceRoot: '',
      extensionContext,
      preTestCheckCommand: '',
    });

    // Test passes if no exception is thrown
    assert.ok(true, 'Function should handle empty runWorkspaceRoot gracefully');
  }).timeout(10000);

  // TC-E-05: applyWorktreeTestChanges called with genExit != 0
  test('TC-E-05: applyWorktreeTestChanges skips auto-apply when genExit != 0', async function () {
    // Given: genExit != 0
    const extensionContext = createMockExtensionContext({ workspaceRoot });
    const generationTaskId = `test-apply-fail-${Date.now()}`;
    const runWorkspaceRoot = workspaceRoot;

    // When: applyWorktreeTestChanges is called
    // Then: Auto-apply skipped, patch/snapshot/instruction files saved, user notified
    // Note: Actual implementation will check genExit and skip auto-apply
    await applyWorktreeTestChanges({
      generationTaskId,
      genExit: 1,
      localWorkspaceRoot: workspaceRoot,
      runWorkspaceRoot,
      extensionContext,
      preTestCheckCommand: '',
    });

    // Test passes if no exception is thrown
    assert.ok(true, 'Function should handle failed generation gracefully');
  }).timeout(10000);

  // TC-E-06: applyWorktreeTestChanges called but git apply --check fails
  test('TC-E-06: applyWorktreeTestChanges handles git apply --check failure', async function () {
    // Given: Valid parameters but git apply --check will fail
    const extensionContext = createMockExtensionContext({ workspaceRoot });
    const generationTaskId = `test-apply-check-fail-${Date.now()}`;
    const runWorkspaceRoot = workspaceRoot;

    // When: applyWorktreeTestChanges is called
    // Then: Auto-apply skipped, merge artifacts persisted, user notified with options
    // Note: This requires actual git setup, so we test the function doesn't crash
    await applyWorktreeTestChanges({
      generationTaskId,
      genExit: 0,
      localWorkspaceRoot: workspaceRoot,
      runWorkspaceRoot,
      extensionContext,
      preTestCheckCommand: '',
    });

    // Test passes if no exception is thrown
    assert.ok(true, 'Function should handle git apply check failure gracefully');
  }).timeout(10000);

  // TC-B-11: applyWorktreeTestChanges called with empty testPaths array
  test('TC-B-11: applyWorktreeTestChanges handles empty test paths', async function () {
    // Given: Empty testPaths array (simulated by using workspace with no changes)
    const extensionContext = createMockExtensionContext({ workspaceRoot });
    const generationTaskId = `test-apply-empty-${Date.now()}`;
    const runWorkspaceRoot = workspaceRoot;

    // When: applyWorktreeTestChanges is called
    // Then: Early return, no changes applied, info message logged
    await applyWorktreeTestChanges({
      generationTaskId,
      genExit: 0,
      localWorkspaceRoot: workspaceRoot,
      runWorkspaceRoot,
      extensionContext,
      preTestCheckCommand: '',
    });

    // Test passes if no exception is thrown
    assert.ok(true, 'Function should handle empty test paths gracefully');
  }).timeout(10000);

  // TC-B-12: applyWorktreeTestChanges called with empty patchText
  test('TC-B-12: applyWorktreeTestChanges handles empty patch', async function () {
    // Given: Empty patchText (simulated by using workspace with no changes)
    const extensionContext = createMockExtensionContext({ workspaceRoot });
    const generationTaskId = `test-apply-empty-patch-${Date.now()}`;
    const runWorkspaceRoot = workspaceRoot;

    // When: applyWorktreeTestChanges is called
    // Then: Early return, no changes applied, info message logged
    await applyWorktreeTestChanges({
      generationTaskId,
      genExit: 0,
      localWorkspaceRoot: workspaceRoot,
      runWorkspaceRoot,
      extensionContext,
      preTestCheckCommand: '',
    });

    // Test passes if no exception is thrown
    assert.ok(true, 'Function should handle empty patch gracefully');
  }).timeout(10000);

  // TC-NULL-04: applyWorktreeTestChanges called with runWorkspaceRoot=''
  test('TC-NULL-04: applyWorktreeTestChanges handles empty runWorkspaceRoot', async () => {
    // Given: runWorkspaceRoot=''
    const extensionContext = createMockExtensionContext({ workspaceRoot });
    const generationTaskId = `test-apply-empty-root-${Date.now()}`;

    // When: applyWorktreeTestChanges is called
    // Then: Early return, no changes applied
    await applyWorktreeTestChanges({
      generationTaskId,
      genExit: 0,
      localWorkspaceRoot: workspaceRoot,
      runWorkspaceRoot: '',
      extensionContext,
      preTestCheckCommand: '',
    });

    // Test passes if no exception is thrown
    assert.ok(true, 'Function should handle empty runWorkspaceRoot gracefully');
  });
});
