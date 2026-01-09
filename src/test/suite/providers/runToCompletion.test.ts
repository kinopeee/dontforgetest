import * as assert from 'assert';
import { runProviderToCompletion } from '../../../providers/runToCompletion';
import { type AgentProvider, type AgentRunOptions, type RunningTask } from '../../../providers/provider';

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

class TimeoutDisposeThrowProvider implements AgentProvider {
  readonly id = 'timeout-dispose-throw';
  readonly displayName = 'TimeoutDisposeThrow';

  run(options: AgentRunOptions): RunningTask {
    // completed は送らず、タイムアウト経路へ誘導する
    setTimeout(() => {
      options.onEvent({
        type: 'log',
        taskId: options.taskId,
        level: 'info',
        message: 'still running...',
        timestampMs: Date.now(),
      });
    }, 10);
    return {
      taskId: options.taskId,
      dispose: () => {
        throw new Error('dispose failed');
      },
    };
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

    // Then: プロバイダーが正常に完了し、exitCode が返される
    assert.strictEqual(exitCode, 0, 'exitCode が 0 であること');
  });

  test('TC-E-ON-EVENT-01: runProviderToCompletion swallows exceptions thrown by onEvent callbacks', async () => {
    // Given: A provider that completes normally, and an onEvent that throws
    const provider = new MockProvider(0);
    let called = 0;

    // When: runProviderToCompletion is called
    const exitCode = await runProviderToCompletion({
      provider,
      run: {
        taskId: 'test-task-onEvent-throws',
        workspaceRoot: process.cwd(),
        agentCommand: 'mock-agent',
        prompt: 'test prompt',
        model: 'test-model',
        outputFormat: 'stream-json',
        allowWrite: false,
      },
      onEvent: () => {
        called += 1;
        throw new Error('onEvent failure');
      },
    });

    // Then: It still resolves with the provider exitCode
    assert.ok(called > 0, 'Expected onEvent to be called');
    assert.strictEqual(exitCode, 0);
  });

  test('TC-N-ONRUNNINGTASK-01: runProviderToCompletion calls onRunningTask with the RunningTask returned by provider', async () => {
    // Given: A provider that completes normally
    const provider = new MockProvider(0);
    let runningTaskId: string | undefined;

    // When: runProviderToCompletion is called
    const exitCode = await runProviderToCompletion({
      provider,
      run: {
        taskId: 'test-task-onRunningTask',
        workspaceRoot: process.cwd(),
        agentCommand: 'mock-agent',
        prompt: 'test prompt',
        model: 'test-model',
        outputFormat: 'stream-json',
        allowWrite: false,
      },
      onEvent: () => {},
      onRunningTask: (runningTask) => {
        runningTaskId = runningTask.taskId;
      },
    });

    // Then: It was notified and the task still completes
    assert.strictEqual(runningTaskId, 'test-task-onRunningTask');
    assert.strictEqual(exitCode, 0);
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

    // Then: タイムアウト時には null の exitCode が返される
    assert.strictEqual(exitCode, null, 'タイムアウト時には exitCode が null であること');
  });

  test('TC-E-DISPOSE-01: timeout path swallows exceptions from running.dispose() and onEvent', async () => {
    // Given: A provider that never completes and dispose() throws
    const provider = new TimeoutDisposeThrowProvider();
    let sawTimeoutLog = false;

    // When: runProviderToCompletion is called with timeout and onEvent throws
    const exitCode = await runProviderToCompletion({
      provider,
      run: {
        taskId: 'test-task-timeout-dispose-throws',
        workspaceRoot: process.cwd(),
        agentCommand: 'mock-agent',
        prompt: 'test prompt',
        model: 'test-model',
        outputFormat: 'stream-json',
        allowWrite: false,
      },
      timeoutMs: 50,
      onEvent: (event) => {
        if (event.type === 'log' && event.level === 'error' && event.message.includes('タイムアウト')) {
          sawTimeoutLog = true;
        }
        // throw to cover the internal try/catch in the timeout handler
        throw new Error('onEvent error');
      },
    });

    // Then: It resolves with null and does not throw
    assert.strictEqual(exitCode, null);
    assert.strictEqual(sawTimeoutLog, true);
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

    // Then: 正常に完了する
    assert.strictEqual(exitCode, 0, '正常に完了すること');
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

    // Then: タイムアウトせずに正常に完了する
    assert.strictEqual(exitCode, 0, 'タイムアウトせずに正常に完了すること');
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

    // Then: タイムアウトせずに正常に完了する
    assert.strictEqual(exitCode, 0, 'タイムアウトせずに正常に完了すること');
  });

  // TC-NULL-06: runProviderToCompletion called with model=undefined
  test('TC-NULL-06: runProviderToCompletion handles undefined model', async () => {
    // Given: model=undefined
    const provider = new MockProvider(0);

    // When: runProviderToCompletion is called
    const exitCode = await runProviderToCompletion({
      provider,
      run: {
        taskId: 'test-task-undefined-model',
        workspaceRoot: process.cwd(),
        agentCommand: 'mock-agent',
        prompt: 'test prompt',
        model: undefined,
        outputFormat: 'stream-json',
        allowWrite: false,
      },
      onEvent: () => {},
    });

    // Then: model=undefined でも正常に完了する
    assert.strictEqual(exitCode, 0, 'model=undefined でも正常に完了すること');
  });
});
