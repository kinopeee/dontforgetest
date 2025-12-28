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
  // | TC-WA-E-06 | git apply fails after check OK (conflict) | Error – apply conflict | Returns reason=apply-failed; persists artifacts with apply output | Verify applyCheckOutput forwarded |
  // | TC-WA-E-07 | fs.rename fails while persisting patch | Error – rename failed | Persists patch via writeFile and removes tmp patch | Verify patch exists and tmp is removed |
  // | TC-WA-E-08 | git diff output has no trailing newline | Boundary – formatting | Persisted patch ends with newline | Prevent "corrupt patch" |
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
    let lastInstructionParams: mergeAssistanceModule.MergeAssistancePromptParams | undefined = undefined;

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
      lastInstructionParams = undefined;

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
        .buildMergeAssistanceInstructionMarkdown = (params: mergeAssistanceModule.MergeAssistancePromptParams) => {
          lastInstructionParams = params;
          return 'INSTRUCTION_MD';
        };
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

    test('TC-WA-E-06: apply failure after check ok returns apply-failed and forwards apply output', async () => {
      // Given: apply --check は成功するが apply が失敗する（競合等）
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('apply-conflict');
      const testPath = 'tests/app.test.ts';
      trackedPaths = [testPath];
      untrackedPaths = [];
      filteredTestPaths = [testPath];
      diffText = 'diff content';
      applyCheckResult = { ok: true, stdout: '', stderr: '' };
      applyResult = { ok: false, output: 'error: patch failed: tests/app.test.ts:1' };
      await createTestFile(runWorkspaceRoot, testPath);

      const generationTaskId = `test-apply-conflict-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const patchPath = path.join(extensionContext.globalStorageUri.fsPath, 'patches', `${generationTaskId}.patch`);
      const instructionPath = path.join(extensionContext.globalStorageUri.fsPath, 'merge-instructions', `${generationTaskId}.md`);
      const snapshotPath = path.join(extensionContext.globalStorageUri.fsPath, 'snapshots', generationTaskId, testPath);

      // When: applyWorktreeTestChanges を呼び出す
      const result = await applyWorktreeTestChanges({
        generationTaskId,
        genExit: 0,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot,
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: apply-failed で終了し、保存物と案内が生成される
      assert.strictEqual(result.applied, false);
      assert.strictEqual(result.reason, 'apply-failed');
      assert.strictEqual(warningMessages.length, 1);
      assert.strictEqual(fs.existsSync(patchPath), true, 'patch が保存される');
      assert.strictEqual(fs.existsSync(instructionPath), true, 'instruction が保存される');
      assert.strictEqual(fs.existsSync(snapshotPath), true, 'snapshot が保存される');
      assert.strictEqual(lastInstructionParams?.applyCheckOutput, 'error: patch failed: tests/app.test.ts:1', 'apply 出力が指示文へ渡る');
    });

    test('TC-WA-E-07: rename failure persists patch via writeFile and removes tmp patch', async () => {
      // Given: artifacts 永続化時の rename が失敗する
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('rename-failed');
      const testPath = 'tests/app.test.ts';
      trackedPaths = [testPath];
      untrackedPaths = [];
      filteredTestPaths = [testPath];
      diffText = 'DIFF_NO_TRAILING_NEWLINE';
      renameShouldFail = true;
      await createTestFile(runWorkspaceRoot, testPath);

      const generationTaskId = `test-rename-failed-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const tmpPatchPath = path.join(extensionContext.globalStorageUri.fsPath, 'tmp', `${generationTaskId}.patch`);
      const patchPath = path.join(extensionContext.globalStorageUri.fsPath, 'patches', `${generationTaskId}.patch`);

      // When: applyWorktreeTestChanges を呼び出す（genExit!=0 で自動適用しない）
      const result = await applyWorktreeTestChanges({
        generationTaskId,
        genExit: 1,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot,
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: パッチは writeFile で保存され、tmp パッチは削除される
      assert.strictEqual(result.applied, false);
      assert.strictEqual(result.reason, 'gen-failed');
      assert.strictEqual(warningMessages.length, 1);
      assert.strictEqual(fs.existsSync(patchPath), true, 'patch が保存される（rename 失敗のフォールバック）');
      assert.strictEqual(fs.existsSync(tmpPatchPath), false, 'tmp patch が削除される（rename 失敗時）');
      const patch = await fs.promises.readFile(patchPath, 'utf8');
      assert.strictEqual(patch, `${diffText}\n`, '末尾改行が補完された patch が保存される');
    });

    test('TC-WA-E-08: diff output without trailing newline is normalized in persisted patch', async () => {
      // Given: git diff の出力が末尾改行で終わらない（フォーマット崩れ）
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('diff-formatting');
      const testPath = 'tests/app.test.ts';
      trackedPaths = [testPath];
      untrackedPaths = [];
      filteredTestPaths = [testPath];
      diffText = 'PATCH_WITHOUT_NEWLINE';
      await createTestFile(runWorkspaceRoot, testPath);

      const generationTaskId = `test-diff-formatting-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const patchPath = path.join(extensionContext.globalStorageUri.fsPath, 'patches', `${generationTaskId}.patch`);

      // When: applyWorktreeTestChanges を呼び出す（genExit!=0 で保存まで進める）
      const result = await applyWorktreeTestChanges({
        generationTaskId,
        genExit: 1,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot,
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: 保存された patch は末尾改行を持つ（git apply corrupt patch 対策）
      assert.strictEqual(result.applied, false);
      assert.strictEqual(result.reason, 'gen-failed');
      assert.strictEqual(fs.existsSync(patchPath), true, 'patch が保存される');
      const patch = await fs.promises.readFile(patchPath, 'utf8');
      assert.strictEqual(patch, `${diffText}\n`);
      assert.ok(patch.endsWith('\n'), '末尾改行がある');
    });
  });
});
