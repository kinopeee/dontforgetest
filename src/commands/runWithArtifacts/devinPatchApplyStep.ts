import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { emitLogEvent } from '../../core/artifacts';
import { filterTestLikePaths } from '../../core/testPathClassifier';
import { execGitResult } from '../../git/gitExec';
import { appendEventToOutput } from '../../ui/outputChannel';

export type DevinPatchApplyResult = {
  applied: boolean;
  /** パッチに含まれるテストファイル（ワークスペース相対、/ 区切り） */
  testPaths: string[];
  /** パッチが保存されたパス（永続化された場合のみ） */
  persistedPatchPath?: string;
  reason:
    | 'applied'
    | 'empty-patch'
    | 'no-diff-paths'
    | 'no-test-paths'
    | 'contains-non-test-paths'
    | 'apply-failed'
    | 'exception';
};

const PATCH_MARKER_BEGIN = '<!-- BEGIN DONTFORGETEST PATCH -->';
const PATCH_MARKER_END = '<!-- END DONTFORGETEST PATCH -->';

/**
 * Devin のログ出力からパッチ（unified diff）を抽出する。
 */
export function extractDevinPatchFromLogs(rawLogs: string): string | undefined {
  const start = rawLogs.indexOf(PATCH_MARKER_BEGIN);
  if (start === -1) {
    return undefined;
  }
  const afterStart = start + PATCH_MARKER_BEGIN.length;
  const end = rawLogs.indexOf(PATCH_MARKER_END, afterStart);
  if (end === -1) {
    return undefined;
  }
  return rawLogs.slice(afterStart, end).trim();
}

/**
 * unified diff から `diff --git a/... b/...` のパスを抽出する。
 */
export function extractPathsFromUnifiedDiff(patchText: string): string[] {
  const lines = patchText.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (p: string) => {
    const normalized = p.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    out.push(normalized);
  };

  for (const line of lines) {
    // diff --git a/foo b/foo
    if (line.startsWith('diff --git ')) {
      // diff --git a/<path> b/<path>
      const m = /^diff --git a\/(.+?) b\/(.+?)\s*$/.exec(line);
      if (m?.[2]) {
        push(m[2]);
      } else if (m?.[1]) {
        push(m[1]);
      }
      continue;
    }
    // 念のため: diff --git が無い形式でも +++ b/<path> から拾う
    if (line.startsWith('+++ ')) {
      const m = /^\+\+\+\s+(?:b\/)?(.+?)\s*$/.exec(line);
      const p = m?.[1];
      if (p && p !== '/dev/null') {
        push(p);
      }
    }
  }

  return out;
}

/**
 * Devin が返した unified diff パッチを、指定リポジトリへ `git apply` で適用する。
 *
 * 重要:
 * - 事故防止のため「テストファイルっぽいパス」だけが含まれる場合に限り適用する。
 * - それ以外（実装コード/ドキュメント等）が含まれる場合は適用せず、パッチを保存して案内する。
 */
