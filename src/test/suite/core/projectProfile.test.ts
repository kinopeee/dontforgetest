import * as assert from 'assert';
import { resolveProjectProfile, tsjsProfile } from '../../../core/projectProfile';
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
    // Given: workspaceRoot='/test/workspace' and configuration 'dontforgetest.projectProfile'='tsjs'
    restore = stubConfiguration({
      'dontforgetest.projectProfile': 'tsjs',
    });
    // When: calling resolveProjectProfile(workspaceRoot)
    const result = await resolveProjectProfile(workspaceRoot);
    // Then: result.profile.id is 'tsjs' and result.source is 'config'
    assert.strictEqual(result.profile.id, 'tsjs');
    assert.strictEqual(result.source, 'config');
  });

  test('resolveProjectProfile: config=unknown -> tsjsProfile (fallback source)', async () => {
    // Given: workspaceRoot='/test/workspace' and configuration 'dontforgetest.projectProfile'='python' (unknown profile)
    restore = stubConfiguration({
      'dontforgetest.projectProfile': 'python', // unknown profile
    });
    // When: calling resolveProjectProfile(workspaceRoot)
    const result = await resolveProjectProfile(workspaceRoot);
    // Then: result.profile.id is 'tsjs' and result.source is 'fallback'
    assert.strictEqual(result.profile.id, 'tsjs');
    assert.strictEqual(result.source, 'fallback');
  });

  test('resolveProjectProfile: config=auto, package.json exists -> tsjsProfile (detected source)', async () => {
    // Given: workspaceRoot='/test/workspace', configuration 'dontforgetest.projectProfile'='auto', and tsjsProfile.detect override returning true
    const restoreConfig = stubConfiguration({ 'dontforgetest.projectProfile': 'auto' });
    const originalDetect = tsjsProfile.detect;
    tsjsProfile.detect = async () => true;
    restore = () => {
      tsjsProfile.detect = originalDetect;
      restoreConfig();
    };
    // When: calling resolveProjectProfile(workspaceRoot)
    const result = await resolveProjectProfile(workspaceRoot);
    // Then: result.profile.id is 'tsjs' and result.source is 'detected'
    assert.strictEqual(result.profile.id, 'tsjs');
    assert.strictEqual(result.source, 'detected');
  });

  test('resolveProjectProfile: config=auto, no relevant files -> tsjsProfile (fallback source)', async () => {
    // Given: workspaceRoot='/test/workspace', configuration 'dontforgetest.projectProfile'='auto', and tsjsProfile.detect override returning false
    const restoreConfig = stubConfiguration({ 'dontforgetest.projectProfile': 'auto' });
    const originalDetect = tsjsProfile.detect;
    tsjsProfile.detect = async () => false;
    restore = () => {
      tsjsProfile.detect = originalDetect;
      restoreConfig();
    };
    // When: calling resolveProjectProfile(workspaceRoot)
    const result = await resolveProjectProfile(workspaceRoot);
    // Then: result.profile.id is 'tsjs' and result.source is 'fallback' (tsjs is the default fallback)
    assert.strictEqual(result.profile.id, 'tsjs');
    assert.strictEqual(result.source, 'fallback'); // tsjs is the default fallback
  });

  test('tsjsProfile.testFilePredicate', () => {
    // Given: input path 'src/test/foo.test.ts'
    // When: calling tsjsProfile.testFilePredicate('src/test/foo.test.ts')
    // Then: returns true
    assert.strictEqual(tsjsProfile.testFilePredicate('src/test/foo.test.ts'), true);
    // Given: input path 'src/test/bar.spec.ts'
    // When: calling tsjsProfile.testFilePredicate('src/test/bar.spec.ts')
    // Then: returns true
    assert.strictEqual(tsjsProfile.testFilePredicate('src/test/bar.spec.ts'), true);
    // Given: input path 'test/foo.js'
    // When: calling tsjsProfile.testFilePredicate('test/foo.js')
    // Then: returns true
    assert.strictEqual(tsjsProfile.testFilePredicate('test/foo.js'), true);
    // Given: input path 'src/utils/helper.ts'
    // When: calling tsjsProfile.testFilePredicate('src/utils/helper.ts')
    // Then: returns false
    assert.strictEqual(tsjsProfile.testFilePredicate('src/utils/helper.ts'), false);
  });

  test('tsjsProfile.testLikePathPredicate', () => {
    // Given: input path 'src/test/foo.test.ts'
    // When: calling tsjsProfile.testLikePathPredicate('src/test/foo.test.ts')
    // Then: returns true
    assert.strictEqual(tsjsProfile.testLikePathPredicate('src/test/foo.test.ts'), true);
    // Given: input path '__tests__/foo.ts'
    // When: calling tsjsProfile.testLikePathPredicate('__tests__/foo.ts')
    // Then: returns true
    assert.strictEqual(tsjsProfile.testLikePathPredicate('__tests__/foo.ts'), true);
    // Given: input path 'node_modules/foo.test.ts'
    // When: calling tsjsProfile.testLikePathPredicate('node_modules/foo.test.ts')
    // Then: returns false
    assert.strictEqual(tsjsProfile.testLikePathPredicate('node_modules/foo.test.ts'), false);
    // Given: input path 'src/utils/helper.ts'
    // When: calling tsjsProfile.testLikePathPredicate('src/utils/helper.ts')
    // Then: returns false
    assert.strictEqual(tsjsProfile.testLikePathPredicate('src/utils/helper.ts'), false);
  });
});
