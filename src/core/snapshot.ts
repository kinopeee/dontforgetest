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

  const uniqueRelPaths: string[] = [];
  const seen = new Set<string>();
  for (const raw of targetPaths) {
    const rel = normalizeToWorkspaceRelative(workspaceRoot, raw);
    if (!rel) {
      continue;
    }
    if (seen.has(rel)) {
      continue;
    }
    seen.add(rel);
    uniqueRelPaths.push(rel);
  }

  const maxParallel = getMaxParallelTasks();
  const results = await mapWithConcurrency(uniqueRelPaths, maxParallel, async (rel) => {
    const absolutePath = path.join(workspaceRoot, rel);
    const uri = vscode.Uri.file(absolutePath);

    try {
      const data = await vscode.workspace.fs.readFile(uri);
      const buf = Buffer.from(data);
      const snapshot: FileSnapshot = {
        relativePath: rel,
        existed: true,
        content: buf.toString('utf8'),
        sha256: sha256Hex(buf),
      };
      return snapshot;
    } catch {
      // ファイル不存在等は「存在しない」として扱う
      const snapshot: FileSnapshot = { relativePath: rel, existed: false };
      return snapshot;
    }
  });

  for (const entry of results) {
    files.set(entry.relativePath, entry);
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
  const entries = Array.from(snapshot.files.values());
  const maxParallel = getMaxParallelTasks();

  await mapWithConcurrency(entries, maxParallel, async (entry) => {
    const abs = path.join(snapshot.workspaceRoot, entry.relativePath);
    const uri = vscode.Uri.file(abs);

    if (!entry.existed) {
      try {
        await vscode.workspace.fs.delete(uri, { recursive: false, useTrash: false });
      } catch {
        // 既に無い場合などは無視
      }
      return;
    }

    const parent = path.dirname(abs);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(parent));
    const content = entry.content ?? '';
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  });
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

function getMaxParallelTasks(): number {
  const config = vscode.workspace.getConfiguration('testgen-agent');
  const raw = config.get<number>('maxParallelTasks');
  const parsed = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 4;
  // 極端に大きい値はファイルI/Oを圧迫しやすいので上限を設ける
  const clamped = Math.max(1, Math.min(32, parsed));
  return clamped;
}

/**
 * 配列を「最大並列数」を守りながら処理する。
 * - 戻り値の順序は入力順を維持
 */
async function mapWithConcurrency<T, R>(items: readonly T[], maxParallel: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }
  const parallel = Math.max(1, Math.floor(maxParallel));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const runOne = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index] as T);
    }
  };

  const runners: Promise<void>[] = [];
  const runnerCount = Math.min(parallel, items.length);
  for (let i = 0; i < runnerCount; i += 1) {
    runners.push(runOne());
  }
  await Promise.all(runners);
  return results;
}
