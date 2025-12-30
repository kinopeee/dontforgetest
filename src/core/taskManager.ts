import { type RunningTask } from '../providers/provider';
import { type TestGenPhase } from './event';

/**
 * 実行中タスクの情報。
 */
export interface ManagedTask {
  taskId: string;
  label: string;
  runningTask: RunningTask;
  startedAt: number;
  /** キャンセルされたかどうか */
  cancelled: boolean;
  /** 現在のフェーズ */
  currentPhase?: TestGenPhase;
  /** 現在のフェーズラベル（ボタン表示用） */
  phaseLabel?: string;
}

type TaskStateListener = (isRunning: boolean, taskCount: number, phaseLabel?: string) => void;

/**
 * 実行中タスクを一元管理するマネージャー。
 * - タスクの登録・解除
 * - キャンセル機能
 * - 状態変更の通知
 */
class TaskManager {
  private readonly tasks = new Map<string, ManagedTask>();
  private readonly listeners = new Set<TaskStateListener>();

  /**
   * タスクを登録する。
   */
  public register(taskId: string, label: string, runningTask: RunningTask): void {
    this.tasks.set(taskId, {
      taskId,
      label,
      runningTask,
      startedAt: Date.now(),
      cancelled: false,
    });
    this.notifyListeners();
  }

  /**
   * タスクを解除する（完了時に呼ぶ）。
   */
  public unregister(taskId: string): void {
    this.tasks.delete(taskId);
    this.notifyListeners();
  }

  /**
   * タスクをキャンセルする。
   * dispose()を呼び出してから登録を解除する。
   */
  public cancel(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }
    // キャンセルフラグを立ててからdisposeを呼ぶ
    task.cancelled = true;
    try {
      task.runningTask.dispose();
    } catch {
      // dispose失敗は無視
    }
    this.tasks.delete(taskId);
    this.notifyListeners();
    return true;
  }

  /**
   * 指定したタスクがキャンセルされたかどうかを確認する。
   * タスクが存在しない場合もtrueを返す（既にキャンセル済みで削除された可能性）。
   */
  public isCancelled(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      // タスクが存在しない = 既にキャンセル/完了済み
      return true;
    }
    return task.cancelled;
  }

  /**
   * 指定したタスクのRunningTaskを更新する。
   * 各フェーズで新しいRunningTaskに切り替えるために使用。
   */
  public updateRunningTask(taskId: string, runningTask: RunningTask): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.runningTask = runningTask;
    }
  }

  /**
   * 指定したタスクのフェーズを更新する。
   * UIにフェーズ変更を通知するために使用。
   */
  public updatePhase(taskId: string, phase: TestGenPhase, phaseLabel: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.currentPhase = phase;
      task.phaseLabel = phaseLabel;
      this.notifyListeners();
    }
  }

  /**
   * 現在アクティブなフェーズラベルを取得する。
   * 複数タスク実行中の場合は最初のタスクのラベルを返す。
   */
  public getCurrentPhaseLabel(): string | undefined {
    for (const task of this.tasks.values()) {
      if (task.phaseLabel) {
        return task.phaseLabel;
      }
    }
    return undefined;
  }

  /**
   * 実行中のすべてのタスクをキャンセルする。
   */
  public cancelAll(): number {
    let count = 0;
    for (const [taskId] of this.tasks) {
      if (this.cancel(taskId)) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * 実行中タスク数を取得する。
   */
  public getRunningCount(): number {
    return this.tasks.size;
  }

  /**
   * 実行中かどうかを取得する。
   */
  public isRunning(): boolean {
    return this.tasks.size > 0;
  }

  /**
   * 実行中タスクのIDリストを取得する。
   */
  public getRunningTaskIds(): string[] {
    return Array.from(this.tasks.keys());
  }

  /**
   * 状態変更リスナーを登録する。
   */
  public addListener(listener: TaskStateListener): void {
    this.listeners.add(listener);
  }

  /**
   * 状態変更リスナーを解除する。
   */
  public removeListener(listener: TaskStateListener): void {
    this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const isRunning = this.isRunning();
    const taskCount = this.tasks.size;
    const phaseLabel = this.getCurrentPhaseLabel();
    for (const listener of this.listeners) {
      try {
        listener(isRunning, taskCount, phaseLabel);
      } catch {
        // リスナーのエラーは無視
      }
    }
  }
}

// シングルトンインスタンス
export const taskManager = new TaskManager();
