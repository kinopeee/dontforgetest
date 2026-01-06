import * as assert from 'assert';
import ignore from 'ignore';

/**
 * `.gitignore` / `.vscodeignore` のパターンを確認するテスト。
 *
 * VSIX 生成時に `.npm-cache/` が同梱されないよう、ignore パターンの意図を単体テストで固定する。
 */
suite('test/ignorePatterns.test.ts', () => {
  // `.gitignore` / `.vscodeignore` から抜粋したパターン
  const gitignorePattern = '.npm-cache/';
  const vscodeignorePattern = '.npm-cache/**';

  suite('.gitignore patterns', () => {
    // TC-N-01: `.npm-cache/` 配下のファイルが無視される（正常系）
    test('TC-N-01: should ignore files inside .npm-cache/ directory', () => {
      // Given: `.npm-cache/` パターンを持つ ignore インスタンス
      const ig = ignore().add(gitignorePattern);

      // When: `.npm-cache/` 配下のファイルが無視対象か判定する
      const isIgnored = ig.ignores('.npm-cache/package-lock.json');

      // Then: 無視される
      assert.strictEqual(isIgnored, true, '.npm-cache/package-lock.json should be ignored');
    });

    // TC-N-03: 深いネスト配下のファイルも無視される（正常系）
    test('TC-N-03: should ignore deeply nested files inside .npm-cache/', () => {
      // Given: `.npm-cache/` パターンを持つ ignore インスタンス
      const ig = ignore().add(gitignorePattern);

      // When: 深いネスト配下のファイルが無視対象か判定する
      const isIgnored = ig.ignores('.npm-cache/nested/deep/file.txt');

      // Then: 無視される
      assert.strictEqual(isIgnored, true, '.npm-cache/nested/deep/file.txt should be ignored');
    });

    // TC-E-01: `.npm-cache` が「ファイル」の場合は無視されない（末尾スラッシュはディレクトリのみ）
    test('TC-E-01: should NOT ignore .npm-cache file (trailing slash matches directories only)', () => {
      // Given: `.npm-cache/`（末尾スラッシュ）パターンを持つ ignore インスタンス
      const ig = ignore().add(gitignorePattern);

      // When: `.npm-cache`（ディレクトリではない想定）が無視対象か判定する
      const isIgnored = ig.ignores('.npm-cache');

      // Then: 無視されない
      assert.strictEqual(isIgnored, false, '.npm-cache file should NOT be ignored by .npm-cache/ pattern');
    });

    // TC-E-02: 先頭ドット無しの `npm-cache/` は無視されない
    test('TC-E-02: should NOT ignore npm-cache/ directory (no leading dot)', () => {
      // Given: `.npm-cache/` パターンを持つ ignore インスタンス
      const ig = ignore().add(gitignorePattern);

      // When: `npm-cache/`（先頭ドット無し）が無視対象か判定する
      const isIgnored = ig.ignores('npm-cache/file.txt');

      // Then: 無視されない
      assert.strictEqual(isIgnored, false, 'npm-cache/file.txt should NOT be ignored');
    });

    // TC-E-03: 似た名前の `.npm-cache-backup/` は無視されない
    test('TC-E-03: should NOT ignore .npm-cache-backup/ directory', () => {
      // Given: `.npm-cache/` パターンを持つ ignore インスタンス
      const ig = ignore().add(gitignorePattern);

      // When: `.npm-cache-backup/` が無視対象か判定する
      const isIgnored = ig.ignores('.npm-cache-backup/file.txt');

      // Then: 無視されない
      assert.strictEqual(isIgnored, false, '.npm-cache-backup/file.txt should NOT be ignored');
    });

    // TC-E-04: サブディレクトリ配下の `.npm-cache/` も無視される
    test('TC-E-04: should ignore .npm-cache/ in subdirectories', () => {
      // Given: `.npm-cache/` パターンを持つ ignore インスタンス
      const ig = ignore().add(gitignorePattern);

      // When: `src/.npm-cache/` 配下のファイルが無視対象か判定する
      const isIgnored = ig.ignores('src/.npm-cache/file.txt');

      // Then: 無視される
      assert.strictEqual(isIgnored, true, 'src/.npm-cache/file.txt should be ignored');
    });

    // TC-B-01: 空ディレクトリのパス表現でも無視判定ができる（境界値）
    test('TC-B-01: should handle empty .npm-cache/ directory (Git does not track empty dirs)', () => {
      // Given: `.npm-cache/` パターンを持つ ignore インスタンス
      const ig = ignore().add(gitignorePattern);

      // When: ディレクトリ自体が無視対象か判定する
      // Note: Git は空ディレクトリを追跡しないため、パターンの妥当性確認として扱う
      const isDirectoryIgnored = ig.ignores('.npm-cache/');

      // Then: 無視される
      assert.strictEqual(isDirectoryIgnored, true, '.npm-cache/ directory should be ignored');
    });

    // TC-B-02: `.npm-cache/` が存在しなくてもパターンは有効（境界値）
    test('TC-B-02: pattern should be valid even if .npm-cache/ does not exist', () => {
      // Given: `.npm-cache/` パターンを持つ ignore インスタンス
      const ig = ignore().add(gitignorePattern);

      // When/Then: 実ファイルシステムの有無に依存せず、例外なく判定できる
      assert.doesNotThrow(() => {
        ig.ignores('.npm-cache/hypothetical-file.txt');
      }, 'Pattern should be valid regardless of directory existence');
    });

    // TC-B-03: 1ファイルだけでも無視される（境界値）
    test('TC-B-03: should ignore single file in .npm-cache/', () => {
      // Given: `.npm-cache/` パターンを持つ ignore インスタンス
      const ig = ignore().add(gitignorePattern);

      // When: 1ファイルが無視対象か判定する
      const isIgnored = ig.ignores('.npm-cache/single-file.txt');

      // Then: 無視される
      assert.strictEqual(isIgnored, true, 'Single file in .npm-cache/ should be ignored');
    });

    // TC-B-04: 多数ファイルでも無視判定できる（境界値/簡易負荷）
    test('TC-B-04: should ignore all files in .npm-cache/ with many files', () => {
      // Given: `.npm-cache/` パターンを持つ ignore インスタンス
      const ig = ignore().add(gitignorePattern);

      // When: 多数ファイルを想定して一括で無視判定する
      const filePaths = Array.from({ length: 1000 }, (_, i) => `.npm-cache/file-${i}.txt`);
      const allIgnored = filePaths.every((p) => ig.ignores(p));

      // Then: すべて無視される
      assert.strictEqual(allIgnored, true, 'All 1000 files in .npm-cache/ should be ignored');
    });
  });

  suite('.vscodeignore patterns', () => {
    // TC-N-02: VSIX から `.npm-cache/` 配下が除外される（正常系）
    test('TC-N-02: should exclude .npm-cache/ contents from .vsix package', () => {
      // Given: `.npm-cache/**` パターンを持つ ignore インスタンス
      const ig = ignore().add(vscodeignorePattern);

      // When: `.npm-cache/` 配下が除外対象か判定する
      const isExcluded = ig.ignores('.npm-cache/package-lock.json');

      // Then: 除外される
      assert.strictEqual(isExcluded, true, '.npm-cache/package-lock.json should be excluded from .vsix');
    });

    // TC-N-03 (vscodeignore): 深いネスト配下も除外される（正常系）
    test('TC-N-03 (vscodeignore): should exclude deeply nested files from .vsix', () => {
      // Given: `.npm-cache/**` パターンを持つ ignore インスタンス
      const ig = ignore().add(vscodeignorePattern);

      // When: 深いネスト配下が除外対象か判定する
      const isExcluded = ig.ignores('.npm-cache/nested/deep/file.txt');

      // Then: 除外される
      assert.strictEqual(isExcluded, true, '.npm-cache/nested/deep/file.txt should be excluded from .vsix');
    });

    // TC-E-02 (vscodeignore): 先頭ドット無しの `npm-cache/` は除外されない
    test('TC-E-02 (vscodeignore): should NOT exclude npm-cache/ (no leading dot)', () => {
      // Given: `.npm-cache/**` パターンを持つ ignore インスタンス
      const ig = ignore().add(vscodeignorePattern);

      // When: `npm-cache/` が除外対象か判定する
      const isExcluded = ig.ignores('npm-cache/file.txt');

      // Then: 除外されない
      assert.strictEqual(isExcluded, false, 'npm-cache/file.txt should NOT be excluded');
    });

    // TC-E-03 (vscodeignore): 似た名前の `.npm-cache-backup/` は除外されない
    test('TC-E-03 (vscodeignore): should NOT exclude .npm-cache-backup/', () => {
      // Given: `.npm-cache/**` パターンを持つ ignore インスタンス
      const ig = ignore().add(vscodeignorePattern);

      // When: `.npm-cache-backup/` が除外対象か判定する
      const isExcluded = ig.ignores('.npm-cache-backup/file.txt');

      // Then: 除外されない
      assert.strictEqual(isExcluded, false, '.npm-cache-backup/file.txt should NOT be excluded');
    });

    // TC-E-04 (vscodeignore): サブディレクトリ配下の `.npm-cache/` も除外される
    test('TC-E-04 (vscodeignore): should exclude .npm-cache/ in subdirectories', () => {
      // Given: `.npm-cache/**` パターンを持つ ignore インスタンス
      const ig = ignore().add(vscodeignorePattern);

      // When: `src/.npm-cache/` 配下が除外対象か判定する
      const isExcluded = ig.ignores('src/.npm-cache/file.txt');

      // Then: 除外される
      assert.strictEqual(isExcluded, true, 'src/.npm-cache/file.txt should be excluded');
    });
  });
});

