/**
 * マーカーで囲まれた部分を抽出する。
 * 見つからない場合は undefined。
 */
export function extractBetweenMarkers(text: string, begin: string, end: string): string | undefined {
  const start = text.indexOf(begin);
  if (start === -1) {
    return undefined;
  }
  const afterStart = start + begin.length;
  const stop = text.indexOf(end, afterStart);
  if (stop === -1) {
    return undefined;
  }
  return text.slice(afterStart, stop).trim();
}

/**
 * 旧形式（Markdown）で抽出された観点表を、列固定のテーブルへ正規化する。
 * - 期待する列名/列順のヘッダが見つからない場合は undefined を返す（失敗扱い）
 * - 旧形式は移行期間の後方互換として残す
 */
export function coerceLegacyPerspectiveMarkdownTable(markdown: string): string | undefined {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const header = '| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |';
  const separator = '|--------|----------------------|---------------------------------------|-----------------|-------|';

  const headerIndex = lines.findIndex((l) => l.trim() === header);
  if (headerIndex === -1) {
    return undefined;
  }
  // 区切り行が続かない場合は不正とみなす
  const sepLine = lines[headerIndex + 1]?.trim() ?? '';
  if (sepLine !== separator) {
    return undefined;
  }

  const body: string[] = [];
  for (let i = headerIndex + 2; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!line.trim().startsWith('|')) {
      break;
    }
    body.push(line.trimEnd());
  }

  // 本文が空でも、ヘッダだけの表として返す（パーサ互換を維持）
  const all = [header, separator, ...body].join('\n');
  return `${all}\n`;
}

export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n... (truncated: ${text.length} chars -> ${maxChars} chars)`;
}

export function dedupeStable(paths: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of paths) {
    if (seen.has(p)) {
      continue;
    }
    seen.add(p);
    out.push(p);
  }
  return out;
}

