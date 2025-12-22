import * as assert from 'assert';
import * as vscode from 'vscode';

suite('src/extension.ts', () => {
  suite('Extension Activation', () => {
    // Given: 拡張機能がインストールされている
    // When: 拡張機能をID指定で取得する
    // Then: 拡張機能オブジェクトが存在する
    test('TC-EXT-01: 拡張機能の存在確認', () => {
      const ext = vscode.extensions.getExtension('local.testgen-agent');
      assert.ok(ext, '拡張機能が見つかりません');
    });

    // Given: 拡張機能が取得できている
    // When: activate()を実行する
    // Then: 拡張機能がアクティブ状態になる
    test('TC-EXT-02: 拡張機能のアクティブ化', async () => {
      const ext = vscode.extensions.getExtension('local.testgen-agent');
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
      assert.strictEqual(config.get('testStrategyPath'), 'docs/test-strategy.md', 'testStrategyPathのデフォルト値が不正');
    });
  });
});
