import * as assert from 'assert';
import * as path from 'path';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import { GeminiCliProvider } from '../../../providers/geminiCliProvider';
import { type TestGenEvent } from '../../../core/event';
import { type AgentRunOptions } from '../../../providers/provider';

function createMockChild(): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
  return child;
}

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

    test('TC-GEM-P-03: emits fileWrite for tool_use replace', () => {
      // Given: tool_use event for replace
      const filePath = path.join(workspaceRoot, 'replace.ts');
      const obj = {
        type: 'tool_use',
        tool_name: 'replace',
        tool_id: 'tool-replace',
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
        assert.strictEqual(events[0].path, 'replace.ts');
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

    test('TC-GEM-P-04: tool_result.result.output を抽出してログにする', () => {
      // Given: tool_result with result.output
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const toolIdToPath = new Map<string, string>();
      toolIdToPath.set('tool-2', 'out.ts');
      const obj = {
        type: 'tool_result',
        tool_id: 'tool-2',
        result: {
          output: 'Result Output',
        },
      };

      // When: handleStreamJson is called
      handleStreamJson(obj, baseOptions, toolIdToPath, () => {}, (event) => events.push(event));

      // Then: log event includes extracted output
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.strictEqual(events[0].message, 'tool_result: Result Output');
      }
    });

    test('TC-GEM-P-05: tool_result.result.content を抽出してログにする', () => {
      // Given: tool_result with result.content
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const toolIdToPath = new Map<string, string>();
      toolIdToPath.set('tool-3', 'out2.ts');
      const obj = {
        type: 'tool_result',
        tool_id: 'tool-3',
        result: {
          content: 'Content Output',
        },
      };

      // When: handleStreamJson is called
      handleStreamJson(obj, baseOptions, toolIdToPath, () => {}, (event) => events.push(event));

      // Then: log event includes extracted content
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.strictEqual(events[0].message, 'tool_result: Content Output');
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

    test('TC-GEM-P-06: emits status log for result event', () => {
      // Given: result event with status
      const obj = {
        type: 'result',
        status: 'completed',
      };

      // When: handleStreamJson is called
      const events = runHandle(obj);

      // Then: status log is emitted
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.strictEqual(events[0].message, 'result: status=completed');
      }
    });

    test('TC-GEM-P-07: workspace 外パスは absolute を返す', () => {
      // Given: tool_use event with absolute path outside workspace
      const outsidePath = path.resolve('/var/tmp/outside.ts');
      const obj = {
        type: 'tool_use',
        tool_name: 'write_file',
        tool_id: 'tool-outside',
        parameters: {
          file_path: outsidePath,
        },
      };

      // When: handleStreamJson is called
      const events = runHandle(obj);

      // Then: fileWrite event uses absolute path
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'fileWrite');
      if (events[0]?.type === 'fileWrite') {
        assert.strictEqual(events[0].path, outsidePath);
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
      model: undefined, // 境界値 – undefined
      onEvent: () => {},
    };

    // When: run() is called
    const task = provider.run(options);

    // Then: returns RunningTask normally
    assert.strictEqual(task.taskId, 'gemini-task-undef-model');
    task.dispose();
  });

  test('TC-GEM-P-01: stream-json init で started イベントが出る', () => {
    // Given: wireOutput を設定した child
    const provider = new GeminiCliProvider();
    const child = createMockChild();
    const events: TestGenEvent[] = [];
    const options: AgentRunOptions = {
      taskId: 'gemini-init',
      workspaceRoot: '/tmp',
      prompt: 'prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (event) => events.push(event),
    };
    (provider as unknown as { wireOutput: (child: ChildProcessWithoutNullStreams, options: AgentRunOptions) => void }).wireOutput(
      child,
      options,
    );

    // When: init 行を stdout に流す
    (child.stdout as PassThrough).write(`${JSON.stringify({ type: 'init' })}\n`);

    // Then: started イベントが出る
    const startedEvent = events.find((event) => event.type === 'started');
    assert.ok(startedEvent !== undefined, 'started イベントが出る');
  });

  test('TC-GEM-P-02: stream-json のパース失敗行は warn ログになる', () => {
    // Given: wireOutput を設定した child
    const provider = new GeminiCliProvider();
    const child = createMockChild();
    const events: TestGenEvent[] = [];
    const options: AgentRunOptions = {
      taskId: 'gemini-parse-error',
      workspaceRoot: '/tmp',
      prompt: 'prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (event) => events.push(event),
    };
    (provider as unknown as { wireOutput: (child: ChildProcessWithoutNullStreams, options: AgentRunOptions) => void }).wireOutput(
      child,
      options,
    );

    // When: パースできない行を stdout に流す
    (child.stdout as PassThrough).write('not-json\n');

    // Then: warn ログが出る
    const warnLog = events.find((event) => event.type === 'log' && event.level === 'warn');
    if (warnLog?.type === 'log') {
      assert.ok(warnLog.message.includes('gemini stream-json parse error'));
    } else {
      assert.fail('warn ログが見つかりません');
    }
  });
});
