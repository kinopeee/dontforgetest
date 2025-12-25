import { spawn } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { getModelSettings } from './modelSettings';
import { t } from './l10n';

export interface PreflightOk {
  workspaceRoot: string;
  defaultModel?: string;
  testStrategyPath: string;
  cursorAgentCommand: string;
}

/**
 * 実行前に「最低限つまずきやすいポイント」を検査し、必要ならユーザーに案内する。
 *
 * MVPでは次を対象とする:
 * - ワークスペースが開かれていること
 * - docs/test-strategy.md（または設定したパス）が読めること
 * - cursor-agent コマンドが実行可能であること
 */
export async function ensurePreflight(): Promise<PreflightOk | undefined> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    void vscode.window.showErrorMessage(t('workspace.notOpen'));
    return undefined;
  }

  const config = vscode.workspace.getConfiguration('dontforgetest');
  const { defaultModel } = getModelSettings();
  const testStrategyPath = (config.get<string>('testStrategyPath', '') ?? '').trim();
  const cursorAgentPath = (config.get<string>('cursorAgentPath') ?? '').trim();
  const cursorAgentCommand = cursorAgentPath.length > 0 ? cursorAgentPath : 'cursor-agent';

  // testStrategyPath が空、またはファイルが存在しない場合は内蔵デフォルトを使用
  // → エラーにせず、そのまま続行（promptBuilder側でフォールバック）
  let effectiveTestStrategyPath = testStrategyPath;

  if (testStrategyPath.length > 0) {
    const strategyAbsPath = toAbsolutePath(workspaceRoot, testStrategyPath);
    const strategyExists = await fileExists(strategyAbsPath);
    if (!strategyExists) {
      // 警告を出すが、処理は続行（内蔵デフォルトにフォールバック）
      void vscode.window.showWarningMessage(t('testStrategy.fileNotFound', testStrategyPath));
      effectiveTestStrategyPath = ''; // 空にして内蔵デフォルト使用を示す
    }
  }

  const agentAvailable = await canSpawnCommand(cursorAgentCommand, ['--version'], workspaceRoot);
  if (!agentAvailable) {
    const picked = await vscode.window.showErrorMessage(
      t('cursorAgent.notFound', cursorAgentCommand),
      t('cursorAgent.openSettings'),
      t('cursorAgent.openDocs'),
    );
    if (picked === t('cursorAgent.openSettings')) {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'dontforgetest.cursorAgentPath');
    }
    if (picked === t('cursorAgent.openDocs')) {
      await vscode.env.openExternal(vscode.Uri.parse('https://cursor.com/ja/docs/cli/overview'));
    }
    return undefined;
  }

  return {
    workspaceRoot,
    defaultModel,
    testStrategyPath: effectiveTestStrategyPath,
    cursorAgentCommand,
  };
}

function toAbsolutePath(workspaceRoot: string, maybeRelativePath: string): string {
  return path.isAbsolute(maybeRelativePath) ? maybeRelativePath : path.join(workspaceRoot, maybeRelativePath);
}

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath));
    return true;
  } catch {
    return false;
  }
}

async function canSpawnCommand(command: string, args: string[], cwd: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: 'ignore',
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      // ENOENT は「コマンドが見つからない」
      if (err.code === 'ENOENT') {
        resolve(false);
        return;
      }
      resolve(false);
    });

    child.on('close', () => {
      resolve(true);
    });
  });
}
