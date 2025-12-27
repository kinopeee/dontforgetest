import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const MAX_PARENT_TRAVERSAL_DEPTH = 12;

function resolveRepoRootFromHere(startDir: string): string {
  // Given: このテストは out/test/suite/**（コンパイル済みJS）から実行される
  // When: 親ディレクトリを辿り、package.json と src/ を持つディレクトリを探す
  // Then: リポジトリルートを特定できる
  let dir = startDir;
  for (let i = 0; i < MAX_PARENT_TRAVERSAL_DEPTH; i += 1) {
    const hasPackageJson = fs.existsSync(path.join(dir, 'package.json'));
    const hasSrcDir = fs.existsSync(path.join(dir, 'src'));
    if (hasPackageJson && hasSrcDir) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(`Failed to resolve repo root from __dirname="${startDir}"`);
}

function walkTsFiles(dir: string, acc: string[]): void {
  // Given: ディレクトリパスと結果を蓄積する配列
  // When: ディレクトリを再帰的に走査し、.ts ファイルを収集（node_modules, out は除外）
  // Then: acc 配列に TypeScript ファイルのパスが追加される
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // node_modules/out などは対象外（src 配下でも念のため除外）
      if (entry.name === 'node_modules' || entry.name === 'out') {
        continue;
      }
      walkTsFiles(fullPath, acc);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.ts')) {
      acc.push(fullPath);
    }
  }
}

suite('docs / repository hygiene', () => {
  const repoRoot = resolveRepoRootFromHere(__dirname);

  test('TC-N-01: 削除した .claude/commands/generate-tests.md への参照が src/ に残っていない', () => {
    // Given: リポジトリルートと src/ ディレクトリ
    const needle = '.claude/commands/generate-tests.md';
    const srcRoot = path.join(repoRoot, 'src');

    // When: src/ 配下の TypeScript ファイルを走査して参照を抽出する
    const files: string[] = [];
    walkTsFiles(srcRoot, files);
    const referenced = files.filter((filePath) => {
      // NOTE: 検索対象の文字列（needle）をこのテスト自身が保持しているため、自身は除外する。
      if (filePath.endsWith(path.join('src', 'test', 'suite', 'docs', 'documentation.test.ts'))) {
        return false;
      }
      return fs.readFileSync(filePath, 'utf8').includes(needle);
    });

    // Then: 参照が存在しない
    assert.strictEqual(
      referenced.length,
      0,
      `Expected no references to ${needle}, but found in: ${JSON.stringify(referenced)}`,
    );
  });

  test('TC-E-01: resolveRepoRootFromHere が条件を満たさないディレクトリでは Error を投げる', () => {
    // Given: package.json も src/ も存在しない一時ディレクトリ
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-nonrepo-'));

    // When/Then: 例外（型とメッセージ）を検証する
    assert.throws(
      () => resolveRepoRootFromHere(tempDir),
      (err: unknown) => {
        assert.ok(err instanceof Error, 'Error が投げられること');
        assert.ok(err.message.includes('Failed to resolve repo root'), 'メッセージに Failed to resolve repo root が含まれること');
        assert.ok(err.message.includes(tempDir), 'メッセージに startDir が含まれること');
        return true;
      },
      'resolveRepoRootFromHere は非リポジトリディレクトリで Error を投げる',
    );
  });

  test('TC-B-01: walkTsFiles は空ディレクトリで空配列のまま', () => {
    // Given: 空の一時ディレクトリ
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-empty-'));
    const files: string[] = [];

    // When: walkTsFiles を呼ぶ
    walkTsFiles(tempDir, files);

    // Then: 収集結果は空
    assert.strictEqual(files.length, 0, '空ディレクトリでは .ts が 0 件');
  });

  test('TC-B-02: walkTsFiles は node_modules/out を除外して .ts のみ収集する', () => {
    // Given: .ts/.txt と除外ディレクトリを含む構造
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-walk-'));
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'node_modules'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'out'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'nested'), { recursive: true });

    const keepA = path.join(srcDir, 'a.ts');
    const keepB = path.join(srcDir, 'nested', 'b.ts');
    const skipNodeModules = path.join(srcDir, 'node_modules', 'skip.ts');
    const skipOut = path.join(srcDir, 'out', 'skip.ts');
    const nonTs = path.join(srcDir, 'c.txt');

    fs.writeFileSync(keepA, '// ok', 'utf8');
    fs.writeFileSync(keepB, '// ok', 'utf8');
    fs.writeFileSync(skipNodeModules, `// ${Math.random()}`, 'utf8');
    fs.writeFileSync(skipOut, `// ${Math.random()}`, 'utf8');
    fs.writeFileSync(nonTs, 'no', 'utf8');

    // When: walkTsFiles を呼ぶ
    const files: string[] = [];
    walkTsFiles(srcDir, files);

    // Then: 期待する .ts のみが含まれ、除外ディレクトリの .ts は含まれない
    assert.ok(files.includes(keepA), 'a.ts が収集されること');
    assert.ok(files.includes(keepB), 'nested/b.ts が収集されること');
    assert.ok(!files.includes(skipNodeModules), 'node_modules 配下は除外されること');
    assert.ok(!files.includes(skipOut), 'out 配下は除外されること');
    assert.ok(!files.includes(nonTs), '.txt は収集されないこと');
  });

  test('TC-E-02: walkTsFiles は存在しないディレクトリで例外を投げる', () => {
    // Given: 存在しないディレクトリ
    const missingDir = path.join(os.tmpdir(), `dontforgetest-missing-${Date.now()}`);
    const files: string[] = [];

    // When/Then: 例外（型とメッセージ）を検証する
    assert.throws(
      () => walkTsFiles(missingDir, files),
      (err: unknown) => {
        assert.ok(err instanceof Error, 'Error が投げられること');
        // NOTE: OS によりメッセージは揺れるため、ENOENT などの一般的な断片で緩く検証する
        assert.ok(/ENOENT|no such file|not found/i.test(err.message), 'メッセージが ENOENT 相当であること');
        return true;
      },
      '存在しないディレクトリでは例外を投げる',
    );
  });

  test('TC-E-03: 削除パス参照が見つかった場合は referenced が 1 件以上になる', () => {
    // Given: needle を含む .ts が存在する擬似 src/ ディレクトリ
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-docref-'));
    const srcRoot = path.join(tempDir, 'src');
    fs.mkdirSync(srcRoot, { recursive: true });
    const needle = '.claude/commands/generate-tests.md';
    const fileWithRef = path.join(srcRoot, 'hasRef.ts');
    fs.writeFileSync(fileWithRef, `// ref: ${needle}\nexport const x = 1;\n`, 'utf8');

    // When: src/ 配下の TypeScript ファイルを走査して参照を抽出する
    const files: string[] = [];
    walkTsFiles(srcRoot, files);
    const referenced = files.filter((filePath) => fs.readFileSync(filePath, 'utf8').includes(needle));

    // Then: 参照が検出される
    assert.ok(referenced.length >= 1, '参照が 1 件以上検出されること');
    assert.ok(referenced.includes(fileWithRef), '参照を含むファイルパスが含まれること');
  });
});

