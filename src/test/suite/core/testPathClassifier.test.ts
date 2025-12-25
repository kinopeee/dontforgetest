import * as assert from 'assert';
import { isTestLikePath, filterTestLikePaths } from '../../../core/testPathClassifier';

suite('core/testPathClassifier.ts', () => {
  // TC-N-17: filterTestLikePaths called with paths containing test files
  test('TC-N-17: filterTestLikePaths returns only test-like paths, sorted and deduplicated', () => {
    // Given: Paths containing test files and non-test files
    const paths = [
      'src/foo.ts',
      'src/foo.test.ts',
      'src/bar.spec.ts',
      'tests/baz.ts',
      'src/test/qux.ts',
      'node_modules/test.ts',
      'docs/test.md',
    ];

    // When: filterTestLikePaths is called
    const result = filterTestLikePaths(paths);

    // Then: Only test-like paths returned, sorted, deduplicated
    assert.ok(result.includes('src/foo.test.ts'), 'Test file pattern should be included');
    assert.ok(result.includes('src/bar.spec.ts'), 'Spec file pattern should be included');
    assert.ok(result.includes('tests/baz.ts'), 'Test directory pattern should be included');
    assert.ok(result.includes('src/test/qux.ts'), 'Test directory pattern should be included');
    assert.ok(!result.includes('src/foo.ts'), 'Non-test files should be excluded');
    assert.ok(!result.includes('node_modules/test.ts'), 'node_modules should be excluded');
    assert.ok(!result.includes('docs/test.md'), 'docs should be excluded');
    // Check sorted
    const sorted = [...result].sort((a, b) => a.localeCompare(b));
    assert.deepStrictEqual(result, sorted, 'Result should be sorted');
  });

  // TC-B-18: filterTestLikePaths called with empty paths array
  test('TC-B-18: filterTestLikePaths returns empty array for empty input', () => {
    // Given: Empty paths array
    const paths: string[] = [];

    // When: filterTestLikePaths is called
    const result = filterTestLikePaths(paths);

    // Then: Empty array returned
    assert.deepStrictEqual(result, [], 'Empty input should return empty array');
  });

  // TC-B-19: filterTestLikePaths called with paths containing duplicates
  test('TC-B-19: filterTestLikePaths removes duplicate paths', () => {
    // Given: Paths containing duplicates
    const paths = ['src/foo.test.ts', 'src/bar.test.ts', 'src/foo.test.ts', 'src/bar.test.ts'];

    // When: filterTestLikePaths is called
    const result = filterTestLikePaths(paths);

    // Then: Deduplicated paths returned, sorted
    assert.strictEqual(result.length, 2, 'Duplicates should be removed');
    assert.ok(result.includes('src/bar.test.ts'), 'All unique paths should be included');
    assert.ok(result.includes('src/foo.test.ts'), 'All unique paths should be included');
  });

  // TC-B-20: isTestLikePath called with path='node_modules/test.ts'
  test('TC-B-20: isTestLikePath returns false for node_modules paths', () => {
    // Given: path='node_modules/test.ts'
    const path = 'node_modules/test.ts';

    // When: isTestLikePath is called
    const result = isTestLikePath(path);

    // Then: Returns false (excluded)
    assert.strictEqual(result, false, 'node_modules paths should be excluded');
  });

  // TC-B-21: isTestLikePath called with path='docs/test.md'
  test('TC-B-21: isTestLikePath returns false for docs paths', () => {
    // Given: path='docs/test.md'
    const path = 'docs/test.md';

    // When: isTestLikePath is called
    const result = isTestLikePath(path);

    // Then: Returns false (excluded)
    assert.strictEqual(result, false, 'docs paths should be excluded');
  });

  // TC-B-22: isTestLikePath called with path='src/foo.test.ts'
  test('TC-B-22: isTestLikePath returns true for test file pattern', () => {
    // Given: path='src/foo.test.ts'
    const path = 'src/foo.test.ts';

    // When: isTestLikePath is called
    const result = isTestLikePath(path);

    // Then: Returns true (test file pattern)
    assert.strictEqual(result, true, 'Test file pattern should be matched');
  });

  // TC-B-23: isTestLikePath called with path='tests/foo.ts'
  test('TC-B-23: isTestLikePath returns true for test directory pattern', () => {
    // Given: path='tests/foo.ts'
    const path = 'tests/foo.ts';

    // When: isTestLikePath is called
    const result = isTestLikePath(path);

    // Then: Returns true (test directory pattern)
    assert.strictEqual(result, true, 'Test directory pattern should be matched');
  });
});
