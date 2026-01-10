import { type AnalysisContext, type AnalysisIssue } from '../types';
import { BaseAnalysisRule } from './baseRule';
import { t } from '../../l10n';
import { hasEmptyStringLiteralInCode } from '../../parsers/codeExtractor';

/**
 * 境界値テストの存在をチェック
 *
 * 以下のキーワードがテストケース名またはアサーション内に存在するかチェック:
 * - null
 * - undefined
 * - 0（数値のゼロ）
 * - '' または "" または ``（空文字列）
 * - [] （空配列）
 *
 * NOTE:
 * - codeOnlyContent では文字列リテラルが空白化されるため、空文字リテラルは検出できない。
 * - 空文字リテラルのみ、元の content を軽量 lexer で走査して検出する。
 *
 * @param relativePath ファイルの相対パス
 * @param content 元のソースコード
 * @param codeOnlyContent コメントと文字列リテラルを除いたコード
 * @param testFn テスト関数情報
 * @returns 境界値テストが存在しない場合 true
 */
function checkBoundaryValue(
  relativePath: string,
  content: string,
  codeOnlyContent: string,
  testFn: { name: string; originalContent: string }
): boolean {
  // テスト名に境界値を示すキーワードが含まれるかチェック
  const testName = testFn.name.toLowerCase();
  const boundaryKeywords = [
    'null',
    'undefined',
    'empty',
    'zero',
    '0',
    'blank',
    'nil',
  ];

  const hasBoundaryInName = boundaryKeywords.some(keyword => testName.includes(keyword));

  // コード内に境界値が含まれるかチェック
  const boundaryPatterns = [
    /\bnull\b/g,
    /\bundefined\b/g,
    /\b0\b/g,
    /\[\]/g,
  ];

  const hasBoundaryInCode = boundaryPatterns.some(pattern => {
    pattern.lastIndex = 0; // グローバルパターンのリセット
    return pattern.test(codeOnlyContent);
  });

  // 空文字列のみ別途チェック
  const hasEmptyString = hasEmptyStringLiteralInCode(testFn.originalContent);

  return hasBoundaryInName || hasBoundaryInCode || hasEmptyString;
}

/**
 * 境界値テストの存在をチェックするルール
 */
export class BoundaryValueAnalysisRule extends BaseAnalysisRule {
  public readonly id = 'boundary';

  public readonly displayName = 'Boundary Value';

  analyze(context: AnalysisContext): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];

    for (const testFn of context.testFunctions) {
      const hasBoundary = checkBoundaryValue(
        context.relativePath,
        context.content,
        context.codeOnlyContent,
        testFn
      );

      if (!hasBoundary) {
        issues.push({
          type: 'missing-boundary',
          file: context.relativePath,
          line: testFn.startLine,
          detail: t('analysis.issue.missingBoundary'),
        });
      }
    }

    return issues;
  }
}
