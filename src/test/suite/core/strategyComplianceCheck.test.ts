import * as assert from 'assert';
import {
  extractCaseIdsFromPerspectiveMarkdown,
  checkCaseIdPresence,
  checkCaseIdCoverage,
  isTestFilePath,
  formatComplianceIssuesForPrompt,
  type ComplianceCheckResult,
} from '../../../core/strategyComplianceCheck';

suite('strategyComplianceCheck', () => {
  suite('extractCaseIdsFromPerspectiveMarkdown', () => {
    test('extracts case IDs from a valid perspective table', () => {
      // Given: 観点表のMarkdownテーブル
      const markdown = `
| Case ID | Input / Precondition | Perspective | Expected Result | Notes |
|---------|----------------------|-------------|-----------------|-------|
| TC-N-01 | Valid input | Equivalence | Success | - |
| TC-N-02 | Edge case | Boundary | Error handled | - |
| TC-E-01 | Invalid input | Exception | Throws error | - |
`;

      // When: caseIdを抽出する
      const caseIds = extractCaseIdsFromPerspectiveMarkdown(markdown);

      // Then: 3つのcaseIdが抽出される
      assert.deepStrictEqual(caseIds, ['TC-N-01', 'TC-N-02', 'TC-E-01']);
    });

    test('skips header and separator rows', () => {
      // Given: ヘッダ行と区切り行を含むテーブル
      const markdown = `
| Case ID | Input / Precondition |
|---------|----------------------|
| TC-N-01 | Valid input |
`;

      // When: caseIdを抽出する
      const caseIds = extractCaseIdsFromPerspectiveMarkdown(markdown);

      // Then: データ行のcaseIdのみが抽出される
      assert.deepStrictEqual(caseIds, ['TC-N-01']);
    });

    test('handles empty markdown', () => {
      // Given: 空のMarkdown
      const markdown = '';

      // When: caseIdを抽出する
      const caseIds = extractCaseIdsFromPerspectiveMarkdown(markdown);

      // Then: 空の配列が返される
      assert.deepStrictEqual(caseIds, []);
    });

    test('handles markdown with no table rows', () => {
      // Given: テーブル行がないMarkdown
      const markdown = `
# Test Perspectives

This is a description.
`;

      // When: caseIdを抽出する
      const caseIds = extractCaseIdsFromPerspectiveMarkdown(markdown);

      // Then: 空の配列が返される
      assert.deepStrictEqual(caseIds, []);
    });

    test('handles TC_ prefix (underscore)', () => {
      // Given: アンダースコア区切りのcaseId
      const markdown = `
| Case ID | Input |
|---------|-------|
| TC_N_01 | Valid |
`;

      // When: caseIdを抽出する
      const caseIds = extractCaseIdsFromPerspectiveMarkdown(markdown);

      // Then: TC_形式もcaseIdとして認識される
      assert.deepStrictEqual(caseIds, ['TC_N_01']);
    });
  });

  suite('checkCaseIdPresence', () => {
    test('returns true when caseId is present in content', () => {
      // Given: テストファイルの内容にcaseIdがコメントとして含まれている
      const content = `
test('should handle valid input', () => {
  // TC-N-01: Valid input case
  const result = processInput('valid');
  assert.strictEqual(result, true);
});
`;

      // When: caseIdの存在をチェックする
      const present = checkCaseIdPresence(content, 'TC-N-01');

      // Then: trueが返される
      assert.strictEqual(present, true);
    });

    test('returns false when caseId is only a substring of another caseId', () => {
      // Given: caseId が別caseIdの部分文字列としてのみ出現している（例: TC-N-1 と TC-N-10）
      const content = `
test('TC-N-10: should handle another case', () => {
  // TC-N-10: Another case
  assert.strictEqual(true, true);
});
`;

      // When: 部分一致しうるcaseIdの存在をチェックする
      const present = checkCaseIdPresence(content, 'TC-N-1');

      // Then: 実装済みとはみなされない
      assert.strictEqual(present, false);
    });

    test('returns false when caseId is not present', () => {
      // Given: テストファイルの内容にcaseIdが含まれていない
      const content = `
test('should handle valid input', () => {
  const result = processInput('valid');
  assert.strictEqual(result, true);
});
`;

      // When: caseIdの存在をチェックする
      const present = checkCaseIdPresence(content, 'TC-N-01');

      // Then: falseが返される
      assert.strictEqual(present, false);
    });

    test('returns true when caseId is in a string literal', () => {
      // Given: caseIdがテスト名に含まれている
      const content = `
test('TC-N-01: should handle valid input', () => {
  const result = processInput('valid');
  assert.strictEqual(result, true);
});
`;

      // When: caseIdの存在をチェックする
      const present = checkCaseIdPresence(content, 'TC-N-01');

      // Then: trueが返される
      assert.strictEqual(present, true);
    });
  });

  suite('checkCaseIdCoverage', () => {
    test('returns empty array when all caseIds are covered', () => {
      // Given: すべてのcaseIdが実装されているテストファイル
      const testFileContents = new Map<string, string>();
      testFileContents.set('test/example.test.ts', `
// TC-N-01: Valid input
test('handles valid input', () => {});
// TC-N-02: Edge case
test('handles edge case', () => {});
`);

      // When: カバレッジをチェックする
      const issues = checkCaseIdCoverage(testFileContents, ['TC-N-01', 'TC-N-02']);

      // Then: 問題なし
      assert.strictEqual(issues.length, 0);
    });

    test('returns issues for missing caseIds', () => {
      // Given: 一部のcaseIdが未実装のテストファイル
      const testFileContents = new Map<string, string>();
      testFileContents.set('test/example.test.ts', `
// TC-N-01: Valid input
test('handles valid input', () => {});
`);

      // When: カバレッジをチェックする
      const issues = checkCaseIdCoverage(testFileContents, ['TC-N-01', 'TC-N-02', 'TC-E-01']);

      // Then: 2つの未実装caseIdが検出される
      assert.strictEqual(issues.length, 2);
      assert.ok(issues.some((i) => i.caseId === 'TC-N-02'));
      assert.ok(issues.some((i) => i.caseId === 'TC-E-01'));
    });

    test('checks across multiple files', () => {
      // Given: 複数ファイルに分散してcaseIdが実装されている
      const testFileContents = new Map<string, string>();
      testFileContents.set('test/a.test.ts', '// TC-N-01: Case A');
      testFileContents.set('test/b.test.ts', '// TC-N-02: Case B');

      // When: カバレッジをチェックする
      const issues = checkCaseIdCoverage(testFileContents, ['TC-N-01', 'TC-N-02']);

      // Then: すべてカバーされている
      assert.strictEqual(issues.length, 0);
    });

    test('does not treat substring matches as coverage', () => {
      // Given: TC-N-10 はあるが、TC-N-1 は未実装のテストファイル
      const testFileContents = new Map<string, string>();
      testFileContents.set('test/example.test.ts', `
// TC-N-10: Another case
test('TC-N-10: handles another case', () => {});
`);

      // When: カバレッジをチェックする
      const issues = checkCaseIdCoverage(testFileContents, ['TC-N-1', 'TC-N-10']);

      // Then: TC-N-1 が未実装として検出される
      assert.strictEqual(issues.length, 1);
      assert.strictEqual(issues[0]?.caseId, 'TC-N-1');
    });
  });

  suite('isTestFilePath', () => {
    test('returns true for .test.ts files', () => {
      // Given: .test.ts 拡張子のファイル
      // When/Then
      assert.strictEqual(isTestFilePath('src/utils.test.ts'), true);
      assert.strictEqual(isTestFilePath('components/Button.test.tsx'), true);
    });

    test('returns true for .spec.ts files', () => {
      // Given: .spec.ts 拡張子のファイル
      // When/Then
      assert.strictEqual(isTestFilePath('src/utils.spec.ts'), true);
      assert.strictEqual(isTestFilePath('components/Button.spec.tsx'), true);
    });

    test('returns true for files in src/test/ directory', () => {
      // Given: src/test/ 配下のファイル
      // When/Then
      assert.strictEqual(isTestFilePath('src/test/suite/example.ts'), true);
      assert.strictEqual(isTestFilePath('src/test/helpers.ts'), true);
    });

    test('returns true for files in test/ directory', () => {
      // Given: test/ 配下のファイル
      // When/Then
      assert.strictEqual(isTestFilePath('test/unit/example.ts'), true);
      assert.strictEqual(isTestFilePath('packages/core/test/unit.ts'), true);
    });

    test('returns false for non-test files', () => {
      // Given: テストファイルではないファイル
      // When/Then
      assert.strictEqual(isTestFilePath('src/utils.ts'), false);
      assert.strictEqual(isTestFilePath('src/components/Button.tsx'), false);
      assert.strictEqual(isTestFilePath('docs/README.md'), false);
    });

    test('handles Windows-style paths', () => {
      // Given: バックスラッシュのパス
      // When/Then
      assert.strictEqual(isTestFilePath('src\\test\\suite\\example.ts'), true);
      assert.strictEqual(isTestFilePath('src\\utils.test.ts'), true);
    });
  });

  suite('formatComplianceIssuesForPrompt', () => {
    test('formats analysis issues correctly', () => {
      // Given: 分析結果
      const result: ComplianceCheckResult = {
        analyzedFiles: 1,
        analysisIssues: [
          { type: 'missing-gwt', file: 'test.test.ts', line: 10, detail: 'test case (Given missing)' },
          { type: 'missing-boundary', file: 'test.test.ts', detail: 'No boundary tests' },
        ],
        analysisSummary: { missingGwt: 1, missingBoundary: 1, missingExceptionMessage: 0 },
        missingCaseIdIssues: [],
        passed: false,
      };

      // When: プロンプト用にフォーマットする
      const formatted = formatComplianceIssuesForPrompt(result);

      // Then: 分析問題が含まれる
      assert.ok(formatted.includes('## テスト品質の問題'));
      assert.ok(formatted.includes('missing-gwt'));
      assert.ok(formatted.includes('test.test.ts:10'));
      assert.ok(formatted.includes('missing-boundary'));
    });

    test('formats missing caseId issues correctly', () => {
      // Given: caseId未実装の結果
      const result: ComplianceCheckResult = {
        analyzedFiles: 1,
        analysisIssues: [],
        analysisSummary: { missingGwt: 0, missingBoundary: 0, missingExceptionMessage: 0 },
        missingCaseIdIssues: [
          { caseId: 'TC-N-01', file: 'test.test.ts', detail: 'Not implemented' },
          { caseId: 'TC-E-01', file: 'test.test.ts', detail: 'Not implemented' },
        ],
        passed: false,
      };

      // When: プロンプト用にフォーマットする
      const formatted = formatComplianceIssuesForPrompt(result);

      // Then: caseId未実装が含まれる
      assert.ok(formatted.includes('## 観点表ケースID未実装'));
      assert.ok(formatted.includes('TC-N-01'));
      assert.ok(formatted.includes('TC-E-01'));
    });

    test('formats perspective skipped warning correctly', () => {
      // Given: 観点表スキップの警告
      const result: ComplianceCheckResult = {
        analyzedFiles: 1,
        analysisIssues: [],
        analysisSummary: { missingGwt: 0, missingBoundary: 0, missingExceptionMessage: 0 },
        missingCaseIdIssues: [],
        perspectiveSkippedWarning: 'Perspective table was skipped',
        passed: true,
      };

      // When: プロンプト用にフォーマットする
      const formatted = formatComplianceIssuesForPrompt(result);

      // Then: 警告が含まれる
      assert.ok(formatted.includes('## 警告'));
      assert.ok(formatted.includes('Perspective table was skipped'));
    });

    test('returns empty string when no issues', () => {
      // Given: 問題なしの結果
      const result: ComplianceCheckResult = {
        analyzedFiles: 1,
        analysisIssues: [],
        analysisSummary: { missingGwt: 0, missingBoundary: 0, missingExceptionMessage: 0 },
        missingCaseIdIssues: [],
        passed: true,
      };

      // When: プロンプト用にフォーマットする
      const formatted = formatComplianceIssuesForPrompt(result);

      // Then: 空またはほぼ空の文字列
      assert.strictEqual(formatted.trim(), '');
    });
  });
});
