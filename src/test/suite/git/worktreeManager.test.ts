import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createTemporaryWorktree, removeTemporaryWorktree, type TemporaryWorktree } from '../../../git/worktreeManager';
import { execGitStdout } from '../../../git/gitExec';

suite('git/worktreeManager.ts', () => {
  let tempBaseDir: string;
  let repoRoot: string;

  suiteSetup(() => {
    // Find the actual git repository root
    repoRoot = process.cwd();
    // Verify we're in a git repo
    try {
      execGitStdout(repoRoot, ['rev-parse', '--git-dir'], 1024 * 1024).catch(() => {
        // Not a git repo, skip tests
      });
    } catch {
      // Not a git repo, skip tests
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
      assert.ok(!worktree.worktreeDir.includes('/'), 'Worktree directory should not contain special characters');
      assert.ok(!worktree.worktreeDir.includes('<'), 'Worktree directory should not contain <');
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
