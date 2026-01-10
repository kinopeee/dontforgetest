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
  // | TC-EXAT-01 | message=null | Boundary – non-record message | Returns undefined | extractAssistantText |
  // | TC-EXAT-02 | message=1 | Boundary – primitive message | Returns undefined | extractAssistantText |
  // | TC-EXAT-03 | message={} | Boundary – missing content | Returns undefined | extractAssistantText |
  // | TC-EXAT-04 | message.content not array | Boundary – invalid content | Returns undefined | extractAssistantText |
  // | TC-EXAT-05 | message.content=[] | Boundary – empty content | Returns undefined | extractAssistantText |
  // | TC-EXAT-06 | content[0]=null | Boundary – non-record first item | Returns undefined | extractAssistantText |
  // | TC-EXAT-07 | firstRec.text non-string | Boundary – invalid text | Returns undefined | extractAssistantText |
  // | TC-EXAT-08 | firstRec.text string | Equivalence – valid assistant text | Returns text | extractAssistantText |

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

    // ============================================
    // テスト観点表（追加分）: tool_call subtype=completed と result 本文抽出
    // ============================================
    // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
    // |---------|----------------------|--------------------------------------|-----------------|-------|
    // | TC-CC-N-01 | tool_call completed with success.path | Equivalence – success.path 優先 | fileWrite.path が success.path | - |
    // | TC-CC-N-02 | tool_call completed with linesAdded | Equivalence – linesCreated | fileWrite.linesCreated に値 | - |
    // | TC-CC-N-03 | tool_call completed で args.file_path | Equivalence – file_path | fileWrite.path が args.file_path | - |
    // | TC-CC-N-04 | tool_call completed で lastWritePath | Equivalence – フォールバック | fileWrite.path が lastWritePath | - |
    // | TC-CC-N-05 | result で result が string | Equivalence – 本文抽出 | log イベントに string が含まれる | - |
    // | TC-CC-N-06 | result で result.text がある | Equivalence – 本文抽出 | log イベントに text が含まれる | - |
    // | TC-CC-N-07 | result で result.content 配列 | Equivalence – 本文抽出 | log イベントに content[0].text | - |
    // | TC-CC-E-01 | tool_call で toolCallBody が無い | Error – 空の tool_call | イベント発火なし | - |
    // | TC-CC-N-08 | findToolCallName で xxxToolCall | Equivalence – ツール名推定 | fileWrite が発火 | - |
    // | TC-CC-N-09 | findToolCallName で未知のキー | Equivalence – フォールバック | 最初のキーが使われる | - |
    // | TC-CC-B-01 | tool_call で isWriteOperation が false | Boundary – 読み取り操作 | イベント発火なし | - |
    // | TC-CC-N-10 | editToolCall で subtype=started | Equivalence – editToolCall | fileWrite が発火 | - |

    // TC-CC-N-01: tool_call completed with success.path
    test('TC-CC-N-01: tool_call completed で success.path が優先される', () => {
      // Given: tool_call completed with success.path
      const successPath = path.join(workspaceRoot, 'success-path.ts');
      const argsPath = path.join(workspaceRoot, 'args-path.ts');
      const obj = {
        type: 'tool_call',
        subtype: 'completed',
        tool_call: {
          Write: {
            args: { path: argsPath },
            result: {
              success: { path: successPath },
            },
          },
        },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: fileWrite.path が success.path
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.path, path.relative(workspaceRoot, successPath));
      }
    });

    // TC-CC-N-02: tool_call completed with linesAdded
    test('TC-CC-N-02: tool_call completed で linesAdded が fileWrite.linesCreated に入る', () => {
      // Given: tool_call completed with linesAdded
      const filePath = path.join(workspaceRoot, 'with-lines.ts');
      const obj = {
        type: 'tool_call',
        subtype: 'completed',
        tool_call: {
          Write: {
            args: { path: filePath },
            result: {
              success: { path: filePath, linesAdded: 42 },
            },
          },
        },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: fileWrite.linesCreated が 42
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.linesCreated, 42);
      }
    });

    // TC-CC-N-03: tool_call completed で args.file_path
    test('TC-CC-N-03: tool_call completed で args.file_path が使われる', () => {
      // Given: tool_call completed with args.file_path
      const filePath = path.join(workspaceRoot, 'file-path.ts');
      const obj = {
        type: 'tool_call',
        subtype: 'completed',
        tool_call: {
          Edit: {
            args: { file_path: filePath },
            result: { success: {} },
          },
        },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: fileWrite.path が args.file_path
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.path, path.relative(workspaceRoot, filePath));
      }
    });

    // TC-CC-N-04: tool_call completed で lastWritePath がフォールバックとして使われる
    test('TC-CC-N-04: tool_call completed で lastWritePath がフォールバックとして使われる', () => {
      // Given: tool_call completed with no path in args or success, but lastWritePath is set
      const lastPath = path.join(workspaceRoot, 'last-write-path.ts');
      const obj = {
        type: 'tool_call',
        subtype: 'completed',
        tool_call: {
          Write: {
            args: {},
            result: { success: {} },
          },
        },
      };

      // When: handleStreamJson is called with lastWritePath
      const result = runHandle(obj, lastPath);

      // Then: fileWrite.path が lastWritePath
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.path, path.relative(workspaceRoot, lastPath));
      }
    });

    // TC-CC-N-05: result で result が string
    test('TC-CC-N-05: result イベントで result が string の場合ログに含まれる', () => {
      // Given: result event with string result
      const obj = {
        type: 'result',
        duration_ms: 1000,
        result: 'String result text',
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: log イベントに string が含まれる
      const logs = result.events.filter((e) => e.type === 'log');
      assert.ok(logs.length >= 2, 'duration と result の 2 つの log が発火');
      const resultLog = logs.find((e) => e.type === 'log' && e.message === 'String result text');
      assert.ok(resultLog, 'result の文字列がログに含まれる');
    });

    // TC-CC-N-06: result で result.text がある
    test('TC-CC-N-06: result イベントで result.text がある場合ログに含まれる', () => {
      // Given: result event with result.text
      const obj = {
        type: 'result',
        duration_ms: 1000,
        result: { text: 'Result text field' },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: log イベントに text が含まれる
      const logs = result.events.filter((e) => e.type === 'log');
      const resultLog = logs.find((e) => e.type === 'log' && e.message === 'Result text field');
      assert.ok(resultLog, 'result.text がログに含まれる');
    });

    // TC-CC-N-07: result で result.content 配列
    test('TC-CC-N-07: result イベントで result.content 配列の場合ログに含まれる', () => {
      // Given: result event with result.content array
      const obj = {
        type: 'result',
        duration_ms: 1000,
        result: {
          content: [{ text: 'Content array text' }],
        },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: log イベントに content[0].text が含まれる
      const logs = result.events.filter((e) => e.type === 'log');
      const resultLog = logs.find((e) => e.type === 'log' && e.message === 'Content array text');
      assert.ok(resultLog, 'result.content[0].text がログに含まれる');
    });

    // TC-CC-E-01: tool_call で toolCall が無い場合
    test('TC-CC-E-01: tool_call で tool_call プロパティが無いと何も発火しない', () => {
      // Given: tool_call without tool_call property
      const obj = {
        type: 'tool_call',
        subtype: 'started',
        // tool_call プロパティ無し
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: イベントは発火しない
      assert.strictEqual(result.events.length, 0, 'tool_call が無い場合はイベント発火なし');
    });

    // TC-CC-N-08: findToolCallName で writeToolCall
    test('TC-CC-N-08: findToolCallName で writeToolCall が検出される', () => {
      // Given: tool_call with writeToolCall key
      const filePath = path.join(workspaceRoot, 'write-tool-call.ts');
      const obj = {
        type: 'tool_call',
        subtype: 'started',
        tool_call: {
          writeToolCall: {
            args: { path: filePath },
          },
        },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: fileWrite が発火
      assert.strictEqual(result.events.length, 1);
      assert.strictEqual(result.events[0]?.type, 'fileWrite');
    });

    // TC-CC-N-09: findToolCallName で未知のキー
    test('TC-CC-N-09: findToolCallName で未知のキーは最初のキーが使われる', () => {
      // Given: tool_call with unknown key containing 'edit' in name
      const filePath = path.join(workspaceRoot, 'unknown-edit.ts');
      const obj = {
        type: 'tool_call',
        subtype: 'started',
        tool_call: {
          customEditOperation: {
            args: { path: filePath },
          },
        },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: fileWrite が発火（edit を含むので isWriteOperation = true）
      assert.strictEqual(result.events.length, 1);
      assert.strictEqual(result.events[0]?.type, 'fileWrite');
    });

    // TC-CC-B-01: tool_call で isWriteOperation が false
    test('TC-CC-B-01: tool_call で読み取り操作の場合は fileWrite が発火しない', () => {
      // Given: tool_call with read operation
      const obj = {
        type: 'tool_call',
        subtype: 'started',
        tool_call: {
          Read: {
            args: { path: '/some/path.ts' },
          },
        },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: イベントは発火しない
      assert.strictEqual(result.events.length, 0, '読み取り操作では fileWrite が発火しない');
    });

    // TC-CC-N-10: editToolCall で subtype=started
    test('TC-CC-N-10: editToolCall で subtype=started の場合 fileWrite が発火する', () => {
      // Given: tool_call with editToolCall and subtype=started
      const filePath = path.join(workspaceRoot, 'edit-tool-call.ts');
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

      // Then: fileWrite が発火
      assert.strictEqual(result.events.length, 1);
      assert.strictEqual(result.events[0]?.type, 'fileWrite');
      if (result.events[0]?.type === 'fileWrite') {
        assert.strictEqual(result.events[0].path, path.relative(workspaceRoot, filePath));
      }
    });

    // TC-CC-N-11: assistant イベントで message.content が空配列
    test('TC-CC-N-11: assistant イベントで message.content が空配列の場合ログが発火しない', () => {
      // Given: assistant event with empty content array
      const obj = {
        type: 'assistant',
        message: { content: [] },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: イベントは発火しない
      assert.strictEqual(result.events.length, 0, '空の content ではログが発火しない');
    });

    // TC-CC-N-12: system イベントで subtype が無い場合
    test('TC-CC-N-12: system イベントで subtype が無い場合ログが発火しない', () => {
      // Given: system event without subtype
      const obj = { type: 'system' };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: イベントは発火しない
      assert.strictEqual(result.events.length, 0, 'subtype が無い system ではログが発火しない');
    });

    // TC-CC-B-02: result で result.message がある場合
    test('TC-CC-B-02: result イベントで result.message がある場合ログに含まれる', () => {
      // Given: result event with result.message
      const obj = {
        type: 'result',
        duration_ms: 1000,
        result: { message: 'Result message field' },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: log イベントに message が含まれる
      const logs = result.events.filter((e) => e.type === 'log');
      const resultLog = logs.find((e) => e.type === 'log' && e.message === 'Result message field');
      assert.ok(resultLog, 'result.message がログに含まれる');
    });

    // TC-CC-B-03: tool_call completed で pathFromArgs も pathFromSuccess も無く lastWritePath も無い場合
    test('TC-CC-B-03: tool_call completed でパスが全く無い場合は fileWrite が発火しない', () => {
      // Given: tool_call completed with no path anywhere
      const obj = {
        type: 'tool_call',
        subtype: 'completed',
        tool_call: {
          Write: {
            args: {},
            result: { success: {} },
          },
        },
      };

      // When: handleStreamJson is called with no lastWritePath
      const result = runHandle(obj, undefined);

      // Then: イベントは発火しない
      assert.strictEqual(result.events.length, 0, 'パスが無い場合は fileWrite が発火しない');
    });

    // TC-CC-N-13: tool_call started で path 更新と fileWrite が両方発火
    test('TC-CC-N-13: tool_call started で next が返され lastWritePath が更新される', () => {
      // Given: tool_call started with path
      const filePath = path.join(workspaceRoot, 'started-path.ts');
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

      // Then: fileWrite が発火し、next が返される
      assert.strictEqual(result.events.length, 1);
      assert.strictEqual(result.events[0]?.type, 'fileWrite');
      assert.strictEqual(result.next, filePath, 'next に filePath が返される');
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

    // TC-HB-01: 出力がない場合、heartbeat 初回ログが出る
    test('TC-HB-01: 出力がない場合、heartbeat のログが発火する', () => {
      // Given: A wired child process (no output)
      const provider = new ClaudeCodeProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];

      const timers = patchTimers();
      const { child } = createFakeChild();

      try {
        const options: AgentRunOptions = {
          taskId: 'wo-heartbeat-1',
          workspaceRoot: path.resolve('tmp-workspace'),
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (e) => events.push(e),
        };

        // When: wireOutput して、タイムアウトを進める（setTimeout を強制実行）
        wireOutput(child, options);
        timers.fireAllTimeouts();

        // Then: 「まだ出力がありません」系のログが出る
        const hbLog = events.find((e) => e.type === 'log' && e.level === 'info' && e.message.includes('まだ出力がありません'));
        assert.ok(hbLog, 'Expected a heartbeat log when no output is received');
      } finally {
        timers.restore();
      }
    });

    // TC-HB-02: 先に出力が来た場合、heartbeat は発火しない
    test('TC-HB-02: 先に stdout 出力が来た場合、heartbeat のログは発火しない', () => {
      // Given: A wired child process
      const provider = new ClaudeCodeProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];

      const timers = patchTimers();
      const { child, stdout } = createFakeChild();

      try {
        const options: AgentRunOptions = {
          taskId: 'wo-heartbeat-2',
          workspaceRoot: path.resolve('tmp-workspace'),
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (e) => events.push(e),
        };

        wireOutput(child, options);

        // When: heartbeat のタイムアウト前に何か出力が来る（markOutput が動く）
        stdout.emit('data', Buffer.from('not-json\n'));
        timers.fireAllTimeouts();

        // Then: heartbeat のログは出ない（clearTimeout されている想定）
        const hbLog = events.find((e) => e.type === 'log' && e.level === 'info' && e.message.includes('まだ出力がありません'));
        assert.strictEqual(hbLog, undefined);
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

  suite('extractAssistantText', () => {
    test('TC-EXAT-01: message=null の場合 undefined を返す', () => {
      // Given: message=null
      const message: unknown = null;

      // When: extractAssistantText を呼ぶ
      const text = claudeCodeProviderTest.extractAssistantText(message);

      // Then: undefined が返る
      assert.strictEqual(text, undefined);
    });

    test('TC-EXAT-02: message がプリミティブ（number）の場合 undefined を返す', () => {
      // Given: message=1
      const message: unknown = 1;

      // When: extractAssistantText を呼ぶ
      const text = claudeCodeProviderTest.extractAssistantText(message);

      // Then: undefined が返る
      assert.strictEqual(text, undefined);
    });

    test('TC-EXAT-03: message が Record でも content が無い場合 undefined を返す', () => {
      // Given: message={}
      const message: unknown = {};

      // When: extractAssistantText を呼ぶ
      const text = claudeCodeProviderTest.extractAssistantText(message);

      // Then: undefined が返る
      assert.strictEqual(text, undefined);
    });

    test('TC-EXAT-04: content が配列でない場合 undefined を返す', () => {
      // Given: message.content が配列でない
      const message: unknown = { content: 'not-array' };

      // When: extractAssistantText を呼ぶ
      const text = claudeCodeProviderTest.extractAssistantText(message);

      // Then: undefined が返る
      assert.strictEqual(text, undefined);
    });

    test('TC-EXAT-05: content が空配列の場合 undefined を返す', () => {
      // Given: message.content=[]
      const message: unknown = { content: [] };

      // When: extractAssistantText を呼ぶ
      const text = claudeCodeProviderTest.extractAssistantText(message);

      // Then: undefined が返る
      assert.strictEqual(text, undefined);
    });

    test('TC-EXAT-06: content[0] が Record に見えない場合 undefined を返す', () => {
      // Given: content[0]=null
      const message: unknown = { content: [null] };

      // When: extractAssistantText を呼ぶ
      const text = claudeCodeProviderTest.extractAssistantText(message);

      // Then: undefined が返る
      assert.strictEqual(text, undefined);
    });

    test('TC-EXAT-07: firstRec.text が string でない場合 undefined を返す', () => {
      // Given: text が数値
      const message: unknown = { content: [{ text: 123 }] };

      // When: extractAssistantText を呼ぶ
      const text = claudeCodeProviderTest.extractAssistantText(message);

      // Then: undefined が返る
      assert.strictEqual(text, undefined);
    });

    test('TC-EXAT-08: firstRec.text が string の場合 text を返す', () => {
      // Given: text が文字列
      const message: unknown = { content: [{ text: 'hello' }] };

      // When: extractAssistantText を呼ぶ
      const text = claudeCodeProviderTest.extractAssistantText(message);

      // Then: text が返る
      assert.strictEqual(text, 'hello');
    });
  });
});
