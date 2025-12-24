import * as vscode from 'vscode';
import { type TestGenEvent, type TestGenPhase, nowMs } from '../core/event';

/**
 * 進行中タスクの状態
 */
interface RunningTask {
  taskId: string;
  label: string;
  detail?: string;
  startedAt: number;
  currentPhase: TestGenPhase;
  phaseLabel: string;
  /** 各フェーズの完了状態 */
  phaseHistory: Map<TestGenPhase, 'done' | 'running' | 'pending'>;
}

/**
 * 進捗表示用 TreeView の各アイテム
 */
class ProgressTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: 'task' | 'phase',
    public readonly taskId?: string,
    public readonly phase?: TestGenPhase,
  ) {
    super(label, collapsibleState);
  }
}

/**
 * サイドバーに進捗状況をツリー形式で表示する TreeDataProvider。
 *
 * CodeRabbit のような視認性の高い進捗表示を実現:
 * - タスク単位でグルーピング
 * - 各フェーズの状態（完了/進行中/待機中）をアイコンで表示
 * - 進行中フェーズには三点アニメーション
 */
export class ProgressTreeViewProvider implements vscode.TreeDataProvider<ProgressTreeItem> {
  public static readonly viewId = 'dontforgetest.progressView';

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ProgressTreeItem | undefined | void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly tasks = new Map<string, RunningTask>();
  private animationFrame = 0;
  private animationTimer: ReturnType<typeof setInterval> | undefined;

  /**
   * アニメーションを開始
   */
  public startAnimation(): void {
    if (this.animationTimer) {
      return;
    }
    this.animationTimer = setInterval(() => {
      this.animationFrame = (this.animationFrame + 1) % 4;
      // 進行中タスクがある場合のみ更新
      if (this.tasks.size > 0) {
        this._onDidChangeTreeData.fire();
      }
    }, 400);
  }

