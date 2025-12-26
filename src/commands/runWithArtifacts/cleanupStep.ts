import * as path from 'path';
import * as vscode from 'vscode';

export interface CleanupResult {
  deleted: boolean;
  relativePath: string;
  errorMessage?: string;
}

/**
 * ワークスペースルート直下に生成された所定フロー外の観点表ファイルを削除する。
 * `test_perspectives*.{md,json}` にマッチするファイルのうち、内部マーカーを含むものを削除対象とする。
 */
export async function cleanupUnexpectedPerspectiveFiles(workspaceRoot: string): Promise<CleanupResult[]> {
  const results: CleanupResult[] = [];

  // ワークスペースルート直下の test_perspectives*.{md,json} を検索
  // - cursor-agent が所定フロー外で「抽出用のマーカー付きデータ」をファイル保存してしまうことがある
  //   例: test_perspectives.md / test_perspectives_output.md / test_perspectives.json / test_perspectives_output.json
  // - ユーザーの意図したファイルまで消さないよう、**内部マーカーを含むものだけ**削除対象とする
  const patterns = ['test_perspectives*.md', 'test_perspectives*.json'] as const;
  const files: vscode.Uri[] = [];
  for (const p of patterns) {
    const found = await vscode.workspace.findFiles(new vscode.RelativePattern(workspaceRoot, p));
    files.push(...found);
  }
  // 重複排除（念のため）
  const uniqueFiles = Array.from(new Map(files.map((u) => [u.fsPath, u])).values());

  for (const uri of uniqueFiles) {
    const relativePath = path.relative(workspaceRoot, uri.fsPath);

    try {
      const raw = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      // 内部マーカー付きの観点表は「抽出用フォーマット」であり、所定フロー外の副産物として扱う。
      const hasLegacyMarkers =
        raw.includes('<!-- BEGIN TEST PERSPECTIVES -->') && raw.includes('<!-- END TEST PERSPECTIVES -->');
      const hasJsonMarkers =
        raw.includes('<!-- BEGIN TEST PERSPECTIVES JSON -->') && raw.includes('<!-- END TEST PERSPECTIVES JSON -->');
      if (!hasLegacyMarkers && !hasJsonMarkers) {
        continue;
      }
      await vscode.workspace.fs.delete(uri, { useTrash: false });
      results.push({ deleted: true, relativePath });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ deleted: false, relativePath, errorMessage: msg });
    }
  }

  return results;
}



