import * as assert from 'assert';
import * as path from 'path';
import { EventEmitter } from 'events';
import * as childProcess from 'child_process';
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
      // Given: CursorAgentProvider を生成する
      const provider = new CursorAgentProvider();

      // When: id / displayName を参照する
      // Then: 期待値が返る
      assert.strictEqual(provider.id, 'cursor-agent');
      assert.strictEqual(provider.displayName, 'Cursor Agent');
    });

    // Given: agentCommandが指定されている
    // When: runを呼び出す
    // Then: 指定されたコマンドが使用される
    test('TC-N-04: agentCommandが指定されている', async () => {
      // Given: agentCommand を指定した AgentRunOptions
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

      // Then: RunningTask が返り、started イベントにカスタムコマンドが含まれる
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
      // Given: agentCommand 未指定の AgentRunOptions
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

      // Then: started イベントにデフォルトのコマンドが含まれる
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
      // Given: model を指定した AgentRunOptions
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

      // Then: started イベントに model=... が含まれる
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
      // Given: allowWrite=true の AgentRunOptions
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

      // Then: started イベントに write=on が含まれる
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
      // Given: allowWrite=false の AgentRunOptions
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

      // Then: started イベントに write=off が含まれる
      // startedイベントでwrite=offが含まれることを確認
      const startedEvent = events.find((e) => e.type === 'started');
      if (startedEvent && startedEvent.type === 'started') {
        assert.ok(startedEvent.detail?.includes('write=off'), 'write=offが含まれる');
      }

      // クリーンアップ & 非同期イベントの収束を待つ
      task.dispose();
      await waitForAsyncCleanup();
    });

    // Given: modelにカンマ区切りで複数指定した場合
    // When: runを呼び出す
    // Then: 指定した文字列がそのまま --model オプションの値として渡される
    test('TC-N-09: modelにカンマ区切りで複数指定した場合', async () => {
      // Given: model に "modelA,modelB" を指定した AgentRunOptions
      const provider = new CursorAgentProvider();
      const events: TestGenEvent[] = [];

      const options: AgentRunOptions = {
        taskId: 'test-task-multi-model',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        model: 'modelA,modelB',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => {
          events.push(event);
        },
      };

      const task = provider.run(options);

      // Then: started イベントに model=modelA,modelB が含まれる
      // (これはプロバイダーが文字列をそのまま渡していることを確認するため)
      const startedEvent = events.find((e) => e.type === 'started');
      if (startedEvent && startedEvent.type === 'started') {
        assert.ok(startedEvent.detail?.includes('model=modelA,modelB'), 'model指定値がそのまま渡される');
      }

      // クリーンアップ & 非同期イベントの収束を待つ
      task.dispose();
      await waitForAsyncCleanup();
    });

    // Given: dispose呼び出し
    // When: disposeを呼び出す
    // Then: プロセスがkillされる
    test('TC-A-07: dispose呼び出し', async () => {
      // Given: 実行中タスクを開始する
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

      // When: dispose を呼び出す
      // Then: 例外なく dispose できる
      // disposeが呼び出せることを確認
      assert.doesNotThrow(() => {
        task.dispose();
      });

      // 非同期イベントの収束を待つ
      await waitForAsyncCleanup();
    });

    test('TC-CAP-RUN-E-01: run() kills previous activeChild and emits warn log with previous task id', async () => {
      // Given: A provider with an existing activeChild + activeTaskId (multi-run scenario)
      const provider = new CursorAgentProvider();
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
      (provider as unknown as { activeTaskId: string | undefined }).activeTaskId = 'prev-task-123';
      (provider as unknown as { spawnCursorAgent: (options: AgentRunOptions) => unknown }).spawnCursorAgent = () => ({
        kill: () => true,
      });
      (provider as unknown as { wireOutput: (child: unknown, options: AgentRunOptions) => void }).wireOutput = () => {
        // noop: avoid timers and streams
      };

      const options: AgentRunOptions = {
        taskId: 'next-task-1',
        workspaceRoot: '/tmp',
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
      assert.ok(message.includes('prev-task-123'), 'Warn message should include previous task id');
    });

    test('TC-CAP-RUN-E-02: run() tolerates activeChild.kill() throw and still emits warn log', async () => {
      // Given: A provider with an activeChild whose kill() throws
      const provider = new CursorAgentProvider();
      const events: TestGenEvent[] = [];

      const prevChild = {
        kill: () => {
          throw new Error('kill failed');
        },
      };

      // Override internal state + internal methods to avoid spawning a real process
      (provider as unknown as { activeChild: unknown; activeTaskId: string | undefined }).activeChild = prevChild;
      (provider as unknown as { activeTaskId: string | undefined }).activeTaskId = 'prev-task-throw';
      (provider as unknown as { spawnCursorAgent: (options: AgentRunOptions) => unknown }).spawnCursorAgent = () => ({
        kill: () => true,
      });
      (provider as unknown as { wireOutput: (child: unknown, options: AgentRunOptions) => void }).wireOutput = () => {
        // noop
      };

      const options: AgentRunOptions = {
        taskId: 'next-task-2',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => events.push(event),
      };

      // When: run() is called
      assert.doesNotThrow(() => {
        const task = provider.run(options);
        task.dispose();
      });
      await waitForAsyncCleanup();

      // Then: A warning log is still emitted and includes previous task id
      const warnLogs = events.filter((e) => e.type === 'log' && e.level === 'warn');
      assert.ok(warnLogs.length >= 1, 'Expected at least one warn log event');
      const message = warnLogs[0]?.type === 'log' ? warnLogs[0].message : '';
      assert.ok(message.includes('prev-task-throw'), 'Warn message should include previous task id');
    });

    test('TC-CAP-RUN-B-01: run() uses unknown when previous activeTaskId is undefined', async () => {
      // Given: A provider with an existing activeChild but without activeTaskId
      const provider = new CursorAgentProvider();
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
      (provider as unknown as { activeTaskId: string | undefined }).activeTaskId = undefined;
      (provider as unknown as { spawnCursorAgent: (options: AgentRunOptions) => unknown }).spawnCursorAgent = () => ({
        kill: () => true,
      });
      (provider as unknown as { wireOutput: (child: unknown, options: AgentRunOptions) => void }).wireOutput = () => {
        // noop: avoid timers and streams
      };

      const options: AgentRunOptions = {
        taskId: 'next-task-unknown-prev',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => events.push(event),
      };

      // When: run() is called
      const task = provider.run(options);
      task.dispose();
      await waitForAsyncCleanup();

      // Then: Previous process kill is attempted and warning includes 'unknown'
      assert.strictEqual(killedCount, 1, 'Expected previous activeChild.kill() to be called exactly once');
      const warnLogs = events.filter((e) => e.type === 'log' && e.level === 'warn');
      assert.ok(warnLogs.length >= 1, 'Expected at least one warn log event');
      const message = warnLogs[0]?.type === 'log' ? warnLogs[0].message : '';
      assert.ok(message.includes('unknown'), 'Warn message should include unknown when previous task id is missing');
    });
  });

  suite('spawnCursorAgent', () => {
    type SpawnCursorAgent = (options: AgentRunOptions) => unknown;

    const getWritableChildProcessModule = (): { spawn: typeof childProcess.spawn } => {
      const mod = childProcess as unknown as { default?: { spawn: typeof childProcess.spawn } };
      // TypeScript の `import * as` はランタイムで __importStar を経由するため、
      // writable な CommonJS 実体は `default` に入るケースがある（そこを優先して差し替える）
      return mod.default ?? (childProcess as unknown as { spawn: typeof childProcess.spawn });
    };

    const createFakeChild = (endThrows: boolean): unknown => {
      const emitter = new EventEmitter();
      const stdout = new EventEmitter();
      const stderr = new EventEmitter();
      const child = Object.assign(emitter, {
        stdout,
        stderr,
        stdin: {
          end: () => {
            if (endThrows) {
              throw new Error('stdin end failed');
            }
          },
        },
        kill: () => true,
      });
      return child;
    };

    const withEnv = (overrides: Record<string, string | undefined>, fn: () => void): void => {
      const keys = Object.keys(overrides);
      const original: Record<string, string | undefined> = {};
      for (const k of keys) {
        original[k] = process.env[k];
        const next = overrides[k];
        if (next === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = next;
        }
      }
      try {
        fn();
      } finally {
        for (const k of keys) {
          const prev = original[k];
          if (prev === undefined) {
            delete process.env[k];
          } else {
            process.env[k] = prev;
          }
        }
      }
    };

    test('TC-CAP-SPAWN-B-01: runningInVsCode detection covers env OR branches and toggles non-interactive env overrides', () => {
      // Given: Spawn is patched to capture options.env
      const provider = new CursorAgentProvider();
      const spawnCursorAgent = (provider as unknown as { spawnCursorAgent: SpawnCursorAgent }).spawnCursorAgent.bind(provider);

      const cpWritable = getWritableChildProcessModule();
      const originalSpawn = cpWritable.spawn;
      const calls: Array<{ env: NodeJS.ProcessEnv | undefined }> = [];
      cpWritable.spawn = ((_: unknown, __: unknown, options: unknown) => {
        const env = (options as { env?: NodeJS.ProcessEnv } | undefined)?.env;
        calls.push({ env });
        return createFakeChild(false) as unknown as childProcess.ChildProcessWithoutNullStreams;
      }) as unknown as typeof childProcess.spawn;

      try {
        const baseOptions: AgentRunOptions = {
          taskId: 'spawn-test',
          workspaceRoot: '/tmp',
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: () => {},
        };

        // When: each env flag variation is applied and spawnCursorAgent is called
        const scenarios: Array<{ env: Record<string, string | undefined>; expectOverride: boolean }> = [
          {
            env: { VSCODE_IPC_HOOK_CLI: 'hook', VSCODE_PID: undefined, VSCODE_CWD: undefined, EDITOR: 'vim' },
            expectOverride: true,
          },
          {
            env: { VSCODE_IPC_HOOK_CLI: undefined, VSCODE_PID: '123', VSCODE_CWD: undefined, EDITOR: 'vim' },
            expectOverride: true,
          },
          {
            env: { VSCODE_IPC_HOOK_CLI: undefined, VSCODE_PID: undefined, VSCODE_CWD: '/tmp', EDITOR: 'vim' },
            expectOverride: true,
          },
          {
            env: { VSCODE_IPC_HOOK_CLI: undefined, VSCODE_PID: undefined, VSCODE_CWD: undefined, EDITOR: 'vim' },
            expectOverride: false,
          },
        ];

        for (const s of scenarios) {
          withEnv(s.env, () => {
            spawnCursorAgent(baseOptions);
          });
        }

        // Then: env overrides are applied only when runningInVsCode is true
        assert.strictEqual(calls.length, scenarios.length);
        for (let i = 0; i < scenarios.length; i += 1) {
          const expected = scenarios[i]?.expectOverride ? 'true' : 'vim';
          assert.strictEqual(calls[i]?.env?.EDITOR, expected);
        }
      } finally {
        cpWritable.spawn = originalSpawn;
      }
    });

    test('TC-CAP-SPAWN-E-01: spawnCursorAgent tolerates stdin.end throwing', () => {
      // Given: Spawn returns a child whose stdin.end throws
      const provider = new CursorAgentProvider();
      const spawnCursorAgent = (provider as unknown as { spawnCursorAgent: SpawnCursorAgent }).spawnCursorAgent.bind(provider);

      const cpWritable = getWritableChildProcessModule();
      const originalSpawn = cpWritable.spawn;
      cpWritable.spawn = (() => {
        return createFakeChild(true) as unknown as childProcess.ChildProcessWithoutNullStreams;
      }) as unknown as typeof childProcess.spawn;

      try {
        const options: AgentRunOptions = {
          taskId: 'spawn-stdin-throw',
          workspaceRoot: '/tmp',
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: () => {},
        };

        // When / Then: spawnCursorAgent does not throw even if stdin.end fails
        assert.doesNotThrow(() => {
          spawnCursorAgent(options);
        });
      } finally {
        cpWritable.spawn = originalSpawn;
      }
    });
  });

  // Test Perspectives Table for handleStreamJson
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-HSJ-N-01 | type=assistant with message.content[0].text | Equivalence – normal | Emits log event with assistant text | min/max/±1 not applicable for string payloads |
  // | TC-HSJ-N-02 | type=system with subtype="init" | Equivalence – normal | Emits log event "system:init" | - |
  // | TC-HSJ-N-03 | type=result with duration_ms=0 | Boundary – zero | Emits log event "result: duration_ms=0" | No defined min/max; ±1 not meaningful |
  // | TC-HSJ-N-04 | tool_call editToolCall started with args.path under workspace | Equivalence – normal | Emits fileWrite with relative path and returns lastWritePath | - |
  // | TC-HSJ-N-05 | tool_call editToolCall completed with linesAdded=0 and success.path | Boundary – zero | Emits fileWrite with linesCreated=0 and relative path | - |
  // | TC-HSJ-E-01 | type=thinking | Equivalence – ignored | No event emitted | Filtered high-frequency event |
  // | TC-HSJ-E-02 | type=user | Equivalence – ignored | No event emitted | Filtered high-frequency event |
  // | TC-HSJ-E-03 | type=assistant with empty content array | Boundary – empty | No event emitted | Invalid assistant payload; no exception thrown |
  // | TC-HSJ-E-04 | type=system without subtype | Boundary – null | No event emitted | Missing subtype is ignored |
  // | TC-HSJ-E-05 | type=tool_call with missing tool_call object | Equivalence – error | No event emitted | No tool_call to parse |
  // | TC-HSJ-E-06 | type=tool_call with non-edit ToolCall | Equivalence – error | No event emitted | Only editToolCall emits fileWrite |
  // | TC-HSJ-E-07 | type missing or non-string | Boundary – null | Emits log event "event:unknown" | Fallback path for unsupported event types |
  suite('handleStreamJson', () => {
    type HandleStreamJson = (
      obj: Record<string, unknown>,
      options: AgentRunOptions,
      lastWritePath: string | undefined,
      emitEvent: (event: TestGenEvent) => void,
    ) => string | undefined;

    const provider = new CursorAgentProvider();
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

    test('TC-HSJ-N-01: emits log for assistant message text', () => {
      // Given: An assistant event with text content
      const obj = { type: 'assistant', message: { content: [{ text: 'hello' }] } };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: A log event with the assistant text is emitted
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'log');
      if (event?.type === 'log') {
        assert.strictEqual(event.level, 'info');
        assert.strictEqual(event.message, 'hello');
      }
      assert.strictEqual(result.next, undefined);
    });

    test('TC-HSJ-N-02: emits log for system subtype', () => {
      // Given: A system event with subtype
      const obj = { type: 'system', subtype: 'init' };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: A log event with system label is emitted
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'log');
      if (event?.type === 'log') {
        assert.strictEqual(event.level, 'info');
        assert.strictEqual(event.message, 'system:init');
      }
    });

    test('TC-HSJ-N-03: emits log for result duration_ms=0', () => {
      // Given: A result event with duration_ms=0
      const obj = { type: 'result', duration_ms: 0 };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: A log event with duration_ms=0 is emitted
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'log');
      if (event?.type === 'log') {
        assert.strictEqual(event.level, 'info');
        assert.strictEqual(event.message, 'result: duration_ms=0');
      }
    });

    test('TC-HSJ-B-03: emits log for result when duration_ms is missing/invalid (unknown)', () => {
      // Given: A result event without a valid duration_ms
      const obj: Record<string, unknown> = { type: 'result', duration_ms: 'invalid' };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: A log event with duration_ms=unknown is emitted
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'log');
      if (event?.type === 'log') {
        assert.strictEqual(event.level, 'info');
        assert.strictEqual(event.message, 'result: duration_ms=unknown');
      }
    });

    test('TC-HSJ-N-04: emits fileWrite with relative path on editToolCall started', () => {
      // Given: editToolCall started with absolute path under workspace
      const filePath = path.join(workspaceRoot, 'src', 'generated.test.ts');
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

      // Then: fileWrite emits relative path and returns lastWritePath
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.path, path.relative(workspaceRoot, filePath));
        assert.strictEqual(event.linesCreated, undefined);
      }
      assert.strictEqual(result.next, filePath);
    });

    test('TC-HSJ-N-05: emits fileWrite with linesCreated=0 on editToolCall completed', () => {
      // Given: editToolCall completed with linesAdded=0 and success path
      const filePath = path.join(workspaceRoot, 'src', 'generated.test.ts');
      const obj = {
        type: 'tool_call',
        subtype: 'completed',
        tool_call: {
          editToolCall: {
            args: { path: filePath },
            result: { success: { path: filePath, linesAdded: 0 } },
          },
        },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: fileWrite includes linesCreated=0 with relative path
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.path, path.relative(workspaceRoot, filePath));
        assert.strictEqual(event.linesCreated, 0);
      }
      assert.strictEqual(result.next, filePath);
    });

    test('TC-HSJ-E-01: ignores thinking events', () => {
      // Given: A thinking event
      const obj = { type: 'thinking' };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-HSJ-E-02: ignores user events', () => {
      // Given: A user event
      const obj = { type: 'user' };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-HSJ-E-03: ignores assistant events with empty content array', () => {
      // Given: An assistant event with empty content
      const obj = { type: 'assistant', message: { content: [] } };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-HSJ-E-09: ignores assistant events when message is not an object', () => {
      // Given: An assistant event with a non-object message
      const obj: Record<string, unknown> = { type: 'assistant', message: 'not-object' };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-HSJ-E-10: ignores assistant events when content[0] is not an object', () => {
      // Given: An assistant event with invalid first content element
      const obj: Record<string, unknown> = { type: 'assistant', message: { content: ['not-object'] } };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-HSJ-E-11: ignores assistant events when text is not a string', () => {
      // Given: An assistant event whose text is not a string
      const obj: Record<string, unknown> = { type: 'assistant', message: { content: [{ text: 123 }] } };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-HSJ-E-04: ignores system events without subtype', () => {
      // Given: A system event without subtype
      const obj = { type: 'system' };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-HSJ-E-05: ignores tool_call events without tool_call payload', () => {
      // Given: A tool_call event without tool_call object
      const obj = { type: 'tool_call', subtype: 'started' };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-HSJ-E-06: ignores non-edit ToolCall events', () => {
      // Given: A tool_call event with non-edit ToolCall
      const obj = {
        type: 'tool_call',
        subtype: 'started',
        tool_call: {
          readToolCall: {
            args: { path: 'ignored.txt' },
          },
        },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-HSJ-E-07: emits fallback log for missing type', () => {
      // Given: An event without a valid type
      const obj: Record<string, unknown> = {};

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: A fallback log event is emitted
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'log');
      if (event?.type === 'log') {
        assert.strictEqual(event.level, 'info');
        assert.strictEqual(event.message, 'event:unknown');
      }
      assert.strictEqual(result.next, undefined);
    });

    test('TC-HSJ-B-01: emits fileWrite with absolute path when path is outside workspaceRoot', () => {
      // Given: editToolCall started with an absolute path outside workspaceRoot
      const filePath = path.resolve(workspaceRoot, '..', 'outside', 'generated.test.ts');
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

      // Then: fileWrite path falls back to the absolute path (relative is undefined) and returns lastWritePath
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.path, filePath);
      }
      assert.strictEqual(result.next, filePath);
    });

    test('TC-HSJ-B-02: emits fileWrite with relative path as-is when args.path is already relative', () => {
      // Given: editToolCall started with a relative path
      const filePath = path.join('src', 'generated.test.ts');
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

      // Then: fileWrite uses the same relative path and returns it as lastWritePath
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.path, filePath);
      }
      assert.strictEqual(result.next, filePath);
    });

    test('TC-HSJ-E-08: tool_call with empty tool_call object emits no event and does not throw', () => {
      // Given: A tool_call event with empty tool_call payload
      const obj = { type: 'tool_call', subtype: 'started', tool_call: {} };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No event is emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-HSJ-B-04: editToolCall started uses lastWritePath when args.path is missing', () => {
      // Given: editToolCall started without args.path but lastWritePath exists
      const lastWritePath = path.join(workspaceRoot, 'src', 'prev.test.ts');
      const obj: Record<string, unknown> = {
        type: 'tool_call',
        subtype: 'started',
        tool_call: { editToolCall: { args: {} } },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj, lastWritePath);

      // Then: fileWrite uses the provided lastWritePath and returns it
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.path, path.relative(workspaceRoot, lastWritePath));
      }
      assert.strictEqual(result.next, lastWritePath);
    });

    test('TC-HSJ-E-12: editToolCall started without any path sources emits no event', () => {
      // Given: editToolCall started without args.path and without lastWritePath
      const obj: Record<string, unknown> = {
        type: 'tool_call',
        subtype: 'started',
        tool_call: { editToolCall: { args: {} } },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj, undefined);

      // Then: No event is emitted and next is undefined
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-HSJ-B-05: editToolCall completed falls back to args.path when success.path is missing', () => {
      // Given: editToolCall completed with args.path but no success.path
      const filePath = path.join(workspaceRoot, 'src', 'generated.test.ts');
      const obj: Record<string, unknown> = {
        type: 'tool_call',
        subtype: 'completed',
        tool_call: { editToolCall: { args: { path: filePath }, result: { success: {} } } },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: fileWrite uses args.path and linesCreated is undefined
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.path, path.relative(workspaceRoot, filePath));
        assert.strictEqual(event.linesCreated, undefined);
      }
      assert.strictEqual(result.next, filePath);
    });

    test('TC-HSJ-B-06: editToolCall completed falls back to lastWritePath when paths are missing', () => {
      // Given: editToolCall completed without args.path/success.path but lastWritePath exists
      const lastWritePath = path.join(workspaceRoot, 'src', 'prev.test.ts');
      const obj: Record<string, unknown> = {
        type: 'tool_call',
        subtype: 'completed',
        tool_call: { editToolCall: { args: {} } },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj, lastWritePath);

      // Then: fileWrite uses lastWritePath
      assert.strictEqual(result.events.length, 1);
      const event = result.events[0];
      assert.strictEqual(event?.type, 'fileWrite');
      if (event?.type === 'fileWrite') {
        assert.strictEqual(event.path, path.relative(workspaceRoot, lastWritePath));
      }
      assert.strictEqual(result.next, lastWritePath);
    });

    test('TC-HSJ-E-13: editToolCall completed without any path sources emits no event', () => {
      // Given: editToolCall completed without args.path/success.path and without lastWritePath
      const obj: Record<string, unknown> = {
        type: 'tool_call',
        subtype: 'completed',
        tool_call: { editToolCall: { args: {} } },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj, undefined);

      // Then: No event is emitted and next is undefined
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-HSJ-B-07: tool_call key without ToolCall suffix uses fallback key selection', () => {
      // Given: tool_call uses an unexpected key name (no ToolCall suffix)
      const obj: Record<string, unknown> = {
        type: 'tool_call',
        subtype: 'started',
        tool_call: { foo: { args: { path: 'ignored.txt' } } },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No events are emitted and next is undefined
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });

    test('TC-HSJ-B-08: editToolCall with unsupported subtype emits no event', () => {
      // Given: editToolCall with a subtype other than started/completed
      const obj: Record<string, unknown> = {
        type: 'tool_call',
        subtype: 'progress',
        tool_call: { editToolCall: { args: { path: 'ignored.txt' } } },
      };

      // When: handleStreamJson is called
      const result = runHandle(obj);

      // Then: No event is emitted
      assert.strictEqual(result.events.length, 0);
      assert.strictEqual(result.next, undefined);
    });
  });

  suite('wireOutput (time-based monitoring without long sleeps)', () => {
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
        stdin: { end: () => {} },
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
            // setTimeoutは発火後に自動的に解除される想定に合わせる
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

    test('TC-CAP-WO-N-01: heartbeat emits log when there is no output yet (fake timers)', () => {
      // Given: wireOutput is wired with fake timers and a controlled clock
      const provider = new CursorAgentProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];

      const originalNow = Date.now;
      let fakeNow = 0;
      (Date as unknown as { now: () => number }).now = () => fakeNow;

      const timers = patchTimers();
      const { child, stdout, emitter } = createFakeChild();

      try {
        const options: AgentRunOptions = {
          taskId: 'wo-heartbeat',
          workspaceRoot: path.resolve('tmp-workspace'),
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (e) => events.push(e),
        };

        wireOutput(child, options);

        // When: Time advances beyond the initial heartbeat delay and the heartbeat timeout fires
        fakeNow = 10_000;
        timers.fireAllTimeouts();

        // Also simulate first output afterwards to cover heartbeatInterval cleanup path
        stdout.emit('data', Buffer.from('not-json\n'));

        // Then: A heartbeat info log is emitted
        const heartbeat = events.find(
          (e) => e.type === 'log' && e.level === 'info' && e.message.includes('まだ出力がありません'),
        );
        assert.ok(heartbeat, 'Expected a heartbeat info log when no output is observed');

        // Cleanup: close the process
        emitter.emit('close', 0);
        const completed = events.filter((e) => e.type === 'completed');
        assert.strictEqual(completed.length, 1, 'Expected exactly one completed event');
        if (completed[0]?.type === 'completed') {
          assert.strictEqual(completed[0].exitCode, 0);
        }
      } finally {
        timers.restore();
        (Date as unknown as { now: () => number }).now = originalNow;
      }
    });

    test('TC-CAP-WO-B-01: monitor emits a silence info log after output becomes quiet (fake timers + fake clock)', () => {
      // Given: A child that outputs once, then becomes silent beyond thresholds
      const provider = new CursorAgentProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];

      const originalNow = Date.now;
      let fakeNow = 0;
      (Date as unknown as { now: () => number }).now = () => fakeNow;

      const timers = patchTimers();
      const { child, stdout } = createFakeChild();

      try {
        const options: AgentRunOptions = {
          taskId: 'wo-silence',
          workspaceRoot: path.resolve('tmp-workspace'),
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (e) => events.push(e),
        };

        wireOutput(child, options);

        // When: Some output arrives at t=0
        fakeNow = 0;
        stdout.emit(
          'data',
          Buffer.from(
            [
              JSON.stringify({ type: 'assistant', message: { content: [{ text: 'hello' }] } }),
              '', // newline
            ].join('\n'),
          ),
        );

        // ...and later the monitor runs at t=30s (>=10s silence, >=30s log interval)
        fakeNow = 30_000;
        timers.fireAllIntervals();

        // Then: A silence info log is emitted
        const silence = events.find(
          (e) => e.type === 'log' && e.level === 'info' && e.message.includes('最終出力から'),
        );
        assert.ok(silence, 'Expected a silence info log after output becomes quiet');
      } finally {
        timers.restore();
        (Date as unknown as { now: () => number }).now = originalNow;
      }
    });

    test('TC-CAP-WO-N-02: monitor emits an ignored-summary log when only thinking/user are received (fake timers + fake clock)', () => {
      // Given: thinking/user-only output (no visible events), then a quiet period
      const provider = new CursorAgentProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];

      const originalNow = Date.now;
      let fakeNow = 0;
      (Date as unknown as { now: () => number }).now = () => fakeNow;

      const timers = patchTimers();
      const { child, stdout } = createFakeChild();

      try {
        const options: AgentRunOptions = {
          taskId: 'wo-ignored-summary',
          workspaceRoot: path.resolve('tmp-workspace'),
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (e) => events.push(e),
        };

        wireOutput(child, options);

        // When: Only thinking/user events arrive at t=25s (no emitted events)
        fakeNow = 25_000;
        stdout.emit(
          'data',
          Buffer.from([JSON.stringify({ type: 'thinking' }), JSON.stringify({ type: 'user' }), ''].join('\n')),
        );

        // ...and the monitor runs at t=30s
        fakeNow = 30_000;
        timers.fireAllIntervals();

        // Then: The ignored-summary info log is emitted
        const summary = events.find(
          (e) =>
            e.type === 'log' &&
            e.level === 'info' &&
            e.message.includes('表示されないイベントが継続') &&
            e.message.includes('ignored(thinking)=1') &&
            e.message.includes('ignored(user)=1') &&
            e.message.includes('last=user'),
        );
        assert.ok(summary, 'Expected an ignored-summary log for thinking/user-only output');
      } finally {
        timers.restore();
        (Date as unknown as { now: () => number }).now = originalNow;
      }
    });

    test('TC-CAP-WO-B-03: wireOutput updates lastWritePath and uses it when args.path is missing', () => {
      // Given: A wired child process with fake timers
      const provider = new CursorAgentProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];

      const timers = patchTimers();
      const { child, stdout } = createFakeChild();

      try {
        const options: AgentRunOptions = {
          taskId: 'wo-last-write-path',
          workspaceRoot: path.resolve('tmp-workspace'),
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (e) => events.push(e),
        };

        wireOutput(child, options);

        const filePath = path.join(options.workspaceRoot, 'src', 'generated.test.ts');

        // When: First tool_call provides args.path -> updates lastWritePath in wireOutput
        stdout.emit(
          'data',
          Buffer.from(
            [
              JSON.stringify({
                type: 'tool_call',
                subtype: 'started',
                tool_call: { editToolCall: { args: { path: filePath } } },
              }),
              '',
            ].join('\n'),
          ),
        );

        // ...and second tool_call lacks args.path but should use lastWritePath fallback
        stdout.emit(
          'data',
          Buffer.from(
            [
              JSON.stringify({
                type: 'tool_call',
                subtype: 'started',
                tool_call: { editToolCall: { args: {} } },
              }),
              '',
            ].join('\n'),
          ),
        );

        // Then: At least two fileWrite events are emitted and both resolve to the same path
        const fileWrites = events.filter((e) => e.type === 'fileWrite');
        assert.ok(fileWrites.length >= 2, 'Expected fileWrite events for both tool_call started events');
        const first = fileWrites[0];
        const second = fileWrites[1];
        assert.strictEqual(first?.type, 'fileWrite');
        assert.strictEqual(second?.type, 'fileWrite');
        if (first?.type === 'fileWrite' && second?.type === 'fileWrite') {
          assert.strictEqual(first.path, path.relative(options.workspaceRoot, filePath));
          assert.strictEqual(second.path, path.relative(options.workspaceRoot, filePath));
        }
      } finally {
        timers.restore();
      }
    });

    test('TC-CAP-WO-B-04: non-record JSON line (array) is treated as non-JSON and emitted as warn log', () => {
      // Given: A wired child process with fake timers
      const provider = new CursorAgentProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];

      const timers = patchTimers();
      const { child, stdout } = createFakeChild();

      try {
        const options: AgentRunOptions = {
          taskId: 'wo-non-record-json',
          workspaceRoot: path.resolve('tmp-workspace'),
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (e) => events.push(e),
        };

        wireOutput(child, options);

        // When: stdout emits a JSON array line
        stdout.emit('data', Buffer.from('[]\n'));

        // Then: A warn log is emitted with the raw line
        const warn = events.find((e) => e.type === 'log' && e.level === 'warn' && e.message === '[]');
        assert.ok(warn, 'Expected a warn log for non-record JSON line');
      } finally {
        timers.restore();
      }
    });

    test('TC-CAP-WO-B-05: high-output assistant text triggers internal highOutputLogged branch without crashing', () => {
      // Given: A wired child process and a very large assistant message
      const provider = new CursorAgentProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];

      const timers = patchTimers();
      const { child, stdout } = createFakeChild();

      try {
        const options: AgentRunOptions = {
          taskId: 'wo-high-output',
          workspaceRoot: path.resolve('tmp-workspace'),
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (e) => events.push(e),
        };

        wireOutput(child, options);

        const hugeText = 'x'.repeat(50_000);

        // When: A huge assistant event arrives
        stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'assistant', message: { content: [{ text: hugeText }] } })}\n`));

        // Then: At least one info log is emitted (assistant text), and no exception occurs
        const infoLogs = events.filter((e) => e.type === 'log' && e.level === 'info');
        assert.ok(infoLogs.length >= 1, 'Expected at least one info log from assistant output');
      } finally {
        timers.restore();
      }
    });

    test('TC-CAP-WO-B-06: ignored-summary log uses last=unknown when lastParsedType is missing', () => {
      // Given: thinking is received, then an unknown-type event updates lastParsedType to undefined
      const provider = new CursorAgentProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];

      const originalNow = Date.now;
      let fakeNow = 0;
      (Date as unknown as { now: () => number }).now = () => fakeNow;

      const timers = patchTimers();
      const { child, stdout } = createFakeChild();

      try {
        const options: AgentRunOptions = {
          taskId: 'wo-ignored-summary-unknown',
          workspaceRoot: path.resolve('tmp-workspace'),
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (e) => events.push(e),
        };

        wireOutput(child, options);

        fakeNow = 0;
        // When: thinking と不正イベントを受信し、かつ silenceMs が閾値未満の状態で interval を進める
        stdout.emit('data', Buffer.from([JSON.stringify({ type: 'thinking' }), JSON.stringify({}), ''].join('\n')));

        // NOTE: silenceログが先に出ると ignored-summary が抑制されるため、
        // 直前に「空バッファ」の stdout を流して lastOutputAtMs を更新し、silenceMs を閾値未満にする
        fakeNow = 25_000;
        stdout.emit('data', Buffer.from(''));

        fakeNow = 30_000;
        timers.fireAllIntervals();

        // Then: ignored-summary のログが last=unknown を含んで出力される
        const summary = events.find(
          (e) =>
            e.type === 'log' &&
            e.level === 'info' &&
            e.message.includes('表示されないイベントが継続') &&
            e.message.includes('ignored(thinking)=1') &&
            e.message.includes('last=unknown'),
        );
        assert.ok(summary, 'Expected ignored-summary log to use last=unknown when lastParsedType is missing');
      } finally {
        timers.restore();
        (Date as unknown as { now: () => number }).now = originalNow;
      }
    });

    test('TC-CAP-WO-B-07: error cleanup clears activeChild and completed is emitted once even if close follows', () => {
      // Given: provider.activeChild matches the wired child (to cover cleanup branches)
      const provider = new CursorAgentProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];

      const originalNow = Date.now;
      let fakeNow = 0;
      (Date as unknown as { now: () => number }).now = () => fakeNow;

      const timers = patchTimers();
      const { child, emitter } = createFakeChild();
      (provider as unknown as { activeChild: unknown; activeTaskId: string | undefined }).activeChild = child;
      (provider as unknown as { activeTaskId: string | undefined }).activeTaskId = 'active-task';

      try {
        const options: AgentRunOptions = {
          taskId: 'wo-cleanup-active-child',
          workspaceRoot: path.resolve('tmp-workspace'),
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (e) => events.push(e),
        };

        wireOutput(child, options);

        // When: heartbeat timeout fires (creates heartbeatInterval), then error and close occur
        fakeNow = 10_000;
        timers.fireAllTimeouts();
        emitter.emit('error', new Error('spawn failed'));
        emitter.emit('close', 0);

        // Then: activeChild is cleared and completed is emitted only once
        const activeAfter = (provider as unknown as { activeChild: unknown | undefined }).activeChild;
        assert.strictEqual(activeAfter, undefined, 'Expected activeChild to be cleared on error/close cleanup');

        const completed = events.filter((e) => e.type === 'completed');
        assert.strictEqual(completed.length, 1, 'Expected exactly one completed event');
      } finally {
        timers.restore();
        (Date as unknown as { now: () => number }).now = originalNow;
      }
    });

    test('TC-CAP-WO-E-01: emits error log and completed(exitCode=null) on child error', () => {
      // Given: A wired child process
      const provider = new CursorAgentProvider();
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
        emitter.emit('error', new Error('spawn failed'));

        // Then: An error log and a completed(null) event are emitted
        const errLog = events.find((e) => e.type === 'log' && e.level === 'error' && e.message.includes('実行エラー'));
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

    test('TC-CAP-WO-E-02: monitor kills the process after long silence and tolerates child.kill() throwing', () => {
      // Given: A wired child process with a controlled clock and fake timers
      const provider = new CursorAgentProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];

      const originalNow = Date.now;
      let fakeNow = 0;
      (Date as unknown as { now: () => number }).now = () => fakeNow;

      const timers = patchTimers();
      const { child, stdout, killedRef } = createFakeChild();

      // Make kill() throw to cover kill try/catch while still recording that it was attempted
      (child as unknown as { kill: () => boolean }).kill = () => {
        killedRef.killed = true;
        throw new Error('kill failed');
      };

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

        fakeNow = 10 * 60_000;
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

    test('TC-CAP-STDERR-E-01: emits error log when stderr outputs a non-empty message', () => {
      // Given: A wired child process
      const provider = new CursorAgentProvider();
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);
      const events: TestGenEvent[] = [];

      const timers = patchTimers();
      const { child, stderr } = createFakeChild();

      try {
        const options: AgentRunOptions = {
          taskId: 'wo-stderr',
          workspaceRoot: path.resolve('tmp-workspace'),
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (e) => events.push(e),
        };

        wireOutput(child, options);

        // When: stderr emits a message
        stderr.emit('data', Buffer.from('something went wrong\n'));

        // Then: An error log is emitted
        const errLog = events.find((e) => e.type === 'log' && e.level === 'error' && e.message.includes('something went wrong'));
        assert.ok(errLog, 'Expected an error log event from stderr output');
      } finally {
        timers.restore();
      }
    });
  });
});
