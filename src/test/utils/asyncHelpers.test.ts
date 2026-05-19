import * as assert from 'assert';
import { withDelay, waitForStreamEnd, streamToString, withTimeout, retry } from './asyncHelpers';
import { Readable } from 'stream';

suite('Async Helpers', () => {
  test('withDelay は指定時間待機する', async () => {
    const startTime = Date.now();
    const result = await withDelay('test', 100);
    const elapsed = Date.now() - startTime;

    assert.strictEqual(result, 'test');
    assert.ok(elapsed >= 100, `Expected at least 100ms delay, got ${elapsed}ms`);
  });

  test('waitForStreamEnd はストリームの終了を待つ', async () => {
    const stream = new Readable({
      read() {
        setTimeout(() => {
          this.push('data');
          this.push(null);
        }, 50);
      },
    });

    const startTime = Date.now();
    await waitForStreamEnd(stream);
    const elapsed = Date.now() - startTime;

    assert.ok(elapsed >= 50, `Expected at least 50ms delay, got ${elapsed}ms`);
  });

  test('streamToString はストリームを文字列に変換', async () => {
    const stream = Readable.from(['line1\n', 'line2\n', 'line3']);
    const result = await streamToString(stream);

    assert.strictEqual(result, 'line1\nline2\nline3');
  });

  test('withTimeout はタイムアウト時にエラーを投げる', async () => {
    const promise = new Promise(resolve => setTimeout(resolve, 1000));
    
    await assert.rejects(
      () => withTimeout(promise, 100),
      /Operation timed out after 100ms/
    );
  });

  test('withTimeout は成功時に結果を返す', async () => {
    const promise = Promise.resolve('success');
    const result = await withTimeout(promise, 100);
    
    assert.strictEqual(result, 'success');
  });

  test('retry は成功時に結果を返す', async () => {
    let attempts = 0;
    const operation = async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Failed');
      }
      return 'success';
    };

    const result = await retry(operation, 3);
    assert.strictEqual(result, 'success');
    assert.strictEqual(attempts, 3);
  });

  test('retry は最大回数失敗時にエラーを投げる', async () => {
    const operation = async () => {
      throw new Error('Always fails');
    };

    await assert.rejects(
      () => retry(operation, 3),
      /Always fails/
    );
  });
});
