import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

suite('src/extension.ts', () => {
  suite('Extension Activation', () => {
    // Given: 拡張機能がインストールされている
    // When: 拡張機能をID指定で取得する
    // Then: 拡張機能オブジェクトが存在する
    test('TC-EXT-01: 拡張機能の存在確認', () => {
      const ext = vscode.extensions.getExtension('local.chottotest');
      assert.ok(ext, '拡張機能が見つかりません');
    });

    // Given: 拡張機能が取得できている
    // When: activate()を実行する
    // Then: 拡張機能がアクティブ状態になる
    test('TC-EXT-02: 拡張機能のアクティブ化', async () => {
      const ext = vscode.extensions.getExtension('local.chottotest');
      assert.ok(ext);
      
      if (!ext.isActive) {
        await ext.activate();
      }
      assert.ok(ext.isActive, '拡張機能がアクティブになっていません');
    });
  });

  suite('Command Registration', () => {
    // Given: 拡張機能がアクティブ化されている
    // When: 登録されている全コマンドを取得する
    // Then: 期待されるコマンドIDがすべて含まれている
    test('TC-EXT-03: コマンド登録の確認', async () => {
      const expectedCommands = [
        'testgen-agent.generateTest',
        'testgen-agent.openPanel',
        'testgen-agent.generateTestFromFile',
        'testgen-agent.generateTestFromCommit',
        'testgen-agent.generateTestFromCommitRange',
        'testgen-agent.generateTestFromWorkingTree',
        'testgen-agent.selectDefaultModel',
        'testgen-agent.previewLastRun',
        'testgen-agent.rollbackLastRun',
        'testgen-agent.showTestGeneratorOutput'
      ];

      // 組み込みコマンドも含めて取得
      const allCommands = await vscode.commands.getCommands(true);

      expectedCommands.forEach(cmd => {
        assert.ok(
          allCommands.includes(cmd), 
          `コマンド "${cmd}" が登録されていません`
        );
      });
    });
  });

  suite('Configuration', () => {
    // Given: 拡張機能の設定が読み込まれている
    // When: 各設定項目の値を取得する
    // Then: デフォルト値が期待通りであること
    test('TC-EXT-04: デフォルト設定値の確認', () => {
      const config = vscode.workspace.getConfiguration('testgen-agent');
      
      assert.strictEqual(config.get('cursorAgentPath'), '', 'cursorAgentPathのデフォルト値が不正');
      assert.strictEqual(config.get('maxParallelTasks'), 4, 'maxParallelTasksのデフォルト値が不正');
      assert.strictEqual(config.get('defaultModel'), '', 'defaultModelのデフォルト値が不正');
      assert.deepStrictEqual(config.get('customModels'), [], 'customModelsのデフォルト値が不正');
      assert.strictEqual(config.get('testStrategyPath'), '', 'testStrategyPathのデフォルト値が不正');
      assert.strictEqual(config.get('includeTestPerspectiveTable'), true, 'includeTestPerspectiveTableのデフォルト値が不正');
      assert.strictEqual(config.get('perspectiveReportDir'), 'docs/test-perspectives', 'perspectiveReportDirのデフォルト値が不正');
      assert.strictEqual(config.get('testExecutionReportDir'), 'docs/test-execution-reports', 'testExecutionReportDirのデフォルト値が不正');
      assert.strictEqual(config.get('testCommand'), 'npm test', 'testCommandのデフォルト値が不正');
      assert.strictEqual(config.get('testExecutionRunner'), 'cursorAgent', 'testExecutionRunnerのデフォルト値が不正');
      assert.strictEqual(config.get('allowUnsafeTestCommand'), false, 'allowUnsafeTestCommandのデフォルト値が不正');
      assert.strictEqual(config.get('cursorAgentForceForTestExecution'), false, 'cursorAgentForceForTestExecutionのデフォルト値が不正');
    });
  });

  suite('Metadata & Resources', () => {
    // Given: 拡張機能がインストールされている
    // When: package.json のメタデータを取得する
    // Then: ライセンスが AGPL-3.0 であること
    test('TC-META-01: ライセンス情報の確認', () => {
      const ext = vscode.extensions.getExtension('local.chottotest');
      assert.ok(ext, '拡張機能が見つかりません');
      
      const packageJSON = ext.packageJSON;
      assert.strictEqual(packageJSON.license, 'AGPL-3.0', 'ライセンスが AGPL-3.0 ではありません');
    });

    // Given: 拡張機能がインストールされている
    // When: LICENSE ファイルの存在を確認する
    // Then: ファイルが存在すること
    test('TC-META-02: ライセンスファイルの存在確認', async () => {
      const ext = vscode.extensions.getExtension('local.chottotest');
      assert.ok(ext, '拡張機能が見つかりません');

      const licenseUri = vscode.Uri.file(path.join(ext.extensionPath, 'LICENSE'));
      try {
        await vscode.workspace.fs.stat(licenseUri);
      } catch {
        assert.fail('LICENSE ファイルが存在しません');
      }
    });

    // TC-RES-01: package.json バージョン形式確認
    // Given: 拡張機能の package.json
    // When: バージョンを確認する
    // Then: セマンティックバージョニング形式（x.y.z）であること
    test('TC-RES-01: パッケージバージョンの形式確認', () => {
      const ext = vscode.extensions.getExtension('local.chottotest');
      assert.ok(ext, '拡張機能が見つかりません');
      
      const packageJSON = ext.packageJSON;
      const version = packageJSON.version;
      
      // バージョンが存在すること
      assert.ok(version, 'バージョンが定義されていません');
      assert.strictEqual(typeof version, 'string', 'バージョンは文字列である必要があります');
      
      // セマンティックバージョニング形式（x.y.z）であること
      const semverPattern = /^\d+\.\d+\.\d+$/;
      assert.ok(semverPattern.test(version), `バージョン "${version}" はセマンティックバージョニング形式（x.y.z）ではありません`);
    });

    // TC-RES-02: testgen-view.svg のレンダリング
    // Given: media/testgen-view.svg ファイル
    // When: ファイル内容を読み込む
    // Then: 有効なSVGであり、更新されたパス（試験管）を含んでいること
    test('TC-RES-02: testgen-view.svg の内容確認', async () => {
      const ext = vscode.extensions.getExtension('local.chottotest');
      assert.ok(ext, '拡張機能が見つかりません');

      const svgUri = vscode.Uri.file(path.join(ext.extensionPath, 'media', 'testgen-view.svg'));
      const svgContent = (await vscode.workspace.fs.readFile(svgUri)).toString();

      assert.ok(svgContent.includes('<svg'), 'SVGタグが含まれていること');
      assert.ok(svgContent.includes('width="24"'), '幅が24であること');
      assert.ok(svgContent.includes('height="24"'), '高さが24であること');
      
      // 新しいアイコンの特徴（試験管のパス）を確認
      // "シンプルな試験管" コメントが含まれているか
      assert.ok(svgContent.includes('シンプルな試験管'), '新しいアイコン（試験管）のコメントが含まれていること');
      // パスデータの断片
      assert.ok(svgContent.includes('d="M9 3h6M10 3v7l-4 8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l-4-8V3"'), '試験管のパスデータが含まれていること');
      assert.ok(svgContent.includes('d="M7 15h10"'), '液体の線が含まれていること');
    });
  });
});
