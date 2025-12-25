import * as vscode from 'vscode';
import { type TestGenEvent } from '../core/event';
import { t } from '../core/l10n';

let statusBar: vscode.StatusBarItem | undefined;
const running = new Map<string, { label: string; detail?: string }>();

/**
 * ステータスバーに「実行中タスク数」を表示する。
 * - クリックで Output Channel を開く（showTestGeneratorOutput）
 */
export function initializeTestGenStatusBar(context: vscode.ExtensionContext): void {
  if (statusBar) {
    return;
  }
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'dontforgetest.showTestGeneratorOutput';
  context.subscriptions.push(statusBar);
  update();
}

export function handleTestGenEventForStatusBar(event: TestGenEvent): void {
  if (!statusBar) {
    return;
  }

  if (event.type === 'started') {
    running.set(event.taskId, { label: event.label, detail: event.detail });
    update();
    return;
  }
  if (event.type === 'completed') {
    running.delete(event.taskId);
    update();
    return;
  }
}

function update(): void {
  if (!statusBar) {
    return;
  }
  const count = running.size;
  if (count === 0) {
    statusBar.hide();
    return;
  }

  statusBar.text = `$(beaker) $(loading~spin) ${t('statusBar.running', count)}`;
  statusBar.tooltip = buildTooltip();
  statusBar.show();
}

function buildTooltip(): string {
  const lines: string[] = [];
  // t('statusBar.tooltip') には改行が含まれるが、各タスクの詳細を追加するため分解する
  const baseTooltip = t('statusBar.tooltip', running.size);
  const parts = baseTooltip.split('\n');
  // 先頭3行（タイトル、空行、実行中: N）を追加
  lines.push(...parts.slice(0, 3));
  for (const [taskId, info] of running.entries()) {
    lines.push(`- ${taskId}: ${info.label}${info.detail ? ` (${info.detail})` : ''}`);
  }
  // 残りの行（空行、クリックで...）を追加
  lines.push(...parts.slice(3));
  return lines.join('\n');
}

/**
 * テスト用：モジュール状態をリセットする
 * @internal
 */
export function _resetForTesting(): void {
  statusBar = undefined;
  running.clear();
}
