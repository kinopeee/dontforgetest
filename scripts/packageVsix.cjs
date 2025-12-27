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
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

const pkg = require(path.join(repoRoot, 'package.json'));

const version = typeof pkg?.version === 'string' ? pkg.version : '';
if (!version) {
  // eslint-disable-next-line no-console
  console.error('package.json の version が取得できませんでした');
  process.exit(1);
}

const packageName = typeof pkg?.name === 'string' && pkg.name.trim() !== '' ? pkg.name.trim() : 'extension';
const outFilePath = path.join(repoRoot, `${packageName}-${version}.vsix`);

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['--yes', '@vscode/vsce', 'package', '--out', outFilePath, '--no-rewrite-relative-links'];

// eslint-disable-next-line no-console
console.log(`VSIX を生成します: ${outFilePath}`);

const result = spawnSync(npxCommand, args, {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (result.error) {
  // eslint-disable-next-line no-console
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);

