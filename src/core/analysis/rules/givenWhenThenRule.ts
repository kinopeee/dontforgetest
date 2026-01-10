import { type AnalysisContext, type AnalysisIssue, type GwtCheckResult } from '../types';
import { BaseAnalysisRule } from './baseRule';
import { t } from '../../l10n';

/**
 * Given/When/Then コメントが全て存在するかチェック（厳格版）
 *
 * ガイドラインに従い、Given/When/Then 全てが必須。
 */
function checkGivenWhenThenStrict(content: string): GwtCheckResult {
  // NOTE:
  // - テストによっては「// When/Then: ...」のように複数ラベルを1行にまとめる運用がある。
  // - 厳格性（全て必須）は維持しつつ、「同一行にラベル語 + ":" が含まれていれば存在」と判定する。
  // - 行単位で判定することで、別行に跨る曖昧マッチは避ける（. は改行にマッチしない）。
  const givenPattern = /\/\/[^\n]*\bGiven\b[^\n]*:/i;
  const whenPattern = /\/\/[^\n]*\bWhen\b[^\n]*:/i;
  const thenPattern = /\/\/[^\n]*\bThen\b[^\n]*:/i;

  const hasGiven = givenPattern.test(content);
  const hasWhen = whenPattern.test(content);
  const hasThen = thenPattern.test(content);

  const missing: string[] = [];
  if (!hasGiven) {
    missing.push('Given');
  }
  if (!hasWhen) {
    missing.push('When');
  }
  if (!hasThen) {
    missing.push('Then');
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Given/When/Then コメントの存在をチェックするルール
 */
export class GivenWhenThenAnalysisRule extends BaseAnalysisRule {
  public readonly id = 'gwt';

  public readonly displayName = 'Given/When/Then';

  analyze(context: AnalysisContext): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];

    for (const testFn of context.testFunctions) {
      const result = checkGivenWhenThenStrict(testFn.originalContent);

      if (!result.valid) {
        issues.push({
          type: 'missing-gwt',
          file: context.relativePath,
          line: testFn.startLine,
          detail: `${testFn.name} (${result.missing.join(', ')} ${t('analysis.detail.missing')})`,
        });
      }
    }

    return issues;
  }
}
