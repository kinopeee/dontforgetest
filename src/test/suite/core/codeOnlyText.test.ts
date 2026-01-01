import * as assert from 'assert';
import { buildCodeOnlyContent, hasEmptyStringLiteralInCode } from '../../../core/codeOnlyText';

suite('codeOnlyText', () => {
  suite('buildCodeOnlyContent', () => {
    test('preserves code and newlines', () => {
      // Given: シンプルなコード
      const content = 'const x = 1;\nconst y = 2;';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: コードと改行がそのまま保持される
      assert.strictEqual(result, content);
    });

    test('replaces single-line comments with spaces', () => {
      // Given: ラインコメントを含むコード
      const content = 'const x = 1; // comment\nconst y = 2;';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: コメント部分が空白に置き換えられる
      assert.strictEqual(result.length, content.length);
      assert.ok(result.startsWith('const x = 1; '));
      assert.ok(result.includes('\n'));
      assert.ok(result.endsWith('const y = 2;'));
    });

    test('replaces block comments with spaces', () => {
      // Given: ブロックコメントを含むコード
      const content = 'const x = /* comment */ 1;';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: コメント部分が空白に置き換えられる
      assert.strictEqual(result.length, content.length);
      assert.ok(result.startsWith('const x = '));
      assert.ok(result.endsWith(' 1;'));
      // コメント部分は空白のみ
      assert.ok(!result.includes('comment'));
    });

    test('replaces multi-line block comments preserving newlines', () => {
      // Given: 複数行のブロックコメント
      const content = 'const x = 1;\n/* line1\nline2 */\nconst y = 2;';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 改行は保持され、コメント内容は空白に
      assert.strictEqual(result.length, content.length);
      const lines = result.split('\n');
      assert.strictEqual(lines.length, 4);
      assert.strictEqual(lines[0], 'const x = 1;');
      assert.strictEqual(lines[3], 'const y = 2;');
    });

    test('replaces single quote strings with spaces', () => {
      // Given: シングルクォート文字列
      const content = "const x = 'hello world';";

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 文字列内容が空白に置き換えられる
      assert.strictEqual(result.length, content.length);
      assert.ok(!result.includes('hello'));
    });

    test('replaces double quote strings with spaces', () => {
      // Given: ダブルクォート文字列
      const content = 'const x = "hello world";';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 文字列内容が空白に置き換えられる
      assert.strictEqual(result.length, content.length);
      assert.ok(!result.includes('hello'));
    });

    test('replaces template literals with spaces', () => {
      // Given: テンプレートリテラル
      const content = 'const x = `hello world`;';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 文字列内容が空白に置き換えられる
      assert.strictEqual(result.length, content.length);
      assert.ok(!result.includes('hello'));
    });

    test('handles escaped quotes in strings', () => {
      // Given: エスケープされたクォートを含む文字列
      const content = "const x = 'it\\'s a test';";

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 文字列全体が空白に置き換えられる
      assert.strictEqual(result.length, content.length);
      assert.ok(!result.includes('test'));
    });

    test('handles regex literals', () => {
      // Given: 正規表現リテラル
      const content = 'const x = /test pattern/gi;';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 正規表現内容が空白に置き換えられる
      assert.strictEqual(result.length, content.length);
      assert.ok(!result.includes('pattern'));
    });

    test('handles regex literals with escaped forward slashes', () => {
      // Given: エスケープされたスラッシュ（\/）を含む正規表現リテラル
      const content = 'const x = /test\\/pattern/gi; const y = 1;';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 正規表現内容が空白に置き換えられ、後続コードは保持される
      assert.strictEqual(result.length, content.length);
      assert.ok(!result.includes('pattern'));
      assert.ok(result.includes('const y = 1;'));
    });

    test('does not treat division operator as regex', () => {
      // Given: 除算演算子
      const content = 'const x = 10 / 2;';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 除算演算子はそのまま保持される
      assert.strictEqual(result, content);
    });

    test('handles template literal with expressions', () => {
      // Given: 式を含むテンプレートリテラル
      const content = 'const x = `value is ${y + 1}`;';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: ${...} 内のコードは保持される
      assert.strictEqual(result.length, content.length);
      assert.ok(result.includes('y + 1'));
      assert.ok(!result.includes('value is'));
    });

    test('does not leak template suffix text after ${...} expression', () => {
      // Given: ${...} の後にテンプレート文字列が続き、その後に通常コードが続く
      const content = 'const x = `prefix ${y + 1} suffix`; const z = 3;';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: ${...} 内のコードは保持され、テンプレート文字列部分は空白化される
      assert.strictEqual(result.length, content.length);
      assert.ok(result.includes('y + 1'));
      assert.ok(result.includes('const z = 3'));
      assert.ok(!result.includes('prefix'));
      assert.ok(!result.includes('suffix'));
    });

    test('handles complex nested structures', () => {
      // Given: 複雑なネスト構造
      const content = `
function test() {
  // comment with 'string'
  const x = "string with // comment";
  const regex = /pattern/;
  return \`template with \${x}\`;
}
`;

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 長さが維持される
      assert.strictEqual(result.length, content.length);
      // コメント内の文字列は空白に
      assert.ok(!result.includes("'string'"));
      // 文字列内のコメントパターンも空白に
      assert.ok(!result.includes('// comment'));
    });

    test('handles empty string (boundary)', () => {
      // Given: 空文字列
      const content = '';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 空文字列が返る
      assert.strictEqual(result, '');
    });

    test('handles whitespace-only input preserving newlines (boundary)', () => {
      // Given: 空白と改行のみ
      const content = '   \n\n   ';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 長さと改行数が維持される
      assert.strictEqual(result.length, content.length);
      assert.strictEqual(result.split('\n').length, content.split('\n').length);
    });

    test('handles comment-only input (boundary)', () => {
      // Given: コメントのみ（改行なし）
      const content = '// only comment';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 非コード領域は空白化される
      assert.strictEqual(result.length, content.length);
      assert.ok(!/\S/.test(result));
    });

    test('handles string-literal-only input (boundary)', () => {
      // Given: 文字列リテラルのみ
      const content = '"only string"';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 非コード領域は空白化される
      assert.strictEqual(result.length, content.length);
      assert.ok(!/\S/.test(result));
    });

    test('handles minimal one-character input (boundary)', () => {
      // Given: 最小限の入力（1文字）
      const content = 'x';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: そのまま保持される
      assert.strictEqual(result, 'x');
    });

    test('handles very long input without throwing (boundary)', () => {
      // Given: 非常に長い入力（ストレス/パフォーマンス確認）
      const content = Array.from({ length: 1000 }, () => 'const x = 1; // comment\n').join('');

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 例外なく、長さと改行が維持される
      assert.strictEqual(result.length, content.length);
      assert.strictEqual(result.split('\n').length, content.split('\n').length);
    });

    test('handles unclosed single-quote string (abnormal)', () => {
      // Given: 閉じられていないシングルクォート文字列
      const content = "const x = 'unclosed string";

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 例外なく、文字列内容は空白化される
      assert.strictEqual(result.length, content.length);
      assert.ok(!result.includes('unclosed'));
    });

    test('handles unclosed double-quote string (abnormal)', () => {
      // Given: 閉じられていないダブルクォート文字列
      const content = 'const x = "unclosed string';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 例外なく、文字列内容は空白化される
      assert.strictEqual(result.length, content.length);
      assert.ok(!result.includes('unclosed'));
    });

    test('handles unclosed block comment (abnormal)', () => {
      // Given: 閉じられていないブロックコメント
      const content = 'const x = 1;\n/* unclosed comment\nconst y = 2;';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 例外なく、コメント内容は空白化され、改行は保持される
      assert.strictEqual(result.length, content.length);
      assert.ok(result.includes('\n'));
      assert.ok(!result.includes('unclosed'));
    });

    test('handles unclosed template literal (abnormal)', () => {
      // Given: 閉じられていないテンプレートリテラル
      const content = 'const x = `unclosed template\nconst y = 2;';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 例外なく、テンプレート文字列部分は空白化され、改行は保持される
      assert.strictEqual(result.length, content.length);
      assert.ok(result.includes('\n'));
      assert.ok(!result.includes('unclosed'));
    });

    test('handles unterminated regex literal (abnormal)', () => {
      // Given: 閉じられていない正規表現リテラル
      const content = 'const x = /unterminated';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 例外なく、正規表現内容は空白化される
      assert.strictEqual(result.length, content.length);
      assert.ok(!result.includes('unterminated'));
    });

    test('handles string that ends with escape backslash (abnormal)', () => {
      // Given: エスケープ文字（\）で終わる（閉じクォートなし）
      const content = "const x = 'ends with backslash\\\\";

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 例外なく、文字列内容は空白化される
      assert.strictEqual(result.length, content.length);
      assert.ok(!result.includes('backslash'));
    });

    test('does not prematurely close template expression on brace inside string (regression)', () => {
      // Given: テンプレート式内の文字列に '}' が含まれる
      const content = "const x = `prefix ${foo('}')} suffix`; const y = 2;";

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: 後続の通常コードが維持される（早期終了してテンプレート扱いにならない）
      assert.strictEqual(result.length, content.length);
      assert.ok(result.includes('foo('));
      assert.ok(result.includes('const y = 2;'));
      assert.ok(!result.includes('prefix'));
      assert.ok(!result.includes('suffix'));
    });

    test('handles nested template literals inside template expression (regression)', () => {
      // Given: テンプレート式内にネストしたテンプレートリテラルがある
      const content = 'const x = `a ${`b ${c}`}`; const y = 2;';

      // When: codeOnlyContent を生成する
      const result = buildCodeOnlyContent(content);

      // Then: ネストを含めて破綻せず、後続コードが維持される
      assert.strictEqual(result.length, content.length);
      assert.ok(result.includes('c'));
      assert.ok(result.includes('const y = 2;'));
      assert.ok(!result.includes('a '));
      assert.ok(!result.includes('b '));
    });
  });

  suite('hasEmptyStringLiteralInCode', () => {
    suite('Detection of empty string literals in code', () => {
      test('detects empty single-quote string', () => {
        // Given: コード内に空のシングルクォート文字列がある
        const content = "const x = '';";

        // When: 空文字リテラルをチェックする
        const result = hasEmptyStringLiteralInCode(content);

        // Then: true が返される
        assert.strictEqual(result, true);
      });

      test('detects empty double-quote string', () => {
        // Given: コード内に空のダブルクォート文字列がある
        const content = 'const x = "";';

        // When: 空文字リテラルをチェックする
        const result = hasEmptyStringLiteralInCode(content);

        // Then: true が返される
        assert.strictEqual(result, true);
      });

      test('detects empty template literal', () => {
        // Given: コード内に空のテンプレートリテラルがある
        const content = 'const x = ``;';

        // When: 空文字リテラルをチェックする
        const result = hasEmptyStringLiteralInCode(content);

        // Then: true が返される
        assert.strictEqual(result, true);
      });

      test('detects empty string inside template expression', () => {
        // Given: テンプレート式 ${...} 内に空文字リテラルがある
        // NOTE: テスト内容が文字列として誤検出されないよう、組み立てる
        const content = "const x = `prefix ${fn('')} suffix`;";

        // When: 空文字リテラルをチェックする
        const result = hasEmptyStringLiteralInCode(content);

        // Then: true が返される
        assert.strictEqual(result, true);
      });
    });

    suite('Non-detection of false positives', () => {
      test('does not detect non-empty single-quote string', () => {
        // Given: 空でないシングルクォート文字列
        const content = "const x = 'a';";

        // When: 空文字リテラルをチェックする
        const result = hasEmptyStringLiteralInCode(content);

        // Then: false が返される
        assert.strictEqual(result, false);
      });

      test('does not detect non-empty double-quote string', () => {
        // Given: 空でないダブルクォート文字列
        const content = 'const x = "a";';

        // When: 空文字リテラルをチェックする
        const result = hasEmptyStringLiteralInCode(content);

        // Then: false が返される
        assert.strictEqual(result, false);
      });

      test('does not detect whitespace-only string as empty', () => {
        // Given: 空白のみを含む文字列（空文字ではない）
        const content = "const x = ' ';";

        // When: 空文字リテラルをチェックする
        const result = hasEmptyStringLiteralInCode(content);

        // Then: false が返される
        assert.strictEqual(result, false);
      });

      test('does not detect empty quotes inside line comment', () => {
        // Given: ラインコメント内に '' がある
        const content = "const x = 1; // ''";

        // When: 空文字リテラルをチェックする
        const result = hasEmptyStringLiteralInCode(content);

        // Then: false が返される（コメント内は無視）
        assert.strictEqual(result, false);
      });

      test('does not detect empty quotes inside block comment', () => {
        // Given: ブロックコメント内に '' がある
        const content = "const x = 1; /* '' */";

        // When: 空文字リテラルをチェックする
        const result = hasEmptyStringLiteralInCode(content);

        // Then: false が返される
        assert.strictEqual(result, false);
      });

      test('does not detect empty quotes inside string literal', () => {
        // Given: 文字列リテラルの内容として '' がある
        const content = 'const x = "\'\'";';

        // When: 空文字リテラルをチェックする
        const result = hasEmptyStringLiteralInCode(content);

        // Then: false が返される（文字列内容は無視）
        assert.strictEqual(result, false);
      });

      test('does not detect empty quotes inside regex literal', () => {
        // Given: 正規表現リテラル内に '' がある
        const content = "const re = /''/;";

        // When: 空文字リテラルをチェックする
        const result = hasEmptyStringLiteralInCode(content);

        // Then: false が返される
        assert.strictEqual(result, false);
      });

      test('does not detect empty quotes inside template string part', () => {
        // Given: テンプレートリテラルの文字列部分に '' テキストがある
        const content = "const x = `the text is ''`;";

        // When: 空文字リテラルをチェックする
        const result = hasEmptyStringLiteralInCode(content);

        // Then: false が返される
        assert.strictEqual(result, false);
      });
    });

    suite('Edge cases', () => {
      test('returns false for empty input', () => {
        // Given: 空のコンテンツ
        const content = '';

        // When: 空文字リテラルをチェックする
        const result = hasEmptyStringLiteralInCode(content);

        // Then: false が返される
        assert.strictEqual(result, false);
      });

      test('returns false for code without any string literals', () => {
        // Given: 文字列リテラルがないコード
        const content = 'const x = 1 + 2;';

        // When: 空文字リテラルをチェックする
        const result = hasEmptyStringLiteralInCode(content);

        // Then: false が返される
        assert.strictEqual(result, false);
      });

      test('handles escaped quotes correctly', () => {
        // Given: エスケープされたクォートを含む非空文字列
        const content = "const x = '\\'';";

        // When: 空文字リテラルをチェックする
        const result = hasEmptyStringLiteralInCode(content);

        // Then: false が返される
        assert.strictEqual(result, false);
      });

      test('detects empty string after non-empty string', () => {
        // Given: 非空文字列の後に空文字列がある
        const content = "const x = 'hello'; const y = '';";

        // When: 空文字リテラルをチェックする
        const result = hasEmptyStringLiteralInCode(content);

        // Then: true が返される
        assert.strictEqual(result, true);
      });
    });
  });
});
