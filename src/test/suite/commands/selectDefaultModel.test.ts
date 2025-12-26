import * as assert from 'assert';
import * as selectDefaultModelModule from '../../../commands/selectDefaultModel';

suite('commands/selectDefaultModel.ts', () => {
  // TC-N-01: selectDefaultModel 関数がエクスポートされている
  test('TC-N-01: selectDefaultModel function should be exported', () => {
    // Given: selectDefaultModel モジュール
    // When: モジュールをインポート
    // Then: selectDefaultModel 関数が存在する
    assert.ok(
      typeof selectDefaultModelModule.selectDefaultModel === 'function',
      'selectDefaultModel should be a function',
    );
  });

  // TC-N-02: selectDefaultModel 関数は Promise を返す（async関数）
  test('TC-N-02: selectDefaultModel should return a Promise', () => {
    // Given: selectDefaultModel 関数
    const fn = selectDefaultModelModule.selectDefaultModel;

    // When: 関数を呼び出す
    const result = fn();

    // Then: Promise を返す
    assert.ok(result instanceof Promise, 'selectDefaultModel should return a Promise');

    // クリーンアップ: Promise を適切に処理
    result.catch(() => {
      // VS Code API が利用不可のためエラーは無視
    });
  });

  // TC-A-01: selectDefaultModel は null や undefined ではない
  test('TC-A-01: selectDefaultModel should not be null or undefined', () => {
    // Given: selectDefaultModel モジュール
    // When: selectDefaultModel プロパティをチェック
    // Then: null や undefined ではない
    assert.notStrictEqual(
      selectDefaultModelModule.selectDefaultModel,
      null,
      'selectDefaultModel should not be null',
    );
    assert.notStrictEqual(
      selectDefaultModelModule.selectDefaultModel,
      undefined,
      'selectDefaultModel should not be undefined',
    );
  });

  // NOTE: VS Code の window.showQuickPick / showInputBox への依存が強く、
  // sinon 等のモックライブラリなしでは詳細なテストが困難。
  // 統合テストとして実際の UI 操作を伴うテストは手動で行うか、
  // e2e テストフレームワークを使用する必要がある。
});
