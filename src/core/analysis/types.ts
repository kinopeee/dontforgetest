/**
 * 分析で検出された問題の種別
 */
export type AnalysisIssueType =
  | 'missing-gwt'
  | 'missing-boundary'
  | 'missing-exception-message';

/**
 * 分析で検出された個別の問題
 */
export interface AnalysisIssue {
  type: AnalysisIssueType;
  /** ワークスペース相対パス */
  file: string;
  /** 問題が検出された行番号（1始まり）。ファイル単位の問題の場合は undefined */
  line?: number;
  /** 問題の詳細説明 */
  detail: string;
}

/**
 * 分析結果のサマリー
 */
export interface AnalysisSummary {
  missingGwt: number;
  missingBoundary: number;
  missingExceptionMessage: number;
}

/**
 * 分析結果
 */
export interface AnalysisResult {
  /** 分析したファイル数 */
  analyzedFiles: number;
  /** 検出された問題のリスト */
  issues: AnalysisIssue[];
  /** カテゴリ別の件数サマリー */
  summary: AnalysisSummary;
  /** 分析対象パターン */
  pattern: string;
}

/**
 * テスト関数の情報
 */
export interface TestFunction {
  name: string;
  startLine: number;
  endLine: number;
  content: string;
  /**
   * テスト関数の元のソースコード（コメントを含む）
   */
  originalContent: string;
}

/**
 * 分析コンテキスト
 */
export interface AnalysisContext {
  /** ワークスペース相対パス */
  relativePath: string;
  /** 元のソースコード */
  content: string;
  /** コメントと文字列リテラルを除いたコード */
  codeOnlyContent: string;
  /** 抽出されたテスト関数のリスト */
  testFunctions: TestFunction[];
}

/**
 * Given/When/Then コメントの厳格チェック結果
 */
export interface GwtCheckResult {
  valid: boolean;
  missing: string[];
}
