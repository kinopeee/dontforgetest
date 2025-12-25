import * as assert from 'assert';
import * as vscode from 'vscode';
import { runTestCommandViaCursorAgent } from '../../../commands/runWithArtifacts/testExecutionStep';
import { type AgentProvider, type AgentRunOptions, type RunningTask } from '../../../providers/provider';
import { type TestGenEvent } from '../../../core/event';

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

  // TC-N-10: runTestCommandViaCursorAgent called with valid test command and successful execution
  test('TC-N-10: runTestCommandViaCursorAgent executes test command and returns TestExecutionResult', async () => {
    // Given: Valid test command and successful execution
    const provider = new MockTestExecutionProvider(0);
    const taskId = `test-execution-${Date.now()}`;
    const events: TestGenEvent[] = [];

    // When: runTestCommandViaCursorAgent is called
    const result = await runTestCommandViaCursorAgent({
      provider,
      taskId,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      model: 'test-model',
      testCommand: 'echo test',
      allowForce: false,
      onEvent: (event) => {
        events.push(event);
      },
    });

    // Then: Test command executed via cursor-agent, JSON result parsed, TestExecutionResult returned
    assert.ok(result !== undefined, 'Result should be returned');
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.ok(result.stdout.includes('test output'), 'Stdout should contain test output');
    assert.ok(events.length > 0, 'Events should be emitted');
  });

  // TC-E-08: runTestCommandViaCursorAgent called but cursor-agent execution fails
  test('TC-E-08: runTestCommandViaCursorAgent handles cursor-agent execution failure', async () => {
    // Given: Provider that fails to execute
    const provider = new MockTestExecutionProvider(1, 'Execution failed', true);
    const taskId = `test-execution-fail-${Date.now()}`;

    // When: runTestCommandViaCursorAgent is called
    const result = await runTestCommandViaCursorAgent({
      provider,
      taskId,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      model: 'test-model',
      testCommand: 'echo test',
      allowForce: false,
      onEvent: () => {},
    });

    // Then: TestExecutionResult with errorMessage, fallback to extension runner attempted
    assert.ok(result !== undefined, 'Result should be returned even on failure');
    assert.ok(result.exitCode !== 0 || result.errorMessage !== undefined, 'Should indicate failure');
  });

  // TC-NULL-03: runTestCommandViaCursorAgent called with model=undefined
  test('TC-NULL-03: runTestCommandViaCursorAgent handles undefined model', async () => {
    // Given: model=undefined
    const provider = new MockTestExecutionProvider(0);
    const taskId = `test-execution-undefined-model-${Date.now()}`;

    // When: runTestCommandViaCursorAgent is called
    const result = await runTestCommandViaCursorAgent({
      provider,
      taskId,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      model: undefined,
      testCommand: 'echo test',
      allowForce: false,
      onEvent: () => {},
    });

    // Then: Provider uses default model, test execution proceeds
    assert.ok(result !== undefined, 'Result should be returned');
  });
});
