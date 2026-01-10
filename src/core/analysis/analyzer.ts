import { 
  type AnalysisContext, 
  type AnalysisIssue,
  type TestFunction
} from './types';
import { 
  BaseAnalysisRule,
  GivenWhenThenAnalysisRule,
  BoundaryValueAnalysisRule,
  ExceptionMessageAnalysisRule
} from './rules';
import { extractCodeOnlyContent } from '../parsers/codeExtractor';
import { extractTestFunctions } from '../parsers/testParser';

/**
 * テストファイルの前処理を行うクラス
 */
export class TestFilePreprocessor {
  /**
   * コメントと文字列リテラルを除いたコードを抽出する
   */
  extractCodeOnlyContent(content: string): string {
    return extractCodeOnlyContent(content);
  }

  /**
   * テスト関数を抽出する
   */
  extractTestFunctions(content: string, codeOnlyContent: string): TestFunction[] {
    return extractTestFunctions(content, codeOnlyContent);
  }
}

/**
 * テストファイル分析パイプライン
 */
export class TestFileAnalysisPipeline {
  private preprocessor = new TestFilePreprocessor();
  private rules: BaseAnalysisRule[] = [];

  /**
   * 分析ルールを追加する
   */
  addRule(rule: BaseAnalysisRule): this {
    this.rules.push(rule);
    return this;
  }

  /**
   * ファイル内容を分析して問題を検出する
   */
  analyze(relativePath: string, content: string): AnalysisIssue[] {
    const codeOnlyContent = this.preprocessor.extractCodeOnlyContent(content);
    const testFunctions = this.preprocessor.extractTestFunctions(content, codeOnlyContent);

    const context: AnalysisContext = {
      relativePath,
      content,
      codeOnlyContent,
      testFunctions,
    };

    const issues: AnalysisIssue[] = [];
    for (const rule of this.rules) {
      issues.push(...rule.analyze(context));
    }

    return issues;
  }
}

/**
 * デフォルトの分析パイプラインを作成する
 *
 * 標準の3つのルール（G/W/T、境界値、例外メッセージ）を含むパイプラインを返す。
 */
export function createDefaultAnalysisPipeline(): TestFileAnalysisPipeline {
  return new TestFileAnalysisPipeline()
    .addRule(new GivenWhenThenAnalysisRule())
    .addRule(new BoundaryValueAnalysisRule())
    .addRule(new ExceptionMessageAnalysisRule());
}
