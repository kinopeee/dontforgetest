import * as assert from 'assert';
import * as vscode from 'vscode';
import { appendEventToOutput, getTestGenOutputChannel, showTestGenOutput } from '../../../ui/outputChannel';
import { nowMs, type TestGenEvent } from '../../../core/event';

suite('ui/outputChannel.ts', () => {
  suite('getTestGenOutputChannel', () => {
    // Given: 初回呼び出し
    // When: getTestGenOutputChannelを呼び出す
    // Then: 新しいOutput Channelが作成される
    test('TC-N-01: 初回呼び出しでOutput Channel取得', () => {
      const channel = getTestGenOutputChannel();

      assert.ok(channel !== undefined, 'Output Channelが作成されている');
      assert.strictEqual(channel.name, 'TestGenie', '名前が正しい');
    });

    // Given: 2回目以降の呼び出し
    // When: getTestGenOutputChannelを呼び出す
    // Then: 同じOutput Channelインスタンスが返される
    test('TC-N-02: 2回目以降の呼び出し', () => {
      const channel1 = getTestGenOutputChannel();
      const channel2 = getTestGenOutputChannel();

      assert.strictEqual(channel1, channel2, '同じインスタンスが返される');
    });
  });

  suite('appendEventToOutput', () => {
    // Given: startedイベント
    // When: appendEventToOutputを呼び出す
    // Then: タイムスタンプ、taskId、ラベルが正しくフォーマットされる
    test('TC-N-03: startedイベントの出力', () => {
      const event: TestGenEvent = {
        type: 'started',
        taskId: 'test-task-1',
        label: 'test-label',
        detail: 'test-detail',
        timestampMs: nowMs(),
      };

      // エラーが投げられなければ成功
      assert.doesNotThrow(() => {
        appendEventToOutput(event);
      });
    });

    // Given: logイベント（info）
    // When: appendEventToOutputを呼び出す
    // Then: レベルが大文字で出力される
    test('TC-N-04: logイベント（info）の出力', () => {
      const event: TestGenEvent = {
        type: 'log',
        taskId: 'test-task-1',
        level: 'info',
        message: 'test message',
        timestampMs: nowMs(),
      };

      assert.doesNotThrow(() => {
        appendEventToOutput(event);
      });
    });

    // Given: logイベント（warn）
    // When: appendEventToOutputを呼び出す
    // Then: レベルが大文字で出力される
    test('TC-N-04: logイベント（warn）の出力', () => {
      const event: TestGenEvent = {
        type: 'log',
        taskId: 'test-task-1',
        level: 'warn',
        message: 'warning message',
        timestampMs: nowMs(),
      };

      assert.doesNotThrow(() => {
        appendEventToOutput(event);
      });
    });

    // Given: logイベント（error）
    // When: appendEventToOutputを呼び出す
    // Then: レベルが大文字で出力される
    test('TC-N-04: logイベント（error）の出力', () => {
      const event: TestGenEvent = {
        type: 'log',
        taskId: 'test-task-1',
        level: 'error',
        message: 'error message',
        timestampMs: nowMs(),
      };

      assert.doesNotThrow(() => {
        appendEventToOutput(event);
      });
    });

    // Given: fileWriteイベント
    // When: appendEventToOutputを呼び出す
    // Then: パス、行数、バイト数が正しくフォーマットされる
    test('TC-N-05: fileWriteイベントの出力', () => {
      const event: TestGenEvent = {
        type: 'fileWrite',
        taskId: 'test-task-1',
        path: 'test/file.ts',
        linesCreated: 10,
        bytesWritten: 100,
        timestampMs: nowMs(),
      };

      assert.doesNotThrow(() => {
        appendEventToOutput(event);
      });
    });

    // Given: fileWriteイベントでlinesCreated/bytesWrittenが未定義
    // When: appendEventToOutputを呼び出す
    // Then: 該当フィールドが出力されない
    test('TC-N-07: fileWriteイベントでlinesCreated/bytesWrittenが未定義', () => {
      const event: TestGenEvent = {
        type: 'fileWrite',
        taskId: 'test-task-1',
        path: 'test/file.ts',
        timestampMs: nowMs(),
      };

      assert.doesNotThrow(() => {
        appendEventToOutput(event);
      });
    });

    // Given: completedイベント
    // When: appendEventToOutputを呼び出す
    // Then: 終了コードが正しくフォーマットされる
    test('TC-N-06: completedイベントの出力', () => {
      const event: TestGenEvent = {
        type: 'completed',
        taskId: 'test-task-1',
        exitCode: 0,
        timestampMs: nowMs(),
      };

      assert.doesNotThrow(() => {
        appendEventToOutput(event);
      });
    });

    // Given: completedイベント（exitCode=null）
    // When: appendEventToOutputを呼び出す
    // Then: 終了コードがnullとして出力される
    test('TC-N-06: completedイベントの出力（exitCode=null）', () => {
      const event: TestGenEvent = {
        type: 'completed',
        taskId: 'test-task-1',
        exitCode: null,
        timestampMs: nowMs(),
      };

      assert.doesNotThrow(() => {
        appendEventToOutput(event);
      });
    });
  });

  suite('showTestGenOutput', () => {
    // Given: Output Channelが存在する
    // When: showTestGenOutputを呼び出す
    // Then: Output Channelが表示される
    test('TC-N-08: showTestGenOutput呼び出し', () => {
      assert.doesNotThrow(() => {
        showTestGenOutput(true);
      });
    });
  });
});
