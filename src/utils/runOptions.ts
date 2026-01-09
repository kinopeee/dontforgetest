import * as vscode from 'vscode';
import { t } from '../core/l10n';
import { type TestGenerationRunMode } from '../commands/runWithArtifacts';

export type RunLocation = 'local' | 'worktree';

export interface ResolveRunOptionsInput {
  runMode?: TestGenerationRunMode;
  runLocation?: RunLocation;
  extensionContext?: vscode.ExtensionContext;
}

export interface ResolvedRunOptions {
  runMode: TestGenerationRunMode;
  effectiveRunLocation: RunLocation;
}

/**
 * runMode と runLocation を正規化し、有効な実行オプションを解決する。
 *
 * - runMode: 'perspectiveOnly' の場合のみ 'perspectiveOnly'、それ以外は 'full'
 * - runLocation: 'perspectiveOnly' モードでは強制的に 'local'、それ以外は指定値または 'local'
 * - worktree モードで extensionContext が未指定の場合はエラーメッセージを表示し undefined を返す
 *
 * @param options 入力オプション
 * @returns 解決されたオプション、またはエラー時は undefined
 */
export function resolveRunOptions(options: ResolveRunOptionsInput): ResolvedRunOptions | undefined {
  const runMode: TestGenerationRunMode = options.runMode === 'perspectiveOnly' ? 'perspectiveOnly' : 'full';
  const requestedRunLocation: RunLocation = options.runLocation === 'worktree' ? 'worktree' : 'local';
  const effectiveRunLocation: RunLocation = runMode === 'perspectiveOnly' ? 'local' : requestedRunLocation;

  if (effectiveRunLocation === 'worktree' && !options.extensionContext) {
    vscode.window.showErrorMessage(t('worktree.extensionContextRequired'));
    return undefined;
  }

  return { runMode, effectiveRunLocation };
}
