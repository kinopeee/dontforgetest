import * as assert from 'assert';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
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

    test('TC-PROV-GEM-TOOLUSE-REPLACE: tool_use replace も fileWrite として扱う', () => {
      // Given: tool_use event for replace
      const filePath = path.join(workspaceRoot, 'replaced.ts');
      const obj = {
        type: 'tool_use',
        tool_name: 'replace',
        tool_id: 'tool-replace-1',
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
        assert.strictEqual(events[0].path, 'replaced.ts');
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

    test('TC-PROV-GEM-TOOLRESULT-RESULTOUTPUT: tool_result は result.output を抽出できる', () => {
      // Given: tool_result event with result.output
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const toolIdToPath = new Map<string, string>();
      toolIdToPath.set('tool-2', 'test.ts');

      const obj = {
        type: 'tool_result',
        tool_id: 'tool-2',
        result: { output: 'OK-from-result-output' },
      };

      // When: handleStreamJson is called
      handleStreamJson(obj, baseOptions, toolIdToPath, () => {}, (event) => {
        events.push(event);
      });

      // Then: log event is emitted
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.strictEqual(events[0].message, 'tool_result: OK-from-result-output');
      }
    });

    test('TC-PROV-GEM-TOOLRESULT-RESULTCONTENT: tool_result は result.content を抽出できる', () => {
      // Given: tool_result event with result.content
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const toolIdToPath = new Map<string, string>();
      toolIdToPath.set('tool-3', 'test.ts');

      const obj = {
        type: 'tool_result',
        tool_id: 'tool-3',
        result: { content: 'OK-from-result-content' },
      };

      // When: handleStreamJson is called
      handleStreamJson(obj, baseOptions, toolIdToPath, () => {}, (event) => {
        events.push(event);
      });

      // Then: log event is emitted
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.strictEqual(events[0].message, 'tool_result: OK-from-result-content');
      }
    });

    test('TC-PROV-GEM-RESULT-STATUS: result イベントは status を info log する', () => {
      // Given: result event
      const obj = { type: 'result', status: 'success' };

      // When: handleStreamJson is called
      const events = runHandle(obj);

      // Then: info log is emitted
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.strictEqual(events[0].level, 'info');
        assert.strictEqual(events[0].message, 'result: status=success');
      }
    });

    test('TC-PROV-GEM-PATH-OUTSIDE: workspace 外の絶対パスは absolute にフォールバックする', () => {
      // Given: tool_use event for write_file outside workspace
      const filePath = path.resolve(workspaceRoot, '..', 'outside', 'file.ts');
      const obj = {
        type: 'tool_use',
        tool_name: 'write_file',
        tool_id: 'tool-outside-1',
        parameters: {
          file_path: filePath,
        },
      };

      // When: handleStreamJson is called
      const events = runHandle(obj);

      // Then: fileWrite event falls back to absolute path
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'fileWrite');
      if (events[0]?.type === 'fileWrite') {
        assert.strictEqual(events[0].path, filePath);
      }
    });

    test('TC-PROV-GEM-PATH-RELATIVE: file_path が相対パスならそのまま返す', () => {
      // Given: tool_use event for write_file with relative path
      const obj = {
        type: 'tool_use',
        tool_name: 'write_file',
        tool_id: 'tool-rel-1',
        parameters: {
          file_path: 'relative/file.ts',
        },
      };

      // When: handleStreamJson is called
      const events = runHandle(obj);

      // Then: fileWrite event uses the same relative path
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'fileWrite');
      if (events[0]?.type === 'fileWrite') {
        assert.strictEqual(events[0].path, 'relative/file.ts');
      }
    });

    test('TC-PROV-GEM-TOOLRESULT-NOOUTPUT: output が抽出できない tool_result はログを出さない', () => {
      // Given: tool_result with no extractable output
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const toolIdToPath = new Map<string, string>();
      toolIdToPath.set('tool-4', 'test.ts');
      const obj = {
        type: 'tool_result',
        tool_id: 'tool-4',
        result: { somethingElse: 'nope' },
      } as unknown as Record<string, unknown>;

      // When: handleStreamJson is called
      handleStreamJson(obj, baseOptions, toolIdToPath, () => {}, (event) => {
        events.push(event);
      });

      // Then: no events are emitted
      assert.strictEqual(events.length, 0);
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

    test('TC-PROV-GEM-E-ERROR-NOMESSAGE: error イベントで message が無い場合はデフォルト文言になる', () => {
      // Given: error event without message
      const obj = { type: 'error' } as Record<string, unknown>;

      // When: handleStreamJson is called
      const events = runHandle(obj);

      // Then: error log is emitted with default message
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.strictEqual(events[0].level, 'error');
        assert.strictEqual(events[0].message, 'gemini error event received');
      }
    });

    test('TC-PROV-GEM-E-TOOLUSE-NOFILEPATH: tool_use(write_file) で file_path が無い場合は何もしない', () => {
      // Given: tool_use write_file without file_path
      const obj = {
        type: 'tool_use',
        tool_name: 'write_file',
        tool_id: 'tool-no-file',
        parameters: {},
      } as Record<string, unknown>;

      // When: handleStreamJson is called
      const events = runHandle(obj);

      // Then: no events are emitted
      assert.strictEqual(events.length, 0);
    });

    test('TC-PROV-GEM-E-TOOLUSE-UNKNOWNTOOL: write_file/replace 以外の tool_use は fileWrite しない', () => {
      // Given: tool_use for an unknown tool_name
      const obj = {
        type: 'tool_use',
        tool_name: 'read_file',
        tool_id: 'tool-unknown-1',
        parameters: { file_path: 'somewhere.ts' },
      };

      // When: handleStreamJson is called
      const events = runHandle(obj);

      // Then: no events are emitted
      assert.strictEqual(events.length, 0);
    });

    test('TC-PROV-GEM-E-TOOLRESULT-NOTOOLID: tool_result に tool_id が無い場合は何もしない', () => {
      // Given: tool_result without tool_id
      const obj = { type: 'tool_result', output: 'OK' } as Record<string, unknown>;

      // When: handleStreamJson is called
      const events = runHandle(obj);

      // Then: no events are emitted
      assert.strictEqual(events.length, 0);
    });

    test('TC-PROV-GEM-E-TOOLRESULT-NOMAPPING: tool_id があってもパス解決できない場合はログを出さない', () => {
      // Given: tool_result with tool_id and output, but toolIdToPath has no mapping
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const toolIdToPath = new Map<string, string>();
      const obj = { type: 'tool_result', tool_id: 'tool-missing-map', output: 'OK' };

      // When: handleStreamJson is called
      handleStreamJson(obj, baseOptions, toolIdToPath, () => {}, (event) => {
        events.push(event);
      });

      // Then: no events are emitted
      assert.strictEqual(events.length, 0);
    });

    test('TC-PROV-GEM-E-MESSAGE-ROLE-USER: message(role=user) は log を出さない', () => {
      // Given: message event from user
      const obj = {
        type: 'message',
        message: {
          role: 'user',
          content: 'User text',
        },
      };

      // When: handleStreamJson is called
      const events = runHandle(obj);

      // Then: no events are emitted
      assert.strictEqual(events.length, 0);
    });
  });

  suite('wireOutput', () => {
    type WireOutput = (child: unknown, options: AgentRunOptions) => void;

    const createFakeChild = (): {
      child: unknown;
      stdout: PassThrough;
      stderr: PassThrough;
      emitter: EventEmitter;
    } => {
      const emitter = new EventEmitter();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const child = Object.assign(emitter, {
        stdout,
        stderr,
        stdin: { end: () => {} },
        kill: () => true,
      });
      return { child, stdout, stderr, emitter };
    };

    test('TC-PROV-GEM-WIREOUT-INIT-START: init 行で started が発火する（重複しない）', () => {
      // Given: wireOutput 済み child
      const provider = new GeminiCliProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];
      const { child, stdout, emitter } = createFakeChild();
      const options: AgentRunOptions = {
        taskId: 'gem-wire-init',
        workspaceRoot: '/tmp',
        prompt: 'prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e) => events.push(e),
      };

      // When: init 行が来て close される
      wireOutput(child, options);
      stdout.write(Buffer.from('{"type":"init"}\n'));
      emitter.emit('close', 0);

      // Then: started が 1 回、completed が 1 回
      const started = events.filter((e) => e.type === 'started');
      assert.strictEqual(started.length, 1, 'Expected started event exactly once');
      const completed = events.filter((e) => e.type === 'completed');
      assert.strictEqual(completed.length, 1, 'Expected completed event exactly once');
      if (completed[0]?.type === 'completed') {
        assert.strictEqual(completed[0].exitCode, 0);
      }
    });

    test('TC-PROV-GEM-WIREOUT-PARSEFAIL: JSON パース失敗行は warn log になる', () => {
      // Given: wireOutput 済み child
      const provider = new GeminiCliProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];
      const { child, stdout, emitter } = createFakeChild();
      const options: AgentRunOptions = {
        taskId: 'gem-wire-parsefail',
        workspaceRoot: '/tmp',
        prompt: 'prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e) => events.push(e),
      };

      // When: JSON でない行が来て close される
      wireOutput(child, options);
      stdout.write(Buffer.from('not-json\n'));
      emitter.emit('close', 0);

      // Then: warn log が出る
      const warnLog = events.find((e) => e.type === 'log' && e.level === 'warn');
      assert.ok(warnLog, 'Expected warn log');
      if (warnLog?.type === 'log') {
        assert.ok(warnLog.message.includes('gemini stream-json parse error:'), 'Expected parse error prefix');
        assert.ok(warnLog.message.includes('not-json'), 'Expected original line to be included');
      }
    });

    test('TC-PROV-GEM-WIREOUT-ERROR: child error は error log + completed(null) になる', () => {
      // Given: wireOutput 済み child
      const provider = new GeminiCliProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];
      const { child, emitter } = createFakeChild();
      (provider as unknown as { activeChild: unknown; activeTaskId: string | undefined }).activeChild = child;
      (provider as unknown as { activeTaskId: string | undefined }).activeTaskId = 'prev-gemini-task';
      const options: AgentRunOptions = {
        taskId: 'gem-wire-error',
        workspaceRoot: '/tmp',
        prompt: 'prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e) => events.push(e),
      };

      // When: child が error を emit する
      wireOutput(child, options);
      emitter.emit('error', new Error('spawn ENOENT'));

      // Then: error log と completed(null) が出る
      const errLog = events.find((e) => e.type === 'log' && e.level === 'error');
      assert.ok(errLog, 'Expected error log');
      if (errLog?.type === 'log') {
        assert.ok(errLog.message.includes('gemini 実行エラー:'), 'Expected gemini error prefix');
        assert.ok(errLog.message.includes('spawn ENOENT'), 'Expected original error message');
      }
      const completed = events.find((e) => e.type === 'completed');
      assert.ok(completed, 'Expected completed event');
      if (completed?.type === 'completed') {
        assert.strictEqual(completed.exitCode, null);
      }
      const activeChild = (provider as unknown as { activeChild: unknown }).activeChild;
      assert.strictEqual(activeChild, undefined, 'activeChild should be cleared on error');
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
});
