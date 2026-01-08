import * as vscode from 'vscode';

/**
 * クリップボードへの書き込みを抽象化する。
 *
 * VS Code API (`vscode.env.clipboard`) はテスト環境で直接モックしづらい（read-only な場合がある）ため、
 * この薄いラッパーを経由して依存性を差し替えられるようにする。
 */
export async function writeTextToClipboard(text: string): Promise<void> {
  await vscode.env.clipboard.writeText(text);
}

