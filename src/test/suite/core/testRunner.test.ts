import * as assert from 'assert';
import { MAX_CAPTURE_BYTES, runTestCommand } from '../../../core/testRunner';

suite('core/testRunner.ts', () => {
  const cwd = process.cwd();
  const maxCaptureBytes = MAX_CAPTURE_BYTES;
  const nodeExecutable = process.execPath.includes(' ') ? `"${process.execPath}"` : process.execPath;
  const quoteDouble = (value: string): string => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const nodeEval = (code: string): string => `${nodeExecutable} -e ${quoteDouble(code)}`;
  const looksLikeCommandNotFoundMessage = (text: string): boolean =>
    /not found|command not found|enoent|no such file|cannot find|is not recognized/i.test(text);

  // TC-RUN-01
  test('TC-RUN-01: runs a successful command and captures stdout/stderr', async () => {
    // Given: An echo command (quote adjusted by OS)
    const command = process.platform === 'win32' ? 'echo hello world' : 'echo "hello world"';

    // When: runTestCommand is called
    const result = await runTestCommand({ command, cwd });

    // Then: Exit code is 0, stdout contains "hello world", stderr is empty
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.ok(result.stdout.includes('hello world'), 'Stdout should include the expected output');
    assert.strictEqual(result.stderr.trim(), '', 'Stderr should be empty');
  });

  // TC-RUN-02
  test('TC-RUN-02: returns an error message or non-zero exit code for an invalid command', async () => {
    // Given: A command that does not exist
    const command = 'invalid_command_that_does_not_exist_12345';

    // When: runTestCommand is called
    const result = await runTestCommand({ command, cwd });

    // Then: Either exitCode is non-zero or errorMessage is provided, and message looks like "command not found"
    assert.ok(result.exitCode !== 0 || result.errorMessage !== undefined, 'Should fail or return an errorMessage');
    const combined = `${result.errorMessage ?? ''}\n${result.stderr ?? ''}\n${result.stdout ?? ''}`;
    assert.ok(
      combined.includes(command) || looksLikeCommandNotFoundMessage(combined),
      'Error output should include the command name or a "command not found" like message',
    );
  });

  // TC-RUN-03
  test('TC-RUN-03: returns exitCode=1 for a command that exits with code 1', async () => {
    // Given: A command that exits with 1
    const command = process.platform === 'win32' ? 'cmd /c exit 1' : 'exit 1';

    // When: runTestCommand is called
    const result = await runTestCommand({ command, cwd });

    // Then: exitCode is 1
    assert.strictEqual(result.exitCode, 1, 'Exit code should be 1');
  });

  // TC-RUN-04
  test('TC-RUN-04: truncates very large stdout output', async function () {
    this.timeout(10000);
    // Given: A command that prints ~6MB (over the 5MB cap)
    const largeSize = 6 * 1024 * 1024;
    const command = nodeEval(`console.log('a'.repeat(${largeSize}))`);

    // When: runTestCommand is called
    const result = await runTestCommand({ command, cwd });

    // Then: The output is truncated and still non-empty
    assert.ok(result.stdout.includes('truncated'), 'Stdout should include the truncated marker');
    assert.ok(result.stdout.length < largeSize, 'Stdout should be smaller than the original output size');
    assert.ok(result.stdout.length > 0, 'Stdout should not be empty');
    assert.strictEqual(result.stdoutTruncated, true, 'stdoutTruncated should be true');
  });

  // TC-TRUNNER-N-01
  test('TC-TRUNNER-N-01: runTestCommand sets executionRunner="extension" on success', async () => {
    // Given: A successful command and a failing command (exit code != 0)
    const okCommand = process.platform === 'win32' ? 'echo ok' : 'echo "ok"';

    // When: runTestCommand is called
    const ok = await runTestCommand({ command: okCommand, cwd });

    // Then: executionRunner is "extension"
    assert.strictEqual(ok.executionRunner, 'extension');
  });

  // TC-TRUNNER-E-01
  test('TC-TRUNNER-E-01: runTestCommand sets errorMessage and keeps executionRunner="extension" on spawn/exec error', async () => {
    // Given: A command that does not exist (spawn/exec error)
    const command = 'invalid_command_that_does_not_exist_12345';

    // When: runTestCommand is called
    const result = await runTestCommand({ command, cwd });

    // Then: Non-zero exit (or errorMessage) and executionRunner is "extension"
    // NOTE: With shell=true, "command not found" may surface as exitCode=127 rather than a spawn error.
    assert.ok(
      result.exitCode !== 0 || (typeof result.errorMessage === 'string' && result.errorMessage.trim().length > 0),
      'Should fail or set errorMessage',
    );
    const combined = `${result.errorMessage ?? ''}\n${result.stderr ?? ''}\n${result.stdout ?? ''}`;
    assert.ok(
      combined.includes(command) || looksLikeCommandNotFoundMessage(combined),
      'Error output should include the command name or a "command not found" like message',
    );
    assert.strictEqual(result.executionRunner, 'extension', 'executionRunner should remain extension');
  });

  // TC-TRUN-B-00
  test('TC-TRUN-B-00: runTestCommand returns exitCode=0 and empty stdout/stderr when the command produces no output', async () => {
    // Given: A command that exits successfully without writing stdout/stderr
    const command = nodeEval('process.exit(0)');

    // When: runTestCommand is called
    const result = await runTestCommand({ command, cwd });

    // Then: stdout/stderr are empty (or whitespace-only) and executionRunner is extension
    assert.strictEqual(result.exitCode, 0);
    assert.ok((result.stdout ?? '').trim().length === 0, 'stdout should be empty');
    assert.ok((result.stderr ?? '').trim().length === 0, 'stderr should be empty');
    assert.strictEqual(result.executionRunner, 'extension');
  });

  // TC-TRUN-B-MAX
  test('TC-TRUN-B-MAX: runTestCommand does not truncate stdout when stdout length == maxCaptureBytes', async function () {
    this.timeout(15000);
    // Given: A command that writes exactly maxCaptureBytes to stdout (no newline)
    const command = nodeEval(`process.stdout.write('a'.repeat(${maxCaptureBytes}))`);

    // When: runTestCommand is called
    const result = await runTestCommand({ command, cwd });

    // Then: It is not truncated and executionRunner is extension
    assert.strictEqual(result.exitCode, 0);
    assert.ok(!result.stdout.includes('... (stdout truncated)'), 'stdout must not include truncation marker');
    assert.strictEqual(result.stdout.length, maxCaptureBytes, 'stdout length should be exactly maxCaptureBytes');
    assert.strictEqual(result.stdoutTruncated, false, 'stdoutTruncated should be false');
    assert.strictEqual(result.executionRunner, 'extension');
  });

  // TC-TRUN-B-MAXP1
  test('TC-TRUN-B-MAXP1: runTestCommand truncates stdout when stdout length > maxCaptureBytes', async function () {
    this.timeout(15000);
    // Given: A command that writes maxCaptureBytes+1 to stdout (no newline)
    const command = nodeEval(`process.stdout.write('a'.repeat(${maxCaptureBytes + 1}))`);

    // When: runTestCommand is called
    const result = await runTestCommand({ command, cwd });

    // Then: It is truncated and executionRunner is extension
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('... (stdout truncated)'), 'stdout must include truncation marker');
    assert.ok(result.stdout.length <= maxCaptureBytes + '... (stdout truncated)'.length + 10, 'stdout should be capped');
    assert.strictEqual(result.stdoutTruncated, true, 'stdoutTruncated should be true');
    assert.strictEqual(result.executionRunner, 'extension');
  });

  test('TC-RUNNER-TRUNC-B-FALSE-01: runTestCommand returns stdoutTruncated=false and stderrTruncated=false and does not append truncation markers', async () => {
    // Given: A command that writes small outputs to both stdout and stderr
    const command = nodeEval(`process.stdout.write('ok'); process.stderr.write('warn');`);

    // When: runTestCommand is called
    const result = await runTestCommand({ command, cwd });

    // Then: No truncation markers exist and both flags are false
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stdout, 'ok');
    assert.strictEqual(result.stderr, 'warn');
    assert.ok(!result.stdout.includes('... (stdout truncated)'), 'stdout must not include truncation marker');
    assert.ok(!result.stderr.includes('... (stderr truncated)'), 'stderr must not include truncation marker');
    assert.strictEqual(result.stdoutTruncated, false);
    assert.strictEqual(result.stderrTruncated, false);
  });

  test('TC-RUNNER-TRUNC-N-01: runTestCommand includes stdoutTruncated/stderrTruncated booleans in the result', async function () {
    this.timeout(20000);
    // Given: A command that produces very large stdout and small stderr
    const largeSize = 6 * 1024 * 1024;
    const command = nodeEval(`process.stdout.write('a'.repeat(${largeSize})); process.stderr.write('e');`);

    // When: runTestCommand is called
    const result = await runTestCommand({ command, cwd });

    // Then: stdout is truncated, stderr is not truncated, and flags reflect it
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stderrTruncated, false);
    assert.strictEqual(result.stdoutTruncated, true);
    assert.ok(result.stdout.includes('... (stdout truncated)'), 'stdout must include truncation marker');
    assert.ok(!result.stderr.includes('... (stderr truncated)'), 'stderr must not include truncation marker');
  });

  test('TC-RUNNER-TRUNC-B-TRUE-01: runTestCommand appends truncation markers and sets both truncation flags when both streams exceed max', async function () {
    this.timeout(25000);
    // Given: A command that produces very large stdout and stderr
    const largeSize = 6 * 1024 * 1024;
    const command = nodeEval(`process.stdout.write('a'.repeat(${largeSize})); process.stderr.write('b'.repeat(${largeSize}));`);

    // When: runTestCommand is called
    const result = await runTestCommand({ command, cwd });

    // Then: Both streams are truncated and both flags are true
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stdoutTruncated, true);
    assert.strictEqual(result.stderrTruncated, true);
    assert.ok(result.stdout.includes('... (stdout truncated)'), 'stdout must include truncation marker');
    assert.ok(result.stderr.includes('... (stderr truncated)'), 'stderr must include truncation marker');
  });

  test('TC-TRUN-ENV-N-01: merges options.env into process.env and options.env takes precedence', async () => {
    // Given: A base env value and an overriding env value passed via options.env
    const key = 'DONTFORGETEST_TEST_RUNNER_ENV_MERGE';
    const original = process.env[key];
    process.env[key] = 'base';

    const command = nodeEval(`process.stdout.write(process.env[${JSON.stringify(key)}] || '')`);

    try {
      // When: runTestCommand is called with env override
      const result = await runTestCommand({ command, cwd, env: { [key]: 'override' } });

      // Then: The spawned process sees the overridden value
      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(result.stdout, 'override');
    } finally {
      process.env[key] = original;
    }
  });

  test('TC-TRUN-ENV-B-01: passes process.env as-is when options.env is omitted', async () => {
    // Given: A process.env value and no options.env
    const key = 'DONTFORGETEST_TEST_RUNNER_ENV_NO_OVERRIDE';
    const original = process.env[key];
    process.env[key] = 'value';

    const command = nodeEval(`process.stdout.write(process.env[${JSON.stringify(key)}] || '')`);

    try {
      // When: runTestCommand is called without env
      const result = await runTestCommand({ command, cwd });

      // Then: The spawned process sees the value from process.env
      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(result.stdout, 'value');
    } finally {
      process.env[key] = original;
    }
  });
});
