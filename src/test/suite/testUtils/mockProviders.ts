import { type AgentProvider, type AgentRunOptions, type RunningTask } from '../../../providers/provider';

/**
 * テスト専用のモック Provider（何もしない）。
 * 決定論的テストで `AgentProvider` が必要な箇所に注入する。
 */
export class MockGenerateProvider implements AgentProvider {
  readonly id = 'mock-generate';
  readonly displayName = 'Mock Generate';

  run(options: AgentRunOptions): RunningTask {
    return { taskId: options.taskId, dispose: () => {} };
  }
}

