import * as vscode from 'vscode';
import { t } from '../core/l10n';

/**
 * 出力ビューのアイテム
 */
class OutputTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly commandId: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.command = {
      command: commandId,
      title: label,
    };
  }
}

/**
 * 出力リンク（観点表・実行レポート）を表示する TreeDataProvider
 */
export class OutputTreeViewProvider implements vscode.TreeDataProvider<OutputTreeItem> {
  public static readonly viewId = 'dontforgetest.outputView';

  getTreeItem(element: OutputTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): OutputTreeItem[] {
    return [
      (() => {
        const item = new OutputTreeItem(t('outputTreeView.perspective'), 'dontforgetest.openLatestPerspective');
        item.iconPath = new vscode.ThemeIcon('file-text');
        return item;
      })(),
      (() => {
        const item = new OutputTreeItem(t('outputTreeView.executionReport'), 'dontforgetest.openLatestExecutionReport');
        item.iconPath = new vscode.ThemeIcon('report');
        return item;
      })(),
      (() => {
        const item = new OutputTreeItem(t('outputTreeView.mergeInstruction'), 'dontforgetest.openLatestMergeInstruction');
        item.iconPath = new vscode.ThemeIcon('git-merge');
        return item;
      })(),
    ];
  }
}

/**
 * 出力 TreeView を初期化
 */
export function initializeOutputTreeView(context: vscode.ExtensionContext): void {
  const provider = new OutputTreeViewProvider();
  const treeView = vscode.window.createTreeView(OutputTreeViewProvider.viewId, {
    treeDataProvider: provider,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);
}
