import * as assert from 'assert';
import { nowMs, type TestGenEvent } from '../../../core/event';

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
  });
});
