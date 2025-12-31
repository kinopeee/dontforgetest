import * as fs from 'fs';
import * as path from 'path';
import { execGitStdout } from './gitExec';

export interface CreateTemporaryWorktreeParams {
  /** 元のリポジトリ（メインworktree）のルート */
  repoRoot: string;
  /** 一時worktreeを作成するベースディレクトリ（例: context.globalStorageUri.fsPath） */
  baseDir: string;
  /** 一意なタスクID（ディレクトリ名に使用） */
  taskId: string;
  /** 既定: HEAD（現在のコミット） */
  ref?: string;
}

export interface TemporaryWorktree {
  worktreeDir: string;
}

export type RemoveTemporaryWorktreeDeps = {
  /** テスト用: git 実行関数を差し替える */
  execGitStdout?: typeof execGitStdout;
  /** テスト用: ディレクトリ削除関数を差し替える */
  rm?: typeof fs.promises.rm;
};

/**
 * 一時worktree（detached）を作成する。
 *
 * - 生成中断/失敗時でもローカル作業ツリーを汚さないため、生成先を隔離する用途。
 * - worktreeの実体は baseDir 配下に作成する（ワークスペース直下は汚さない）。
 */
export async function createTemporaryWorktree(params: CreateTemporaryWorktreeParams): Promise<TemporaryWorktree> {
  const safeTaskId = sanitizeForPathSegment(params.taskId);
  const worktreesRoot = path.join(params.baseDir, 'worktrees');
  const worktreeDir = path.join(worktreesRoot, safeTaskId);

  await fs.promises.mkdir(worktreesRoot, { recursive: true });
  // 既存があれば削除（前回の異常終了等）
  await fs.promises.rm(worktreeDir, { recursive: true, force: true });

  const ref = (params.ref ?? 'HEAD').trim() || 'HEAD';
  await execGitStdout(params.repoRoot, ['worktree', 'add', '--detach', worktreeDir, ref], 10 * 1024 * 1024);

  return { worktreeDir };
}

/**
 * 一時worktreeを削除する。
 *
 * - git 管理情報の削除（worktree remove/prune）と、ディレクトリ実体の削除を試みる
 * - 失敗しても「残留しない」ことを優先し、最後に fs.rm で強制削除を試す
 */
export async function removeTemporaryWorktree(
  repoRoot: string,
  worktreeDir: string,
  deps: RemoveTemporaryWorktreeDeps = {},
): Promise<void> {
  const exec = deps.execGitStdout ?? execGitStdout;
  const rm = deps.rm ?? fs.promises.rm;

  // 1) git 側の管理情報を削除
  try {
    await exec(repoRoot, ['worktree', 'remove', '--force', worktreeDir], 10 * 1024 * 1024);
  } catch {
    // noop（次へ）
  }

  // 2) worktree の参照を掃除（不要な参照が残るのを防ぐ）
  try {
    await exec(repoRoot, ['worktree', 'prune'], 10 * 1024 * 1024);
  } catch {
    // noop
  }

  // 3) 実体ディレクトリの削除（最後の砦）
  try {
    await rm(worktreeDir, { recursive: true, force: true });
  } catch {
    // noop
  }
}

function sanitizeForPathSegment(input: string): string {
  // OS差を吸収するため、ディレクトリ名として安全な文字に寄せる
  const normalized = input.trim().length > 0 ? input.trim() : 'task';
  return normalized.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

