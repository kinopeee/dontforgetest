import { type AnalysisContext, type AnalysisIssue } from '../types';

/**
 * 分析ルールの基底クラス
 */
export abstract class BaseAnalysisRule {
  /**
   * ルールの識別子
   */
  public abstract readonly id: string;

  /**
   * ルールの表示名
   */
  public abstract readonly displayName: string;

  /**
   * 分析を実行する
   *
   * @param context 分析コンテキスト
   * @returns 検出された問題のリスト
   */
  public abstract analyze(context: AnalysisContext): AnalysisIssue[];
}
