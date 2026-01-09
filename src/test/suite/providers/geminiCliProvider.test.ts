import * as assert from 'assert';
import * as path from 'path';
import { EventEmitter } from 'events';
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
      model: undefined, // 境界値 – undefined
      onEvent: () => {},
    };

    // When: run() is called
    const task = provider.run(options);

    // Then: returns RunningTask normally
    assert.strictEqual(task.taskId, 'gemini-task-undef-model');
    task.dispose();
  });

  // ============================================
  // テスト観点表（追加分）: wireOutput / handleStreamJson の分岐カバレッジ
  // ============================================
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-GEM-N-08 | init イベント受信 | Equivalence – started 発火 | started イベントが発火する | emitStarted が呼ばれる |
  // | TC-GEM-E-02 | JSONパース失敗行 | Error – パースエラー | warn ログにエラー内容が含まれる | - |
  // | TC-GEM-N-09 | tool_use で replace | Equivalence – fileWrite | fileWrite イベントが発火 | write_file 同様 |
  // | TC-GEM-N-10 | tool_result.result.output | Equivalence – 抽出 | log イベントに output が含まれる | - |
  // | TC-GEM-N-11 | tool_result.result.content | Equivalence – 抽出 | log イベントに content が含まれる | - |
  // | TC-GEM-N-12 | result イベント | Equivalence – status ログ | log イベントに status が含まれる | - |
  // | TC-GEM-B-01 | workspace 外パス | Boundary – パス変換 | fileWrite.path が絶対パスになる | - |
  // | TC-GEM-E-03 | activeChild 存在時に run() | Error – 多重起動 | 旧 child.kill() + warn ログ | - |
  // | TC-GEM-E-04 | child.on('error') | Error – spawn エラー | error ログと completed(null) | - |
  // | TC-GEM-N-13 | child.on('close', 0) | Equivalence – 正常終了 | completed(0) イベント発火 | - |
  // | TC-GEM-E-05 | stderr 出力 | Error – stderr | error レベルのログ発火 | - |
  // | TC-GEM-N-14 | message で delta あり | Equivalence – delta テキスト | log イベントに delta が含まれる | - |
  // | TC-GEM-B-02 | message で content 配列（文字列要素） | Boundary – テキスト抽出 | log イベントにテキストが含まれる | - |
  // | TC-GEM-N-15 | 未知の type イベント | Equivalence – デフォルト処理 | log に event:type が含まれる | - |

  suite('wireOutput / handleStreamJson 追加カバレッジ', () => {
    type HandleStreamJson = (
      obj: Record<string, unknown>,
      options: AgentRunOptions,
      toolIdToPath: Map<string, string>,
      emitStarted: () => void,
      emitEvent: (event: TestGenEvent) => void,
    ) => void;

    type WireOutput = (child: unknown, options: AgentRunOptions) => void;

    type EventEmitterExt = EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      stdin: { end: () => void };
      kill: () => boolean;
    };

    const createFakeChild = (): {
      child: EventEmitterExt;
      stdout: EventEmitter;
      stderr: EventEmitter;
      killedRef: { killed: boolean };
    } => {
      const emitter = new EventEmitter();
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      const killedRef = { killed: false };

      const child = Object.assign(emitter, {
        stdout,
        stderr,
        stdin: { end: () => {} },
        kill: () => {
          killedRef.killed = true;
          return true;
        },
      });

      return { child: child as EventEmitterExt, stdout, stderr, killedRef };
    };

    const workspaceRoot = path.resolve('tmp-workspace-gemini');
    const baseOptions: AgentRunOptions = {
      taskId: 'gemini-task-test',
      workspaceRoot,
      prompt: 'test prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: () => {},
    };

    // TC-GEM-N-08: init イベント受信で started が発火
    test('TC-GEM-N-08: init イベント受信で started イベントが発火する', () => {
      // Given: handleStreamJson のテスト
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      let startedCalled = false;
      const events: TestGenEvent[] = [];
      const obj = { type: 'init' };

      // When: handleStreamJson を呼び出す
      handleStreamJson(obj, baseOptions, new Map(), () => { startedCalled = true; }, (event) => events.push(event));

      // Then: emitStarted が呼ばれる
      assert.strictEqual(startedCalled, true, 'emitStarted が呼ばれる');
    });

    // TC-GEM-E-02: JSONパース失敗行で warn ログが発火
    test('TC-GEM-E-02: JSONパース失敗行で warn ログが発火する', () => {
      // Given: wireOutput のテスト
      const provider = new GeminiCliProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const { child, stdout } = createFakeChild();
      const events: TestGenEvent[] = [];
      const options: AgentRunOptions = {
        ...baseOptions,
        taskId: 'json-parse-fail',
        onEvent: (event) => events.push(event),
      };

      wireOutput(child, options);

      // When: 不正な JSON 行が送られる
      stdout.emit('data', Buffer.from('not valid json\n'));

      // Then: warn ログが発火
      const warnLogs = events.filter((e) => e.type === 'log' && e.level === 'warn');
      assert.ok(warnLogs.length >= 1, 'warn ログが発火');
      assert.ok(warnLogs[0]?.type === 'log' && warnLogs[0].message.includes('parse error'), 'パースエラーメッセージが含まれる');
    });

    // TC-GEM-N-09: tool_use で replace も fileWrite として扱う
    test('TC-GEM-N-09: tool_use で replace も fileWrite イベントが発火する', () => {
      // Given: handleStreamJson のテスト
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const toolIdToPath = new Map<string, string>();
      const filePath = path.join(workspaceRoot, 'replaced.ts');
      const obj = {
        type: 'tool_use',
        tool_name: 'replace',
        tool_id: 'replace-1',
        parameters: { file_path: filePath },
      };

      // When: handleStreamJson を呼び出す
      handleStreamJson(obj, baseOptions, toolIdToPath, () => {}, (event) => events.push(event));

      // Then: fileWrite イベントが発火
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'fileWrite');
      if (events[0]?.type === 'fileWrite') {
        assert.strictEqual(events[0].path, 'replaced.ts');
      }
    });

    // TC-GEM-N-10: tool_result.result.output の抽出
    test('TC-GEM-N-10: tool_result で result.output が log に含まれる', () => {
      // Given: handleStreamJson のテスト
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const toolIdToPath = new Map<string, string>();
      toolIdToPath.set('tool-result-1', 'some-file.ts');
      const obj = {
        type: 'tool_result',
        tool_id: 'tool-result-1',
        result: { output: 'Nested output text' },
      };

      // When: handleStreamJson を呼び出す
      handleStreamJson(obj, baseOptions, toolIdToPath, () => {}, (event) => events.push(event));

      // Then: log イベントに output が含まれる
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.ok(events[0].message.includes('Nested output text'));
      }
    });

    // TC-GEM-N-11: tool_result.result.content の抽出
    test('TC-GEM-N-11: tool_result で result.content が log に含まれる', () => {
      // Given: handleStreamJson のテスト
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const toolIdToPath = new Map<string, string>();
      toolIdToPath.set('tool-result-2', 'some-file.ts');
      const obj = {
        type: 'tool_result',
        tool_id: 'tool-result-2',
        result: { content: 'Nested content text' },
      };

      // When: handleStreamJson を呼び出す
      handleStreamJson(obj, baseOptions, toolIdToPath, () => {}, (event) => events.push(event));

      // Then: log イベントに content が含まれる
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.ok(events[0].message.includes('Nested content text'));
      }
    });

    // TC-GEM-N-12: result イベントで status ログが発火
    test('TC-GEM-N-12: result イベントで status ログが発火する', () => {
      // Given: handleStreamJson のテスト
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const obj = { type: 'result', status: 'success' };

      // When: handleStreamJson を呼び出す
      handleStreamJson(obj, baseOptions, new Map(), () => {}, (event) => events.push(event));

      // Then: log イベントに status が含まれる
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.ok(events[0].message.includes('status=success'));
      }
    });

    // TC-GEM-B-01: workspace 外パスは絶対パスになる
    test('TC-GEM-B-01: workspace 外パスは絶対パスで fileWrite される', () => {
      // Given: handleStreamJson のテスト
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const outsidePath = path.resolve(workspaceRoot, '..', 'outside', 'file.ts');
      const obj = {
        type: 'tool_use',
        tool_name: 'write_file',
        tool_id: 'outside-1',
        parameters: { file_path: outsidePath },
      };

      // When: handleStreamJson を呼び出す
      handleStreamJson(obj, baseOptions, new Map(), () => {}, (event) => events.push(event));

      // Then: fileWrite.path が絶対パス（フォールバック）
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'fileWrite');
      if (events[0]?.type === 'fileWrite') {
        // workspace 外なので絶対パスにフォールバック
        assert.strictEqual(events[0].path, outsidePath);
      }
    });

    // TC-GEM-E-03: activeChild 存在時に run() すると旧 child.kill() が呼ばれ warn ログが発火
    test('TC-GEM-E-03: activeChild 存在時に run() で旧 child.kill() と warn ログが発火する', () => {
      // Given: 既に activeChild が存在する状態
      const provider = new GeminiCliProvider();
      let prevKilledCount = 0;
      const prevChild = {
        kill: () => {
          prevKilledCount += 1;
          return true;
        },
      };
      (provider as unknown as { activeChild: unknown }).activeChild = prevChild;
      (provider as unknown as { activeTaskId: string }).activeTaskId = 'prev-gemini-task';

      const { child: newChild } = createFakeChild();
      (provider as unknown as { spawnGeminiCli: () => unknown }).spawnGeminiCli = () => newChild;
      (provider as unknown as { wireOutput: WireOutput }).wireOutput = () => {};

      const events: TestGenEvent[] = [];
      const options: AgentRunOptions = {
        ...baseOptions,
        taskId: 'new-gemini-task',
        onEvent: (event) => events.push(event),
      };

      // When: run() を呼び出す
      const task = provider.run(options);
      task.dispose();

      // Then: 旧 child.kill() が呼ばれ、warn ログが発火
      assert.strictEqual(prevKilledCount, 1, '旧 activeChild.kill() が 1 回呼ばれる');
      const warnLogs = events.filter((e) => e.type === 'log' && e.level === 'warn');
      assert.ok(warnLogs.length >= 1, 'warn ログが発火');
      assert.ok(warnLogs[0]?.type === 'log' && warnLogs[0].message.includes('prev-gemini-task'), '旧タスク ID が含まれる');
    });

    // TC-GEM-E-04: child.on('error') で error ログと completed(null) が発火
    test('TC-GEM-E-04: child.on error で error ログと completed(null) が発火する', () => {
      // Given: wireOutput のテスト
      const provider = new GeminiCliProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const { child } = createFakeChild();
      (provider as unknown as { activeChild: unknown }).activeChild = child;

      const events: TestGenEvent[] = [];
      const options: AgentRunOptions = {
        ...baseOptions,
        taskId: 'error-gemini-task',
        onEvent: (event) => events.push(event),
      };

      wireOutput(child, options);

      // When: error イベントを発火
      child.emit('error', new Error('spawn ENOENT'));

      // Then: error ログと completed(null) が発火
      const errorLogs = events.filter((e) => e.type === 'log' && e.level === 'error');
      assert.ok(errorLogs.length >= 1, 'error ログが発火');

      const completed = events.filter((e) => e.type === 'completed');
      assert.strictEqual(completed.length, 1, 'completed イベントが発火');
      if (completed[0]?.type === 'completed') {
        assert.strictEqual(completed[0].exitCode, null, 'exitCode が null');
      }
    });

    // TC-GEM-N-13: child.on('close', 0) で completed(0) が発火
    test('TC-GEM-N-13: child.on close(0) で completed(0) イベントが発火する', () => {
      // Given: wireOutput のテスト
      const provider = new GeminiCliProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const { child } = createFakeChild();
      (provider as unknown as { activeChild: unknown }).activeChild = child;

      const events: TestGenEvent[] = [];
      const options: AgentRunOptions = {
        ...baseOptions,
        taskId: 'close-gemini-task',
        onEvent: (event) => events.push(event),
      };

      wireOutput(child, options);

      // When: close イベントを発火
      child.emit('close', 0);

      // Then: completed(0) が発火
      const completed = events.filter((e) => e.type === 'completed');
      assert.strictEqual(completed.length, 1, 'completed イベントが発火');
      if (completed[0]?.type === 'completed') {
        assert.strictEqual(completed[0].exitCode, 0, 'exitCode が 0');
      }
    });

    // TC-GEM-E-05: stderr 出力で error レベルのログが発火
    test('TC-GEM-E-05: stderr 出力で error レベルのログが発火する', () => {
      // Given: wireOutput のテスト
      const provider = new GeminiCliProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const { child, stderr } = createFakeChild();

      const events: TestGenEvent[] = [];
      const options: AgentRunOptions = {
        ...baseOptions,
        taskId: 'stderr-gemini-task',
        onEvent: (event) => events.push(event),
      };

      wireOutput(child, options);

      // When: stderr に出力
      stderr.emit('data', Buffer.from('stderr error message'));

      // Then: error レベルのログが発火
      const errorLogs = events.filter((e) => e.type === 'log' && e.level === 'error');
      assert.strictEqual(errorLogs.length, 1, 'error ログが発火');
      if (errorLogs[0]?.type === 'log') {
        assert.strictEqual(errorLogs[0].message, 'stderr error message');
      }
    });

    // TC-GEM-N-14: message で delta あり
    test('TC-GEM-N-14: message で delta があると log イベントに含まれる', () => {
      // Given: handleStreamJson のテスト
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const obj = {
        type: 'message',
        role: 'assistant',
        delta: 'Incremental text',
      };

      // When: handleStreamJson を呼び出す
      handleStreamJson(obj, baseOptions, new Map(), () => {}, (event) => events.push(event));

      // Then: log イベントに delta が含まれる
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.strictEqual(events[0].message, 'Incremental text');
      }
    });

    // TC-GEM-B-02: message で content 配列（文字列要素）
    test('TC-GEM-B-02: message の content 配列に文字列要素があると連結される', () => {
      // Given: handleStreamJson のテスト
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const obj = {
        type: 'message',
        role: 'assistant',
        content: ['Hello', ' ', 'World'],
      };

      // When: handleStreamJson を呼び出す
      handleStreamJson(obj, baseOptions, new Map(), () => {}, (event) => events.push(event));

      // Then: log イベントに連結テキストが含まれる
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.strictEqual(events[0].message, 'Hello World');
      }
    });

    // TC-GEM-N-15: 未知の type イベントで event:type がログされる
    test('TC-GEM-N-15: 未知の type イベントで event:type がログされる', () => {
      // Given: handleStreamJson のテスト
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const obj = { type: 'unknown_event_type' };

      // When: handleStreamJson を呼び出す
      handleStreamJson(obj, baseOptions, new Map(), () => {}, (event) => events.push(event));

      // Then: log イベントに event:unknown_event_type が含まれる
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.strictEqual(events[0].message, 'event:unknown_event_type');
      }
    });

    // TC-GEM-E-06: error イベントに message が無い場合のデフォルトメッセージ
    test('TC-GEM-E-06: error イベントに message が無い場合デフォルトメッセージが使われる', () => {
      // Given: handleStreamJson のテスト
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const obj = { type: 'error' }; // message 無し

      // When: handleStreamJson を呼び出す
      handleStreamJson(obj, baseOptions, new Map(), () => {}, (event) => events.push(event));

      // Then: log イベントにデフォルトメッセージが含まれる
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.strictEqual(events[0].level, 'error');
        assert.ok(events[0].message.includes('gemini error'));
      }
    });

    // TC-GEM-B-03: tool_result で toolIdToPath に無い tool_id の場合
    test('TC-GEM-B-03: tool_result で toolIdToPath に無い tool_id の場合はログが出ない', () => {
      // Given: handleStreamJson のテスト
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const toolIdToPath = new Map<string, string>(); // 空
      const obj = {
        type: 'tool_result',
        tool_id: 'unknown-tool-id',
        output: 'Some output',
      };

      // When: handleStreamJson を呼び出す
      handleStreamJson(obj, baseOptions, toolIdToPath, () => {}, (event) => events.push(event));

      // Then: イベントは発火しない（filePath が無いため）
      assert.strictEqual(events.length, 0, 'toolIdToPath に無い場合はログが出ない');
    });

    // TC-GEM-B-04: 相対パスはそのまま使われる
    test('TC-GEM-B-04: 相対パスはそのまま fileWrite される', () => {
      // Given: handleStreamJson のテスト
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const relativePath = 'src/relative.ts';
      const obj = {
        type: 'tool_use',
        tool_name: 'write_file',
        tool_id: 'relative-1',
        parameters: { file_path: relativePath },
      };

      // When: handleStreamJson を呼び出す
      handleStreamJson(obj, baseOptions, new Map(), () => {}, (event) => events.push(event));

      // Then: fileWrite.path が相対パスのまま
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'fileWrite');
      if (events[0]?.type === 'fileWrite') {
        assert.strictEqual(events[0].path, relativePath);
      }
    });

    // TC-GEM-B-05: message で role が無いとログされない
    test('TC-GEM-B-05: message で role が assistant/model 以外だとログされない', () => {
      // Given: handleStreamJson のテスト
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const obj = {
        type: 'message',
        role: 'user',
        content: 'User message',
      };

      // When: handleStreamJson を呼び出す
      handleStreamJson(obj, baseOptions, new Map(), () => {}, (event) => events.push(event));

      // Then: イベントは発火しない（user role のため）
      assert.strictEqual(events.length, 0, 'user role の message はログされない');
    });

    // TC-GEM-E-07: completed イベントは複数回呼んでも 1 回のみ発火（冪等性）
    test('TC-GEM-E-07: completed は複数回呼んでも 1 回のみ発火する', () => {
      // Given: wireOutput のテスト
      const provider = new GeminiCliProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const { child } = createFakeChild();

      const events: TestGenEvent[] = [];
      const options: AgentRunOptions = {
        ...baseOptions,
        taskId: 'idempotent-gemini-task',
        onEvent: (event) => events.push(event),
      };

      wireOutput(child, options);

      // When: close が複数回発火
      child.emit('close', 0);
      child.emit('close', 1);
      child.emit('error', new Error('late error'));

      // Then: completed は 1 回のみ
      const completed = events.filter((e) => e.type === 'completed');
      assert.strictEqual(completed.length, 1, 'completed イベントは 1 回のみ発火');
      if (completed[0]?.type === 'completed') {
        assert.strictEqual(completed[0].exitCode, 0, '最初の exitCode が使われる');
      }
    });

    // TC-GEM-N-16: result イベントで status が未定義の場合 unknown と表示
    test('TC-GEM-N-16: result イベントで status が未定義の場合 unknown と表示される', () => {
      // Given: handleStreamJson のテスト
      const provider = new GeminiCliProvider();
      const handleStreamJson = (provider as unknown as { handleStreamJson: HandleStreamJson }).handleStreamJson.bind(provider);
      const events: TestGenEvent[] = [];
      const obj = { type: 'result' }; // status 無し

      // When: handleStreamJson を呼び出す
      handleStreamJson(obj, baseOptions, new Map(), () => {}, (event) => events.push(event));

      // Then: log イベントに status=unknown が含まれる
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0]?.type, 'log');
      if (events[0]?.type === 'log') {
        assert.ok(events[0].message.includes('status=unknown'));
      }
    });
  });
});
