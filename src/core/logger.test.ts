import * as assert from 'assert';
import { LogLevel, Logger, ContextLogger, getLogger } from './logger';

// Mock VS Code API
const mockOutputChannel = {
  appendLine: (text: string) => {
    // 何もしない
  },
  clear: () => {
    // 何もしない
  },
  show: () => {
    // 何もしない
  },
  dispose: () => {
    // 何もしない
  },
};

const mockVSCode = {
  window: {
    createOutputChannel: (name: string) => mockOutputChannel,
  },
  workspace: {
    getConfiguration: () => ({
      get: (key: string, defaultValue: any) => {
        if (key === 'dontforgetest.logLevel') {
          return 'info';
        }
        return defaultValue;
      },
    }),
  },
};

suite('Logger', () => {
  let logger: Logger;

  setup(() => {
    logger = new Logger('Test');
  });

  test('ログレベルを設定できる', () => {
    logger.setLevel(LogLevel.WARN);
    assert.strictEqual(logger.getLevel(), LogLevel.WARN);
  });

  test('設定からログレベルを読み込む', () => {
    // デフォルトは INFO
    assert.strictEqual(logger.getLevel(), LogLevel.INFO);
  });

  test('DEBUG レベルですべてのログが出力される', () => {
    logger.setLevel(LogLevel.DEBUG);
    
    let debugCalled = false;
    let infoCalled = false;
    let warnCalled = false;
    let errorCalled = false;
    
    mockOutputChannel.appendLine = (text: string) => {
      if (text.includes('DEBUG')) debugCalled = true;
      if (text.includes('INFO')) infoCalled = true;
      if (text.includes('WARN')) warnCalled = true;
      if (text.includes('ERROR')) errorCalled = true;
    };
    
    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');
    
    assert.strictEqual(debugCalled, true);
    assert.strictEqual(infoCalled, true);
    assert.strictEqual(warnCalled, true);
    assert.strictEqual(errorCalled, true);
  });

  test('ERROR レベルで ERROR ログのみが出力される', () => {
    logger.setLevel(LogLevel.ERROR);
    
    let debugCalled = false;
    let infoCalled = false;
    let warnCalled = false;
    let errorCalled = false;
    
    mockOutputChannel.appendLine = (text: string) => {
      if (text.includes('DEBUG')) debugCalled = true;
      if (text.includes('INFO')) infoCalled = true;
      if (text.includes('WARN')) warnCalled = true;
      if (text.includes('ERROR')) errorCalled = true;
    };
    
    logger.debug('debug message');
    logger.info('info message');
    logger.warn('warn message');
    logger.error('error message');
    
    assert.strictEqual(debugCalled, false);
    assert.strictEqual(infoCalled, false);
    assert.strictEqual(warnCalled, false);
    assert.strictEqual(errorCalled, true);
  });

  test('ログエントリが保存される', () => {
    logger.info('test message');
    
    const entries = logger.getLogEntries();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].message, 'test message');
    assert.strictEqual(entries[0].level, LogLevel.INFO);
  });

  test('最大エントリ数を超えると古いログが削除される', () => {
    // 小さな最大数を設定するために直接プライベートプロパティを操作
    (logger as any).maxEntries = 2;
    
    logger.info('message 1');
    logger.info('message 2');
    logger.info('message 3');
    
    const entries = logger.getLogEntries();
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(entries[0].message, 'message 2');
    assert.strictEqual(entries[1].message, 'message 3');
  });

  test('clear でログがクリアされる', () => {
    logger.info('test message');
    logger.clear();
    
    const entries = logger.getLogEntries();
    assert.strictEqual(entries.length, 0);
  });

  test('エラーログにスタックトレースが含まれる', () => {
    let stackTraceIncluded = false;
    const error = new Error('test error');
    
    mockOutputChannel.appendLine = (text: string) => {
      if (text.includes('at')) {
        stackTraceIncluded = true;
      }
    };
    
    logger.error('error message', error);
    assert.strictEqual(stackTraceIncluded, true);
  });
});

suite('ContextLogger', () => {
  let contextLogger: ContextLogger;

  setup(() => {
    contextLogger = new ContextLogger();
  });

  teardown(() => {
    contextLogger.dispose();
  });

  test('同じ名前とコンテキストで同じロガーが返される', () => {
    const logger1 = contextLogger.getLogger('Test', 'context1');
    const logger2 = contextLogger.getLogger('Test', 'context1');
    
    assert.strictEqual(logger1, logger2);
  });

  test('異なるコンテキストで異なるロガーが返される', () => {
    const logger1 = contextLogger.getLogger('Test', 'context1');
    const logger2 = contextLogger.getLogger('Test', 'context2');
    
    assert.notStrictEqual(logger1, logger2);
  });

  test('すべてのロガーのレベルが設定される', () => {
    const logger1 = contextLogger.getLogger('Test1');
    const logger2 = contextLogger.getLogger('Test2');
    
    contextLogger.setLevel(LogLevel.WARN);
    
    assert.strictEqual(logger1.getLevel(), LogLevel.WARN);
    assert.strictEqual(logger2.getLevel(), LogLevel.WARN);
  });

  test('dispose ですべてのロガーが解放される', () => {
    const logger1 = contextLogger.getLogger('Test1');
    const logger2 = contextLogger.getLogger('Test2');
    
    let disposeCount = 0;
    mockOutputChannel.dispose = () => {
      disposeCount++;
    };
    
    contextLogger.dispose();
    assert.strictEqual(disposeCount, 2);
  });
});

suite('getLogger', () => {
  test('グローバルロガーからロガーを取得できる', () => {
    const logger = getLogger('Test');
    assert.ok(logger instanceof Logger);
  });

  test('コンテキスト付きでロガーを取得できる', () => {
    const logger = getLogger('Test', 'context');
    assert.ok(logger instanceof Logger);
  });
});
