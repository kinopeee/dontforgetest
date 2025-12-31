import * as assert from 'assert';
import {
  analyzeFileContent,
  buildAnalysisReportMarkdown,
  type AnalysisIssue,
  type AnalysisResult,
} from '../../../core/testAnalyzer';

suite('testAnalyzer', () => {
  suite('analyzeFileContent', () => {
    suite('Given/When/Then detection', () => {
      test('detects missing Given/When/Then comment in test function', () => {
        // Given: テストコードに Given/When/Then コメントがない
        const content = `
test('should return true', () => {
  const result = someFunction();
  assert.strictEqual(result, true);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-gwt の問題が検出される
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 1);
        assert.strictEqual(gwtIssues[0].file, 'test.test.ts');
        assert.strictEqual(gwtIssues[0].detail, 'should return true');
      });

      test('does not report issue when Given comment exists', () => {
        // Given: テストコードに Given コメントがある
        const content = `
test('should return true', () => {
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

      test('does not report issue when When comment exists', () => {
        // Given: テストコードに When コメントがある
        const content = `
test('should return true', () => {
  // When: calling the function
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
it('should work correctly', () => {
  expect(true).toBe(true);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-gwt の問題が検出される
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 1);
        assert.strictEqual(gwtIssues[0].detail, 'should work correctly');
      });

      test('detects multiple tests without Given/When/Then', () => {
        // Given: 複数のテストに Given/When/Then がない
        const content = `
test('first test', () => {
  assert.ok(true);
});

test('second test', () => {
  assert.ok(false);
});

test('third test with comment', () => {
  // Given: some setup
  assert.ok(true);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: 2件の missing-gwt が検出される（3番目はコメントあり）
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 2);
        assert.strictEqual(gwtIssues[0].detail, 'first test');
        assert.strictEqual(gwtIssues[1].detail, 'second test');
      });

      test('handles case-insensitive Given/When/Then comments', () => {
        // Given: 大文字小文字が混在した Given コメント
        const content = `
test('case insensitive test', () => {
  // given: lowercase
  const x = 1;
  assert.ok(x);
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
test('normal test', () => {
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
test('handles null', () => {
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
test('handles undefined', () => {
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
test('handles zero', () => {
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

      test('does not report issue when empty string test exists', () => {
        // Given: 空文字列のテストがある
        const content = `
test('handles empty string', () => {
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

      test('does not report issue when empty array test exists', () => {
        // Given: 空配列のテストがある
        const content = `
test('handles empty array', () => {
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
        const content = `
test('throws error', () => {
  assert.throws(() => badFunction());
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
        const content = `
test('throws error', () => {
  expect(() => badFunction()).toThrow();
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
test('throws error with message', () => {
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
test('throws error with message', () => {
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

      test('does not report issue when toThrow has message parameter', () => {
        // Given: toThrow() でメッセージを検証しているコード
        const content = `
test('throws error with message', () => {
  expect(() => badFunction()).toThrow('expected error');
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
        const content = `
test('first throws', () => {
  assert.throws(() => fn1());
});

test('second throws', () => {
  expect(() => fn2()).toThrow();
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: 2件の missing-exception-message が検出される
        const exceptionIssues = issues.filter((i) => i.type === 'missing-exception-message');
        assert.strictEqual(exceptionIssues.length, 2);
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
        // Given: ダブルクォートを使用したテスト
        const content = `
test("should work", () => {
  assert.ok(true);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-gwt が検出される
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 1);
        assert.strictEqual(gwtIssues[0].detail, 'should work');
      });

      test('handles test with template literals', () => {
        // Given: テンプレートリテラルを使用したテスト
        const content = `
test(\`should work\`, () => {
  assert.ok(true);
});
`;

        // When: ファイル内容を分析する
        const issues = analyzeFileContent('test.test.ts', content);

        // Then: missing-gwt が検出される
        const gwtIssues = issues.filter((i) => i.type === 'missing-gwt');
        assert.strictEqual(gwtIssues.length, 1);
        assert.strictEqual(gwtIssues[0].detail, 'should work');
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
});
