import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';

/**
 * テスト環境のセットアップ情報
 */
export interface TestEnvironment {
  workspaceRoot: string;
  tempDirs: string[];
  tempFiles: string[];
  originalConfig: Record<string, unknown>;
}

/**
 * テスト環境をセットアップする
 *
 * 並列テスト実行時の競合を避けるため、randomUUID を使用してユニークなディレクトリ名を生成する。
 */
export async function setupTestEnvironment(): Promise<TestEnvironment> {
  // Date.now() のみでは並列実行時に衝突する可能性があるため randomUUID を追加
  const workspaceRoot = path.join(process.cwd(), 'tmp', `test-env-${Date.now()}-${randomUUID()}`);
  const tempDirs: string[] = [];
  const tempFiles: string[] = [];
  
  // ワークスペース用の一時ディレクトリを作成
  await fs.mkdir(workspaceRoot, { recursive: true });
  tempDirs.push(workspaceRoot);

  // 設定を保存
  const config = vscode.workspace.getConfiguration('dontforgetest');
  const originalConfig: Record<string, unknown> = {};
  
  const configKeys = [
    'analysisReportDir',
    'analysisTestFilePattern',
    'perspectiveGenerationTimeoutMs',
    'testExecutionMode',
    'testExecutionRunner',
    'testExecutionLocation',
    'testCommand',
    'logLevel',
  ];

  for (const key of configKeys) {
    try {
      originalConfig[key] = config.get(key);
    } catch {
      // 設定が存在しない場合は無視
    }
  }

  return {
    workspaceRoot,
    tempDirs,
    tempFiles,
    originalConfig,
  };
}

/**
 * 一時ディレクトリを作成
 */
export async function createTempDir(env: TestEnvironment, name: string): Promise<string> {
  const dirPath = path.join(env.workspaceRoot, name);
  await fs.mkdir(dirPath, { recursive: true });
  env.tempDirs.push(dirPath);
  return dirPath;
}

/**
 * 一時ファイルを作成
 */
export async function createTempFile(
  env: TestEnvironment,
  relativePath: string,
  content: string
): Promise<string> {
  const filePath = path.join(env.workspaceRoot, relativePath);
  const dirPath = path.dirname(filePath);
  
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
  
  env.tempFiles.push(filePath);
  return filePath;
}

/**
 * VS Codeの設定をモックに更新
 */
export async function updateTestConfig(
  env: TestEnvironment,
  updates: Record<string, unknown>
): Promise<void> {
  const config = vscode.workspace.getConfiguration('dontforgetest');
  
  for (const [key, value] of Object.entries(updates)) {
    try {
      await config.update(key, value, vscode.ConfigurationTarget.Workspace);
    } catch (error) {
      console.error(`Failed to update config ${key}:`, error);
    }
  }
}

/**
 * テスト環境をクリーンアップ
 */
export async function cleanupTestEnvironment(env: TestEnvironment): Promise<void> {
  // 設定を元に戻す
  const config = vscode.workspace.getConfiguration('dontforgetest');
  
  for (const [key, value] of Object.entries(env.originalConfig)) {
    try {
      await config.update(key, value, vscode.ConfigurationTarget.Workspace);
    } catch (error) {
      console.error(`Failed to restore config ${key}:`, error);
    }
  }

  // 一時ファイルを削除
  for (const filePath of env.tempFiles) {
    try {
      await fs.unlink(filePath);
    } catch {
      // 削除に失敗しても無視
    }
  }

  // 一時ディレクトリを削除（逆順で）
  // fs.rmdir は非推奨のため fs.rm を使用
  for (const dirPath of env.tempDirs.reverse()) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
    } catch {
      // 削除に失敗しても無視
    }
  }
}

/**
 * テスト用のスタブファイルを作成するヘルパー
 */
export async function createTestFiles(
  env: TestEnvironment,
  files: Record<string, string>
): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    await createTempFile(env, relativePath, content);
  }
}
