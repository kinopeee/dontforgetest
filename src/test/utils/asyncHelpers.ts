import { Readable } from 'stream';

/**
 * 指定時間待機する
 */
export async function withDelay<T>(value: T, delayMs: number): Promise<T> {
  await new Promise(resolve => setTimeout(resolve, delayMs));
  return value;
}

/**
 * ストリームの終了を待機する
 */
export async function waitForStreamEnd(stream: Readable): Promise<void> {
  return new Promise((resolve, reject) => {
    let hasEnded = false;

    const cleanup = () => {
      if (hasEnded) return;
      hasEnded = true;
      
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
    };

    const onEnd = () => {
      cleanup();
      resolve();
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    stream.once('end', onEnd);
    stream.once('error', onError);

    // すでに終了している場合のチェック
    if (stream.readableEnded) {
      cleanup();
      resolve();
    } else if (stream.destroyed) {
      cleanup();
      reject(new Error('Stream is destroyed'));
    }
  });
}

/**
 * ストリームの内容を文字列として読み込む
 */
export async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    stream.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });

    stream.on('error', reject);
  });
}

/**
 * ストリームを行ごとに処理する
 */
export async function processStreamLines(
  stream: Readable,
  processor: (line: string) => void | Promise<void>
): Promise<void> {
  let buffer = '';

  stream.on('data', (chunk) => {
    buffer += chunk.toString('utf-8');
    const lines = buffer.split('\n');
    
    // 最後の行は不完全な可能性があるので保持
    buffer = lines.pop() || '';

    for (const line of lines) {
      // 非同期処理を待機する必要がある場合は対応
      const result = processor(line);
      if (result instanceof Promise) {
        result.catch(error => {
          console.error('Error processing line:', error);
        });
      }
    }
  });

  stream.on('end', () => {
    // 最後の行を処理
    if (buffer.trim()) {
      processor(buffer);
    }
  });
}

/**
 * タイムアウト付きでPromiseを実行
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: Error = new Error(`Operation timed out after ${timeoutMs}ms`)
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * 指定回数リトライする
 */
export async function retry<T>(
  operation: () => Promise<T>,
  maxAttempts: number,
  delayMs: number = 100
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === maxAttempts) {
        break;
      }

      // 指数バックオフ
      const backoffDelay = delayMs * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }

  throw lastError!;
}

/**
 * 複数の非同期操作をバッチ処理
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 10,
  delayBetweenBatches: number = 0
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // バッチ間の遅延
    if (delayBetweenBatches > 0 && i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return results;
}
