import * as assert from 'assert';
import { MockAgentProvider, createMockStream, createErrorStream, type MockTaskEvent } from './mockAgentProvider';
import { AgentRunOptions } from '../../providers/provider';
import { TestGenEvent } from '../../core/event';

suite('MockAgentProvider', () => {
  let provider: MockAgentProvider;

  setup(() => {
    provider = new MockAgentProvider();
  });

  test('正常にタスクを実行できる', async () => {
    const events: MockTaskEvent[] = [];
    const options: AgentRunOptions = {
      taskId: 'test-123',
      workspaceRoot: '/tmp',
      prompt: 'test prompt',
      outputFormat: 'text',
      allowWrite: false,
      onEvent: (event: TestGenEvent) => events.push(event as MockTaskEvent),
    };

    const task = provider.run(options);

    // イベントが送信されるのを待つ
    await new Promise(resolve => setTimeout(resolve, 100));

    assert.strictEqual(events.length, 4);
    assert.strictEqual(events[0].type, 'started');
    assert.strictEqual(events[1].type, 'log');
    assert.strictEqual(events[2].type, 'done');
    assert.strictEqual(events[3].type, undefined); // endイベントの後に追加されることはない

    task.dispose();
  });

  test('失敗モードでエラーを投げる', async () => {
    const testError = new Error('Test failure');
    provider.setFailureMode(true, testError);

    const events: MockTaskEvent[] = [];
    const options: AgentRunOptions = {
      taskId: 'test-456',
      workspaceRoot: '/tmp',
      prompt: 'test prompt',
      outputFormat: 'text',
      allowWrite: false,
      onEvent: (event: TestGenEvent) => events.push(event as MockTaskEvent),
    };

    const task = provider.run(options);

    // イベントが送信されるのを待つ
    await new Promise(resolve => setTimeout(resolve, 100));

    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].type, 'started');
    assert.strictEqual(events[1].type, 'error');
    assert.strictEqual(events[1].error, testError);

    task.dispose();
  });

  test('遅延を設定できる', async () => {
    provider.setDelay(100);

    const startTime = Date.now();
    const options: AgentRunOptions = {
      taskId: 'test-789',
      workspaceRoot: '/tmp',
      prompt: 'test prompt',
      outputFormat: 'text',
      allowWrite: false,
      onEvent: () => {},
    };

    const task = provider.run(options);

    // イベントが送信されるのを待つ
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const elapsed = Date.now() - startTime;

    assert.ok(elapsed >= 100, `Expected at least 100ms delay, got ${elapsed}ms`);
    
    task.dispose();
  });

  test('イベントを記録できる', async () => {
    const options: AgentRunOptions = {
      taskId: 'test-event',
      workspaceRoot: '/tmp',
      prompt: 'test prompt',
      outputFormat: 'text',
      allowWrite: false,
      onEvent: () => {},
    };

    const task = provider.run(options);

    // イベントが送信されるのを待つ
    await new Promise(resolve => setTimeout(resolve, 100));

    const recordedEvents = provider.getEvents();
    assert.strictEqual(recordedEvents.length, 4);
    assert.strictEqual(recordedEvents[0].type, 'started');
    assert.strictEqual(recordedEvents[1].type, 'log');
    assert.strictEqual(recordedEvents[2].type, 'done');

    provider.clearEvents();
    assert.strictEqual(provider.getEvents().length, 0);
    
    task.dispose();
  });
});

suite('Stream Helpers', () => {
  test('createMockStream はデータを生成する', async () => {
    const stream = createMockStream('line1\nline2\nline3');
    const chunks: string[] = [];

    stream.on('data', (chunk) => {
      chunks.push(chunk.toString());
    });

    await new Promise((resolve) => {
      stream.on('end', resolve);
    });

    assert.strictEqual(chunks.length, 3);
    assert.strictEqual(chunks[0], 'line1\n');
    assert.strictEqual(chunks[1], 'line2\n');
    assert.strictEqual(chunks[2], 'line3\n');
  });

  test('createErrorStream はエラーを生成する', async () => {
    const testError = new Error('Stream error');
    const stream = createErrorStream(testError);

    let errorReceived: Error | undefined;
    stream.on('error', (error) => {
      errorReceived = error;
    });

    await new Promise((resolve) => {
      stream.on('end', resolve);
    });

    assert.strictEqual(errorReceived, testError);
  });
});
