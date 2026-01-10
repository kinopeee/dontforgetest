import * as path from 'path';
import * as vscode from 'vscode';
import { t } from './l10n';
import { type AnalysisIssue, type AnalysisSummary } from './testAnalyzer';
import { tsjsProfile, type ProjectProfile } from './projectProfile';

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 観点表ケースID未実装の問題
 */
export interface MissingCaseIdIssue {
  caseId: string;
  /** このcaseIdが見つからなかったテストファイル（ワークスペース相対） */
  file: string;
  detail: string;
}

/**
 * 戦略準拠チェック結果
 */
export interface ComplianceCheckResult {
  /** 分析したファイル数 */
  analyzedFiles: number;
  /** testAnalyzer由来の問題（G/W/T不足、境界値不足、例外メッセージ未検証） */
  analysisIssues: AnalysisIssue[];
  /** testAnalyzer由来のサマリー */
  analysisSummary: AnalysisSummary;
  /** 観点表caseId未実装の問題 */
  missingCaseIdIssues: MissingCaseIdIssue[];
  /** 観点表がOFF（スキップ）だった場合の警告 */
  perspectiveSkippedWarning?: string;
  /** チェックに通ったかどうか（問題が0件） */
  passed: boolean;
}

/**
 * 観点表MarkdownからcaseIdの一覧を抽出する。
 *
 * 想定フォーマット:
 * | Case ID | ... |
 * |---------|-----|
 * | TC-N-01 | ... |
 *
 * 1列目（パイプ区切り）をcaseIdとみなす。ヘッダ行・区切り行を除外する。
 */
export function extractCaseIdsFromPerspectiveMarkdown(perspectiveMarkdown: string): string[] {
  const lines = perspectiveMarkdown.split('\n');
  const caseIds: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // 区切り行（|---|---| 形式）をスキップ
    if (/^\|[-:|\s]+\|$/.test(trimmed)) {
      continue;
    }
    // テーブル行でない場合スキップ
    if (!trimmed.startsWith('|')) {
      continue;
    }
    // パイプで分割して1列目を取得
    const cells = trimmed.split('|').map((c) => c.trim());
    // cells[0]は先頭の空文字、cells[1]が実質の1列目
    const firstCell = cells[1] ?? '';
    // ヘッダ行（Case ID / ケースID 等）をスキップ
    if (firstCell.toLowerCase().includes('case') && firstCell.toLowerCase().includes('id')) {
      continue;
    }
    // 空でなく、TC- や TC_* などのパターンを持つものをcaseIdとみなす
    if (firstCell.length > 0 && /^TC[-_]?/i.test(firstCell)) {
      caseIds.push(firstCell);
    }
  }

  return caseIds;
}

/**
 * テストファイルの内容に、指定されたcaseIdがコメントまたは文字列として出現するかをチェックする。
 * cursor-agentへのプロンプトで「Case IDをコメントで記載すること」を要求しているため、
 * コメント内に TC-N-01 などが出現していれば実装済みとみなす。
 */
export function checkCaseIdPresence(testContent: string, caseId: string): boolean {
  // caseIdがそのまま出現するかをチェック（コメント・文字列問わず）
  //
  // NOTE:
  // - `\b` のような「単語境界」は `TC-N-01` のハイフンで境界判定されやすく扱いづらい。
  // - そのため、英数/ハイフン/アンダースコアを「caseId を構成しうる文字」とみなし、
  //   caseId の前後がそれ以外（または文字列端）である場合のみ一致とする。
  // - これにより、`TC-N-1` が `TC-N-10` に部分一致して誤検知するケースを防ぐ。
  const id = escapeRegExp(caseId);
  const tokenChars = '0-9A-Za-z_-';
  const re = new RegExp(`(^|[^${tokenChars}])${id}(?=[^${tokenChars}]|$)`, 'i');
  return re.test(testContent);
}

/**
 * 複数のテストファイルに対して、観点表caseIdの網羅をチェックする。
 *
 * @param testFileContents ファイル相対パスとその内容のマップ
 * @param caseIds 観点表から抽出したcaseId一覧
 * @returns 未実装のcaseIdの問題一覧
 */
export function checkCaseIdCoverage(
  testFileContents: Map<string, string>,
  caseIds: string[],
): MissingCaseIdIssue[] {
  const issues: MissingCaseIdIssue[] = [];

  // 全ファイルの内容を連結してチェック（どこかに存在すればOK）
  const allContent = Array.from(testFileContents.values()).join('\n');

  for (const caseId of caseIds) {
    if (!checkCaseIdPresence(allContent, caseId)) {
      // どのファイルにも存在しない場合
      // 代表として最初のファイルを記録（複数ファイルがある場合の便宜）
      const firstFile = testFileContents.keys().next().value ?? '(unknown)';
      issues.push({
        caseId,
        file: firstFile,
        detail: t('compliance.caseIdNotImplemented', caseId),
      });
    }
  }

  return issues;
}

