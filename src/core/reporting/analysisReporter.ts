import * as fs from 'fs';
import * as path from 'path';
import { type AnalysisResult } from '../analysis/types';
import { formatTimestamp } from '../artifacts';

/**
 * 分析結果をMarkdownファイルとして保存する
 *
 * @param workspaceRoot ワークスペースのルートパス
 * @param reportDir レポート出力ディレクトリ（ワークスペース相対または絶対）
 * @param result 分析結果
 * @returns 保存したファイルの絶対パス
 */
export async function saveAnalysisReport(
  workspaceRoot: string,
  reportDir: string,
  result: AnalysisResult
): Promise<string> {
  const outputDir = resolveDirAbsolute(workspaceRoot, reportDir);
  
  // 出力ディレクトリがなければ作成
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // ファイル名を生成
  const timestamp = formatTimestamp(new Date());
  const fileName = `test-analysis_${timestamp}.md`;
  const filePath = path.join(outputDir, fileName);

  // Markdownコンテンツを生成
  const content = buildReportContent(result);

  // ファイルに保存
  await fs.promises.writeFile(filePath, content, 'utf-8');

  return filePath;
}

/**
 * ワークスペースルートからの相対パスまたは絶対パスを絶対パスに解決する
 *
 * @param workspaceRoot ワークスペースのルートパス
 * @param dirPath ディレクトリパス
 * @returns 絶対パス
 */
function resolveDirAbsolute(workspaceRoot: string, dirPath: string): string {
  if (path.isAbsolute(dirPath)) {
    return dirPath;
  }
  return path.join(workspaceRoot, dirPath);
}

/**
 * 分析結果のMarkdownコンテンツを構築する
 *
 * @param result 分析結果
 * @returns Markdownコンテンツ
 */
function buildReportContent(result: AnalysisResult): string {
  const lines: string[] = [];

  // ヘッダー
  lines.push('# テスト分析レポート');
  lines.push('');
  lines.push(`**生成日時**: ${formatTimestamp(new Date())}`);
  lines.push(`**分析対象**: ${result.pattern}`);
  lines.push(`**対象ファイル数**: ${result.analyzedFiles}`);
  lines.push(`**検出された問題数**: ${result.issues.length}`);
  lines.push('');

  // サマリー
  lines.push('## サマリー');
  lines.push('');
  lines.push('| カテゴリ | 件数 |');
  lines.push('|---------|------|');
  lines.push(`| Given/When/Then 未実装 | ${result.summary.missingGwt} |`);
  lines.push(`| 境界値テスト未実装 | ${result.summary.missingBoundary} |`);
  lines.push(`| 例外メッセージ未検証 | ${result.summary.missingExceptionMessage} |`);
  lines.push('');

  // 問題詳細
  if (result.issues.length > 0) {
    lines.push('## 検出された問題');
    lines.push('');

    // ファイルごとにグループ化
    const issuesByFile = new Map<string, typeof result.issues>();
    for (const issue of result.issues) {
      const existing = issuesByFile.get(issue.file) || [];
      existing.push(issue);
      issuesByFile.set(issue.file, existing);
    }

    for (const [file, fileIssues] of issuesByFile) {
      lines.push(`### ${file}`);
      lines.push('');

      for (const issue of fileIssues) {
        const lineInfo = issue.line ? ` (行 ${issue.line})` : '';
        lines.push(`- ${issue.type}${lineInfo}: ${issue.detail}`);
      }
      lines.push('');
    }
  } else {
    lines.push('## ✅ 問題は検出されませんでした');
    lines.push('');
  }

  return lines.join('\n');
}
