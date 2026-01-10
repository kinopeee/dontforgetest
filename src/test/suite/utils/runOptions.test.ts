/**
 * resolveRunOptions 関数のテスト
 *
 * このファイルは src/utils/runOptions.ts の resolveRunOptions 関数をテストする。
 * 設定値とオプションの優先順位、デフォルト値、境界値テストを含む。
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  resolveRunOptions,
  type ResolveRunOptionsInput,
} from '../../../utils/runOptions';

suite('utils/runOptions.ts', () => {
  suite('resolveRunOptions', () => {
    // TC-RO-N-01: runMode='full', runLocation='local' の正常系
    test('TC-RO-N-01: runMode="full", runLocation="local" で正しく解決される', () => {
      // Given: runMode='full', runLocation='local' のオプション
      const options: ResolveRunOptionsInput = {
        runMode: 'full',
        runLocation: 'local',
      };

      // When: resolveRunOptions を呼び出す
      const result = resolveRunOptions(options);

      // Then: runMode='full', effectiveRunLocation='local' が返される
      assert.ok(result !== undefined, '結果が undefined でないこと');
      assert.strictEqual(result.runMode, 'full', 'runMode は full');
      assert.strictEqual(result.effectiveRunLocation, 'local', 'effectiveRunLocation は local');
    });

    // TC-RO-N-02: runMode='perspectiveOnly' の場合、runLocation は強制的に 'local' になる
    test('TC-RO-N-02: runMode="perspectiveOnly" の場合、runLocation="worktree" でも effectiveRunLocation は "local" になる', () => {
      // Given: runMode='perspectiveOnly', runLocation='worktree' のオプション
      const options: ResolveRunOptionsInput = {
        runMode: 'perspectiveOnly',
        runLocation: 'worktree',
      };

      // When: resolveRunOptions を呼び出す
      const result = resolveRunOptions(options);

      // Then: runMode='perspectiveOnly', effectiveRunLocation='local' が返される（強制）
      assert.ok(result !== undefined, '結果が undefined でないこと');
      assert.strictEqual(result.runMode, 'perspectiveOnly', 'runMode は perspectiveOnly');
      assert.strictEqual(result.effectiveRunLocation, 'local', 'effectiveRunLocation は local（強制）');
    });

    // TC-RO-N-03: runMode='full', runLocation='worktree', extensionContext あり
    test('TC-RO-N-03: runMode="full", runLocation="worktree", extensionContext ありで正しく解決される', () => {
      // Given: runMode='full', runLocation='worktree', extensionContext ありのオプション
      const mockExtensionContext = {} as vscode.ExtensionContext;
      const options: ResolveRunOptionsInput = {
        runMode: 'full',
        runLocation: 'worktree',
        extensionContext: mockExtensionContext,
      };

      // When: resolveRunOptions を呼び出す
      const result = resolveRunOptions(options);

      // Then: runMode='full', effectiveRunLocation='worktree' が返される
      assert.ok(result !== undefined, '結果が undefined でないこと');
      assert.strictEqual(result.runMode, 'full', 'runMode は full');
      assert.strictEqual(result.effectiveRunLocation, 'worktree', 'effectiveRunLocation は worktree');
    });

    // TC-RO-E-01: runMode='full', runLocation='worktree', extensionContext なしでエラー
    test('TC-RO-E-01: runMode="full", runLocation="worktree", extensionContext なしで undefined が返され、エラーメッセージが表示される', () => {
      // Given: runMode='full', runLocation='worktree', extensionContext なしのオプション
      const options: ResolveRunOptionsInput = {
        runMode: 'full',
        runLocation: 'worktree',
        extensionContext: undefined,
      };

      // Given: showErrorMessage をスタブ化してメッセージをキャプチャ
      const originalShowError = vscode.window.showErrorMessage;
      const capturedErrors: string[] = [];
      (vscode.window as unknown as { showErrorMessage: typeof vscode.window.showErrorMessage }).showErrorMessage = async (message: string) => {
        capturedErrors.push(message);
        return undefined;
      };

      try {
        // When: resolveRunOptions を呼び出す
        const result = resolveRunOptions(options);

        // Then: undefined が返される
        assert.strictEqual(result, undefined, 'extensionContext なしで worktree モードは undefined を返す');

        // Then: showErrorMessage が呼び出される
        assert.strictEqual(capturedErrors.length, 1, 'showErrorMessage が1回呼び出される');
        assert.ok(capturedErrors[0].length > 0, 'エラーメッセージが空でない');
      } finally {
        // クリーンアップ: 元の関数を復元
        (vscode.window as unknown as { showErrorMessage: typeof originalShowError }).showErrorMessage = originalShowError;
      }
    });

    // TC-RO-B-01: runMode が undefined の場合、デフォルトで 'full' になる
    test('TC-RO-B-01: runMode が undefined の場合、デフォルトで "full" になる', () => {
      // Given: runMode が undefined のオプション
      const options: ResolveRunOptionsInput = {
        runMode: undefined,
        runLocation: 'local',
      };

      // When: resolveRunOptions を呼び出す
      const result = resolveRunOptions(options);

      // Then: runMode='full' がデフォルトで設定される
      assert.ok(result !== undefined, '結果が undefined でないこと');
      assert.strictEqual(result.runMode, 'full', 'runMode はデフォルトで full');
    });

    // TC-RO-B-02: runLocation が undefined の場合、デフォルトで 'local' になる
    test('TC-RO-B-02: runLocation が undefined の場合、デフォルトで "local" になる', () => {
      // Given: runLocation が undefined のオプション
      const options: ResolveRunOptionsInput = {
        runMode: 'full',
        runLocation: undefined,
      };

      // When: resolveRunOptions を呼び出す
      const result = resolveRunOptions(options);

      // Then: effectiveRunLocation='local' がデフォルトで設定される
      assert.ok(result !== undefined, '結果が undefined でないこと');
      assert.strictEqual(result.effectiveRunLocation, 'local', 'effectiveRunLocation はデフォルトで local');
    });

    // TC-RO-B-03: すべてのオプションが undefined の場合、デフォルト値が使用される
    test('TC-RO-B-03: すべてのオプションが undefined の場合、デフォルト値が使用される', () => {
      // Given: すべてのオプションが undefined
      const options: ResolveRunOptionsInput = {};

      // When: resolveRunOptions を呼び出す
      const result = resolveRunOptions(options);

      // Then: runMode='full', effectiveRunLocation='local' がデフォルトで設定される
      assert.ok(result !== undefined, '結果が undefined でないこと');
      assert.strictEqual(result.runMode, 'full', 'runMode はデフォルトで full');
      assert.strictEqual(result.effectiveRunLocation, 'local', 'effectiveRunLocation はデフォルトで local');
    });

    // TC-RO-B-04: runMode が 'perspectiveOnly' 以外の文字列の場合、'full' として扱われる
    test('TC-RO-B-04: runMode が "perspectiveOnly" 以外の値の場合、"full" として扱われる', () => {
      // Given: runMode が 'perspectiveOnly' 以外の値（型アサーションでテスト）
      const options: ResolveRunOptionsInput = {
        runMode: 'invalid' as 'full' | 'perspectiveOnly',
        runLocation: 'local',
      };

      // When: resolveRunOptions を呼び出す
      const result = resolveRunOptions(options);

      // Then: runMode='full' として扱われる
      assert.ok(result !== undefined, '結果が undefined でないこと');
      assert.strictEqual(result.runMode, 'full', '無効な runMode は full として扱われる');
    });

    // TC-RO-B-05: runLocation が 'worktree' 以外の文字列の場合、'local' として扱われる
    test('TC-RO-B-05: runLocation が "worktree" 以外の値の場合、"local" として扱われる', () => {
      // Given: runLocation が 'worktree' 以外の値（型アサーションでテスト）
      const options: ResolveRunOptionsInput = {
        runMode: 'full',
        runLocation: 'invalid' as 'local' | 'worktree',
      };

      // When: resolveRunOptions を呼び出す
      const result = resolveRunOptions(options);

      // Then: effectiveRunLocation='local' として扱われる
      assert.ok(result !== undefined, '結果が undefined でないこと');
      assert.strictEqual(result.effectiveRunLocation, 'local', '無効な runLocation は local として扱われる');
    });

    // TC-RO-N-04: runMode='perspectiveOnly', runLocation='local' の正常系
    test('TC-RO-N-04: runMode="perspectiveOnly", runLocation="local" で正しく解決される', () => {
      // Given: runMode='perspectiveOnly', runLocation='local' のオプション
      const options: ResolveRunOptionsInput = {
        runMode: 'perspectiveOnly',
        runLocation: 'local',
      };

      // When: resolveRunOptions を呼び出す
      const result = resolveRunOptions(options);

      // Then: runMode='perspectiveOnly', effectiveRunLocation='local' が返される
      assert.ok(result !== undefined, '結果が undefined でないこと');
      assert.strictEqual(result.runMode, 'perspectiveOnly', 'runMode は perspectiveOnly');
      assert.strictEqual(result.effectiveRunLocation, 'local', 'effectiveRunLocation は local');
    });

    // TC-RO-N-05: extensionContext が存在する場合でも local モードでは使用されない
    test('TC-RO-N-05: extensionContext が存在する場合でも local モードでは問題なく動作する', () => {
      // Given: runLocation='local', extensionContext ありのオプション
      const mockExtensionContext = {} as vscode.ExtensionContext;
      const options: ResolveRunOptionsInput = {
        runMode: 'full',
        runLocation: 'local',
        extensionContext: mockExtensionContext,
      };

      // When: resolveRunOptions を呼び出す
      const result = resolveRunOptions(options);

      // Then: 正常に解決される（extensionContext は無視される）
      assert.ok(result !== undefined, '結果が undefined でないこと');
      assert.strictEqual(result.effectiveRunLocation, 'local', 'effectiveRunLocation は local');
    });

    // TC-RO-B-06: perspectiveOnly モードで extensionContext がなくても成功する
    test('TC-RO-B-06: perspectiveOnly モードで extensionContext がなくても成功する', () => {
      // Given: runMode='perspectiveOnly', runLocation='worktree', extensionContext なし
      const options: ResolveRunOptionsInput = {
        runMode: 'perspectiveOnly',
        runLocation: 'worktree',
        extensionContext: undefined,
      };

      // When: resolveRunOptions を呼び出す
      const result = resolveRunOptions(options);

      // Then: perspectiveOnly は強制的に local になるため、extensionContext チェックをスキップ
      assert.ok(result !== undefined, '結果が undefined でないこと');
      assert.strictEqual(result.runMode, 'perspectiveOnly', 'runMode は perspectiveOnly');
      assert.strictEqual(result.effectiveRunLocation, 'local', 'effectiveRunLocation は local（強制）');
    });
  });
});
