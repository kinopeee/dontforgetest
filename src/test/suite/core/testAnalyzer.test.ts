import * as assert from 'assert';
import {
  analyzeFileContent,
  buildAnalysisReportMarkdown,
  getAnalysisSettings,
  type AnalysisIssue,
  type AnalysisResult,
  __test__ as testAnalyzerTest,
} from '../../../core/testAnalyzer';

suite('testAnalyzer', () => {
  // NOTE: testAnalyzer の簡易パーサーは、文字列リテラル内の `test(` / `it(` を区別できない。
  //       そのため、このテスト内のサンプルコード（テンプレート文字列）まで「実テスト」と誤認し、
  //       テスト分析レポートで missing-gwt が過剰にカウントされる。
  //       サンプルコード上のキーワードは実行時に組み立てて埋め込む。
  const testFn = 'te' + 'st';
  const itFn = 'i' + 't';

  suite('analyzeFileContent', () => {
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

  suite('buildAnalysisReportMarkdown', () => {
    test('generates report with no issues', () => {
      // Given: 問題がない分析結果
      const result: AnalysisResult = {
        analyzedFiles: 5,
        issues: [],
        summary: {
          missingGwt: 0,
          missingBoundary: 0,
          missingExceptionMessage: 0,
        },
        pattern: 'src/test/**/*.test.ts',
      };

      // When: レポートを生成する
      const markdown = buildAnalysisReportMarkdown(result, Date.now());

      // Then: 基本情報が含まれる
      assert.ok(markdown.includes('src/test/**/*.test.ts'));
      assert.ok(markdown.includes('5'));
    });

    test('generates report with multiple issues', () => {
      // Given: 複数の問題がある分析結果
      const issues: AnalysisIssue[] = [
        { type: 'missing-gwt', file: 'test1.test.ts', line: 10, detail: 'test case 1' },
        { type: 'missing-gwt', file: 'test2.test.ts', line: 20, detail: 'test case 2' },
        { type: 'missing-boundary', file: 'test3.test.ts', detail: 'no boundary tests' },
        { type: 'missing-exception-message', file: 'test4.test.ts', line: 30, detail: 'no message' },
      ];
      const result: AnalysisResult = {
        analyzedFiles: 4,
        issues,
        summary: {
          missingGwt: 2,
          missingBoundary: 1,
          missingExceptionMessage: 1,
        },
        pattern: 'src/test/**/*.test.ts',
      };

      // When: レポートを生成する
      const markdown = buildAnalysisReportMarkdown(result, Date.now());

      // Then: 各問題の情報が含まれる
      assert.ok(markdown.includes('test1.test.ts'));
      assert.ok(markdown.includes('test2.test.ts'));
      assert.ok(markdown.includes('test3.test.ts'));
      assert.ok(markdown.includes('test4.test.ts'));
      assert.ok(markdown.includes('2')); // missingGwt count
      assert.ok(markdown.includes('1')); // missingBoundary count
    });

    test('escapes pipe characters in table cells', () => {
      // Given: パイプ文字を含む詳細がある分析結果
      const issues: AnalysisIssue[] = [
        { type: 'missing-gwt', file: 'test.test.ts', line: 1, detail: 'test | with | pipes' },
      ];
      const result: AnalysisResult = {
        analyzedFiles: 1,
        issues,
        summary: {
          missingGwt: 1,
          missingBoundary: 0,
          missingExceptionMessage: 0,
        },
        pattern: 'test.test.ts',
      };

      // When: レポートを生成する
      const markdown = buildAnalysisReportMarkdown(result, Date.now());

      // Then: パイプ文字がエスケープされている
      assert.ok(markdown.includes('test \\| with \\| pipes'));
    });
  });

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
  });

  // === pad2/pad3 テスト観点表 ===
  // | Case ID       | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-PAD2-B-01  | n=0                  | Boundary – 最小値                    | '00'            | -     |
  // | TC-PAD2-B-02  | n=9                  | Boundary – 1桁最大                   | '09'            | -     |
  // | TC-PAD2-B-03  | n=10                 | Boundary – 2桁最小                   | '10'            | -     |
  // | TC-PAD2-B-04  | n=99                 | Boundary – 2桁最大                   | '99'            | -     |
  // | TC-PAD3-B-01  | n=0                  | Boundary – 最小値                    | '000'           | -     |
  // | TC-PAD3-B-02  | n=9                  | Boundary – 1桁最大                   | '009'           | -     |
  // | TC-PAD3-B-03  | n=10                 | Boundary – 2桁最小                   | '010'           | -     |
  // | TC-PAD3-B-04  | n=99                 | Boundary – 2桁最大                   | '099'           | -     |
  // | TC-PAD3-B-05  | n=100                | Boundary – 3桁最小                   | '100'           | -     |
  // | TC-PAD3-B-06  | n=999                | Boundary – 3桁最大                   | '999'           | -     |

  suite('pad2 (internal)', () => {
    test('TC-PAD2-B-01: n=0 returns "00"', () => {
      // Given: n=0（最小値）
      // When: pad2 を呼び出す
      const result = testAnalyzerTest.pad2(0);
      // Then: '00' が返る
      assert.strictEqual(result, '00');
    });

    test('TC-PAD2-B-02: n=9 returns "09"', () => {
      // Given: n=9（1桁最大）
      // When: pad2 を呼び出す
      const result = testAnalyzerTest.pad2(9);
      // Then: '09' が返る
      assert.strictEqual(result, '09');
    });

    test('TC-PAD2-B-03: n=10 returns "10"', () => {
      // Given: n=10（2桁最小）
      // When: pad2 を呼び出す
      const result = testAnalyzerTest.pad2(10);
      // Then: '10' が返る
      assert.strictEqual(result, '10');
    });

    test('TC-PAD2-B-04: n=99 returns "99"', () => {
      // Given: n=99（2桁最大）
      // When: pad2 を呼び出す
      const result = testAnalyzerTest.pad2(99);
      // Then: '99' が返る
      assert.strictEqual(result, '99');
    });
  });

  suite('pad3 (internal)', () => {
    test('TC-PAD3-B-01: n=0 returns "000"', () => {
      // Given: n=0（最小値）
      // When: pad3 を呼び出す
      const result = testAnalyzerTest.pad3(0);
      // Then: '000' が返る
      assert.strictEqual(result, '000');
    });

    test('TC-PAD3-B-02: n=9 returns "009"', () => {
      // Given: n=9（1桁最大、n<10 の境界）
      // When: pad3 を呼び出す
      const result = testAnalyzerTest.pad3(9);
      // Then: '009' が返る
      assert.strictEqual(result, '009');
    });

    test('TC-PAD3-B-03: n=10 returns "010"', () => {
      // Given: n=10（2桁最小、n>=10 の境界）
      // When: pad3 を呼び出す
      const result = testAnalyzerTest.pad3(10);
      // Then: '010' が返る
      assert.strictEqual(result, '010');
    });

    test('TC-PAD3-B-04: n=99 returns "099"', () => {
      // Given: n=99（2桁最大、n<100 の境界）
      // When: pad3 を呼び出す
      const result = testAnalyzerTest.pad3(99);
      // Then: '099' が返る
      assert.strictEqual(result, '099');
    });

    test('TC-PAD3-B-05: n=100 returns "100"', () => {
      // Given: n=100（3桁最小、n>=100 の境界）
      // When: pad3 を呼び出す
      const result = testAnalyzerTest.pad3(100);
      // Then: '100' が返る
      assert.strictEqual(result, '100');
    });

    test('TC-PAD3-B-06: n=999 returns "999"', () => {
      // Given: n=999（3桁最大）
      // When: pad3 を呼び出す
      const result = testAnalyzerTest.pad3(999);
      // Then: '999' が返る
      assert.strictEqual(result, '999');
    });
  });

  suite('formatLocalIso8601WithOffset (internal)', () => {
    test('TC-FMT-N-01: formats date with milliseconds < 10', () => {
      // Given: ミリ秒が 5 の Date オブジェクト
      const date = new Date(2024, 0, 15, 10, 30, 45, 5);
      // When: formatLocalIso8601WithOffset を呼び出す
      const result = testAnalyzerTest.formatLocalIso8601WithOffset(date);
      // Then: ミリ秒部分が '005' でパディングされている
      assert.ok(result.includes('.005'), `Expected .005 in result: ${result}`);
    });

    test('TC-FMT-N-02: formats date with milliseconds 10-99', () => {
      // Given: ミリ秒が 50 の Date オブジェクト
      const date = new Date(2024, 0, 15, 10, 30, 45, 50);
      // When: formatLocalIso8601WithOffset を呼び出す
      const result = testAnalyzerTest.formatLocalIso8601WithOffset(date);
      // Then: ミリ秒部分が '050' でパディングされている
      assert.ok(result.includes('.050'), `Expected .050 in result: ${result}`);
    });

    test('TC-FMT-N-03: formats date with milliseconds >= 100', () => {
      // Given: ミリ秒が 500 の Date オブジェクト
      const date = new Date(2024, 0, 15, 10, 30, 45, 500);
      // When: formatLocalIso8601WithOffset を呼び出す
      const result = testAnalyzerTest.formatLocalIso8601WithOffset(date);
      // Then: ミリ秒部分が '500' でそのまま出力される
      assert.ok(result.includes('.500'), `Expected .500 in result: ${result}`);
    });
  });
});
