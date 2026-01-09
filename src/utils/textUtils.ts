/**
 * テキストを指定された最大文字数に切り詰める。
 * 切り詰めが発生した場合は、末尾に切り詰め情報を追加する。
 *
 * @param text 切り詰め対象のテキスト
 * @param maxChars 最大文字数
 * @returns 切り詰められたテキスト（または元のテキスト）
 */
export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n... (truncated: ${text.length} chars -> ${maxChars} chars)`;
}
