import * as assert from 'assert';
import { EventEmitter } from 'events';
import * as path from 'path';
import { CursorAgentProvider } from '../../../providers/cursorAgentProvider';
import { type AgentRunOptions } from '../../../providers/provider';
import { type TestGenEvent } from '../../../core/event';
import type * as childProcessTypes from 'child_process';

// NOTE:
// - `import * as childProcess from 'child_process'` は Node16 + __importStar の影響でプロパティが getter になり、代入できない。
// - ここでは require で実体モジュールを取得して spawn を差し替える。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const childProcess = require('child_process') as typeof import('child_process');

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

    // Test Perspectives Table for wireOutput (stream-json parsing path)
    // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
    // |---------|----------------------|--------------------------------------|-----------------|-------|
    // | TC-WO-N-01 | stdout emits valid stream-json assistant line | Equivalence – normal | Emits log(info) with assistant text; emits completed on close | Covers tryParseJson success + markOutput |
    // | TC-WO-E-01 | stdout emits non-JSON line | Error – format | Emits log(warn) with raw line | Covers tryParseJson failure |
    // | TC-WO-E-02 | stderr emits message | Error – stderr | Emits log(error) with stderr message | markOutput on stderr path |

    suite('wireOutput', () => {
      class MockChildProcess extends EventEmitter {
        public readonly stdout = new EventEmitter();
        public readonly stderr = new EventEmitter();
        public readonly stdin = { end: () => {} } as unknown as NodeJS.WritableStream;
        private closed = false;

        public kill(): boolean {
          // Provider の dispose() で呼ばれるだけなので、ここでは close は発行しない（テスト側で明示）
          return true;
        }

        public emitClose(code: number | null): void {
          if (this.closed) {
            return;
          }
          this.closed = true;
          this.emit('close', code);
        }
      }

      let originalSpawn: typeof childProcess.spawn;
      let lastSpawned: MockChildProcess | undefined;

      setup(() => {
        lastSpawned = undefined;
        originalSpawn = childProcess.spawn;

        // child_process.spawn をスタブし、stdout/stderr を自由に制御できる MockChildProcess を返す
        (childProcess as unknown as { spawn: (...args: unknown[]) => unknown }).spawn = () => {
          const child = new MockChildProcess();
          lastSpawned = child;
          return child as unknown as childProcessTypes.ChildProcessWithoutNullStreams;
        };
      });

      teardown(async () => {
        (childProcess as unknown as { spawn: unknown }).spawn = originalSpawn;
        // タイマー等が残留しないよう、非同期イベントの収束を少し待つ
        await waitForAsyncCleanup();
      });

      test('TC-WO-N-01: emits assistant log via stream-json parsing', async () => {
        // Given: spawn をスタブし、stdout から assistant の stream-json が流れる
        const provider = new CursorAgentProvider();
        const events: TestGenEvent[] = [];
        const options: AgentRunOptions = {
          taskId: 'test-task-wo-n-01',
          workspaceRoot: '/tmp',
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (event) => {
            events.push(event);
          },
        };

        // When: provider.run を呼び、stdout に 1 行分の stream-json を流す
        const task = provider.run(options);
        assert.ok(lastSpawned, 'MockChildProcess が生成される');
        lastSpawned?.stdout.emit(
          'data',
          Buffer.from('{"type":"assistant","message":{"content":[{"text":"hello"}]}}\n', 'utf8'),
        );
        lastSpawned?.emitClose(0);

        // Then: assistant text が log(info) として流れ、close により completed が発行される
        const logEvent = events.find((e) => e.type === 'log' && e.level === 'info' && e.message === 'hello');
        assert.ok(logEvent, 'assistant の text が log(info) で通知される');
        const completedEvent = events.find((e) => e.type === 'completed');
        assert.ok(completedEvent, 'completed イベントが発行される');
        if (completedEvent?.type === 'completed') {
          assert.strictEqual(completedEvent.exitCode, 0);
        }

        // Cleanup: dispose() は例外なく呼べる（プロセス残留防止）
        task.dispose();
        await waitForAsyncCleanup();
      });

      test('TC-WO-E-01: emits warn log when stdout line is not JSON', async () => {
        // Given: spawn をスタブし、stdout から非JSONの1行が流れる
        const provider = new CursorAgentProvider();
        const events: TestGenEvent[] = [];
        const options: AgentRunOptions = {
          taskId: 'test-task-wo-e-01',
          workspaceRoot: '/tmp',
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (event) => {
            events.push(event);
          },
        };

        // When: provider.run を呼び、stdout に非JSON行を流す
        const task = provider.run(options);
        assert.ok(lastSpawned, 'MockChildProcess が生成される');
        lastSpawned?.stdout.emit('data', Buffer.from('NOT_JSON\n', 'utf8'));
        lastSpawned?.emitClose(0);

        // Then: warn ログとして行が残る（JSONでない出力もあり得るため）
        const warnEvent = events.find((e) => e.type === 'log' && e.level === 'warn' && e.message === 'NOT_JSON');
        assert.ok(warnEvent, '非JSON行が warn として通知される');

        task.dispose();
        await waitForAsyncCleanup();
      });

      test('TC-WO-E-02: emits error log when stderr has message', async () => {
        // Given: spawn をスタブし、stderr にエラーメッセージが流れる
        const provider = new CursorAgentProvider();
        const events: TestGenEvent[] = [];
        const options: AgentRunOptions = {
          taskId: 'test-task-wo-e-02',
          workspaceRoot: '/tmp',
          prompt: 'test prompt',
          outputFormat: 'stream-json',
          allowWrite: false,
          onEvent: (event) => {
            events.push(event);
          },
        };

        // When: provider.run を呼び、stderr にメッセージを流す
        const task = provider.run(options);
        assert.ok(lastSpawned, 'MockChildProcess が生成される');
        lastSpawned?.stderr.emit('data', Buffer.from('stderr message\n', 'utf8'));
        lastSpawned?.emitClose(0);

        // Then: error ログとして通知される
        const errorEvent = events.find((e) => e.type === 'log' && e.level === 'error' && e.message === 'stderr message');
        assert.ok(errorEvent, 'stderr の内容が error として通知される');

        task.dispose();
        await waitForAsyncCleanup();
      });
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
  });
});
