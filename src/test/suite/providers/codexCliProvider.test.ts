import * as assert from 'assert';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import * as childProcess from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import * as vscode from 'vscode';
import { CodexCliProvider } from '../../../providers/codexCliProvider';

type CodexCliProviderRunOptions = Parameters<CodexCliProvider['run']>[0];

type CodexCliProviderPrivate = {
  spawnCodex: (options: AgentRunOptions, prompt: string) => ChildProcessWithoutNullStreams;
};

type AgentRunOptions = {
  agentCommand?: string;
  model?: string;
};

function createMockChild(): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  child.stdin = stdin;
  child.stdout = stdout;
  child.stderr = stderr;
  child.kill = () => true;
  return child;
}

suite('providers/codexCliProvider.ts', () => {
  const mutableWorkspace = vscode.workspace as unknown as {
    getConfiguration: typeof vscode.workspace.getConfiguration;
  };
  const originalGetConfiguration = mutableWorkspace.getConfiguration;

  teardown(() => {
    try {
      mutableWorkspace.getConfiguration = originalGetConfiguration;
    } catch {
      // Ignore teardown errors (e.g., if getConfiguration is read-only)
    }
  });

  // TC-N-05
  test('TC-N-05: reasoning effort is set, spawn args include -c and prompt is written to stdin', () => {
    // 前提 (Given): A Codex CLI provider with reasoning effort configured
    const config = {
      get: () => 'high',
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;
    const child = createMockChild();
    const spawnCall: { command?: string; args?: readonly string[] } = {};
    const mockSpawn = ((command: string, args?: readonly string[]) => {
      spawnCall.command = command;
      spawnCall.args = args;
      return child;
    }) as typeof childProcess.spawn;
    let writeCallCount = 0;
    let writeFirstArg: unknown = undefined;
    const originalWrite = child.stdin.write.bind(child.stdin);
    child.stdin.write = ((chunk: string | Uint8Array) => {
      writeCallCount += 1;
      if (writeCallCount === 1) {
        writeFirstArg = chunk;
      }
      return originalWrite(chunk);
    }) as typeof child.stdin.write;
    let endCallCount = 0;
    const originalEnd = child.stdin.end.bind(child.stdin);
    child.stdin.end = (() => {
      endCallCount += 1;
      return originalEnd();
    }) as typeof child.stdin.end;
    const provider = new CodexCliProvider(mockSpawn) as unknown as CodexCliProviderPrivate;
    const options = {
      agentCommand: 'codex-cli',
      model: 'test-model',
    } as AgentRunOptions;
    const prompt = 'hello world';

    // 実行 (When): spawnCodex is called
    provider.spawnCodex(options, prompt);

    // 検証 (Then): spawn receives exec args with reasoning effort and prompt goes to stdin
    assert.ok(spawnCall.args, 'spawn should be called with args');
    const spawnArgs = spawnCall.args;
    assert.deepStrictEqual(spawnArgs, [
      'exec',
      '--model',
      'test-model',
      '-c',
      'model_reasoning_effort="high"',
      '-',
    ]);
    assert.strictEqual(spawnCall.command, 'codex-cli');
    assert.strictEqual(writeCallCount, 1);
    assert.strictEqual(writeFirstArg, `${prompt}\n`);
    assert.strictEqual(endCallCount, 1);
  });

  // TC-N-03
  test('TC-N-03: dontforgetest.codexReasoningEffort is injected into spawn args', () => {
    // 前提 (Given): reasoning effort is configured to 'medium'
    const config = {
      get: (key: string) => (key === 'codexReasoningEffort' ? 'medium' : ''),
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;
    const child = createMockChild();
    const spawnCall: { args?: readonly string[] } = {};
    const mockSpawn = ((command: string, args?: readonly string[]) => {
      spawnCall.args = args;
      return child;
    }) as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn) as unknown as CodexCliProviderPrivate;

    // 実行 (When): spawnCodex is called
    provider.spawnCodex({ agentCommand: 'codex' }, 'prompt');

    // 検証 (Then): spawn args include -c model_reasoning_effort="medium"
    assert.ok(spawnCall.args?.includes('-c'));
    assert.ok(spawnCall.args?.includes('model_reasoning_effort="medium"'));
  });

  // TC-E-07
  test('TC-E-07: CodexCliProvider.run does not throw when child.stdin.write fails', () => {
    // 前提 (Given): child.stdin.write throws an error
    const child = createMockChild();
    child.stdin.write = () => {
      throw new Error('Write failed');
    };
    const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn);
    const options = {
      taskId: 'task-1',
      workspaceRoot: '/',
      agentCommand: 'codex',
      prompt: 'prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: () => {},
    };

    // 実行 (When): run is called
    // 検証 (Then): It does not throw
    assert.doesNotThrow(() => provider.run(options as CodexCliProviderRunOptions));
  });

  // TC-E-11
  test('TC-E-11: reasoning effort is empty string, -c is not added', () => {
    // 前提 (Given): An empty reasoning effort config
    const config = {
      get: () => '',
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;
    const child = createMockChild();
    const spawnCall: { args?: readonly string[] } = {};
    const mockSpawn = ((command: string, args?: readonly string[]) => {
      spawnCall.args = args;
      return child;
    }) as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn) as unknown as CodexCliProviderPrivate;
    const options = { agentCommand: 'codex-cli', model: 'test-model' } as AgentRunOptions;

    // 実行 (When): spawnCodex is called
    provider.spawnCodex(options, 'prompt');

    // 検証 (Then): args exclude the reasoning effort override
    assert.deepStrictEqual(spawnCall.args, ['exec', '--model', 'test-model', '-']);
  });

  // TC-E-12
  test('TC-E-12: reasoning effort is whitespace, -c is not added', () => {
    // 前提 (Given): A whitespace-only reasoning effort config
    const config = {
      get: () => '   ',
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;
    const child = createMockChild();
    const spawnCall: { args?: readonly string[] } = {};
    const mockSpawn = ((command: string, args?: readonly string[]) => {
      spawnCall.args = args;
      return child;
    }) as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn) as unknown as CodexCliProviderPrivate;
    const options = { agentCommand: 'codex-cli', model: 'test-model' } as AgentRunOptions;

    // 実行 (When): spawnCodex is called
    provider.spawnCodex(options, 'prompt');

    // 検証 (Then): args exclude the reasoning effort override
    assert.deepStrictEqual(spawnCall.args, ['exec', '--model', 'test-model', '-']);
  });

  // TC-E-14
  test('TC-E-14: reasoning effort is null, -c is not added', () => {
    // 前提 (Given): A null reasoning effort config
    const config = {
      get: () => null,
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;
    const child = createMockChild();
    const spawnCall: { args?: readonly string[] } = {};
    const mockSpawn = ((command: string, args?: readonly string[]) => {
      spawnCall.args = args;
      return child;
    }) as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn) as unknown as CodexCliProviderPrivate;
    const options = { agentCommand: 'codex-cli', model: 'test-model' } as AgentRunOptions;

    // 実行 (When): spawnCodex is called
    provider.spawnCodex(options, 'prompt');

    // 検証 (Then): args exclude the reasoning effort override
    assert.deepStrictEqual(spawnCall.args, ['exec', '--model', 'test-model', '-']);
  });

  // TC-E-13
  test('TC-E-13: reasoning effort is undefined, -c is not added', () => {
    // 前提 (Given): An undefined reasoning effort config
    const config = {
      get: () => undefined,
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;
    const child = createMockChild();
    const spawnCall: { args?: readonly string[] } = {};
    const mockSpawn = ((command: string, args?: readonly string[]) => {
      spawnCall.args = args;
      return child;
    }) as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn) as unknown as CodexCliProviderPrivate;
    const options = { agentCommand: 'codex-cli', model: 'test-model' } as AgentRunOptions;

    // 実行 (When): spawnCodex is called
    provider.spawnCodex(options, 'prompt');

    // 検証 (Then): args exclude the reasoning effort override
    assert.deepStrictEqual(spawnCall.args, ['exec', '--model', 'test-model', '-']);
  });

  test('TC-E-05: spawn throws, error propagates with message', () => {
    // 前提 (Given): spawn throws an error
    mutableWorkspace.getConfiguration = (() =>
      ({ get: () => 'high' } as unknown as vscode.WorkspaceConfiguration)) as unknown as typeof vscode.workspace.getConfiguration;
    const mockSpawn = (() => {
      throw new Error('spawn failed');
    }) as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn) as unknown as CodexCliProviderPrivate;
    const options = { agentCommand: 'codex-cli', model: 'test-model' } as AgentRunOptions;

    // 実行 (When): spawnCodex is called
    // 検証 (Then): the error is thrown with the expected type and message
    assert.throws(
      () => provider.spawnCodex(options, 'prompt'),
      (error: unknown) =>
        error instanceof Error && error.message === 'spawn failed'
    );
  });

  test('TC-E-06: getConfiguration throws, error propagates with message', () => {
    // 前提 (Given): getConfiguration throws an error
    mutableWorkspace.getConfiguration = (() => {
      throw new Error('config failed');
    }) as unknown as typeof vscode.workspace.getConfiguration;
    const provider = new CodexCliProvider() as unknown as CodexCliProviderPrivate;
    const options = { agentCommand: 'codex-cli', model: 'test-model' } as AgentRunOptions;

    // 実行 (When): spawnCodex is called
    // 検証 (Then): the error is thrown with the expected type and message
    assert.throws(
      () => provider.spawnCodex(options, 'prompt'),
      (error: unknown) =>
        error instanceof Error && error.message === 'config failed'
    );
  });

  // TC- CODEX-ARG-01: codexReasoningEffort is set to 'medium' (default)
  test('TC- CODEX-ARG-01: codexReasoningEffort="medium" injects model_reasoning_effort="medium"', () => {
    // 前提 (Given): Configured to 'medium'
    const config = {
      get: (key: string) => (key === 'codexReasoningEffort' ? 'medium' : ''),
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;
    const child = createMockChild();
    const spawnCall: { args?: readonly string[] } = {};
    const mockSpawn = ((command: string, args?: readonly string[]) => {
      spawnCall.args = args;
      return child;
    }) as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn) as unknown as CodexCliProviderPrivate;

    // 実行 (When): spawnCodex is called
    provider.spawnCodex({ agentCommand: 'codex' }, 'prompt');

    // 検証 (Then): args include -c model_reasoning_effort="medium"
    assert.ok(spawnCall.args?.includes('-c'));
    assert.ok(spawnCall.args?.includes('model_reasoning_effort="medium"'));
  });

  // TC-CODEX-ARG-02: codexReasoningEffort is set to 'high'
  test('TC-CODEX-ARG-02: codexReasoningEffort="high" injects model_reasoning_effort="high"', () => {
    // 前提 (Given): Configured to 'high'
    const config = {
      get: (key: string) => (key === 'codexReasoningEffort' ? 'high' : ''),
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;
    const child = createMockChild();
    const spawnCall: { args?: readonly string[] } = {};
    const mockSpawn = ((command: string, args?: readonly string[]) => {
      spawnCall.args = args;
      return child;
    }) as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn) as unknown as CodexCliProviderPrivate;

    // 実行 (When): spawnCodex is called
    provider.spawnCodex({ agentCommand: 'codex' }, 'prompt');

    // 検証 (Then): args include -c model_reasoning_effort="high"
    assert.ok(spawnCall.args?.includes('-c'));
    assert.ok(spawnCall.args?.includes('model_reasoning_effort="high"'));
  });

  // TC-CODEX-ARG-03: codexReasoningEffort is empty string -> No injection
  test('TC-CODEX-ARG-03: codexReasoningEffort="" injects nothing', () => {
    // 前提 (Given): Configured to ''
    const config = {
      get: (key: string) => (key === 'codexReasoningEffort' ? '' : ''),
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;
    const child = createMockChild();
    const spawnCall: { args?: readonly string[] } = {};
    const mockSpawn = ((command: string, args?: readonly string[]) => {
      spawnCall.args = args;
      return child;
    }) as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn) as unknown as CodexCliProviderPrivate;

    // 実行 (When): spawnCodex is called
    provider.spawnCodex({ agentCommand: 'codex' }, 'prompt');

    // 検証 (Then): args DO NOT include -c
    assert.ok(!spawnCall.args?.includes('-c'));
  });

  // TC-CODEX-STDIN-01: Run agent with specific prompt via stdin
  test('TC-CODEX-STDIN-01: Prompt is written to child process stdin', () => {
    // 前提 (Given): A specific prompt
    const prompt = 'My specific prompt';
    const config = {
      get: () => '',
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;
    const child = createMockChild();
    let written = '';
    child.stdin.write = ((chunk: string | Uint8Array) => {
      written += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      return true;
    }) as typeof child.stdin.write;
    const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn) as unknown as CodexCliProviderPrivate;

    // 実行 (When): spawnCodex is called
    provider.spawnCodex({ agentCommand: 'codex' }, prompt);

    // 検証 (Then): Prompt + newline is written to stdin
    assert.strictEqual(written, `${prompt}\n`);
  });

  // TC-CODEX-CMD-01: Run agent command structure
  test('TC-CODEX-CMD-01: Spawn args start with ["exec"] and end with ["-"]', () => {
    // 前提 (Given): Standard run
    const config = {
      get: () => '',
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;
    const child = createMockChild();
    const spawnCall: { args?: readonly string[] } = {};
    const mockSpawn = ((command: string, args?: readonly string[]) => {
      spawnCall.args = args;
      return child;
    }) as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn) as unknown as CodexCliProviderPrivate;

    // 実行 (When): spawnCodex is called
    provider.spawnCodex({ agentCommand: 'codex' }, 'prompt');

    // 検証 (Then): Args start with 'exec' and end with '-'
    assert.strictEqual(spawnCall.args?.[0], 'exec');
    assert.strictEqual(spawnCall.args?.[spawnCall.args.length - 1], '-');
  });

  // ============================================
  // テスト観点表（追加分）: run() および wireOutput の分岐カバレッジ
  // ============================================
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-CX-N-01 | codexPromptCommand が空 | Equivalence – 注入なし | prompt がそのまま使われる | - |
  // | TC-CX-N-02 | codexPromptCommand が有効で .md が見つかる | Equivalence – 注入あり | info ログにファイルパスが含まれる | - |
  // | TC-CX-E-01 | codexPromptCommand が有効だがファイルが存在しない | Error – ファイル不在 | warn ログにコマンド名が含まれる | - |
  // | TC-CX-E-02 | activeChild 存在時に run() | Error – 多重起動 | 旧 child.kill() が呼ばれ、warn ログ発火 | - |
  // | TC-CX-N-03 | stdout 複数行出力 | Equivalence – 行単位処理 | 各行が info ログとして発火 | - |
  // | TC-CX-N-04 | close 時にバッファ末尾あり | Equivalence – tail 処理 | 末尾テキストが info ログとして発火 | - |
  // | TC-CX-E-03 | stderr 出力あり | Error – stderr | error レベルのログ発火 | - |
  // | TC-CX-E-04 | child.on('error') | Error – spawn エラー | error ログと completed(null) 発火 | - |
  // | TC-CX-N-05 | child.on('close', 0) | Equivalence – 正常終了 | completed(0) イベント発火 | - |

  suite('run() および wireOutput のカバレッジ強化', () => {
    type WireOutput = (child: ChildProcessWithoutNullStreams, options: CodexCliProviderRunOptions) => void;
    type EventEmitterExt = EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      stdin: { write: (chunk: string | Uint8Array) => boolean; end: () => void };
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
        stdin: { write: (_chunk: string | Uint8Array) => true, end: () => {} },
        kill: () => {
          killedRef.killed = true;
          return true;
        },
      });

      return { child: child as EventEmitterExt, stdout, stderr, killedRef };
    };

    // TC-CX-E-02: activeChild 存在時に run() → 旧 child.kill() が呼ばれ、warn ログが発火
    test('TC-CX-E-02: activeChild 存在時に run() すると旧 child.kill() が呼ばれ warn ログが発火する', () => {
      // 前提 (Given): 既に activeChild が存在する状態
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      let prevKilledCount = 0;
      const prevChild = {
        kill: () => {
          prevKilledCount += 1;
          return true;
        },
      };

      const { child: newChild } = createFakeChild();
      const mockSpawn = (() => newChild) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);

      // activeChild と activeTaskId を手動で設定
      (provider as unknown as { activeChild: unknown }).activeChild = prevChild;
      (provider as unknown as { activeTaskId: string }).activeTaskId = 'prev-task-codex';

      // wireOutput をスタブ化（タイマー回避）
      (provider as unknown as { wireOutput: WireOutput }).wireOutput = () => {};

      const events: { type: string; level?: string; message?: string }[] = [];
      const options: CodexCliProviderRunOptions = {
        taskId: 'new-task-codex',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => events.push(event),
      };

      // 実行 (When): run() を呼び出す
      const task = provider.run(options);
      task.dispose();

      // 検証 (Then): 旧 child.kill() が呼ばれ、warn ログが発火
      assert.strictEqual(prevKilledCount, 1, '旧 activeChild.kill() が 1 回呼ばれる');
      const warnLogs = events.filter((e) => e.type === 'log' && e.level === 'warn');
      assert.ok(warnLogs.length >= 1, 'warn ログが少なくとも 1 件発火');
      assert.ok(warnLogs.some(e => e.message?.includes('prev-task-codex')), 'warn メッセージに旧タスク ID が含まれる');
    });

    // TC-CX-N-03: stdout 複数行出力 → 各行が info ログとして発火
    test('TC-CX-N-03: stdout 複数行出力で各行が info ログとして発火する', () => {
      // 前提 (Given): wireOutput をテスト対象に
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const { child, stdout } = createFakeChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);

      const events: { type: string; level?: string; message?: string }[] = [];
      const options: CodexCliProviderRunOptions = {
        taskId: 'multi-line-task',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => events.push(event),
      };

      wireOutput(child as unknown as ChildProcessWithoutNullStreams, options);

      // 実行 (When): stdout に複数行が送られる
      stdout.emit('data', Buffer.from('line1\nline2\nline3\n'));

      // 検証 (Then): 各行が info ログとして発火
      const infoLogs = events.filter((e) => e.type === 'log' && e.level === 'info');
      assert.strictEqual(infoLogs.length, 3, '3 行分の info ログが発火');
      assert.strictEqual(infoLogs[0]?.message, 'line1');
      assert.strictEqual(infoLogs[1]?.message, 'line2');
      assert.strictEqual(infoLogs[2]?.message, 'line3');
    });

    // TC-CX-N-04: close 時にバッファ末尾あり → tail として info ログ発火
    test('TC-CX-N-04: close 時にバッファ末尾（改行なし）があれば tail として info ログ発火', () => {
      // 前提 (Given): wireOutput をテスト対象に
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const { child, stdout } = createFakeChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);

      const events: { type: string; level?: string; message?: string; exitCode?: number | null }[] = [];
      const options: CodexCliProviderRunOptions = {
        taskId: 'tail-task',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => events.push(event),
      };

      wireOutput(child as unknown as ChildProcessWithoutNullStreams, options);

      // 実行 (When): stdout に改行なしデータが送られ、その後 close
      stdout.emit('data', Buffer.from('incomplete line'));
      child.emit('close', 0);

      // 検証 (Then): tail が info ログとして発火し、completed(0) が発火
      const infoLogs = events.filter((e) => e.type === 'log' && e.level === 'info');
      assert.ok(infoLogs.some((e) => e.message === 'incomplete line'), 'tail の info ログが発火');
      const completed = events.filter((e) => e.type === 'completed');
      assert.strictEqual(completed.length, 1, 'completed イベントが 1 件発火');
      assert.strictEqual(completed[0]?.exitCode, 0, 'exitCode が 0');
    });

    // TC-CX-E-03: stderr 出力あり → error レベルのログ発火
    test('TC-CX-E-03: stderr 出力で error レベルのログが発火する', () => {
      // 前提 (Given): wireOutput をテスト対象に
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const { child, stderr } = createFakeChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);

      const events: { type: string; level?: string; message?: string }[] = [];
      const options: CodexCliProviderRunOptions = {
        taskId: 'stderr-task',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => events.push(event),
      };

      wireOutput(child as unknown as ChildProcessWithoutNullStreams, options);

      // 実行 (When): stderr にエラーメッセージが送られる
      stderr.emit('data', Buffer.from('Some error occurred'));

      // 検証 (Then): error レベルのログが発火
      const errorLogs = events.filter((e) => e.type === 'log' && e.level === 'error');
      assert.strictEqual(errorLogs.length, 1, 'error ログが 1 件発火');
      assert.strictEqual(errorLogs[0]?.message, 'Some error occurred');
    });

    // TC-CX-E-04: child.on('error') → error ログと completed(null) 発火
    test('TC-CX-E-04: child.on error で error ログと completed(null) が発火する', () => {
      // 前提 (Given): wireOutput をテスト対象に
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const { child } = createFakeChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);

      // activeChild を設定（error 時のクリア確認用）
      (provider as unknown as { activeChild: unknown }).activeChild = child;

      const events: { type: string; level?: string; message?: string; exitCode?: number | null }[] = [];
      const options: CodexCliProviderRunOptions = {
        taskId: 'error-task',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => events.push(event),
      };

      wireOutput(child as unknown as ChildProcessWithoutNullStreams, options);

      // 実行 (When): child が error イベントを発火
      child.emit('error', new Error('spawn ENOENT'));

      // 検証 (Then): error ログと completed(null) が発火
      const errorLogs = events.filter((e) => e.type === 'log' && e.level === 'error');
      assert.ok(errorLogs.length >= 1, 'error ログが発火');
      assert.ok(errorLogs.some(e => e.message?.includes('codex 実行エラー')), 'エラーメッセージが含まれる');

      const completed = events.filter((e) => e.type === 'completed');
      assert.strictEqual(completed.length, 1, 'completed イベントが 1 件発火');
      assert.strictEqual(completed[0]?.exitCode, null, 'exitCode が null');
    });

    // TC-CX-N-05: child.on('close', 0) → completed(0) イベント発火
    test('TC-CX-N-05: child.on close(0) で completed(0) イベントが発火する', () => {
      // 前提 (Given): wireOutput をテスト対象に
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const { child } = createFakeChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);

      // activeChild を設定
      (provider as unknown as { activeChild: unknown }).activeChild = child;

      const events: { type: string; exitCode?: number | null }[] = [];
      const options: CodexCliProviderRunOptions = {
        taskId: 'close-task',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => events.push(event),
      };

      wireOutput(child as unknown as ChildProcessWithoutNullStreams, options);

      // 実行 (When): child が close イベントを発火
      child.emit('close', 0);

      // 検証 (Then): completed(0) が発火
      const completed = events.filter((e) => e.type === 'completed');
      assert.strictEqual(completed.length, 1, 'completed イベントが 1 件発火');
      assert.strictEqual(completed[0]?.exitCode, 0, 'exitCode が 0');
    });

    // TC-CX-N-06: run() の started イベントに detail が含まれる
    test('TC-CX-N-06: run() で started イベントが発火し detail に情報が含まれる', () => {
      // 前提 (Given): run() をテスト対象に
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const { child } = createFakeChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);

      // wireOutput をスタブ化
      (provider as unknown as { wireOutput: WireOutput }).wireOutput = () => {};

      const events: { type: string; label?: string; detail?: string }[] = [];
      const options: CodexCliProviderRunOptions = {
        taskId: 'started-task',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: true,
        model: 'o3-mini',
        onEvent: (event) => events.push(event),
      };

      // 実行 (When): run() を呼び出す
      const task = provider.run(options);
      task.dispose();

      // 検証 (Then): started イベントが発火し、detail に情報が含まれる
      const started = events.filter((e) => e.type === 'started');
      assert.strictEqual(started.length, 1, 'started イベントが 1 件発火');
      assert.strictEqual(started[0]?.label, 'codex-cli');
      assert.ok(started[0]?.detail?.includes('model=o3-mini'), 'detail に model が含まれる');
      assert.ok(started[0]?.detail?.includes('write=on'), 'detail に write=on が含まれる');
    });

    // TC-CX-E-05: completed が複数回呼ばれても 1 回のみ発火（冪等性）
    test('TC-CX-E-05: completed は複数回呼んでも 1 回のみ発火する', () => {
      // 前提 (Given): wireOutput をテスト対象に
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const { child } = createFakeChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);

      const events: { type: string; exitCode?: number | null }[] = [];
      const options: CodexCliProviderRunOptions = {
        taskId: 'idempotent-task',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => events.push(event),
      };

      wireOutput(child as unknown as ChildProcessWithoutNullStreams, options);

      // 実行 (When): close と error が両方発火
      child.emit('close', 0);
      child.emit('error', new Error('late error'));
      child.emit('close', 1);

      // 検証 (Then): completed は 1 回のみ
      const completed = events.filter((e) => e.type === 'completed');
      assert.strictEqual(completed.length, 1, 'completed イベントは 1 回のみ発火');
      assert.strictEqual(completed[0]?.exitCode, 0, '最初の exitCode が使われる');
    });

    // TC-CX-B-01: stdout が空行を含む場合、空行はスキップされる
    test('TC-CX-B-01: stdout の空行はスキップされる', () => {
      // 前提 (Given): wireOutput をテスト対象に
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const { child, stdout } = createFakeChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);

      const events: { type: string; level?: string; message?: string }[] = [];
      const options: CodexCliProviderRunOptions = {
        taskId: 'empty-line-task',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => events.push(event),
      };

      wireOutput(child as unknown as ChildProcessWithoutNullStreams, options);

      // 実行 (When): stdout に空行を含むデータが送られる
      stdout.emit('data', Buffer.from('line1\n\n   \nline2\n'));

      // 検証 (Then): 空行はスキップされ、line1 と line2 のみ発火
      const infoLogs = events.filter((e) => e.type === 'log' && e.level === 'info');
      assert.strictEqual(infoLogs.length, 2, '空行以外の 2 行分の info ログが発火');
      assert.strictEqual(infoLogs[0]?.message, 'line1');
      assert.strictEqual(infoLogs[1]?.message, 'line2');
    });

    // TC-CX-B-02: stderr が空白のみの場合、ログはスキップされる
    test('TC-CX-B-02: stderr が空白のみの場合はログがスキップされる', () => {
      // 前提 (Given): wireOutput をテスト対象に
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const { child, stderr } = createFakeChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);

      const events: { type: string; level?: string; message?: string }[] = [];
      const options: CodexCliProviderRunOptions = {
        taskId: 'empty-stderr-task',
        workspaceRoot: '/tmp',
        prompt: 'test prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (event) => events.push(event),
      };

      wireOutput(child as unknown as ChildProcessWithoutNullStreams, options);

      // 実行 (When): stderr に空白のみのデータが送られる
      stderr.emit('data', Buffer.from('   \n'));

      // 検証 (Then): error ログは発火しない
      const errorLogs = events.filter((e) => e.type === 'log' && e.level === 'error');
      assert.strictEqual(errorLogs.length, 0, '空白のみの場合は error ログが発火しない');
    });
  });
});
