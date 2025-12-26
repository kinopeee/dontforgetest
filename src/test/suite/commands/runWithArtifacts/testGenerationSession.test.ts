import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TestGenerationSession } from '../../../../commands/runWithArtifacts/testGenerationSession';
import { type AgentProvider } from '../../../../providers/provider';

class MockProvider implements AgentProvider {
  readonly id = 'mock-provider';
  readonly displayName = 'Mock Provider';
  run() {
    return { taskId: 'mock', dispose: () => {} };
  }
}

function createSession(workspaceRoot: string): TestGenerationSession {
  return new TestGenerationSession({
    provider: new MockProvider(),
    workspaceRoot,
    cursorAgentCommand: 'cursor-agent',
    testStrategyPath: '',
    generationLabel: 'label',
    targetPaths: [],
    generationPrompt: '',
    model: undefined,
    generationTaskId: 'task-1',
  });
}

async function callLooksLike(session: TestGenerationSession, workspaceRoot: string, command: string): Promise<boolean> {
  const anySession = session as unknown as {
    looksLikeVsCodeLaunchingTestCommand: (root: string, testCommand: string) => Promise<boolean>;
  };
  return await anySession.looksLikeVsCodeLaunchingTestCommand(workspaceRoot, command);
}

suite('commands/runWithArtifacts/testGenerationSession.ts', () => {
  // TC-LL-N-01: out/test/runTest.js を含むコマンドは true
  test('TC-LL-N-01: out/test/runTest.js を含むコマンドは true を返す', async () => {
    // Given: 一時ワークスペースと session
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    const session = createSession(workspaceRoot);

    // When: out/test/runTest.js を含むコマンドを判定
    const result = await callLooksLike(session, workspaceRoot, 'node ./out/test/runTest.js');

    // Then: true が返る
    assert.strictEqual(result, true, 'out/test/runTest.js を含むコマンドは true になること');
  });

  // TC-LL-N-02: npm test で package.json の test が VS Code 実行系なら true
  test('TC-LL-N-02: npm test で @vscode/test-electron を含む場合は true を返す', async () => {
    // Given: package.json に VS Code 実行系の test script
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    const pkg = {
      scripts: {
        test: 'node ./node_modules/@vscode/test-electron/out/runTest.js',
      },
    };
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify(pkg), 'utf8');
    const session = createSession(workspaceRoot);

    // When: npm test を判定
    const result = await callLooksLike(session, workspaceRoot, 'npm test');

    // Then: true が返る
    assert.strictEqual(result, true, 'npm test で VS Code 実行系なら true になること');
  });

  // TC-LL-E-01: package.json が無い場合は false
  test('TC-LL-E-01: package.json が無い場合は false を返す', async () => {
    // Given: package.json が存在しないワークスペース
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    const session = createSession(workspaceRoot);

    // When: npm test を判定
    const result = await callLooksLike(session, workspaceRoot, 'npm test');

    // Then: false が返る
    assert.strictEqual(result, false, 'package.json が無い場合は false になること');
  });

  // TC-LL-B-01: 空文字コマンドは false
  test('TC-LL-B-01: 空文字コマンドは false を返す', async () => {
    // Given: 空のコマンド
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    const session = createSession(workspaceRoot);

    // When: 空文字を判定
    const result = await callLooksLike(session, workspaceRoot, '');

    // Then: false が返る
    assert.strictEqual(result, false, '空文字コマンドは false になること');
  });

  // TC-LL-B-02: npm test 以外のコマンドは false
  test('TC-LL-B-02: npm test 以外のコマンドは false を返す', async () => {
    // Given: npm test 以外のコマンド
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    const session = createSession(workspaceRoot);

    // When: npm run build を判定
    const result = await callLooksLike(session, workspaceRoot, 'npm run build');

    // Then: false が返る
    assert.strictEqual(result, false, 'npm test 以外のコマンドは false になること');
  });
});
