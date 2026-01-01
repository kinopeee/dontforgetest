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

  type ResumeState = 'code' | 'template';

  type TemplateContext = {
    /** `${...}` の `{` ネスト深さ（`${` 開始時点で 1） */
    braceDepth: number;
    /** テンプレート文字列部分でのエスケープ（\` など） */
    escaped: boolean;
    /** 対応する `...` を閉じたときに戻る状態 */
    resumeState: ResumeState;
  };

  let state: LexerState = 'code';
  let escaped = false;
  // 文字列/コメント/正規表現から復帰する状態
  let resumeState: ResumeState = 'code';
  // テンプレートリテラルのネスト管理用（`...` ごとに braceDepth を保持）
  const templateStack: TemplateContext[] = [];
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
          resumeState = 'code';
        } else if (ch === '/' && next === '*') {
          // ブロックコメント開始
          result.push(' ');
          state = 'blockComment';
          resumeState = 'code';
        } else if (ch === "'") {
          // シングルクォート文字列開始
          result.push(' ');
          state = 'singleQuote';
          escaped = false;
          resumeState = 'code';
        } else if (ch === '"') {
          // ダブルクォート文字列開始
          result.push(' ');
          state = 'doubleQuote';
          escaped = false;
          resumeState = 'code';
        } else if (ch === '`') {
          // テンプレートリテラル開始
          result.push(' ');
          state = 'template';
          templateStack.push({ braceDepth: 0, escaped: false, resumeState: 'code' });
        } else if (ch === '/' && isRegexStart(lastNonWsChar)) {
          // 正規表現リテラル開始（ヒューリスティック）
          result.push(' ');
          state = 'regex';
          escaped = false;
          resumeState = 'code';
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
          state = resumeState;
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
          state = resumeState;
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
          state = resumeState;
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
          state = resumeState;
        }
        break;

      case 'template':
        // テンプレートリテラル内（ネスト対応。templateStack の先頭が現在の `...`）
        {
          const ctx = templateStack.length > 0 ? templateStack[templateStack.length - 1] : undefined;
          if (!ctx) {
            // 異常系（スタック不整合）: 安全側でコードに戻す
            state = 'code';
            result.push(ch === '\n' ? '\n' : ' ');
            break;
          }

          // 1) `${...}` の外側（テンプレート文字列部分）
          if (ctx.braceDepth === 0) {
            if (ch === '\n') {
              result.push('\n');
            } else {
              result.push(' ');
            }

            if (ctx.escaped) {
              ctx.escaped = false;
              break;
            }
            if (ch === '\\') {
              ctx.escaped = true;
              break;
            }

            if (ch === '$' && next === '{') {
              // ${...} 開始
              // NOTE:
              // - "${" の "{" を次ループでカウントしてしまうと二重カウントになる。
              // - ここで開始ブレース分を braceDepth=1 として反映し、
              //   次の "{" はテンプレート構文として空白にしてスキップする。
              ctx.braceDepth = 1;
              result[result.length - 1] = ' '; // '$' は空白に（明示）
              result.push(' '); // '{' は空白に（テンプレート構文）
              i++; // '{' をスキップして二重カウントを防ぐ
              break;
            }

            if (ch === '`') {
              // テンプレートリテラル終了
              templateStack.pop();
              state = ctx.resumeState;
              break;
            }

            break;
          }

          // 2) `${...}` の内側（式部分）: 基本的に code と同様に扱うが、式の終端 `}` は空白化する
          if (ch === '/' && next === '/') {
            result.push(' ');
            state = 'lineComment';
            resumeState = 'template';
            break;
          }
          if (ch === '/' && next === '*') {
            result.push(' ');
            state = 'blockComment';
            resumeState = 'template';
            break;
          }
          if (ch === "'") {
            result.push(' ');
            state = 'singleQuote';
            escaped = false;
            resumeState = 'template';
            break;
          }
          if (ch === '"') {
            result.push(' ');
            state = 'doubleQuote';
            escaped = false;
            resumeState = 'template';
            break;
          }
          if (ch === '`') {
            // ネストしたテンプレートリテラル開始
            result.push(' ');
            templateStack.push({ braceDepth: 0, escaped: false, resumeState: 'template' });
            state = 'template';
            break;
          }
          if (ch === '/' && isRegexStart(lastNonWsChar)) {
            result.push(' ');
            state = 'regex';
            escaped = false;
            resumeState = 'template';
            break;
          }
          if (ch === '\n') {
            result.push('\n');
            break;
          }

          if (ch === '{') {
            ctx.braceDepth++;
            result.push('{');
            lastNonWsChar = '{';
            break;
          }
          if (ch === '}') {
            ctx.braceDepth--;
            if (ctx.braceDepth === 0) {
              // `${...}` の閉じ `}` はテンプレート構文なので空白化する（ブレースカウントの整合性維持）
              result.push(' ');
            } else {
              result.push('}');
              lastNonWsChar = '}';
            }
            break;
          }

          // 通常のコード文字
          result.push(ch);
          if (!/\s/.test(ch)) {
            lastNonWsChar = ch;
          }
        }
        break;

      case 'regex':
        // 正規表現リテラル内
        if (ch === '\n') {
          // 正規表現は通常改行を含まない。改行があれば終了とみなす
          result.push('\n');
          state = resumeState;
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
          state = resumeState;
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
