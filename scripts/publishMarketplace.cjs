/**
 * Visual Studio Marketplace へ拡張機能を公開するためのクロスプラットフォームスクリプト。
 *
 * 目的:
 * - CI/ローカルのどちらでも同じ手順で publish できるようにする
 * - シェル依存の環境変数参照やコマンド差異（win32）を避ける
 *
 * 前提:
 * - Marketplace 側に Publisher が作成済みで、package.json の publisher と一致していること
 * - PAT（Personal Access Token）を環境変数で渡すこと
 *
 * 使い方:
 * - VSCE_PAT="<PAT>" npm run marketplace:publish
 *
 * NOTE:
 * - `vsce publish` は内部で VSIX を生成してアップロードするため、別途 `vsce package` は不要です。
 * - `--no-rewrite-relative-links` は README の相対リンクを書き換えないための安全策です。
 */

const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require(path.join(repoRoot, 'package.json'));

const publisher = typeof pkg?.publisher === 'string' ? pkg.publisher.trim() : '';
if (!publisher) {
  // eslint-disable-next-line no-console
  console.error('package.json の publisher が取得できませんでした（Marketplace の Publisher ID と一致させてください）');
  process.exit(1);
}

const token = (() => {
  const candidates = [
    process.env.VSCE_PAT,
    process.env.VSCODE_MARKETPLACE_PAT,
    process.env.VS_MARKETPLACE_PAT,
    process.env.VS_MARKETPLACE_TOKEN,
  ].filter((v) => typeof v === 'string' && v.trim() !== '');
  return candidates.length >= 1 ? candidates[0].trim() : '';
})();

if (!token) {
  // eslint-disable-next-line no-console
  console.error('Marketplace PAT が見つかりません。環境変数 VSCE_PAT（推奨）を設定してください。');
  // eslint-disable-next-line no-console
  console.error('例: VSCE_PAT="<PAT>" npm run marketplace:publish');
  process.exit(1);
}

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = [
  '--yes',
  '@vscode/vsce',
  'publish',
  '--no-rewrite-relative-links',
  '-p',
  token,
];

// eslint-disable-next-line no-console
console.log(`Visual Studio Marketplace に公開します（publisher=${publisher}）`);

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

