/**
 * clipboard.ts のテスト
 *
 * このファイルは src/ui/clipboard.ts の writeTextToClipboard 関数をテストする。
 * VS Code API のモックを使用して動作をシミュレートする。
 *
 * 注意: 実クリップボードを使用するため、suiteSetup/suiteTeardown で
 * 元のクリップボード内容を退避・復元し、他テストやユーザー環境への影響を抑える。
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { writeTextToClipboard } from '../../../ui/clipboard';

suite('ui/clipboard.ts', () => {
  // テスト開始前のクリップボード内容を退避
  let originalClipboardText: string | undefined;

  suiteSetup(async () => {
    // Given: テスト開始前のクリップボード内容を保存
    try {
      originalClipboardText = await vscode.env.clipboard.readText();
    } catch (err) {
      // クリップボード読み取りに失敗しても続行（環境依存）
      console.warn('クリップボード内容の退避に失敗しました（続行します）:', err);
      originalClipboardText = undefined;
    }
  });

  suiteTeardown(async () => {
    // クリーンアップ: テスト終了後に元のクリップボード内容を復元
    if (originalClipboardText !== undefined) {
      try {
        await vscode.env.clipboard.writeText(originalClipboardText);
      } catch (err) {
        // 復元に失敗しても続行
        console.warn('クリップボード内容の復元に失敗しました:', err);
      }
    }
  });

  suite('writeTextToClipboard', () => {
    // TC-CB-N-01: 正常系 - テキストがクリップボードに書き込まれる
    test('TC-CB-N-01: テキストがクリップボードに正しく書き込まれる', async () => {
      // Given: 書き込むテキスト
      const text = 'Hello, World!';

      // When: writeTextToClipboard を呼び出す
      await writeTextToClipboard(text);

      // Then: vscode.env.clipboard.readText で書き込んだテキストが取得できる
      const clipboardContent = await vscode.env.clipboard.readText();
      assert.strictEqual(clipboardContent, text, 'クリップボードに書き込んだテキストが取得できる');
    });

    // TC-CB-N-02: 空文字列をクリップボードに書き込む
    test('TC-CB-N-02: 空文字列をクリップボードに書き込める', async () => {
      // Given: 空文字列
      const text = '';

      // When: writeTextToClipboard を呼び出す
      await writeTextToClipboard(text);

      // Then: クリップボードに空文字列が書き込まれる
      const clipboardContent = await vscode.env.clipboard.readText();
      assert.strictEqual(clipboardContent, text, 'クリップボードに空文字列が書き込まれる');
    });

    // TC-CB-N-03: 長いテキストをクリップボードに書き込む
    test('TC-CB-N-03: 長いテキストをクリップボードに書き込める', async () => {
      // Given: 長いテキスト（1000文字）
      const text = 'a'.repeat(1000);

      // When: writeTextToClipboard を呼び出す
      await writeTextToClipboard(text);

      // Then: クリップボードに長いテキストが書き込まれる
      const clipboardContent = await vscode.env.clipboard.readText();
      assert.strictEqual(clipboardContent, text, 'クリップボードに長いテキストが書き込まれる');
    });

    // TC-CB-N-04: 日本語テキストをクリップボードに書き込む
    test('TC-CB-N-04: 日本語テキストをクリップボードに書き込める', async () => {
      // Given: 日本語テキスト
      const text = 'こんにちは、世界！';

      // When: writeTextToClipboard を呼び出す
      await writeTextToClipboard(text);

      // Then: クリップボードに日本語テキストが書き込まれる
      const clipboardContent = await vscode.env.clipboard.readText();
      assert.strictEqual(clipboardContent, text, 'クリップボードに日本語テキストが書き込まれる');
    });

    // TC-CB-N-05: 特殊文字を含むテキストをクリップボードに書き込む
    test('TC-CB-N-05: 特殊文字を含むテキストをクリップボードに書き込める', async () => {
      // Given: 特殊文字を含むテキスト
      const text = '!@#$%^&*()_+-=[]{}|;\':",./<>?`~';

      // When: writeTextToClipboard を呼び出す
      await writeTextToClipboard(text);

      // Then: クリップボードに特殊文字を含むテキストが書き込まれる
      const clipboardContent = await vscode.env.clipboard.readText();
      assert.strictEqual(clipboardContent, text, 'クリップボードに特殊文字を含むテキストが書き込まれる');
    });

    // TC-CB-N-06: 改行を含むテキストをクリップボードに書き込む
    test('TC-CB-N-06: 改行を含むテキストをクリップボードに書き込める', async () => {
      // Given: 改行を含むテキスト
      const text = 'Line 1\nLine 2\nLine 3';

      // When: writeTextToClipboard を呼び出す
      await writeTextToClipboard(text);

      // Then: クリップボードに改行を含むテキストが書き込まれる
      const clipboardContent = await vscode.env.clipboard.readText();
      assert.strictEqual(clipboardContent, text, 'クリップボードに改行を含むテキストが書き込まれる');
    });

    // TC-CB-N-07: タブ文字を含むテキストをクリップボードに書き込む
    test('TC-CB-N-07: タブ文字を含むテキストをクリップボードに書き込める', async () => {
      // Given: タブ文字を含むテキスト
      const text = 'Column1\tColumn2\tColumn3';

      // When: writeTextToClipboard を呼び出す
      await writeTextToClipboard(text);

      // Then: クリップボードにタブ文字を含むテキストが書き込まれる
      const clipboardContent = await vscode.env.clipboard.readText();
      assert.strictEqual(clipboardContent, text, 'クリップボードにタブ文字を含むテキストが書き込まれる');
    });

    // TC-CB-B-01: 境界値 - 1文字のテキスト
    test('TC-CB-B-01: 1文字のテキストをクリップボードに書き込める', async () => {
      // Given: 1文字のテキスト
      const text = 'a';

      // When: writeTextToClipboard を呼び出す
      await writeTextToClipboard(text);

      // Then: クリップボードに1文字のテキストが書き込まれる
      const clipboardContent = await vscode.env.clipboard.readText();
      assert.strictEqual(clipboardContent, text, 'クリップボードに1文字のテキストが書き込まれる');
    });

    // TC-CB-B-02: 境界値 - Unicode絵文字を含むテキスト
    test('TC-CB-B-02: Unicode絵文字を含むテキストをクリップボードに書き込める', async () => {
      // Given: Unicode絵文字を含むテキスト
      const text = 'Hello 🌍🎉✨';

      // When: writeTextToClipboard を呼び出す
      await writeTextToClipboard(text);

      // Then: クリップボードにUnicode絵文字を含むテキストが書き込まれる
      const clipboardContent = await vscode.env.clipboard.readText();
      assert.strictEqual(clipboardContent, text, 'クリップボードにUnicode絵文字を含むテキストが書き込まれる');
    });

    // TC-CB-N-08: 連続して異なるテキストを書き込む
    test('TC-CB-N-08: 連続して異なるテキストを書き込むと最後のテキストが保持される', async () => {
      // Given: 2つの異なるテキスト
      const text1 = 'First text';
      const text2 = 'Second text';

      // When: 連続して writeTextToClipboard を呼び出す
      await writeTextToClipboard(text1);
      await writeTextToClipboard(text2);

      // Then: クリップボードには最後に書き込んだテキストが保持される
      const clipboardContent = await vscode.env.clipboard.readText();
      assert.strictEqual(clipboardContent, text2, 'クリップボードには最後に書き込んだテキストが保持される');
    });

    // TC-CB-N-09: Promise が正しく解決される
    test('TC-CB-N-09: writeTextToClipboard は Promise を返し、正しく解決される', async () => {
      // Given: 書き込むテキスト
      const text = 'Promise test';

      // When: writeTextToClipboard を呼び出す
      const promise = writeTextToClipboard(text);

      // Then: Promise が正しく解決される
      assert.ok(promise instanceof Promise, 'writeTextToClipboard は Promise を返す');
      await assert.doesNotReject(promise, 'Promise は正しく解決される');
    });
  });
});
