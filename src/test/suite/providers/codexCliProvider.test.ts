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

  suite('Multi-startup behavior (run with activeChild)', () => {
    // TC-CODEX-MULTI-N-01: activeChild exists when run() called
    test('TC-CODEX-MULTI-N-01: activeChild exists when run() called -> previous child.kill() and warn log', () => {
      // Given: A provider with an existing activeChild
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const child1 = createMockChild();
      const child2 = createMockChild();
      let killCount = 0;
      child1.kill = () => {
        killCount += 1;
        return true;
      };

      let spawnCount = 0;
      const mockSpawn = (() => {
        spawnCount += 1;
        return spawnCount === 1 ? child1 : child2;
      }) as unknown as typeof childProcess.spawn;

      const provider = new CodexCliProvider(mockSpawn);
      const events: { type: string; level?: string; message?: string }[] = [];
      const options = {
        taskId: 'task-1',
        workspaceRoot: '/tmp',
        prompt: 'prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e: { type: string; level?: string; message?: string }) => events.push(e),
      };

      // When: run() is called twice
      provider.run(options as CodexCliProviderRunOptions);
      const options2 = { ...options, taskId: 'task-2' };
      provider.run(options2 as CodexCliProviderRunOptions);

      // Then: Previous child.kill() is called and warn log is emitted
      assert.strictEqual(killCount, 1, 'Previous child.kill() should be called once');
      const warnLogs = events.filter((e) => e.type === 'log' && e.level === 'warn');
      assert.ok(warnLogs.length >= 1, 'At least one warn log should be emitted');
      const warnMessage = warnLogs[0]?.message ?? '';
      assert.ok(warnMessage.includes('task-1'), 'Warn message should include previous taskId');
    });

    // TC-CODEX-MULTI-E-01: activeChild.kill() throws
    test('TC-CODEX-MULTI-E-01: activeChild.kill() throws -> exception caught silently', () => {
      // Given: A provider with activeChild whose kill() throws
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const child1 = createMockChild();
      const child2 = createMockChild();
      child1.kill = () => {
        throw new Error('kill failed');
      };

      let spawnCount = 0;
      const mockSpawn = (() => {
        spawnCount += 1;
        return spawnCount === 1 ? child1 : child2;
      }) as unknown as typeof childProcess.spawn;

      const provider = new CodexCliProvider(mockSpawn);
      const events: { type: string; level?: string; message?: string }[] = [];
      const options = {
        taskId: 'task-1',
        workspaceRoot: '/tmp',
        prompt: 'prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e: { type: string; level?: string; message?: string }) => events.push(e),
      };

      // When: run() is called twice (first kill throws)
      provider.run(options as CodexCliProviderRunOptions);
      const options2 = { ...options, taskId: 'task-2' };

      // Then: No exception is thrown
      assert.doesNotThrow(() => provider.run(options2 as CodexCliProviderRunOptions));
      const warnLogs = events.filter((e) => e.type === 'log' && e.level === 'warn');
      assert.ok(warnLogs.length >= 1, 'Warn log should still be emitted');
    });

    // TC-CODEX-MULTI-B-01: activeTaskId is undefined
    test('TC-CODEX-MULTI-B-01: activeTaskId is undefined -> warn log shows unknown', () => {
      // Given: A provider with activeChild but undefined activeTaskId
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const child1 = createMockChild();
      const child2 = createMockChild();

      let spawnCount = 0;
      const mockSpawn = (() => {
        spawnCount += 1;
        return spawnCount === 1 ? child1 : child2;
      }) as unknown as typeof childProcess.spawn;

      const provider = new CodexCliProvider(mockSpawn);
      const events: { type: string; level?: string; message?: string }[] = [];
      const options = {
        taskId: 'task-1',
        workspaceRoot: '/tmp',
        prompt: 'prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e: { type: string; level?: string; message?: string }) => events.push(e),
      };

      // First run to set activeChild
      provider.run(options as CodexCliProviderRunOptions);

      // Manually set activeTaskId to undefined to test boundary
      (provider as unknown as { activeTaskId: string | undefined }).activeTaskId = undefined;

      // When: run() is called again
      const options2 = { ...options, taskId: 'task-2' };
      provider.run(options2 as CodexCliProviderRunOptions);

      // Then: Warn log shows 'unknown'
      const warnLogs = events.filter((e) => e.type === 'log' && e.level === 'warn');
      assert.ok(warnLogs.length >= 1, 'Warn log should be emitted');
      const warnMessage = warnLogs[0]?.message ?? '';
      assert.ok(warnMessage.includes('unknown'), 'Warn message should include unknown');
    });
  });

  suite('wireOutput', () => {
    type WireOutput = (child: ChildProcessWithoutNullStreams, options: CodexCliProviderRunOptions) => void;

    // TC-CODEX-WIRE-N-01: stdout emits multiple lines
    test('TC-CODEX-WIRE-N-01: stdout emits multiple lines -> log(info) per line', () => {
      // Given: A provider with wireOutput
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const child = createMockChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);

      const events: { type: string; level?: string; message?: string }[] = [];
      const options = {
        taskId: 'wire-test',
        workspaceRoot: '/tmp',
        prompt: 'prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e: { type: string; level?: string; message?: string }) => events.push(e),
      };

      wireOutput(child, options as CodexCliProviderRunOptions);

      // When: stdout emits multiple lines
      child.stdout.emit('data', Buffer.from('line1\nline2\nline3\n'));

      // Then: log(info) emitted for each non-empty line
      const infoLogs = events.filter((e) => e.type === 'log' && e.level === 'info');
      assert.strictEqual(infoLogs.length, 3, 'Should emit 3 info logs');
      assert.strictEqual(infoLogs[0]?.message, 'line1');
      assert.strictEqual(infoLogs[1]?.message, 'line2');
      assert.strictEqual(infoLogs[2]?.message, 'line3');
    });

    // TC-CODEX-WIRE-N-02: close with buffer tail (no trailing newline)
    test('TC-CODEX-WIRE-N-02: close with buffer tail -> log(info) for tail', () => {
      // Given: A provider with wireOutput
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const child = createMockChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);

      const events: { type: string; level?: string; message?: string }[] = [];
      const options = {
        taskId: 'wire-tail-test',
        workspaceRoot: '/tmp',
        prompt: 'prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e: { type: string; level?: string; message?: string }) => events.push(e),
      };

      wireOutput(child, options as CodexCliProviderRunOptions);

      // When: stdout emits data without trailing newline, then close
      child.stdout.emit('data', Buffer.from('line1\ntail-content'));
      child.emit('close', 0);

      // Then: tail content is logged
      const infoLogs = events.filter((e) => e.type === 'log' && e.level === 'info');
      assert.ok(infoLogs.some((e) => e.message === 'tail-content'), 'Tail content should be logged');
    });

    // TC-CODEX-WIRE-N-03: stderr emits data
    test('TC-CODEX-WIRE-N-03: stderr emits data -> log(error)', () => {
      // Given: A provider with wireOutput
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const child = createMockChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);

      const events: { type: string; level?: string; message?: string }[] = [];
      const options = {
        taskId: 'wire-stderr-test',
        workspaceRoot: '/tmp',
        prompt: 'prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e: { type: string; level?: string; message?: string }) => events.push(e),
      };

      wireOutput(child, options as CodexCliProviderRunOptions);

      // When: stderr emits data
      child.stderr.emit('data', Buffer.from('error message'));

      // Then: log(error) is emitted
      const errorLogs = events.filter((e) => e.type === 'log' && e.level === 'error');
      assert.strictEqual(errorLogs.length, 1, 'Should emit 1 error log');
      assert.strictEqual(errorLogs[0]?.message, 'error message');
    });

    // TC-CODEX-WIRE-N-04: child.on('error')
    test('TC-CODEX-WIRE-N-04: child.on error -> log(error) + completed(null)', () => {
      // Given: A provider with wireOutput
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const child = createMockChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);

      const events: { type: string; level?: string; message?: string; exitCode?: number | null }[] = [];
      const options = {
        taskId: 'wire-error-test',
        workspaceRoot: '/tmp',
        prompt: 'prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e: { type: string; level?: string; message?: string; exitCode?: number | null }) => events.push(e),
      };

      wireOutput(child, options as CodexCliProviderRunOptions);

      // When: child emits error
      child.emit('error', new Error('spawn ENOENT'));

      // Then: log(error) and completed(null) are emitted
      const errorLogs = events.filter((e) => e.type === 'log' && e.level === 'error');
      assert.ok(errorLogs.length >= 1, 'Should emit error log');
      assert.ok(errorLogs[0]?.message?.includes('ENOENT'), 'Error message should include ENOENT');

      const completedEvents = events.filter((e) => e.type === 'completed');
      assert.strictEqual(completedEvents.length, 1, 'Should emit 1 completed event');
      assert.strictEqual(completedEvents[0]?.exitCode, null, 'exitCode should be null');
    });

    // TC-CODEX-WIRE-N-05: close(code=0)
    test('TC-CODEX-WIRE-N-05: close(code=0) -> completed(0)', () => {
      // Given: A provider with wireOutput
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const child = createMockChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);

      const events: { type: string; exitCode?: number | null }[] = [];
      const options = {
        taskId: 'wire-close-0-test',
        workspaceRoot: '/tmp',
        prompt: 'prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e: { type: string; exitCode?: number | null }) => events.push(e),
      };

      wireOutput(child, options as CodexCliProviderRunOptions);

      // When: child emits close with code 0
      child.emit('close', 0);

      // Then: completed(0) is emitted
      const completedEvents = events.filter((e) => e.type === 'completed');
      assert.strictEqual(completedEvents.length, 1, 'Should emit 1 completed event');
      assert.strictEqual(completedEvents[0]?.exitCode, 0, 'exitCode should be 0');
    });

    // TC-CODEX-WIRE-N-06: close(code=1)
    test('TC-CODEX-WIRE-N-06: close(code=1) -> completed(1)', () => {
      // Given: A provider with wireOutput
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const child = createMockChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);

      const events: { type: string; exitCode?: number | null }[] = [];
      const options = {
        taskId: 'wire-close-1-test',
        workspaceRoot: '/tmp',
        prompt: 'prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e: { type: string; exitCode?: number | null }) => events.push(e),
      };

      wireOutput(child, options as CodexCliProviderRunOptions);

      // When: child emits close with code 1
      child.emit('close', 1);

      // Then: completed(1) is emitted
      const completedEvents = events.filter((e) => e.type === 'completed');
      assert.strictEqual(completedEvents.length, 1, 'Should emit 1 completed event');
      assert.strictEqual(completedEvents[0]?.exitCode, 1, 'exitCode should be 1');
    });

    // TC-CODEX-WIRE-B-01: stdout emits empty lines
    test('TC-CODEX-WIRE-B-01: stdout emits empty lines -> skipped', () => {
      // Given: A provider with wireOutput
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const child = createMockChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);

      const events: { type: string; level?: string; message?: string }[] = [];
      const options = {
        taskId: 'wire-empty-test',
        workspaceRoot: '/tmp',
        prompt: 'prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e: { type: string; level?: string; message?: string }) => events.push(e),
      };

      wireOutput(child, options as CodexCliProviderRunOptions);

      // When: stdout emits empty lines
      child.stdout.emit('data', Buffer.from('\n\n\n'));

      // Then: No log events are emitted
      const infoLogs = events.filter((e) => e.type === 'log' && e.level === 'info');
      assert.strictEqual(infoLogs.length, 0, 'Should not emit any info logs for empty lines');
    });

    // TC-CODEX-WIRE-B-02: close(code=null)
    test('TC-CODEX-WIRE-B-02: close(code=null) -> completed(null)', () => {
      // Given: A provider with wireOutput
      const config = {
        get: () => '',
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const child = createMockChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);
      const wireOutput = (provider as unknown as { wireOutput: WireOutput }).wireOutput.bind(provider);

      const events: { type: string; exitCode?: number | null }[] = [];
      const options = {
        taskId: 'wire-close-null-test',
        workspaceRoot: '/tmp',
        prompt: 'prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e: { type: string; exitCode?: number | null }) => events.push(e),
      };

      wireOutput(child, options as CodexCliProviderRunOptions);

      // When: child emits close with code null
      child.emit('close', null);

      // Then: completed(null) is emitted
      const completedEvents = events.filter((e) => e.type === 'completed');
      assert.strictEqual(completedEvents.length, 1, 'Should emit 1 completed event');
      assert.strictEqual(completedEvents[0]?.exitCode, null, 'exitCode should be null');
    });
  });

  suite('buildPromptWithCodexCommand (via run)', () => {
    // TC-CODEX-PROMPT-N-01: codexPromptCommand is empty string
    test('TC-CODEX-PROMPT-N-01: codexPromptCommand empty -> no injection, no warn log', () => {
      // Given: codexPromptCommand is empty
      const config = {
        get: (key: string) => {
          if (key === 'codexPromptCommand') return '';
          return '';
        },
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const child = createMockChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);

      const events: { type: string; level?: string; message?: string }[] = [];
      const options = {
        taskId: 'prompt-empty-test',
        workspaceRoot: '/tmp',
        prompt: 'original prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e: { type: string; level?: string; message?: string }) => events.push(e),
      };

      // When: run() is called
      provider.run(options as CodexCliProviderRunOptions);

      // Then: No injection log (info or warn about codex command)
      const injectionLogs = events.filter(
        (e) => e.type === 'log' && (e.message?.includes('コマンドプロンプト') ?? false)
      );
      assert.strictEqual(injectionLogs.length, 0, 'No injection logs should be emitted');
    });

    // TC-CODEX-PROMPT-E-01: codexPromptCommand set, file does not exist
    test('TC-CODEX-PROMPT-E-01: codexPromptCommand set, file missing -> warn log', () => {
      // Given: codexPromptCommand is set but file doesn't exist
      const config = {
        get: (key: string) => {
          if (key === 'codexPromptCommand') return 'nonexistent-command';
          return '';
        },
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const child = createMockChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);

      const events: { type: string; level?: string; message?: string }[] = [];
      const options = {
        taskId: 'prompt-missing-test',
        workspaceRoot: '/tmp',
        prompt: 'original prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e: { type: string; level?: string; message?: string }) => events.push(e),
      };

      // When: run() is called
      provider.run(options as CodexCliProviderRunOptions);

      // Then: Warn log about missing command prompt
      const warnLogs = events.filter(
        (e) => e.type === 'log' && e.level === 'warn' && (e.message?.includes('見つからない') ?? false)
      );
      assert.strictEqual(warnLogs.length, 1, 'Should emit warn log about missing file');
      assert.ok(warnLogs[0]?.message?.includes('nonexistent-command'), 'Warn should include command name');
    });

    // TC-CODEX-PROMPT-B-01: codexPromptCommand is whitespace only
    test('TC-CODEX-PROMPT-B-01: codexPromptCommand whitespace -> treated as empty', () => {
      // Given: codexPromptCommand is whitespace only
      const config = {
        get: (key: string) => {
          if (key === 'codexPromptCommand') return '   ';
          return '';
        },
      } as unknown as vscode.WorkspaceConfiguration;
      mutableWorkspace.getConfiguration = (() => config) as unknown as typeof vscode.workspace.getConfiguration;

      const child = createMockChild();
      const mockSpawn = (() => child) as unknown as typeof childProcess.spawn;
      const provider = new CodexCliProvider(mockSpawn);

      const events: { type: string; level?: string; message?: string }[] = [];
      const options = {
        taskId: 'prompt-whitespace-test',
        workspaceRoot: '/tmp',
        prompt: 'original prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: (e: { type: string; level?: string; message?: string }) => events.push(e),
      };

      // When: run() is called
      provider.run(options as CodexCliProviderRunOptions);

      // Then: No injection logs (treated as empty)
      const injectionLogs = events.filter(
        (e) => e.type === 'log' && (e.message?.includes('コマンドプロンプト') ?? false)
      );
      assert.strictEqual(injectionLogs.length, 0, 'No injection logs for whitespace-only command');
    });
  });
});
