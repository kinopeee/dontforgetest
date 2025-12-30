/**
 * テスト生成処理の進捗・結果を拡張機能内で共通表現するイベント。
 *
 * - Provider（cursor-agent等）からUI層へ通知する用途
 * - できるだけ「拡張機能が扱いやすい粒度」に正規化する
 */

/** 進捗フェーズの種別 */
export type TestGenPhase =
  | 'preparing'        // 準備中
  | 'perspectives'     // 観点表生成中
  | 'generating'       // テストコード生成中
  | 'running-tests'    // テスト実行中
  | 'done';            // 完了

export type TestGenEvent =
  | {
    type: 'started';
    taskId: string;
    /** ユーザーに表示するラベル（例: generateFromCommit, generateFromWorkingTree） */
    label: string;
    /** 追加情報（例: 対象ファイルパス） */
    detail?: string;
    timestampMs: number;
  }
  | {
    type: 'phase';
    taskId: string;
    /** 現在のフェーズ */
    phase: TestGenPhase;
    /** フェーズの表示ラベル */
    phaseLabel: string;
    timestampMs: number;
  }
  | {
    type: 'log';
    taskId: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    timestampMs: number;
  }
  | {
    type: 'fileWrite';
    taskId: string;
    /** 生成・更新したファイルパス（可能ならワークスペース相対） */
    path: string;
    /** 書き込み行数（取得できる場合のみ） */
    linesCreated?: number;
    /** 書き込みバイト数（取得できる場合のみ） */
    bytesWritten?: number;
    timestampMs: number;
  }
  | {
    type: 'completed';
    taskId: string;
    /** 子プロセス終了コード。シグナル終了等の場合は null */
    exitCode: number | null;
    timestampMs: number;
  };

export function nowMs(): number {
  return Date.now();
}
