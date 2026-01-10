import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  analyzeFile,
  analyzeFileContent,
  analyzeTestFiles,
  getAnalysisSettings,
  saveAnalysisReport,
  type AnalysisResult,
} from '../../../core/testAnalyzer';
import { stubConfiguration, stubFileSystem } from '../testUtils/stubHelpers';

suite('testAnalyzer', () => {
  // NOTE: testAnalyzer の簡易パーサーは、文字列リテラル内の `test(` / `it(` を区別できない。
  //       そのため、このテスト内のサンプルコード（テンプレート文字列）まで「実テスト」と誤認し、
  //       テスト分析レポートで missing-gwt が過剰にカウントされる。
  //       サンプルコード上のキーワードは実行時に組み立てて埋め込む。
  const testFn = 'te' + 'st';
  const itFn = 'i' + 't';

  suite('analyzeFileContent', () => {
    // テスト観点表（追加分）: Given/When/Then 検出
    // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
    // |---------|----------------------|--------------------------------------|-----------------|-------|
    // | TC-B-08 | test() without name | Boundary – empty name | detail に <unknown> が含まれる | empty name |
    suite('Given/When/Then detection', () => {
      test('detects missing Given/When/Then comment in test function', () => {
        // Given: テストコードに Given/When/Then コメントがない
        const content = `
${testFn}('should return true', () => {
  const result = someFunction();
  assert.strictEqual(result, true);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-gwt の問題が検出される（厳格モードで Given/When/Then 全て不足）
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 1);
        assert.strictEqual(gwtIssues[0].file, 'test.test.ts');
        assert.ok(gwtIssues[0].detail.includes('should return true'));
        assert.ok(gwtIssues[0].detail.includes('Given'));
        assert.ok(gwtIssues[0].detail.includes('When'));
        assert.ok(gwtIssues[0].detail.includes('Then'));
      });

      test('TC-B-08: テスト名が無い場合は <unknown> が使われる', () => {
        // Given: test() に名前がないコード
        const content = `
${testFn}(() => {
  const value = 1;
  assert.strictEqual(value, 1);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-gwt に <unknown> が含まれる
        const gwtIssue = issues.find((i) => i.type === 'missing-gwt');
        assert.ok(gwtIssue?.detail.includes('<unknown>'));
      });

      test('does not report issue when Given/When/Then all exist', () => {
        // Given: テストコードに Given/When/Then コメントが全てある（厳格モード対応）
        const content = `
${testFn}('should return true', () => {
  // Given: some precondition
  const input = 'test';

  // When: action
  const result = someFunction(input);

  // Then: expected outcome
  assert.strictEqual(result, true);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-gwt の問題は検出されない
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 0);
      });

      test('detects missing Then comment when only Given/When exist (strict mode)', () => {
        // Given: テストコードに Given/When のみがあり Then がない
        const content = `
${testFn}('should return true', () => {
  // Given: precondition
  const input = 'test';

  // When: action
  const result = someFunction(input);
  assert.strictEqual(result, true);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-gwt の問題が検出される（Then が不足）
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 1);
        assert.ok(gwtIssues[0].detail.includes('Then'));
      });

      test('detects missing Given comment when only When/Then exist (strict mode)', () => {
        // Given: テストコードに When/Then のみがあり Given がない
        const content = `
${testFn}('should return true', () => {
  // When: calling the function
  const result = someFunction();

  // Then: expected outcome
  assert.strictEqual(result, true);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-gwt の問題が検出される（Given が不足）
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 1);
        assert.ok(gwtIssues[0].detail.includes('Given'));
      });

      test('does not report issue when Given/When/Then exist in leading comments right above test', () => {
        // Given: テスト本文内には Given/When/Then がないが、test の直前コメントに全てある
        const content = `
// Given: some precondition
// When: action
// Then: expected outcome
${testFn}('should return true', () => {
  const result = someFunction();
  assert.strictEqual(result, true);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-gwt の問題は検出されない
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 0);
      });

      test('detects missing Given/When/Then in it() function', () => {
        // Given: it() で定義されたテストに Given/When/Then がない
        const content = `
${itFn}('should work correctly', () => {
  expect(true).toBe(true);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-gwt の問題が検出される（厳格モードで Given/When/Then 全て不足）
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 1);
        assert.ok(gwtIssues[0].detail.includes('should work correctly'));
        assert.ok(gwtIssues[0].detail.includes('Given'));
      });

      test('detects multiple tests without Given/When/Then', () => {
        // Given: 複数のテストに Given/When/Then がない
        const content = `
${testFn}('first test', () => {
  assert.ok(true);
});

${testFn}('second test', () => {
  assert.ok(false);
});

${testFn}('third test with all comments', () => {
  // Given: some setup
  const x = 1;
  // When: action
  const y = x + 1;
  // Then: result
  assert.ok(y === 2);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: 2件の missing-gwt が検出される（3番目は全コメントあり）
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 2);
        assert.ok(gwtIssues[0].detail.includes('first test'));
        assert.ok(gwtIssues[1].detail.includes('second test'));
      });

      test('handles case-insensitive Given/When/Then comments', () => {
        // Given: 大文字小文字が混在した Given/When/Then コメント
        const content = `
${testFn}('case insensitive test', () => {
  // given: lowercase precondition
  const x = 1;
  // WHEN: uppercase action
  const y = x + 1;
  // tHen: mixed case result
  assert.ok(y === 2);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-gwt の問題は検出されない
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 0);
      });

      test('treats combined label line like "// When/Then: ..." as both When and Then', () => {
        // Given: When/Then を1行にまとめたコメントがある
        const content = `
${testFn}('combined label test', () => {
  // Given: setup
  const x = 1;

  // When/Then: action and assertion
  assert.ok(x === 1);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-gwt の問題は検出されない
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 0);
      });
    });

    suite('Boundary value test detection', () => {
      test('detects missing boundary value tests when no null/undefined/0/empty', () => {
        // Given: 境界値テストがないテストコード
        const content = `
${testFn}('normal test', () => {
  const result = someFunction('valid input');
  assert.strictEqual(result, 'expected');
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-boundary の問題が検出される
        const boundaryIssues = issues.filter((i) => i.type === 'missing-boundary');
        assert.strictEqual(boundaryIssues.length, 1);
        assert.strictEqual(boundaryIssues[0].file, 'test.test.ts');
      });

      test('does not report issue when null test exists', () => {
        // Given: null のテストがある
        const content = `
${testFn}('handles null', () => {
  const result = someFunction(null);
  assert.strictEqual(result, null);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-boundary の問題は検出されない
        const boundaryIssues = issues.filter((i) => i.type === 'missing-boundary');
        assert.strictEqual(boundaryIssues.length, 0);
      });

      test('does not report issue when undefined test exists', () => {
        // Given: undefined のテストがある
        const content = `
${testFn}('handles undefined', () => {
  const result = someFunction(undefined);
  assert.strictEqual(result, undefined);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-boundary の問題は検出されない
        const boundaryIssues = issues.filter((i) => i.type === 'missing-boundary');
        assert.strictEqual(boundaryIssues.length, 0);
      });

      test('does not report issue when zero comparison exists', () => {
        // Given: 0 との比較がある（=== 0 のパターン）
        const content = `
${testFn}('handles zero', () => {
  const result = someFunction(input);
  assert.strictEqual(result === 0, true);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-boundary の問題は検出されない
        const boundaryIssues = issues.filter((i) => i.type === 'missing-boundary');
        assert.strictEqual(boundaryIssues.length, 0);
      });

      test('does not report issue when only empty string test exists', () => {
        // Given: 空文字列のみのテストがある
        // NOTE: hasEmptyStringLiteralInCode により空文字リテラルが検出されるため、
        //       空文字のみでも境界値テストとして認識される。
        const content = `
${testFn}('handles empty string', () => {
  const result = someFunction('');
  assert.strictEqual(result, '');
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-boundary の問題は検出されない
        const boundaryIssues = issues.filter((i) => i.type === 'missing-boundary');
        assert.strictEqual(boundaryIssues.length, 0);
      });

      test('detects missing boundary when empty string exists only in comment', () => {
        // Given: コメント内にのみ '' がある（コード内には空文字がない）
        const content = `
${testFn}('test without boundary', () => {
  // Input: ''
  const result = someFunction('valid input');
  assert.strictEqual(result, 'expected');
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-boundary が検出される（コメント内の空文字はカウントされない）
        const boundaryIssues = issues.filter((i) => i.type === 'missing-boundary');
        assert.strictEqual(boundaryIssues.length, 1);
      });

      test('detects missing boundary when empty quotes exist only in string content', () => {
        // Given: 文字列内容として '' テキストがあるだけ（空文字リテラルではない）
        const content = `
${testFn}('test without boundary', () => {
  const msg = "The value is ''";
  assert.strictEqual(msg, "expected");
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-boundary が検出される（文字列内容の '' はカウントされない）
        const boundaryIssues = issues.filter((i) => i.type === 'missing-boundary');
        assert.strictEqual(boundaryIssues.length, 1);
      });

      test('does not report issue when empty array test exists', () => {
        // Given: 空配列のテストがある
        const content = `
${testFn}('handles empty array', () => {
  const result = someFunction([]);
  assert.deepStrictEqual(result, []);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-boundary の問題は検出されない
        const boundaryIssues = issues.filter((i) => i.type === 'missing-boundary');
        assert.strictEqual(boundaryIssues.length, 0);
      });

      test('does not report issue when file has no test functions', () => {
        // Given: テスト関数がないファイル
        const content = `
// This is a helper file
export function helper() {
  return 'help';
}
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('helper.ts', content);

        // Then: missing-boundary の問題は検出されない（テストファイルではないため）
        const boundaryIssues = issues.filter((i) => i.type === 'missing-boundary');
        assert.strictEqual(boundaryIssues.length, 0);
      });
    });

    suite('Exception message verification detection', () => {
      test('detects assert.throws without message verification', () => {
        // Given: assert.throws でメッセージを検証していないコード
        // NOTE: 本テストファイル自体がテスト分析の対象になるため、解析器が誤って検出しないよう
        //       "assert.throws" という生文字列をファイル内に残さず、実行時に組み立てる。
        const assertThrows = 'assert.' + 'throws';
        const content = `
${testFn}('throws error', () => {
  ${assertThrows}(() => badFunction());
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題が検出される
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 1);
        assert.ok(exceptionIssues[0].line !== undefined);
      });

      test('detects toThrow() without message verification', () => {
        // Given: toThrow() でメッセージを検証していないコード
        // NOTE: 本テストファイル自体がテスト分析の対象になるため、解析器が誤って検出しないよう
        //       ".toThrow(引数なし)" 相当の生文字列をファイル内に残さず、実行時に組み立てる。
        const toThrowNoArg = '.to' + 'Throw()';
        const content = `
${testFn}('throws error', () => {
  expect(() => badFunction())${toThrowNoArg};
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題が検出される
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 1);
      });

      // テスト観点表（追加分）: 例外メッセージ検証の追加分岐
      // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
      // |---------|----------------------|--------------------------------------|-----------------|-------|
      // | TC-E-02 | toThrow( の閉じ括弧が無い | Error – incomplete call | missing-exception-message が検出される | close paren 不在 |
      // | TC-E-03 | assert.throws(…, Error) | Error – type only | missing-exception-message が検出される | Error のみ |
      // | TC-B-03 | assert.throws の参照のみ | Boundary – no call | missing-exception-message が検出されない | "(" なし |
      // | TC-B-04 | assert.throws + 変数マッチャ | Boundary – unknown matcher | missing-exception-message が検出されない | 変数参照 |
      // | TC-N-03 | 複雑な assert.throws 引数 | Equivalence – complex args | missing-exception-message が検出されない | コメント/テンプレート含む |
      // | TC-N-04 | テンプレート式/正規表現 | Equivalence – template expr | missing-exception-message が検出されない | escape/comment/regex |
      test('TC-E-02: toThrow の閉じ括弧が無い場合でも解析が継続される', () => {
        // Given: toThrow( の閉じ括弧が無いコード
        const toThrowOpen = '.to' + 'Throw(';
        const content = `
${testFn}('throws error', () => {
  // Given: setup
  // When: execute
  // Then: expect error
  expect(() => badFunction())${toThrowOpen}
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題が検出される
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 1);
      });

      test('TC-N-03: 複雑な assert.throws 引数でも解析できる', () => {
        // Given: コメント/テンプレート/正規表現を含む assert.throws
        const assertThrows = 'assert.' + 'throws';
        const nestedTemplate = '`a${`' + 'b${c}' + '`}`';
        const content = `
${testFn}('complex throws', () => {
  ${assertThrows}(
    () => {
      // line comment
      const tmpl = ${nestedTemplate};
      const ok = /err/.test(tmpl);
      const data = { key: ['x', 'y'] };
      /* block comment */
      return ok ? data['key'][0] : null;
    },
    { message: 'expected' },
  );
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題は検出されない
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 0);
      });

      test('TC-B-03: assert.throws の参照だけでは検出しない', () => {
        // Given: assert.throws を呼び出さないコード
        const assertThrows = 'assert.' + 'throws';
        const content = `
${testFn}('no call', () => {
  const ref = ${assertThrows};
  assert.strictEqual(typeof ref, 'function');
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題は検出されない
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 0);
      });

      test('TC-E-03: assert.throws が Error のみを指定すると検出される', () => {
        // Given: assert.throws の第2引数が Error のみ
        const assertThrows = 'assert.' + 'throws';
        const content = `
${testFn}('type only', () => {
  ${assertThrows}(() => badFunction(), Error);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題が検出される
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 1);
      });

      test('TC-B-04: assert.throws の第2引数が変数でも許可される', () => {
        // Given: 変数参照の matcher を指定した assert.throws
        const assertThrows = 'assert.' + 'throws';
        const content = `
${testFn}('variable matcher', () => {
  const matcher = (err) => err instanceof Error;
  ${assertThrows}(() => badFunction(), matcher);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題は検出されない
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 0);
      });

      test('TC-N-04: テンプレート式と正規表現を含む assert.throws を解析できる', () => {
        // Given: テンプレート式内にコメント/正規表現/括弧を含む assert.throws
        const assertThrows = 'assert.' + 'throws';
        const content = [
          `${testFn}('template args', () => {`,
          `  ${assertThrows}(`,
          '    () => {',
          "      const escaped = 'a\\\\n';",
          '      const quoted = "c\\\\n";',
          '      const value = 1;',
          '      const message = `prefix \\\\${(value ? { a: [1, 2] } : [\'x\']) /* block */ // line comment',
          '      } ${/err/.test(\'err\') ? \'ok\' : "ng"}`;',
          '      return message;',
          '    },',
          '    new RegExp("expected"),',
          '  );',
          '});',
        ].join('\n');

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題は検出されない
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 0);
      });

      test('does not report issue when assert.throws has message parameter', () => {
        // Given: assert.throws でメッセージを検証しているコード
        const content = `
${testFn}('throws error with message', () => {
  assert.throws(() => badFunction(), /expected error/);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題は検出されない
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 0);
      });

      test('does not report issue when assert.throws has message parameter in multi-line call', () => {
        // Given: assert.throws の第2引数が改行後に続く（一般的な整形）
        const content = `
${testFn}('throws error with message', () => {
  assert.throws(
    () => badFunction(),
    /expected error/,
  );
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題は検出されない
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 0);
      });

      test('does not break when nested template literals exist inside callback (parseCallArgsWithRanges)', () => {
        // Given: assert.throws の第1引数（関数本体）内に、`${...}` 式内でネストしたテンプレートリテラルがある
        // NOTE:
        // - これが正しく処理されないと、内側テンプレートの `)` で parenDepth が壊れ、
        //   第2引数（/expected error/）が存在しても「メッセージ検証なし」と誤判定されうる。
        const assertThrows = 'assert.' + 'throws';
        const content = [
          `${testFn}('throws error with nested template', () => {`,
          `  ${assertThrows}(() => {`,
          "    const msg = `outer ${`inner)`} text`;",
          '    badFunction();',
          '  }, /expected error/);',
          '});',
          '',
        ].join('\n');

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題は検出されない
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 0);
      });

      test('does not mis-detect division after string literal as regex start in assert.throws args (regression)', () => {
        // Given: 第1引数内に「文字列リテラル直後の /（除算）」がある assert.throws
        // NOTE:
        // - parseCallArgsWithRanges の正規表現開始判定が誤ると、第1引数の除算 "/" を正規表現開始と誤認し、
        //   引数区切りの "," が無視されて第2引数（/expected/）が正しく切り出せなくなる。
        // - その結果、メッセージ検証あり（OK）なのに missing-exception-message が誤検出されうる。
        const content = `
${testFn}('throws error with message and division after string', () => {
  assert.throws(
    () => badFunction('error' / 2),
    /expected error/,
  );
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題は検出されない（第2引数の正規表現が正しく解析される）
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 0);
      });

      test('does not report issue when toThrow has message parameter', () => {
        // Given: toThrow() でメッセージを検証しているコード
        const content = `
${testFn}('throws error with message', () => {
  expect(() => badFunction()).toThrow('expected error');
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題は検出されない
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 0);
      });

      test('detects assert.throws with type only (strict mode - NG)', () => {
        // Given: assert.throws で型のみ指定しているコード（メッセージ未検証）
        const content = `
${testFn}('throws TypeError', () => {
  // Given: some setup
  // When: calling bad function
  // Then: throws error
  assert.throws(() => badFunction(), TypeError);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題が検出される（型のみはNG）
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 1);
      });

      test('does not report issue when assert.throws has message object', () => {
        // Given: assert.throws で { name, message } オブジェクトを使用しているコード
        const content = `
${testFn}('throws error with message object', () => {
  assert.throws(
    () => badFunction(),
    { name: 'TypeError', message: /expected/ },
  );
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題は検出されない
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 0);
      });

      test('does not report issue when assert.throws has validator function checking message', () => {
        // Given: assert.throws でバリデータ関数がメッセージを検証しているコード
        const content = `
${testFn}('throws error with validator', () => {
  // Given: setup
  // When: calling bad function
  // Then: throws error with message validation
  assert.throws(
    () => badFunction(),
    (err) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes('expected'));
      return true;
    },
  );
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題は検出されない
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 0);
      });

      test('does not report issue when assert.throws validator checks message using /\\S/ regex (regression)', () => {
        // Given: assert.throws のバリデータ内で /\S/ を使ってメッセージの非空を検証している
        // NOTE:
        // - 正規表現リテラルの開始判定が誤ると、引数解析が壊れて「メッセージ検証なし」と誤判定されうるため回帰テストにする。
        const content = `
${testFn}('throws error with validator and non-empty regex', () => {
  // Given: setup
  // When: calling bad function
  // Then: throws error with message validation
  assert.throws(
    () => badFunction(),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      const message = err instanceof Error ? err.message : String(err);
      assert.ok(/\\S/.test(message), 'メッセージが空ではないこと');
      return true;
    },
  );
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-exception-message の問題は検出されない
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 0);
      });

      test('detects multiple exception issues in same file', () => {
        // Given: 複数の例外検証問題があるコード
        // NOTE: 本テストファイル自体がテスト分析の対象になるため、解析器が誤って検出しないよう
        //       検出対象トークンは実行時に組み立てる。
        const assertThrows = 'assert.' + 'throws';
        const toThrowNoArg = '.to' + 'Throw()';
        const content = `
${testFn}('first throws', () => {
  ${assertThrows}(() => fn1());
});

${testFn}('second throws', () => {
  expect(() => fn2())${toThrowNoArg};
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: 2件の missing-exception-message が検出される
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 2);
      });
    });

    suite('Code-only content (false positive prevention)', () => {
      test('does not detect test() in string literals', () => {
        // Given: 文字列リテラル内に test( がある（実際のテストではない）
        const content = `
${testFn}('actual test', () => {
  // Given: setup
  const x = 1;
  // When: action
  const msg = 'This is not a te' + 'st() call in a string';
  // Then: result
  assert.ok(msg);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: 実際のテストのみが検出され、文字列内は無視される
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 0);
      });

      test('does not detect test() in comments', () => {
        // Given: コメント内に test( がある（実際のテストではない）
        const content = `
// This comment mentions te` + `st( but it's not a real test
/* Another comment with te` + `st() pattern */
${testFn}('actual test', () => {
  // Given: setup
  // When: action
  // Then: result
  assert.ok(true);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: 実際のテストのみが検出される
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 0);
      });

      test('does not detect assert.throws in string literals', () => {
        // Given: 文字列リテラル内に assert.throws がある
        const assertThrowsStr = 'assert.' + 'throws';
        const content = `
${testFn}('test with string containing assert.throws', () => {
  // Given: setup
  // When: action
  // Then: result
  const docs = \`Use ${assertThrowsStr}() to test exceptions\`;
  assert.ok(docs);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: 文字列内の assert.throws は検出されない
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 0);
      });

      test('does not detect .toThrow() in template literals', () => {
        // Given: テンプレートリテラル内に .toThrow() がある
        const toThrowNoArg = '.to' + 'Throw()';
        const content = `
${testFn}('test with template containing toThrow', () => {
  // Given: setup
  // When: action
  // Then: result
  const docs = \`Use expect()${toThrowNoArg} for Jest\`;
  assert.ok(docs);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: テンプレートリテラル内の .toThrow() は検出されない
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 0);
      });

      test('does not detect boundary values in string literals (false positive)', () => {
        // Given: 文字列リテラル内のみに null がある（実際の境界値テストではない）
        const content = `
${testFn}('test with null in string only', () => {
  // Given: setup
  // When: action
  // Then: result
  const msg = 'The value was nu' + 'll';
  assert.ok(msg);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: 文字列内の null は境界値テストとしてカウントされない
        const boundaryIssues = issues.filter((i) => i.type === 'missing-boundary');
        assert.strictEqual(boundaryIssues.length, 1);
      });
    });

    suite('Edge cases', () => {
      test('handles empty file content', () => {
        // Given: 空のファイル内容
        const content = '';

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('empty.test.ts', content);

        // Then: 問題は検出されない
        assert.strictEqual(issues.length, 0);
      });

      test('handles file with only comments', () => {
        // Given: コメントのみのファイル
        const content = `
// This is a comment
/* Multi-line
   comment */
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('comments.test.ts', content);

        // Then: 問題は検出されない
        assert.strictEqual(issues.length, 0);
      });

      test('handles test with double quotes', () => {
        // Given: ダブルクォートを使用したテスト（GWTなし）
        const content = `
${testFn}("should work", () => {
  assert.ok(true);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-gwt が検出される（Given/When/Then 全て不足）
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 1);
        assert.ok(gwtIssues[0].detail.includes('should work'));
      });

      test('handles test with template literals', () => {
        // Given: テンプレートリテラルを使用したテスト（GWTなし）
        const content = `
${testFn}(\`should work\`, () => {
  assert.ok(true);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-gwt が検出される（Given/When/Then 全て不足）
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 1);
        assert.ok(gwtIssues[0].detail.includes('should work'));
      });
    });
  });

  // テスト観点表（追加分）: ファイルI/Oとテーブル生成
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-N-01 | saveAnalysisReport with valid paths | Equivalence – normal | レポートが保存されパスが返る | 0/min/max/±1 は対象外 |
  // | TC-N-02 | analyzeTestFiles with two empty files | Equivalence – normal | analyzedFiles=2 で issues が空 | findFiles/readFile の成功経路 |
  // | TC-N-03 | analyzeFile with readable file | Equivalence – normal | analyzedFiles=1 で issues が空 | 0 は content 内で使用 |
  // | TC-N-04 | analyzeTestFiles with missing GWT | Equivalence – normal | missing-gwt が検出される | null/undefined/empty は対象外 |
  // | TC-E-01 | analyzeFile with unreadable file | Error – read failure | analyzedFiles=0 で issues が空 | readFile 例外を捕捉 |

  suite('saveAnalysisReport / analyzeFile', () => {
    test('TC-N-01: saveAnalysisReport がレポートを保存しパスを返す', async () => {
      // Given: 保存先を含む分析結果
      const workspaceRoot = path.join(process.cwd(), 'tmp', 'test-analysis-report');
      const reportDir = 'docs/test-analysis-reports';
      const result: AnalysisResult = {
        analyzedFiles: 1,
        issues: [],
        summary: {
          missingGwt: 0,
          missingBoundary: 0,
          missingExceptionMessage: 0,
        },
        pattern: 'src/test/example.test.ts',
      };

      // When: saveAnalysisReport を呼び出す
      const savedPath = await saveAnalysisReport(workspaceRoot, result);

      try {
        // Then: パスが整合し、ファイルが保存される
        const expectedRelative = path.relative(workspaceRoot, savedPath);
        assert.ok(savedPath.endsWith(expectedRelative), '相対パスが正しい');

        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(savedPath));
        assert.ok(stat.size >= 0, 'レポートファイルが存在する');

        const content = (await vscode.workspace.fs.readFile(vscode.Uri.file(savedPath))).toString();
        assert.ok(content.includes(result.pattern), 'レポートに対象パターンが含まれる');
      } finally {
        // テスト後の後始末
        await vscode.workspace.fs.delete(vscode.Uri.file(path.join(workspaceRoot, reportDir)), { recursive: true, useTrash: false });
      }
    });

    test('TC-N-02: analyzeTestFiles は複数ファイルを解析する', async () => {
      // Given: findFiles で2件の空ファイルが返る
      const workspaceRoot = path.join(process.cwd(), 'tmp', 'test-analysis-findfiles');
      const files = [
        path.join(workspaceRoot, 'a.test.ts'),
        path.join(workspaceRoot, 'b.test.ts'),
      ];
      const originalFindFiles = vscode.workspace.findFiles;
      const restoreFs = stubFileSystem(
        (fsPath) => files.includes(fsPath),
        () => Buffer.from('', 'utf8'),
      );
      (vscode.workspace as unknown as { findFiles?: typeof vscode.workspace.findFiles }).findFiles = async () =>
        files.map((filePath) => vscode.Uri.file(filePath));

      try {
        // When: analyzeTestFiles を呼び出す
        const result = await analyzeTestFiles(workspaceRoot, 'src/test/**/*.test.ts');

        // Then: analyzedFiles が一致し、issues は空
        assert.strictEqual(result.analyzedFiles, 2);
        assert.strictEqual(result.issues.length, 0);
        assert.strictEqual(result.pattern, 'src/test/**/*.test.ts');
      } finally {
        restoreFs();
        (vscode.workspace as unknown as { findFiles?: typeof vscode.workspace.findFiles }).findFiles = originalFindFiles;
      }
    });

    test('TC-N-03: analyzeFile は読み取り成功時に analyzedFiles=1 を返す', async () => {
      // Given: 読み取れるファイル
      const workspaceRoot = process.cwd();
      const dirPath = path.join(workspaceRoot, 'tmp', 'test-analysis-readable');
      const filePath = path.join(dirPath, 'readable.test.ts');
      const content = `
${testFn}('has gwt and boundary', () => {
  // Given: setup
  // When: execute
  // Then: verify
  const value = 0;
  assert.ok(value === 0);
  assert.strictEqual(value, 0);
});
`;

      try {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));
        await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content, 'utf8'));

        // When: analyzeFile を呼び出す
        const result = await analyzeFile(filePath, workspaceRoot);

        // Then: analyzedFiles=1 で issues が空
        assert.strictEqual(result.analyzedFiles, 1);
        assert.strictEqual(result.issues.length, 0);
        assert.strictEqual(result.pattern, path.relative(workspaceRoot, filePath));
      } finally {
        await vscode.workspace.fs.delete(vscode.Uri.file(dirPath), { recursive: true, useTrash: false });
      }
    });

    test('TC-N-04: analyzeTestFiles は missing-gwt を検出する', async () => {
      // Given: Given/When/Then がないテストファイル
      const workspaceRoot = path.join(process.cwd(), 'tmp', 'test-analysis-gwt');
      const filePath = path.join(workspaceRoot, 'gwt-missing.test.ts');
      const content = `
${testFn}('missing gwt', () => {
  const value = null;
  assert.strictEqual(value, null);
});
`;
      const originalFindFiles = vscode.workspace.findFiles;
      (vscode.workspace as unknown as { findFiles?: typeof vscode.workspace.findFiles }).findFiles = async () => [
        vscode.Uri.file(filePath),
      ];

      try {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(workspaceRoot));
        await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content, 'utf8'));

        // When: analyzeTestFiles を呼び出す
        const result = await analyzeTestFiles(workspaceRoot, 'src/test/**/*.test.ts');

        // Then: missing-gwt が検出される
        const gwtIssues = result.issues.filter((issue) => issue.type === 'missing-gwt');
        assert.strictEqual(result.analyzedFiles, 1);
        assert.strictEqual(gwtIssues.length, 1);
      } finally {
        await vscode.workspace.fs.delete(vscode.Uri.file(workspaceRoot), { recursive: true, useTrash: false });
        (vscode.workspace as unknown as { findFiles?: typeof vscode.workspace.findFiles }).findFiles = originalFindFiles;
      }
    });

    test('TC-E-01: 読み取り失敗時は analyzedFiles=0 になる', async () => {
      // Given: 読み取りに失敗するファイル
      const restoreFs = stubFileSystem(() => false, () => new Uint8Array());
      const filePath = path.join(process.cwd(), 'tmp', 'missing.test.ts');
      const workspaceRoot = process.cwd();

      try {
        // When: analyzeFile を呼び出す
        const result = await analyzeFile(filePath, workspaceRoot);

        // Then: analyzedFiles=0 で issues が空
        assert.strictEqual(result.analyzedFiles, 0);
        assert.strictEqual(result.issues.length, 0);
      } finally {
        restoreFs();
      }
    });
  });

  // テスト観点表（追加分）: getAnalysisSettings
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-N-05 | config has trimmed values | Equivalence – normal | trim 済みの値が返る | empty/null/undefined は対象外 |
  // | TC-B-02 | config values undefined/null | Boundary – null/undefined | デフォルト値が返る | null/undefined を確認 |
  suite('getAnalysisSettings', () => {
    test('TC-TA-N-01: returns default settings when no configuration is set', () => {
      // Given: デフォルト設定（特別な設定なし）
      // When: getAnalysisSettings を呼び出す
      const settings = getAnalysisSettings();

      // Then: デフォルト値が返される
      assert.ok(typeof settings.reportDir === 'string');
      assert.ok(typeof settings.testFilePattern === 'string');
      assert.ok(settings.reportDir.length > 0);
      assert.ok(settings.testFilePattern.length > 0);
    });

    test('TC-N-05: 設定値が trim されて返る', () => {
      // Given: trim が必要な設定値
      const restoreConfig = stubConfiguration({
        'dontforgetest.analysisReportDir': '  docs/custom-reports  ',
        'dontforgetest.analysisTestFilePattern': '  src/test/**/*.spec.ts  ',
      });

      try {
        // When: getAnalysisSettings を呼び出す
        const settings = getAnalysisSettings();

        // Then: trim 済みの値が返る
        assert.strictEqual(settings.reportDir, 'docs/custom-reports');
        assert.strictEqual(settings.testFilePattern, 'src/test/**/*.spec.ts');
      } finally {
        restoreConfig();
      }
    });

    test('TC-B-02: undefined/null 設定はデフォルトへフォールバックする', () => {
      // Given: undefined/null の設定値
      const restoreConfig = stubConfiguration({
        'dontforgetest.analysisReportDir': undefined,
        'dontforgetest.analysisTestFilePattern': null,
      });

      try {
        // When: getAnalysisSettings を呼び出す
        const settings = getAnalysisSettings();

        // Then: デフォルト値が返る
        assert.strictEqual(settings.reportDir, 'docs/test-analysis-reports');
        assert.strictEqual(settings.testFilePattern, 'src/test/**/*.test.ts');
      } finally {
        restoreConfig();
      }
    });
  });
});