  /**
   * アニメーションを停止
   */
  public stopAnimation(): void {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = undefined;
    }
  }

  /**
   * リソースを解放
   */
  public dispose(): void {
    this.stopAnimation();
    this._onDidChangeTreeData.dispose();
  }

  /**
   * イベントを受け取って状態を更新
   */
  public handleEvent(event: TestGenEvent): void {
    switch (event.type) {
      case 'started': {
        const task: RunningTask = {
          taskId: event.taskId,
          label: event.label,
          detail: event.detail,
          startedAt: event.timestampMs,
          currentPhase: 'preparing',
          phaseLabel: '準備中',
          phaseHistory: new Map([
            ['preparing', 'running'],
            ['perspectives', 'pending'],
            ['generating', 'pending'],
            ['running-tests', 'pending'],
            ['done', 'pending'],
          ]),
        };
        this.tasks.set(event.taskId, task);
        this.startAnimation();
        this._onDidChangeTreeData.fire();
        break;
      }

      case 'phase': {
        const task = this.tasks.get(event.taskId);
        if (task) {
          // 前のフェーズを完了にする
          task.phaseHistory.set(task.currentPhase, 'done');
          // 新しいフェーズを進行中にする
          task.currentPhase = event.phase;
          task.phaseLabel = event.phaseLabel;
          task.phaseHistory.set(event.phase, 'running');
          this._onDidChangeTreeData.fire();
        }
        break;
      }

      case 'completed': {
        const task = this.tasks.get(event.taskId);
        if (task) {
          // 全フェーズを完了にする
          task.phaseHistory.set(task.currentPhase, 'done');
          task.phaseHistory.set('done', 'done');
          task.currentPhase = 'done';
          task.phaseLabel = '完了';
          this._onDidChangeTreeData.fire();

          // 少し待ってからタスクを削除
          setTimeout(() => {
            this.tasks.delete(event.taskId);
            if (this.tasks.size === 0) {
              this.stopAnimation();
            }
            this._onDidChangeTreeData.fire();
          }, 3000);
        }
        break;
      }
    }
  }

  public getTreeItem(element: ProgressTreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: ProgressTreeItem): ProgressTreeItem[] {
    if (!element) {
      // ルートレベル: タスク一覧
      return this.getTaskItems();
    }

    if (element.itemType === 'task' && element.taskId) {
      // タスク配下: フェーズ一覧
      return this.getPhaseItems(element.taskId);
    }

    return [];
  }

  private getTaskItems(): ProgressTreeItem[] {
    const items: ProgressTreeItem[] = [];

    for (const task of this.tasks.values()) {
      const item = new ProgressTreeItem(
        task.label,
        vscode.TreeItemCollapsibleState.Expanded,
        'task',
        task.taskId,
      );
      item.description = task.detail;
      item.iconPath = new vscode.ThemeIcon('beaker');
      items.push(item);
    }

    if (items.length === 0) {
      const emptyItem = new ProgressTreeItem(
        'タスクなし',
        vscode.TreeItemCollapsibleState.None,
        'task',
      );
      emptyItem.description = 'テスト生成を実行してください';
      emptyItem.iconPath = new vscode.ThemeIcon('info');
      items.push(emptyItem);
    }

    return items;
  }

  private getPhaseItems(taskId: string): ProgressTreeItem[] {
    const task = this.tasks.get(taskId);
    if (!task) {
      return [];
    }

    const phases: Array<{ phase: TestGenPhase; label: string }> = [
      { phase: 'preparing', label: '準備' },
      { phase: 'perspectives', label: '観点表生成' },
      { phase: 'generating', label: 'テストコード生成' },
      { phase: 'running-tests', label: 'テスト実行' },
      { phase: 'done', label: '完了' },
    ];

    return phases.map(({ phase, label }) => {
      const status = task.phaseHistory.get(phase) ?? 'pending';
      const item = new ProgressTreeItem(
        this.formatPhaseLabel(label, status),
        vscode.TreeItemCollapsibleState.None,
        'phase',
        taskId,
        phase,
      );

      // アイコンと色の設定
      switch (status) {
        case 'done':
          item.iconPath = new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'));
          break;
        case 'running':
          item.iconPath = new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.yellow'));
          break;
        case 'pending':
          item.iconPath = new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('descriptionForeground'));
          break;
      }

      return item;
    });
  }

  /**
   * フェーズラベルのフォーマット
   * 進行中の場合は三点アニメーションを付与
   */
  private formatPhaseLabel(label: string, status: 'done' | 'running' | 'pending'): string {
    if (status !== 'running') {
      return label;
    }

    // 三点アニメーション: . → .. → ... → (空) → ...
    const dots = '.'.repeat(this.animationFrame);
    return `${label} ${dots}`.trimEnd();
  }
}

let provider: ProgressTreeViewProvider | undefined;

/**
 * 進捗 TreeView を初期化
 */
export function initializeProgressTreeView(context: vscode.ExtensionContext): ProgressTreeViewProvider {
  if (provider) {
    return provider;
  }

  provider = new ProgressTreeViewProvider();
  const treeView = vscode.window.createTreeView(ProgressTreeViewProvider.viewId, {
    treeDataProvider: provider,
    showCollapseAll: false,
  });

  context.subscriptions.push(treeView);
  context.subscriptions.push({ dispose: () => provider?.dispose() });

  return provider;
}

/**
 * イベントを受け取って進捗 TreeView を更新
 */
export function handleTestGenEventForProgressView(event: TestGenEvent): void {
  provider?.handleEvent(event);
}

/**
 * フェーズイベントを生成するヘルパー
 */
export function emitPhaseEvent(taskId: string, phase: TestGenPhase, phaseLabel: string): TestGenEvent {
  return {
    type: 'phase',
    taskId,
    phase,
    phaseLabel,
    timestampMs: nowMs(),
  };
}
