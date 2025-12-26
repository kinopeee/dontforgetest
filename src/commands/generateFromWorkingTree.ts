import * as vscode from 'vscode';
import { ensurePreflight, type PreflightOk } from '../core/preflight';
import { t } from '../core/l10n';
import { buildTestGenPrompt } from '../core/promptBuilder';
import { analyzeGitUnifiedDiff, extractChangedPaths, getWorkingTreeDiff, type WorkingTreeDiffMode } from '../git/diffAnalyzer';
import { type AgentProvider } from '../providers/provider';
import { runWithArtifacts } from './runWithArtifacts';
import { truncateText } from './runWithArtifacts/utils';

/** プロンプトに含める差分テキストの最大文字数 */
const MAX_DIFF_CHARS_FOR_PROMPT = 20_000;

export interface GenerateFromWorkingTreeDeps {
  ensurePreflight?: () => Promise<PreflightOk | undefined>;
  getWorkingTreeDiff?: (repoRoot: string, mode: WorkingTreeDiffMode) => Promise<string>;
  analyzeGitUnifiedDiff?: typeof analyzeGitUnifiedDiff;
  extractChangedPaths?: typeof extractChangedPaths;
  buildTestGenPrompt?: typeof buildTestGenPrompt;
  runWithArtifacts?: typeof runWithArtifacts;
  now?: () => number;
}

/**
 * 未コミット差分（staged / unstaged）に対してテスト生成を実行する。
 */
export async function generateTestFromWorkingTree(
  provider: AgentProvider,
  modelOverride?: string,
  deps?: GenerateFromWorkingTreeDeps,
): Promise<void> {
  const resolvedDeps: Required<GenerateFromWorkingTreeDeps> = {
    ensurePreflight: deps?.ensurePreflight ?? ensurePreflight,
    getWorkingTreeDiff: deps?.getWorkingTreeDiff ?? getWorkingTreeDiff,
    analyzeGitUnifiedDiff: deps?.analyzeGitUnifiedDiff ?? analyzeGitUnifiedDiff,
    extractChangedPaths: deps?.extractChangedPaths ?? extractChangedPaths,
    buildTestGenPrompt: deps?.buildTestGenPrompt ?? buildTestGenPrompt,
    runWithArtifacts: deps?.runWithArtifacts ?? runWithArtifacts,
    now: deps?.now ?? Date.now,
  };

  const preflight = await resolvedDeps.ensurePreflight();
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
      { label: t('quickPick.staged'), description: 'git diff --cached', mode: 'staged' },
      { label: t('quickPick.unstaged'), description: 'git diff', mode: 'unstaged' },
      { label: t('quickPick.both'), description: t('quickPick.bothDescription'), mode: 'both' },
    ],
    {
      title: t('quickPick.workingTreeTitle'),
      placeHolder: t('quickPick.workingTreePlaceholder'),
    },
  );
  if (!selected) {
    return;
  }

  let diffText: string;
  try {
    diffText = await resolvedDeps.getWorkingTreeDiff(workspaceRoot, selected.mode);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(t('git.diff.fetchFailed', message));
    return;
  }

  if (diffText.trim().length === 0) {
    vscode.window.showInformationMessage(t('git.workingTree.noChanges', selected.label));
    return;
  }

  const analysis = resolvedDeps.analyzeGitUnifiedDiff(diffText);
  const changedFiles = resolvedDeps.extractChangedPaths(analysis);

  const { prompt } = await resolvedDeps.buildTestGenPrompt({
    workspaceRoot,
    targetLabel: t('prompt.uncommittedLabel', selected.label),
    targetPaths: changedFiles,
    testStrategyPath,
  });

  const diffForPrompt = truncateText(diffText, MAX_DIFF_CHARS_FOR_PROMPT);
  const finalPrompt = [
    prompt,
    '',
    t('prompt.uncommittedSection'),
    t('prompt.uncommittedHint', selected.label),
    '',
    diffForPrompt,
  ].join('\n');

  const taskId = `fromWorkingTree-${resolvedDeps.now()}`;
  const generationLabel = t('prompt.generationLabel.uncommitted', selected.label);
  await resolvedDeps.runWithArtifacts({
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
