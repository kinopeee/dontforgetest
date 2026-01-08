import * as path from 'path';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Mocha = require('mocha');
import { glob } from 'glob';
import * as vscode from 'vscode';

export type TestCaseState = 'passed' | 'failed' | 'pending';

export interface FailedTestInfo {
  title: string;
  fullTitle: string;
  error: string;
  stack?: string;
  code?: string;
  expected?: string;
  actual?: string;
}

export interface TestCaseInfo {
  /** スイート名（fullTitle から title を除いたもの） */
  suite: string;
  /** テストケース名 */
  title: string;
  /** fullTitle（Mocha が提供する完全名） */
  fullTitle: string;
  /** 成否 */
  state: TestCaseState;
  /** 実行時間（ミリ秒。取得できた場合のみ） */
  durationMs?: number;
}

export interface TestResultFile {
  timestamp: number;
  /** 実行環境情報（テスト実行側で取得） */
  platform?: string;
  arch?: string;
  nodeVersion?: string;
  vscodeVersion: string;
  failures: number;
  passes: number;
  pending: number;
  total: number;
  /** Mocha Runner の実行時間（ミリ秒。取得できた場合のみ） */
  durationMs?: number;
  /** テストケースごとの結果 */
  tests: TestCaseInfo[];
  failedTests?: FailedTestInfo[];
}

function normalizeErrorMessage(err: unknown): string {
  if (!err) {
    return '';
  }
  const rec = typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : undefined;
  const message = rec?.message;
  if (typeof message === 'string') {
    return message;
  }
  return String(err);
}