export async function applyDevinPatchToRepo(params: {
  /** Task ID（ログ/保存ファイル名に使用） */
  generationTaskId: string;
  /** パッチ本文（マーカー除去済み） */
  patchText: string;
  /** `git apply` を実行する cwd（repo root を想定） */
  runWorkspaceRoot: string;
  /** パッチ保存先（globalStorage があればそれを優先）。未指定の場合は OS tmp に保存する。 */
  extensionContext?: vscode.ExtensionContext;
}): Promise<DevinPatchApplyResult> {
  try {
    const patchTextTrimmed = params.patchText.trim();
    if (patchTextTrimmed.length === 0) {
      appendEventToOutput(emitLogEvent(params.generationTaskId, 'warn', 'Devin パッチが空のため、適用をスキップしました。'));
      return { applied: false, testPaths: [], reason: 'empty-patch' };
    }
    const patchTextFinal = patchTextTrimmed.endsWith('\n') ? patchTextTrimmed : `${patchTextTrimmed}\n`;

    const allPaths = extractPathsFromUnifiedDiff(patchTextFinal);
    if (allPaths.length === 0) {
      appendEventToOutput(emitLogEvent(params.generationTaskId, 'warn', 'Devin パッチから変更ファイルパスを抽出できませんでした。'));
      const persistedPatchPath = await persistPatch(params.generationTaskId, patchTextFinal, params.extensionContext);
      return { applied: false, testPaths: [], persistedPatchPath, reason: 'no-diff-paths' };
    }

    const testPaths = filterTestLikePaths(allPaths);
    if (testPaths.length === 0) {
      appendEventToOutput(
        emitLogEvent(params.generationTaskId, 'warn', 'Devin パッチにテストファイルが含まれないため、適用をスキップしました。'),
      );
      const persistedPatchPath = await persistPatch(params.generationTaskId, patchTextFinal, params.extensionContext);
      return { applied: false, testPaths: [], persistedPatchPath, reason: 'no-test-paths' };
    }

    const testSet = new Set(testPaths);
    const nonTest = allPaths.filter((p) => !testSet.has(p));
    if (nonTest.length > 0) {
      appendEventToOutput(
        emitLogEvent(
          params.generationTaskId,
          'warn',
          `Devin パッチにテスト以外の変更が含まれるため、適用を拒否しました: ${nonTest.join(', ')}`,
        ),
      );
      const persistedPatchPath = await persistPatch(params.generationTaskId, patchTextFinal, params.extensionContext);
      return { applied: false, testPaths, persistedPatchPath, reason: 'contains-non-test-paths' };
    }

    const { tmpPatchPath, patchesDir } = await preparePatchPaths(params.generationTaskId, params.extensionContext);
    await fs.promises.mkdir(path.dirname(tmpPatchPath), { recursive: true });
    await fs.promises.writeFile(tmpPatchPath, patchTextFinal, 'utf8');

    const checkRes = await execGitResult(params.runWorkspaceRoot, ['apply', '--check', tmpPatchPath], 20 * 1024 * 1024);
    if (!checkRes.ok) {
      const persistedPatchPath = await movePatchToPersisted(tmpPatchPath, patchesDir, params.generationTaskId, patchTextFinal);
      void vscode.window.showWarningMessage(
        `Devin パッチの自動適用に失敗しました（git apply --check）。手動で適用してください: ${persistedPatchPath}`,
      );
      appendEventToOutput(emitLogEvent(params.generationTaskId, 'warn', `git apply --check failed: ${checkRes.output}`));
      return { applied: false, testPaths, persistedPatchPath, reason: 'apply-failed' };
    }

    const applyRes = await execGitResult(params.runWorkspaceRoot, ['apply', tmpPatchPath], 20 * 1024 * 1024);
    if (!applyRes.ok) {
      const persistedPatchPath = await movePatchToPersisted(tmpPatchPath, patchesDir, params.generationTaskId, patchTextFinal);
      void vscode.window.showWarningMessage(
        `Devin パッチの自動適用に失敗しました（git apply）。手動で適用してください: ${persistedPatchPath}`,
      );
      appendEventToOutput(emitLogEvent(params.generationTaskId, 'warn', `git apply failed: ${applyRes.output}`));
      return { applied: false, testPaths, persistedPatchPath, reason: 'apply-failed' };
    }

    // 成功: 一時パッチを削除（失敗しても致命ではない）
    try {
      await fs.promises.rm(tmpPatchPath, { force: true });
    } catch {
      // noop
    }

    appendEventToOutput(emitLogEvent(params.generationTaskId, 'info', `Devin パッチを適用しました（${testPaths.length}件）`));
    return { applied: true, testPaths, reason: 'applied' };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    appendEventToOutput(emitLogEvent(params.generationTaskId, 'warn', `Devin パッチ適用で例外が発生しました: ${message}`));
    return { applied: false, testPaths: [], reason: 'exception' };
  }
}

async function preparePatchPaths(
  generationTaskId: string,
  extensionContext: vscode.ExtensionContext | undefined,
): Promise<{ tmpPatchPath: string; patchesDir: string }> {
  const baseDir = extensionContext?.globalStorageUri.fsPath ?? path.join(os.tmpdir(), 'dontforgetest');
  const tmpDir = path.join(baseDir, 'tmp');
  const patchesDir = path.join(baseDir, 'patches');
  return {
    tmpPatchPath: path.join(tmpDir, `${generationTaskId}.patch`),
    patchesDir,
  };
}

async function movePatchToPersisted(
  tmpPatchPath: string,
  patchesDir: string,
  generationTaskId: string,
  patchText: string,
): Promise<string> {
  await fs.promises.mkdir(patchesDir, { recursive: true });
  const persisted = path.join(patchesDir, `${generationTaskId}.patch`);
  try {
    await fs.promises.rename(tmpPatchPath, persisted);
    return persisted;
  } catch {
    await fs.promises.writeFile(persisted, patchText, 'utf8');
    try {
      await fs.promises.rm(tmpPatchPath, { force: true });
    } catch {
      // noop
    }
    return persisted;
  }
}

async function persistPatch(
  generationTaskId: string,
  patchText: string,
  extensionContext: vscode.ExtensionContext | undefined,
): Promise<string> {
  const { patchesDir } = await preparePatchPaths(generationTaskId, extensionContext);
  await fs.promises.mkdir(patchesDir, { recursive: true });
  const persisted = path.join(patchesDir, `${generationTaskId}.patch`);
  await fs.promises.writeFile(persisted, patchText, 'utf8');
  return persisted;
}

