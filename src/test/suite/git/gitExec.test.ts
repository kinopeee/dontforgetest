import * as assert from 'assert';
import * as child_process from 'child_process';
import { execGitStdout, execGitResult } from '../../../git/gitExec';

suite('git/gitExec.ts', () => {
  const workspaceRoot = process.cwd();
  const childProcessMutable = child_process as unknown as { execFile: typeof child_process.execFile };
  const originalExecFile = child_process.execFile;

  teardown(() => {
    // Given: Restore original execFile after each test
    childProcessMutable.execFile = originalExecFile;
  });

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

  // TC-N-02: execGitStdout returns String(stdout) when stdout is not a string
  test('TC-N-02: execGitStdout converts non-string stdout to string', async () => {
    // Given: execFile returns Buffer stdout
    const cwd = workspaceRoot;
    const args = ['--version'];
    const stdoutBuffer = Buffer.from('git version mock', 'utf8');
    childProcessMutable.execFile = ((
      file: string,
      fileArgs: string[],
      options: child_process.ExecFileOptions,
      callback: (error: Error | null, stdout: unknown, stderr: unknown) => void,
    ) => {
      // When: execGitStdout is called (it will call execFile with prefixed args)
      assert.strictEqual(file, 'git');
      assert.ok(Array.isArray(fileArgs));
      assert.strictEqual(fileArgs[0], '-c');
      assert.strictEqual(fileArgs[1], 'core.quotepath=false');
      assert.strictEqual(fileArgs[2], '--version');
      assert.strictEqual((options as { cwd?: unknown }).cwd, cwd);
      callback(null, stdoutBuffer, Buffer.from(''));
    }) as typeof child_process.execFile;

    // When: execGitStdout is called
    const result = await execGitStdout(cwd, args, 1024 * 1024);

    // Then: It returns String(stdout) as string
    assert.strictEqual(result, String(stdoutBuffer));
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

  // TC-N-03: execGitResult converts non-string stdout/stderr to strings
  test('TC-N-03: execGitResult converts non-string stdout/stderr to strings', async () => {
    // Given: execFile resolves with Buffer stdout/stderr
    const cwd = workspaceRoot;
    const args = ['status'];
    const stdoutBuffer = Buffer.from('mock-stdout', 'utf8');
    const stderrBuffer = Buffer.from('mock-stderr', 'utf8');
    childProcessMutable.execFile = ((
      file: string,
      fileArgs: string[],
      options: child_process.ExecFileOptions,
      callback: (error: Error | null, stdout: unknown, stderr: unknown) => void,
    ) => {
      // When: execGitResult is called
      assert.strictEqual(file, 'git');
      assert.strictEqual(fileArgs[0], '-c');
      assert.strictEqual(fileArgs[1], 'core.quotepath=false');
      assert.strictEqual(fileArgs[2], 'status');
      assert.strictEqual((options as { maxBuffer?: unknown }).maxBuffer, 1024);
      callback(null, stdoutBuffer, stderrBuffer);
    }) as typeof child_process.execFile;

    // When: execGitResult is called
    const result = await execGitResult(cwd, args, 1024);

    // Then: ok=true and converted strings are returned
    assert.ok(result.ok === true);
    if (result.ok) {
      assert.strictEqual(result.stdout, String(stdoutBuffer));
      assert.strictEqual(result.stderr, String(stderrBuffer));
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
  test('TC-B-16: execGitStdout passes zero maxBufferBytes to execFile', async () => {
    // Given: maxBufferBytes=0 and execFile stub that asserts options
    const cwd = workspaceRoot;
    const args = ['--version'];
    childProcessMutable.execFile = ((
      file: string,
      fileArgs: string[],
      options: child_process.ExecFileOptions,
      callback: (error: Error | null, stdout: unknown, stderr: unknown) => void,
    ) => {
      // When: execGitStdout is called
      assert.strictEqual(file, 'git');
      assert.strictEqual(fileArgs[2], '--version');
      assert.strictEqual((options as { maxBuffer?: unknown }).maxBuffer, 0);
      callback(null, Buffer.from('git version mock', 'utf8'), Buffer.from(''));
    }) as typeof child_process.execFile;

    // When: execGitStdout is called
    const result = await execGitStdout(cwd, args, 0);

    // Then: It returns a string and does not throw
    assert.ok(typeof result === 'string');
    assert.ok(result.length > 0);
  });

  // TC-E-01: execGitResult returns trimmed joined output from stderr/stdout/message
  test('TC-E-01: execGitResult returns trimmed output joined by newlines', async () => {
    // Given: execFile rejects with Error containing stdout/stderr/message
    const cwd = workspaceRoot;
    const args = ['status'];
    childProcessMutable.execFile = ((
      file: string,
      fileArgs: string[],
      _options: child_process.ExecFileOptions,
      callback: (error: Error | null, stdout: unknown, stderr: unknown) => void,
    ) => {
      assert.strictEqual(file, 'git');
      assert.strictEqual(fileArgs[2], 'status');
      const err = new Error(' mock-message ');
      (err as unknown as { stdout?: unknown }).stdout = ' mock-stdout ';
      (err as unknown as { stderr?: unknown }).stderr = ' mock-stderr ';
      callback(err, (err as unknown as { stdout?: unknown }).stdout, (err as unknown as { stderr?: unknown }).stderr);
    }) as typeof child_process.execFile;

    // When: execGitResult is called
    const result = await execGitResult(cwd, args, 1024);

    // Then: ok=false and output contains stderr/stdout/message in order, trimmed
    assert.ok(result.ok === false);
    if (!result.ok) {
      assert.strictEqual(result.output, 'mock-stderr\nmock-stdout\nmock-message');
    }
  });

  // TC-E-02: execGitResult converts non-string stdout/stderr/message on error
  test('TC-E-02: execGitResult converts non-string stdout/stderr/message on error', async () => {
    // Given: execFile rejects with non-Error having stdout/stderr/message as non-string values
    const cwd = workspaceRoot;
    const args = ['status'];
    childProcessMutable.execFile = ((
      _file: string,
      _fileArgs: string[],
      _options: child_process.ExecFileOptions,
      callback: (error: Error | null, stdout: unknown, stderr: unknown) => void,
    ) => {
      const err = { stdout: Buffer.from('buf-out'), stderr: 123, message: { reason: 'x' } };
      callback(err as unknown as Error, err.stdout, err.stderr);
    }) as typeof child_process.execFile;

    // When: execGitResult is called
    const result = await execGitResult(cwd, args, 1024);

    // Then: ok=false and output contains String(...) of each part
    assert.ok(result.ok === false);
    if (!result.ok) {
      assert.ok(result.output.includes(String(123)));
      assert.ok(result.output.includes(String(Buffer.from('buf-out'))));
      assert.ok(result.output.includes(String({ reason: 'x' })));
    }
  });

  // TC-E-03: execGitResult returns '(詳細不明)' when all outputs are blank
  test("TC-E-03: execGitResult returns '(詳細不明)' when stderr/stdout/message are blank", async () => {
    // Given: execFile rejects with Error having blank stdout/stderr/message
    const cwd = workspaceRoot;
    const args = ['status'];
    childProcessMutable.execFile = ((
      _file: string,
      _fileArgs: string[],
      _options: child_process.ExecFileOptions,
      callback: (error: Error | null, stdout: unknown, stderr: unknown) => void,
    ) => {
      const err = new Error('   ');
      (err as unknown as { stdout?: unknown }).stdout = '   ';
      (err as unknown as { stderr?: unknown }).stderr = '';
      callback(err, '   ', '');
    }) as typeof child_process.execFile;

    // When: execGitResult is called
    const result = await execGitResult(cwd, args, 1024);

    // Then: ok=false and output is the fallback message
    assert.ok(result.ok === false);
    if (!result.ok) {
      assert.strictEqual(result.output, '(詳細不明)');
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
