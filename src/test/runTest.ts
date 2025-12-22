import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    // 拡張機能のパス
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    // テスト用に開くワークスペース（フォルダ）
    // - workspaceFolders が undefined にならないよう、明示的に開く
    const testWorkspace = extensionDevelopmentPath;
    // テストスイートのパス
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // VS Codeをダウンロードして起動し、テストを実行
    // 拡張機能のengines.vscodeに合わせてバージョンを指定
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // 実行環境（macOS 15系）で動く安定版を使用
      version: 'stable',
      launchArgs: [testWorkspace],
      // 親プロセスの環境変数に ELECTRON_RUN_AS_NODE=1 があると
      // VS Code本体（Electron）が「Nodeモード」で起動してしまいテストが実行できない。
      // undefined で上書きすることで子プロセス側では「未設定」にする。
      extensionTestsEnv: {
        ELECTRON_RUN_AS_NODE: undefined,
      },
    });
  } catch (err) {
    console.error('テストの実行に失敗しました');
    console.error(err);
    process.exit(1);
  }
}

main();
