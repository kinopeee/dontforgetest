/* eslint-disable no-console */
/**
 * `npm run vsix:build-install:bump` 用:
 * - npm version patch（タグ無し / 自動コミット無し）
 * - package.json / package-lock.json のみをコミット
 * - VSIX ビルド＆インストール
 *
 * 注意:
 * - 既にステージ済みの変更がある場合、事故防止のため中断します。
 * - package.json / package-lock.json が既に変更済みの場合も中断します（差分混入防止）。
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ stdio?: 'inherit'|'pipe', encoding?: BufferEncoding }} [options]
 * @returns {string}
 */
function run(cmd, args, options = {}) {
    const stdio = options.stdio ?? 'inherit';
    const encoding = options.encoding ?? 'utf8';

    if (stdio === 'inherit') {
        execFileSync(cmd, args, { stdio: 'inherit' });
        return '';
    }

    return execFileSync(cmd, args, { stdio: 'pipe', encoding });
}

/**
 * @param {string[]} args
 * @returns {boolean}
 */
function succeeds(cmd, args) {
    try {
        execFileSync(cmd, args, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function ensureGitRepo() {
    if (!succeeds('git', ['rev-parse', '--is-inside-work-tree'])) {
        throw new Error('このディレクトリは Git リポジトリではありません。');
    }
}

function ensureNoStagedChanges() {
    const staged = run('git', ['diff', '--cached', '--name-only'], { stdio: 'pipe' })
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

    if (staged.length > 0) {
        throw new Error(
            `既にステージ済みの変更があります（事故防止のため中断）:\n${staged
                .map((s) => `- ${s}`)
                .join('\n')}`
        );
    }
}

function ensurePackageFilesNotModified() {
    const changed = run('git', ['diff', '--name-only', '--', 'package.json', 'package-lock.json'], {
        stdio: 'pipe',
    })
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

    if (changed.length > 0) {
        throw new Error(
            `既に package 系ファイルが変更されています（差分混入防止のため中断）:\n${changed
                .map((s) => `- ${s}`)
                .join('\n')}`
        );
    }
}

function readPackageVersion() {
    const raw = fs.readFileSync('package.json', 'utf8');
    /** @type {{ version?: unknown }} */
    const pkg = JSON.parse(raw);
    if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
        throw new Error('package.json の version を読み取れません。');
    }
    return pkg.version;
}

function main() {
    ensureGitRepo();
    ensureNoStagedChanges();
    ensurePackageFilesNotModified();

    // 1) バージョンを上げる（コミット/タグは作らない）
    run('npm', ['version', 'patch', '--no-git-tag-version'], { stdio: 'inherit' });

    // 2) package系だけをステージ＆コミット
    const filesToCommit = ['package.json'];
    if (fs.existsSync('package-lock.json')) {
        filesToCommit.push('package-lock.json');
    }

    run('git', ['add', ...filesToCommit], { stdio: 'inherit' });

    const staged = run('git', ['diff', '--cached', '--name-only'], { stdio: 'pipe' })
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

    const allowed = new Set(filesToCommit);
    const unexpected = staged.filter((f) => !allowed.has(f));
    if (unexpected.length > 0) {
        // 念のため、混入したらステージを戻して中断
        run('git', ['restore', '--staged', '--', ...unexpected], { stdio: 'inherit' });
        throw new Error(
            `想定外のファイルがステージされました（中断）:\n${unexpected.map((s) => `- ${s}`).join('\n')}`
        );
    }

    const version = readPackageVersion();
    run('git', ['commit', '-m', `chore: バージョンを${version}に更新`], { stdio: 'inherit' });

    // 3) VSIX ビルド＆インストール
    run('npm', ['run', 'vsix:build-install'], { stdio: 'inherit' });
}

try {
    main();
} catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n[dontforgetest] vsix:build-install:bump 失敗: ${message}\n`);
    process.exit(1);
}


