import * as assert from 'assert';
import * as vscode from 'vscode';
import { resolveProjectProfile, tsjsProfile, type ResolvedProfile, __test__ as projectProfileTest } from '../../../core/projectProfile';
import { stubConfiguration } from '../testUtils/stubHelpers';

suite('ProjectProfile Test Suite', () => {
  const workspaceRoot = '/test/workspace';
  let restore: (() => void) | undefined;

  const endsWithFileName = (fsPath: string, fileName: string): boolean => {
    return fsPath.endsWith(fileName) || fsPath.endsWith(`/${fileName}`) || fsPath.endsWith(`\\${fileName}`);
  };

  const createWorkspaceFsStub = (options: {
    existsFileName: string;
    fileContent?: string;
  }): Pick<vscode.FileSystem, 'stat' | 'readFile'> => {
    return {
      stat: async (uri: vscode.Uri): Promise<vscode.FileStat> => {
        if (endsWithFileName(uri.fsPath, options.existsFileName)) {
          return {
            type: vscode.FileType.File,
            ctime: 0,
            mtime: 0,
            size: 0,
          };
        }
        throw vscode.FileSystemError.FileNotFound(uri);
      },
      readFile: async (uri: vscode.Uri): Promise<Uint8Array> => {
        if (options.fileContent !== undefined && endsWithFileName(uri.fsPath, options.existsFileName)) {
          return new TextEncoder().encode(options.fileContent);
        }
        throw vscode.FileSystemError.FileNotFound(uri);
      },
    };
  };

  teardown(() => {
    if (restore) {
      const restoreOnce = restore;
      restore = undefined;
      restoreOnce();
    }
  });

  // Case ID: PP-N-01
  test('resolveProjectProfile: config=tsjs -> tsjsProfile (config source)', async () => {
    // Given: 設定で dontforgetest.projectProfile='tsjs' が指定されている
    restore = stubConfiguration({
      'dontforgetest.projectProfile': 'tsjs',
    });
    // When: resolveProjectProfile(workspaceRoot) を呼び出す
    const result: ResolvedProfile = await resolveProjectProfile(workspaceRoot);
    // Then: tsjsProfile が返され、source は 'config' になる
    assert.strictEqual(result.profile.id, 'tsjs');
    assert.strictEqual(result.source, 'config');
  });

  // Case ID: PP-E-01
  test('resolveProjectProfile: config=unknown -> tsjsProfile (fallback source)', async () => {
    // Given: 設定で dontforgetest.projectProfile に未知の値 'python' が指定されている
    restore = stubConfiguration({
      'dontforgetest.projectProfile': 'python', // unknown profile
    });
    // When: resolveProjectProfile(workspaceRoot) を呼び出す
    const result: ResolvedProfile = await resolveProjectProfile(workspaceRoot);
    // Then: tsjsProfile にフォールバックし、source は 'fallback' になる
    assert.strictEqual(result.profile.id, 'tsjs');
    assert.strictEqual(result.source, 'fallback');
  });

  // Case ID: PP-N-02
  test('resolveProjectProfile: config=auto, package.json exists -> tsjsProfile (detected source)', async () => {
    // Given: 設定 'auto' かつ tsjsProfile.detect が true を返す（検出成功）ようにスタブする
    const restoreConfig = stubConfiguration({ 'dontforgetest.projectProfile': 'auto' });
    const originalDetect: typeof tsjsProfile.detect = tsjsProfile.detect;
    tsjsProfile.detect = async () => true;
    restore = () => {
      tsjsProfile.detect = originalDetect;
      restoreConfig();
    };
    // When: resolveProjectProfile(workspaceRoot) を呼び出す
    const result: ResolvedProfile = await resolveProjectProfile(workspaceRoot);
    // Then: tsjsProfile が検出され、source は 'detected' になる
    assert.strictEqual(result.profile.id, 'tsjs');
    assert.strictEqual(result.source, 'detected');
  });

  // Case ID: PP-E-02
  test('resolveProjectProfile: config=auto, no relevant files (stubbed detect) -> tsjsProfile (fallback source)', async () => {
    // Given: 設定 'auto' かつ tsjsProfile.detect が false を返す（検出失敗）ようにスタブする
    const restoreConfig = stubConfiguration({ 'dontforgetest.projectProfile': 'auto' });
    const originalDetect: typeof tsjsProfile.detect = tsjsProfile.detect;
    tsjsProfile.detect = async () => false;
    restore = () => {
      tsjsProfile.detect = originalDetect;
      restoreConfig();
    };
    // When: resolveProjectProfile(workspaceRoot) を呼び出す
    const result: ResolvedProfile = await resolveProjectProfile(workspaceRoot);
    // Then: tsjsProfile にフォールバックし、source は 'fallback' になる（tsjs はデフォルト）
    assert.strictEqual(result.profile.id, 'tsjs');
    assert.strictEqual(result.source, 'fallback'); // tsjs is the default fallback
  });

  // Case IDs: PP-N-03, PP-N-04, PP-N-05, PP-E-03
  test('tsjsProfile.testFilePredicate', () => {
    // Given: テストファイル/非テストファイルの相対パスを用意する
    // When: testFilePredicate を評価する
    // Then: テストファイルは true、非テストファイルは false になる
    assert.strictEqual(tsjsProfile.testFilePredicate('src/test/foo.test.ts'), true);
    assert.strictEqual(tsjsProfile.testFilePredicate('src/test/bar.spec.ts'), true);
    assert.strictEqual(tsjsProfile.testFilePredicate('test/foo.js'), true);
    assert.strictEqual(tsjsProfile.testFilePredicate('src/utils/helper.ts'), false);
  });

  // Case IDs: PP-N-06, PP-N-07, PP-E-04, PP-E-05
  test('tsjsProfile.testLikePathPredicate', () => {
    // Given: テストライクパス/除外すべきパスの相対パスを用意する
    // When: testLikePathPredicate を評価する
    // Then: テストライクパスは true、node_modules 等は false になる
    assert.strictEqual(tsjsProfile.testLikePathPredicate('src/test/foo.test.ts'), true);
    assert.strictEqual(tsjsProfile.testLikePathPredicate('__tests__/foo.ts'), true);
    assert.strictEqual(tsjsProfile.testLikePathPredicate('node_modules/foo.test.ts'), false);
    assert.strictEqual(tsjsProfile.testLikePathPredicate('src/utils/helper.ts'), false);
  });

  // Case ID: PP-N-08
  test('tsjsProfile.detect: deno.json exists -> true', async () => {
    // Given: deno.json が存在する
    const restoreConfig = stubConfiguration({ 'dontforgetest.projectProfile': 'auto' });
    projectProfileTest.setWorkspaceFsOverrideForTest(createWorkspaceFsStub({ existsFileName: 'deno.json' }));
    restore = () => {
      projectProfileTest.setWorkspaceFsOverrideForTest(undefined);
      restoreConfig();
    };
    // When: tsjsProfile.detect(workspaceRoot) を呼び出す
    const result = await tsjsProfile.detect(workspaceRoot);
    // Then: true が返される
    assert.strictEqual(result, true);
  });

  // Case ID: PP-N-09
  test('tsjsProfile.detect: deno.jsonc exists -> true', async () => {
    // Given: deno.jsonc が存在する
    const restoreConfig = stubConfiguration({ 'dontforgetest.projectProfile': 'auto' });
    projectProfileTest.setWorkspaceFsOverrideForTest(createWorkspaceFsStub({ existsFileName: 'deno.jsonc' }));
    restore = () => {
      projectProfileTest.setWorkspaceFsOverrideForTest(undefined);
      restoreConfig();
    };
    // When: tsjsProfile.detect(workspaceRoot) を呼び出す
    const result = await tsjsProfile.detect(workspaceRoot);
    // Then: true が返される
    assert.strictEqual(result, true);
  });

  // Case ID: PP-N-10
  test('tsjsProfile.detect: tsconfig.json exists -> true', async () => {
    // Given: tsconfig.json が存在する
    const restoreConfig = stubConfiguration({ 'dontforgetest.projectProfile': 'auto' });
    projectProfileTest.setWorkspaceFsOverrideForTest(createWorkspaceFsStub({ existsFileName: 'tsconfig.json' }));
    restore = () => {
      projectProfileTest.setWorkspaceFsOverrideForTest(undefined);
      restoreConfig();
    };
    // When: tsjsProfile.detect(workspaceRoot) を呼び出す
    const result = await tsjsProfile.detect(workspaceRoot);
    // Then: true が返される
    assert.strictEqual(result, true);
  });

  // Case ID: PP-N-11
  test('tsjsProfile.detect: jsconfig.json exists -> true', async () => {
    // Given: jsconfig.json が存在する
    const restoreConfig = stubConfiguration({ 'dontforgetest.projectProfile': 'auto' });
    projectProfileTest.setWorkspaceFsOverrideForTest(createWorkspaceFsStub({ existsFileName: 'jsconfig.json' }));
    restore = () => {
      projectProfileTest.setWorkspaceFsOverrideForTest(undefined);
      restoreConfig();
    };
    // When: tsjsProfile.detect(workspaceRoot) を呼び出す
    const result = await tsjsProfile.detect(workspaceRoot);
    // Then: true が返される
    assert.strictEqual(result, true);
  });

  // Case ID: PP-N-12
  test('tsjsProfile.detect: package.json with TS/JS signals -> true', async () => {
    // Given: package.json が存在し、devDependencies.typescript が含まれている
    const restoreConfig = stubConfiguration({ 'dontforgetest.projectProfile': 'auto' });
    const packageJsonContent = JSON.stringify({
      devDependencies: {
        typescript: '^5.0.0',
      },
    });
    projectProfileTest.setWorkspaceFsOverrideForTest(
      createWorkspaceFsStub({ existsFileName: 'package.json', fileContent: packageJsonContent }),
    );
    restore = () => {
      projectProfileTest.setWorkspaceFsOverrideForTest(undefined);
      restoreConfig();
    };
    // When: tsjsProfile.detect(workspaceRoot) を呼び出す
    const result = await tsjsProfile.detect(workspaceRoot);
    // Then: true が返される
    assert.strictEqual(result, true);
  });

  // Case ID: PP-E-06
  test('tsjsProfile.detect: package.json without TS/JS signals -> false', async () => {
    // Given: package.json が存在するが、TS/JS シグナルが含まれていない
    const restoreConfig = stubConfiguration({ 'dontforgetest.projectProfile': 'auto' });
    const packageJsonContent = JSON.stringify({
      name: 'my-package',
      version: '1.0.0',
    });
    projectProfileTest.setWorkspaceFsOverrideForTest(
      createWorkspaceFsStub({ existsFileName: 'package.json', fileContent: packageJsonContent }),
    );
    restore = () => {
      projectProfileTest.setWorkspaceFsOverrideForTest(undefined);
      restoreConfig();
    };
    // When: tsjsProfile.detect(workspaceRoot) を呼び出す
    const result = await tsjsProfile.detect(workspaceRoot);
    // Then: false が返される
    assert.strictEqual(result, false);
  });

  // Case ID: PP-E-07
  test('tsjsProfile.detect: package.json with invalid JSON -> false', async () => {
    // Given: package.json が存在するが、JSON が壊れている
    const restoreConfig = stubConfiguration({ 'dontforgetest.projectProfile': 'auto' });
    projectProfileTest.setWorkspaceFsOverrideForTest(
      createWorkspaceFsStub({ existsFileName: 'package.json', fileContent: '{ invalid json }' }),
    );
    restore = () => {
      projectProfileTest.setWorkspaceFsOverrideForTest(undefined);
      restoreConfig();
    };
    // When: tsjsProfile.detect(workspaceRoot) を呼び出す
    const result = await tsjsProfile.detect(workspaceRoot);
    // Then: false が返される（JSON パースエラーを安全に処理）
    assert.strictEqual(result, false);
  });

  // Case ID: PP-E-09
  test('resolveProjectProfile: config=auto, no relevant files (real detect) -> tsjsProfile (fallback source)', async () => {
    // Given: 設定 'auto' かつ実際のファイルシステムに TS/JS シグナルが存在しない
    const restoreConfig = stubConfiguration({ 'dontforgetest.projectProfile': 'auto' });
    projectProfileTest.setWorkspaceFsOverrideForTest({
      stat: async (uri: vscode.Uri): Promise<vscode.FileStat> => {
        throw vscode.FileSystemError.FileNotFound(uri);
      },
      readFile: async (uri: vscode.Uri): Promise<Uint8Array> => {
        throw vscode.FileSystemError.FileNotFound(uri);
      },
    });
    restore = () => {
      projectProfileTest.setWorkspaceFsOverrideForTest(undefined);
      restoreConfig();
    };
    // When: resolveProjectProfile(workspaceRoot) を呼び出す
    const result: ResolvedProfile = await resolveProjectProfile(workspaceRoot);
    // Then: tsjsProfile にフォールバックし、source は 'fallback' になる（tsjs はデフォルト）
    assert.strictEqual(result.profile.id, 'tsjs');
    assert.strictEqual(result.source, 'fallback'); // tsjs is the default fallback
  });
});
