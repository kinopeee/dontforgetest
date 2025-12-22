import { spawn } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { getModelSettings } from './modelSettings';

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
    void vscode.window.showErrorMessage('ワークスペースが開かれていません。フォルダを開いてから再実行してください。');
    return undefined;
  }

  const config = vscode.workspace.getConfiguration('testgen-agent');
  const { defaultModel } = getModelSettings();
  const testStrategyPath = (config.get<string>('testStrategyPath', 'docs/test-strategy.md') ?? '').trim();
  const cursorAgentPath = (config.get<string>('cursorAgentPath') ?? '').trim();
  const cursorAgentCommand = cursorAgentPath.length > 0 ? cursorAgentPath : 'cursor-agent';

  if (testStrategyPath.length === 0) {
    await showConfigError('testgen-agent.testStrategyPath が未設定です。', 'testgen-agent.testStrategyPath');
    return undefined;
  }

  const strategyAbsPath = toAbsolutePath(workspaceRoot, testStrategyPath);
  const strategyExists = await fileExists(strategyAbsPath);
  if (!strategyExists) {
    const picked = await vscode.window.showErrorMessage(
      `テスト戦略ファイルが見つかりません: ${testStrategyPath}`,
      '設定を開く',
      'ファイルを開く',
    );
    if (picked === '設定を開く') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'testgen-agent.testStrategyPath');
    }
    if (picked === 'ファイルを開く') {
      // 既定パスの場合、まずは想定場所を開く（存在しない場合は作成を促す）
      const uri = vscode.Uri.file(strategyAbsPath);
      await vscode.commands.executeCommand('vscode.open', uri);
    }
    return undefined;
  }

  const agentAvailable = await canSpawnCommand(cursorAgentCommand, ['--version'], workspaceRoot);
  if (!agentAvailable) {
    const picked = await vscode.window.showErrorMessage(
      `cursor-agent が見つかりません（PATH未設定、または未インストールの可能性があります）: ${cursorAgentCommand}`,
      '設定を開く',
      'ドキュメントを開く',
    );
    if (picked === '設定を開く') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'testgen-agent.cursorAgentPath');
    }
    if (picked === 'ドキュメントを開く') {
      await vscode.env.openExternal(vscode.Uri.parse('https://cursor.com/ja/docs/cli/overview'));
    }
    return undefined;
  }

  return {
    workspaceRoot,
    defaultModel,
    testStrategyPath,
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

async function showConfigError(message: string, settingKey: string): Promise<void> {
  const picked = await vscode.window.showErrorMessage(message, '設定を開く');
  if (picked === '設定を開く') {
    await vscode.commands.executeCommand('workbench.action.openSettings', settingKey);
  }
}

