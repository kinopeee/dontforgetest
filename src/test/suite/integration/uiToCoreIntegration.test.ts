/**
 * UI層とコア層の統合テスト
 *
 * このファイルは UI コンポーネント（ControlPanel, QuickPick, StatusBar など）と
 * コア層（TaskManager, Artifacts など）の連携をテストする。
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { taskManager } from '../../../core/taskManager';
import { type TestGenEvent, nowMs } from '../../../core/event';
import { handleTestGenEventForProgressView, emitPhaseEvent } from '../../../ui/progressTreeView';
import { handleTestGenEventForStatusBar } from '../../../ui/statusBar';
import { appendEventToOutput, getTestGenOutputChannel } from '../../../ui/outputChannel';

suite('integration/uiToCoreIntegration', () => {
  suiteSetup(async () => {
    // Given: 拡張機能がインストールされ、アクティブである
    const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
    assert.ok(ext, '拡張機能が見つからない');
    if (!ext.isActive) {
      await ext.activate();
    }
    assert.ok(ext.isActive, '拡張機能がアクティブであること');
  });

  suite('TaskManager と UI コンポーネントの連携', () => {
    // TC-INT-TM-01: TaskManager のタスク登録が UI に反映される
    test('TC-INT-TM-01: TaskManager のタスク登録が正常に動作する', () => {
      // Given: 新しいタスクID（ユニークな ID で他テストと分離）
      const taskId = `test-task-${Date.now()}-${Math.random()}`;
      const label = 'テストタスク';
      const mockRunningTask = {
        taskId,
        dispose: () => {},
      };

      try {
        // When: TaskManager にタスクを登録
        taskManager.register(taskId, label, mockRunningTask);

        // Then: タスクが登録されている（getRunningTaskIds に含まれる）
        assert.ok(!taskManager.isCancelled(taskId), 'タスクがキャンセルされていない');
        assert.ok(taskManager.getRunningTaskIds().includes(taskId), '登録したタスクが getRunningTaskIds に含まれる');
      } finally {
        // クリーンアップ
        taskManager.unregister(taskId);
        // Then: unregister 後はタスクが削除されている
        assert.ok(!taskManager.getRunningTaskIds().includes(taskId), 'unregister 後にタスクが削除されている');
      }
    });

    // TC-INT-TM-02: TaskManager のフェーズ更新が正常に動作する
    test('TC-INT-TM-02: TaskManager のフェーズ更新が正常に動作する', () => {
      // Given: 登録済みのタスク（ユニークな ID で他テストと分離）
      const taskId = `test-task-phase-${Date.now()}-${Math.random()}`;
      const label = 'フェーズテストタスク';
      const mockRunningTask = {
        taskId,
        dispose: () => {},
      };

      try {
        taskManager.register(taskId, label, mockRunningTask);

        // When: フェーズを更新
        // Then: 例外なく実行される（シングルトンのため getCurrentPhaseLabel は他タスクの影響を受ける可能性があり、
        //       ここでは updatePhase が例外なく実行されることのみを検証）
        assert.doesNotThrow(() => {
          taskManager.updatePhase(taskId, 'preparing', 'preparing');
        }, 'フェーズ更新（preparing）が例外なく実行される');

        // When: 別のフェーズに更新
        assert.doesNotThrow(() => {
          taskManager.updatePhase(taskId, 'generating', 'generating');
        }, 'フェーズ更新（generating）が例外なく実行される');

        // Then: タスクがまだ登録されている
        assert.ok(taskManager.getRunningTaskIds().includes(taskId), 'フェーズ更新後もタスクが登録されている');
      } finally {
        taskManager.unregister(taskId);
      }
    });

    // TC-INT-TM-03: TaskManager のキャンセルが正常に動作する
    test('TC-INT-TM-03: TaskManager のキャンセルが正常に動作する', () => {
      // Given: 登録済みのタスク（ユニークな ID で他テストと分離）
      const taskId = `test-task-cancel-${Date.now()}-${Math.random()}`;
      const label = 'キャンセルテストタスク';
      const mockRunningTask = {
        taskId,
        dispose: () => {},
      };

      try {
        taskManager.register(taskId, label, mockRunningTask);
        assert.ok(taskManager.getRunningTaskIds().includes(taskId), '登録後にタスクが存在する');

        // When: タスクをキャンセル（cancelAll は他テストのタスクも影響するため、cancel(taskId) を使用）
        const cancelled = taskManager.cancel(taskId);

        // Then: タスクがキャンセルされている
        assert.ok(cancelled, 'cancel() が true を返す');
        assert.ok(taskManager.isCancelled(taskId), 'タスクがキャンセルされている');
        // Then: キャンセル後はタスクが削除されている
        assert.ok(!taskManager.getRunningTaskIds().includes(taskId), 'キャンセル後にタスクが削除されている');
      } finally {
        // cancel() で既に削除されているが、念のため unregister を呼ぶ（冪等）
        taskManager.unregister(taskId);
      }
    });
  });

  suite('イベントシステムと UI の連携', () => {
    // TC-INT-EV-01: started イベントが ProgressView に正しく渡される
    // 注意: initializeProgressTreeView() が呼ばれていない場合は no-op になるが、
    // 例外なく処理されることを確認する（安全性のテスト）
    test('TC-INT-EV-01: started イベントが ProgressView に正しく渡される', () => {
      // Given: started イベント
      const event: TestGenEvent = {
        type: 'started',
        taskId: `test-started-${Date.now()}`,
        label: 'テスト開始',
        detail: 'テスト詳細',
        timestampMs: nowMs(),
      };

      // When: handleTestGenEventForProgressView を呼び出す
      // Then: 例外なく処理される（未初期化時は no-op で安全に処理される）
      assert.doesNotThrow(() => {
        handleTestGenEventForProgressView(event);
      }, 'started イベントが例外なく処理される');
    });

    // TC-INT-EV-02: phase イベントが ProgressView に正しく渡される
    test('TC-INT-EV-02: phase イベントが ProgressView に正しく渡される', () => {
      // Given: phase イベント
      const taskId = `test-phase-${Date.now()}`;
      const phaseEvent = emitPhaseEvent(taskId, 'generating', 'テスト生成中');

      // When: handleTestGenEventForProgressView を呼び出す
      // Then: 例外なく処理される
      assert.doesNotThrow(() => {
        handleTestGenEventForProgressView(phaseEvent);
      }, 'phase イベントが例外なく処理される');

      // イベント構造の検証
      assert.strictEqual(phaseEvent.type, 'phase', 'イベントタイプが phase');
      assert.strictEqual(phaseEvent.taskId, taskId, 'taskId が正しい');
      assert.strictEqual(phaseEvent.phase, 'generating', 'phase が正しい');
      assert.strictEqual(phaseEvent.phaseLabel, 'テスト生成中', 'phaseLabel が正しい');
    });

    // TC-INT-EV-03: completed イベントが ProgressView に正しく渡される
    test('TC-INT-EV-03: completed イベントが ProgressView に正しく渡される', () => {
      // Given: completed イベント
      const event: TestGenEvent = {
        type: 'completed',
        taskId: `test-completed-${Date.now()}`,
        exitCode: 0,
        timestampMs: nowMs(),
      };

      // When: handleTestGenEventForProgressView を呼び出す
      // Then: 例外なく処理される
      assert.doesNotThrow(() => {
        handleTestGenEventForProgressView(event);
      }, 'completed イベントが例外なく処理される');
    });

    // TC-INT-EV-04: log イベントが OutputChannel に正しく渡される
    test('TC-INT-EV-04: log イベントが OutputChannel に正しく渡される', () => {
      // Given: log イベント
      const event: TestGenEvent = {
        type: 'log',
        taskId: `test-log-${Date.now()}`,
        level: 'info',
        message: 'テストログメッセージ',
        timestampMs: nowMs(),
      };

      // When: appendEventToOutput を呼び出す
      // Then: 例外なく処理される
      assert.doesNotThrow(() => {
        appendEventToOutput(event);
      }, 'log イベントが例外なく処理される');
    });

    // TC-INT-EV-05: fileWrite イベントが OutputChannel に正しく渡される
    test('TC-INT-EV-05: fileWrite イベントが OutputChannel に正しく渡される', () => {
      // Given: fileWrite イベント
      const event: TestGenEvent = {
        type: 'fileWrite',
        taskId: `test-filewrite-${Date.now()}`,
        path: 'test/file.ts',
        linesCreated: 50,
        bytesWritten: 1000,
        timestampMs: nowMs(),
      };

      // When: appendEventToOutput を呼び出す
      // Then: 例外なく処理される
      assert.doesNotThrow(() => {
        appendEventToOutput(event);
      }, 'fileWrite イベントが例外なく処理される');
    });
  });

  suite('OutputChannel の統合', () => {
    // TC-INT-OC-01: OutputChannel が正しく取得できる
    test('TC-INT-OC-01: OutputChannel が正しく取得できる', () => {
      // Given: なし

      // When: getTestGenOutputChannel を呼び出す
      const channel = getTestGenOutputChannel();

      // Then: OutputChannel が返される
      assert.ok(channel !== undefined, 'OutputChannel が取得できる');
      assert.strictEqual(channel.name, 'Dontforgetest', 'OutputChannel の名前が正しい');
    });

    // TC-INT-OC-02: 同じ OutputChannel インスタンスが返される
    test('TC-INT-OC-02: 同じ OutputChannel インスタンスが返される', () => {
      // Given: なし

      // When: getTestGenOutputChannel を複数回呼び出す
      const channel1 = getTestGenOutputChannel();
      const channel2 = getTestGenOutputChannel();

      // Then: 同じインスタンスが返される
      assert.strictEqual(channel1, channel2, '同じインスタンスが返される');
    });
  });

  suite('StatusBar の統合', () => {
    // TC-INT-SB-01: started イベントが StatusBar に正しく渡される
    // 注意: initializeTestGenStatusBar() が呼ばれていない場合は no-op になるが、
    // 例外なく処理されることを確認する（安全性のテスト）
    test('TC-INT-SB-01: started イベントが StatusBar に正しく渡される', () => {
      // Given: started イベント
      const event: TestGenEvent = {
        type: 'started',
        taskId: `test-sb-started-${Date.now()}`,
        label: 'StatusBar テスト',
        timestampMs: nowMs(),
      };

      // When: handleTestGenEventForStatusBar を呼び出す
      // Then: 例外なく処理される（未初期化時は no-op で安全に処理される）
      assert.doesNotThrow(() => {
        handleTestGenEventForStatusBar(event);
      }, 'started イベントが StatusBar で例外なく処理される');
    });

    // TC-INT-SB-02: completed イベントが StatusBar に正しく渡される
    // 注意: initializeTestGenStatusBar() が呼ばれていない場合は no-op になるが、
    // 例外なく処理されることを確認する（安全性のテスト）
    test('TC-INT-SB-02: completed イベントが StatusBar に正しく渡される', () => {
      // Given: completed イベント
      const event: TestGenEvent = {
        type: 'completed',
        taskId: `test-sb-completed-${Date.now()}`,
        exitCode: 0,
        timestampMs: nowMs(),
      };

      // When: handleTestGenEventForStatusBar を呼び出す
      // Then: 例外なく処理される（未初期化時は no-op で安全に処理される）
      assert.doesNotThrow(() => {
        handleTestGenEventForStatusBar(event);
      }, 'completed イベントが StatusBar で例外なく処理される');
    });
  });

  suite('複合シナリオ', () => {
    // TC-INT-COMP-01: タスクのライフサイクル全体が正常に動作する
    test('TC-INT-COMP-01: タスクのライフサイクル全体が正常に動作する', () => {
      // Given: 新しいタスク（ユニークな ID で他テストと分離）
      const taskId = `test-lifecycle-${Date.now()}-${Math.random()}`;
      const label = 'ライフサイクルテスト';
      const mockRunningTask = {
        taskId,
        dispose: () => {},
      };

      try {
        // When: タスクを登録
        taskManager.register(taskId, label, mockRunningTask);

        // Then: タスクが登録されている
        assert.ok(taskManager.getRunningTaskIds().includes(taskId), 'タスク登録後に getRunningTaskIds に含まれる');

        // Then: started イベントを発行
        const startedEvent: TestGenEvent = {
          type: 'started',
          taskId,
          label,
          timestampMs: nowMs(),
        };
        assert.doesNotThrow(() => {
          handleTestGenEventForProgressView(startedEvent);
          handleTestGenEventForStatusBar(startedEvent);
          appendEventToOutput(startedEvent);
        }, 'started イベントが全 UI コンポーネントで処理される');

        // When: フェーズを更新
        // 注意: getCurrentPhaseLabel() はシングルトンのため他タスクの影響を受ける可能性があり、
        //       ここでは updatePhase が例外なく実行されることのみを検証
        assert.doesNotThrow(() => {
          taskManager.updatePhase(taskId, 'generating', 'generating');
        }, 'フェーズ更新が例外なく実行される');

        const phaseEvent = emitPhaseEvent(taskId, 'generating', 'テスト生成中');
        assert.doesNotThrow(() => {
          handleTestGenEventForProgressView(phaseEvent);
          appendEventToOutput(phaseEvent);
        }, 'phase イベントが全 UI コンポーネントで処理される');

        // When: 完了イベントを発行
        const completedEvent: TestGenEvent = {
          type: 'completed',
          taskId,
          exitCode: 0,
          timestampMs: nowMs(),
        };
        assert.doesNotThrow(() => {
          handleTestGenEventForProgressView(completedEvent);
          handleTestGenEventForStatusBar(completedEvent);
          appendEventToOutput(completedEvent);
        }, 'completed イベントが全 UI コンポーネントで処理される');
      } finally {
        taskManager.unregister(taskId);
        // Then: unregister 後はタスクが削除されている
        assert.ok(!taskManager.getRunningTaskIds().includes(taskId), 'unregister 後にタスクが削除されている');
      }
    });

    // TC-INT-COMP-02: 複数のタスクが同時に管理できる
    test('TC-INT-COMP-02: 複数のタスクが同時に管理できる', () => {
      // Given: 複数のタスク（ユニークな ID で他テストと分離）
      const suffix = `${Date.now()}-${Math.random()}`;
      const taskIds = [
        `test-multi-1-${suffix}`,
        `test-multi-2-${suffix}`,
        `test-multi-3-${suffix}`,
      ];

      try {
        // When: 複数のタスクを登録
        for (const taskId of taskIds) {
          const mockRunningTask = {
            taskId,
            dispose: () => {},
          };
          taskManager.register(taskId, `タスク ${taskId}`, mockRunningTask);
        }

        // Then: すべてのタスクが getRunningTaskIds に含まれている
        const runningIds = taskManager.getRunningTaskIds();
        for (const taskId of taskIds) {
          assert.ok(runningIds.includes(taskId), `タスク ${taskId} が getRunningTaskIds に含まれる`);
        }

        // Then: すべてのタスクがキャンセルされていない
        for (const taskId of taskIds) {
          assert.ok(!taskManager.isCancelled(taskId), `タスク ${taskId} がキャンセルされていない`);
        }

        // When: 各タスクを個別にキャンセル（cancelAll は他テストに影響するため避ける）
        for (const taskId of taskIds) {
          taskManager.cancel(taskId);
        }

        // Then: すべてのタスクがキャンセルされている
        for (const taskId of taskIds) {
          assert.ok(taskManager.isCancelled(taskId), `タスク ${taskId} がキャンセルされている`);
        }

        // Then: キャンセル後はすべてのタスクが削除されている
        const runningIdsAfter = taskManager.getRunningTaskIds();
        for (const taskId of taskIds) {
          assert.ok(!runningIdsAfter.includes(taskId), `タスク ${taskId} がキャンセル後に削除されている`);
        }
      } finally {
        // クリーンアップ（cancel() で既に削除されているが、念のため）
        for (const taskId of taskIds) {
          taskManager.unregister(taskId);
        }
      }
    });
  });
});
