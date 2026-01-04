import { spawn } from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { getModelSettings, getEffectiveDefaultModel } from './modelSettings';
import { t } from './l10n';
import { getAgentProviderId, type AgentProviderId } from '../providers/configuredProvider';

export interface PreflightOk {
  workspaceRoot: string;
  defaultModel?: string;
  testStrategyPath: string;
  /** 現在選択されている Provider の ID */
  agentProviderId: AgentProviderId;
  /** 実行するエージェントコマンド（cursor-agent または claude） */
  agentCommand: string;
  /**
   * @deprecated Use `agentCommand` instead. Kept for backward compatibility.
   */
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
  const testStrategyPath = (config.get<string>('testStrategyPath', '') ?? '').trim();

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

  // Provider 選択に応じたコマンド確認
  const agentProviderId = getAgentProviderId();

  if (agentProviderId === 'claudeCode') {
    // Claude Code CLI の確認
    const claudePath = (config.get<string>('claudePath') ?? '').trim();
    const claudeCommand = claudePath.length > 0 ? claudePath : 'claude';

    const agentAvailable = await canSpawnCommand(claudeCommand, ['--version'], workspaceRoot);
    if (!agentAvailable) {
      if (process.env.VSCODE_TEST_RUNNER === '1') {
        void vscode.window.showErrorMessage(t('claudeCode.notFound', claudeCommand));
        return undefined;
      }

      const openSettingsLabel = t('claudeCode.openSettings');
      const openDocsLabel = t('claudeCode.openDocs');
      const picked = await vscode.window.showErrorMessage(
        t('claudeCode.notFound', claudeCommand),
        openSettingsLabel,
        openDocsLabel,
      );
      if (picked === openSettingsLabel) {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'dontforgetest.claudePath');
      }
      if (picked === openDocsLabel) {
        await vscode.env.openExternal(vscode.Uri.parse('https://docs.claude.com/en/docs/claude-code/headless'));
      }
      return undefined;
    }

    return {
      workspaceRoot,
      defaultModel: getEffectiveDefaultModel(agentProviderId, getModelSettings()),
      testStrategyPath: effectiveTestStrategyPath,
      agentProviderId,
      agentCommand: claudeCommand,
      cursorAgentCommand: claudeCommand, // 後方互換
    };
  }

  // Cursor Agent CLI の確認（デフォルト）
  const cursorAgentPath = (config.get<string>('cursorAgentPath') ?? '').trim();
  const cursorAgentCommand = cursorAgentPath.length > 0 ? cursorAgentPath : 'cursor-agent';

  const agentAvailable = await canSpawnCommand(cursorAgentCommand, ['--version'], workspaceRoot);
  if (!agentAvailable) {
    // VS Code 拡張機能テスト（@vscode/test-electron）では showErrorMessage が解決されず、
    // await するとテストがタイムアウトすることがある。
    // テスト環境ではブロッキングせずに案内だけ出して終了する。
    if (process.env.VSCODE_TEST_RUNNER === '1') {
      void vscode.window.showErrorMessage(t('cursorAgent.notFound', cursorAgentCommand));
      return undefined;
    }

    const openSettingsLabel = t('cursorAgent.openSettings');
    const openDocsLabel = t('cursorAgent.openDocs');
    const picked = await vscode.window.showErrorMessage(
      t('cursorAgent.notFound', cursorAgentCommand),
      openSettingsLabel,
      openDocsLabel,
    );
    if (picked === openSettingsLabel) {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'dontforgetest.cursorAgentPath');
    }
    if (picked === openDocsLabel) {
      await vscode.env.openExternal(vscode.Uri.parse('https://cursor.com/docs/cli/overview'));
    }
    return undefined;
  }

  return {
    workspaceRoot,
    defaultModel: getEffectiveDefaultModel(agentProviderId, getModelSettings()),
    testStrategyPath: effectiveTestStrategyPath,
    agentProviderId,
    agentCommand: cursorAgentCommand,
    cursorAgentCommand, // 後方互換
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

/**
 * コマンドの存在確認を spawn で試みる。
 * VS Code から起動した場合はシェルの PATH が継承されないことがあるため、
 * claude がインストールされやすい場所を PATH に追加。
 */
async function canSpawnCommand(command: string, args: string[], cwd: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    // PATH を拡張
    const env: NodeJS.ProcessEnv = { ...process.env };
    const homeDir = process.env.HOME ?? '';
    const additionalPaths = [
      '/opt/homebrew/bin',
      `${homeDir}/.local/bin`,
      '/usr/local/bin',
      `${homeDir}/.claude/local`,
    ];
    const currentPath = env.PATH ?? '';
    const pathSeparator = process.platform === 'win32' ? ';' : ':';
    env.PATH = [...additionalPaths, currentPath].filter(Boolean).join(pathSeparator);

    const child = spawn(command, args, {
      cwd,
      env,
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
