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
    restore = stubConfiguration({
      'dontforgetest.projectProfile': 'tsjs',
    });

    const result = await resolveProjectProfile(workspaceRoot);
    assert.strictEqual(result.profile.id, 'tsjs');
    assert.strictEqual(result.source, 'config');
  });

  test('resolveProjectProfile: config=unknown -> tsjsProfile (fallback source)', async () => {
    restore = stubConfiguration({
      'dontforgetest.projectProfile': 'python', // unknown profile
    });

    const result = await resolveProjectProfile(workspaceRoot);
    assert.strictEqual(result.profile.id, 'tsjs');
    assert.strictEqual(result.source, 'fallback');
  });

  test('resolveProjectProfile: config=auto, package.json exists -> tsjsProfile (detected source)', async () => {
    const restoreConfig = stubConfiguration({ 'dontforgetest.projectProfile': 'auto' });
    const originalDetect = tsjsProfile.detect;
    tsjsProfile.detect = async () => true;
    restore = () => {
      tsjsProfile.detect = originalDetect;
      restoreConfig();
    };

    const result = await resolveProjectProfile(workspaceRoot);
    assert.strictEqual(result.profile.id, 'tsjs');
    assert.strictEqual(result.source, 'detected');
  });

  test('resolveProjectProfile: config=auto, no relevant files -> tsjsProfile (fallback source)', async () => {
    const restoreConfig = stubConfiguration({ 'dontforgetest.projectProfile': 'auto' });
    const originalDetect = tsjsProfile.detect;
    tsjsProfile.detect = async () => false;
    restore = () => {
      tsjsProfile.detect = originalDetect;
      restoreConfig();
    };

    const result = await resolveProjectProfile(workspaceRoot);
    assert.strictEqual(result.profile.id, 'tsjs');
    assert.strictEqual(result.source, 'fallback'); // tsjs is the default fallback
  });

  test('tsjsProfile.testFilePredicate', () => {
    assert.strictEqual(tsjsProfile.testFilePredicate('src/test/foo.test.ts'), true);
    assert.strictEqual(tsjsProfile.testFilePredicate('src/test/bar.spec.ts'), true);
    assert.strictEqual(tsjsProfile.testFilePredicate('test/foo.js'), true);
    assert.strictEqual(tsjsProfile.testFilePredicate('src/utils/helper.ts'), false);
  });

  test('tsjsProfile.testLikePathPredicate', () => {
    assert.strictEqual(tsjsProfile.testLikePathPredicate('src/test/foo.test.ts'), true);
    assert.strictEqual(tsjsProfile.testLikePathPredicate('__tests__/foo.ts'), true);
    assert.strictEqual(tsjsProfile.testLikePathPredicate('node_modules/foo.test.ts'), false);
    assert.strictEqual(tsjsProfile.testLikePathPredicate('src/utils/helper.ts'), false);
  });
});
