import * as path from 'path';
import * as vscode from 'vscode';
import { formatTimestamp, resolveDirAbsolute } from './artifacts';
import { nowMs } from './event';
import { t } from './l10n';
import {
  type TestFunction,
  type AnalysisContext
} from './analysis/types';
import { 
  type AnalysisResult,
  type AnalysisIssue,
  type AnalysisSummary
} from './analysis/types';
import { createDefaultAnalysisPipeline, TestFileAnalysisPipeline } from './analysis/analyzer';
import { calculateSummary } from './reporting/summaryCalculator';
import { saveAnalysisReport as saveReport } from './reporting/analysisReporter';

/**
 * デフォルトの分析設定を取得する
 */
export function getAnalysisSettings(): { reportDir: string; testFilePattern: string } {
  const config = vscode.workspace.getConfiguration('dontforgetest');
  const reportDir = (config.get<string>('analysisReportDir', 'docs/test-analysis-reports') ?? 'docs/test-analysis-reports').trim();
  const testFilePattern = (config.get<string>('analysisTestFilePattern', 'src/test/**/*.test.ts') ?? 'src/test/**/*.test.ts').trim();
  return { reportDir, testFilePattern };
}

/**
 * 指定パターンに一致するテストファイルを分析する
 *
 * @param workspaceRoot ワークスペースのルートパス
 * @param pattern glob パターン（例: src/test/**\/*.test.ts）
 * @returns 分析結果
 */
export async function analyzeTestFiles(
  workspaceRoot: string,
  pattern: string,
): Promise<AnalysisResult> {
  const issues: AnalysisIssue[] = [];

  // ファイルを検索
  const files = await findTestFiles(workspaceRoot, pattern);

  for (const file of files) {
    const relativePath = path.relative(workspaceRoot, file);
    const content = await readFileContent(file);
    if (content === undefined) {
      continue;
    }

    // 各分析ルールを適用
    const fileIssues = analyzeFileContent(relativePath, content);
    issues.push(...fileIssues);
  }

  // サマリーを計算
  const summary = calculateSummary(issues);

  return {
    analyzedFiles: files.length,
    issues,
    summary,
    pattern,
  };
}

/**
 * 単一ファイルを分析する
 *
 * @param filePath ファイルの絶対パス
 * @param workspaceRoot ワークスペースのルートパス
 * @returns 分析結果
 */
export async function analyzeFile(
  filePath: string,
  workspaceRoot: string,
): Promise<AnalysisResult> {
  const issues: AnalysisIssue[] = [];
  const relativePath = path.relative(workspaceRoot, filePath);
  const content = await readFileContent(filePath);

  if (content !== undefined) {
    const fileIssues = analyzeFileContent(relativePath, content);
    issues.push(...fileIssues);
  }

  const summary = calculateSummary(issues);

  return {
    analyzedFiles: content !== undefined ? 1 : 0,
    issues,
    summary,
    pattern: relativePath,
  };
}

/**
 * デフォルトの分析パイプライン（シングルトン）
 *
 * パフォーマンスのため、毎回新規作成せずに再利用する。
 */
const defaultPipeline = createDefaultAnalysisPipeline();

/**
 * ファイル内容を分析して問題を検出する
 *
 * 後方互換性のためのファサード関数。内部では TestFileAnalysisPipeline に委譲する。
 */
export function analyzeFileContent(relativePath: string, content: string): AnalysisIssue[] {
  return defaultPipeline.analyze(relativePath, content);
}

/**
 * 分析結果をレポートとして保存する
 *
 * @param workspaceRoot ワークスペースのルートパス
 * @param result 分析結果
 * @returns 保存したファイルのパス
 */
export async function saveAnalysisReport(
  workspaceRoot: string,
  result: AnalysisResult
): Promise<string> {
  const settings = getAnalysisSettings();
  return saveReport(workspaceRoot, settings.reportDir, result);
}

// --- ヘルパー関数 ---

/**
 * 指定パターンに一致するテストファイルを検索する
 */
async function findTestFiles(workspaceRoot: string, pattern: string): Promise<string[]> {
  const absolutePattern = path.isAbsolute(pattern) ? pattern : path.join(workspaceRoot, pattern);
  const uris = await vscode.workspace.findFiles(absolutePattern, '**/node_modules/**');
  return uris.map(uri => uri.fsPath);
}

/**
 * ファイル内容を読み込む
 */
async function readFileContent(filePath: string): Promise<string | undefined> {
  try {
    const uri = vscode.Uri.file(filePath);
    const content = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(content).toString('utf-8');
  } catch {
    return undefined;
  }
}

// --- 後方互換性のためのエクスポート ---

/**
 * @deprecated 代わりに analysis/types.ts からインポートしてください
 */
export type AnalysisIssueType =
  | 'missing-gwt'
  | 'missing-boundary'
  | 'missing-exception-message';

// Re-export types from analysis/types for backward compatibility
export type { AnalysisResult, AnalysisIssue, AnalysisSummary, TestFunction, AnalysisContext } from './analysis/types';
