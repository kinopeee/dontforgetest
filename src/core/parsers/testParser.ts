import * as vscode from 'vscode';
import { type TestFunction } from '../analysis/types';

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
 * 指定行より前のコメント行を収集する（逆順で返す）
 *
 * @param lines 元のソースコードを行分割したもの
 * @param startIndex 収集開始行インデックス（この行は含まない）
 * @returns 収集したコメント行の配列
 */
function collectPrecedingCommentLines(lines: string[], startIndex: number): string[] {
  const collected: string[] = [];

  for (let i = startIndex - 1; i >= 0; i--) {
    const line = lines[i];
    const trimmed = line.trim();

    // 空行は無視
    if (trimmed === '') {
      continue;
    }

    const isLineComment = trimmed.startsWith('//');
    const isBlockCommentFragment =
      trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('*/');
    if (!isLineComment && !isBlockCommentFragment) {
      break;
    }
    collected.push(line);
  }
  return collected.reverse();
}

/**
 * テスト関数を抽出する
 *
 * @param content 元のソースコード
 * @param codeOnlyContent コメントと文字列リテラルを除いたコード
 * @returns 抽出されたテスト関数のリスト
 */
export function extractTestFunctions(content: string, codeOnlyContent: string): TestFunction[] {
  const testFunctions: TestFunction[] = [];
  const lines = content.split('\n');
  const codeOnlyLines = codeOnlyContent.split('\n');

  // テスト関数のパターン（test/it/describe で始まる関数）
  const testPatterns = [
    /\b(test)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /\b(it)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /\b(describe)\s*\(\s*['"`]([^'"`]+)['"`]/g,
  ];

  for (const pattern of testPatterns) {
    let match;
    while ((match = pattern.exec(codeOnlyContent)) !== null) {
      const testName = match[2];
      const matchLineIndex = codeOnlyContent.substring(0, match.index).split('\n').length - 1;
      
      // 関数の開始行と終了行を特定
      const startLine = matchLineIndex + 1;
      const endLine = findFunctionEnd(codeOnlyLines, matchLineIndex);

      // 元のソースコードから該当部分を抽出
      const originalLines = lines.slice(startLine - 1, endLine);
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
