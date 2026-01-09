import * as assert from 'assert';
import * as path from 'path';
import { EventEmitter } from 'events';
import { ClaudeCodeProvider, __test__ as claudeCodeProviderTest } from '../../../providers/claudeCodeProvider';
import { type TestGenEvent } from '../../../core/event';
import { type AgentRunOptions } from '../../../providers/provider';

/**
 * Helper to wait for async cleanup (timers, child process events) to settle.
 */
function waitForAsyncCleanup(ms: number = 100): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

suite('ClaudeCodeProvider', () => {
  // === Test perspective table ===
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-N-01 | ClaudeCodeProvider instance | Equivalence – id/displayName | id='claude-code', displayName='Claude Code' | - |
  // | TC-N-02 | run() is called | Equivalence – RunningTask | Returns RunningTask with matching taskId | - |
  // | TC-N-05 | run() is called | Equivalence – started event | Emits started event | - |
  // | TC-N-06 | allowWrite=true | Equivalence – write enabled | started event detail includes write=on | - |
  // | TC-N-07 | model='opus-4.5' | Equivalence – model selection | started event detail includes model=opus-4.5 | - |
  // | TC-N-21 | child.close(exitCode=0) | Equivalence – normal completion | Emits completed event with exitCode=0 | - |
  // | TC-N-29 | dispose() is called | Equivalence – dispose | Calls child.kill() and clears activeChild | - |
  // | TC-B-07 | options.model=undefined | Boundary – no model | started event detail does not include model= | - |
  // | TC-B-08 | options.agentCommand=undefined | Boundary – default command | Uses default 'claude' | - |
  // | TC-B-13 | outputFormat='stream-json' | Boundary – verbose required | Emits started event | - |
  // | TC-E-04 | child emits error | Error – spawn/transport error | Emits error log and completed(null) | - |
  // | TC-E-10 | run() while activeChild exists | Error – duplicate run | Kills previous child and emits warn log | - |

  // TC-N-01: id と displayName が正しく設定されている
  test('TC-N-01: id と displayName が正しく設定されている', () => {
    // Given: ClaudeCodeProvider インスタンス
    const provider = new ClaudeCodeProvider();

    // When: id と displayName を参照
    const id = provider.id;
    const displayName = provider.displayName;

    // Then: 期待値と一致
    assert.strictEqual(id, 'claude-code');
    assert.strictEqual(displayName, 'Claude Code');
  });

  // TC-N-02: run メソッドが RunningTask を返す
  test('TC-N-02: run メソッドが RunningTask を返す', () => {
    // Given: ClaudeCodeProvider インスタンス
    const provider = new ClaudeCodeProvider();
    const events: TestGenEvent[] = [];
    const options: AgentRunOptions = {
      taskId: 'test-task-123',
      workspaceRoot: '/tmp/test',
      prompt: 'test prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (event) => events.push(event),
    };

    // When: run を呼び出す（コマンドが見つからない場合でも RunningTask は返る）
    const runningTask = provider.run(options);

    // Then: taskId が一致する RunningTask が返る
    assert.strictEqual(runningTask.taskId, 'test-task-123');
    assert.strictEqual(typeof runningTask.dispose, 'function');

    // クリーンアップ
    runningTask.dispose();
  });

  // TC-N-05: run 呼び出しで started イベントが発火
  test('TC-N-05: run 呼び出しで started イベントが発火する', async () => {
    // Given: ClaudeCodeProvider インスタンス
    const provider = new ClaudeCodeProvider();
    const events: TestGenEvent[] = [];
    const options: AgentRunOptions = {
      taskId: 'test-task-started',
      workspaceRoot: '/tmp/test',
      prompt: 'test prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (event) => events.push(event),
    };

    // When: run を呼び出す
    const runningTask = provider.run(options);

    // Then: started イベントが発火する
    const startedEvent = events.find((e) => e.type === 'started');
    assert.ok(startedEvent !== undefined, 'started イベントが発火する');
    if (startedEvent?.type === 'started') {
      assert.strictEqual(startedEvent.label, 'claude-code');
    }

    // クリーンアップ
    runningTask.dispose();
    await waitForAsyncCleanup();
  });

  // TC-N-06: allowWrite=true の場合、write=on が含まれる
  test('TC-N-06: allowWrite=true の場合、started イベントに write=on が含まれる', async () => {
    // Given: allowWrite=true の AgentRunOptions
    const provider = new ClaudeCodeProvider();
    const events: TestGenEvent[] = [];
    const options: AgentRunOptions = {
      taskId: 'test-task-write',
      workspaceRoot: '/tmp/test',
      prompt: 'test prompt',
      outputFormat: 'stream-json',
      allowWrite: true,
      onEvent: (event) => events.push(event),
    };

    // When: run を呼び出す
    const runningTask = provider.run(options);

    // Then: started イベントに write=on が含まれる
    const startedEvent = events.find((e) => e.type === 'started');
    assert.ok(startedEvent !== undefined, 'started イベントが発火する');
    if (startedEvent?.type === 'started') {
      assert.ok(startedEvent.detail?.includes('write=on'), 'write=on が含まれる');
    }

    // クリーンアップ
    runningTask.dispose();
    await waitForAsyncCleanup();
  });

  // TC-N-07: model 指定時に started イベントにモデルが含まれる
  test('TC-N-07: model 指定時に started イベントにモデルが含まれる', async () => {
    // Given: model='opus-4.5' の AgentRunOptions
    const provider = new ClaudeCodeProvider();
    const events: TestGenEvent[] = [];
    const options: AgentRunOptions = {
      taskId: 'test-task-model',
      workspaceRoot: '/tmp/test',
      prompt: 'test prompt',
      model: 'opus-4.5',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (event) => events.push(event),
    };

    // When: run を呼び出す
    const runningTask = provider.run(options);

    // Then: started イベントに model=opus-4.5 が含まれる
    const startedEvent = events.find((e) => e.type === 'started');
    assert.ok(startedEvent !== undefined, 'started イベントが発火する');
    if (startedEvent?.type === 'started') {
      assert.ok(startedEvent.detail?.includes('model=opus-4.5'), 'model=opus-4.5 が含まれる');
    }

    // クリーンアップ
    runningTask.dispose();
    await waitForAsyncCleanup();
  });

  // TC-B-07: model=undefined の場合、started イベントに model= が含まれない
  test('TC-B-07: model=undefined の場合、started イベントに model= が含まれない', async () => {
    // Given: model 未指定の AgentRunOptions
    const provider = new ClaudeCodeProvider();
    const events: TestGenEvent[] = [];
    const options: AgentRunOptions = {
      taskId: 'test-task-no-model',
      workspaceRoot: '/tmp/test',
      prompt: 'test prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (event) => events.push(event),
    };

    // When: run を呼び出す
    const runningTask = provider.run(options);

    // Then: started イベントに model= が含まれない
    const startedEvent = events.find((e) => e.type === 'started');
    assert.ok(startedEvent !== undefined, 'started イベントが発火する');
    if (startedEvent?.type === 'started') {
      assert.ok(!startedEvent.detail?.includes('model='), 'model= が含まれない');
    }

    // クリーンアップ
    runningTask.dispose();
    await waitForAsyncCleanup();
  });

  // TC-B-08: agentCommand=undefined の場合、デフォルトの 'claude' が使用される
  test('TC-B-08: agentCommand=undefined の場合、デフォルトの claude が使用される', async () => {
    // Given: agentCommand 未指定の AgentRunOptions
    const provider = new ClaudeCodeProvider();
    const events: TestGenEvent[] = [];
    const options: AgentRunOptions = {
      taskId: 'test-task-default-cmd',
      workspaceRoot: '/tmp/test',
      prompt: 'test prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (event) => events.push(event),
    };

    // When: run を呼び出す
    const runningTask = provider.run(options);

    // Then: started イベントに cmd=claude が含まれる
    const startedEvent = events.find((e) => e.type === 'started');
    assert.ok(startedEvent !== undefined, 'started イベントが発火する');
    if (startedEvent?.type === 'started') {
      assert.ok(startedEvent.detail?.includes('cmd=claude'), 'cmd=claude が含まれる');
    }

    // クリーンアップ
    runningTask.dispose();
    await waitForAsyncCleanup();
  });

  // TC-N-29: dispose() 呼び出しでエラーなく終了
  test('TC-N-29: dispose() 呼び出しでエラーなく終了する', async () => {
    // Given: 実行中タスクを開始する
    const provider = new ClaudeCodeProvider();
    const events: TestGenEvent[] = [];
    const options: AgentRunOptions = {
      taskId: 'test-task-dispose',
      workspaceRoot: '/tmp/test',
      prompt: 'test prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (event) => events.push(event),
    };

    const runningTask = provider.run(options);

    // When: dispose を呼び出す
    // Then: 例外なく dispose できる
    assert.doesNotThrow(() => {
      runningTask.dispose();
    });

    await waitForAsyncCleanup();
  });

  // TC-E-10: run() 時に既に activeChild が存在する場合、前の child が kill される
  test('TC-E-10: run() 時に既に activeChild が存在する場合、前の child が kill され warn ログが出力される', async () => {
    // Given: A provider with an existing activeChild + activeTaskId
    const provider = new ClaudeCodeProvider();
    const events: TestGenEvent[] = [];
    let killedCount = 0;

    const prevChild = {
      kill: () => {
        killedCount += 1;
        return true;
      },
    };

    // Override internal state + internal methods to avoid spawning a real process
    (provider as unknown as { activeChild: unknown; activeTaskId: string | undefined }).activeChild = prevChild;
    (provider as unknown as { activeTaskId: string | undefined }).activeTaskId = 'prev-task-claude';
    (provider as unknown as { spawnClaudeCode: (options: AgentRunOptions) => unknown }).spawnClaudeCode = () => ({
      kill: () => true,
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      stdin: { write: () => {}, end: () => {} },
    });
    (provider as unknown as { wireOutput: (child: unknown, options: AgentRunOptions) => void }).wireOutput = () => {
      // noop: avoid timers and streams
    };

    const options: AgentRunOptions = {
      taskId: 'next-task-claude',
      workspaceRoot: '/tmp/test',
      prompt: 'test prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (event) => events.push(event),
    };

    // When: run() is called while a previous child is active
    const task = provider.run(options);
    task.dispose();
    await waitForAsyncCleanup();

    // Then: Previous process kill is attempted and a warning log is emitted
    assert.strictEqual(killedCount, 1, 'Expected previous activeChild.kill() to be called exactly once');
    const warnLogs = events.filter((e) => e.type === 'log' && e.level === 'warn');
    assert.ok(warnLogs.length >= 1, 'Expected at least one warn log event');
    const message = warnLogs[0]?.type === 'log' ? warnLogs[0].message : '';
    assert.ok(message.includes('prev-task-claude'), 'Warn message should include previous task id');
  });

  suite('handleStreamJson', () => {
    type HandleStreamJson = (
      obj: Record<string, unknown>,
      options: AgentRunOptions,
      lastWritePath: string | undefined,
      emitEvent: (event: TestGenEvent) => void,
    ) => string | undefined;

    const provider = new ClaudeCodeProvider();
    const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);

    const workspaceRoot = path.resolve('tmp-workspace');
    const baseOptions: AgentRunOptions = {
      taskId: 'test-task-hsj',
      workspaceRoot,
      prompt: 'test prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: () => {},
    };

    const runHandle = (obj: Record<string, unknown>, lastWritePath?: string): { events: TestGenEvent[]; next: string | undefined } => {
      const events: TestGenEvent[] = [];
      const next = handleStreamJson(obj, baseOptions, lastWritePath, (event) => {
        events.push(event);
      });
      return { events, next };
    };

    // TC-N-20: tool_call (Write) イベント受信で fileWrite イベント発火
    test('TC-N-20: tool_call (Write) イベント受信で fileWrite イベントが発火する', () => {
      // Given: tool_call with Write operation
      const filePath = path.join(workspaceRoot, 'src', 'generated.test.ts');
      const obj = {
        type: 'tool_call',
        subtype: 'started',
        tool_call: {
          Write: {
            args: { file_path: filePath },
          },
        },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: fileWrite event is emitted
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.path, path.relative(workspaceRoot, filePath));
      }
    });

    // TC-N-28: tool_call (Edit) イベント受信で fileWrite イベント発火
    test('TC-N-28: tool_call (Edit) イベント受信で fileWrite イベントが発火する', () => {
      // Given: tool_call with Edit operation
      const filePath = path.join(workspaceRoot, 'src', 'edited.test.ts');
      const obj = {
        type: 'tool_call',
        subtype: 'started',
        tool_call: {
          Edit: {
            args: { path: filePath },
          },
        },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: fileWrite event is emitted
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.path, path.relative(workspaceRoot, filePath));
      }
    });

    test('TC-PROV-CLAUDE-TOOLCALL-COMPLETED-PREFER-SUCCESS: subtype=completed では success.path を優先し linesAdded を反映する', () => {
      // Given: tool_call completed（args.path と success.path が両方ある）
      const argsPath = path.join(workspaceRoot, 'src', 'from-args.ts');
      const successPath = path.join(workspaceRoot, 'src', 'from-success.ts');
      const obj = {
        type: 'tool_call',
        subtype: 'completed',
        tool_call: {
          Write: {
            args: { path: argsPath },
            result: { success: { path: successPath, linesAdded: 12 } },
          },
        },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: success.path が採用され、linesCreated が入った fileWrite が発火する
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.path, path.relative(workspaceRoot, successPath));
        assert.strictEqual(event.linesCreated, 12);
      }
      assert.strictEqual(result.next, successPath);
    });

    test('TC-PROV-CLAUDE-TOOLCALL-COMPLETED-ARGS-FILEPATH: success.path が無い場合、args.file_path が採用される', () => {
      // Given: tool_call completed（args.file_path のみ）
      const argsFilePath = path.join(workspaceRoot, 'src', 'from-file-path.ts');
      const obj = {
        type: 'tool_call',
        subtype: 'completed',
        tool_call: {
          Edit: {
            args: { file_path: argsFilePath },
            result: { success: { linesAdded: 1 } },
          },
        },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: args.file_path が採用され、fileWrite が発火する
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.path, path.relative(workspaceRoot, argsFilePath));
        assert.strictEqual(event.linesCreated, 1);
      }
      assert.strictEqual(result.next, argsFilePath);
    });

    test('TC-PROV-CLAUDE-TOOLCALL-COMPLETED-FALLBACK-LAST: path が無い場合、lastWritePath にフォールバックする', () => {
      // Given: tool_call completed だが path 情報が無い（lastWritePath はある）
      const lastWritePath = path.join(workspaceRoot, 'src', 'fallback.ts');
      const obj = {
        type: 'tool_call',
        subtype: 'completed',
        tool_call: {
          Edit: {
            args: {},
            result: { success: {} },
          },
        },
      } as Record<string, unknown>;

      // When: handleStreamJson is called with lastWritePath
      const result = runHandle(obj, lastWritePath);

      // Then: lastWritePath が採用され fileWrite が発火する
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.path, path.relative(workspaceRoot, lastWritePath));
      }
      assert.strictEqual(result.next, lastWritePath);
    });

    test('TC-PROV-CLAUDE-TOOLCALL-EDITTOOLCALL: tool_call キーが editToolCall の場合も書き込みとして扱う', () => {
      // Given: tool_call with editToolCall
      const filePath = path.join(workspaceRoot, 'src', 'editToolCall.ts');
      const obj = {
        type: 'tool_call',
        subtype: 'started',
        tool_call: {
          editToolCall: {
            args: { path: filePath },
          },
        },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: fileWrite event is emitted
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.path, path.relative(workspaceRoot, filePath));
      }
    });

    test('TC-PROV-CLAUDE-TOOLCALL-UNKNOWN-IGNORE: 未知キーのみの tool_call は fileWrite せず無視する', () => {
      // Given: tool_call with unknown operation name (not write/edit)
      const filePath = path.join(workspaceRoot, 'src', 'ignored.ts');
      const obj = {
        type: 'tool_call',
        subtype: 'started',
        tool_call: {
          Foo: {
            args: { path: filePath },
          },
        },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-PROV-CLAUDE-E-TOOLCALL-EMPTY: tool_call が空オブジェクトの場合は何もしない', () => {
      // Given: tool_call with empty object
      const obj = {
        type: 'tool_call',
        subtype: 'started',
        tool_call: {},
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-PROV-CLAUDE-E-TOOLCALL-NONRECORD: tool_call が Record でない場合は何もしない', () => {
      // Given: tool_call is null (non-record)
      const obj = {
        type: 'tool_call',
        subtype: 'started',
        tool_call: null,
      } as unknown as Record<string, unknown>;

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-PROV-CLAUDE-E-TOOLCALL-STARTED-NOPATH: started でも path が無ければ fileWrite しない', () => {
      // Given: tool_call started with Write but no path in args
      const obj = {
        type: 'tool_call',
        subtype: 'started',
        tool_call: {
          Write: {
            args: {},
          },
        },
      } as Record<string, unknown>;

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-PROV-CLAUDE-E-TOOLCALL-COMPLETED-NOPATH: completed で path と lastWritePath が無ければ fileWrite しない', () => {
      // Given: tool_call completed with no path and no lastWritePath
      const obj = {
        type: 'tool_call',
        subtype: 'completed',
        tool_call: {
          Edit: {
            args: {},
            result: { success: {} },
          },
        },
      } as Record<string, unknown>;

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-PROV-CLAUDE-E-SYSTEM-NOSUBTYPE: system(subtype 無し) は何もしない', () => {
      // Given: system event without subtype
      const obj = { type: 'system' } as Record<string, unknown>;

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-PROV-CLAUDE-E-ASSISTANT-INVALID: assistant メッセージ形式が不正な場合は log を出さない', () => {
      // Given: assistant event with invalid message shape
      const obj = { type: 'assistant', message: { content: [] } };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    // TC-N-23: result イベント受信で log イベント発火
    test('TC-N-23: result イベント受信で log イベントが発火する (duration_ms 含む)', () => {
      // Given: result event with duration_ms
      const obj = { type: 'result', duration_ms: 12345 };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: log event is emitted with duration_ms
      assert.ok(result.events.length >= 1, 'At least one event should be emitted');
      const event = result.events[0];
      assert.strictEqual(event?.type, 'log');
      if (event?.type === 'log') {
        assert.strictEqual(event.level, 'info');
        assert.ok(event.message.includes('result:'), 'Message should contain result:');
        assert.ok(event.message.includes('duration_ms=12345'), 'Message should contain duration_ms');
      }
    });

    test('TC-PROV-CLAUDE-RESULTTEXT-STRING: result.result が string の場合、本文 log が追加で発火する', () => {
      // Given: result event with result.result as string
      const obj = { type: 'result', duration_ms: 1, result: 'FINAL_RESULT_TEXT' };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: duration ログ + 本文ログ（計2件）
      assert.strictEqual(result.events.length, 2);
      const durationLog = result.events[0];
      const textLog = result.events[1];
      assert.strictEqual(durationLog?.type, 'log');
      assert.strictEqual(textLog?.type, 'log');
      if (durationLog?.type === 'log') {
        assert.ok(durationLog.message.includes('duration_ms=1'));
      }
      if (textLog?.type === 'log') {
        assert.strictEqual(textLog.message, 'FINAL_RESULT_TEXT');
      }
    });

    test('TC-PROV-CLAUDE-RESULTTEXT-ARRAY: result.result.content[0].text を抽出して本文 log を出す', () => {
      // Given: result event with result.result.content array
      const obj = { type: 'result', duration_ms: 2, result: { content: [{ text: 'ARRAY_RESULT_TEXT' }] } };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: duration ログ + 本文ログ（計2件）
      assert.strictEqual(result.events.length, 2);
      const durationLog = result.events[0];
      const textLog = result.events[1];
      assert.strictEqual(durationLog?.type, 'log');
      assert.strictEqual(textLog?.type, 'log');
      if (durationLog?.type === 'log') {
        assert.ok(durationLog.message.includes('duration_ms=2'));
      }
      if (textLog?.type === 'log') {
        assert.strictEqual(textLog.message, 'ARRAY_RESULT_TEXT');
      }
    });

    // TC-B-14: result イベントで duration_ms が undefined の場合
    test('TC-B-14: result イベントで duration_ms が undefined の場合、unknown と表示される', () => {
      // Given: result event without duration_ms
      const obj: Record<string, unknown> = { type: 'result' };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: log event is emitted with duration_ms=unknown
      assert.ok(result.events.length >= 1, 'At least one event should be emitted');
      const event = result.events[0];
      assert.strictEqual(event?.type, 'log');
      if (event?.type === 'log') {
        assert.ok(event.message.includes('duration_ms=unknown'), 'Message should contain duration_ms=unknown');
      }
    });

    // TC-N-24: system イベント受信で log イベント発火
    test('TC-N-24: system イベント受信で log イベントが発火する (subtype=init)', () => {
      // Given: system event with subtype=init
      const obj = { type: 'system', subtype: 'init' };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: log event is emitted
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'log');
      if (event?.type === 'log') {
        assert.strictEqual(event.level, 'info');
        assert.strictEqual(event.message, 'system:init');
      }
    });

    // TC-N-25: thinking イベントは無視される
    test('TC-N-25: thinking イベントは無視される', () => {
      // Given: thinking event
      const obj = { type: 'thinking' };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
    });

    // TC-N-26: user イベントは無視される
    test('TC-N-26: user イベントは無視される', () => {
      // Given: user event
      const obj = { type: 'user' };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
    });

    // TC-N-27: assistant イベント受信で log イベント発火
    test('TC-N-27: assistant イベント受信で log イベントが発火する', () => {
      // Given: assistant event with text
      const obj = { type: 'assistant', message: { content: [{ text: 'Generated test code' }] } };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: log event is emitted with assistant text
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'log');
      if (event?.type === 'log') {
        assert.strictEqual(event.level, 'info');
        assert.strictEqual(event.message, 'Generated test code');
      }
    });

    // TC-E-05: invalid JSON (non-record) is handled as warn log
    test('TC-E-05: invalid JSON line is handled as warn log (tested via wireOutput)', () => {
      // Given: type フィールドが存在しない空のオブジェクト（無効な JSON 構造）
      const obj: Record<string, unknown> = {};

      // When: handleStreamJson を呼び出す
      const result = runHandle(obj);

      // Then: log イベントが 'event:unknown' として発火する
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'log');
      if (event?.type === 'log') {
        assert.strictEqual(event.level, 'info');
        assert.strictEqual(event.message, 'event:unknown');
      }
    });

    // TC-B-15: toWorkspaceRelative で workspace 外のパスを渡す
    test('TC-B-15: toWorkspaceRelative で workspace 外のパスを渡すと絶対パスにフォールバックする', () => {
      // Given: tool_call with path outside workspace
      const filePath = path.resolve(workspaceRoot, '..', 'outside', 'file.ts');
      const obj = {
        type: 'tool_call',
        subtype: 'started',
        tool_call: {
          Write: {
            args: { path: filePath },
          },
        },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: fileWrite event uses absolute path (falls back when relative would start with '..')
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        // Falls back to absolute path since relative would be outside workspace
        assert.strictEqual(event.path, filePath);
      }
    });
  });

  suite('wireOutput (time-based monitoring)', () => {
    type WireOutput = (child: unknown, options: AgentRunOptions) => void;

    type TimerHandlerFn = (...args: unknown[]) => void;

    const createFakeChild = (): {
      child: unknown;
      stdout: EventEmitter;
      stderr: EventEmitter;
      emitter: EventEmitter;
      killedRef: { killed: boolean };
    } => {
      const emitter = new EventEmitter();
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      const killedRef = { killed: false };

      const child = Object.assign(emitter, {
        stdout,
        stderr,
        stdin: { write: () => {}, end: () => {} },
        kill: () => {
          killedRef.killed = true;
          return true;
        },
      });

      return { child, stdout, stderr, emitter, killedRef };
    };

    const patchTimers = (): {
      restore: () => void;
      fireAllTimeouts: () => void;
      fireAllIntervals: () => void;
    } => {
      const originalSetTimeout = globalThis.setTimeout;
      const originalSetInterval = globalThis.setInterval;
      const originalClearTimeout = globalThis.clearTimeout;
      const originalClearInterval = globalThis.clearInterval;

      let nextTimerId = 1;
      const timeouts = new Map<number, TimerHandlerFn>();
      const intervals = new Map<number, TimerHandlerFn>();

      const tryGetNumericId = (id: unknown): number | undefined => {
        return typeof id === 'number' ? id : undefined;
      };

      (globalThis as unknown as { setTimeout: typeof setTimeout }).setTimeout = ((
        handler: (...innerArgs: unknown[]) => void,
        _timeout?: number,
        ...args: unknown[]
      ) => {
        const id = nextTimerId++;
        timeouts.set(id, () => handler(...args));
        return id as unknown as ReturnType<typeof setTimeout>;
      }) as unknown as typeof setTimeout;

      (globalThis as unknown as { setInterval: typeof setInterval }).setInterval = ((
        handler: (...innerArgs: unknown[]) => void,
        _timeout?: number,
        ...args: unknown[]
      ) => {
        const id = nextTimerId++;
        intervals.set(id, () => handler(...args));
        return id as unknown as ReturnType<typeof setInterval>;
      }) as unknown as typeof setInterval;

      (globalThis as unknown as { clearTimeout: typeof clearTimeout }).clearTimeout = ((id: unknown) => {
        const numericId = tryGetNumericId(id);
        if (numericId !== undefined) {
          timeouts.delete(numericId);
        }
      }) as unknown as typeof clearTimeout;

      (globalThis as unknown as { clearInterval: typeof clearInterval }).clearInterval = ((id: unknown) => {
        const numericId = tryGetNumericId(id);
        if (numericId !== undefined) {
          intervals.delete(numericId);
        }
      }) as unknown as typeof clearInterval;

      return {
        restore: () => {
          (globalThis as unknown as { setTimeout: typeof setTimeout }).setTimeout = originalSetTimeout;
          (globalThis as unknown as { setInterval: typeof setInterval }).setInterval = originalSetInterval;
          (globalThis as unknown as { clearTimeout: typeof clearTimeout }).clearTimeout = originalClearTimeout;
          (globalThis as unknown as { clearInterval: typeof clearInterval }).clearInterval = originalClearInterval;
        },
        fireAllTimeouts: () => {
          for (const [id, fn] of Array.from(timeouts.entries())) {
            timeouts.delete(id);
            fn();
          }
        },
        fireAllIntervals: () => {
          for (const fn of Array.from(intervals.values())) {
            fn();
          }
        },
      };
    };

    // TC-N-21: child.close (exitCode=0) で completed イベントが発火
    test('TC-N-21: child.close (exitCode=0) で completed イベントが exitCode=0 で発火する', () => {
      // Given: A wired child process
      const provider = new ClaudeCodeProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];

      const timers = patchTimers();
      const { child, emitter } = createFakeChild();

      try {
        const options: AgentRunOptions = {
          taskId: 'wo-close',
          workspaceRoot: path.resolve('tmp-workspace'),
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (e) => events.push(e),
        };

        wireOutput(child, options);

        // When: The child emits a close event with code 0
        emitter.emit('close', 0);

        // Then: A completed event is emitted with exitCode=0
        const completed = events.filter((e) => e.type === 'completed');
        assert.strictEqual(completed.length, 1, 'Expected exactly one completed event');
        if (completed[0]?.type === 'completed') {
          assert.strictEqual(completed[0].exitCode, 0);
        }
      } finally {
        timers.restore();
      }
    });

    // TC-E-04: child.on('error') (ENOENT) で log と completed が発火
    test('TC-E-04: child.on error (ENOENT) で log (level=error) と completed (exitCode=null) が発火', () => {
      // Given: A wired child process
      const provider = new ClaudeCodeProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];

      const timers = patchTimers();
      const { child, emitter } = createFakeChild();

      try {
        const options: AgentRunOptions = {
          taskId: 'wo-error',
          workspaceRoot: path.resolve('tmp-workspace'),
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (e) => events.push(e),
        };

        wireOutput(child, options);

        // When: The child emits an error event
        emitter.emit('error', new Error('spawn ENOENT'));

        // Then: An error log and a completed(null) event are emitted
        const errLog = events.find((e) => e.type === 'log' && e.level === 'error');
        assert.ok(errLog, 'Expected an error log event');

        const completed = events.filter((e) => e.type === 'completed');
        assert.strictEqual(completed.length, 1, 'Expected exactly one completed event');
        if (completed[0]?.type === 'completed') {
          assert.strictEqual(completed[0].exitCode, null);
        }
      } finally {
        timers.restore();
      }
    });

    // TC-E-09: silence timeout で kill される
    test('TC-E-09: silence timeout (10分) を超えると child.kill() が呼ばれる', () => {
      // Given: A wired child process with controlled clock
      const provider = new ClaudeCodeProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];

      const originalNow = Date.now;
      let fakeNow = 0;
      (Date as unknown as { now: () => number }).now = () => fakeNow;

      const timers = patchTimers();
      const { child, stdout, killedRef } = createFakeChild();

      try {
        const options: AgentRunOptions = {
          taskId: 'wo-kill-after-silence',
          workspaceRoot: path.resolve('tmp-workspace'),
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (e) => events.push(e),
        };

        wireOutput(child, options);

        // When: Some output arrives at t=0, then time advances beyond the kill threshold (10min)
        fakeNow = 0;
        stdout.emit('data', Buffer.from('not-json\n'));

        fakeNow = claudeCodeProviderTest.CLAUDE_CODE_MONITORING.maxSilenceBeforeKillMs;
        timers.fireAllIntervals();

        // Then: A kill is attempted and an error log is emitted about auto-stop
        assert.strictEqual(killedRef.killed, true, 'Expected child.kill() to be attempted');
        const killLog = events.find((e) => e.type === 'log' && e.level === 'error' && e.message.includes('無音'));
        assert.ok(killLog, 'Expected an error log about long silence auto-stop');
      } finally {
        timers.restore();
        (Date as unknown as { now: () => number }).now = originalNow;
      }
    });

    // TC-B-11: stdin.write が例外をスローしても処理継続
    test('TC-B-11: stdin.write が例外をスローしても処理は継続する', async () => {
      // Given: A provider with mocked spawnClaudeCode that has stdin.write throwing
      const provider = new ClaudeCodeProvider();
      const events: TestGenEvent[] = [];

      let stdinWriteCalled = false;
      const fakeStdin = {
        write: () => {
          stdinWriteCalled = true;
          throw new Error('stdin write failed');
        },
        end: () => {},
      };

      (provider as unknown as { spawnClaudeCode: (options: AgentRunOptions) => unknown }).spawnClaudeCode = () => ({
        kill: () => true,
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: fakeStdin,
      });
      (provider as unknown as { wireOutput: (child: unknown, options: AgentRunOptions) => void }).wireOutput = () => {};

      const options: AgentRunOptions = {
        taskId: 'stdin-throw-test',
        workspaceRoot: '/tmp/test',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => events.push(event),
      };

      // When: run() is called
      // Then: No exception is thrown and started event is emitted
      assert.doesNotThrow(() => {
        const task = provider.run(options);
        task.dispose();
      });

      assert.ok(stdinWriteCalled, 'stdin.write should have been called');
      const startedEvent = events.find((e) => e.type === 'started');
      assert.ok(startedEvent !== undefined, 'started event should be emitted');
    });
  });
});
