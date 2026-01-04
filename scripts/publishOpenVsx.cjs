/**
 * Open VSX Registry に VSIX を publish するためのクロスプラットフォームスクリプト。
 *
 * - 事前に `npm run vsix:build` で VSIX を生成しておく想定
 * - トークンは環境変数 `OVSX_PAT` から取得する
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
const vsixPath = path.join(repoRoot, `${packageName}-${version}.vsix`);

const token = process.env.OVSX_PAT;
if (!token) {
  // eslint-disable-next-line no-console
  console.error('環境変数 OVSX_PAT が未設定です（Open VSX の Personal Access Token を設定してください）');
  process.exit(1);
}

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = ['--yes', 'ovsx', 'publish', vsixPath, '-p', token];

// eslint-disable-next-line no-console
console.log(`Open VSX に publish します: ${vsixPath}`);

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

