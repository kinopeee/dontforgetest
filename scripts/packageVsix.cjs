/**
 * VSIX を生成するためのクロスプラットフォームスクリプト。
 *
 * package.json の `version` を参照して出力ファイル名を決め、
 * `@vscode/vsce package` を実行する。
 *
 * NOTE:
 * - npm scripts での `$(node -p ...)` のようなシェル依存表現を避けるために用意している。
 * - `npm run compile` は呼び出し側（package.json の scripts）で実行する想定。
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

const pkg = require(path.join(repoRoot, 'package.json'));

const version = typeof pkg?.version === 'string' ? pkg.version : '';
if (!version) {
  console.error('package.json の version が取得できませんでした');
  process.exit(1);
}

const packageName = typeof pkg?.name === 'string' && pkg.name.trim() !== '' ? pkg.name.trim() : 'extension';
const outFilePath = path.join(repoRoot, `${packageName}-${version}.vsix`);

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['--yes', '@vscode/vsce', 'package', '--out', outFilePath, '--no-rewrite-relative-links'];

// NOTE:
// vsce の secretlint 実行は内部で `os.cpus().length` を concurrency に渡す。
// 一部の実行環境（CI/サンドボックス等）では cpus が 0 件になることがあり、
// secretlint 側で `concurrency=0` エラーになってパッケージ生成が失敗する。
// その場合に限り、vsce の secrets/.env スキャンをスキップしてパッケージ生成を継続する。
// （通常環境ではスキャンを有効なままにする）
const cpus = os.cpus();
if (Array.isArray(cpus) && cpus.length < 1) {
  args.push('--allow-package-all-secrets', '--allow-package-env-file');
}

// 失敗途中で壊れた vsix が残ると、インストール時に
// "End of central directory record signature not found" が出るため、事前に削除する。
try {
  if (fs.existsSync(outFilePath)) {
    fs.unlinkSync(outFilePath);
  }
} catch {
  // ここで失敗しても後続で上書きできるため続行する
}

console.log(`VSIX を生成します: ${outFilePath}`);

const result = spawnSync(npxCommand, args, {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);

