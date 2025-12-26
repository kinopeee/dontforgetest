import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { emitLogEvent } from '../../core/artifacts';
import { t } from '../../core/l10n';
import { buildMergeAssistanceInstructionMarkdown, buildMergeAssistancePromptText } from '../../core/mergeAssistancePrompt';
import { filterTestLikePaths } from '../../core/testPathClassifier';
import { execGitResult, execGitStdout } from '../../git/gitExec';
import { appendEventToOutput } from '../../ui/outputChannel';
import { dedupeStable } from './utils';

export async function applyWorktreeTestChanges(params: {
  generationTaskId: string;
  genExit: number | null;
  localWorkspaceRoot: string;
  runWorkspaceRoot: string;
  extensionContext: vscode.ExtensionContext;
  preTestCheckCommand: string;
}): Promise<void> {
  // 念のため。呼び出し側で worktreeDir を保証する想定だが、防御的に扱う。
  if (!params.runWorkspaceRoot || params.runWorkspaceRoot.trim().length === 0) {
    return;
  }

  try {
    const trackedChanged = await listGitPaths(params.runWorkspaceRoot, ['diff', '--name-only']);
    const untracked = await listGitPaths(params.runWorkspaceRoot, ['ls-files', '--others', '--exclude-standard']);
    const allChanged = dedupeStable([...trackedChanged, ...untracked]);
    const testPaths = filterTestLikePaths(allChanged);

    if (testPaths.length === 0) {
      appendEventToOutput(emitLogEvent(params.generationTaskId, 'info', t('worktree.apply.noTestDiffFound')));
      return;
    }

    // 新規ファイル（untracked）は `git add -N`（intent-to-add）にして diff に含める
    const untrackedSet = new Set(untracked.map((p) => p.replace(/\\/g, '/')));
    const untrackedTests = testPaths.filter((p) => untrackedSet.has(p));
    if (untrackedTests.length > 0) {
      const addRes = await execGitResult(params.runWorkspaceRoot, ['add', '-N', '--', ...untrackedTests], 10 * 1024 * 1024);
      if (!addRes.ok) {
        appendEventToOutput(
          emitLogEvent(
            params.generationTaskId,
            'warn',
            `新規テストファイルをdiffへ含める準備（git add -N）に失敗しました（続行します）: ${addRes.output}`,
          ),
        );
      }
    }

    // NOTE:
    // git apply はパッチ末尾が改行で終わっていないと `corrupt patch` になることがある。
    // そのため、git diff の生出力の末尾改行は削らず、必要なら補完して保存する。
    const patchTextRaw = await execGitStdout(
      params.runWorkspaceRoot,
      ['diff', '--no-color', '--binary', '--', ...testPaths],
      20 * 1024 * 1024,
    );
    if (patchTextRaw.trim().length === 0) {
      appendEventToOutput(emitLogEvent(params.generationTaskId, 'info', t('worktree.apply.emptyPatch')));
      return;
    }
    const patchText = patchTextRaw.endsWith('\n') ? patchTextRaw : `${patchTextRaw}\n`;

    // 生成が失敗している場合は、安全のため自動適用しない（パッチ/スナップショットを保存して案内）
    const shouldAutoApply = params.genExit === 0;

    const baseDir = params.extensionContext.globalStorageUri.fsPath;
    await fs.promises.mkdir(baseDir, { recursive: true });
    const tmpDir = path.join(baseDir, 'tmp');
    await fs.promises.mkdir(tmpDir, { recursive: true });
    const tmpPatchPath = path.join(tmpDir, `${params.generationTaskId}.patch`);
    await fs.promises.writeFile(tmpPatchPath, patchText, 'utf8');

    let applyCheckOutput = '';
    if (shouldAutoApply) {
      const checkRes = await execGitResult(params.localWorkspaceRoot, ['apply', '--check', tmpPatchPath], 20 * 1024 * 1024);
      if (!checkRes.ok) {
        applyCheckOutput = checkRes.output;
      } else {
        // check OK -> apply
        const applyRes = await execGitResult(params.localWorkspaceRoot, ['apply', tmpPatchPath], 20 * 1024 * 1024);
        if (applyRes.ok) {
          // 成功: 一時パッチは破棄
          try {
            await fs.promises.rm(tmpPatchPath, { force: true });
          } catch {
            // noop
          }
          appendEventToOutput(
            emitLogEvent(params.generationTaskId, 'info', `worktreeで生成したテスト差分をローカルへ適用しました（${testPaths.length}件）`),
          );
          void vscode.window.showInformationMessage(`Worktreeのテスト差分をローカルへ適用しました（${testPaths.length}件）`);
          return;
        }
        applyCheckOutput = applyRes.output;
      }
    } else {
      applyCheckOutput = `cursor-agent の終了コードが 0 ではないため、自動適用しませんでした（exit=${params.genExit ?? 'null'}）`;
    }

    // ここに来るのは「自動適用しない / できない」ケース
    const persisted = await persistMergeArtifacts({
      generationTaskId: params.generationTaskId,
      baseDir,
      tmpPatchPath,
      patchText,
      testPaths,
      runWorkspaceRoot: params.runWorkspaceRoot,
      applyCheckOutput,
      preTestCheckCommand: params.preTestCheckCommand,
    });

    // ユーザーへ案内（AI向けプロンプトも提供）
    // NOTE:
    // - ここでユーザー操作待ち（await）にすると、バックグラウンド実行の完了や worktree 削除が遅れる。
    // - 通知は表示するが、処理自体は先に進める（ボタン選択は then で非同期に処理する）。
    const warnMsg = t('worktree.apply.manualMergeRequired');
    appendEventToOutput(emitLogEvent(params.generationTaskId, 'warn', warnMsg));

    // ボタンが多いと視認性が悪化するため、導線は2つに絞る（詳細は指示ファイルに集約）
    const actionOpenInstruction = t('worktree.apply.actionOpenInstructions');
    const actionCopy = t('worktree.apply.actionCopyPrompt');
    void vscode.window.showWarningMessage(warnMsg, actionOpenInstruction, actionCopy).then(async (picked) => {
      try {
        if (picked === actionCopy) {
          const promptText = buildMergeAssistancePromptText({
            taskId: params.generationTaskId,
            applyCheckOutput,
            patchPath: persisted.patchPath,
            snapshotDir: persisted.snapshotDir,
            testPaths,
            preTestCheckCommand: params.preTestCheckCommand,
          });
          await vscode.env.clipboard.writeText(promptText);
          void vscode.window.showInformationMessage(t('worktree.apply.promptCopied'));
          return;
        }
        if (picked === actionOpenInstruction) {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(persisted.instructionPath));
          await vscode.window.showTextDocument(doc, { preview: true });
          return;
        }
      } catch {
        // noop（通知導線の失敗は本処理の失敗ではない）
      }
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    appendEventToOutput(emitLogEvent(params.generationTaskId, 'warn', `worktree差分の適用処理で例外が発生しました（続行します）: ${message}`));
  }
}

async function persistMergeArtifacts(params: {
  generationTaskId: string;
  baseDir: string;
  tmpPatchPath: string;
  patchText: string;
  testPaths: string[];
  runWorkspaceRoot: string;
  applyCheckOutput: string;
  preTestCheckCommand: string;
}): Promise<{ patchPath: string; snapshotDir: string; instructionPath: string }> {
  const patchesDir = path.join(params.baseDir, 'patches');
  const snapshotsDir = path.join(params.baseDir, 'snapshots', params.generationTaskId);
  const instructionsDir = path.join(params.baseDir, 'merge-instructions');
  await fs.promises.mkdir(patchesDir, { recursive: true });
  await fs.promises.mkdir(snapshotsDir, { recursive: true });
  await fs.promises.mkdir(instructionsDir, { recursive: true });

  const patchPath = path.join(patchesDir, `${params.generationTaskId}.patch`);
  // tmp -> patches へ移動（失敗しても最後に write で残す）
  try {
    await fs.promises.rename(params.tmpPatchPath, patchPath);
  } catch {
    await fs.promises.writeFile(patchPath, params.patchText, 'utf8');
    try {
      await fs.promises.rm(params.tmpPatchPath, { force: true });
    } catch {
      // noop
    }
  }

  // 生成済みテストのスナップショットを保存（完成形のフル内容）
  for (const rel of params.testPaths) {
    const src = path.join(params.runWorkspaceRoot, rel);
    const dst = path.join(snapshotsDir, rel);
    try {
      const stat = await fs.promises.stat(src);
      if (!stat.isFile()) {
        continue;
      }
      await fs.promises.mkdir(path.dirname(dst), { recursive: true });
      await fs.promises.copyFile(src, dst);
    } catch {
      // deleted などは無視（指示文側で patch/snapshot を見て判断してもらう）
    }
  }

  const instructionPath = path.join(instructionsDir, `${params.generationTaskId}.md`);
  const md = buildMergeAssistanceInstructionMarkdown({
    taskId: params.generationTaskId,
    applyCheckOutput: params.applyCheckOutput,
    patchPath,
    snapshotDir: snapshotsDir,
    testPaths: params.testPaths,
    preTestCheckCommand: params.preTestCheckCommand,
  });
  await fs.promises.writeFile(instructionPath, md, 'utf8');

  appendEventToOutput(
    emitLogEvent(
      params.generationTaskId,
      'info',
      `自動適用に失敗したため、マージ用の保存物を作成しました: patch=${patchPath} snapshot=${snapshotsDir} instruction=${instructionPath}`,
    ),
  );

  return { patchPath, snapshotDir: snapshotsDir, instructionPath };
}

async function listGitPaths(cwd: string, args: string[]): Promise<string[]> {
  const out = await execGitStdout(cwd, args, 10 * 1024 * 1024);
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((p) => p.replace(/\\/g, '/'));
}

