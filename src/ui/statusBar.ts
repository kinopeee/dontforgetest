import * as vscode from 'vscode';
import { type TestGenEvent } from '../core/event';

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

  statusBar.text = `$(beaker) $(loading~spin) Dontforgetest: ${count} 実行中`;
  statusBar.tooltip = buildTooltip();
  statusBar.show();
}

function buildTooltip(): string {
  const lines: string[] = [];
  lines.push('Dontforgetest');
  lines.push('');
  lines.push(`実行中: ${running.size}`);
  for (const [taskId, info] of running.entries()) {
    lines.push(`- ${taskId}: ${info.label}${info.detail ? ` (${info.detail})` : ''}`);
  }
  lines.push('');
  lines.push('クリックで出力ログを表示');
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

