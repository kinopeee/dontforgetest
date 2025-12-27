/**
 * cursor-agent のログから、成果物に含めたくないノイズを除去する。
 *
 * 目的:
 * - ユーザー向けでない system_reminder 等のブロックを除去する
 * - event マーカー等のノイズ行を除去する
 * - 末尾空白を落とし、空行を畳み込んで読みやすくする
 *
 * 注意:
 * - 挙動互換のため、既存の `runWithArtifacts.ts` のサニタイズと同等の処理を維持する
 */
export function sanitizeAgentLogMessage(message: string): string {
  let text = message.replace(/\r\n/g, '\n');

  // <system_reminder> ... </system_reminder> ブロックはユーザー向けでないため除去
  text = text.replace(/<system_reminder>[\s\S]*?<\/system_reminder>/g, '');

  // 行単位でノイズを除去
  const rawLines = text.split('\n').map((l) => l.replace(/\s+$/g, '')); // 末尾空白を落とす
  const filtered: string[] = [];
  for (const line of rawLines) {
    const trimmed = line.trim();
    // 空行は後段で畳むため一旦残す
    if (trimmed === 'event:tool_call') {
      continue;
    }
    if (trimmed === 'system:init') {
      continue;
    }
    filtered.push(line);
  }

  // 空行を最大1つに畳む
  const collapsed: string[] = [];
  let prevBlank = false;
  for (const line of filtered) {
    const isBlank = line.trim().length === 0;
    if (isBlank) {
      if (prevBlank) {
        continue;
      }
      prevBlank = true;
      collapsed.push('');
      continue;
    }
    prevBlank = false;
    collapsed.push(line);
  }

  return collapsed.join('\n').trim();
}




