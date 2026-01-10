import { type TestFunction } from '../analysis/types';

/**
 * テスト関数の直前にあるコメントブロックの開始行を探す
 *
 * Given/When/Then コメントがテスト関数の直前に配置されている場合に対応するため、
 * テスト関数の開始行から逆方向に走査して、連続するコメント行を含める。
 *
 * @param lines 元のソースコードの行配列
 * @param testLineIndex テスト関数の開始行インデックス（0-based）
 * @returns コメントブロックを含む開始行インデックス（0-based）
 */
function findLeadingCommentStart(lines: string[], testLineIndex: number): number {
  let startIndex = testLineIndex;
  
  for (let i = testLineIndex - 1; i >= 0; i--) {
    const line = lines[i].trim();
    
    // 空行はスキップして継続
    if (line === '') {
      continue;
    }
    
    // コメント行（// または /* ... */）の場合は含める
    if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') || line.endsWith('*/')) {
      startIndex = i;
      continue;
    }
    
    // コメント以外の行に到達したら終了
    break;
  }
  
  return startIndex;
}

/**
 * 関数の終了行を探す（ブレースのバランスで判定）
 *
 * @param codeOnlyLines codeOnlyContent を行分割したもの（文字列/コメント除外済み）
 * @param startIndex 開始行インデックス
 */
function findFunctionEnd(codeOnlyLines: string[], startIndex: number): number {
  let braceCount = 0;
  let started = false;

  for (let i = startIndex; i < codeOnlyLines.length; i++) {
    const line = codeOnlyLines[i];

    for (const char of line) {
      if (char === '{') {
        braceCount++;
        started = true;
      } else if (char === '}') {
        braceCount--;
      }
    }

    if (started && braceCount === 0) {
      return i + 1;
    }
  }

  return codeOnlyLines.length;
}

/**
 * テスト関数を抽出する
 *
 * NOTE: codeOnlyContent では文字列リテラルが空白化されているため、
 * テスト名の抽出は元の content から行う必要がある。
 * codeOnlyLines で test( / it( の開始を検出し、元の lines からテスト名を取得する。
 *
 * @param content 元のソースコード
 * @param codeOnlyContent コメントと文字列リテラルを除いたコード
 * @returns 抽出されたテスト関数のリスト
 */
export function extractTestFunctions(content: string, codeOnlyContent: string): TestFunction[] {
  const testFunctions: TestFunction[] = [];
  const lines = content.split('\n');
  const codeOnlyLines = codeOnlyContent.split('\n');

  // test() または it() の開始を検出（codeOnlyLines でマッチし、元の content から名前を取得）
  const testStartPattern = /^\s*(?:test|it)\s*\(/;

  for (let i = 0; i < codeOnlyLines.length; i++) {
    const codeOnlyLine = codeOnlyLines[i];
    const match = testStartPattern.exec(codeOnlyLine);
    if (match) {
      // 元の content から実際のテスト名を取得
      const originalLine = lines[i];
      const nameMatch = /^\s*(?:test|it)\s*\(\s*(['"`])(.+?)\1/.exec(originalLine);
      const testName = nameMatch ? nameMatch[2] : '<unknown>';
      const startLine = i + 1; // 1始まり

      // テスト関数の終了を探す（codeOnlyLines を使ってブレースカウント）
      const endLine = findFunctionEnd(codeOnlyLines, i);

      // 先行するコメントブロックを含めた開始行を探す
      const leadingCommentStartIndex = findLeadingCommentStart(lines, i);

      // 元のソースコードから該当部分を抽出（先行コメントを含む）
      const originalLines = lines.slice(leadingCommentStartIndex, endLine);
      const originalContent = originalLines.join('\n');

      testFunctions.push({
        name: testName,
        startLine,
        endLine,
        content: codeOnlyLines.slice(startLine - 1, endLine).join('\n'),
        originalContent,
      });
    }
  }

  return testFunctions;
}
