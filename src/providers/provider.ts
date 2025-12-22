import { TestGenEvent } from '../core/event';

/**
 * テスト生成を実行するProvider（cursor-agent等）の共通インターフェース。
 *
 * Providerは「実行」と「イベント通知」だけを責務とし、
 * UI（Output Channel/StatusBar）やGit解析等は別モジュールに分離する。
 */
export interface AgentProvider {
  /** Providerの識別子（例: cursor-agent） */
  readonly id: string;
  /** UI表示用の名前 */
  readonly displayName: string;

  /**
   * テスト生成を開始する。
   * 非同期で進行し、進捗は onEvent 経由で通知される。
   */
  run(options: AgentRunOptions): RunningTask;
}

export type AgentOutputFormat = 'text' | 'json' | 'stream-json';

export interface AgentRunOptions {
  /** 拡張機能側で割り当てるタスクID */
  taskId: string;
  /** ワークスペースルート（cwdに利用） */
  workspaceRoot: string;
  /** Providerが起動する実行ファイル（例: cursor-agent）。未指定の場合はProvider既定を使用する */
  agentCommand?: string;
  /** エージェントに渡すプロンプト */
  prompt: string;
  /** 使用モデル（未指定ならProvider既定） */
  model?: string;
  /** printモードの出力形式 */
  outputFormat: AgentOutputFormat;
  /**
   * --force 相当。printモードでファイル変更を許可し、必要に応じてコマンド承認を省略する。
   * 既定: false（提案のみ）
   */
  allowWrite: boolean;
  /** 進捗イベント */
  onEvent: (event: TestGenEvent) => void;
}

/**
 * 実行中タスクを表すDisposable。
 */
export interface RunningTask {
  readonly taskId: string;
  /** 実行を中断する（可能な範囲で） */
  dispose(): void;
}

