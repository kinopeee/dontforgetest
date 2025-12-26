import * as vscode from 'vscode';
import { type ArtifactSettings } from '../core/artifacts';
import { type AgentProvider } from '../providers/provider';
import { TestGenerationSession } from './runWithArtifacts/testGenerationSession';
import { createTemporaryWorktree, removeTemporaryWorktree } from '../git/worktreeManager';

export interface WorktreeOps {
  createTemporaryWorktree: typeof createTemporaryWorktree;
  removeTemporaryWorktree: typeof removeTemporaryWorktree;
}

export interface RunWithArtifactsOptions {
  provider: AgentProvider;
  workspaceRoot: string;
  cursorAgentCommand: string;
  testStrategyPath: string;
  /** UI表示用 */
  generationLabel: string;
  /** 観点表/生成の対象ファイル（ワークスペース相対推奨） */
  targetPaths: string[];
  /** 生成用プロンプト（buildTestGenPrompt 結果など） */
  generationPrompt: string;
  /** 観点表生成の参考テキスト（差分など。任意） */
  perspectiveReferenceText?: string;
  /** モデル上書き（undefined=設定に従う） */
  model: string | undefined;
  /** 生成タスクID（lastRun と紐づく） */
  generationTaskId: string;
  /**
   * 実行先。
   * - local: 現在のワークスペースを直接編集
   * - worktree: 一時worktreeで生成し、テスト差分だけをローカルへ適用（MVP）
   */
  runLocation?: 'local' | 'worktree';
  /** worktree実行時に必要（globalStorage を使用する） */
  extensionContext?: vscode.ExtensionContext;
  /** テスト用: 設定の上書き */
  settingsOverride?: Partial<ArtifactSettings>;
  /** テスト用: Worktree操作のDI */
  worktreeOps?: WorktreeOps;
}

/**
 * 生成フローに「観点表保存」「テスト実行レポート保存」を差し込んで実行する。
 */
export async function runWithArtifacts(options: RunWithArtifactsOptions): Promise<void> {
  const session = new TestGenerationSession(options);
  await session.run();
}
