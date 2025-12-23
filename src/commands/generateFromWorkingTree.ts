import * as vscode from 'vscode';
import { ensurePreflight } from '../core/preflight';
import { buildTestGenPrompt } from '../core/promptBuilder';
import { analyzeGitUnifiedDiff, extractChangedPaths, getWorkingTreeDiff, type WorkingTreeDiffMode } from '../git/diffAnalyzer';
import { type AgentProvider } from '../providers/provider';
import { runWithArtifacts } from './runWithArtifacts';

/**
 * 未コミット差分（staged / unstaged）に対してテスト生成を実行する。
 */
export async function generateTestFromWorkingTree(provider: AgentProvider, modelOverride?: string): Promise<void> {
  const preflight = await ensurePreflight();
  if (!preflight) {
    return;
  }
  const { workspaceRoot, defaultModel, testStrategyPath, cursorAgentCommand } = preflight;

  const selected = await vscode.window.showQuickPick<{
    label: string;
    description: string;
    mode: WorkingTreeDiffMode;
  }>(
    [
      { label: 'Staged（git add 済み）', description: 'git diff --cached', mode: 'staged' },
      { label: 'Unstaged（未ステージ）', description: 'git diff', mode: 'unstaged' },
      { label: 'Staged + Unstaged', description: '両方をまとめて対象にする', mode: 'both' },
    ],
    {
      title: '未コミット差分からテスト生成',
      placeHolder: '対象にする差分を選択してください',
    },
  );
  if (!selected) {
    return;
  }

  let diffText: string;
  try {
    diffText = await getWorkingTreeDiff(workspaceRoot, selected.mode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`git diff の取得に失敗しました: ${message}`);
    return;
  }

  if (diffText.trim().length === 0) {
    vscode.window.showInformationMessage(`未コミット差分（${selected.label}）に差分がありませんでした。`);
    return;
  }

  const analysis = analyzeGitUnifiedDiff(diffText);
  const changedFiles = extractChangedPaths(analysis);

  const { prompt } = await buildTestGenPrompt({
    workspaceRoot,
    targetLabel: `未コミット差分 (${selected.label})`,
    targetPaths: changedFiles,
    testStrategyPath,
  });

  const diffForPrompt = truncateText(diffText, 20_000);
  const finalPrompt = [
    prompt,
    '',
    '## 未コミット差分（参考）',
    `以下は ${selected.label} の差分です。必要に応じて参照してください。`,
    '',
    diffForPrompt,
  ].join('\n');

  const taskId = `fromWorkingTree-${Date.now()}`;
  const generationLabel = `未コミット差分 (${selected.label})`;
  await runWithArtifacts({
    provider,
    workspaceRoot,
    cursorAgentCommand,
    testStrategyPath,
    generationLabel,
    targetPaths: changedFiles,
    generationPrompt: finalPrompt,
    perspectiveReferenceText: diffForPrompt,
    model: modelOverride ?? defaultModel,
    generationTaskId: taskId,
  });
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n... (truncated: ${text.length} chars -> ${maxChars} chars)`;
}

