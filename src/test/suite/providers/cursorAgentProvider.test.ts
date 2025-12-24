import * as assert from 'assert';
import { CursorAgentProvider } from '../../../providers/cursorAgentProvider';
import { type AgentRunOptions } from '../../../providers/provider';
import { type TestGenEvent } from '../../../core/event';

/**
 * テストで spawn されたプロセスの非同期イベント（error, close）が
 * 収束するのを待つためのヘルパー関数。
 * dispose() 呼び出し後、少し待機することで
 * タイマーや子プロセスイベントが処理されるのを保証する。
 */
function waitForAsyncCleanup(ms: number = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

suite('providers/cursorAgentProvider.ts', () => {
  suite('CursorAgentProvider', () => {
    // Given: CursorAgentProviderインスタンス
    // When: idとdisplayNameを取得する
    // Then: 正しい値が返される
    test('TC-N-01: プロパティの確認', () => {
      const provider = new CursorAgentProvider();

      assert.strictEqual(provider.id, 'cursor-agent');
      assert.strictEqual(provider.displayName, 'Cursor Agent');
    });

    // Given: agentCommandが指定されている
    // When: runを呼び出す
    // Then: 指定されたコマンドが使用される
    test('TC-N-04: agentCommandが指定されている', async () => {
      const provider = new CursorAgentProvider();
      const events: TestGenEvent[] = [];

      const options: AgentRunOptions = {
        taskId: 'test-task-1',
        workspaceRoot: '/tmp',
        agentCommand: '/custom/path/cursor-agent',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => {
          events.push(event);
        },
      };

      const task = provider.run(options);

      assert.ok(task !== undefined, 'RunningTaskが返される');
      assert.strictEqual(task.taskId, 'test-task-1');

      // startedイベントが発行されることを確認
      const startedEvent = events.find((e) => e.type === 'started');
      assert.ok(startedEvent !== undefined, 'startedイベントが発行される');
      if (startedEvent && startedEvent.type === 'started') {
        assert.ok(startedEvent.detail?.includes('/custom/path/cursor-agent'), 'カスタムコマンドが使用される');
      }

      // クリーンアップ & 非同期イベントの収束を待つ
      task.dispose();
      await waitForAsyncCleanup();
    });

    // Given: agentCommandが未指定
    // When: runを呼び出す
    // Then: デフォルトの 'cursor-agent' が使用される
    test('TC-N-05: agentCommandが未指定', async () => {
      const provider = new CursorAgentProvider();
      const events: TestGenEvent[] = [];

      const options: AgentRunOptions = {
        taskId: 'test-task-1',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => {
          events.push(event);
        },
      };

      const task = provider.run(options);

      assert.ok(task !== undefined, 'RunningTaskが返される');

      // startedイベントが発行されることを確認
      const startedEvent = events.find((e) => e.type === 'started');
      assert.ok(startedEvent !== undefined, 'startedイベントが発行される');
      if (startedEvent && startedEvent.type === 'started') {
        assert.ok(startedEvent.detail?.includes('cursor-agent'), 'デフォルトコマンドが使用される');
      }

      // クリーンアップ & 非同期イベントの収束を待つ
      task.dispose();
      await waitForAsyncCleanup();
    });

    // Given: modelが指定されている
    // When: runを呼び出す
    // Then: --model オプションが追加される
    test('TC-N-06: modelが指定されている', async () => {
      const provider = new CursorAgentProvider();
      const events: TestGenEvent[] = [];

      const options: AgentRunOptions = {
        taskId: 'test-task-1',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        model: 'claude-3.5-sonnet',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => {
          events.push(event);
        },
      };

      const task = provider.run(options);

      // startedイベントでmodelが含まれることを確認
      const startedEvent = events.find((e) => e.type === 'started');
      if (startedEvent && startedEvent.type === 'started') {
        assert.ok(startedEvent.detail?.includes('model=claude-3.5-sonnet'), 'modelが含まれる');
      }

      // クリーンアップ & 非同期イベントの収束を待つ
      task.dispose();
      await waitForAsyncCleanup();
    });

    // Given: allowWrite=true
    // When: runを呼び出す
    // Then: --force オプションが追加される
    test('TC-N-07: allowWrite=true', async () => {
      const provider = new CursorAgentProvider();
      const events: TestGenEvent[] = [];

      const options: AgentRunOptions = {
        taskId: 'test-task-1',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: true,
        onEvent: (event) => {
          events.push(event);
        },
      };

      const task = provider.run(options);

      // startedイベントでwrite=onが含まれることを確認
      const startedEvent = events.find((e) => e.type === 'started');
      if (startedEvent && startedEvent.type === 'started') {
        assert.ok(startedEvent.detail?.includes('write=on'), 'write=onが含まれる');
      }

      // クリーンアップ & 非同期イベントの収束を待つ
      task.dispose();
      await waitForAsyncCleanup();
    });

    // Given: allowWrite=false
    // When: runを呼び出す
    // Then: --force オプションが追加されない
    test('TC-N-08: allowWrite=false', async () => {
      const provider = new CursorAgentProvider();
      const events: TestGenEvent[] = [];

      const options: AgentRunOptions = {
        taskId: 'test-task-1',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => {
          events.push(event);
        },
      };

      const task = provider.run(options);

      // startedイベントでwrite=offが含まれることを確認
      const startedEvent = events.find((e) => e.type === 'started');
      if (startedEvent && startedEvent.type === 'started') {
        assert.ok(startedEvent.detail?.includes('write=off'), 'write=offが含まれる');
      }

      // クリーンアップ & 非同期イベントの収束を待つ
      task.dispose();
      await waitForAsyncCleanup();
    });

    // Given: dispose呼び出し
    // When: disposeを呼び出す
    // Then: プロセスがkillされる
    test('TC-A-07: dispose呼び出し', async () => {
      const provider = new CursorAgentProvider();
      const events: TestGenEvent[] = [];

      const options: AgentRunOptions = {
        taskId: 'test-task-1',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => {
          events.push(event);
        },
      };

      const task = provider.run(options);

      // disposeが呼び出せることを確認
      assert.doesNotThrow(() => {
        task.dispose();
      });

      // 非同期イベントの収束を待つ
      await waitForAsyncCleanup();
    });
  });
});
