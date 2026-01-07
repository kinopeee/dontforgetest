import * as assert from 'assert';
import * as path from 'path';
import { GeminiCliProvider } from '../../../providers/geminiCliProvider';
import { type TestGenEvent } from '../../../core/event';
import { type AgentRunOptions } from '../../../providers/provider';

suite('GeminiCliProvider', () => {
  test('TC-GEM-N-01: Properties check', () => {
    // Given: GeminiCliProvider instance
    const provider = new GeminiCliProvider();

    // When: accessing id and displayName
    // Then: returns expected values
    assert.strictEqual(provider.id, 'gemini-cli');
    assert.strictEqual(provider.displayName, 'Gemini CLI');
  });

  test('TC-GEM-N-02: run() returns RunningTask', () => {
    // Given: GeminiCliProvider instance
    const provider = new GeminiCliProvider();
    const options: AgentRunOptions = {
      taskId: 'gemini-task-1',
      workspaceRoot: '/tmp',
      prompt: 'test prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: () => {},
    };

    // When: run() is called
    const task = provider.run(options);

    // Then: returns RunningTask with correct taskId
    assert.strictEqual(task.taskId, 'gemini-task-1');
    assert.strictEqual(typeof task.dispose, 'function');

    task.dispose();
  });

  suite('handleStreamJson', () => {
    type HandleStreamJson = (
      obj: Record<string, unknown>,
      options: AgentRunOptions,
      toolIdToPath: Map<string, string>,
      emitStarted: () => void,
      emitEvent: (event: TestGenEvent) => void,
    ) => void;

    const provider = new GeminiCliProvider();
    const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);

    const workspaceRoot = path.resolve('tmp-workspace-gemini');
    const baseOptions: AgentRunOptions = {
      taskId: 'gemini-task-hsj',
      workspaceRoot,
      prompt: 'test prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: () => {},
    };

    const runHandle = (obj: Record<string, unknown>): TestGenEvent[] => {
      const events: TestGenEvent[] = [];
      const toolIdToPath = new Map<string, string>();
      handleStreamJson(obj, baseOptions, toolIdToPath, () => {}, (event) => {
        events.push(event);
      });
      return events;
    };

    test('TC-GEM-N-05: emits log for assistant message', () => {
      // Given: message event from assistant
      const obj = {
        type: 'message',
        message: {
          role: 'assistant',
          content: 'Hello from Gemini',
        },
      };

      // When: handleStreamJson is called
      const events = runHandle(obj);

      // Then: log event is emitted
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.strictEqual(events[0].message, 'Hello from Gemini');
      }
    });

    test('TC-GEM-N-05A: emits log for top-level message with role=model', () => {
      // Given: top-level の message イベント（role=model）
      const obj = {
        type: 'message',
        role: 'model',
        content: [{ text: 'Hello from Gemini top-level' }],
      };

      // When: handleStreamJson を呼び出す
      const events = runHandle(obj);

      // Then: 抽出されたテキストで log イベントが発火する
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.strictEqual(events[0].message, 'Hello from Gemini top-level');
      }
    });

    test('TC-GEM-N-06: emits fileWrite for tool_use write_file', () => {
      // Given: tool_use event for write_file
      const filePath = path.join(workspaceRoot, 'test.ts');
      const obj = {
        type: 'tool_use',
        tool_name: 'write_file',
        tool_id: 'tool-1',
        parameters: {
          file_path: filePath,
        },
      };

      // When: handleStreamJson is called
      const events = runHandle(obj);

      // Then: fileWrite event is emitted with relative path
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'fileWrite');
      if (events[0]?.type === 'fileWrite') {
        assert.strictEqual(events[0].path, 'test.ts');
      }
    });

    test('TC-GEM-N-07: emits log for tool_result', () => {
      // Given: tool_result event
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const toolIdToPath = new Map<string, string>();
      toolIdToPath.set('tool-1', 'test.ts');

      const obj = {
        type: 'tool_result',
        tool_id: 'tool-1',
        output: 'Success',
      };

      // When: handleStreamJson is called
      handleStreamJson(obj, baseOptions, toolIdToPath, () => {}, (event) => {
        events.push(event);
      });

      // Then: log event is emitted
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.strictEqual(events[0].message, 'tool_result: Success');
      }
    });

    test('TC-GEM-E-01: emits error log for error event', () => {
      // Given: error event
      const obj = {
        type: 'error',
        message: 'Something went wrong',
      };

      // When: handleStreamJson is called
      const events = runHandle(obj);

      // Then: error log is emitted
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.strictEqual(events[0].level, 'error');
        assert.strictEqual(events[0].message, 'Something went wrong');
      }
    });
  });

  test('TC-GEM-E-08: run() with undefined model', () => {
    // Given: GeminiCliProvider instance and options with undefined model
    const provider = new GeminiCliProvider();
    const options: AgentRunOptions = {
      taskId: 'gemini-task-undef-model',
      workspaceRoot: '/tmp',
      prompt: 'test prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      model: undefined, // Boundary – undefined
      onEvent: () => {},
    };

    // When: run() is called
    const task = provider.run(options);

    // Then: returns RunningTask normally
    assert.strictEqual(task.taskId, 'gemini-task-undef-model');
    task.dispose();
  });
});
