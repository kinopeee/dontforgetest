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

  suite('updatePhase / getCurrentPhaseLabel (provided table)', () => {
    function getInternalTasksMap(): Map<string, { currentPhase?: unknown; phaseLabel?: unknown }> {
      const tasks = (taskManager as unknown as { tasks?: unknown }).tasks;
      assert.ok(tasks instanceof Map, 'Expected TaskManager to hold an internal Map named tasks');
      return tasks as Map<string, { currentPhase?: unknown; phaseLabel?: unknown }>;
    }

    test('TM-N-01: updatePhase updates internal fields and notifies listener with phaseLabel', () => {
      // Case ID: TM-N-01
      // Given: taskManager has taskId="T1" registered; a listener captures (isRunning, taskCount, phaseLabel)
      const { runningTask } = createMockRunningTask('T1');
      taskManager.register('T1', 'Label', runningTask);

      let captured: { isRunning: boolean; taskCount: number; phaseLabel?: string } | undefined;
      const listener = (isRunning: boolean, taskCount: number, phaseLabel?: string) => {
        captured = { isRunning, taskCount, phaseLabel };
      };
      taskManager.addListener(listener);

      try {
        // When: updatePhase('T1','preparing','preparing') is called
        taskManager.updatePhase('T1', 'preparing', 'preparing');

        // Then: internal fields are set and listener receives phaseLabel="preparing"
        const task = getInternalTasksMap().get('T1');
        assert.ok(task, 'Expected internal task "T1" to exist');
        assert.strictEqual(task.currentPhase, 'preparing');
        assert.strictEqual(task.phaseLabel, 'preparing');
        assert.deepStrictEqual(captured, { isRunning: true, taskCount: 1, phaseLabel: 'preparing' });
      } finally {
        taskManager.removeListener(listener);
      }
    });

    test('TM-E-01: updatePhase for missing taskId does not notify listeners', () => {
      // Case ID: TM-E-01
      // Given: taskManager has no task registered for taskId="missing"; a listener increments callCount
      let callCount = 0;
      const listener = () => {
        callCount += 1;
      };
      taskManager.addListener(listener);

      try {
        // When: updatePhase('missing','preparing','preparing') is called
        taskManager.updatePhase('missing', 'preparing', 'preparing');

        // Then: listener is not called
        assert.strictEqual(callCount, 0);
      } finally {
        taskManager.removeListener(listener);
      }
    });

    test('TM-B-01: getCurrentPhaseLabel returns undefined when there are 0 tasks', () => {
      // Case ID: TM-B-01
      // Given: taskManager has 0 tasks registered
      taskManager.cancelAll();
      assert.strictEqual(taskManager.getRunningCount(), 0);

      // When: getCurrentPhaseLabel() is called
      const label = taskManager.getCurrentPhaseLabel();

      // Then: it returns undefined
      assert.strictEqual(label, undefined);
    });

    test('TM-B-02: getCurrentPhaseLabel returns undefined when phaseLabel is empty string', () => {
      // Case ID: TM-B-02
      // Given: taskManager has taskId="T1" registered; updatePhase('T1','preparing','') has been called
      const { runningTask } = createMockRunningTask('T1');
      taskManager.register('T1', 'Label', runningTask);
      taskManager.updatePhase('T1', 'preparing', '');

      // When: getCurrentPhaseLabel() is called
      const label = taskManager.getCurrentPhaseLabel();

      // Then: it returns undefined (empty string is falsy)
      assert.strictEqual(label, undefined);
    });

    test('TM-B-03: getCurrentPhaseLabel returns whitespace when phaseLabel is " "', () => {
      // Case ID: TM-B-03
      // Given: taskManager has taskId="T1" registered; updatePhase('T1','preparing',' ') has been called
      const { runningTask } = createMockRunningTask('T1');
      taskManager.register('T1', 'Label', runningTask);
      taskManager.updatePhase('T1', 'preparing', ' ');

      // When: getCurrentPhaseLabel() is called
      const label = taskManager.getCurrentPhaseLabel();

      // Then: it returns exactly " "
      assert.strictEqual(label, ' ');
    });

    test('TM-N-02: getCurrentPhaseLabel skips tasks without phaseLabel and returns later task label', () => {
      // Case ID: TM-N-02
      // Given: Two tasks registered in insertion order; T1 has no phaseLabel; T2 has phaseLabel="generating"
      const { runningTask: task1 } = createMockRunningTask('T1');
      const { runningTask: task2 } = createMockRunningTask('T2');
      taskManager.register('T1', 'Label1', task1);
      taskManager.register('T2', 'Label2', task2);
      taskManager.updatePhase('T2', 'generating', 'generating');

      // When: getCurrentPhaseLabel() is called
      const label = taskManager.getCurrentPhaseLabel();

      // Then: it returns "generating"
      assert.strictEqual(label, 'generating');
    });

    test('TM-E-02: listener exceptions do not prevent other listeners from running', () => {
      // Case ID: TM-E-02
      // Given: taskManager has taskId="T1" registered; first listener throws; second captures args
      const { runningTask } = createMockRunningTask('T1');
      taskManager.register('T1', 'Label', runningTask);

      const throwingListener = () => {
        throw new Error('listener error');
      };
      let captured: { isRunning: boolean; taskCount: number; phaseLabel?: string } | undefined;
      const capturingListener = (isRunning: boolean, taskCount: number, phaseLabel?: string) => {
        captured = { isRunning, taskCount, phaseLabel };
      };

      taskManager.addListener(throwingListener);
      taskManager.addListener(capturingListener);

      try {
        // When: updatePhase('T1','preparing','preparing') is called
        taskManager.updatePhase('T1', 'preparing', 'preparing');

        // Then: second listener still runs and captures phaseLabel="preparing"
        assert.deepStrictEqual(captured, { isRunning: true, taskCount: 1, phaseLabel: 'preparing' });
      } finally {
        taskManager.removeListener(throwingListener);
        taskManager.removeListener(capturingListener);
      }
    });
  });

  suite('provided table cases (TC-TSK-*)', () => {
    test('TC-TSK-N-01: register() notifies listener with phaseLabel=undefined when no phaseLabel is set', () => {
      // Case ID: TC-TSK-N-01
      // Given: taskManager has 0 tasks; a listener spy is registered
      taskManager.cancelAll();
      assert.strictEqual(taskManager.getRunningCount(), 0);

      const received: Array<{ isRunning: boolean; taskCount: number; phaseLabel?: string }> = [];
      const listener = (isRunning: boolean, taskCount: number, phaseLabel?: string) => {
        received.push({ isRunning, taskCount, phaseLabel });
      };
      taskManager.addListener(listener);

      try {
        // When: register("A") is called with no phaseLabel
        const { runningTask } = createMockRunningTask('A');
        taskManager.register('A', 'Label', runningTask);

        // Then: listener receives (true, 1, undefined)
        assert.strictEqual(received.length, 1);
        assert.deepStrictEqual(received[0], { isRunning: true, taskCount: 1, phaseLabel: undefined });
      } finally {
        taskManager.removeListener(listener);
      }
    });

    test('TC-TSK-N-02: updatePhase() notifies listener with phaseLabel when task exists', () => {
      // Case ID: TC-TSK-N-02
      // Given: taskManager has 1 registered task and a listener spy
      const { runningTask } = createMockRunningTask('A');
      taskManager.register('A', 'Label', runningTask);

      const received: Array<{ isRunning: boolean; taskCount: number; phaseLabel?: string }> = [];
      const listener = (isRunning: boolean, taskCount: number, phaseLabel?: string) => {
        received.push({ isRunning, taskCount, phaseLabel });
      };
      taskManager.addListener(listener);

      try {
        // When: updatePhase("A","preparing","preparing") is called
        taskManager.updatePhase('A', 'preparing', 'preparing');

        // Then: listener receives a notification including phaseLabel="preparing"
        assert.ok(received.length >= 1);
        assert.deepStrictEqual(received[received.length - 1], { isRunning: true, taskCount: 1, phaseLabel: 'preparing' });
      } finally {
        taskManager.removeListener(listener);
      }
    });

    test('TC-TSK-E-01: updatePhase() is a no-op for missing taskId (no listener notification)', () => {
      // Case ID: TC-TSK-E-01
      // Given: taskManager has 0 tasks; a listener spy is registered
      taskManager.cancelAll();
      assert.strictEqual(taskManager.getRunningCount(), 0);

      let callCount = 0;
      const listener = () => {
        callCount += 1;
      };
      taskManager.addListener(listener);

      try {
        // When: updatePhase("missing","preparing","preparing") is called
        taskManager.updatePhase('missing', 'preparing', 'preparing');

        // Then: listener is not called and task count remains 0
        assert.strictEqual(callCount, 0);
        assert.strictEqual(taskManager.getRunningCount(), 0);
      } finally {
        taskManager.removeListener(listener);
      }
    });

    test('TC-TSK-B-01: getCurrentPhaseLabel() returns undefined when task count is 0', () => {
      // Case ID: TC-TSK-B-01
      // Given: taskManager has 0 tasks
      taskManager.cancelAll();
      assert.strictEqual(taskManager.getRunningCount(), 0);

      // When: getCurrentPhaseLabel() is called
      const label = taskManager.getCurrentPhaseLabel();

      // Then: it returns undefined
      assert.strictEqual(label, undefined);
    });

    test('TC-TSK-B-02: getCurrentPhaseLabel() returns the first task label when multiple tasks have phaseLabel (insertion order)', () => {
      // Case ID: TC-TSK-B-02
      // Given: two registered tasks in insertion order A then B, both have phaseLabel set
      const { runningTask: taskA } = createMockRunningTask('A');
      const { runningTask: taskB } = createMockRunningTask('B');
      taskManager.register('A', 'LabelA', taskA);
      taskManager.register('B', 'LabelB', taskB);
      taskManager.updatePhase('A', 'preparing', 'preparing');
      taskManager.updatePhase('B', 'generating', 'generating');

      // When: getCurrentPhaseLabel() is called
      const label = taskManager.getCurrentPhaseLabel();

      // Then: it returns "preparing" from task A
      assert.strictEqual(label, 'preparing');
    });

    test('TC-TSK-B-03: getCurrentPhaseLabel() skips empty string phaseLabel and returns the next truthy label', () => {
      // Case ID: TC-TSK-B-03
      // Given: two registered tasks in insertion order A then B; A has empty phaseLabel, B has "generating"
      const { runningTask: taskA } = createMockRunningTask('A');
      const { runningTask: taskB } = createMockRunningTask('B');
      taskManager.register('A', 'LabelA', taskA);
      taskManager.register('B', 'LabelB', taskB);
      taskManager.updatePhase('A', 'preparing', '');
      taskManager.updatePhase('B', 'generating', 'generating');

      // When: getCurrentPhaseLabel() is called
      const label = taskManager.getCurrentPhaseLabel();

      // Then: it returns "generating" (empty string is skipped)
      assert.strictEqual(label, 'generating');
    });

    test('TC-TSK-B-04: getCurrentPhaseLabel() returns whitespace phaseLabel (" ") because it is truthy', () => {
      // Case ID: TC-TSK-B-04
      // Given: two registered tasks in insertion order A then B; A has phaseLabel=" " (whitespace), B has "generating"
      const { runningTask: taskA } = createMockRunningTask('A');
      const { runningTask: taskB } = createMockRunningTask('B');
      taskManager.register('A', 'LabelA', taskA);
      taskManager.register('B', 'LabelB', taskB);
      taskManager.updatePhase('A', 'preparing', ' ');
      taskManager.updatePhase('B', 'generating', 'generating');

      // When: getCurrentPhaseLabel() is called
      const label = taskManager.getCurrentPhaseLabel();

      // Then: it returns exactly " "
      assert.strictEqual(label, ' ');
    });

    test('TC-TSK-E-02: cancel() returns true and removes task even if runningTask.dispose throws', () => {
      // Case ID: TC-TSK-E-02
      // Given: one registered task whose dispose throws
      const throwingTask: RunningTask = {
        taskId: 'A',
        dispose: () => {
          throw new Error('dispose error');
        },
      };
      taskManager.register('A', 'Label', throwingTask);
      assert.strictEqual(taskManager.getRunningCount(), 1);

      // When: cancel("A") is called
      const result = taskManager.cancel('A');

      // Then: it returns true and the task is removed
      assert.strictEqual(result, true);
      assert.strictEqual(taskManager.getRunningCount(), 0);
    });
  });

  suite('provided perspectives table cases (TC-*-TM-*)', () => {
    type ListenerCall = { isRunning: boolean; taskCount: number; phaseLabel?: string };

    function withListenerCapture<T>(fn: (calls: ListenerCall[]) => T): T {
      const calls: ListenerCall[] = [];
      const listener = (isRunning: boolean, taskCount: number, phaseLabel?: string) => {
        calls.push({ isRunning, taskCount, phaseLabel });
      };
      taskManager.addListener(listener);
      try {
        return fn(calls);
      } finally {
        taskManager.removeListener(listener);
      }
    }

    test('TC-B-TM-01: listener observes (false,0,undefined) after register then unregister (taskCount=0)', () => {
      // Case ID: TC-B-TM-01
      // Given: No tasks registered and a listener spy is added
      taskManager.cancelAll();
      assert.strictEqual(taskManager.getRunningCount(), 0);

      // When: A notify-triggering action occurs (register then unregister)
      const { runningTask } = createMockRunningTask('tmp');
      const calls = withListenerCapture((calls) => {
        taskManager.register('tmp', 'Label', runningTask);
        taskManager.unregister('tmp');
        return calls;
      });

      // Then: At least one call observes isRunning=false, taskCount=0, phaseLabel=undefined
      assert.strictEqual(
        calls.some((c) => c.isRunning === false && c.taskCount === 0 && c.phaseLabel === undefined),
        true,
      );
    });

    test('TC-B-TM-02: listener observes (true,1,undefined) immediately after registering 1 task', () => {
      // Case ID: TC-B-TM-02
      // Given: A listener spy is added
      taskManager.cancelAll();

      // When: Exactly 1 task is registered
      const { runningTask } = createMockRunningTask('one');
      const calls = withListenerCapture((calls) => {
        taskManager.register('one', 'Label', runningTask);
        return calls;
      });

      // Then: Listener receives isRunning=true, taskCount=1, phaseLabel=undefined
      assert.strictEqual(calls.length >= 1, true);
      assert.deepStrictEqual(calls[calls.length - 1], { isRunning: true, taskCount: 1, phaseLabel: undefined });
    });

    test('TC-B-TM-03: listener observes taskCount=2 after registering 2 tasks', () => {
      // Case ID: TC-B-TM-03
      // Given: A listener spy is added
      taskManager.cancelAll();

      // When: Exactly 2 tasks are registered in insertion order
      const { runningTask: taskA } = createMockRunningTask('A');
      const { runningTask: taskB } = createMockRunningTask('B');
      const calls = withListenerCapture((calls) => {
        taskManager.register('A', 'LabelA', taskA);
        taskManager.register('B', 'LabelB', taskB);
        return calls;
      });

      // Then: Listener eventually receives taskCount=2 and isRunning=true
      assert.strictEqual(calls.some((c) => c.isRunning === true && c.taskCount === 2), true);
    });

    test('TC-B-TM-04: listener observes taskCount=1000 after registering 1000 tasks', () => {
      // Case ID: TC-B-TM-04
      // Given: A listener spy is added
      taskManager.cancelAll();

      // When: 1000 tasks are registered
      const calls = withListenerCapture((calls) => {
        for (let i = 0; i < 1000; i += 1) {
          const id = `t-${i}`;
          taskManager.register(id, `Label-${i}`, { taskId: id, dispose: () => {} });
        }
        return calls;
      });

      // Then: Listener observes isRunning=true and taskCount=1000
      assert.strictEqual(calls.some((c) => c.isRunning === true && c.taskCount === 1000), true);
    });

    test('TC-N-TM-05: updatePhase notifies listener with phaseLabel="preparing" when task exists', () => {
      // Case ID: TC-N-TM-05
      // Given: A registered task and a listener spy
      taskManager.cancelAll();
      const { runningTask } = createMockRunningTask('t1');
      taskManager.register('t1', 'Label', runningTask);

      // When: updatePhase is called
      const calls = withListenerCapture((calls) => {
        taskManager.updatePhase('t1', 'preparing', 'preparing');
        return calls;
      });

      // Then: Listener receives phaseLabel exactly "preparing"
      assert.strictEqual(calls.some((c) => c.phaseLabel === 'preparing'), true);
    });

    test('TC-E-TM-06: updatePhase is a no-op for missing taskId (no listener notification)', () => {
      // Case ID: TC-E-TM-06
      // Given: No task registered for taskId="missing" and a listener spy
      taskManager.cancelAll();

      // When: updatePhase is called for a missing taskId
      const calls = withListenerCapture((calls) => {
        taskManager.updatePhase('missing', 'preparing', 'preparing');
        return calls;
      });

      // Then: No notification is emitted
      assert.strictEqual(calls.length, 0);
    });

    test('TC-B-TM-07: updatePhase with empty phaseLabel results in listener phaseLabel=undefined', () => {
      // Case ID: TC-B-TM-07
      // Given: A registered task and a listener spy
      taskManager.cancelAll();
      const { runningTask } = createMockRunningTask('t2');
      taskManager.register('t2', 'Label', runningTask);

      // When: updatePhase is called with phaseLabel=""
      const calls = withListenerCapture((calls) => {
        taskManager.updatePhase('t2', 'preparing', '');
        return calls;
      });

      // Then: Listener receives phaseLabel as undefined (empty string is ignored by getCurrentPhaseLabel)
      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0], { isRunning: true, taskCount: 1, phaseLabel: undefined });
    });

    test('TC-B-TM-08: updatePhase with whitespace phaseLabel results in listener phaseLabel=" "', () => {
      // Case ID: TC-B-TM-08
      // Given: A registered task and a listener spy
      taskManager.cancelAll();
      const { runningTask } = createMockRunningTask('t3');
      taskManager.register('t3', 'Label', runningTask);

      // When: updatePhase is called with phaseLabel=" "
      const calls = withListenerCapture((calls) => {
        taskManager.updatePhase('t3', 'preparing', ' ');
        return calls;
      });

      // Then: Listener receives phaseLabel exactly " "
      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0], { isRunning: true, taskCount: 1, phaseLabel: ' ' });
    });

    test('TC-B-TM-09: empty taskId is a valid Map key and updatePhase notifies listener', () => {
      // Case ID: TC-B-TM-09
      // Given: A task is registered with taskId=""
      taskManager.cancelAll();
      const { runningTask } = createMockRunningTask('');
      taskManager.register('', 'Label', runningTask);

      // When: updatePhase is called for the empty-string taskId
      const calls = withListenerCapture((calls) => {
        taskManager.updatePhase('', 'preparing', 'preparing');
        return calls;
      });

      // Then: Listener receives phaseLabel="preparing"
      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0], { isRunning: true, taskCount: 1, phaseLabel: 'preparing' });
    });

    test('TC-E-TM-10: updatePhase(null as string, ...) does not throw and does not notify listeners', () => {
      // Case ID: TC-E-TM-10
      // Given: A listener spy is added (and no matching task exists for null key)
      taskManager.cancelAll();

      // When: updatePhase is called with taskId=null (runtime edge)
      const calls = withListenerCapture((calls) => {
        assert.doesNotThrow(() => {
          taskManager.updatePhase(null as unknown as string, 'preparing', 'preparing');
        });
        return calls;
      });

      // Then: No notification is emitted
      assert.strictEqual(calls.length, 0);
    });

    test('TC-E-TM-11: updatePhase(taskId, phaseLabel=null) does not throw and listener sees phaseLabel=undefined', () => {
      // Case ID: TC-E-TM-11
      // Given: A registered task and a listener spy
      taskManager.cancelAll();
      const { runningTask } = createMockRunningTask('t4');
      taskManager.register('t4', 'Label', runningTask);

      // When: updatePhase is called with phaseLabel=null (runtime edge)
      const calls = withListenerCapture((calls) => {
        assert.doesNotThrow(() => {
          taskManager.updatePhase('t4', 'preparing', null as unknown as string);
        });
        return calls;
      });

      // Then: Listener sees phaseLabel=undefined because falsy labels are not returned by getCurrentPhaseLabel()
      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0], { isRunning: true, taskCount: 1, phaseLabel: undefined });
    });

    test('TC-N-TM-12: getCurrentPhaseLabel returns the first truthy phaseLabel in insertion order', () => {
      // Case ID: TC-N-TM-12
      // Given: Two tasks are registered in insertion order A then B, both with truthy phaseLabel
      taskManager.cancelAll();
      taskManager.register('A', 'LabelA', { taskId: 'A', dispose: () => {} });
      taskManager.register('B', 'LabelB', { taskId: 'B', dispose: () => {} });
      taskManager.updatePhase('A', 'preparing', 'preparing');
      taskManager.updatePhase('B', 'generating', 'generating');

      // When: getCurrentPhaseLabel() is called
      const label = taskManager.getCurrentPhaseLabel();

      // Then: It returns the first task's label ("preparing")
      assert.strictEqual(label, 'preparing');
    });

    test('TC-N-TM-13: getCurrentPhaseLabel returns later task label when first task has no phaseLabel', () => {
      // Case ID: TC-N-TM-13
      // Given: Two tasks are registered; only the second has a truthy phaseLabel
      taskManager.cancelAll();
      taskManager.register('A', 'LabelA', { taskId: 'A', dispose: () => {} });
      taskManager.register('B', 'LabelB', { taskId: 'B', dispose: () => {} });
      taskManager.updatePhase('B', 'generating', 'generating');

      // When: getCurrentPhaseLabel() is called
      const label = taskManager.getCurrentPhaseLabel();

      // Then: It returns "generating"
      assert.strictEqual(label, 'generating');
    });

    test('TC-N-TM-14: getCurrentPhaseLabel ignores empty string and returns the next truthy label', () => {
      // Case ID: TC-N-TM-14
      // Given: Two tasks are registered; first has empty-string phaseLabel, second has a truthy phaseLabel
      taskManager.cancelAll();
      taskManager.register('A', 'LabelA', { taskId: 'A', dispose: () => {} });
      taskManager.register('B', 'LabelB', { taskId: 'B', dispose: () => {} });
      taskManager.updatePhase('A', 'preparing', '');
      taskManager.updatePhase('B', 'generating', 'generating');

      // When: getCurrentPhaseLabel() is called
      const label = taskManager.getCurrentPhaseLabel();

      // Then: It returns "generating"
      assert.strictEqual(label, 'generating');
    });
  });
});
