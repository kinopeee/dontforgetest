import * as assert from 'assert';
import { EventEmitter } from 'events';
import { ClineCliProvider, __test__ as clineCliProviderTest } from '../../../providers/clineCliProvider';
import { type TestGenEvent } from '../../../core/event';
import { type AgentRunOptions } from '../../../providers/provider';

type SpawnCall = { command: string; args: string[]; options?: unknown };

class MockWritable {
  public endCalled = false;

  public end(): void {
    this.endCalled = true;
  }
}

class MockChildProcess extends EventEmitter {
  public readonly stdout = new EventEmitter();
  public readonly stderr = new EventEmitter();
  public readonly stdin = new MockWritable();
  public killCalled = 0;

  public kill(): void {
    this.killCalled += 1;
  }
}

function createBaseOptions(events: TestGenEvent[]): AgentRunOptions {
  return {
    taskId: 'cline-task-1',
    workspaceRoot: '/workspace',
    prompt: 'Generate tests',
    outputFormat: 'stream-json',
    allowWrite: false,
    onEvent: (event: TestGenEvent) => {
      events.push(event);
    },
  };
}

suite('providers/clineCliProvider.ts', () => {
  test('TC-CLINE-N-01: id/displayName が期待値である', () => {
    // Given: ClineCliProvider instance
    const provider = new ClineCliProvider();

    // When: reading public properties
    // Then: id/displayName match expected values
    assert.strictEqual(provider.id, 'cline-cli');
    assert.strictEqual(provider.displayName, 'Cline CLI');
  });

  test('TC-CLINE-N-02: run() が --json/--model/-y 付きで spawn し started を発火する', () => {
    // Given: spawn mock and provider
    const spawnCalls: SpawnCall[] = [];
    const child = new MockChildProcess();
    const provider = new ClineCliProvider(((command: string, args: readonly string[], options?: unknown) => {
      spawnCalls.push({ command, args: [...args], options });
      return child as unknown as ReturnType<typeof import('child_process').spawn>;
    }) as typeof import('child_process').spawn);
    const events: TestGenEvent[] = [];
    const options: AgentRunOptions = {
      ...createBaseOptions(events),
      agentCommand: 'cline-custom',
      model: 'gpt-5.2',
      allowWrite: true,
    };

    // When: run() is called
    const running = provider.run(options);

    // Then: spawn args include --json, --model, -y, prompt
    assert.strictEqual(spawnCalls.length, 1);
    assert.strictEqual(spawnCalls[0]?.command, 'cline-custom');
    assert.deepStrictEqual(spawnCalls[0]?.args, ['--json', '--model', 'gpt-5.2', '-y', 'Generate tests']);
    assert.strictEqual(running.taskId, 'cline-task-1');
    assert.strictEqual(typeof running.dispose, 'function');
    assert.ok(child.stdin.endCalled, 'stdin should be closed');

    const started = events.find((e) => e.type === 'started');
    assert.ok(started, 'started event should be emitted');
    if (started?.type === 'started') {
      assert.strictEqual(started.label, 'cline-cli');
    }

    running.dispose();
  });

  test('TC-CLINE-N-03: JSONL の text/files を log/fileWrite に正規化する', () => {
    // Given: provider with mocked child process
    const child = new MockChildProcess();
    const provider = new ClineCliProvider((() => {
      return child as unknown as ReturnType<typeof import('child_process').spawn>;
    }) as typeof import('child_process').spawn);
    const events: TestGenEvent[] = [];
    const options = createBaseOptions(events);
    provider.run(options);

    const line1 = JSON.stringify({ type: 'say', text: 'hello from cline' });
    const line2 = JSON.stringify({ type: 'say', files: ['/workspace/src/foo.test.ts', 'src/bar.test.ts'] });

    // When: stdout emits JSON lines
    child.stdout.emit('data', Buffer.from(`${line1}\n${line2}\n`, 'utf8'));

    // Then: log and fileWrite events are emitted
    const logs = events.filter((e) => e.type === 'log');
    const writes = events.filter((e) => e.type === 'fileWrite');
    assert.ok(logs.some((e) => e.type === 'log' && e.message === 'hello from cline'));
    assert.strictEqual(writes.length, 2);
    if (writes[0]?.type === 'fileWrite') {
      assert.strictEqual(writes[0].path, 'src/foo.test.ts');
    }
    if (writes[1]?.type === 'fileWrite') {
      assert.strictEqual(writes[1].path, 'src/bar.test.ts');
    }
  });

  test('TC-CLINE-E-01: 不正JSON行を warn ログとして扱う', () => {
    // Given: provider with mocked child process
    const child = new MockChildProcess();
    const provider = new ClineCliProvider((() => {
      return child as unknown as ReturnType<typeof import('child_process').spawn>;
    }) as typeof import('child_process').spawn);
    const events: TestGenEvent[] = [];
    provider.run(createBaseOptions(events));

    // When: stdout emits invalid JSON
    child.stdout.emit('data', Buffer.from('not-json-line\n', 'utf8'));

    // Then: warn log is emitted
    const warn = events.find((e) => e.type === 'log' && e.level === 'warn');
    assert.ok(warn);
  });

  test('TC-CLINE-E-02: stderr 出力を error ログとして通知する', () => {
    // Given: provider with mocked child process
    const child = new MockChildProcess();
    const provider = new ClineCliProvider((() => {
      return child as unknown as ReturnType<typeof import('child_process').spawn>;
    }) as typeof import('child_process').spawn);
    const events: TestGenEvent[] = [];
    provider.run(createBaseOptions(events));

    // When: stderr emits message
    child.stderr.emit('data', Buffer.from('stderr message', 'utf8'));

    // Then: error log is emitted
    const err = events.find((e) => e.type === 'log' && e.level === 'error' && e.message === 'stderr message');
    assert.ok(err);
  });

  test('TC-CLINE-N-04: close 時に completed を1回だけ発火する', () => {
    // Given: provider with mocked child process
    const child = new MockChildProcess();
    const provider = new ClineCliProvider((() => {
      return child as unknown as ReturnType<typeof import('child_process').spawn>;
    }) as typeof import('child_process').spawn);
    const events: TestGenEvent[] = [];
    provider.run(createBaseOptions(events));

    // When: close is emitted twice
    child.emit('close', 0);
    child.emit('close', 0);

    // Then: completed is emitted once
    const completed = events.filter((e) => e.type === 'completed');
    assert.strictEqual(completed.length, 1);
    if (completed[0]?.type === 'completed') {
      assert.strictEqual(completed[0].exitCode, 0);
    }
  });

  test('TC-CLINE-E-03: child error 発生時に error ログと completed(null) を発火する', () => {
    // Given: provider with mocked child process
    const child = new MockChildProcess();
    const provider = new ClineCliProvider((() => {
      return child as unknown as ReturnType<typeof import('child_process').spawn>;
    }) as typeof import('child_process').spawn);
    const events: TestGenEvent[] = [];
    provider.run(createBaseOptions(events));

    // When: child emits error
    child.emit('error', new Error('spawn failed'));

    // Then: error log and completed(null) are emitted
    const err = events.find((e) => e.type === 'log' && e.level === 'error' && e.message.includes('spawn failed'));
    const completed = events.find((e) => e.type === 'completed');
    assert.ok(err);
    assert.ok(completed);
    if (completed?.type === 'completed') {
      assert.strictEqual(completed.exitCode, null);
    }
  });

  test('TC-CLINE-N-05: 連続 run 時に前回プロセスを kill して warn を出す', () => {
    // Given: two mocked child processes
    const children = [new MockChildProcess(), new MockChildProcess()];
    let index = 0;
    const provider = new ClineCliProvider((() => {
      const child = children[index] ?? children[children.length - 1];
      index += 1;
      return child as unknown as ReturnType<typeof import('child_process').spawn>;
    }) as typeof import('child_process').spawn);
    const events: TestGenEvent[] = [];

    // When: run is called twice without closing first child
    provider.run(createBaseOptions(events));
    provider.run({ ...createBaseOptions(events), taskId: 'cline-task-2' });

    // Then: first child is killed and warning is emitted
    assert.strictEqual(children[0]?.killCalled, 1);
    const warn = events.find((e) => e.type === 'log' && e.level === 'warn' && e.message.includes('前回の cline タスク'));
    assert.ok(warn);
  });

  test('TC-CLINE-N-06: __test__.toWorkspaceRelative はワークスペース外絶対パスを undefined にする', () => {
    // Given: a path outside workspace
    const result = clineCliProviderTest.toWorkspaceRelative('/other/path/file.ts', '/workspace');

    // Then: returns undefined
    assert.strictEqual(result, undefined);
  });
});
