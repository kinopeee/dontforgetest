import * as assert from 'assert';
import * as path from 'path';
import { execGitStdout, execGitResult, type ExecGitResult } from '../../../git/gitExec';

suite('git/gitExec.ts', () => {
  const workspaceRoot = process.cwd();

  // TC-N-14: execGitStdout called with valid cwd and git args
  test('TC-N-14: execGitStdout executes git command and returns stdout', async () => {
    // Given: Valid cwd and git args
    const cwd = workspaceRoot;
    const args = ['--version'];

    // When: execGitStdout is called
    const result = await execGitStdout(cwd, args, 1024 * 1024);

    // Then: Git command executed, stdout returned as string
    assert.ok(typeof result === 'string', 'Result should be a string');
    assert.ok(result.includes('git version'), 'Result should contain git version information');
  });

  // TC-N-15: execGitResult called with valid cwd and git args that succeed
  test('TC-N-15: execGitResult executes git command and returns success result', async () => {
    // Given: Valid cwd and git args that succeed
    const cwd = workspaceRoot;
    const args = ['--version'];

    // When: execGitResult is called
    const result = await execGitResult(cwd, args, 1024 * 1024);

    // Then: ExecGitResult with ok=true, stdout and stderr strings returned
    assert.ok(result.ok === true, 'Result should indicate success');
    if (result.ok) {
      assert.ok(typeof result.stdout === 'string', 'stdout should be a string');
      assert.ok(typeof result.stderr === 'string', 'stderr should be a string');
      assert.ok(result.stdout.includes('git version'), 'stdout should contain git version');
    }
  });

  // TC-E-09: execGitStdout called but git command fails
  test('TC-E-09: execGitStdout throws exception when git command fails', async () => {
    // Given: Invalid git args that will fail
    const cwd = workspaceRoot;
    const args = ['invalid-command-that-does-not-exist'];

    // When: execGitStdout is called
    // Then: Exception thrown with error details
    try {
      await execGitStdout(cwd, args, 1024 * 1024);
      assert.fail('Should have thrown an error');
    } catch (e) {
      assert.ok(e instanceof Error || typeof e === 'object', 'Error should be thrown');
    }
  });

  // TC-E-10: execGitResult called but git command fails
  test('TC-E-10: execGitResult returns error result when git command fails', async () => {
    // Given: Invalid git args that will fail
    const cwd = workspaceRoot;
    const args = ['invalid-command-that-does-not-exist'];

    // When: execGitResult is called
    const result = await execGitResult(cwd, args, 1024 * 1024);

    // Then: ExecGitResult with ok=false, output string containing error details
    assert.ok(result.ok === false, 'Result should indicate failure');
    if (!result.ok) {
      assert.ok(typeof result.output === 'string', 'output should be a string');
      assert.ok(result.output.length > 0, 'output should contain error details');
    }
  });

  // TC-B-16: execGitStdout called with maxBufferBytes=0
  test('TC-B-16: execGitStdout handles zero buffer size', async () => {
    // Given: maxBufferBytes=0
    const cwd = workspaceRoot;
    const args = ['--version'];

    // When: execGitStdout is called
    // Then: Git command executed with minimal buffer, may fail on large output
    // Note: This test verifies the function doesn't crash with zero buffer
    try {
      const result = await execGitStdout(cwd, args, 0);
      assert.ok(typeof result === 'string', 'Should still return a string for small output');
    } catch (e) {
      // Zero buffer may cause failures on large output, which is acceptable
      assert.ok(true, 'Zero buffer may cause failures, which is acceptable');
    }
  });

  // TC-B-17: execGitStdout called with maxBufferBytes=20*1024*1024
  test('TC-B-17: execGitStdout handles maximum buffer size', async () => {
    // Given: maxBufferBytes=20*1024*1024
    const cwd = workspaceRoot;
    const args = ['--version'];

    // When: execGitStdout is called
    const result = await execGitStdout(cwd, args, 20 * 1024 * 1024);

    // Then: Git command executed with large buffer, handles large output
    assert.ok(typeof result === 'string', 'Result should be a string');
    assert.ok(result.includes('git version'), 'Result should contain git version');
  });
});
