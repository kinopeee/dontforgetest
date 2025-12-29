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
    let originalOpenTextDocument: typeof vscode.workspace.openTextDocument;
    let originalShowTextDocument: typeof vscode.window.showTextDocument;
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
    let warningPickSelector: ((items: string[]) => string | undefined) | undefined;
    let openTextDocumentCalls: string[] = [];
    let showTextDocumentCalls: Array<vscode.TextDocumentShowOptions | undefined> = [];
    let promptParamsCalls: mergeAssistanceModule.MergeAssistancePromptParams[] = [];
    let instructionParamsCalls: mergeAssistanceModule.MergeAssistancePromptParams[] = [];

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
      warningPickSelector = undefined;
      openTextDocumentCalls = [];
      showTextDocumentCalls = [];
      promptParamsCalls = [];
      instructionParamsCalls = [];

      originalExecGitStdout = gitExecModule.execGitStdout;
      originalExecGitResult = gitExecModule.execGitResult;
      originalFilterTestLikePaths = testPathClassifierModule.filterTestLikePaths;
      originalBuildMergeAssistancePromptText = mergeAssistanceModule.buildMergeAssistancePromptText;
      originalBuildMergeAssistanceInstructionMarkdown = mergeAssistanceModule.buildMergeAssistanceInstructionMarkdown;
      originalAppendEventToOutput = outputChannelModule.appendEventToOutput;
      originalShowWarningMessage = vscode.window.showWarningMessage;
      originalShowInformationMessage = vscode.window.showInformationMessage;
      originalOpenTextDocument = vscode.workspace.openTextDocument;
      originalShowTextDocument = vscode.window.showTextDocument;
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
        .buildMergeAssistancePromptText = (params) => {
        promptParamsCalls.push(params);
        return 'PROMPT_TEXT';
      };
      (mergeAssistanceModule as unknown as { buildMergeAssistanceInstructionMarkdown: typeof mergeAssistanceModule.buildMergeAssistanceInstructionMarkdown })
        .buildMergeAssistanceInstructionMarkdown = (params) => {
        instructionParamsCalls.push(params);
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
        return warningPickSelector ? warningPickSelector(selectedItems) : undefined;
      };
      (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = async (
        message: string,
      ) => {
        infoMessages.push(message);
        return undefined;
      };
      (vscode.workspace as unknown as { openTextDocument: typeof vscode.workspace.openTextDocument }).openTextDocument = (async (
        uriOrFileName: vscode.Uri | string,
      ) => {
        const uri = typeof uriOrFileName === 'string' ? vscode.Uri.file(uriOrFileName) : uriOrFileName;
        openTextDocumentCalls.push(uri.fsPath);
        return { uri } as unknown as vscode.TextDocument;
      }) as unknown as typeof vscode.workspace.openTextDocument;
      (vscode.window as unknown as { showTextDocument: typeof vscode.window.showTextDocument }).showTextDocument = (async (
        doc: vscode.TextDocument,
        options?: vscode.TextDocumentShowOptions,
      ) => {
        showTextDocumentCalls.push(options);
        return { document: doc } as unknown as vscode.TextEditor;
      }) as unknown as typeof vscode.window.showTextDocument;
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
      (vscode.workspace as unknown as { openTextDocument: typeof originalOpenTextDocument }).openTextDocument = originalOpenTextDocument;
      (vscode.window as unknown as { showTextDocument: typeof originalShowTextDocument }).showTextDocument = originalShowTextDocument;
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

    test('TC-WA-B-01: diffText ending with newline is preserved in persisted patch', async () => {
      // Given: diffText が末尾改行を含み、genExit != 0 で手動マージになる
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('newline-patch');
      const testPath = 'tests/app.test.ts';
      trackedPaths = [testPath];
      untrackedPaths = [];
      filteredTestPaths = [testPath];
      diffText = 'diff content\n';
      await createTestFile(runWorkspaceRoot, testPath);

      const generationTaskId = `test-newline-patch-${Date.now()}`;

      // When: applyWorktreeTestChanges を呼び出す
      const result = await applyWorktreeTestChanges({
        generationTaskId,
        genExit: 1,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot,
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: gen-failed で終了し、patch は末尾改行が重複しない
      assert.strictEqual(result.applied, false);
      assert.strictEqual(result.reason, 'gen-failed');
      const patchPath = path.join(extensionContext.globalStorageUri.fsPath, 'patches', `${generationTaskId}.patch`);
      const patchContent = await fs.promises.readFile(patchPath, 'utf8');
      assert.strictEqual(patchContent, diffText);
    });

    test('TC-WA-E-06: rm failure during apply success cleanup is tolerated', async () => {
      // Given: apply 成功だが、一時パッチ削除（rm）が失敗する
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('apply-success-rm-throw');
      const testPath = 'tests/app.test.ts';
      trackedPaths = [testPath];
      untrackedPaths = [];
      filteredTestPaths = [testPath];
      diffText = 'diff content';
      applyCheckResult = { ok: true, stdout: '', stderr: '' };
      applyResult = { ok: true, stdout: '', stderr: '' };

      const generationTaskId = `test-apply-success-rm-throw-${Date.now()}`;
      const tmpPatchPath = path.join(extensionContext.globalStorageUri.fsPath, 'tmp', `${generationTaskId}.patch`);

      const originalRm = fs.promises.rm;
      (fs.promises as unknown as { rm: typeof fs.promises.rm }).rm = async () => {
        throw new Error('rm failed');
      };

      try {
        // When: applyWorktreeTestChanges を呼び出す
        const result = await applyWorktreeTestChanges({
          generationTaskId,
          genExit: 0,
          localWorkspaceRoot: workspaceRoot,
          runWorkspaceRoot,
          extensionContext,
          preTestCheckCommand: '',
        });

        // Then: applied で終了し、rm 失敗でも例外にならない（パッチは残る）
        assert.strictEqual(result.applied, true);
        assert.strictEqual(result.reason, 'applied');
        assert.strictEqual(infoMessages.length, 1);
        assert.strictEqual(fs.existsSync(tmpPatchPath), true, 'rm 失敗時は一時パッチが残る');
      } finally {
        (fs.promises as unknown as { rm: typeof originalRm }).rm = originalRm;
      }
    });

    test('TC-WA-E-07: apply failure after check returns apply-failed and records apply output', async () => {
      // Given: apply --check は成功するが、apply が失敗する
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('apply-failed-after-check');
      const testPath = 'tests/app.test.ts';
      trackedPaths = [testPath];
      untrackedPaths = [];
      filteredTestPaths = [testPath];
      diffText = 'diff content';
      applyCheckResult = { ok: true, stdout: '', stderr: '' };
      applyResult = { ok: false, output: 'apply failed' };
      await createTestFile(runWorkspaceRoot, testPath);

      const generationTaskId = `test-apply-failed-after-check-${Date.now()}`;

      // When: applyWorktreeTestChanges を呼び出す
      const result = await applyWorktreeTestChanges({
        generationTaskId,
        genExit: 0,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot,
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: apply-failed で終了し、apply の出力が applyCheckOutput として保持される
      assert.strictEqual(result.applied, false);
      assert.strictEqual(result.reason, 'apply-failed');
      assert.strictEqual(warningMessages.length, 1);
      assert.ok(
        instructionParamsCalls.some((p) => p.taskId === generationTaskId && p.applyCheckOutput.includes('apply failed')),
        'Expected apply output to be passed to merge instruction params',
      );
    });

    test('TC-WA-B-02: genExit=null is reflected in applyCheckOutput (exit=null)', async () => {
      // Given: genExit が null の場合は自動適用せず、exit=null が表示される
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('gen-null');
      const testPath = 'tests/app.test.ts';
      trackedPaths = [testPath];
      untrackedPaths = [];
      filteredTestPaths = [testPath];
      diffText = 'diff content';
      await createTestFile(runWorkspaceRoot, testPath);

      const generationTaskId = `test-gen-null-${Date.now()}`;

      // When: applyWorktreeTestChanges を呼び出す
      const result = await applyWorktreeTestChanges({
        generationTaskId,
        genExit: null,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot,
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: gen-failed で終了し、applyCheckOutput に exit=null が含まれる
      assert.strictEqual(result.applied, false);
      assert.strictEqual(result.reason, 'gen-failed');
      assert.ok(
        instructionParamsCalls.some((p) => p.taskId === generationTaskId && p.applyCheckOutput.includes('exit=null')),
        'Expected applyCheckOutput to include exit=null when genExit is null',
      );
    });

    test('TC-WA-N-02: manual merge actionCopy writes prompt to clipboard', async () => {
      // Given: 手動マージになり、ユーザーが「プロンプトをコピー」を選ぶ
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('manual-copy');
      const testPath = 'tests/app.test.ts';
      trackedPaths = [testPath];
      untrackedPaths = [];
      filteredTestPaths = [testPath];
      diffText = 'diff content';
      await createTestFile(runWorkspaceRoot, testPath);
      warningPickSelector = (items) => items[1];

      const generationTaskId = `test-manual-copy-${Date.now()}`;

      // When: applyWorktreeTestChanges を呼び出す
      await applyWorktreeTestChanges({
        generationTaskId,
        genExit: 1,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot,
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: then() の導線が非同期で動くため1tick待って検証する
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.ok(
        promptParamsCalls.some((p) => p.taskId === generationTaskId),
        'Expected buildMergeAssistancePromptText to be called for actionCopy',
      );
      assert.strictEqual(openTextDocumentCalls.length, 0);
    });

    test('TC-WA-N-03: manual merge actionOpenInstruction opens instruction document', async () => {
      // Given: 手動マージになり、ユーザーが「手順を開く」を選ぶ
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('manual-open');
      const testPath = 'tests/app.test.ts';
      trackedPaths = [testPath];
      untrackedPaths = [];
      filteredTestPaths = [testPath];
      diffText = 'diff content';
      await createTestFile(runWorkspaceRoot, testPath);
      warningPickSelector = (items) => items[0];

      const generationTaskId = `test-manual-open-${Date.now()}`;

      // When: applyWorktreeTestChanges を呼び出す
      await applyWorktreeTestChanges({
        generationTaskId,
        genExit: 1,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot,
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: then() の導線が非同期で動くため1tick待って検証する
      await new Promise((resolve) => setTimeout(resolve, 0));
      const expectedInstructionPath = path.join(extensionContext.globalStorageUri.fsPath, 'merge-instructions', `${generationTaskId}.md`);
      assert.strictEqual(openTextDocumentCalls.length, 1);
      assert.strictEqual(openTextDocumentCalls[0], expectedInstructionPath);
      assert.strictEqual(showTextDocumentCalls.length, 1);
      assert.strictEqual(showTextDocumentCalls[0]?.preview, true);
    });

    test('TC-WA-E-08: manual merge actionCopy tolerates clipboard.writeText throwing', async () => {
      // Given: ユーザーが「プロンプトをコピー」を選ぶが、プロンプト生成が例外を投げる（then内catch確認）
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('manual-copy-throw');
      const testPath = 'tests/app.test.ts';
      trackedPaths = [testPath];
      untrackedPaths = [];
      filteredTestPaths = [testPath];
      diffText = 'diff content';
      await createTestFile(runWorkspaceRoot, testPath);
      warningPickSelector = (items) => items[1];
      const originalPromptBuilder = mergeAssistanceModule.buildMergeAssistancePromptText;
      (mergeAssistanceModule as unknown as { buildMergeAssistancePromptText: typeof mergeAssistanceModule.buildMergeAssistancePromptText })
        .buildMergeAssistancePromptText = () => {
        throw new Error('prompt build failed');
      };

      try {
        // When: applyWorktreeTestChanges を呼び出す（本体は例外にしない）
        await applyWorktreeTestChanges({
          generationTaskId: `test-manual-copy-throw-${Date.now()}`,
          genExit: 1,
          localWorkspaceRoot: workspaceRoot,
          runWorkspaceRoot,
          extensionContext,
          preTestCheckCommand: '',
        });

        // Then: then() の導線が非同期で動くため1tick待って検証する
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.strictEqual(infoMessages.length, 0);
      } finally {
        (mergeAssistanceModule as unknown as { buildMergeAssistancePromptText: typeof originalPromptBuilder }).buildMergeAssistancePromptText =
          originalPromptBuilder;
      }
    });

    test('TC-WA-B-03: snapshot skips non-file paths', async () => {
      // Given: 生成済みテストパスが「ディレクトリ」である（isFile=false）
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('snapshot-dir');
      const testPath = 'tests/app.test.ts';
      trackedPaths = [testPath];
      untrackedPaths = [];
      filteredTestPaths = [testPath];
      diffText = 'diff content';
      await fs.promises.mkdir(path.join(runWorkspaceRoot, testPath), { recursive: true });

      // When: applyWorktreeTestChanges を呼び出す
      const result = await applyWorktreeTestChanges({
        generationTaskId: `test-snapshot-dir-${Date.now()}`,
        genExit: 1,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot,
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: gen-failed で終了し、例外にはならない
      assert.strictEqual(result.applied, false);
      assert.strictEqual(result.reason, 'gen-failed');
    });

    test('TC-WA-E-09: snapshot ignores missing source file', async () => {
      // Given: 生成済みテストパスが存在しない（stat/copy が失敗）
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('snapshot-missing');
      const testPath = 'tests/missing.test.ts';
      trackedPaths = [testPath];
      untrackedPaths = [];
      filteredTestPaths = [testPath];
      diffText = 'diff content';

      // When: applyWorktreeTestChanges を呼び出す
      const result = await applyWorktreeTestChanges({
        generationTaskId: `test-snapshot-missing-${Date.now()}`,
        genExit: 1,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot,
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: gen-failed で終了し、例外にはならない
      assert.strictEqual(result.applied, false);
      assert.strictEqual(result.reason, 'gen-failed');
    });

    test('TC-WA-E-10: execGitStdout throw is caught and returns exception reason', async () => {
      // Given: execGitStdout が例外を投げる
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('exec-throw');
      (gitExecModule as unknown as { execGitStdout: typeof gitExecModule.execGitStdout }).execGitStdout = async () => {
        throw new Error('boom');
      };

      // When: applyWorktreeTestChanges を呼び出す
      const result = await applyWorktreeTestChanges({
        generationTaskId: `test-exec-throw-${Date.now()}`,
        genExit: 0,
        localWorkspaceRoot: workspaceRoot,
        runWorkspaceRoot,
        extensionContext,
        preTestCheckCommand: '',
      });

      // Then: exception で終了し、warn log が記録される
      assert.strictEqual(result.applied, false);
      assert.strictEqual(result.reason, 'exception');
      assert.strictEqual(appendEventCalls.length, 1);
    });

    test('TC-WA-E-11: persistMergeArtifacts tolerates rm failure when rename fails', async () => {
      // Given: rename が失敗し、その後の tmpPatch rm も失敗する
      const extensionContext = createMockExtensionContext({ workspaceRoot });
      const runWorkspaceRoot = await createTempDir('rename-rm-fail');
      const testPath = 'tests/app.test.ts';
      trackedPaths = [testPath];
      untrackedPaths = [testPath];
      filteredTestPaths = [testPath];
      diffText = 'diff content';
      renameShouldFail = true;
      await createTestFile(runWorkspaceRoot, testPath);

      const originalRm = fs.promises.rm;
      (fs.promises as unknown as { rm: typeof fs.promises.rm }).rm = async () => {
        throw new Error('rm failed');
      };

      try {
        // When: applyWorktreeTestChanges を呼び出す
        const result = await applyWorktreeTestChanges({
          generationTaskId: `test-rename-rm-fail-${Date.now()}`,
          genExit: 1,
          localWorkspaceRoot: workspaceRoot,
          runWorkspaceRoot,
          extensionContext,
          preTestCheckCommand: '',
        });

        // Then: gen-failed で終了し、例外にはならない
        assert.strictEqual(result.applied, false);
        assert.strictEqual(result.reason, 'gen-failed');
      } finally {
        (fs.promises as unknown as { rm: typeof originalRm }).rm = originalRm;
      }
    });
  });
});
