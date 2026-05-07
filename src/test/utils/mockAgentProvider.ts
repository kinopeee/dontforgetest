import { Readable } from 'stream';
import { AgentProvider, AgentRunOptions, RunningTask } from '../../providers/provider';
import { TestGenEvent } from '../../core/event';

/**
 * モック用のタスクイベント
 *
 * TestGenEvent と互換性を持たせるため、'done' の代わりに 'completed' を使用し、
 * exitCode を含める。
 */
export interface MockTaskEvent {
  type: 'started' | 'log' | 'error' | 'completed';
  taskId: string;
  timestampMs: number;
  label?: string;
  detail?: string;
  level?: 'info' | 'warn' | 'error';
  message?: string;
  error?: Error;
  exitCode?: number | null;
}

/**
 * 安定したモック AgentProvider
 */
export class MockAgentProvider implements AgentProvider {
  readonly id = 'mock';
  readonly displayName = 'Mock Provider';
  private shouldFail: boolean = false;
  private failureError: Error = new Error('Mock provider failure');
  private delayMs: number = 0;
  private events: MockTaskEvent[] = [];
  private disposed: boolean = false;

  /**
   * 失敗モードを設定
   */
  setFailureMode(shouldFail: boolean, error?: Error): void {
    this.shouldFail = shouldFail;
    if (error) {
      this.failureError = error;
    }
  }

  /**
   * レスポンス遅延を設定
   */
  setDelay(delayMs: number): void {
    this.delayMs = delayMs;
  }

  /**
   * 記録されたイベントを取得
   */
  getEvents(): MockTaskEvent[] {
    return [...this.events];
  }

  /**
   * イベントをクリア
   */
  clearEvents(): void {
    this.events = [];
  }

  /**
   * タスクを実行する
   */
  run(options: AgentRunOptions): RunningTask {
    const taskId = options.taskId;
    const now = Date.now();

    // 非同期でイベントを送信
    setTimeout(async () => {
      if (this.disposed) return;

      // 開始イベント
      const startEvent: MockTaskEvent = {
        type: 'started',
        taskId,
        timestampMs: now,
        label: 'Mock Task',
      };
      this.events.push(startEvent);
      options.onEvent(startEvent as TestGenEvent);

      // 遅延がある場合は待機
      if (this.delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      }

      if (this.disposed) return;

      // 失敗モードの場合はエラーを投げる
      if (this.shouldFail) {
        const errorEvent: MockTaskEvent = {
          type: 'error',
          taskId,
          timestampMs: Date.now(),
          level: 'error',
          message: this.failureError.message,
          error: this.failureError,
        };
        this.events.push(errorEvent);
        options.onEvent(errorEvent as TestGenEvent);
        return;
      }

      // 成功時のログイベント
      const logEvent: MockTaskEvent = {
        type: 'log',
        taskId,
        timestampMs: Date.now(),
        level: 'info',
        message: 'Mock task completed successfully',
      };
      this.events.push(logEvent);
      options.onEvent(logEvent as TestGenEvent);

      // 終了イベント（TestGenEvent の 'completed' 型と互換）
      const endEvent: MockTaskEvent = {
        type: 'completed',
        taskId,
        timestampMs: Date.now(),
        exitCode: 0,
      };
      this.events.push(endEvent);
      options.onEvent(endEvent as TestGenEvent);
    }, 0);

    return {
      taskId,
      dispose: () => {
        this.disposed = true;
      },
    };
  }

  /**
   * モック用のクリーンアップ
   */
  async cleanup(): Promise<void> {
    // 何もしない
  }
}

/**
 * ストリームを生成するモック関数
 */
export function createMockStream(data: string, delayMs: number = 0): Readable {
  let index = 0;
  const chunks = data.split('\n');

  const stream = new Readable({
    read() {
      if (index >= chunks.length) {
        this.push(null);
        return;
      }

      const chunk = chunks[index++];
      if (chunk === '' && index === chunks.length) {
        this.push(null);
        return;
      }

      setTimeout(() => {
        this.push(chunk + '\n');
      }, delayMs);
    },
  });

  return stream;
}

/**
 * エラーストリームを生成するモック関数
 */
export function createErrorStream(error: Error, delayMs: number = 0): Readable {
  const stream = new Readable({
    read() {
      setTimeout(() => {
        this.emit('error', error);
        this.push(null);
      }, delayMs);
    },
  });

  return stream;
}
