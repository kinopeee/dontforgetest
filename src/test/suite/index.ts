import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Mocha = require('mocha');
import { glob } from 'glob';
import * as vscode from 'vscode';

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

  return new Promise(async (c, e) => {
    try {
      const files = await glob('**/**.test.js', { cwd: testsRoot });

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
        if (failures > 0) {
          e(new Error(`${failures} 個のテストが失敗しました。`));
        } else {
          c();
        }
      });
    } catch (err) {
      console.error('テストスイートの実行中にエラーが発生しました:', err);
      e(err);
    }
  });
}
