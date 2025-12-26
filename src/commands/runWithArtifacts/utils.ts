import { t } from '../../core/l10n';

/**
 * 観点表ヘッダ検出用キーワード（英語）
 * 旧形式のテーブルや英語ロケール環境での検出に使用
 */
const HEADER_KEYWORDS_EN = ['Case ID', 'Input', 'Expected', 'Notes'] as const;

/**
 * 観点表ヘッダ検出用キーワード（日本語）
 * 日本語ロケール環境でのヘッダ検出に使用
 */
const HEADER_KEYWORDS_JA = ['ケース', '入力', '前提', '期待', '備考'] as const;

/**
 * 全ての観点表ヘッダ検出用キーワード
 */
const ALL_HEADER_KEYWORDS = [...HEADER_KEYWORDS_EN, ...HEADER_KEYWORDS_JA] as const;

/**
 * 観点表（5列固定）の区切り行。
 * NOTE: このファイルは core/artifacts.ts に依存させないため、ここで定義する。
 */
const PERSPECTIVE_TABLE_SEPARATOR = '|---|---|---|---|---|';

/**
 * 5列テーブルのパイプ数（先頭/末尾を含めて「|」が6個）
 */
const PERSPECTIVE_TABLE_PIPE_COUNT = 6;

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
  // 現在ロケールのヘッダは core/artifacts.ts と同じキーを参照する想定。
  // 後方互換性のため「旧英語ヘッダ」は必ず許容し、
  // それ以外は「5列のヘッダっぽい行」を許容する。
  const isLikelyHeader = (line: string): boolean => {
    const trimmed = line.trim();
    if (trimmed === legacyHeaderEn) {
      return true;
    }
    // 5列（= 先頭/末尾含めてパイプが6個）で、かつヘッダらしい語が含まれる
    const pipeCount = (trimmed.match(/\|/g) ?? []).length;
    if (pipeCount !== PERSPECTIVE_TABLE_PIPE_COUNT) {
      return false;
    }
    return ALL_HEADER_KEYWORDS.some((keyword) => trimmed.includes(keyword));
  };
  const isLikelySeparator = (line: string): boolean => {
    const trimmed = line.trim();
    // 旧形式の長いダッシュ行も許容
    if (trimmed.startsWith('|--------|')) {
      const pipeCount = (trimmed.match(/\|/g) ?? []).length;
      return pipeCount === PERSPECTIVE_TABLE_PIPE_COUNT;
    }
    // 新形式: |---|---|...|---| だが、観点表は5列固定のため列数も一致していること
    if (!/^\|(?:\s*-+\s*\|)+$/.test(trimmed)) {
      return false;
    }
    const pipeCount = (trimmed.match(/\|/g) ?? []).length;
    return pipeCount === PERSPECTIVE_TABLE_PIPE_COUNT;
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
  const normalizedSeparator = PERSPECTIVE_TABLE_SEPARATOR;
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

