import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createTemporaryWorktree, removeTemporaryWorktree, type TemporaryWorktree } from '../../../git/worktreeManager';
import { execGitStdout } from '../../../git/gitExec';
import * as gitExecModule from '../../../git/gitExec';

suite('git/worktreeManager.ts', () => {
  let tempBaseDir: string;
  let repoRoot: string;
  let isGitRepo = false;

  suite('deterministic coverage (stubs)', () => {
    // Test Perspectives Table
    // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
    // |---------|----------------------|--------------------------------------|-----------------|-------|
    // | TC-WTM-B-01 | ref is undefined | Boundary – null | Uses ref="HEAD" in git worktree add args | Verify args[4] === "HEAD" |
    // | TC-WTM-B-02 | ref is whitespace | Boundary – empty | Uses ref="HEAD" (trim() -> empty -> fallback) | - |
    // | TC-WTM-E-01 | git worktree remove/prune and fs.rm throw | Error – exception | removeTemporaryWorktree resolves (swallows errors) | Verify call order |

    test('TC-WTM-B-01: createTemporaryWorktree defaults ref to HEAD when ref is undefined', async () => {
      // Given: ref を省略し、execGitStdout をスタブする
      const baseDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dontforgetest-wtm-'));
      const fakeRepoRoot = '/repo/root';
      const taskId = 'task';
      const expectedWorktreeDir = path.join(baseDir, 'worktrees', taskId);

      const originalExecGitStdout = gitExecModule.execGitStdout;
      const calls: Array<{ cwd: string; args: string[]; maxBufferBytes: number }> = [];
      (gitExecModule as unknown as { execGitStdout: typeof gitExecModule.execGitStdout }).execGitStdout = async (
        cwd,
        args,
        maxBufferBytes,
      ) => {
        calls.push({ cwd, args, maxBufferBytes });
        if (args[0] === 'worktree' && args[1] === 'add') {
          const dir = args[3] ?? '';
          await fs.promises.mkdir(dir, { recursive: true });
          return '';
        }
        throw new Error(`Unexpected git args: ${args.join(' ')}`);
      };

      try {
        // When: createTemporaryWorktree を呼び出す（ref 省略）
        const result = await createTemporaryWorktree({ repoRoot: fakeRepoRoot, baseDir, taskId });

        // Then: ref が HEAD に正規化され、git worktree add の引数に入る
        assert.strictEqual(result.worktreeDir, expectedWorktreeDir);
        assert.strictEqual(fs.existsSync(expectedWorktreeDir), true, 'スタブが worktreeDir を作成する');
        assert.strictEqual(calls.length, 1);
        assert.deepStrictEqual(calls[0].args, ['worktree', 'add', '--detach', expectedWorktreeDir, 'HEAD']);
        assert.strictEqual(calls[0].cwd, fakeRepoRoot);
      } finally {
        (gitExecModule as unknown as { execGitStdout: typeof originalExecGitStdout }).execGitStdout = originalExecGitStdout;
        await fs.promises.rm(baseDir, { recursive: true, force: true });
      }
    });

    test('TC-WTM-B-02: createTemporaryWorktree defaults ref to HEAD when ref is whitespace', async () => {
      // Given: ref が空白のみで、execGitStdout をスタブする
      const baseDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dontforgetest-wtm-'));
      const fakeRepoRoot = '/repo/root';
      const taskId = 'task';
      const expectedWorktreeDir = path.join(baseDir, 'worktrees', taskId);

      const originalExecGitStdout = gitExecModule.execGitStdout;
      const calls: Array<{ cwd: string; args: string[]; maxBufferBytes: number }> = [];
      (gitExecModule as unknown as { execGitStdout: typeof gitExecModule.execGitStdout }).execGitStdout = async (
        cwd,
        args,
        maxBufferBytes,
      ) => {
        calls.push({ cwd, args, maxBufferBytes });
        if (args[0] === 'worktree' && args[1] === 'add') {
          const dir = args[3] ?? '';
          await fs.promises.mkdir(dir, { recursive: true });
          return '';
        }
        throw new Error(`Unexpected git args: ${args.join(' ')}`);
      };

      try {
        // When: createTemporaryWorktree を呼び出す（ref="   "）
        const result = await createTemporaryWorktree({ repoRoot: fakeRepoRoot, baseDir, taskId, ref: '   ' });

        // Then: ref は HEAD になり、git worktree add の引数に入る（trim() -> empty -> fallback）
        assert.strictEqual(result.worktreeDir, expectedWorktreeDir);
        assert.strictEqual(calls.length, 1);
        assert.deepStrictEqual(calls[0].args, ['worktree', 'add', '--detach', expectedWorktreeDir, 'HEAD']);
      } finally {
        (gitExecModule as unknown as { execGitStdout: typeof originalExecGitStdout }).execGitStdout = originalExecGitStdout;
        await fs.promises.rm(baseDir, { recursive: true, force: true });
      }
    });

    test('TC-WTM-E-01: removeTemporaryWorktree swallows errors from git and fs.rm', async () => {
      // Given: git worktree remove/prune と fs.rm が失敗する状況をスタブで再現
      const fakeRepoRoot = '/repo/root';
      const fakeWorktreeDir = '/worktree/dir';

      const originalExecGitStdout = gitExecModule.execGitStdout;
      const originalFsRm = fs.promises.rm;

      const events: string[] = [];
      (gitExecModule as unknown as { execGitStdout: typeof gitExecModule.execGitStdout }).execGitStdout = async (_cwd, args) => {
        if (args[0] === 'worktree' && args[1] === 'remove') {
          events.push('git-remove');
          throw new Error('worktree remove failed');
        }
        if (args[0] === 'worktree' && args[1] === 'prune') {
          events.push('git-prune');
          throw new Error('worktree prune failed');
        }
        throw new Error(`Unexpected git args: ${args.join(' ')}`);
      };
      (fs.promises as unknown as { rm: typeof fs.promises.rm }).rm = async (_path, _options) => {
        events.push('fs-rm');
        throw new Error('fs rm failed');
      };

      try {
        // When/Then: removeTemporaryWorktree は例外を握りつぶして完了する
        await assert.doesNotReject(removeTemporaryWorktree(fakeRepoRoot, fakeWorktreeDir));
        assert.deepStrictEqual(events, ['git-remove', 'git-prune', 'fs-rm'], '失敗しても順に試行する');
      } finally {
        (gitExecModule as unknown as { execGitStdout: typeof originalExecGitStdout }).execGitStdout = originalExecGitStdout;
        (fs.promises as unknown as { rm: typeof originalFsRm }).rm = originalFsRm;
      }
    });
  });

  suiteSetup(async () => {
    // Find the actual git repository root
    repoRoot = process.cwd();
    // Verify we're in a git repo
    try {
      await execGitStdout(repoRoot, ['rev-parse', '--git-dir'], 1024 * 1024);
      isGitRepo = true;
    } catch {
      // Not a git repo, tests will be skipped
      isGitRepo = false;
    }
    tempBaseDir = path.join(os.tmpdir(), `dontforgetest-test-${Date.now()}`);
    fs.mkdirSync(tempBaseDir, { recursive: true });
  });

  suiteTeardown(() => {
    // Cleanup
    try {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // TC-N-12: createTemporaryWorktree called with valid repoRoot, baseDir, and taskId
  test('TC-N-12: createTemporaryWorktree creates temporary worktree successfully', async function () {
    if (!isGitRepo) {
      this.skip(); // Skip test if not in a git repository
    }
    // Given: Valid repoRoot, baseDir, and taskId
    const taskId = `test-task-${Date.now()}`;
    const params = {
      repoRoot,
      baseDir: tempBaseDir,
      taskId,
      ref: 'HEAD',
    };

    // When: createTemporaryWorktree is called
    let worktree: TemporaryWorktree | undefined;
    try {
      worktree = await createTemporaryWorktree(params);

      // Then: Temporary worktree created in baseDir/worktrees/taskId, TemporaryWorktree returned
      assert.ok(worktree !== undefined, 'Worktree should be created');
      assert.ok(worktree.worktreeDir.includes(tempBaseDir), 'Worktree should be in baseDir');
      assert.ok(worktree.worktreeDir.includes('worktrees'), 'Worktree should be in worktrees subdirectory');
      assert.ok(fs.existsSync(worktree.worktreeDir), 'Worktree directory should exist');
    } finally {
      // Cleanup
      if (worktree) {
        try {
          await removeTemporaryWorktree(repoRoot, worktree.worktreeDir);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }).timeout(30000);

  // TC-N-13: removeTemporaryWorktree called with valid repoRoot and worktreeDir
  test('TC-N-13: removeTemporaryWorktree removes worktree successfully', async function () {
    if (!isGitRepo) {
      this.skip(); // Skip test if not in a git repository
    }
    // Given: Valid repoRoot and worktreeDir (created worktree)
    const taskId = `test-task-remove-${Date.now()}`;
    const worktree = await createTemporaryWorktree({
      repoRoot,
      baseDir: tempBaseDir,
      taskId,
      ref: 'HEAD',
    });

    // When: removeTemporaryWorktree is called
    await removeTemporaryWorktree(repoRoot, worktree.worktreeDir);

    // Then: Worktree removed from git, pruned, directory deleted
    assert.ok(!fs.existsSync(worktree.worktreeDir), 'Worktree directory should be deleted');
  }).timeout(30000);

  // TC-E-04: createTemporaryWorktree called but git worktree add fails
  test('TC-E-04: createTemporaryWorktree throws exception when git worktree add fails', async function () {
    // Given: Invalid repoRoot that will cause git worktree add to fail
    const invalidRepoRoot = path.join(os.tmpdir(), 'non-existent-repo');
    const taskId = `test-task-error-${Date.now()}`;

    // When: createTemporaryWorktree is called
    // Then: Exception thrown with error message
    try {
      await createTemporaryWorktree({
        repoRoot: invalidRepoRoot,
        baseDir: tempBaseDir,
        taskId,
        ref: 'HEAD',
      });
      assert.fail('Should have thrown an error');
    } catch (e) {
      assert.ok(e instanceof Error || typeof e === 'object', 'Error should be thrown');
      const message = e instanceof Error ? e.message : String(e);
      assert.ok(message.length > 0, 'Error message should be present');
    }
  }).timeout(30000);

  // TC-E-13: removeTemporaryWorktree called but worktree removal fails
  test('TC-E-13: removeTemporaryWorktree handles worktree removal failure gracefully', async function () {
    // Given: Non-existent worktreeDir
    const nonExistentWorktreeDir = path.join(tempBaseDir, 'non-existent-worktree');

    // When: removeTemporaryWorktree is called
    // Then: Errors caught, directory force-deleted as fallback
    // Should not throw, even if worktree doesn't exist
    await assert.doesNotReject(
      removeTemporaryWorktree(repoRoot, nonExistentWorktreeDir),
      'Should handle non-existent worktree gracefully',
    );
  });

  // TC-B-13: createTemporaryWorktree called with empty taskId
  test('TC-B-13: createTemporaryWorktree sanitizes empty taskId to default', async function () {
    if (!isGitRepo) {
      this.skip(); // Skip test if not in a git repository
    }
    // Given: Empty taskId
    const taskId = '';
    let worktree: TemporaryWorktree | undefined;
    try {
      // When: createTemporaryWorktree is called
      worktree = await createTemporaryWorktree({
        repoRoot,
        baseDir: tempBaseDir,
        taskId,
        ref: 'HEAD',
      });

      // Then: TaskId sanitized to 'task', worktree created
      assert.ok(worktree !== undefined, 'Worktree should be created even with empty taskId');
      assert.ok(worktree.worktreeDir.includes('task'), 'Worktree directory should contain sanitized taskId');
    } finally {
      if (worktree) {
        try {
          await removeTemporaryWorktree(repoRoot, worktree.worktreeDir);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }).timeout(30000);

  // TC-B-14: createTemporaryWorktree called with taskId containing special characters
  test('TC-B-14: createTemporaryWorktree sanitizes special characters in taskId', async function () {
    if (!isGitRepo) {
      this.skip(); // Skip test if not in a git repository
    }
    // Given: taskId containing special characters
    const taskId = 'test/task<>:"|?*\\';
    let worktree: TemporaryWorktree | undefined;
    try {
      // When: createTemporaryWorktree is called
      worktree = await createTemporaryWorktree({
        repoRoot,
        baseDir: tempBaseDir,
        taskId,
        ref: 'HEAD',
      });

      // Then: TaskId sanitized to safe path segment, worktree created
      assert.ok(worktree !== undefined, 'Worktree should be created');
      const worktreeDirName = path.basename(worktree.worktreeDir);
      assert.ok(!/[<>:"|?*\\/]/.test(worktreeDirName), 'Worktree directory should not contain special characters');
    } finally {
      if (worktree) {
        try {
          await removeTemporaryWorktree(repoRoot, worktree.worktreeDir);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }).timeout(30000);

  // TC-B-15: createTemporaryWorktree called with taskId length > 120
  test('TC-B-15: createTemporaryWorktree truncates long taskId', async function () {
    if (!isGitRepo) {
      this.skip(); // Skip test if not in a git repository
    }
    // Given: taskId length > 120
    const longTaskId = 'a'.repeat(150);
    let worktree: TemporaryWorktree | undefined;
    try {
      // When: createTemporaryWorktree is called
      worktree = await createTemporaryWorktree({
        repoRoot,
        baseDir: tempBaseDir,
        taskId: longTaskId,
        ref: 'HEAD',
      });

      // Then: TaskId truncated to 120 chars, worktree created
      assert.ok(worktree !== undefined, 'Worktree should be created');
      const worktreeDirName = path.basename(worktree.worktreeDir);
      assert.ok(worktreeDirName.length <= 120, 'Worktree directory name should be truncated to 120 chars');
    } finally {
      if (worktree) {
        try {
          await removeTemporaryWorktree(repoRoot, worktree.worktreeDir);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }).timeout(30000);
});
