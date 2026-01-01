import * as assert from 'assert';
import { buildCodeOnlyContent } from '../../../core/codeOnlyText';

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
  });
});
