import { execFile } from 'child_process';
import * as vscode from 'vscode';
import { promisify } from 'util';
import { ensurePreflight } from '../core/preflight';
import { buildTestGenPrompt } from '../core/promptBuilder';
import { runWithArtifacts } from './runWithArtifacts';
import { type AgentProvider } from '../providers/provider';

const execFileAsync = promisify(execFile);

/**
 * 最新コミット（HEAD）の差分に対してテスト生成を実行する。
 */
export async function generateTestFromLatestCommit(provider: AgentProvider, modelOverride?: string): Promise<void> {
  const preflight = await ensurePreflight();
  if (!preflight) {
    return;
  }
  const { workspaceRoot, defaultModel, testStrategyPath, cursorAgentCommand } = preflight;

  const commit = await getHeadCommitHash(workspaceRoot);
  if (!commit) {
    vscode.window.showErrorMessage('Git の HEAD が解決できません。まだコミットが存在しない可能性があります。');
    return;
  }

  const changedFiles = await getChangedFilesInHead(workspaceRoot);
  if (changedFiles.length === 0) {
    vscode.window.showInformationMessage(`最新コミット（${commit.slice(0, 7)}）に変更ファイルが見つかりませんでした。`);
    return;
  }

  const diffText = await getHeadDiffText(workspaceRoot);
  const diffForPrompt = truncateText(diffText, 20_000);

  const { prompt } = await buildTestGenPrompt({
    workspaceRoot,
    targetLabel: `最新コミット差分 (${commit.slice(0, 7)})`,
    targetPaths: changedFiles,
    testStrategyPath,
  });

  const finalPrompt = [
    prompt,
    '',
    '## 最新コミット差分（参考）',
    '以下は HEAD の差分です。必要に応じて参照してください。',
    '',
    diffForPrompt,
  ].join('\n');

  const taskId = `fromCommit-${Date.now()}`;
  const generationLabel = `最新コミット (${commit.slice(0, 7)})`;
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

async function getHeadCommitHash(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

async function getChangedFilesInHead(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
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
    const { stdout } = await execFileAsync('git', ['show', '--no-color', '--pretty=format:COMMIT %H%nSUBJECT %s%n', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      // 差分が大きい場合に備えて余裕を持たせる
      maxBuffer: 20 * 1024 * 1024,
    });
    return stdout.trim();
  } catch {
    return '(差分の取得に失敗しました)';
  }
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n... (truncated: ${text.length} chars -> ${maxChars} chars)`;
}

