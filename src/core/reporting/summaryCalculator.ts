import { type AnalysisIssue, type AnalysisSummary } from '../analysis/types';

/**
 * 分析結果からサマリーを計算する
 *
 * @param issues 検出された問題のリスト
 * @returns サマリー情報
 */
export function calculateSummary(issues: AnalysisIssue[]): AnalysisSummary {
  const summary: AnalysisSummary = {
    missingGwt: 0,
    missingBoundary: 0,
    missingExceptionMessage: 0,
  };

  for (const issue of issues) {
    switch (issue.type) {
      case 'missing-gwt':
        summary.missingGwt++;
        break;
      case 'missing-boundary':
        summary.missingBoundary++;
        break;
      case 'missing-exception-message':
        summary.missingExceptionMessage++;
        break;
    }
  }

  return summary;
}
