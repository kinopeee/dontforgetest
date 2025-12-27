import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

function resolveRepoRootFromHere(startDir: string): string {
  // Given: このテストは out/test/suite/**（コンパイル済みJS）から実行される
  // When: 親ディレクトリを辿り、package.json と src/ を持つディレクトリを探す
  // Then: リポジトリルートを特定できる
  let dir = startDir;
  for (let i = 0; i < 12; i += 1) {
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
});

