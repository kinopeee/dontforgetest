/**
 * 軽量lexer: 文字列リテラル・コメントを除外して「コード領域のみ」のテキストを作る。
 *
 * 目的:
 * - 静的分析（testAnalyzer）でパターン検索する際、コメントや文字列内のキーワードが
 *   誤検出されるのを防ぐ。
 *
 * 設計:
 * - 入力 `content` と同じ長さの文字列を返す。
 * - 非コード領域（文字列リテラル/コメント）の文字は空白 ' ' に置き換える。
 * - 改行 '\n' は保持し、行番号対応を維持する。
 * - 完璧なJS/TSレクサーではなく、実用十分を狙う（正規表現リテラルはヒューリスティック対応）。
 */

/**
 * 文字列リテラル・テンプレートリテラル・コメントを空白に置き換えた「コード領域のみ」のテキストを生成する。
 *
 * @param content ソースコード全体
 * @returns 同じ長さの文字列（非コード領域は空白、改行は保持）
 */
export function buildCodeOnlyContent(content: string): string {
  const result: string[] = [];
  const len = content.length;

  type LexerState =
    | 'code'
    | 'lineComment'
    | 'blockComment'
    | 'singleQuote'
    | 'doubleQuote'
    | 'template'
    | 'regex';

  let state: LexerState = 'code';
  let escaped = false;
  // テンプレートリテラル内の ${...} のネスト管理用
  let templateBraceDepth = 0;
  // 正規表現の開始判定ヒューリスティック用（前の非空白文字を追跡）
  let lastNonWsChar = '';

  for (let i = 0; i < len; i++) {
    const ch = content[i];
    const next = i + 1 < len ? content[i + 1] : '';

    // 状態ごとに処理を分岐
    switch (state) {
      case 'code':
        // コード状態: 文字列・コメントの開始を検出
        if (ch === '/' && next === '/') {
          // ラインコメント開始
          result.push(' ');
          state = 'lineComment';
        } else if (ch === '/' && next === '*') {
          // ブロックコメント開始
          result.push(' ');
          state = 'blockComment';
        } else if (ch === "'") {
          // シングルクォート文字列開始
          result.push(' ');
          state = 'singleQuote';
          escaped = false;
        } else if (ch === '"') {
          // ダブルクォート文字列開始
          result.push(' ');
          state = 'doubleQuote';
          escaped = false;
        } else if (ch === '`') {
          // テンプレートリテラル開始
          result.push(' ');
          state = 'template';
          escaped = false;
          templateBraceDepth = 0;
        } else if (ch === '/' && isRegexStart(lastNonWsChar)) {
          // 正規表現リテラル開始（ヒューリスティック）
          result.push(' ');
          state = 'regex';
          escaped = false;
        } else if (ch === '\n') {
          // 改行は保持
          result.push('\n');
        } else {
          // 通常のコード文字
          result.push(ch);
          if (!/\s/.test(ch)) {
            lastNonWsChar = ch;
          }
        }
        break;

      case 'lineComment':
        // ラインコメント内: 改行まで空白に置き換え
        if (ch === '\n') {
          result.push('\n');
          state = 'code';
        } else {
          result.push(' ');
        }
        break;

      case 'blockComment':
        // ブロックコメント内: */ まで空白に置き換え
        if (ch === '\n') {
          result.push('\n');
        } else if (ch === '*' && next === '/') {
          result.push(' ');
          // 次の '/' もスキップ（次ループで処理される）
        } else if (content[i - 1] === '*' && ch === '/') {
          // '*/' の '/' の処理
          result.push(' ');
          state = 'code';
        } else {
          result.push(' ');
        }
        break;

      case 'singleQuote':
        // シングルクォート文字列内
        if (ch === '\n') {
          result.push('\n');
        } else {
          result.push(' ');
        }
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === "'") {
          state = 'code';
        }
        break;

      case 'doubleQuote':
        // ダブルクォート文字列内
        if (ch === '\n') {
          result.push('\n');
        } else {
          result.push(' ');
        }
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          state = 'code';
        }
        break;

      case 'template':
        // テンプレートリテラル内（${...} のネストを追跡）
        if (ch === '\n') {
          result.push('\n');
        } else if (templateBraceDepth > 0) {
          // ${...} 内はコードとして扱う
          result.push(ch);
          if (ch === '{') {
            templateBraceDepth++;
          } else if (ch === '}') {
            templateBraceDepth--;
          }
          if (!/\s/.test(ch)) {
            lastNonWsChar = ch;
          }
        } else {
          result.push(' ');
        }
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '$' && next === '{' && templateBraceDepth === 0) {
          // ${...} 開始
          templateBraceDepth = 1;
          result[result.length - 1] = ' '; // '$' は空白に
        } else if (ch === '`' && templateBraceDepth === 0) {
          state = 'code';
        }
        break;

      case 'regex':
        // 正規表現リテラル内
        if (ch === '\n') {
          // 正規表現は通常改行を含まない。改行があれば終了とみなす
          result.push('\n');
          state = 'code';
        } else {
          result.push(' ');
        }
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '/') {
          // フラグ部分もスキップ（簡易: 英字のみ）
          let j = i + 1;
          while (j < len && /[a-zA-Z]/.test(content[j])) {
            result.push(' ');
            j++;
          }
          i = j - 1; // ループの i++ で j になる
          state = 'code';
        }
        break;
    }
  }

  return result.join('');
}

/**
 * 正規表現リテラルの開始かどうかをヒューリスティックに判定する。
 *
 * `/` の前の非空白文字が以下の場合、正規表現の開始と見なす:
 * - `(`, `[`, `{`, `,`, `;`, `:`, `=`, `!`, `&`, `|`, `?`, `+`, `-`, `*`, `%`, `<`, `>`, `~`, `^`
 * - 行頭（`lastNonWsChar` が空）
 * - `return`, `typeof`, `void`, `delete`, `throw`, `new`, `in`, `of` などのキーワードの後
 *   （ただし、単純化のため1文字のみで判定する簡易版）
 */
function isRegexStart(lastNonWsChar: string): boolean {
  // 空文字列（行頭や開始時）は正規表現の可能性あり
  if (lastNonWsChar === '') {
    return true;
  }
  // 演算子・区切り記号の後は正規表現の可能性が高い
  const regexPrecedingChars = new Set([
    '(',
    '[',
    '{',
    ',',
    ';',
    ':',
    '=',
    '!',
    '&',
    '|',
    '?',
    '+',
    '-',
    '*',
    '%',
    '<',
    '>',
    '~',
    '^',
  ]);
  return regexPrecedingChars.has(lastNonWsChar);
}
