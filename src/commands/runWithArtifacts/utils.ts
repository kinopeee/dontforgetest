import { t } from '../../core/l10n';

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
  // 旧形式は英語固定のヘッダ/区切り行を想定していたが、実行時言語に合わせた出力（日本語等）も許容する。
  // - 英語固定の旧ヘッダ（過去互換）
  // - 現在ロケールのヘッダ（新仕様: 実行時言語）
  const legacyHeaderEn = '| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |';
  // 現在ロケールのヘッダは core/artifacts.ts と同じキーを参照する想定だが、
  // この utils.ts は core に依存させないため、現状は「旧英語ヘッダ」だけは必ず許容し、
  // それ以外は「5列のヘッダっぽい行」を許容する。
  const isLikelyHeader = (line: string): boolean => {
    const trimmed = line.trim();
    if (trimmed === legacyHeaderEn) {
      return true;
    }
    // 5列（= 先頭/末尾含めてパイプが6個以上）で、かつヘッダらしい語が含まれる
    const pipeCount = (trimmed.match(/\|/g) ?? []).length;
    if (pipeCount < 6) {
      return false;
    }
    return (
      trimmed.includes('Case ID') ||
      trimmed.includes('Input') ||
      trimmed.includes('Expected') ||
      trimmed.includes('Notes') ||
      trimmed.includes('ケース') ||
      trimmed.includes('入力') ||
      trimmed.includes('前提') ||
      trimmed.includes('期待') ||
      trimmed.includes('備考')
    );
  };
  const isLikelySeparator = (line: string): boolean => {
    const trimmed = line.trim();
    // 旧形式の長いダッシュ行も許容
    if (trimmed.startsWith('|--------|')) {
      const pipeCount = (trimmed.match(/\|/g) ?? []).length;
      return pipeCount >= 6;
    }
    // 新形式: |---|---|---|---|---|
    return /^\|\s*-+\s*\|\s*-+\s*\|\s*-+\s*\|\s*-+\s*\|\s*-+\s*\|$/.test(trimmed);
  };

  const headerIndex = lines.findIndex((l) => isLikelyHeader(l));
  if (headerIndex === -1) {
    return undefined;
  }
  // 区切り行が続かない場合は不正とみなす
  const sepLine = lines[headerIndex + 1]?.trim() ?? '';
  if (!isLikelySeparator(sepLine)) {
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
  // NOTE:
  // - ヘッダは実行時言語（VS Code の表示言語）に合わせる
  // - 区切り行は Markdown として成立すれば良いので短い形へ正規化する
  const normalizedHeader = t('artifact.perspectiveTable.tableHeader');
  const normalizedSeparator = '|---|---|---|---|---|';
  const all = [normalizedHeader, normalizedSeparator, ...body].join('\n');
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

