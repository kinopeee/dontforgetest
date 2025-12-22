import { createHash } from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';

export interface FileSnapshot {
  /** ワークスペース相対パス（正規化済み） */
  relativePath: string;
  /** スナップショット取得時点で存在したか */
  existed: boolean;
  /** existed=false の場合は undefined */
  content?: string;
  /** existed=true の場合の内容ハッシュ（sha256） */
  sha256?: string;
}

export interface WorkspaceSnapshot {
  workspaceRoot: string;
  createdAtMs: number;
  files: Map<string, FileSnapshot>;
}

/**
 * 指定ファイル群のスナップショット（内容 + sha256）を取得する。
 *
 * - 入力はワークスペース相対/絶対どちらでも可（ルート外は無視）
 * - ファイルが存在しない場合も記録する（rollbackで削除できる）
 */
export async function takeWorkspaceSnapshot(workspaceRoot: string, targetPaths: string[]): Promise<WorkspaceSnapshot> {
  const files = new Map<string, FileSnapshot>();

  for (const raw of targetPaths) {
    const rel = normalizeToWorkspaceRelative(workspaceRoot, raw);
    if (!rel) {
      continue;
    }
    if (files.has(rel)) {
      continue;
    }

    const absolutePath = path.join(workspaceRoot, rel);
    const uri = vscode.Uri.file(absolutePath);

    try {
      const data = await vscode.workspace.fs.readFile(uri);
      const buf = Buffer.from(data);
      files.set(rel, {
        relativePath: rel,
        existed: true,
        content: buf.toString('utf8'),
        sha256: sha256Hex(buf),
      });
    } catch (err) {
      // ファイル不存在等は「存在しない」として扱う
      files.set(rel, { relativePath: rel, existed: false });
    }
  }

  return {
    workspaceRoot,
    createdAtMs: Date.now(),
    files,
  };
}

/**
 * スナップショットへロールバックする。
 *
 * - existed=true: スナップショット内容で上書き
 * - existed=false: 現在存在するなら削除
 */
export async function restoreWorkspaceSnapshot(snapshot: WorkspaceSnapshot): Promise<void> {
  for (const entry of snapshot.files.values()) {
    const abs = path.join(snapshot.workspaceRoot, entry.relativePath);
    const uri = vscode.Uri.file(abs);

    if (!entry.existed) {
      try {
        await vscode.workspace.fs.delete(uri, { recursive: false, useTrash: false });
      } catch {
        // 既に無い場合などは無視
      }
      continue;
    }

    const parent = path.dirname(abs);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(parent));
    const content = entry.content ?? '';
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  }
}

export function snapshotToRelativePaths(snapshot: WorkspaceSnapshot): string[] {
  return Array.from(snapshot.files.keys());
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function normalizeToWorkspaceRelative(workspaceRoot: string, inputPath: string): string | undefined {
  const trimmed = inputPath.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  // 既に相対っぽい場合
  if (!path.isAbsolute(trimmed)) {
    const rel = normalizeRelativePath(trimmed);
    if (rel.startsWith('..')) {
      return undefined;
    }
    return rel;
  }

  const relative = path.relative(workspaceRoot, trimmed);
  if (relative.startsWith('..')) {
    return undefined;
  }
  return normalizeRelativePath(relative);
}

function normalizeRelativePath(rel: string): string {
  // Windows互換を意識して区切りを揃える（内部表現は posix ではなく、path.join 用に OS 依存のまま保持）
  // - ただし VS Code/Git 表示に合わせ、末尾/先頭の ./ は落とす
  const normalized = rel.replace(/^\.([/\\])/, '').trim();
  return normalized;
}

