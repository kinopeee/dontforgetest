import * as path from 'path';
import * as fs from 'fs';
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

    // VS Code拡張機能テストは別プロセス（Electron/Extension Host）を起動する。
    // 実行中のIDE（Cursor/VS Code）と user-data / extensions が衝突すると不安定になり得るため、
    // テスト用のディレクトリを明示的に隔離して起動する。
    const vscodeTestRoot = path.join(extensionDevelopmentPath, '.vscode-test');
    const userDataDir = path.join(vscodeTestRoot, 'user-data');
    const extensionsDir = path.join(vscodeTestRoot, 'extensions');
    await fs.promises.mkdir(userDataDir, { recursive: true });
    await fs.promises.mkdir(extensionsDir, { recursive: true });

    // VS Codeをダウンロードして起動し、テストを実行
    // 拡張機能のengines.vscodeに合わせてバージョンを指定
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      // 実行環境（macOS 15系）で動く安定版を使用
      version: 'stable',
      launchArgs: [
        testWorkspace,
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
        // UIの揺れや初回ダイアログ類を減らす（完全なヘッドレスにはならない）
        '--disable-workspace-trust',
        '--skip-release-notes',
      ],
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
