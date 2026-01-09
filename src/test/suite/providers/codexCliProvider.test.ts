import * as assert from 'assert';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import * as childProcess from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { CodexCliProvider } from '../../../providers/codexCliProvider';

type CodexCliProviderRunOptions = Parameters<CodexCliProvider['run']>[0];

type CodexCliProviderPrivate = {
  spawnCodex: (options: AgentRunOptions, prompt: string) => ChildProcessWithoutNullStreams;
  wireOutput: (child: ChildProcessWithoutNullStreams, options: CodexCliProviderRunOptions) => void;
};

type AgentRunOptions = {
  agentCommand?: string;
  model?: string;
};

type EventLike = { type: string; [k: string]: unknown };

function isLogEvent(e: EventLike): e is EventLike & { type: 'log'; level: 'info' | 'warn' | 'error'; message: string } {
  return (
    e.type === 'log' &&
    (e.level === 'info' || e.level === 'warn' || e.level === 'error') &&
    typeof e.message === 'string'
  );
}

function isCompletedEvent(e: EventLike): e is EventLike & { type: 'completed'; exitCode: number | null } {
  return e.type === 'completed' && (typeof e.exitCode === 'number' || e.exitCode === null);
}

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

  test('TC-PROV-CODEX-PROMPT-EMPTY: codexPromptCommand が空のとき、注入せず元 prompt が stdin に書かれる', () => {
    // Given: dontforgetest.codexPromptCommand が空（境界値）
    const config = {
      get: (key: string) => {
        if (key === 'codexPromptCommand') return '   ';
        if (key === 'codexReasoningEffort') return '';
        return '';
      },
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

    const child = createMockChild();
    let written = '';
    child.stdin.write = ((chunk: string | Uint8Array) => {
      written += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      return true;
    }) as typeof child.stdin.write;
    const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;

    const provider = new CodexCliProvider(mockSpawn);
    const events: EventLike[] = [];
    const options: CodexCliProviderRunOptions = {
      taskId: 'codex-prompt-empty',
      workspaceRoot: '/tmp',
      prompt: 'ORIGINAL_PROMPT',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (e) => events.push(e as unknown as EventLike),
    };

    // When: run() を呼び出す
    const task = provider.run(options);

    // Then: stdin には元の prompt が書き込まれ、コマンド注入ログは出ない
    assert.strictEqual(written, 'ORIGINAL_PROMPT\n');
    const injectionLogs = events.filter(
      (e) => typeof e === 'object' && e !== null && (e as { type?: unknown }).type === 'log' && JSON.stringify(e).includes('codex コマンドプロンプト')
    );
    assert.strictEqual(injectionLogs.length, 0);
    task.dispose();
  });

  test('TC-PROV-CODEX-PROMPT-INJECT: コマンドプロンプトが存在し非空のとき、先頭へ注入される', () => {
    // Given: codexPromptCommand が設定され、~/.codex/prompts/<name>.md が非空
    const commandName = 'my-command';
    const fakeHome = '/home/fake-user';
    const expectedFilePath = path.join(fakeHome, '.codex', 'prompts', `${commandName}.md`);
    const commandText = 'COMMAND_PROMPT_TEXT';
    const deps = {
      homedir: () => fakeHome,
      readFileSync: (p: string, enc: BufferEncoding) => {
        assert.strictEqual(p, expectedFilePath);
        assert.strictEqual(enc, 'utf8');
        return `${commandText}\n\n`;
      },
    };

    const config = {
      get: (key: string) => {
        if (key === 'codexPromptCommand') return commandName;
        if (key === 'codexReasoningEffort') return '';
        return '';
      },
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

    const child = createMockChild();
    let written = '';
    child.stdin.write = ((chunk: string | Uint8Array) => {
      written += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      return true;
    }) as typeof child.stdin.write;
    const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;

    const provider = new CodexCliProvider(mockSpawn, deps);
    const events: EventLike[] = [];
    const options: CodexCliProviderRunOptions = {
      taskId: 'codex-prompt-inject',
      workspaceRoot: '/tmp',
      prompt: 'ORIGINAL_PROMPT',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (e) => events.push(e as unknown as EventLike),
    };

    // When: run() を呼び出す
    const task = provider.run(options);

    // Then: stdin には注入済み prompt が書かれ、注入ログが info で出る
    assert.strictEqual(written, `${commandText}\n\nORIGINAL_PROMPT\n`);
    const injected = events.find((e) => isLogEvent(e) && e.level === 'info' && e.message.includes('codex コマンドプロンプトを注入しました'));
    assert.ok(injected, 'Expected injection info log');
    assert.ok(JSON.stringify(injected).includes(expectedFilePath), 'Expected injected filePath in log');
    task.dispose();
  });

  test('TC-PROV-CODEX-PROMPT-NOTFOUND: ファイルが存在しない場合、warn ログになり注入しない', () => {
    // Given: codexPromptCommand はあるが readFileSync が失敗する（異常系）
    const commandName = 'missing';
    const deps = {
      homedir: () => '/home/fake-user',
      readFileSync: () => {
        throw new Error('ENOENT');
      },
    };

    const config = {
      get: (key: string) => {
        if (key === 'codexPromptCommand') return commandName;
        if (key === 'codexReasoningEffort') return '';
        return '';
      },
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

    const child = createMockChild();
    let written = '';
    child.stdin.write = ((chunk: string | Uint8Array) => {
      written += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      return true;
    }) as typeof child.stdin.write;
    const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;

    const provider = new CodexCliProvider(mockSpawn, deps);
    const events: EventLike[] = [];
    const options: CodexCliProviderRunOptions = {
      taskId: 'codex-prompt-notfound',
      workspaceRoot: '/tmp',
      prompt: 'ORIGINAL_PROMPT',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (e) => events.push(e as unknown as EventLike),
    };

    // When: run() を呼び出す
    const task = provider.run(options);

    // Then: 注入なし + warn ログ
    assert.strictEqual(written, 'ORIGINAL_PROMPT\n');
    const warnLog = events.find((e): e is EventLike & { type: 'log'; level: 'warn'; message: string } => isLogEvent(e) && e.level === 'warn');
    assert.ok(warnLog, 'Expected warn log');
    assert.ok(warnLog.message.includes(commandName), 'Warn message should include command name');
    task.dispose();
  });

  test('TC-PROV-CODEX-PROMPT-EMPTYFILE: ファイルが空/空白の場合、warn ログになり注入しない', () => {
    // Given: codexPromptCommand はあるがファイル内容が空白（境界値）
    const commandName = 'empty';
    const deps = {
      homedir: () => '/home/fake-user',
      readFileSync: () => '   \n',
    };

    const config = {
      get: (key: string) => {
        if (key === 'codexPromptCommand') return commandName;
        if (key === 'codexReasoningEffort') return '';
        return '';
      },
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

    const child = createMockChild();
    let written = '';
    child.stdin.write = ((chunk: string | Uint8Array) => {
      written += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      return true;
    }) as typeof child.stdin.write;
    const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;

    const provider = new CodexCliProvider(mockSpawn, deps);
    const events: EventLike[] = [];
    const options: CodexCliProviderRunOptions = {
      taskId: 'codex-prompt-emptyfile',
      workspaceRoot: '/tmp',
      prompt: 'ORIGINAL_PROMPT',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (e) => events.push(e as unknown as EventLike),
    };

    // When: run() を呼び出す
    const task = provider.run(options);

    // Then: 注入なし + warn ログ
    assert.strictEqual(written, 'ORIGINAL_PROMPT\n');
    const warnLog = events.find((e): e is EventLike & { type: 'log'; level: 'warn'; message: string } => isLogEvent(e) && e.level === 'warn');
    assert.ok(warnLog, 'Expected warn log');
    assert.ok(warnLog.message.includes(commandName), 'Warn message should include command name');
    task.dispose();
  });

  test('TC-PROV-CODEX-MULTIRUN-KILL: 多重起動時、前回 child.kill() が呼ばれ warn ログが出る', () => {
    // Given: 連続で run() される（前回の child が active のまま）
    const config = {
      get: (key: string) => {
        if (key === 'codexPromptCommand') return '';
        if (key === 'codexReasoningEffort') return '';
        return '';
      },
    } as unknown as vscode.WorkspaceConfiguration;
    mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

    let prevKilled = 0;
    const prevChild = createMockChild();
    prevChild.kill = () => {
      prevKilled += 1;
      return true;
    };
    const nextChild = createMockChild();

    let spawnCount = 0;
    const mockSpawn = (() => {
      spawnCount += 1;
      return spawnCount === 1 ? prevChild : nextChild;
    }) as unknown as typeof childProcess.spawn;

    const provider = new CodexCliProvider(mockSpawn);
    const events: EventLike[] = [];

    const options1: CodexCliProviderRunOptions = {
      taskId: 'prev-task-codex',
      workspaceRoot: '/tmp',
      prompt: 'PROMPT1',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (e) => events.push(e as unknown as EventLike),
    };
    const options2: CodexCliProviderRunOptions = {
      taskId: 'next-task-codex',
      workspaceRoot: '/tmp',
      prompt: 'PROMPT2',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (e) => events.push(e as unknown as EventLike),
    };

    // When: run() を 2 回呼び出す（前回 dispose しない）
    const task1 = provider.run(options1);
    const task2 = provider.run(options2);

    // Then: 2回目の run() 開始時に前回 kill が行われる + warn ログ
    assert.strictEqual(prevKilled, 1, 'Expected previous child.kill() to be called once on multi-run');
    const warnLogs = events.filter((e): e is EventLike & { type: 'log'; level: 'warn'; message: string } => isLogEvent(e) && e.level === 'warn');
    assert.ok(warnLogs.length >= 1, 'Expected at least one warn log event');
    assert.ok(warnLogs.some((l) => l.message.includes('prev-task-codex')), 'Warn message should include previous task id');

    task2.dispose();
    task1.dispose();
  });

  suite('wireOutput', () => {
    const provider = new CodexCliProvider() as unknown as CodexCliProviderPrivate;

    const createOptions = (events: TestGenEventLike[]): CodexCliProviderRunOptions =>
      ({
        taskId: 'codex-wire',
        workspaceRoot: '/tmp',
        prompt: 'PROMPT',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e: unknown) => events.push(e as unknown as TestGenEventLike),
      }) as unknown as CodexCliProviderRunOptions;

    test('TC-PROV-CODEX-WIREOUT-STDOUT: stdout 複数行は行ごとに info、close 時に末尾バッファを tail として info', () => {
      // Given: wireOutput 済み child
      const events: TestGenEventLike[] = [];
      const child = createMockChild();
      (provider as unknown as { activeChild: unknown; activeTaskId: string | undefined }).activeChild = child;
      (provider as unknown as { activeTaskId: string | undefined }).activeTaskId = 'codex-wire-prev';

      provider.wireOutput(child, createOptions(events));

      // When: stdout に複数行 + 改行無しの末尾が来て close される
      child.stdout.emit('data', Buffer.from(' line1 \n\nline2\npartial'));
      (child as unknown as EventEmitter).emit('close', 0);

      // Then: line1 / line2 / partial が info log として出て、completed(0) が出る
      const infoLogs = events.filter((e) => isLogEvent(e) && e.level === 'info');
      assert.ok(infoLogs.some((e) => e.message === 'line1'));
      assert.ok(infoLogs.some((e) => e.message === 'line2'));
      assert.ok(infoLogs.some((e) => e.message === 'partial'));

      const completed = events.filter((e) => isCompletedEvent(e));
      assert.strictEqual(completed.length, 1);
      assert.strictEqual(completed[0]?.exitCode, 0);
      const activeChild = (provider as unknown as { activeChild: unknown }).activeChild;
      assert.strictEqual(activeChild, undefined, 'activeChild should be cleared on close');
    });

    test('TC-PROV-CODEX-WIREOUT-STDERR: stderr は error log になる', () => {
      // Given: wireOutput 済み child
      const events: TestGenEventLike[] = [];
      const child = createMockChild();
      (provider as unknown as { activeChild: unknown }).activeChild = child;
      provider.wireOutput(child, createOptions(events));

      // When: stderr 出力が来る
      child.stderr.emit('data', Buffer.from('stderr-message\n'));
      (child as unknown as EventEmitter).emit('close', 0);

      // Then: error log が出る
      const errLogs = events.filter((e) => isLogEvent(e) && e.level === 'error');
      assert.ok(errLogs.some((e) => e.message === 'stderr-message'));
    });

    test('TC-PROV-CODEX-WIREOUT-ERROR: child error は error log + completed(null)（completed は重複しない）', () => {
      // Given: wireOutput 済み child
      const events: TestGenEventLike[] = [];
      const child = createMockChild();
      (provider as unknown as { activeChild: unknown }).activeChild = child;
      provider.wireOutput(child, createOptions(events));

      // When: error が発火し、その後 close も来る
      (child as unknown as EventEmitter).emit('error', new Error('ENOENT'));
      (child as unknown as EventEmitter).emit('close', 0);

      // Then: error log + completed(null) が 1 回だけ出る
      const errLog = events.find(
        (e): e is EventLike & { type: 'log'; level: 'error'; message: string } =>
          isLogEvent(e) && e.level === 'error' && e.message.includes('codex 実行エラー:')
      );
      assert.ok(errLog, 'Expected codex error log');
      assert.ok(errLog.message.includes('ENOENT'), 'Expected error message to include original error message');

      const completed = events.filter((e) => isCompletedEvent(e));
      assert.strictEqual(completed.length, 1);
      assert.strictEqual(completed[0]?.exitCode, null);
      const activeChild = (provider as unknown as { activeChild: unknown }).activeChild;
      assert.strictEqual(activeChild, undefined, 'activeChild should be cleared on error');
    });
  });
});

type TestGenEventLike = EventLike;
