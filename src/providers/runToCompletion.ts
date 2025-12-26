import { nowMs, type TestGenEvent } from '../core/event';
import { type AgentProvider, type RunningTask } from './provider';

/**
 * provider を「completed まで」実行し、exitCode（null含む）を返す。
 *
 * - completed が来ない/ログだけが流れ続けるケースの保険として timeout をサポートする
 * - 実行開始直後に `onRunningTask` で RunningTask を通知できる
 */
export async function runProviderToCompletion(params: {
  provider: AgentProvider;
  run: {
    taskId: string;
    workspaceRoot: string;
    agentCommand: string;
    prompt: string;
    model: string | undefined;
    outputFormat: 'stream-json';
    allowWrite: boolean;
  };
  /**
   * 最大実行時間（ミリ秒）。0以下/未指定の場合はタイムアウトしない。
   * completed を待てない（ログだけが出続ける）ケースの保険。
   */
  timeoutMs?: number;
  onEvent: (event: TestGenEvent) => void;
  /**
   * タスク開始時に呼ばれるコールバック。RunningTaskを受け取って登録等に使用可能。
   */
  onRunningTask?: (runningTask: RunningTask) => void;
}): Promise<number | null> {
  return await new Promise<number | null>((resolve) => {
    let resolved = false;
    let timeout: NodeJS.Timeout | undefined;
    const finish = (exitCode: number | null) => {
      if (resolved) {
        return;
      }
      resolved = true;
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      resolve(exitCode);
    };

    const running = params.provider.run({
      taskId: params.run.taskId,
      workspaceRoot: params.run.workspaceRoot,
      agentCommand: params.run.agentCommand,
      prompt: params.run.prompt,
      model: params.run.model,
      outputFormat: params.run.outputFormat,
      allowWrite: params.run.allowWrite,
      onEvent: (event) => {
        params.onEvent(event);
        if (event.type === 'completed') {
          finish(event.exitCode);
        }
      },
    });

    // RunningTaskを通知（タスクマネージャー登録用）
    if (params.onRunningTask) {
      params.onRunningTask(running);
    }

    const timeoutMs = params.timeoutMs;
    // Node.js の setTimeout は 2^31-1ms を超えると overflow し、
    // 意図せず「ほぼ即時」にタイムアウトが発火する場合がある（TimeoutOverflowWarning 等）。
    // そのため、極端に大きい値は「事実上タイムアウト無効」として扱う。
    const maxSetTimeoutMs = 2 ** 31 - 1;
    if (typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= maxSetTimeoutMs) {
      timeout = setTimeout(() => {
        // 念のため。provider が同期的に completed を返した場合でも、後から誤ってタイムアウト処理を走らせない。
        if (resolved) {
          return;
        }
        const msg =
          `タイムアウト: cursor-agent の処理が ${timeoutMs}ms を超えたため停止します。` +
          `（設定: dontforgetest.perspectiveGenerationTimeoutMs を調整できます）`;
        params.onEvent({ type: 'log', taskId: params.run.taskId, level: 'error', message: msg, timestampMs: nowMs() });
        try {
          running.dispose();
        } catch {
          // noop
        }
        finish(null);
      }, timeoutMs);
    }
  });
}



