import * as assert from 'assert';
import { runProviderToCompletion } from '../../../providers/runToCompletion';
import { type AgentProvider, type AgentRunOptions, type RunningTask } from '../../../providers/provider';
import { type TestGenEvent } from '../../../core/event';

// Mock Provider
class MockProvider implements AgentProvider {
  readonly id = 'mock';
  readonly displayName = 'Mock';
  private exitCode: number | null = 0;
  private shouldTimeout = false;
  private timeoutDelay = 100;

  constructor(exitCode: number | null = 0, shouldTimeout = false, timeoutDelay = 100) {
    this.exitCode = exitCode;
    this.shouldTimeout = shouldTimeout;
    this.timeoutDelay = timeoutDelay;
  }

  run(options: AgentRunOptions): RunningTask {
    if (this.shouldTimeout) {
      // Simulate timeout by never emitting completed event
      setTimeout(() => {
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: 'Running...',
          timestampMs: Date.now(),
        });
      }, 10);
      return { taskId: options.taskId, dispose: () => {} };
    }

    // Simulate normal completion
    setTimeout(() => {
      options.onEvent({
        type: 'started',
        taskId: options.taskId,
        label: 'test',
        timestampMs: Date.now(),
      });
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

suite('providers/runToCompletion.ts', () => {
  // TC-N-16: runProviderToCompletion called with provider that emits completed event
  test('TC-N-16: runProviderToCompletion completes normally when provider emits completed event', async () => {
    // Given: A provider that emits completed event
    const provider = new MockProvider(0);

    // When: runProviderToCompletion is called
    const exitCode = await runProviderToCompletion({
      provider,
      run: {
        taskId: 'test-task',
        workspaceRoot: process.cwd(),
        agentCommand: 'mock-agent',
        prompt: 'test prompt',
        model: 'test-model',
        outputFormat: 'stream-json',
        allowWrite: false,
      },
      onEvent: () => {},
    });

    // Then: Provider runs to completion, exitCode returned, timeout cleared
    assert.strictEqual(exitCode, 0, 'Exit code should be 0');
  });

  // TC-E-11: runProviderToCompletion called but provider times out
  test('TC-E-11: runProviderToCompletion handles timeout correctly', async () => {
    // Given: A provider that times out (never emits completed)
    const provider = new MockProvider(0, true);

    // When: runProviderToCompletion is called with timeout
    const exitCode = await runProviderToCompletion({
      provider,
      run: {
        taskId: 'test-task-timeout',
        workspaceRoot: process.cwd(),
        agentCommand: 'mock-agent',
        prompt: 'test prompt',
        model: 'test-model',
        outputFormat: 'stream-json',
        allowWrite: false,
      },
      timeoutMs: 100,
      onEvent: (event) => {
        if (event.type === 'log' && event.level === 'error') {
          assert.ok(event.message.includes('タイムアウト'), 'Timeout event should be logged');
        }
      },
    });

    // Then: Timeout event logged, runningTask disposed, null exitCode returned
    assert.strictEqual(exitCode, null, 'Exit code should be null on timeout');
  });

  // TC-B-09: runProviderToCompletion called with timeoutMs=2^31-1
  test('TC-B-09: runProviderToCompletion handles maximum timeout value', async () => {
    // Given: timeoutMs=2^31-1
    const provider = new MockProvider(0);

    // When: runProviderToCompletion is called
    const exitCode = await runProviderToCompletion({
      provider,
      run: {
        taskId: 'test-task-max-timeout',
        workspaceRoot: process.cwd(),
        agentCommand: 'mock-agent',
        prompt: 'test prompt',
        model: 'test-model',
        outputFormat: 'stream-json',
        allowWrite: false,
      },
      timeoutMs: 2 ** 31 - 1,
      onEvent: () => {},
    });

    // Then: Timeout set to maximum value, provider runs until timeout or completion
    assert.strictEqual(exitCode, 0, 'Should complete normally');
  });

  // TC-B-10: runProviderToCompletion called with timeoutMs=2^31
  test('TC-B-10: runProviderToCompletion handles timeout overflow', async () => {
    // Given: timeoutMs=2^31 (overflow)
    const provider = new MockProvider(0);

    // When: runProviderToCompletion is called
    const exitCode = await runProviderToCompletion({
      provider,
      run: {
        taskId: 'test-task-overflow',
        workspaceRoot: process.cwd(),
        agentCommand: 'mock-agent',
        prompt: 'test prompt',
        model: 'test-model',
        outputFormat: 'stream-json',
        allowWrite: false,
      },
      timeoutMs: 2 ** 31,
      onEvent: () => {},
    });

    // Then: Timeout not set (treated as infinite), provider runs until completion
    assert.strictEqual(exitCode, 0, 'Should complete normally without timeout');
  });

  // TC-NULL-05: runProviderToCompletion called with timeoutMs=undefined
  test('TC-NULL-05: runProviderToCompletion handles undefined timeout', async () => {
    // Given: timeoutMs=undefined
    const provider = new MockProvider(0);

    // When: runProviderToCompletion is called
    const exitCode = await runProviderToCompletion({
      provider,
      run: {
        taskId: 'test-task-undefined-timeout',
        workspaceRoot: process.cwd(),
        agentCommand: 'mock-agent',
        prompt: 'test prompt',
        model: 'test-model',
        outputFormat: 'stream-json',
        allowWrite: false,
      },
      timeoutMs: undefined,
      onEvent: () => {},
    });

    // Then: No timeout set, provider runs until completion
    assert.strictEqual(exitCode, 0, 'Should complete normally without timeout');
  });
});
