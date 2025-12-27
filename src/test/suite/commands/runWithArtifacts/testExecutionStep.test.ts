import * as assert from 'assert';
import * as vscode from 'vscode';
import { runTestCommandViaCursorAgent } from '../../../../commands/runWithArtifacts/testExecutionStep';
import { type AgentProvider, type AgentRunOptions, type RunningTask } from '../../../../providers/provider';
import { t } from '../../../../core/l10n';

// Mock Provider
class MockTestExecutionProvider implements AgentProvider {
  readonly id = 'mock-test-execution';
  readonly displayName = 'Mock Test Execution';
  private exitCode: number | null = 0;
  private output: string;
  private shouldFail = false;

  constructor(exitCode: number | null = 0, output?: string, shouldFail = false) {
    this.exitCode = exitCode;
    this.shouldFail = shouldFail;
    this.output =
      output ??
      '<!-- BEGIN TEST EXECUTION JSON -->\n{"version":1,"exitCode":0,"signal":null,"durationMs":1000,"stdout":"test output","stderr":""}\n<!-- END TEST EXECUTION JSON -->';
  }

  run(options: AgentRunOptions): RunningTask {
    setTimeout(() => {
      options.onEvent({
        type: 'started',
        taskId: options.taskId,
        label: 'test-command',
        timestampMs: Date.now(),
      });
      if (!this.shouldFail) {
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: this.output,
          timestampMs: Date.now(),
        });
      }
      options.onEvent({
        type: 'completed',
        taskId: options.taskId,
        exitCode: this.exitCode,
        timestampMs: Date.now(),
      });
    }, 10);
    return { taskId: options.taskId, dispose: () => {} };
  }
}