function normalizeErrorCode(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function normalizeErrorDetail(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractErrorField(err: unknown, field: string): unknown {
  if (!err || typeof err !== 'object') {
    return undefined;
  }
  return (err as Record<string, unknown>)[field];
}

export function resolveSuiteFromFullTitle(fullTitle: string, title: string): string {
  // fullTitle は「Suite1 Suite2 Test Title」のように連結されることが多い。
  // 末尾の title を取り除いた残りを suite として扱う。
  // 不正な入力は明示的に弾く（テスト観点上、TypeError を期待するケースがある）
  if (typeof fullTitle !== 'string' || typeof title !== 'string') {
    throw new TypeError('fullTitle と title は文字列である必要があります');
  }
  // title が空の場合、endsWith('') は常に true になるため例外扱いにする
  if (title.trim() === '') {
    return '';
  }
  if (!fullTitle.endsWith(title)) {
    return '';
  }
  const suite = fullTitle.slice(0, Math.max(0, fullTitle.length - title.length)).trim();
  return suite;
}

interface MochaRunnerLike {
  stats?: { duration?: number };
  on(event: 'pass', cb: (test: { title: string; fullTitle: () => string; duration?: number }) => void): void;
  on(event: 'fail', cb: (test: { title: string; fullTitle: () => string }, err: Error) => void): void;
  on(event: 'pending', cb: (test: { title: string; fullTitle: () => string }) => void): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
}

/**
 * テスト結果ファイル（test-result.json）を同期的に書き出す。
 * open 起動時は exitCode を取得できないため、このファイルが成否判定の根拠になる。
 *
 * 例外が発生してもテストハーネス側が ENOENT で落ちないよう、可能な限り書き込みを試みる。
 */
function writeTestResultFileSafely(params: {
  resultFilePath: string;
  failures: number;
  tests: TestCaseInfo[];
  failedTests: FailedTestInfo[];
  durationMs?: number;
}): void {
  try {
    fs.mkdirSync(path.dirname(params.resultFilePath), { recursive: true });
    const passes = params.tests.filter((t) => t.state === 'passed').length;
    const pending = params.tests.filter((t) => t.state === 'pending').length;
    const total = params.tests.length;
    const result: TestResultFile = {
      timestamp: Date.now(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      vscodeVersion: vscode.version,
      failures: params.failures,
      passes,
      pending,
      total,
      durationMs: params.durationMs,
      tests: params.tests,
      failedTests: params.failedTests,
    };
    fs.writeFileSync(params.resultFilePath, JSON.stringify(result, null, 2), 'utf8');
  } catch (writeErr) {
    console.warn('テスト結果ファイルの書き込みに失敗しました:', writeErr);
  }
}

function resolveTestResultFilePathFromArgv(): string | undefined {
  const prefix = '--dontforgetest-test-result-file=';
  const arg = process.argv.find((a) => typeof a === 'string' && a.startsWith(prefix));
  if (!arg) {
    return undefined;
  }
  const value = arg.slice(prefix.length);
  return value.trim() === '' ? undefined : value;
}

function resolveTestResultFilePath(): string {
  // コマンドライン引数（open起動でも確実に伝播する）
  const fromArgv = resolveTestResultFilePathFromArgv();
  if (fromArgv) {
    return fromArgv;
  }

  const fromEnv = process.env.DONTFORGETEST_TEST_RESULT_FILE;
  if (fromEnv && fromEnv.trim() !== '') {
    return fromEnv;
  }

  // VS Code 側で開かれているワークスペースルートを優先して使用する（最も安定）
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot && workspaceRoot.trim() !== '') {
    return path.join(workspaceRoot, '.vscode-test', 'test-result.json');
  }

  // 最後のフォールバック：out/test/suite からリポジトリルートへ戻り、.vscode-test 配下へ書き出す
  return path.resolve(__dirname, '../../../.vscode-test/test-result.json');
}

export async function run() {
  // VS Code APIが利用可能であることを確認
  console.log('VS Code API version:', vscode.version);

  // テスト環境では「cursor-agent 経由のテスト実行」が completed を返さない等でスタックした場合に
  // 長時間待たないよう、ワークスペース設定でタイムアウトを短めに設定しておく。
  // NOTE: テスト用の一時ワークスペースに対する設定なので、ユーザー環境には影響しない。
  try {
    await vscode.workspace
      .getConfiguration('dontforgetest')
      .update('testExecutionTimeoutMs', 2000, vscode.ConfigurationTarget.Workspace);
  } catch (e) {
    console.warn('テスト用設定（testExecutionTimeoutMs）の更新に失敗しました（続行します）:', e);
  }

  // Mochaインスタンスを作成
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 10000, // 10秒のタイムアウト
  });

  const testsRoot = path.resolve(__dirname, '..');
  const resultFilePath = resolveTestResultFilePath();

  return new Promise<void>((c, e) => {
    glob('**/**.test.js', { cwd: testsRoot })
      .then((files) => {
        if (files.length === 0) {
          console.warn('テストファイルが見つかりませんでした');
          writeTestResultFileSafely({ resultFilePath, failures: 0, tests: [], failedTests: [] });
          c();
          return;
        }

        // tsc は削除されたソースの out/ を自動で消さないため、
        // 古い out/test/**/*.test.js が残ると「存在しないテスト」が実行されてしまう。
        // 対応する src/test/**/*.test.ts が存在するものだけを実行対象にする。
        const repoRoot = path.resolve(testsRoot, '../..');
        const sourceTestsRoot = path.join(repoRoot, 'src', 'test');
        const missingSources: Array<{ jsPath: string; expectedSourcePath: string }> = [];
        const runnableFiles = files.filter((f) => {
          const jsPath = path.resolve(testsRoot, f);
          const expectedSourcePath = path.resolve(sourceTestsRoot, f).replace(/\.js$/, '.ts');
          if (!fs.existsSync(expectedSourcePath)) {
            missingSources.push({ jsPath, expectedSourcePath });
            return false;
          }
          return true;
        });

        if (missingSources.length > 0) {
          console.warn(`対応するソースが見つからないためスキップしたテスト: ${missingSources.length}個`);
          for (const entry of missingSources.slice(0, 5)) {
            console.warn(`  スキップ: ${entry.jsPath}`);
            console.warn(`    期待するソース: ${entry.expectedSourcePath}`);
          }
          if (missingSources.length > 5) {
            console.warn('  ... 省略 ...');
          }
        }

        if (runnableFiles.length === 0) {
          console.warn('実行可能なテストファイルが見つかりませんでした（すべてスキップ対象）');
          writeTestResultFileSafely({ resultFilePath, failures: 0, tests: [], failedTests: [] });
          c();
          return;
        }

        console.log(`見つかったテストファイル: ${runnableFiles.length}個`);
        runnableFiles.forEach((f: string) => {
          const filePath = path.resolve(testsRoot, f);
          console.log(`  追加: ${filePath}`);
          mocha.addFile(filePath);
        });

        // 失敗したテスト情報を収集するための配列
        const failedTests: FailedTestInfo[] = [];
        // テストケースごとの結果を収集する
        const byFullTitle = new Map<string, TestCaseInfo>();
        const order: string[] = [];

        const upsertTest = (info: TestCaseInfo): void => {
          const existing = byFullTitle.get(info.fullTitle);
          if (!existing) {
            byFullTitle.set(info.fullTitle, info);
            order.push(info.fullTitle);
            return;
          }
          // 既存がある場合は、より詳細な情報で上書きする（duration 等）
          byFullTitle.set(info.fullTitle, { ...existing, ...info });
        };

        // テストスイートを実行
        let runner: MochaRunnerLike;
        try {
          runner = mocha.run((failures: number) => {
            console.log(`テスト実行完了。失敗: ${failures}個`);

            const tests = order.map((key) => byFullTitle.get(key)).filter((x): x is TestCaseInfo => x !== undefined);
            const durationMs = typeof runner.stats?.duration === 'number' ? runner.stats.duration : undefined;
            writeTestResultFileSafely({ resultFilePath, failures, tests, failedTests, durationMs });

            if (failures > 0) {
              e(new Error(`${failures} 個のテストが失敗しました。`));
            } else {
              c();
            }
          }) as unknown as MochaRunnerLike;
        } catch (runErr) {
          const err = runErr instanceof Error ? runErr : new Error(String(runErr));
          console.error('テストスイートの実行中にエラーが発生しました:', err);
          writeTestResultFileSafely({
            resultFilePath,
            failures: 1,
            tests: [],
            failedTests: [{ title: '(test suite)', fullTitle: '(test suite)', error: err.message }],
          });
          e(err);
          return;
        }

        // 成功時のイベントハンドラを追加
        runner.on(
          'pass',
          (test: { title: string; fullTitle: () => string; duration?: number | undefined }) => {
            const title = test.title;
            const fullTitle = test.fullTitle();
            const suite = resolveSuiteFromFullTitle(fullTitle, title);
            upsertTest({
              suite,
              title,
              fullTitle,
              state: 'passed',
              durationMs: typeof test.duration === 'number' ? test.duration : undefined,
            });
          },
        );

        // 失敗時のイベントハンドラを追加
        runner.on('fail', (test: { title: string; fullTitle: () => string }, err: Error) => {
          const title = test.title;
          const fullTitle = test.fullTitle();
          const suite = resolveSuiteFromFullTitle(fullTitle, title);
          upsertTest({ suite, title, fullTitle, state: 'failed' });
          failedTests.push({
            title: test.title,
            fullTitle: test.fullTitle(),
            error: normalizeErrorMessage(err),
            stack: typeof err.stack === 'string' ? err.stack : undefined,
            code: normalizeErrorCode(extractErrorField(err, 'code')),
            expected: normalizeErrorDetail(extractErrorField(err, 'expected')),
            actual: normalizeErrorDetail(extractErrorField(err, 'actual')),
          });
        });

        // pending（スキップ/未実装）のイベントハンドラ
        runner.on('pending', (test: { title: string; fullTitle: () => string }) => {
          const title = test.title;
          const fullTitle = test.fullTitle();
          const suite = resolveSuiteFromFullTitle(fullTitle, title);
          upsertTest({ suite, title, fullTitle, state: 'pending' });
        });
      })
      .catch((err) => {
        const normalized = err instanceof Error ? err : new Error(String(err));
        console.error('テストスイートの実行中にエラーが発生しました:', normalized);
        writeTestResultFileSafely({
          resultFilePath,
          failures: 1,
          tests: [],
          failedTests: [{ title: '(test suite)', fullTitle: '(test suite)', error: normalized.message }],
        });
        e(normalized);
      });
  });
}

/**
 * Test-only exports for unit testing internal helpers.
 * Do not use from production code.
 */
export const __test__ = {
  normalizeErrorMessage,
  normalizeErrorCode,
  normalizeErrorDetail,
  extractErrorField,
  writeTestResultFileSafely,
  resolveTestResultFilePathFromArgv,
  resolveTestResultFilePath,
};
