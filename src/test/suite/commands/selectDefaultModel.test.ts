import * as assert from 'assert';
import * as selectDefaultModelModule from '../../../commands/selectDefaultModel';

suite('commands/selectDefaultModel.ts', () => {
  // TC-N-01: selectDefaultModel 関数がエクスポートされている
  // Given: selectDefaultModel モジュール
  // When: モジュールをインポート
  // Then: selectDefaultModel 関数が存在する
  test('TC-N-01: selectDefaultModel function should be exported', () => {
    // Given: selectDefaultModel モジュール
    // When: モジュールをインポート
    // Then: selectDefaultModel 関数が存在する
    assert.ok(
      typeof selectDefaultModelModule.selectDefaultModel === 'function',
      'selectDefaultModel should be a function',
    );
  });

  // TC-N-02: selectDefaultModel 関数は async 関数である
  // Given: selectDefaultModel 関数
  // When: 関数のプロパティを確認
  // Then: async 関数（Promise を返す）である
  test('TC-N-02: selectDefaultModel should be an async function', () => {
    // Given: selectDefaultModel 関数
    const fn = selectDefaultModelModule.selectDefaultModel;

    // When: 関数の constructor 名を確認
    // Then: AsyncFunction である
    assert.strictEqual(
      fn.constructor.name,
      'AsyncFunction',
      'selectDefaultModel should be an async function',
    );
  });

  // NOTE: VS Code の window.showQuickPick / showInputBox への依存が強く、
  // sinon 等のモックライブラリなしでは詳細なテストが困難。
  // 統合テストとして実際の UI 操作を伴うテストは手動で行うか、
  // e2e テストフレームワークを使用する必要がある。
});
