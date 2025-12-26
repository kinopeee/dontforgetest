import * as vscode from 'vscode';
import { ensurePreflight } from '../core/preflight';
import { t } from '../core/l10n';
import { buildTestGenPrompt } from '../core/promptBuilder';
import { execGitStdout } from '../git/gitExec';
import { runWithArtifacts } from './runWithArtifacts';
import { type AgentProvider } from '../providers/provider';

/**
 * 最新コミット（HEAD）の差分に対してテスト生成を実行する。
 */
export interface GenerateTestCommandOptions {
  runLocation?: 'local' | 'worktree';
  extensionContext?: vscode.ExtensionContext;
}

export async function generateTestFromLatestCommit(
  provider: AgentProvider,
  modelOverride?: string,
  options: GenerateTestCommandOptions = {},
): Promise<void> {
  const preflight = await ensurePreflight();
  if (!preflight) {
    return;
  }
  const { workspaceRoot, defaultModel, testStrategyPath, cursorAgentCommand } = preflight;

  const commit = await getHeadCommitHash(workspaceRoot);
  if (!commit) {
    vscode.window.showErrorMessage(t('git.head.resolveFailed'));
    return;
  }

  const changedFiles = await getChangedFilesInHead(workspaceRoot);
  if (changedFiles.length === 0) {
    vscode.window.showInformationMessage(t('git.head.noChanges', commit.slice(0, 7)));
    return;
  }

  const diffText = await getHeadDiffText(workspaceRoot);
  const diffForPrompt = truncateText(diffText, 20_000);

  const { prompt } = await buildTestGenPrompt({
    workspaceRoot,
    targetLabel: t('prompt.latestCommitLabel', commit.slice(0, 7)),
    targetPaths: changedFiles,
    testStrategyPath,
  });

  const finalPrompt = [
    prompt,
    '',
    t('prompt.latestCommitSection'),
    t('prompt.latestCommitHint'),
    '',
    diffForPrompt,
  ].join('\n');

  const taskId = `fromCommit-${Date.now()}`;
  const generationLabel = t('prompt.generationLabel.latestCommit', commit.slice(0, 7));

  const runLocation = options.runLocation === 'worktree' ? 'worktree' : 'local';
  if (runLocation === 'worktree' && !options.extensionContext) {
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
    runLocation,
    extensionContext: options.extensionContext,
  });
}

async function getHeadCommitHash(cwd: string): Promise<string | undefined> {
  try {
    const stdout = await execGitStdout(cwd, ['rev-parse', 'HEAD'], 1024 * 1024);
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

async function getChangedFilesInHead(cwd: string): Promise<string[]> {
  try {
    const stdout = await execGitStdout(cwd, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], 1024 * 1024);
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

async function getHeadDiffText(cwd: string): Promise<string> {
  try {
    const stdout = await execGitStdout(cwd, ['show', '--no-color', '--pretty=format:COMMIT %H%nSUBJECT %s%n', 'HEAD'], 20 * 1024 * 1024);
    return stdout.trim();
  } catch {
    return t('git.diff.failed');
  }
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n... (truncated: ${text.length} chars -> ${maxChars} chars)`;
}

