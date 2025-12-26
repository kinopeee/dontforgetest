import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { __test__ } from '../../../../commands/runWithArtifacts/testGenerationSession';

suite('commands/runWithArtifacts/testGenerationSession.ts', () => {
  const workspaceRoots: string[] = [];
  const readFileUtf8 = (filePath: string) => fs.promises.readFile(filePath, 'utf8');

  teardown(async () => {
    for (const root of workspaceRoots) {
      try {
        await fs.promises.rm(root, { recursive: true, force: true });
      } catch {
        // クリーンアップエラーは無視
      }
    }
    workspaceRoots.length = 0;
  });

  // TC-LL-N-01: out/test/runTest.js を含むコマンドは true
  test('TC-LL-N-01: out/test/runTest.js を含むコマンドは true を返す', async () => {
    // Given: 一時ワークスペースと session
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    workspaceRoots.push(workspaceRoot);

    // When: out/test/runTest.js を含むコマンドを判定
    const result = await __test__.looksLikeVsCodeLaunchingTestCommand({
      workspaceRoot,
      testCommand: 'node ./out/test/runTest.js',
      readFileUtf8,
    });

    // Then: true が返る
    assert.strictEqual(result, true, 'out/test/runTest.js を含むコマンドは true になること');
  });

  // TC-LL-N-02: npm test で package.json の test が VS Code 実行系なら true
  test('TC-LL-N-02: npm test で @vscode/test-electron を含む場合は true を返す', async () => {
    // Given: package.json に VS Code 実行系の test script
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    workspaceRoots.push(workspaceRoot);
    const pkg = {
      scripts: {
        test: 'node ./node_modules/@vscode/test-electron/out/runTest.js',
      },
    };
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify(pkg), 'utf8');

    // When: npm test を判定
    const result = await __test__.looksLikeVsCodeLaunchingTestCommand({
      workspaceRoot,
      testCommand: 'npm test',
      readFileUtf8,
    });

    // Then: true が返る
    assert.strictEqual(result, true, 'npm test で VS Code 実行系なら true になること');
  });

  // TC-LL-E-01: package.json が無い場合は false
  test('TC-LL-E-01: package.json が無い場合は false を返す', async () => {
    // Given: package.json が存在しないワークスペース
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    workspaceRoots.push(workspaceRoot);

    // When: npm test を判定
    const result = await __test__.looksLikeVsCodeLaunchingTestCommand({
      workspaceRoot,
      testCommand: 'npm test',
      readFileUtf8,
    });

    // Then: false が返る
    assert.strictEqual(result, false, 'package.json が無い場合は false になること');
  });

  // TC-LL-B-01: 空文字コマンドは false
  test('TC-LL-B-01: 空文字コマンドは false を返す', async () => {
    // Given: 空のコマンド
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    workspaceRoots.push(workspaceRoot);

    // When: 空文字を判定
    const result = await __test__.looksLikeVsCodeLaunchingTestCommand({
      workspaceRoot,
      testCommand: '',
      readFileUtf8,
    });

    // Then: false が返る
    assert.strictEqual(result, false, '空文字コマンドは false になること');
  });

  // TC-LL-B-02: npm test 以外のコマンドは false
  test('TC-LL-B-02: npm test 以外のコマンドは false を返す', async () => {
    // Given: npm test 以外のコマンド
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    workspaceRoots.push(workspaceRoot);

    // When: npm run build を判定
    const result = await __test__.looksLikeVsCodeLaunchingTestCommand({
      workspaceRoot,
      testCommand: 'npm run build',
      readFileUtf8,
    });

    // Then: false が返る
    assert.strictEqual(result, false, 'npm test 以外のコマンドは false になること');
  });
});
