/**
 * プロジェクトプロファイルの型定義
 */

/**
 * ファイル解析結果
 */
export interface AnalysisResult {
  issues: unknown[];
  metrics: unknown;
}

export interface ProjectProfile {
  /** プロファイルID */
  id: string;
  /** 表示名 */
  displayName: string;
  /** プロファイルの説明 */
  description: string;
  /** プロファイルを検出する関数 */
  detect: (workspaceRoot: string) => Promise<boolean>;
  /** 変更スコープの許容行数 */
  allowedChangeScopeLines: string[];
  /** テストファイルかどうかを判定する関数 */
  testFilePredicate: (relativePath: string) => boolean;
  /** テストのようなパスかどうかを判定する関数 */
  testLikePathPredicate: (relativePath: string) => boolean;
  /** ファイル内容を解析する関数 */
  analyzeFileContent: (relativePath: string, content: string) => AnalysisResult;
}
