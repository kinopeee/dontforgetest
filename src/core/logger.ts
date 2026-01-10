import * as vscode from 'vscode';

/**
 * ログレベル
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * ログレベルの文字列表現
 */
const LogLevelNames: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.NONE]: 'NONE',
};

/**
 * ログエントリ
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: string;
  error?: Error;
}

/**
 * ロガーインターフェース
 */
export interface ILogger {
  debug(message: string, context?: string): void;
  info(message: string, context?: string): void;
  warn(message: string, context?: string): void;
  error(message: string, error?: Error, context?: string): void;
}

/**
 * VS Code Output Channel を使用したロガー実装
 */
export class Logger implements ILogger {
  private outputChannel: vscode.OutputChannel;
  private currentLevel: LogLevel = LogLevel.INFO;
  private logEntries: LogEntry[] = [];
  private maxEntries: number = 1000;

  constructor(name: string, private context?: string) {
    this.outputChannel = vscode.window.createOutputChannel(`Dontforgetest: ${name}`);
    this.loadLogLevel();
  }

  /**
   * ログレベルを設定
   */
  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  /**
   * 現在のログレベルを取得
   */
  getLevel(): LogLevel {
    return this.currentLevel;
  }

  /**
   * 設定からログレベルを読み込み
   */
  private loadLogLevel(): void {
    const config = vscode.workspace.getConfiguration('dontforgetest');
    const levelStr = config.get<string>('logLevel', 'info');
    
    switch (levelStr.toLowerCase()) {
      case 'debug':
        this.currentLevel = LogLevel.DEBUG;
        break;
      case 'info':
        this.currentLevel = LogLevel.INFO;
        break;
      case 'warn':
        this.currentLevel = LogLevel.WARN;
        break;
      case 'error':
        this.currentLevel = LogLevel.ERROR;
        break;
      case 'none':
        this.currentLevel = LogLevel.NONE;
        break;
      default:
        this.currentLevel = LogLevel.INFO;
    }
  }

  /**
   * ログエントリを保存
   */
  private saveEntry(entry: LogEntry): void {
    this.logEntries.push(entry);
    
    // 最大エントリ数を超えた場合は古いものを削除
    if (this.logEntries.length > this.maxEntries) {
      this.logEntries = this.logEntries.slice(-this.maxEntries);
    }
  }

  /**
   * ログを出力
   */
  private log(level: LogLevel, message: string, error?: Error): void {
    if (level < this.currentLevel) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context: this.context,
      error,
    };

    this.saveEntry(entry);

    // フォーマットして出力
    const timestamp = entry.timestamp.toISOString();
    const levelName = LogLevelNames[level];
    const contextStr = entry.context ? `[${entry.context}] ` : '';
    const messageStr = `${timestamp} ${levelName} ${contextStr}${message}`;

    this.outputChannel.appendLine(messageStr);

    // エラーの場合はスタックトレースも出力
    if (error && error.stack) {
      this.outputChannel.appendLine(error.stack);
    }
  }

  debug(message: string, context?: string): void {
    this.log(LogLevel.DEBUG, message);
  }

  info(message: string, context?: string): void {
    this.log(LogLevel.INFO, message);
  }

  warn(message: string, context?: string): void {
    this.log(LogLevel.WARN, message);
  }

  error(message: string, error?: Error, context?: string): void {
    this.log(LogLevel.ERROR, message, error);
  }

  /**
   * 保存されているログエントリを取得
   */
  getLogEntries(): LogEntry[] {
    return [...this.logEntries];
  }

  /**
   * ログをクリア
   */
  clear(): void {
    this.logEntries = [];
    this.outputChannel.clear();
  }

  /**
   * Output Channel を表示
   */
  show(): void {
    this.outputChannel.show();
  }

  /**
   * リソースを解放
   */
  dispose(): void {
    this.outputChannel.dispose();
  }
}

/**
 * コンテキスト別ロガー
 */
export class ContextLogger {
  private loggers: Map<string, Logger> = new Map();
  private globalLevel: LogLevel = LogLevel.INFO;

  /**
   * コンテキスト付きロガーを取得
   */
  getLogger(name: string, context?: string): Logger {
    const key = `${name}:${context || ''}`;
    
    let logger = this.loggers.get(key);
    if (!logger) {
      logger = new Logger(name, context);
      logger.setLevel(this.globalLevel);
      this.loggers.set(key, logger);
    }
    
    return logger;
  }

  /**
   * すべてのロガーのレベルを設定
   */
  setLevel(level: LogLevel): void {
    this.globalLevel = level;
    for (const logger of this.loggers.values()) {
      logger.setLevel(level);
    }
  }

  /**
   * すべてのロガーをクリア
   */
  clear(): void {
    for (const logger of this.loggers.values()) {
      logger.clear();
    }
  }

  /**
   * すべてのロガーを解放
   */
  dispose(): void {
    for (const logger of this.loggers.values()) {
      logger.dispose();
    }
    this.loggers.clear();
  }
}

// グローバルロガーインスタンス
export const rootLogger = new ContextLogger();

/**
 * デフォルトロガーを取得
 */
export function getLogger(name: string, context?: string): Logger {
  return rootLogger.getLogger(name, context);
}

/**
 * 主要なコンテキスト用のロガー
 */
export const extensionLogger = getLogger('Extension');
export const providerLogger = getLogger('Provider');
export const commandLogger = getLogger('Command');
export const gitLogger = getLogger('Git');
export const testLogger = getLogger('Test');
