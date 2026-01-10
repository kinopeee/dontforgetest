import { type AnalysisContext, type AnalysisIssue } from '../types';
import { BaseAnalysisRule } from './baseRule';
import { t } from '../../l10n';

/**
 * 例外メッセージの検証の存在をチェック
 *
 * 以下のパターンで例外メッセージが検証されているかチェック:
 * - toThrowError('message')
 * - toThrow('message')
 * - throws('message')
 * - .message === 'message'
 * - error.message === 'message'
 *
 * @param content 元のソースコード
 * @param testFn テスト関数情報
 * @returns 例外メッセージの検証が存在しない場合 true
 */
function checkExceptionMessage(content: string, testFn: { name: string; originalContent: string }): boolean {
  // テスト名に例外関連のキーワードが含まれるかチェック
  const testName = testFn.name.toLowerCase();
  const exceptionKeywords = [
    'error',
    'exception',
    'throw',
    'fail',
    'invalid',
    'reject',
  ];

  const hasExceptionInName = exceptionKeywords.some(keyword => testName.includes(keyword));

  // 例外がスローされるかチェック
  const throwPatterns = [
    /\bthrows?\b/g,
    /\bthrow\s+new\s+\w+/g,
    /\breject\(/g,
    /\bassert\.throws?\b/g,
    /\bexpect\(.*\)\.toThrow/g,
  ];

  const hasThrowInCode = throwPatterns.some(pattern => {
    pattern.lastIndex = 0; // グローバルパターンのリセット
    return pattern.test(testFn.originalContent);
  });

  // 例外メッセージが検証されているかチェック
  const messagePatterns = [
    /toThrowError\(/g,
    /toThrow\(['"`][^'"`]+['"`]\)/g,
    /throws?\(['"`][^'"`]+['"`]\)/g,
    /\.message\s*===\s*['"`][^'"`]+['"`]/g,
    /error\.message\s*===\s*['"`][^'"`]+['"`]/g,
  ];

  const hasMessageCheck = messagePatterns.some(pattern => {
    pattern.lastIndex = 0; // グローバルパターンのリセット
    return pattern.test(testFn.originalContent);
  });

  // 例外をスローするがメッセージ検証がない場合に問題とする
  return hasThrowInCode && !hasMessageCheck;
}

/**
 * 例外メッセージの検証をチェックするルール
 */
export class ExceptionMessageAnalysisRule extends BaseAnalysisRule {
  public readonly id = 'exception-message';

  public readonly displayName = 'Exception Message';

  analyze(context: AnalysisContext): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];

    for (const testFn of context.testFunctions) {
      const missingMessageCheck = checkExceptionMessage(
        context.content,
        testFn
      );

      if (missingMessageCheck) {
        issues.push({
          type: 'missing-exception-message',
          file: context.relativePath,
          line: testFn.startLine,
          detail: t('analysis.issue.missingExceptionMessage'),
        });
      }
    }

    return issues;
  }
}
