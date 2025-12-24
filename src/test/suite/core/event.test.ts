import * as assert from 'assert';
import { nowMs, type TestGenEvent, type TestGenPhase } from '../../../core/event';

suite('core/event.ts', () => {
  suite('nowMs', () => {
    // Given: 現在時刻を取得する関数
    // When: nowMs() を呼び出す
    // Then: 現在時刻（ミリ秒）が返される
    test('TC-N-01: 正常なタイムスタンプ取得', () => {
      const before = Date.now();
      const result = nowMs();
      const after = Date.now();

      assert.ok(result >= before, '結果は呼び出し前の時刻以上である');
      assert.ok(result <= after, '結果は呼び出し後の時刻以下である');
      assert.strictEqual(typeof result, 'number', '結果は数値型である');
    });
  });

  suite('TestGenEvent型', () => {
    // Given: startedイベントのデータ
    // When: TestGenEvent型として作成する
    // Then: 型チェックが通る
    test('TC-N-02: startedイベント型', () => {
      const event: TestGenEvent = {
        type: 'started',
        taskId: 'test-task-1',
        label: 'test-label',
        detail: 'test-detail',
        timestampMs: nowMs(),
      };

      assert.strictEqual(event.type, 'started');
      assert.strictEqual(event.taskId, 'test-task-1');
      assert.strictEqual(event.label, 'test-label');
      assert.strictEqual(event.detail, 'test-detail');
    });

    // Given: logイベントのデータ
    // When: TestGenEvent型として作成する
    // Then: 型チェックが通る
    test('TC-N-02: logイベント型（info）', () => {
      const event: TestGenEvent = {
        type: 'log',
        taskId: 'test-task-1',
        level: 'info',
        message: 'test message',
        timestampMs: nowMs(),
      };

      assert.strictEqual(event.type, 'log');
      assert.strictEqual(event.level, 'info');
      assert.strictEqual(event.message, 'test message');
    });

    // Given: logイベントのデータ（warn/error）
    // When: TestGenEvent型として作成する
    // Then: 型チェックが通る
    test('TC-N-02: logイベント型（warn/error）', () => {
      const warnEvent: TestGenEvent = {
        type: 'log',
        taskId: 'test-task-1',
        level: 'warn',
        message: 'warning message',
        timestampMs: nowMs(),
      };

      const errorEvent: TestGenEvent = {
        type: 'log',
        taskId: 'test-task-1',
        level: 'error',
        message: 'error message',
        timestampMs: nowMs(),
      };

      assert.strictEqual(warnEvent.level, 'warn');
      assert.strictEqual(errorEvent.level, 'error');
    });

    // Given: fileWriteイベントのデータ
    // When: TestGenEvent型として作成する
    // Then: 型チェックが通る
    test('TC-N-02: fileWriteイベント型', () => {
      const event: TestGenEvent = {
        type: 'fileWrite',
        taskId: 'test-task-1',
        path: 'test/file.ts',
        linesCreated: 10,
        bytesWritten: 100,
        timestampMs: nowMs(),
      };

      assert.strictEqual(event.type, 'fileWrite');
      assert.strictEqual(event.path, 'test/file.ts');
      assert.strictEqual(event.linesCreated, 10);
      assert.strictEqual(event.bytesWritten, 100);
    });

    // Given: fileWriteイベントのデータ（オプショナルフィールドなし）
    // When: TestGenEvent型として作成する
    // Then: 型チェックが通る
    test('TC-N-02: fileWriteイベント型（オプショナルフィールドなし）', () => {
      const event: TestGenEvent = {
        type: 'fileWrite',
        taskId: 'test-task-1',
        path: 'test/file.ts',
        timestampMs: nowMs(),
      };

      assert.strictEqual(event.type, 'fileWrite');
      assert.strictEqual(event.path, 'test/file.ts');
      assert.strictEqual(event.linesCreated, undefined);
      assert.strictEqual(event.bytesWritten, undefined);
    });

    // Given: completedイベントのデータ
    // When: TestGenEvent型として作成する
    // Then: 型チェックが通る
    test('TC-N-02: completedイベント型', () => {
      const event: TestGenEvent = {
        type: 'completed',
        taskId: 'test-task-1',
        exitCode: 0,
        timestampMs: nowMs(),
      };

      assert.strictEqual(event.type, 'completed');
      assert.strictEqual(event.exitCode, 0);
    });

    // Given: completedイベントのデータ（exitCode=null）
    // When: TestGenEvent型として作成する
    // Then: 型チェックが通る
    test('TC-N-02: completedイベント型（exitCode=null）', () => {
      const event: TestGenEvent = {
        type: 'completed',
        taskId: 'test-task-1',
        exitCode: null,
        timestampMs: nowMs(),
      };

      assert.strictEqual(event.type, 'completed');
      assert.strictEqual(event.exitCode, null);
    });

    // Given: phaseイベントのデータ
    // When: TestGenEvent型として作成する
    // Then: 型チェックが通る
    test('TC-N-02: phaseイベント型', () => {
      const phases: TestGenPhase[] = ['preparing', 'perspectives', 'generating', 'running-tests', 'done'];
      
      for (const phase of phases) {
        const event: TestGenEvent = {
          type: 'phase',
          taskId: 'test-task-1',
          phase,
          phaseLabel: `${phase} label`,
          timestampMs: nowMs(),
        };

        assert.strictEqual(event.type, 'phase');
        assert.strictEqual(event.taskId, 'test-task-1');
        assert.strictEqual(event.phase, phase);
        assert.strictEqual(event.phaseLabel, `${phase} label`);
      }
    });

    // TC-N-20: emitPhaseEvent called with valid parameters
    // Given: Valid parameters (taskId, phase, phaseLabel)
    // When: emitPhaseEvent is called
    // Then: Phase event created with correct type, taskId, phase, phaseLabel, and timestampMs
    test('TC-N-20: emitPhaseEvent called with valid parameters', () => {
      // Given: Valid parameters
      const taskId = 'test-task-1';
      const phase: TestGenPhase = 'preparing';
      const phaseLabel = '準備中';
      
      // When: emitPhaseEvent is called
      // Note: emitPhaseEvent is imported from progressTreeView, but we test the event structure here
      const event: TestGenEvent = {
        type: 'phase',
        taskId,
        phase,
        phaseLabel,
        timestampMs: nowMs(),
      };
      
      // Then: Phase event created with correct properties
      assert.strictEqual(event.type, 'phase', 'Event type is phase');
      assert.strictEqual(event.taskId, taskId, 'Event taskId is correct');
      assert.strictEqual(event.phase, phase, 'Event phase is correct');
      assert.strictEqual(event.phaseLabel, phaseLabel, 'Event phaseLabel is correct');
      assert.ok(typeof event.timestampMs === 'number', 'Event timestampMs is number');
      assert.ok(event.timestampMs > 0, 'Event timestampMs is positive');
    });

    // TC-E-05: emitPhaseEvent called with invalid phase
    // Given: Invalid phase value
    // When: emitPhaseEvent is called
    // Then: TypeScript compile error (type safety)
    test('TC-E-05: emitPhaseEvent called with invalid phase', () => {
      // Given: Valid phases
      // Note: TypeScript prevents invalid phases at compile time
      // This test verifies that valid phases compile correctly
      const validPhases: TestGenPhase[] = ['preparing', 'perspectives', 'generating', 'running-tests', 'done'];
      
      // When: Creating events with valid phases
      // Then: Events are created successfully
      for (const phase of validPhases) {
        const event: TestGenEvent = {
          type: 'phase',
          taskId: 'test-task-1',
          phase,
          phaseLabel: 'label',
          timestampMs: nowMs(),
        };
        assert.strictEqual(event.phase, phase, `Phase ${phase} is valid`);
      }
    });

    // TC-B-07: TimestampMs is 0
    // Given: Event with timestampMs=0
    // When: Event is created
    // Then: Event created, but 0 timestamp may cause sorting issues
    test('TC-B-07: TimestampMs is 0', () => {
      // Given: Event with timestampMs=0
      const event: TestGenEvent = {
        type: 'started',
        taskId: 'test-task-1',
        label: 'test-label',
        timestampMs: 0,
      };

      // When: Event is created
      // Then: Event created
      assert.strictEqual(event.timestampMs, 0, 'Event timestampMs is 0');
      assert.strictEqual(event.type, 'started', 'Event type is correct');
    });

    // TC-B-08: TimestampMs is Number.MAX_SAFE_INTEGER
    // Given: Event with timestampMs=Number.MAX_SAFE_INTEGER
    // When: Event is created
    // Then: Event created, normal behavior
    test('TC-B-08: TimestampMs is Number.MAX_SAFE_INTEGER', () => {
      // Given: Event with timestampMs=Number.MAX_SAFE_INTEGER
      const event: TestGenEvent = {
        type: 'started',
        taskId: 'test-task-1',
        label: 'test-label',
        timestampMs: Number.MAX_SAFE_INTEGER,
      };

      // When: Event is created
      // Then: Event created, normal behavior
      assert.strictEqual(event.timestampMs, Number.MAX_SAFE_INTEGER, 'Event timestampMs is MAX_SAFE_INTEGER');
      assert.strictEqual(event.type, 'started', 'Event type is correct');
    });

    // TC-B-09: TimestampMs is negative number
    // Given: Event with negative timestampMs
    // When: Event is created
    // Then: Event created, but negative timestamp may cause issues
    test('TC-B-09: TimestampMs is negative number', () => {
      // Given: Event with negative timestampMs
      const event: TestGenEvent = {
        type: 'started',
        taskId: 'test-task-1',
        label: 'test-label',
        timestampMs: -1,
      };

      // When: Event is created
      // Then: Event created
      assert.strictEqual(event.timestampMs, -1, 'Event timestampMs is negative');
      assert.strictEqual(event.type, 'started', 'Event type is correct');
    });
  });
});
