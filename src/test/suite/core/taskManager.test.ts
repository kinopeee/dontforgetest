import * as assert from 'assert';
import { taskManager } from '../../../core/taskManager';
import { type RunningTask } from '../../../providers/provider';

suite('core/taskManager.ts', () => {
  // テスト間でタスクマネージャーの状態をクリーンアップ
  setup(() => {
    // すべてのタスクをキャンセルしてクリーンアップ
    taskManager.cancelAll();
  });

  teardown(() => {
    // テスト後のクリーンアップ
    taskManager.cancelAll();
  });

  // モックRunningTaskを作成するヘルパー
  function createMockRunningTask(taskId: string): { runningTask: RunningTask; disposed: boolean; getDisposed: () => boolean } {
    let disposed = false;
    const runningTask: RunningTask = {
      taskId,
      dispose: () => { disposed = true; },
    };
    return { runningTask, disposed, getDisposed: () => disposed };
  }

  suite('register', () => {
    // Given: タスクマネージャーが初期状態
    // When: タスクを登録する
    // Then: タスクが登録され、カウントが増加する
    test('TC-N-01: タスク登録でカウントが増加する', () => {
      // Given: 初期状態
      assert.strictEqual(taskManager.getRunningCount(), 0, '初期状態は0タスク');

      // When: タスクを登録
      const { runningTask } = createMockRunningTask('test-task-1');
      taskManager.register('test-task-1', 'テスト生成', runningTask);

      // Then: カウントが1になる
      assert.strictEqual(taskManager.getRunningCount(), 1, '登録後は1タスク');
    });

    // Given: タスクマネージャーに既にタスクがある
    // When: 別のタスクを登録する
    // Then: 両方のタスクが存在する
    test('TC-N-02: 複数タスクの登録', () => {
      // Given: 1つ目のタスクを登録
      const { runningTask: task1 } = createMockRunningTask('test-task-1');
      taskManager.register('test-task-1', 'テスト生成1', task1);

      // When: 2つ目のタスクを登録
      const { runningTask: task2 } = createMockRunningTask('test-task-2');
      taskManager.register('test-task-2', 'テスト生成2', task2);

      // Then: カウントが2になる
      assert.strictEqual(taskManager.getRunningCount(), 2, '2タスクが登録されている');
    });
  });

  suite('unregister', () => {
    // Given: タスクが登録されている
    // When: タスクを解除する
    // Then: タスクが削除され、カウントが減少する
    test('TC-N-03: タスク解除でカウントが減少する', () => {
      // Given: タスクを登録
      const { runningTask } = createMockRunningTask('test-task-1');
      taskManager.register('test-task-1', 'テスト生成', runningTask);
      assert.strictEqual(taskManager.getRunningCount(), 1);

      // When: タスクを解除
      taskManager.unregister('test-task-1');

      // Then: カウントが0になる
      assert.strictEqual(taskManager.getRunningCount(), 0, '解除後は0タスク');
    });

    // Given: 存在しないタスクIDを指定
    // When: unregisterを呼び出す
    // Then: エラーなく処理される
    test('TC-E-01: 存在しないタスクの解除はエラーにならない', () => {
      // Given: 空の状態
      assert.strictEqual(taskManager.getRunningCount(), 0);

      // When: 存在しないタスクを解除
      // Then: エラーなく処理される
      assert.doesNotThrow(() => {
        taskManager.unregister('non-existent-task');
      }, '存在しないタスクの解除はエラーにならない');
    });
  });

  suite('cancel', () => {
    // Given: タスクが登録されている
    // When: タスクをキャンセルする
    // Then: dispose()が呼ばれ、タスクが削除される
    test('TC-N-04: タスクキャンセルでdisposeが呼ばれる', () => {
      // Given: タスクを登録
      const mock = createMockRunningTask('test-task-1');
      taskManager.register('test-task-1', 'テスト生成', mock.runningTask);

      // When: タスクをキャンセル
      const result = taskManager.cancel('test-task-1');

      // Then: dispose()が呼ばれ、trueが返される
      assert.strictEqual(result, true, 'キャンセル成功');
      assert.strictEqual(mock.getDisposed(), true, 'dispose()が呼ばれた');
      assert.strictEqual(taskManager.getRunningCount(), 0, 'タスクが削除された');
    });

    // Given: 存在しないタスクID
    // When: cancelを呼び出す
    // Then: falseが返される
    test('TC-E-02: 存在しないタスクのキャンセルはfalseを返す', () => {
      // Given: 空の状態
      assert.strictEqual(taskManager.getRunningCount(), 0);

      // When: 存在しないタスクをキャンセル
      const result = taskManager.cancel('non-existent-task');

      // Then: falseが返される
      assert.strictEqual(result, false, 'キャンセル失敗');
    });

    // Given: dispose()がエラーをスローするタスク
    // When: cancelを呼び出す
    // Then: エラーは無視され、タスクは削除される
    test('TC-E-03: disposeエラーは無視される', () => {
      // Given: エラーをスローするタスクを登録
      const errorTask: RunningTask = {
        taskId: 'error-task',
        dispose: () => { throw new Error('dispose error'); },
      };
      taskManager.register('error-task', 'エラータスク', errorTask);

      // When: キャンセル
      // Then: エラーなく処理される
      assert.doesNotThrow(() => {
        const result = taskManager.cancel('error-task');
        assert.strictEqual(result, true, 'キャンセル成功');
      }, 'disposeエラーは無視される');
      assert.strictEqual(taskManager.getRunningCount(), 0, 'タスクが削除された');
    });
  });

  suite('cancelAll', () => {
    // Given: 複数のタスクが登録されている
    // When: cancelAllを呼び出す
    // Then: すべてのタスクがキャンセルされる
    test('TC-N-05: 全タスクキャンセル', () => {
      // Given: 複数タスクを登録
      const mock1 = createMockRunningTask('test-task-1');
      const mock2 = createMockRunningTask('test-task-2');
      const mock3 = createMockRunningTask('test-task-3');
      taskManager.register('test-task-1', 'タスク1', mock1.runningTask);
      taskManager.register('test-task-2', 'タスク2', mock2.runningTask);
      taskManager.register('test-task-3', 'タスク3', mock3.runningTask);

      // When: 全キャンセル
      const count = taskManager.cancelAll();

      // Then: 3つキャンセルされる
      assert.strictEqual(count, 3, '3タスクがキャンセルされた');
      assert.strictEqual(mock1.getDisposed(), true, 'タスク1のdispose呼び出し');
      assert.strictEqual(mock2.getDisposed(), true, 'タスク2のdispose呼び出し');
      assert.strictEqual(mock3.getDisposed(), true, 'タスク3のdispose呼び出し');
      assert.strictEqual(taskManager.getRunningCount(), 0, 'タスク数は0');
    });

    // Given: タスクがない状態
    // When: cancelAllを呼び出す
    // Then: 0が返される
    test('TC-B-01: タスクなし状態でのcancelAllは0を返す', () => {
      // Given: 空の状態
      assert.strictEqual(taskManager.getRunningCount(), 0);

      // When: 全キャンセル
      const count = taskManager.cancelAll();

      // Then: 0が返される
      assert.strictEqual(count, 0, '0タスクがキャンセルされた');
    });
  });

  suite('isRunning', () => {
    // Given: タスクがない状態
    // When: isRunningを呼び出す
    // Then: falseが返される
    test('TC-N-06: タスクなしでfalse', () => {
      // Given: 空の状態
      assert.strictEqual(taskManager.getRunningCount(), 0);

      // When/Then: falseが返される
      assert.strictEqual(taskManager.isRunning(), false, '実行中でない');
    });

    // Given: タスクがある状態
    // When: isRunningを呼び出す
    // Then: trueが返される
    test('TC-N-07: タスクありでtrue', () => {
      // Given: タスクを登録
      const { runningTask } = createMockRunningTask('test-task-1');
      taskManager.register('test-task-1', 'テスト', runningTask);

      // When/Then: trueが返される
      assert.strictEqual(taskManager.isRunning(), true, '実行中');
    });
  });

  suite('getRunningTaskIds', () => {
    // Given: 複数タスクが登録されている
    // When: getRunningTaskIdsを呼び出す
    // Then: すべてのタスクIDが返される
    test('TC-N-08: タスクIDリストの取得', () => {
      // Given: 複数タスクを登録
      const { runningTask: task1 } = createMockRunningTask('task-a');
      const { runningTask: task2 } = createMockRunningTask('task-b');
      taskManager.register('task-a', 'タスクA', task1);
      taskManager.register('task-b', 'タスクB', task2);

      // When: IDリストを取得
      const ids = taskManager.getRunningTaskIds();

      // Then: 両方のIDが含まれる
      assert.strictEqual(ids.length, 2, '2つのIDがある');
      assert.ok(ids.includes('task-a'), 'task-aが含まれる');
      assert.ok(ids.includes('task-b'), 'task-bが含まれる');
    });
  });

  suite('listener', () => {
    // Given: リスナーが登録されている
    // When: タスクを登録する
    // Then: リスナーが呼ばれる
    test('TC-N-09: タスク登録時にリスナーが呼ばれる', () => {
      // Given: リスナーを登録
      let listenerCalled = false;
      let receivedIsRunning: boolean | undefined;
      let receivedCount: number | undefined;
      const listener = (isRunning: boolean, count: number) => {
        listenerCalled = true;
        receivedIsRunning = isRunning;
        receivedCount = count;
      };
      taskManager.addListener(listener);

      try {
        // When: タスクを登録
        const { runningTask } = createMockRunningTask('test-task-1');
        taskManager.register('test-task-1', 'テスト', runningTask);

        // Then: リスナーが呼ばれる
        assert.strictEqual(listenerCalled, true, 'リスナーが呼ばれた');
        assert.strictEqual(receivedIsRunning, true, 'isRunning=true');
        assert.strictEqual(receivedCount, 1, 'count=1');
      } finally {
        taskManager.removeListener(listener);
      }
    });

    // Given: リスナーが登録されている
    // When: タスクを解除する
    // Then: リスナーが呼ばれる
    test('TC-N-10: タスク解除時にリスナーが呼ばれる', () => {
      // Given: タスクとリスナーを登録
      const { runningTask } = createMockRunningTask('test-task-1');
      taskManager.register('test-task-1', 'テスト', runningTask);

      let receivedIsRunning: boolean | undefined;
      let receivedCount: number | undefined;
      const listener = (isRunning: boolean, count: number) => {
        receivedIsRunning = isRunning;
        receivedCount = count;
      };
      taskManager.addListener(listener);

      try {
        // When: タスクを解除
        taskManager.unregister('test-task-1');

        // Then: リスナーが呼ばれる
        assert.strictEqual(receivedIsRunning, false, 'isRunning=false');
        assert.strictEqual(receivedCount, 0, 'count=0');
      } finally {
        taskManager.removeListener(listener);
      }
    });

    // Given: リスナーが登録されている
    // When: タスクをキャンセルする
    // Then: リスナーが呼ばれる
    test('TC-N-11: タスクキャンセル時にリスナーが呼ばれる', () => {
      // Given: タスクとリスナーを登録
      const { runningTask } = createMockRunningTask('test-task-1');
      taskManager.register('test-task-1', 'テスト', runningTask);

      let receivedIsRunning: boolean | undefined;
      let receivedCount: number | undefined;
      const listener = (isRunning: boolean, count: number) => {
        receivedIsRunning = isRunning;
        receivedCount = count;
      };
      taskManager.addListener(listener);

      try {
        // When: タスクをキャンセル
        taskManager.cancel('test-task-1');

        // Then: リスナーが呼ばれる
        assert.strictEqual(receivedIsRunning, false, 'isRunning=false');
        assert.strictEqual(receivedCount, 0, 'count=0');
      } finally {
        taskManager.removeListener(listener);
      }
    });

    // Given: リスナーを解除した後
    // When: タスクを登録する
    // Then: リスナーは呼ばれない
    test('TC-N-12: 解除したリスナーは呼ばれない', () => {
      // Given: リスナーを登録して解除
      let callCount = 0;
      const listener = () => { callCount++; };
      taskManager.addListener(listener);
      taskManager.removeListener(listener);

      // When: タスクを登録
      const { runningTask } = createMockRunningTask('test-task-1');
      taskManager.register('test-task-1', 'テスト', runningTask);

      // Then: リスナーは呼ばれない
      assert.strictEqual(callCount, 0, 'リスナーは呼ばれない');
    });

    // Given: リスナーがエラーをスローする
    // When: タスクを登録する
    // Then: エラーは無視され、他のリスナーは呼ばれる
    test('TC-E-04: リスナーエラーは無視される', () => {
      // Given: エラーをスローするリスナーと正常なリスナー
      let normalListenerCalled = false;
      const errorListener = () => { throw new Error('listener error'); };
      const normalListener = () => { normalListenerCalled = true; };

      taskManager.addListener(errorListener);
      taskManager.addListener(normalListener);

      try {
        // When: タスクを登録
        const { runningTask } = createMockRunningTask('test-task-1');

        // Then: エラーなく処理され、正常なリスナーは呼ばれる
        assert.doesNotThrow(() => {
          taskManager.register('test-task-1', 'テスト', runningTask);
        }, 'リスナーエラーは無視される');
        assert.strictEqual(normalListenerCalled, true, '正常なリスナーは呼ばれる');
      } finally {
        taskManager.removeListener(errorListener);
        taskManager.removeListener(normalListener);
      }
    });
  });

  suite('境界値テスト', () => {
    // Given: 空文字のタスクID
    // When: registerを呼び出す
    // Then: 登録される（IDの検証はしない）
    test('TC-B-02: 空文字のタスクIDでも登録できる', () => {
      // Given/When: 空文字IDで登録
      const { runningTask } = createMockRunningTask('');
      taskManager.register('', 'テスト', runningTask);

      // Then: 登録される
      assert.strictEqual(taskManager.getRunningCount(), 1, '登録された');
      assert.ok(taskManager.getRunningTaskIds().includes(''), '空文字IDが含まれる');
    });

    // Given: 同じタスクIDで2回登録
    // When: 2回目のregisterを呼び出す
    // Then: 上書きされる（カウントは1のまま）
    test('TC-B-03: 同じIDで再登録すると上書きされる', () => {
      // Given: 1回目の登録
      const mock1 = createMockRunningTask('same-id');
      taskManager.register('same-id', 'タスク1', mock1.runningTask);

      // When: 同じIDで2回目の登録
      const mock2 = createMockRunningTask('same-id');
      taskManager.register('same-id', 'タスク2', mock2.runningTask);

      // Then: カウントは1のまま
      assert.strictEqual(taskManager.getRunningCount(), 1, 'カウントは1');
    });
  });
});
