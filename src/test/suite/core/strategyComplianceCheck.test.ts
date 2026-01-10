import * as assert from 'assert';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  extractCaseIdsFromPerspectiveMarkdown,
  checkCaseIdPresence,
  checkCaseIdCoverage,
  isTestFilePath,
  formatComplianceIssuesForPrompt,
  runComplianceCheck,
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
      // When: isTestFilePath に .test.ts / .test.tsx のパスを渡す
      // Then: true が返る
      assert.strictEqual(isTestFilePath('src/utils.test.ts'), true);
      assert.strictEqual(isTestFilePath('components/Button.test.tsx'), true);
    });

    test('returns true for .spec.ts files', () => {
      // Given: .spec.ts 拡張子のファイル
      // When: isTestFilePath に .spec.ts / .spec.tsx のパスを渡す
      // Then: true が返る
      assert.strictEqual(isTestFilePath('src/utils.spec.ts'), true);
      assert.strictEqual(isTestFilePath('components/Button.spec.tsx'), true);
    });

    test('returns true for files in src/test/ directory', () => {
      // Given: src/test/ 配下のファイル
      // When: isTestFilePath に src/test/ 配下のパスを渡す
      // Then: true が返る
      assert.strictEqual(isTestFilePath('src/test/suite/example.ts'), true);
      assert.strictEqual(isTestFilePath('src/test/helpers.ts'), true);
    });

    test('returns true for files in test/ directory', () => {
      // Given: test/ 配下のファイル
      // When: isTestFilePath に test/ 配下のパスを渡す
      // Then: true が返る
      assert.strictEqual(isTestFilePath('test/unit/example.ts'), true);
      assert.strictEqual(isTestFilePath('packages/core/test/unit.ts'), true);
    });

    test('returns false for non-test files', () => {
      // Given: テストファイルではないファイル
      // When: isTestFilePath に通常のソース/ドキュメントのパスを渡す
      // Then: false が返る
      assert.strictEqual(isTestFilePath('src/utils.ts'), false);
      assert.strictEqual(isTestFilePath('src/components/Button.tsx'), false);
      assert.strictEqual(isTestFilePath('docs/README.md'), false);
    });

    test('handles Windows-style paths', () => {
      // Given: バックスラッシュのパス
      // When: isTestFilePath に Windows 形式の区切り文字を含むパスを渡す
      // Then: テストファイル判定が正しく行われる
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
        analysisSummary: { missingGwt: 1, missingBoundary: 1, missingExceptionMessage: 0, weakAssertion: 0, unverifiedMock: 0, globalStateLeak: 0 },
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
        analysisSummary: { missingGwt: 0, missingBoundary: 0, missingExceptionMessage: 0, weakAssertion: 0, unverifiedMock: 0, globalStateLeak: 0 },
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
        analysisSummary: { missingGwt: 0, missingBoundary: 0, missingExceptionMessage: 0, weakAssertion: 0, unverifiedMock: 0, globalStateLeak: 0 },
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
        analysisSummary: { missingGwt: 0, missingBoundary: 0, missingExceptionMessage: 0, weakAssertion: 0, unverifiedMock: 0, globalStateLeak: 0 },
        missingCaseIdIssues: [],
        passed: true,
      };

      // When: プロンプト用にフォーマットする
      const formatted = formatComplianceIssuesForPrompt(result);

      // Then: 空またはほぼ空の文字列
      assert.strictEqual(formatted.trim(), '');
    });
  });

  // ============================================
  // テスト観点表（追加分）: runComplianceCheck の end-to-end テスト
  // ============================================
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-SCC-N-01 | テストファイルが存在し GWT 完備 | Equivalence – 正常系 | analysisIssues が空、passed=true | - |
  // | TC-SCC-N-02 | perspectiveMarkdown あり、caseId 全実装 | Equivalence – caseId 網羅 | missingCaseIdIssues が空 | - |
  // | TC-SCC-E-01 | テストファイルが存在し GWT 不足 | Error – GWT 不足 | analysisIssues に missing-gwt | - |
  // | TC-SCC-E-02 | perspectiveMarkdown あり、caseId 未実装 | Error – caseId 未実装 | missingCaseIdIssues に未実装 caseId | - |
  // | TC-SCC-E-03 | perspectiveMarkdown 無し、includeTestPerspectiveTable=false | Error – 観点表スキップ警告 | perspectiveSkippedWarning が設定される | - |
  // | TC-SCC-B-01 | テストファイルが存在しない | Boundary – ファイル読み取り失敗 | analyzedFiles が 0 | - |
  // | TC-SCC-B-02 | perspectiveMarkdown の caseId が 0 件 | Boundary – 空の観点表 | missingCaseIdIssues が空 | - |
  // | TC-SCC-N-03 | perspectiveMarkdown あり、includeTestPerspectiveTable=true | Equivalence – 観点表生成ON | perspectiveSkippedWarning が無い | - |

  suite('runComplianceCheck end-to-end', () => {
    const getWorkspaceRoot = (): string | undefined => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    let workspaceRoot = '';

    suiteSetup(() => {
      const root = getWorkspaceRoot();
      assert.ok(root, 'workspace root must be available for end-to-end tests');
      workspaceRoot = root;
    });

    const createTempDir = async (dirName: string): Promise<string> => {
      const tempDir = path.join(workspaceRoot, 'out', 'test-compliance', dirName);
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempDir));
      return tempDir;
    };

    const writeFile = async (filePath: string, content: string): Promise<void> => {
      await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content, 'utf8'));
    };

    const cleanupDir = async (dirPath: string): Promise<void> => {
      try {
        // 想定外のパスを誤って削除しないための安全ガード（テスト事故防止）
        const allowedBase = path.resolve(path.join(workspaceRoot, 'out', 'test-compliance'));
        const resolved = path.resolve(dirPath);
        if (resolved !== allowedBase && !resolved.startsWith(`${allowedBase}${path.sep}`)) {
          const msg = `[strategyComplianceCheck.test] cleanupDir skipped (out of allowed base): ${dirPath}`;
          console.warn(msg);
          return;
        }

        await vscode.workspace.fs.delete(vscode.Uri.file(dirPath), { recursive: true, useTrash: false });
      } catch (error: unknown) {
        // テストクリーンアップ時のエラーは基本的に無視するが、デバッグ容易性のためログは残す。
        // ただし「存在しない」ケースはクリーンアップとして自然なので黙って無視する。
        const isFileNotFound =
          error instanceof vscode.FileSystemError
            ? error.code === 'FileNotFound'
            : typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                (error as { code?: unknown }).code === 'FileNotFound';

        if (isFileNotFound) {
          return;
        }

        const errorMessage = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.warn(`[strategyComplianceCheck.test] cleanupDir failed (${dirPath}): ${errorMessage}`, error);
      }
    };

    // TC-SCC-N-01: テストファイルが存在し GWT 完備
    test('TC-SCC-N-01: GWT 完備のテストファイルで analysisIssues が空になる', async () => {
      // Given: GWT コメント完備のテストファイル
      const tempDir = await createTempDir(`scc-n-01-${randomUUID()}`);
      const testFilePath = path.join(tempDir, 'complete.test.ts');

      try {
        const testContent = `
test('TC-N-01: handles valid input', () => {
  // Given: valid input
  const input = 'valid';
  const boundaryNull = null;
  // When: processing
  const result = process(input);
  // Then: success
  assert.strictEqual(result, true);
  assert.strictEqual(boundaryNull, null);
});
`;
        await writeFile(testFilePath, testContent);

        // When: runComplianceCheck を実行
        const result = await runComplianceCheck({
          workspaceRoot,
          testFilePaths: [testFilePath],
          includeTestPerspectiveTable: true,
        });

        // Then: analysisIssues が空
        assert.strictEqual(result.analyzedFiles, 1);
        assert.strictEqual(result.analysisIssues.length, 0);
        assert.strictEqual(result.passed, true);
      } finally {
        await cleanupDir(tempDir);
      }
    });

    // TC-SCC-N-02: perspectiveMarkdown あり、caseId 全実装
    test('TC-SCC-N-02: perspectiveMarkdown の caseId が全て実装されている場合 missingCaseIdIssues が空', async () => {
      // Given: 観点表の caseId がすべて実装されているテストファイル
      const tempDir = await createTempDir(`scc-n-02-${randomUUID()}`);
      const testFilePath = path.join(tempDir, 'covered.test.ts');

      try {
        const testContent = `
test('TC-N-01: handles valid input', () => {
  // Given: valid input
  const input = 'valid';
  const boundaryNull = null;
  // When: processing
  const result = process(input);
  // Then: success
  assert.strictEqual(result, true);
  assert.strictEqual(boundaryNull, null);
});

test('TC-N-02: handles edge case', () => {
  // Given: edge input
  const input = '';
  const boundaryNull = null;
  // When: processing
  const result = process(input);
  // Then: success
  assert.strictEqual(result, true);
  assert.strictEqual(boundaryNull, null);
});
`;
        await writeFile(testFilePath, testContent);

        const perspectiveMarkdown = `
| Case ID | Description |
|---------|-------------|
| TC-N-01 | Valid input |
| TC-N-02 | Edge case |
`;

        // When: runComplianceCheck を実行
        const result = await runComplianceCheck({
          workspaceRoot,
          testFilePaths: [testFilePath],
          perspectiveMarkdown,
          includeTestPerspectiveTable: true,
        });

        // Then: missingCaseIdIssues が空
        assert.strictEqual(result.analyzedFiles, 1);
        assert.strictEqual(result.analysisIssues.length, 0);
        assert.strictEqual(result.missingCaseIdIssues.length, 0);
        assert.strictEqual(result.passed, true);
      } finally {
        await cleanupDir(tempDir);
      }
    });

    // TC-SCC-E-01: テストファイルが存在し GWT 不足
    test('TC-SCC-E-01: GWT 不足のテストファイルで analysisIssues に missing-gwt が含まれる', async () => {
      // Given: GWT コメントが不足しているテストファイル
      const tempDir = await createTempDir(`scc-e-01-${randomUUID()}`);
      const testFilePath = path.join(tempDir, 'incomplete.test.ts');

      try {
        const testContent = `
test('handles valid input', () => {
  // Given: valid input
  const input = 'valid';
  // 欠けている: When / Then コメント
  assert.strictEqual(process(input), true);
});
`;
        await writeFile(testFilePath, testContent);

        // When: runComplianceCheck を実行
        const result = await runComplianceCheck({
          workspaceRoot,
          testFilePaths: [testFilePath],
          includeTestPerspectiveTable: true,
        });

        // Then: analysisIssues に missing-gwt が含まれる
        assert.ok(result.analysisIssues.length > 0, 'analysisIssues が存在する');
        assert.ok(
          result.analysisIssues.some((i) => i.type === 'missing-gwt'),
          'missing-gwt が検出される',
        );
        assert.strictEqual(result.passed, false);
      } finally {
        await cleanupDir(tempDir);
      }
    });

    // TC-SCC-E-02: perspectiveMarkdown あり、caseId 未実装
    test('TC-SCC-E-02: perspectiveMarkdown の caseId が未実装の場合 missingCaseIdIssues に含まれる', async () => {
      // Given: 観点表の caseId が一部未実装のテストファイル
      const tempDir = await createTempDir(`scc-e-02-${randomUUID()}`);
      const testFilePath = path.join(tempDir, 'partial.test.ts');

      try {
        const testContent = `
test('TC-N-01: handles valid input', () => {
  // Given: placeholder
  const input = 'valid';
  const boundaryNull = null;
  // When: placeholder
  const result = process(input);
  // Then: placeholder
  assert.strictEqual(result, true);
  assert.strictEqual(boundaryNull, null);
});
// 一部のケースIDは未実装
`;
        await writeFile(testFilePath, testContent);

        const perspectiveMarkdown = `
| Case ID | Description |
|---------|-------------|
| TC-N-01 | Valid input |
| TC-N-02 | Edge case |
| TC-E-01 | Error case |
`;

        // When: runComplianceCheck を実行
        const result = await runComplianceCheck({
          workspaceRoot,
          testFilePaths: [testFilePath],
          perspectiveMarkdown,
          includeTestPerspectiveTable: true,
        });

        // Then: missingCaseIdIssues に未実装の caseId が含まれる
        assert.strictEqual(result.analyzedFiles, 1);
        assert.strictEqual(result.analysisIssues.length, 0);
        assert.strictEqual(result.missingCaseIdIssues.length, 2);
        assert.ok(result.missingCaseIdIssues.some((i) => i.caseId === 'TC-N-02'));
        assert.ok(result.missingCaseIdIssues.some((i) => i.caseId === 'TC-E-01'));
        assert.strictEqual(result.passed, false);
      } finally {
        await cleanupDir(tempDir);
      }
    });

    // TC-SCC-E-03: perspectiveMarkdown 無し、includeTestPerspectiveTable=false で警告
    test('TC-SCC-E-03: perspectiveMarkdown 無しで includeTestPerspectiveTable=false の場合 perspectiveSkippedWarning が設定される', async () => {
      // Given: 観点表生成がOFFの設定
      const tempDir = await createTempDir(`scc-e-03-${randomUUID()}`);
      const testFilePath = path.join(tempDir, 'no-perspective.test.ts');

      try {
        const testContent = `
test('handles input', () => {
  // Given: test
  const input = 'valid';
  const boundaryNull = null;
  // When: test
  const result = process(input);
  // Then: test
  assert.strictEqual(result, true);
  assert.strictEqual(boundaryNull, null);
});
`;
        await writeFile(testFilePath, testContent);

        // When: runComplianceCheck を実行（perspectiveMarkdown 無し、includeTestPerspectiveTable=false）
        const result = await runComplianceCheck({
          workspaceRoot,
          testFilePaths: [testFilePath],
          perspectiveMarkdown: undefined,
          includeTestPerspectiveTable: false,
        });

        // Then: perspectiveSkippedWarning が設定される
        assert.ok(result.perspectiveSkippedWarning, 'perspectiveSkippedWarning が設定される');
        assert.ok(result.perspectiveSkippedWarning.length > 0);
        assert.strictEqual(result.analyzedFiles, 1);
        assert.strictEqual(result.analysisIssues.length, 0);
        assert.strictEqual(result.missingCaseIdIssues.length, 0);
        assert.strictEqual(result.passed, true);
      } finally {
        await cleanupDir(tempDir);
      }
    });

    // TC-SCC-B-01: テストファイルが存在しない場合
    test('TC-SCC-B-01: テストファイルが存在しない場合 analyzedFiles が 0', async () => {
      // Given: 存在しないファイルパス
      const nonExistentPath = path.join(
        workspaceRoot,
        'out',
        'non-existent',
        `missing-${randomUUID()}.test.ts`,
      );

      // When: runComplianceCheck を実行
      const result = await runComplianceCheck({
        workspaceRoot,
        testFilePaths: [nonExistentPath],
        includeTestPerspectiveTable: true,
      });

      // Then: analyzedFiles が 0
      assert.strictEqual(result.analyzedFiles, 0);
      assert.strictEqual(result.analysisIssues.length, 0);
      assert.strictEqual(result.passed, true);
    });

    // TC-SCC-B-02: perspectiveMarkdown の caseId が 0 件
    test('TC-SCC-B-02: perspectiveMarkdown の caseId が 0 件の場合 missingCaseIdIssues が空', async () => {
      // Given: caseId が無い観点表
      const tempDir = await createTempDir(`scc-b-02-${randomUUID()}`);
      const testFilePath = path.join(tempDir, 'empty-perspective.test.ts');

      try {
        const testContent = `
test('handles input', () => {
  // Given: test
  const input = 'valid';
  const boundaryNull = null;
  // When: test
  const result = process(input);
  // Then: test
  assert.strictEqual(result, true);
  assert.strictEqual(boundaryNull, null);
});
`;
        await writeFile(testFilePath, testContent);

        const perspectiveMarkdown = `
# テスト観点

観点表はまだありません。
`;

        // When: runComplianceCheck を実行
        const result = await runComplianceCheck({
          workspaceRoot,
          testFilePaths: [testFilePath],
          perspectiveMarkdown,
          includeTestPerspectiveTable: true,
        });

        // Then: missingCaseIdIssues が空（チェック対象の caseId が無いため）
        assert.strictEqual(result.analyzedFiles, 1);
        assert.strictEqual(result.analysisIssues.length, 0);
        assert.strictEqual(result.missingCaseIdIssues.length, 0);
        assert.strictEqual(result.passed, true);
      } finally {
        await cleanupDir(tempDir);
      }
    });

    // TC-SCC-N-03: perspectiveMarkdown あり、includeTestPerspectiveTable=true で警告なし
    test('TC-SCC-N-03: perspectiveMarkdown ありで includeTestPerspectiveTable=true の場合 perspectiveSkippedWarning が無い', async () => {
      // Given: 観点表生成がONで、観点表が提供されている
      const tempDir = await createTempDir(`scc-n-03-${randomUUID()}`);
      const testFilePath = path.join(tempDir, 'with-perspective.test.ts');

      try {
        const testContent = `
test('TC-N-01: handles input', () => {
  // Given: test
  const input = 'valid';
  const boundaryNull = null;
  // When: test
  const result = process(input);
  // Then: test
  assert.strictEqual(result, true);
  assert.strictEqual(boundaryNull, null);
});
`;
        await writeFile(testFilePath, testContent);

        const perspectiveMarkdown = `
| Case ID | Description |
|---------|-------------|
| TC-N-01 | Valid input |
`;

        // When: runComplianceCheck を実行
        const result = await runComplianceCheck({
          workspaceRoot,
          testFilePaths: [testFilePath],
          perspectiveMarkdown,
          includeTestPerspectiveTable: true,
        });

        // Then: perspectiveSkippedWarning が無い
        assert.strictEqual(result.perspectiveSkippedWarning, undefined);
        assert.strictEqual(result.analyzedFiles, 1);
        assert.strictEqual(result.analysisIssues.length, 0);
        assert.strictEqual(result.missingCaseIdIssues.length, 0);
        assert.strictEqual(result.passed, true);
      } finally {
        await cleanupDir(tempDir);
      }
    });
  });
});
