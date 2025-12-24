import * as vscode from 'vscode';
import { TestGenEvent } from '../core/event';

let channel: vscode.OutputChannel | undefined;
const maxLogChars = 4_000;

/**
 * テスト生成のログを集約するOutput Channelを取得する。
 */
export function getTestGenOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Dontforgetest');
  }
  return channel;
}

/**
 * Output Channelを表示する。
 */
export function showTestGenOutput(preserveFocus: boolean = true): void {
  getTestGenOutputChannel().show(preserveFocus);
}

/**
 * Providerから受け取ったイベントをOutput Channelへ整形して出力する。
 */
export function appendEventToOutput(event: TestGenEvent): void {
  const out = getTestGenOutputChannel();
  const timestamp = new Date(event.timestampMs).toISOString();

  switch (event.type) {
    case 'started':
      out.appendLine(`[${timestamp}] [${event.taskId}] START ${event.label}${event.detail ? ` (${event.detail})` : ''}`);
      break;
    case 'log':
      out.appendLine(`[${timestamp}] [${event.taskId}] ${event.level.toUpperCase()} ${truncate(event.message, maxLogChars)}`);
      break;
    case 'fileWrite':
      out.appendLine(
        `[${timestamp}] [${event.taskId}] WRITE ${event.path}` +
          `${event.linesCreated !== undefined ? ` lines=${event.linesCreated}` : ''}` +
          `${event.bytesWritten !== undefined ? ` bytes=${event.bytesWritten}` : ''}`,
      );
      break;
    case 'completed':
      out.appendLine(`[${timestamp}] [${event.taskId}] DONE exit=${event.exitCode ?? 'null'}`);
      break;
    default: {
      // 型安全のため。将来型が増えたときにコンパイルエラーで検知する。
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _exhaustive: never = event;
      break;
    }
  }
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n... (truncated: ${text.length} chars -> ${maxChars} chars)`;
}

