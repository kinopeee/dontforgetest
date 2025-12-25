import * as vscode from 'vscode';
import { ensurePreflight } from '../core/preflight';
import { buildTestGenPrompt } from '../core/promptBuilder';
import { analyzeGitUnifiedDiff, extractChangedPaths, getCommitRangeDiff } from '../git/diffAnalyzer';
import { type AgentProvider } from '../providers/provider';
import { runWithArtifacts } from './runWithArtifacts';

export interface GenerateTestCommandOptions {
  runLocation?: 'local' | 'worktree';
  extensionContext?: vscode.ExtensionContext;
}

/**
 * 指定したコミット範囲の差分に対してテスト生成を実行する。
 *
 * 例:
 * - main..HEAD
 * - HEAD~3..HEAD
 */
export async function generateTestFromCommitRange(
  provider: AgentProvider,
  modelOverride?: string,
  options: GenerateTestCommandOptions = {},
): Promise<void> {
  const preflight = await ensurePreflight();
  if (!preflight) {
    return;
  }
  const { workspaceRoot, defaultModel, testStrategyPath, cursorAgentCommand } = preflight;

  const range = await vscode.window.showInputBox({
    title: 'コミット範囲差分からテスト生成',
    prompt: '差分対象のコミット範囲を入力してください（例: main..HEAD, HEAD~3..HEAD）',
    value: 'HEAD~1..HEAD',
    validateInput: (value) => {
      if (value.trim().length === 0) {
        return 'コミット範囲を入力してください。';
      }
      return undefined;
    },
  });
  if (!range) {
    return;
  }
  const trimmedRange = range.trim();

  let diffText: string;
  try {
    diffText = await getCommitRangeDiff(workspaceRoot, trimmedRange);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`git diff の取得に失敗しました: ${message}`);
    return;
  }

  if (diffText.trim().length === 0) {
    vscode.window.showInformationMessage(`指定範囲（${trimmedRange}）に差分がありませんでした。`);
    return;
  }

  const analysis = analyzeGitUnifiedDiff(diffText);
  const changedFiles = extractChangedPaths(analysis);

  const { prompt } = await buildTestGenPrompt({
    workspaceRoot,
    targetLabel: `コミット範囲差分 (${trimmedRange})`,
    targetPaths: changedFiles,
    testStrategyPath,
  });

  const diffForPrompt = truncateText(diffText, 20_000);
  const finalPrompt = [
    prompt,
    '',
    '## コミット範囲差分（参考）',
    `以下は ${trimmedRange} の差分です。必要に応じて参照してください。`,
    '',
    diffForPrompt,
  ].join('\n');

  const taskId = `fromCommitRange-${Date.now()}`;
  const generationLabel = `コミット範囲 (${trimmedRange})`;

  const runLocation = options.runLocation === 'worktree' ? 'worktree' : 'local';
  if (runLocation === 'worktree' && !options.extensionContext) {
    vscode.window.showErrorMessage('Worktree 実行には拡張機能コンテキストが必要です（内部エラー）。');
    return;
  }

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
    runLocation,
    extensionContext: options.extensionContext,
  });
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n... (truncated: ${text.length} chars -> ${maxChars} chars)`;
}

