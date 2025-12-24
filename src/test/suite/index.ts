import * as path from 'path';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Mocha = require('mocha');
import { glob } from 'glob';
import * as vscode from 'vscode';

interface TestResultFile {
  timestamp: number;
  vscodeVersion: string;
  failures: number;
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

        console.log(`見つかったテストファイル: ${files.length}個`);
        files.forEach((f: string) => {
          const filePath = path.resolve(testsRoot, f);
          console.log(`  追加: ${filePath}`);
          mocha.addFile(filePath);
        });

        // テストスイートを実行
        mocha.run((failures: number) => {
          console.log(`テスト実行完了。失敗: ${failures}個`);

          // テスト結果をファイルに保存（外部プロセス起動時の成否判定に使用）
          // - Cursor 実行中に VS Code 側が kill される場合があるため、終了直前に同期書き込みする
          try {
            fs.mkdirSync(path.dirname(resultFilePath), { recursive: true });
            const result: TestResultFile = { timestamp: Date.now(), vscodeVersion: vscode.version, failures };
            fs.writeFileSync(resultFilePath, JSON.stringify(result), 'utf8');
          } catch (writeErr) {
            console.warn('テスト結果ファイルの書き込みに失敗しました:', writeErr);
          }

          if (failures > 0) {
            e(new Error(`${failures} 個のテストが失敗しました。`));
          } else {
            c();
          }
        });
      })
      .catch((err) => {
        console.error('テストスイートの実行中にエラーが発生しました:', err);
        e(err);
      });
  });
}