/**
 * ファイルシステムからファイル内容を読み取る
 */
async function readFileContent(absolutePath: string): Promise<string | undefined> {
  try {
    const data = await vscode.workspace.fs.readFile(vscode.Uri.file(absolutePath));
    return Buffer.from(data).toString('utf8');
  } catch {
    return undefined;
  }
}

/**
 * テストファイルがテスト用のファイルかどうかを判定する。
 * - 後方互換のためエクスポート維持、実装はプロファイルへ委譲
 */
export function isTestFilePath(relativePath: string): boolean {
  return tsjsProfile.testFilePredicate(relativePath);
}

/**
 * 戦略準拠チェックを実行する。
 *
 * @param workspaceRoot ワークスペースのルートパス
 * @param testFilePaths 生成されたテストファイルの絶対パス一覧
 * @param perspectiveMarkdown 観点表Markdown（生成された場合）。undefined の場合はcaseIdチェックをスキップ
 * @param includeTestPerspectiveTable 観点表生成設定がONかどうか
 * @param profile プロジェクトプロファイル（未指定の場合は tsjsProfile を使用）
 */
export async function runComplianceCheck(params: {
  workspaceRoot: string;
  testFilePaths: string[];
  perspectiveMarkdown?: string;
  includeTestPerspectiveTable: boolean;
  profile?: ProjectProfile;
}): Promise<ComplianceCheckResult> {
  const { workspaceRoot, testFilePaths, perspectiveMarkdown, includeTestPerspectiveTable, profile } = params;
  const effectiveProfile = profile ?? tsjsProfile;

  // ファイル内容を読み取り
  const testFileContents = new Map<string, string>();
  for (const absPath of testFilePaths) {
    const content = await readFileContent(absPath);
    if (content !== undefined) {
      const relativePath = path.relative(workspaceRoot, absPath);
      testFileContents.set(relativePath, content);
    }
  }

  // testAnalyzerによる分析（プロファイル経由）
  const analysisIssues: AnalysisIssue[] = [];
  for (const [relativePath, content] of testFileContents.entries()) {
    const fileIssues = effectiveProfile.analyzeFileContent(relativePath, content);
    analysisIssues.push(...fileIssues);
  }

  // サマリー計算
  const analysisSummary: AnalysisSummary = {
    missingGwt: analysisIssues.filter((i) => i.type === 'missing-gwt').length,
    missingBoundary: analysisIssues.filter((i) => i.type === 'missing-boundary').length,
    missingExceptionMessage: analysisIssues.filter((i) => i.type === 'missing-exception-message').length,
    weakAssertion: analysisIssues.filter((i) => i.type === 'weak-assertion').length,
    unverifiedMock: analysisIssues.filter((i) => i.type === 'unverified-mock').length,
    globalStateLeak: analysisIssues.filter((i) => i.type === 'global-state-leak').length,
  };

  // 観点表caseIdチェック
  let missingCaseIdIssues: MissingCaseIdIssue[] = [];
  let perspectiveSkippedWarning: string | undefined;

  if (perspectiveMarkdown) {
    const caseIds = extractCaseIdsFromPerspectiveMarkdown(perspectiveMarkdown);
    if (caseIds.length > 0) {
      missingCaseIdIssues = checkCaseIdCoverage(testFileContents, caseIds);
    }
  } else if (!includeTestPerspectiveTable) {
    // 観点表生成がOFFの場合は警告を記録
    perspectiveSkippedWarning = t('compliance.perspectiveTableSkipped');
  }

  const totalIssues = analysisIssues.length + missingCaseIdIssues.length;
  const passed = totalIssues === 0;

  return {
    analyzedFiles: testFileContents.size,
    analysisIssues,
    analysisSummary,
    missingCaseIdIssues,
    perspectiveSkippedWarning,
    passed,
  };
}

/**
 * 準拠チェック結果をプロンプトに埋め込む形式のテキストに変換する。
 * cursor-agentへの自動修正プロンプトで使用。
 */
export function formatComplianceIssuesForPrompt(result: ComplianceCheckResult): string {
  const lines: string[] = [];

  if (result.analysisIssues.length > 0) {
    lines.push('## テスト品質の問題');
    lines.push('');
    for (const issue of result.analysisIssues) {
      const lineInfo = issue.line !== undefined ? `:${issue.line}` : '';
      lines.push(`- [${issue.type}] ${issue.file}${lineInfo}: ${issue.detail}`);
    }
    lines.push('');
  }

  if (result.missingCaseIdIssues.length > 0) {
    lines.push('## 観点表ケースID未実装');
    lines.push('');
    for (const issue of result.missingCaseIdIssues) {
      lines.push(`- ${issue.caseId}: ${issue.detail}`);
    }
    lines.push('');
  }

  if (result.perspectiveSkippedWarning) {
    lines.push('## 警告');
    lines.push('');
    lines.push(`- ${result.perspectiveSkippedWarning}`);
    lines.push('');
  }

  return lines.join('\n');
}
