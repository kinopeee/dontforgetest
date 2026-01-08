import * as assert from 'assert';
import { resolveProjectProfile, tsjsProfile, type ResolvedProfile } from '../../../core/projectProfile';
import { stubConfiguration } from '../testUtils/stubHelpers';

suite('ProjectProfile Test Suite', () => {
  const workspaceRoot = '/test/workspace';
  let restore: () => void;

  teardown(() => {
    if (restore) {
      restore();
    }
  });

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

  test('resolveProjectProfile: config=auto, no relevant files -> tsjsProfile (fallback source)', async () => {
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

  test('tsjsProfile.testFilePredicate', () => {
    // Given: テストファイル/非テストファイルの相対パスを用意する
    // When: testFilePredicate を評価する
    // Then: テストファイルは true、非テストファイルは false になる
    assert.strictEqual(tsjsProfile.testFilePredicate('src/test/foo.test.ts'), true);
    assert.strictEqual(tsjsProfile.testFilePredicate('src/test/bar.spec.ts'), true);
    assert.strictEqual(tsjsProfile.testFilePredicate('test/foo.js'), true);
    assert.strictEqual(tsjsProfile.testFilePredicate('src/utils/helper.ts'), false);
  });

  test('tsjsProfile.testLikePathPredicate', () => {
    // Given: テストライクパス/除外すべきパスの相対パスを用意する
    // When: testLikePathPredicate を評価する
    // Then: テストライクパスは true、node_modules 等は false になる
    assert.strictEqual(tsjsProfile.testLikePathPredicate('src/test/foo.test.ts'), true);
    assert.strictEqual(tsjsProfile.testLikePathPredicate('__tests__/foo.ts'), true);
    assert.strictEqual(tsjsProfile.testLikePathPredicate('node_modules/foo.test.ts'), false);
    assert.strictEqual(tsjsProfile.testLikePathPredicate('src/utils/helper.ts'), false);
  });
});
