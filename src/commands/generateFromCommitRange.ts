import * as vscode from 'vscode';
import { ensurePreflight } from '../core/preflight';
import { t } from '../core/l10n';
import { buildTestGenPrompt } from '../core/promptBuilder';
import { analyzeGitUnifiedDiff, extractChangedPaths, getCommitRangeDiff } from '../git/diffAnalyzer';
import { type AgentProvider } from '../providers/provider';
import { runWithArtifacts, type TestGenerationRunMode } from './runWithArtifacts';

export interface GenerateTestCommandOptions {
  runLocation?: 'local' | 'worktree';
  runMode?: TestGenerationRunMode;
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
  const range = await vscode.window.showInputBox({
    title: t('quickPick.commitRangeTitle'),
    prompt: t('quickPick.commitRangePrompt'),
    value: 'HEAD~1..HEAD',
    validateInput: (value) => {
      if (value.trim().length === 0) {
        return t('quickPick.commitRangeValidation');
      }
      return undefined;
    },
  });
  if (!range) {
    return;
  }
  const trimmedRange = range.trim();

  const preflight = await ensurePreflight();
  if (!preflight) {
    return;
  }
  const { workspaceRoot, defaultModel, testStrategyPath, cursorAgentCommand } = preflight;

  let diffText: string;
  try {
    diffText = await getCommitRangeDiff(workspaceRoot, trimmedRange);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(t('git.diff.fetchFailed', message));
    return;
  }

  if (diffText.trim().length === 0) {
    vscode.window.showInformationMessage(t('git.diff.noChanges', trimmedRange));
    return;
  }

  const analysis = analyzeGitUnifiedDiff(diffText);
  const changedFiles = extractChangedPaths(analysis);

  const { prompt } = await buildTestGenPrompt({
    workspaceRoot,
    targetLabel: t('prompt.commitRangeLabel', trimmedRange),
    targetPaths: changedFiles,
    testStrategyPath,
  });

  const diffForPrompt = truncateText(diffText, 20_000);
  const finalPrompt = [
    prompt,
    '',
    t('prompt.commitRangeSection'),
    t('prompt.commitRangeHint', trimmedRange),
    '',
    diffForPrompt,
  ].join('\n');

  const taskId = `fromCommitRange-${Date.now()}`;
  const generationLabel = t('prompt.generationLabel.commitRange', trimmedRange);

  const runMode: TestGenerationRunMode = options.runMode === 'perspectiveOnly' ? 'perspectiveOnly' : 'full';
  const requestedRunLocation = options.runLocation === 'worktree' ? 'worktree' : 'local';
  const effectiveRunLocation = runMode === 'perspectiveOnly' ? 'local' : requestedRunLocation;
  if (effectiveRunLocation === 'worktree' && !options.extensionContext) {
    vscode.window.showErrorMessage(t('worktree.extensionContextRequired'));
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
    runMode,
    runLocation: effectiveRunLocation,
    extensionContext: options.extensionContext,
  });
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n... (truncated: ${text.length} chars -> ${maxChars} chars)`;
}

