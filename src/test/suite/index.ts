import * as path from 'path';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Mocha = require('mocha');
import { glob } from 'glob';
import * as vscode from 'vscode';

interface FailedTestInfo {
  title: string;
  fullTitle: string;
  error: string;
}

interface TestResultFile {
  timestamp: number;
  vscodeVersion: string;
  failures: number;
  failedTests?: FailedTestInfo[];
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

export function run(): Promise<void> {
  // VS Code APIが利用可能であることを確認
  console.log('VS Code API version:', vscode.version);

  // Mochaインスタンスを作成
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 10000, // 10秒のタイムアウト
  });

  const testsRoot = path.resolve(__dirname, '..');
  const resultFilePath = resolveTestResultFilePath();

  return new Promise((c, e) => {
    glob('**/**.test.js', { cwd: testsRoot })
      .then((files) => {
        if (files.length === 0) {
          console.warn('テストファイルが見つかりませんでした');
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

        // テストスイートを実行
        const runner = mocha.run((failures: number) => {
          console.log(`テスト実行完了。失敗: ${failures}個`);

          // テスト結果をファイルに保存（外部プロセス起動時の成否判定に使用）
          // - Cursor 実行中に VS Code 側が kill される場合があるため、終了直前に同期書き込みする
          try {
            fs.mkdirSync(path.dirname(resultFilePath), { recursive: true });
            const result: TestResultFile = { timestamp: Date.now(), vscodeVersion: vscode.version, failures, failedTests };
            fs.writeFileSync(resultFilePath, JSON.stringify(result, null, 2), 'utf8');
          } catch (writeErr) {
            console.warn('テスト結果ファイルの書き込みに失敗しました:', writeErr);
          }

          if (failures > 0) {
            e(new Error(`${failures} 個のテストが失敗しました。`));
          } else {
            c();
          }
        });

        // 失敗時のイベントハンドラを追加
        runner.on('fail', (test: { title: string; fullTitle: () => string }, err: Error) => {
          failedTests.push({
            title: test.title,
            fullTitle: test.fullTitle(),
            error: err.message || String(err),
          });
        });
      })
      .catch((err) => {
        console.error('テストスイートの実行中にエラーが発生しました:', err);
        e(err);
      });
  });
}
