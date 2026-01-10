/**
 * 軽量な字句解析器で文字列リテラルを検出する
 *
 * @param text 解析対象のテキスト
 * @returns 文字列リテラルの開始位置と終了位置の配列
 */
function findStringLiterals(text: string): { start: number; end: number }[] {
  const literals: { start: number; end: number }[] = [];
  let inString = false;
  let stringStart = 0;
  let escapeNext = false;
  let quoteChar = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true;
      stringStart = i;
      quoteChar = char;
    } else if (inString && char === quoteChar) {
      inString = false;
      literals.push({ start: stringStart, end: i });
    }
  }

  return literals;
}

/**
 * 文字列リテラルを空白に置換する
 *
 * @param text 元のテキスト
 * @param 文字列リテラルの位置情報
 * @returns 文字列リテラルが空白化されたテキスト
 */
function replaceStringLiterals(text: string, literals: { start: number; end: number }[]): string {
  let result = '';
  let lastIndex = 0;

  for (const literal of literals) {
    result += text.substring(lastIndex, literal.start);
    result += ' '.repeat(literal.end - literal.start + 1);
    lastIndex = literal.end + 1;
  }

  result += text.substring(lastIndex);
  return result;
}

/**
 * コメントを削除する
 *
 * @param text 元のテキスト
 * @returns コメントが削除されたテキスト
 */
function removeComments(text: string): string {
  // 行コメントを削除
  let result = text.replace(/\/\/.*$/gm, '');
  
  // ブロックコメントを削除
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  
  return result;
}

/**
 * ソースコードから文字列リテラルとコメントを除いたコードのみを抽出する
 *
 * @param content 元のソースコード
 * @returns 文字列リテラルとコメントを除いたコード
 */
export function extractCodeOnlyContent(content: string): string {
  // 文字列リテラルを検出
  const stringLiterals = findStringLiterals(content);
  
  // 文字列リテラルを空白に置換
  let codeOnly = replaceStringLiterals(content, stringLiterals);
  
  // コメントを削除
  codeOnly = removeComments(codeOnly);
  
  return codeOnly;
}

/**
 * コード内に空の文字列リテラルが含まれるかチェックする
 *
 * @param content 元のソースコード
 * @returns 空の文字列リテラルが存在する場合 true
 */
export function hasEmptyStringLiteralInCode(content: string): boolean {
  const patterns = [
    /''/g,
    /""/g,
    /``/g,
  ];

  for (const pattern of patterns) {
    if (pattern.test(content)) {
      return true;
    }
  }

  return false;
}

/**
 * 文字列が正規表現の開始パターンかチェックする
 *
 * @param text チェック対象のテキスト
 * @returns 正規表現の開始パターンの場合 true
 */
export function isRegexStart(text: string): boolean {
  return text === '/' || text.startsWith('/[') || text.startsWith('/\\');
}
