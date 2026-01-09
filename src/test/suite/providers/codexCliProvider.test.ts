import * as assert from 'assert';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import * as childProcess from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
  const originalHomedir = os.homedir;

  teardown(() => {
    try {
      mutableWorkspace.getConfiguration = originalGetConfiguration;
    } catch {
      // Ignore teardown errors (e.g., if getConfiguration is read-only)
    }
    try {
      (os as { homedir: () => string }).homedir = originalHomedir;
    } catch {
      // Ignore teardown errors
    }
  });

  const createTempHome = (): string => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    (os as { homedir: () => string }).homedir = () => homeDir;
    return homeDir;
  };

  // TC-N-05
  test('TC-N-05: reasoning effort is set, spawn args include -c and prompt is written to stdin', () => {
    // Given: A Codex CLI provider with reasoning effort configured
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

    // When: spawnCodex is called
    provider.spawnCodex(options, prompt);

    // Then: spawn receives exec args with reasoning effort and prompt goes to stdin
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
    // Given: reasoning effort is configured to 'medium'
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

    // When: spawnCodex is called
    provider.spawnCodex({ agentCommand: 'codex' }, 'prompt');

    // Then: spawn args include -c model_reasoning_effort="medium"
    assert.ok(spawnCall.args?.includes('-c'));
    assert.ok(spawnCall.args?.includes('model_reasoning_effort="medium"'));
  });

  // TC-E-07
  test('TC-E-07: CodexCliProvider.run does not throw when child.stdin.write fails', () => {
    // Given: child.stdin.write throws an error
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

    // When: run is called
    // Then: It does not throw
    assert.doesNotThrow(() => provider.run(options as CodexCliProviderRunOptions));
  });

  // TC-E-11
  test('TC-E-11: reasoning effort is empty string, -c is not added', () => {
    // Given: An empty reasoning effort config
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

    // When: spawnCodex is called
    provider.spawnCodex(options, 'prompt');

    // Then: args exclude the reasoning effort override
    assert.deepStrictEqual(spawnCall.args, ['exec', '--model', 'test-model', '-']);
  });

  // TC-E-12
  test('TC-E-12: reasoning effort is whitespace, -c is not added', () => {
    // Given: A whitespace-only reasoning effort config
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

    // When: spawnCodex is called
    provider.spawnCodex(options, 'prompt');

    // Then: args exclude the reasoning effort override
    assert.deepStrictEqual(spawnCall.args, ['exec', '--model', 'test-model', '-']);
  });

  // TC-E-14
  test('TC-E-14: reasoning effort is null, -c is not added', () => {
    // Given: A null reasoning effort config
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

    // When: spawnCodex is called
    provider.spawnCodex(options, 'prompt');

    // Then: args exclude the reasoning effort override
    assert.deepStrictEqual(spawnCall.args, ['exec', '--model', 'test-model', '-']);
  });

  // TC-E-13
  test('TC-E-13: reasoning effort is undefined, -c is not added', () => {
    // Given: An undefined reasoning effort config
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

    // When: spawnCodex is called
    provider.spawnCodex(options, 'prompt');

    // Then: args exclude the reasoning effort override
    assert.deepStrictEqual(spawnCall.args, ['exec', '--model', 'test-model', '-']);
  });

  test('TC-E-05: spawn throws, error propagates with message', () => {
    // Given: spawn throws an error
    mutableWorkspace.getConfiguration = (() =>
      ({ get: () => 'high' } as unknown as vscode.WorkspaceConfiguration)) as unknown as typeof vscode.workspace.getConfiguration;
    const mockSpawn = (() => {
      throw new Error('spawn failed');
    }) as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn) as unknown as CodexCliProviderPrivate;
    const options = { agentCommand: 'codex-cli', model: 'test-model' } as AgentRunOptions;

    // When: spawnCodex is called
    // Then: the error is thrown with the expected type and message
    assert.throws(
      () => provider.spawnCodex(options, 'prompt'),
      (error: unknown) =>
        error instanceof Error && error.message === 'spawn failed'
    );
  });

  test('TC-E-06: getConfiguration throws, error propagates with message', () => {
    // Given: getConfiguration throws an error
    mutableWorkspace.getConfiguration = (() => {
      throw new Error('config failed');
    }) as unknown as typeof vscode.workspace.getConfiguration;
    const provider = new CodexCliProvider() as unknown as CodexCliProviderPrivate;
    const options = { agentCommand: 'codex-cli', model: 'test-model' } as AgentRunOptions;

    // When: spawnCodex is called
    // Then: the error is thrown with the expected type and message
    assert.throws(
      () => provider.spawnCodex(options, 'prompt'),
      (error: unknown) =>
        error instanceof Error && error.message === 'config failed'
    );
  });

  // TC- CODEX-ARG-01: codexReasoningEffort is set to 'medium' (default)
  test('TC- CODEX-ARG-01: codexReasoningEffort="medium" injects model_reasoning_effort="medium"', () => {
    // Given: Configured to 'medium'
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

    // When: spawnCodex is called
    provider.spawnCodex({ agentCommand: 'codex' }, 'prompt');

    // Then: args include -c model_reasoning_effort="medium"
    assert.ok(spawnCall.args?.includes('-c'));
    assert.ok(spawnCall.args?.includes('model_reasoning_effort="medium"'));
  });

  // TC-CODEX-ARG-02: codexReasoningEffort is set to 'high'
  test('TC-CODEX-ARG-02: codexReasoningEffort="high" injects model_reasoning_effort="high"', () => {
    // Given: Configured to 'high'
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

    // When: spawnCodex is called
    provider.spawnCodex({ agentCommand: 'codex' }, 'prompt');

    // Then: args include -c model_reasoning_effort="high"
    assert.ok(spawnCall.args?.includes('-c'));
    assert.ok(spawnCall.args?.includes('model_reasoning_effort="high"'));
  });

  // TC-CODEX-ARG-03: codexReasoningEffort is empty string -> No injection
  test('TC-CODEX-ARG-03: codexReasoningEffort="" injects nothing', () => {
    // Given: Configured to ''
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

    // When: spawnCodex is called
    provider.spawnCodex({ agentCommand: 'codex' }, 'prompt');

    // Then: args DO NOT include -c
    assert.ok(!spawnCall.args?.includes('-c'));
  });

  // TC-CODEX-STDIN-01: Run agent with specific prompt via stdin
  test('TC-CODEX-STDIN-01: Prompt is written to child process stdin', () => {
    // Given: A specific prompt
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

    // When: spawnCodex is called
    provider.spawnCodex({ agentCommand: 'codex' }, prompt);

    // Then: Prompt + newline is written to stdin
    assert.strictEqual(written, `${prompt}\n`);
  });

  // TC-CODEX-CMD-01: Run agent command structure
  test('TC-CODEX-CMD-01: Spawn args start with ["exec"] and end with ["-"]', () => {
    // Given: Standard run
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

    // When: spawnCodex is called
    provider.spawnCodex({ agentCommand: 'codex' }, 'prompt');

    // Then: Args start with 'exec' and end with '-'
    assert.strictEqual(spawnCall.args?.[0], 'exec');
    assert.strictEqual(spawnCall.args?.[spawnCall.args.length - 1], '-');
  });

  test('TC-CODEX-P-01: codexPromptCommand が空の場合、プロンプト注入しない', () => {
    // Given: codexPromptCommand が空
    const config = {
      get: (key: string) => (key === 'codexPromptCommand' ? '' : ''),
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;
    createTempHome();
    const child = createMockChild();
    let written = '';
    child.stdin.write = ((chunk: string | Uint8Array) => {
      written += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      return true;
    }) as typeof child.stdin.write;
    const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn);
    const options: CodexCliProviderRunOptions = {
      taskId: 'codex-prompt-empty',
      workspaceRoot: '/tmp',
      prompt: 'Base Prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: () => {},
    };

    // When: run を呼び出す
    provider.run(options);

    // Then: プロンプトは注入されず元のまま送られる
    assert.strictEqual(written, 'Base Prompt\n');
  });

  test('TC-CODEX-P-02: codex コマンドプロンプトが存在する場合、先頭に注入される', () => {
    // Given: codexPromptCommand が有効で prompt ファイルが存在
    const config = {
      get: (key: string) => (key === 'codexPromptCommand' ? 'custom' : ''),
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;
    const homeDir = createTempHome();
    const promptDir = path.join(homeDir, '.codex', 'prompts');
    fs.mkdirSync(promptDir, { recursive: true });
    fs.writeFileSync(path.join(promptDir, 'custom.md'), 'Injected Prompt');
    const child = createMockChild();
    let written = '';
    child.stdin.write = ((chunk: string | Uint8Array) => {
      written += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      return true;
    }) as typeof child.stdin.write;
    const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn);
    const options: CodexCliProviderRunOptions = {
      taskId: 'codex-prompt-inject',
      workspaceRoot: '/tmp',
      prompt: 'Base Prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: () => {},
    };

    // When: run を呼び出す
    provider.run(options);

    // Then: 注入されたプロンプトが先頭に入る
    assert.strictEqual(written, 'Injected Prompt\n\nBase Prompt\n');
  });

  test('TC-CODEX-P-03: codex コマンドプロンプトが空の場合、warn ログが出る', () => {
    // Given: codexPromptCommand は指定されるがファイルが空
    const config = {
      get: (key: string) => (key === 'codexPromptCommand' ? 'empty' : ''),
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;
    const homeDir = createTempHome();
    const promptDir = path.join(homeDir, '.codex', 'prompts');
    fs.mkdirSync(promptDir, { recursive: true });
    fs.writeFileSync(path.join(promptDir, 'empty.md'), '');
    const child = createMockChild();
    const events: Array<{ type: string; level?: string; message?: string }> = [];
    const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn);
    const options: CodexCliProviderRunOptions = {
      taskId: 'codex-prompt-empty-file',
      workspaceRoot: '/tmp',
      prompt: 'Base Prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (event) => events.push(event),
    };

    // When: run を呼び出す
    provider.run(options);

    // Then: warn ログが出る
    const warnLog = events.find((event) => event.type === 'log' && event.level === 'warn');
    assert.ok(warnLog?.message?.includes('codex コマンドプロンプトが見つからないためスキップしました'));
  });

  test('TC-CODEX-P-04: activeChild がある場合、旧 child を kill して warn ログを出す', () => {
    // Given: 既存タスクが動作中の CodexCliProvider
    const child1 = createMockChild();
    let killCount = 0;
    child1.kill = () => {
      killCount += 1;
      return true;
    };
    const child2 = createMockChild();
    let spawnCount = 0;
    const mockSpawn = (() => {
      spawnCount += 1;
      return spawnCount === 1 ? child1 : child2;
    }) as unknown as typeof childProcess.spawn;
    const provider = new CodexCliProvider(mockSpawn);
    const events: Array<{ type: string; level?: string; message?: string }> = [];
    const baseOptions: CodexCliProviderRunOptions = {
      taskId: 'codex-active-1',
      workspaceRoot: '/tmp',
      prompt: 'Base Prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (event) => events.push(event),
    };

    // When: run を2回呼び出す
    provider.run(baseOptions);
    provider.run({ ...baseOptions, taskId: 'codex-active-2' });

    // Then: 旧 child.kill が呼ばれ warn ログが出る
    assert.strictEqual(killCount, 1);
    const warnLog = events.find((event) => event.type === 'log' && event.level === 'warn');
    assert.ok(warnLog?.message?.includes('前回の codex タスク'));
  });

  test('TC-CODEX-P-05: stdout が複数行の場合、行ごとに info ログが出る', () => {
    // Given: wireOutput を設定した child
    const child = createMockChild();
    const provider = new CodexCliProvider();
    const events: Array<{ type: string; level?: string; message?: string }> = [];
    const options: CodexCliProviderRunOptions = {
      taskId: 'codex-stdout-lines',
      workspaceRoot: '/tmp',
      prompt: 'prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (event) => events.push(event),
    };
    (provider as unknown as { wireOutput: (child: ChildProcessWithoutNullStreams, options: CodexCliProviderRunOptions) => void }).wireOutput(
      child,
      options,
    );

    // When: 複数行の stdout を送る
    (child.stdout as PassThrough).write('line-1\nline-2\n');

    // Then: 行ごとに info ログが出る
    const messages = events.filter((event) => event.type === 'log' && event.level === 'info').map((event) => event.message);
    assert.deepStrictEqual(messages, ['line-1', 'line-2']);
  });

  test('TC-CODEX-P-06: stdout 末尾が改行なしの場合、close 時に tail がログされる', () => {
    // Given: wireOutput を設定した child
    const child = createMockChild();
    const provider = new CodexCliProvider();
    const events: Array<{ type: string; level?: string; message?: string }> = [];
    const options: CodexCliProviderRunOptions = {
      taskId: 'codex-stdout-tail',
      workspaceRoot: '/tmp',
      prompt: 'prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (event) => events.push(event),
    };
    (provider as unknown as { wireOutput: (child: ChildProcessWithoutNullStreams, options: CodexCliProviderRunOptions) => void }).wireOutput(
      child,
      options,
    );

    // When: 末尾に改行のない stdout と close を送る
    (child.stdout as PassThrough).write('line-1\nline-2');
    child.emit('close', 0);

    // Then: tail が info ログされる
    const messages = events.filter((event) => event.type === 'log' && event.level === 'info').map((event) => event.message);
    assert.deepStrictEqual(messages, ['line-1', 'line-2']);
  });

  test('TC-CODEX-P-07: stderr 出力は error ログになる', () => {
    // Given: wireOutput を設定した child
    const child = createMockChild();
    const provider = new CodexCliProvider();
    const events: Array<{ type: string; level?: string; message?: string }> = [];
    const options: CodexCliProviderRunOptions = {
      taskId: 'codex-stderr',
      workspaceRoot: '/tmp',
      prompt: 'prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (event) => events.push(event),
    };
    (provider as unknown as { wireOutput: (child: ChildProcessWithoutNullStreams, options: CodexCliProviderRunOptions) => void }).wireOutput(
      child,
      options,
    );

    // When: stderr に出力する
    (child.stderr as PassThrough).write('oops');

    // Then: error ログが出る
    const errorLog = events.find((event) => event.type === 'log' && event.level === 'error');
    assert.strictEqual(errorLog?.message, 'oops');
  });

  test('TC-CODEX-P-08: child error で error ログと completed(null) が出る', () => {
    // Given: wireOutput を設定した child
    const child = createMockChild();
    const provider = new CodexCliProvider();
    const events: Array<{ type: string; level?: string; message?: string; exitCode?: number | null }> = [];
    const options: CodexCliProviderRunOptions = {
      taskId: 'codex-error',
      workspaceRoot: '/tmp',
      prompt: 'prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (event) => events.push(event),
    };
    (provider as unknown as { wireOutput: (child: ChildProcessWithoutNullStreams, options: CodexCliProviderRunOptions) => void }).wireOutput(
      child,
      options,
    );

    // When: error を発火する
    child.emit('error', new Error('boom'));

    // Then: error ログと completed(null) が出る
    const errorLog = events.find((event) => event.type === 'log' && event.level === 'error');
    const completed = events.find((event) => event.type === 'completed');
    assert.ok(errorLog?.message?.includes('codex 実行エラー: boom'));
    assert.strictEqual(completed?.exitCode ?? undefined, null);
  });

  test('TC-CODEX-P-09: close で completed(code) が出る', () => {
    // Given: wireOutput を設定した child
    const child = createMockChild();
    const provider = new CodexCliProvider();
    const events: Array<{ type: string; exitCode?: number | null }> = [];
    const options: CodexCliProviderRunOptions = {
      taskId: 'codex-close',
      workspaceRoot: '/tmp',
      prompt: 'prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (event) => events.push(event),
    };
    (provider as unknown as { wireOutput: (child: ChildProcessWithoutNullStreams, options: CodexCliProviderRunOptions) => void }).wireOutput(
      child,
      options,
    );

    // When: close を発火する
    child.emit('close', 2);

    // Then: completed(code) が出る
    const completed = events.find((event) => event.type === 'completed');
    assert.strictEqual(completed?.exitCode, 2);
  });
});
