import * as vscode from 'vscode';
import { recordTouchedPathFromEventPath, startLastRun } from '../apply/patchApplier';
import { ensurePreflight } from '../core/preflight';
import { buildTestGenPrompt } from '../core/promptBuilder';
import { analyzeGitUnifiedDiff, extractChangedPaths, getCommitRangeDiff } from '../git/diffAnalyzer';
import { type AgentProvider } from '../providers/provider';
import { appendEventToOutput, showTestGenOutput } from '../ui/outputChannel';
import { handleTestGenEventForStatusBar } from '../ui/statusBar';

/**
 * 指定したコミット範囲の差分に対してテスト生成を実行する。
 *
 * 例:
 * - main..HEAD
 * - HEAD~3..HEAD
 */
export async function generateTestFromCommitRange(provider: AgentProvider, modelOverride?: string): Promise<void> {
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

  showTestGenOutput(true);
  const taskId = `fromCommitRange-${Date.now()}`;
  await startLastRun(taskId, `コミット範囲(${trimmedRange})`, workspaceRoot, changedFiles);

  provider.run({
    taskId,
    workspaceRoot,
    agentCommand: cursorAgentCommand,
    prompt: finalPrompt,
    model: modelOverride ?? defaultModel,
    outputFormat: 'stream-json',
    allowWrite: true,
    onEvent: (event) => {
      handleTestGenEventForStatusBar(event);
      appendEventToOutput(event);
      if (event.type === 'fileWrite') {
        recordTouchedPathFromEventPath(workspaceRoot, event.path);
      }
      if (event.type === 'completed') {
        const msg =
          event.exitCode === 0
            ? `テスト生成が完了しました: コミット範囲 (${trimmedRange})`
            : `テスト生成に失敗しました: コミット範囲 (${trimmedRange}) (exit=${event.exitCode ?? 'null'})`;
        if (event.exitCode === 0) {
          vscode.window.showInformationMessage(msg);
        } else {
          vscode.window.showErrorMessage(msg);
        }
      }
    },
  });

  vscode.window.showInformationMessage(`テスト生成を開始しました: コミット範囲 (${trimmedRange})`);
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n... (truncated: ${text.length} chars -> ${maxChars} chars)`;
}

