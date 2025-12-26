import * as vscode from 'vscode';

/**
 * UI文言の翻訳（vscode.l10n.t のラッパー）
 *
 * VS Code の表示言語に応じて自動的に翻訳された文字列を返す。
 * 未対応言語の場合はデフォルト（英語）にフォールバックする。
 */
export function t(message: string, ...args: Array<string | number | boolean>): string {
  return vscode.l10n.t(message, ...args);
}

/**
 * 生成物（観点表/実行レポート）の言語を取得
 *
 * VS Code の表示言語に追従し、未対応言語は英語にフォールバックする。
 *
 * @returns 'ja' | 'en'
 */
export function getArtifactLocale(): 'ja' | 'en' {
  const lang = vscode.env.language;
  if (lang.startsWith('ja')) {
    return 'ja';
  }
  return 'en'; // fallback
}
