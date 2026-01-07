import * as assert from 'assert';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import * as childProcess from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import * as vscode from 'vscode';
import { CodexCliProvider } from '../../../providers/codexCliProvider';

type CodexCliProviderPrivate = {
  spawnCodex: (options: SpawnCodexOptions, prompt: string) => ChildProcessWithoutNullStreams;
};

type SpawnCodexOptions = {
  agentCommand?: string;
  model?: string;
};

type SpawnCapture = {
  command: string;
  args: string[];
  stdinData: string[];
};

function createMockChild(capture: SpawnCapture): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as unknown as ChildProcessWithoutNullStreams;
  const stdin = new PassThrough();
  stdin.on('data', (chunk) => {
    capture.stdinData.push(chunk.toString());
  });
  child.stdin = stdin;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
  return child;
}

suite('providers/codexCliProvider.reasoningEffort', () => {
  // vscode.workspace.getConfiguration をテスト中だけ差し替えるため、参照を書き換え可能な形で保持する
  const mutableWorkspace = vscode.workspace as unknown as {
    getConfiguration: typeof vscode.workspace.getConfiguration;
  };
  // テスト終了後に必ず元へ戻すため、元の関数を退避しておく
  const originalGetConfiguration = mutableWorkspace.getConfiguration;

  teardown(() => {
    try {
      mutableWorkspace.getConfiguration = originalGetConfiguration;
    } catch {
      // teardown エラーを無視（例: getConfiguration が読み取り専用の場合）
    }
  });

  // TC-N-03
  test('TC-N-03: dontforgetest.codexReasoningEffort is "high", spawn args include -c model_reasoning_effort="high"', async () => {
    // Given: reasoning effort is configured to 'high' and spawn is stubbed
    const capture: SpawnCapture = { command: '', args: [], stdinData: [] };
    const mockSpawn = ((...spawnArgs: Parameters<typeof childProcess.spawn>) => {
      const [command, args] = spawnArgs;
      capture.command = command;
      capture.args = Array.isArray(args) ? [...args] : [];
      return createMockChild(capture);
    }) as typeof childProcess.spawn;
    mutableWorkspace.getConfiguration = () =>
      ({
        get: () => 'high',
      }) as unknown as vscode.WorkspaceConfiguration;
    const provider = new CodexCliProvider(mockSpawn) as unknown as CodexCliProviderPrivate;

    // When: spawning codex with a prompt
    provider.spawnCodex({ model: 'test-model' }, 'test prompt');
    await new Promise((resolve) => setImmediate(resolve));

    // Then: args include reasoning effort override and prompt is sent to stdin
    assert.strictEqual(capture.command, 'codex');
    assert.ok(capture.args.includes('-c'), 'Should include -c flag');
    assert.ok(capture.args.includes('model_reasoning_effort="high"'), 'Should include model_reasoning_effort="high"');
    assert.strictEqual(capture.stdinData.join(''), 'test prompt\n');
  });

  // TC-B-02
  test('TC-B-02: dontforgetest.codexReasoningEffort is empty, -c flag is not added', async () => {
    // Given: reasoning effort is empty string
    const capture: SpawnCapture = { command: '', args: [], stdinData: [] };
    const mockSpawn = ((...spawnArgs: Parameters<typeof childProcess.spawn>) => {
      const [command, args] = spawnArgs;
      capture.command = command;
      capture.args = Array.isArray(args) ? [...args] : [];
      return createMockChild(capture);
    }) as typeof childProcess.spawn;
    mutableWorkspace.getConfiguration = () =>
      ({
        get: () => '',
      }) as unknown as vscode.WorkspaceConfiguration;
    const provider = new CodexCliProvider(mockSpawn) as unknown as CodexCliProviderPrivate;

    // When: spawning codex with a prompt
    provider.spawnCodex({ model: 'test-model' }, 'test prompt');
    await new Promise((resolve) => setImmediate(resolve));

    // Then: args do not include -c
    assert.strictEqual(capture.command, 'codex');
    assert.ok(!capture.args.includes('-c'), 'Should NOT include -c flag');
  });

  test('TC-B-02 (whitespace): dontforgetest.codexReasoningEffort is whitespace, -c flag is not added', async () => {
    // Given: reasoning effort is whitespace-only
    const capture: SpawnCapture = { command: '', args: [], stdinData: [] };
    const mockSpawn = ((...spawnArgs: Parameters<typeof childProcess.spawn>) => {
      const [command, args] = spawnArgs;
      capture.command = command;
      capture.args = Array.isArray(args) ? [...args] : [];
      return createMockChild(capture);
    }) as typeof childProcess.spawn;
    mutableWorkspace.getConfiguration = () =>
      ({
        get: () => '   ',
      }) as unknown as vscode.WorkspaceConfiguration;
    const provider = new CodexCliProvider(mockSpawn) as unknown as CodexCliProviderPrivate;

    // When: spawning codex
    provider.spawnCodex({ model: 'test-model' }, 'prompt');
    await new Promise((resolve) => setImmediate(resolve));

    // Then: args do not include -c
    assert.ok(!capture.args.includes('-c'));
  });
});
