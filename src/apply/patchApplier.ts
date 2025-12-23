import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { restoreWorkspaceSnapshot, takeWorkspaceSnapshot, type WorkspaceSnapshot } from '../core/snapshot';
import { previewSnapshotDiff } from './diffPreview';

export interface LastRunState {
  taskId: string;
  label: string;
  workspaceRoot: string;
  startedAtMs: number;
  snapshot: WorkspaceSnapshot;
  /** プレビュー/ロールバック対象のファイル（ワークスペース相対） */
  touchedPaths: Set<string>;
}

let lastRun: LastRunState | undefined;

/**
 * 直近実行の差分/ロールバック用にスナップショットを開始する。
 *
 * - 既存の対象ファイルをスナップショット
 * - 直近実行状態（lastRun）を上書き
 */
export async function startLastRun(taskId: string, label: string, workspaceRoot: string, initialPaths: string[]): Promise<void> {
  const snapshot = await takeWorkspaceSnapshot(workspaceRoot, initialPaths);

  const touchedPaths = new Set<string>();
  for (const p of initialPaths) {
    const rel = normalizeToWorkspaceRelative(workspaceRoot, p);
    if (rel) {
      touchedPaths.add(rel);
      if (!snapshot.files.has(rel)) {
        snapshot.files.set(rel, { relativePath: rel, existed: false });
      }
    }
  }

  lastRun = {
    taskId,
    label,
    workspaceRoot,
    startedAtMs: Date.now(),
    snapshot,
    touchedPaths,
  };
}

/**
 * Providerイベント（fileWrite等）から「触れたファイル」を直近Runへ反映する。
 */
export function recordTouchedPathFromEventPath(workspaceRoot: string, eventPath: string): void {
  if (!lastRun) {
    return;
  }
  if (lastRun.workspaceRoot !== workspaceRoot) {
    // ワークスペースが変わった場合は無視（単純化）
    return;
  }
  const rel = normalizeToWorkspaceRelative(workspaceRoot, eventPath);
  if (!rel) {
    return;
  }
  lastRun.touchedPaths.add(rel);
  if (!lastRun.snapshot.files.has(rel)) {
    // 初回タッチの時点でスナップショットへ追加する。
    // - existed=true: 直近実行開始時点の内容を復元できるよう content を保持
    // - existed=false: 直近実行で新規作成されたとみなし、ロールバック時に削除
    //
    // ※ fileWrite(開始) のタイミングで呼ばれる想定（書き込み前に記録する）
    const abs = path.join(workspaceRoot, rel);
    try {
      const buf = fs.readFileSync(abs);
      lastRun.snapshot.files.set(rel, { relativePath: rel, existed: true, content: buf.toString('utf8') });
    } catch {
      lastRun.snapshot.files.set(rel, { relativePath: rel, existed: false });
    }
  }
}

export async function previewLastRun(): Promise<void> {
  if (!lastRun) {
    void vscode.window.showInformationMessage('直近実行の差分がありません。');
    return;
  }
  await previewSnapshotDiff(lastRun.snapshot, Array.from(lastRun.touchedPaths), `直近実行の差分 (${lastRun.label})`);
}

export async function rollbackLastRun(): Promise<void> {
  if (!lastRun) {
    void vscode.window.showInformationMessage('元に戻す対象の直近実行がありません。');
    return;
  }

  const picked = await vscode.window.showWarningMessage(
    `直近実行（${lastRun.label}）の変更を元に戻します(Undo)。よろしいですか？`,
    { modal: true },
    '元に戻す',
  );
  if (picked !== '元に戻す') {
    return;
  }

  await restoreWorkspaceSnapshot(lastRun.snapshot);
  void vscode.window.showInformationMessage(`変更を元に戻しました: ${lastRun.label}`);
}

function normalizeToWorkspaceRelative(workspaceRoot: string, inputPath: string): string | undefined {
  const trimmed = inputPath.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (!path.isAbsolute(trimmed)) {
    const rel = normalizeRelativePath(trimmed);
    if (rel.startsWith('..')) {
      return undefined;
    }
    return rel;
  }
  const rel = path.relative(workspaceRoot, trimmed);
  if (rel.startsWith('..')) {
    return undefined;
  }
  return normalizeRelativePath(rel);
}

function normalizeRelativePath(rel: string): string {
  return rel.replace(/^\.([/\\])/, '').trim();
}