suite('commands/runWithArtifacts/testExecutionStep.ts', () => {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  function buildJsonPayload(json: string): string {
    return ['<!-- BEGIN TEST EXECUTION JSON -->', json, '<!-- END TEST EXECUTION JSON -->'].join('\n');
  }

  function buildLegacyPayload(params: {
    exitCodeLine: string;
    signalLine: string;
    durationMsLine?: string;
    stdout?: string;
    stderr?: string;
    includeStdoutMarkers?: boolean;
    includeStderrMarkers?: boolean;
  }): string {
    const lines: string[] = [];
    lines.push('<!-- BEGIN TEST EXECUTION JSON -->');
    lines.push('{ invalid json }');
    lines.push('<!-- END TEST EXECUTION JSON -->');
    lines.push('<!-- BEGIN TEST EXECUTION RESULT -->');
    lines.push(params.exitCodeLine);
    lines.push(params.signalLine);
    if (params.durationMsLine) {
      lines.push(params.durationMsLine);
    }
    if (params.includeStdoutMarkers !== false) {
      lines.push('<!-- BEGIN STDOUT -->');
      if (params.stdout !== undefined) {
        lines.push(params.stdout);
      }
      lines.push('<!-- END STDOUT -->');
    }
    if (params.includeStderrMarkers !== false) {
      lines.push('<!-- BEGIN STDERR -->');
      if (params.stderr !== undefined) {
        lines.push(params.stderr);
      }
      lines.push('<!-- END STDERR -->');
    }
    lines.push('<!-- END TEST EXECUTION RESULT -->');
    return lines.join('\n');
  }

  async function run(params: { provider: AgentProvider; taskIdSuffix: string }): Promise<import('../../../../core/artifacts').TestExecutionResult> {
    return await runTestCommandViaCursorAgent({
      provider: params.provider,
      taskId: `test-execution-${params.taskIdSuffix}-${Date.now()}`,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      model: 'test-model',
      testCommand: 'echo test',
      allowForce: false,
      onEvent: () => {},
    });
  }

  test('TC-CARUNNER-N-01: runTestCommandViaCursorAgent sets executionRunner="cursorAgent" on JSON parse success', async () => {
    // Given: A provider that returns a valid JSON payload with markers
    const provider = new MockTestExecutionProvider(
      0,
      buildJsonPayload('{"version":1,"exitCode":0,"signal":null,"durationMs":123,"stdout":"test output","stderr":""}'),
      false,
    );

    // When: runTestCommandViaCursorAgent is called
    const result = await run({ provider, taskIdSuffix: 'json-ok' });

    // Then: It returns parsed values and executionRunner is cursorAgent
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stdout, 'test output');
    assert.strictEqual(result.executionRunner, 'cursorAgent');
  });

  test('TC-CARUNNER-B-01: runTestCommandViaCursorAgent returns durationMs=1 when JSON durationMs=1', async () => {
    // Given: JSON durationMs=1 (boundary min)
    const provider = new MockTestExecutionProvider(
      0,
      buildJsonPayload('{"version":1,"exitCode":0,"signal":null,"durationMs":1,"stdout":"","stderr":""}'),
      false,
    );

    // When: runTestCommandViaCursorAgent is called
    const result = await run({ provider, taskIdSuffix: 'json-dur-1' });

    // Then: JSON durationMs is used
    assert.strictEqual(result.durationMs, 1);
    assert.strictEqual(result.executionRunner, 'cursorAgent');
  });

  test('TC-CARUNNER-B-00: runTestCommandViaCursorAgent falls back to measured durationMs when JSON durationMs=0', async () => {
    // Given: JSON durationMs=0 and nowMs is deterministic (startedAt=1000, end=1100)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const event = require('../../../../core/event') as typeof import('../../../../core/event');
    const originalNowMs = event.nowMs;
    const nowValues = [1000, 1100];
    event.nowMs = (() => nowValues.shift() ?? 1100) as unknown as typeof event.nowMs;

    try {
      const provider = new MockTestExecutionProvider(
        0,
        buildJsonPayload('{"version":1,"exitCode":0,"signal":null,"durationMs":0,"stdout":"","stderr":""}'),
        false,
      );

      // When: runTestCommandViaCursorAgent is called
      const result = await run({ provider, taskIdSuffix: 'json-dur-0' });

      // Then: durationMs uses fallback measurement (=100ms) and executionRunner is cursorAgent
      assert.strictEqual(result.durationMs, 100);
      assert.strictEqual(result.executionRunner, 'cursorAgent');
    } finally {
      event.nowMs = originalNowMs;
    }
  });

  test('TC-CARUNNER-E-01: runTestCommandViaCursorAgent returns prefixed extractFailed message when JSON exists but is invalid and legacy markers are missing', async () => {
    // Given: Extracted JSON exists but parseTestExecutionJsonV1 returns ok=false, and legacy markers do not exist
    const provider = new MockTestExecutionProvider(0, buildJsonPayload('{"version":2}'), false);

    // When: runTestCommandViaCursorAgent is called
    const result = await run({ provider, taskIdSuffix: 'json-bad-no-legacy' });

    // Then: errorMessage has the jsonParsePrefix + noMarkers and executionRunner is cursorAgent
    const expected = `${t('testExecution.extractFailed.jsonParsePrefix')}${t('testExecution.extractFailed.noMarkers')}`.trim();
    assert.strictEqual(result.errorMessage, expected);
    assert.strictEqual(result.executionRunner, 'cursorAgent');
  });

  test('TC-CARUNNER-E-02: runTestCommandViaCursorAgent returns noMarkers message when both JSON and legacy markers are missing', async () => {
    // Given: Provider output has no JSON/legacy markers
    const provider = new MockTestExecutionProvider(1, 'just some text without markers', false);

    // When: runTestCommandViaCursorAgent is called
    const result = await run({ provider, taskIdSuffix: 'no-markers' });

    // Then: errorMessage is noMarkers and executionRunner is cursorAgent
    assert.strictEqual(result.errorMessage, t('testExecution.extractFailed.noMarkers').trim());
    assert.strictEqual(result.executionRunner, 'cursorAgent');
  });

  test('TC-CARUNNER-N-02: runTestCommandViaCursorAgent falls back to legacy format when JSON is extracted but cannot be parsed and legacy markers exist', async () => {
    // Given: A provider output with invalid JSON markers but a valid legacy payload
    const provider = new MockTestExecutionProvider(
      1,
      buildLegacyPayload({
        exitCodeLine: 'exitCode: 1',
        signalLine: 'signal: null',
        durationMsLine: 'durationMs: 42',
        stdout: 'legacy stdout',
        stderr: 'legacy stderr',
      }),
      false,
    );

    // When: runTestCommandViaCursorAgent is called
    const result = await run({ provider, taskIdSuffix: 'legacy-ok' });

    // Then: It uses legacy markers, keeps executionRunner=cursorAgent, and extracts stdout/stderr/exitCode
    assert.strictEqual(result.executionRunner, 'cursorAgent');
    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(result.stdout, 'legacy stdout');
    assert.strictEqual(result.stderr, 'legacy stderr');
    assert.strictEqual(result.durationMs, 42);
  });

  test('TC-CARUNNER-B-NULL: legacy fallback returns exitCode=null when legacy exitCode is "null"', async () => {
    // Given: Legacy payload with exitCode: null
    const provider = new MockTestExecutionProvider(
      null,
      buildLegacyPayload({
        exitCodeLine: 'exitCode: null',
        signalLine: 'signal: null',
        durationMsLine: 'durationMs: 1',
        stdout: 'x',
        stderr: 'y',
      }),
      false,
    );

    // When: runTestCommandViaCursorAgent is called
    const result = await run({ provider, taskIdSuffix: 'legacy-exit-null' });

    // Then: exitCode is null
    assert.strictEqual(result.exitCode, null);
    assert.strictEqual(result.executionRunner, 'cursorAgent');
  });

  test('TC-CARUNNER-B-MINUS1: legacy fallback returns exitCode=-1 when legacy exitCode is "-1"', async () => {
    // Given: Legacy payload with exitCode: -1
    const provider = new MockTestExecutionProvider(
      -1,
      buildLegacyPayload({
        exitCodeLine: 'exitCode: -1',
        signalLine: 'signal: null',
        durationMsLine: 'durationMs: 1',
        stdout: '',
        stderr: '',
      }),
      false,
    );

    // When: runTestCommandViaCursorAgent is called
    const result = await run({ provider, taskIdSuffix: 'legacy-exit-minus1' });

    // Then: exitCode is -1
    assert.strictEqual(result.exitCode, -1);
    assert.strictEqual(result.executionRunner, 'cursorAgent');
  });

  test('TC-CARUNNER-B-EMPTY: legacy fallback returns empty stdout/stderr when stdout/stderr markers are missing', async () => {
    // Given: Legacy payload without stdout/stderr markers (boundary empty)
    const provider = new MockTestExecutionProvider(
      0,
      buildLegacyPayload({
        exitCodeLine: 'exitCode: 0',
        signalLine: 'signal: null',
        durationMsLine: 'durationMs: 1',
        includeStdoutMarkers: false,
        includeStderrMarkers: false,
      }),
      false,
    );

    // When: runTestCommandViaCursorAgent is called
    const result = await run({ provider, taskIdSuffix: 'legacy-no-stdout-stderr' });

    // Then: stdout/stderr are empty strings
    assert.strictEqual(result.stdout, '');
    assert.strictEqual(result.stderr, '');
    assert.strictEqual(result.executionRunner, 'cursorAgent');
  });

  test('TC-CARUNNER-N-03: legacy fallback parses signal when signal is present (SIGTERM)', async () => {
    // Given: Legacy payload with signal: SIGTERM
    const provider = new MockTestExecutionProvider(
      0,
      buildLegacyPayload({
        exitCodeLine: 'exitCode: 0',
        signalLine: 'signal: SIGTERM',
        durationMsLine: 'durationMs: 1',
        stdout: '',
        stderr: '',
      }),
      false,
    );

    // When: runTestCommandViaCursorAgent is called
    const result = await run({ provider, taskIdSuffix: 'legacy-signal' });

    // Then: signal is parsed
    assert.strictEqual(result.signal, 'SIGTERM');
    assert.strictEqual(result.executionRunner, 'cursorAgent');
  });

  test('TC-CARUNNER-B-01DUR: legacy fallback uses measured durationMs when durationMs line is missing', async () => {
    // Given: Legacy payload without durationMs line and nowMs is deterministic (startedAt=2000, end=2050)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const event = require('../../../../core/event') as typeof import('../../../../core/event');
    const originalNowMs = event.nowMs;
    const nowValues = [2000, 2050];
    event.nowMs = (() => nowValues.shift() ?? 2050) as unknown as typeof event.nowMs;

    try {
      const provider = new MockTestExecutionProvider(
        0,
        buildLegacyPayload({
          exitCodeLine: 'exitCode: 0',
          signalLine: 'signal: null',
          durationMsLine: undefined,
          stdout: 'ok',
          stderr: '',
        }),
        false,
      );

      // When: runTestCommandViaCursorAgent is called
      const result = await run({ provider, taskIdSuffix: 'legacy-no-dur' });

      // Then: durationMs is the measured delta (=50ms)
      assert.strictEqual(result.durationMs, 50);
      assert.strictEqual(result.executionRunner, 'cursorAgent');
    } finally {
      event.nowMs = originalNowMs;
    }
  });

  // Existing coverage kept (not part of the provided perspective table)
  test('TC-NULL-03: runTestCommandViaCursorAgent handles undefined model', async () => {
    // Given: model=undefined
    const provider = new MockTestExecutionProvider(0);

    // When: runTestCommandViaCursorAgent is called
    const result = await runTestCommandViaCursorAgent({
      provider,
      taskId: `test-execution-undefined-model-${Date.now()}`,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      model: undefined,
      testCommand: 'echo test',
      allowForce: false,
      onEvent: () => {},
    });

    // Then: A result is returned
    assert.ok(result !== undefined);
  });
});
