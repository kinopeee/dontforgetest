import * as path from 'path';
import * as vscode from 'vscode';
import { formatTimestamp, resolveDirAbsolute } from './artifacts';
import { buildCodeOnlyContent, hasEmptyStringLiteralInCode, isRegexStart } from './codeOnlyText';
import { nowMs } from './event';
import { t } from './l10n';

/**
 * 分析で検出された問題の種別
 */
export type AnalysisIssueType =
  | 'missing-gwt'
  | 'missing-boundary'
  | 'missing-exception-message';

/**
 * 分析で検出された個別の問題
 */
export interface AnalysisIssue {
  type: AnalysisIssueType;
  /** ワークスペース相対パス */
  file: string;
  /** 問題が検出された行番号（1始まり）。ファイル単位の問題の場合は undefined */
  line?: number;
  /** 問題の詳細説明 */
  detail: string;
}

/**
 * 分析結果のサマリー
 */
export interface AnalysisSummary {
  missingGwt: number;
  missingBoundary: number;
  missingExceptionMessage: number;
}

/**
 * 分析結果
 */
export interface AnalysisResult {
  /** 分析したファイル数 */
  analyzedFiles: number;
  /** 検出された問題のリスト */
  issues: AnalysisIssue[];
  /** カテゴリ別の件数サマリー */
  summary: AnalysisSummary;
  /** 分析対象パターン */
  pattern: string;
}

/**
 * テスト関数の情報
 */
interface TestFunction {
  name: string;
  startLine: number;
  endLine: number;
  content: string;
}

/**
 * 分析設定を取得する
 */
export function getAnalysisSettings(): { reportDir: string; testFilePattern: string } {
  const config = vscode.workspace.getConfiguration('dontforgetest');
  const reportDir = (config.get<string>('analysisReportDir', 'docs/test-analysis-reports') ?? 'docs/test-analysis-reports').trim();
  const testFilePattern = (config.get<string>('analysisTestFilePattern', 'src/test/**/*.test.ts') ?? 'src/test/**/*.test.ts').trim();
  return { reportDir, testFilePattern };
}

/**
 * 指定パターンに一致するテストファイルを分析する
 *
 * @param workspaceRoot ワークスペースのルートパス
 * @param pattern glob パターン（例: src/test/**\/*.test.ts）
 * @returns 分析結果
 */
export async function analyzeTestFiles(
  workspaceRoot: string,
  pattern: string,
): Promise<AnalysisResult> {
  const issues: AnalysisIssue[] = [];

  // ファイルを検索
  const files = await findTestFiles(workspaceRoot, pattern);

  for (const file of files) {
    const relativePath = path.relative(workspaceRoot, file);
    const content = await readFileContent(file);
    if (content === undefined) {
      continue;
    }

    // 各分析ルールを適用
    const fileIssues = analyzeFileContent(relativePath, content);
    issues.push(...fileIssues);
  }

  // サマリーを計算
  const summary = calculateSummary(issues);

  return {
    analyzedFiles: files.length,
    issues,
    summary,
    pattern,
  };
}

/**
 * 単一ファイルを分析する
 *
 * @param filePath ファイルの絶対パス
 * @param workspaceRoot ワークスペースのルートパス
 * @returns 分析結果
 */
export async function analyzeFile(
  filePath: string,
  workspaceRoot: string,
): Promise<AnalysisResult> {
  const issues: AnalysisIssue[] = [];
  const relativePath = path.relative(workspaceRoot, filePath);

  const content = await readFileContent(filePath);
  if (content !== undefined) {
    const fileIssues = analyzeFileContent(relativePath, content);
    issues.push(...fileIssues);
  }

  const summary = calculateSummary(issues);

  return {
    analyzedFiles: content !== undefined ? 1 : 0,
    issues,
    summary,
    pattern: relativePath,
  };
}

/**
 * ファイル内容を分析して問題を検出する
 */
export function analyzeFileContent(relativePath: string, content: string): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  // コード領域のみのテキストを生成（文字列/コメントを除外）
  const codeOnlyContent = buildCodeOnlyContent(content);

  // テスト関数を抽出（codeOnlyContent を使って誤検出を防ぐ）
  const testFunctions = extractTestFunctions(content, codeOnlyContent);

  // 1. Given/When/Then コメントのチェック（厳格: 全て必須）
  for (const testFn of testFunctions) {
    const gwtResult = checkGivenWhenThenStrict(testFn.content);
    if (!gwtResult.valid) {
      issues.push({
        type: 'missing-gwt',
        file: relativePath,
        line: testFn.startLine,
        detail: `${testFn.name} (${gwtResult.missing.join(', ')} ${t('analysis.detail.missing')})`,
      });
    }
  }

  // 2. 境界値テストのチェック（ファイル単位、codeOnlyContent と content を使用）
  const boundaryIssue = checkBoundaryValueTests(relativePath, content, codeOnlyContent);
  if (boundaryIssue) {
    issues.push(boundaryIssue);
  }

  // 3. 例外メッセージ未検証のチェック（厳格化、codeOnlyContent を使用）
  const exceptionIssues = checkExceptionMessageVerificationStrict(relativePath, content, codeOnlyContent);
  issues.push(...exceptionIssues);

  return issues;
}

/**
 * テスト関数を抽出する
 *
 * 対応パターン:
 * - test('name', ...)
 * - it('name', ...)
 * - test("name", ...)
 * - it("name", ...)
 * - test(`name`, ...)
 * - it(`name`, ...)
 *
 * @param content 元のソースコード
 * @param codeOnlyContent 文字列/コメントを除外したコード領域のみのテキスト
 */
function extractTestFunctions(content: string, codeOnlyContent: string): TestFunction[] {
  const functions: TestFunction[] = [];
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
      const testContent = lines.slice(i, endLine).join('\n');

      functions.push({
        name: testName,
        startLine,
        endLine,
        content: testContent,
      });
    }
  }

  return functions;
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
 * Given/When/Then コメントの厳格チェック結果
 */
interface GwtCheckResult {
  valid: boolean;
  missing: string[];
}

/**
 * Given/When/Then コメントが全て存在するかチェック（厳格版）
 *
 * ガイドラインに従い、Given/When/Then 全てが必須。
 */
function checkGivenWhenThenStrict(content: string): GwtCheckResult {
  const givenPattern = /\/\/\s*Given\s*:/i;
  const whenPattern = /\/\/\s*When\s*:/i;
  const thenPattern = /\/\/\s*Then\s*:/i;

  const hasGiven = givenPattern.test(content);
  const hasWhen = whenPattern.test(content);
  const hasThen = thenPattern.test(content);

  const missing: string[] = [];
  if (!hasGiven) {
    missing.push('Given');
  }
  if (!hasWhen) {
    missing.push('When');
  }
  if (!hasThen) {
    missing.push('Then');
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * 境界値テストの存在をチェック
 *
 * 以下のキーワードがテストケース名またはアサーション内に存在するかチェック:
 * - null
 * - undefined
 * - 0（数値のゼロ）
 * - '' または "" または ``（空文字列）
 * - [] （空配列）
 *
 * NOTE:
 * - codeOnlyContent では文字列リテラルが空白化されるため、空文字リテラルは検出できない。
 * - 空文字リテラルのみ、元の content を軽量 lexer で走査して検出する。
 *
 * @param relativePath ファイルの相対パス
 * @param content 元のソースコード
 * @param codeOnlyContent コード領域のみのテキスト（文字列/コメント除外済み）
 */
function checkBoundaryValueTests(
  relativePath: string,
  content: string,
  codeOnlyContent: string,
): AnalysisIssue | null {
  // テスト関数が存在しない場合はスキップ
  const hasTestFunctions = /(?:test|it)\s*\(/.test(codeOnlyContent);
  if (!hasTestFunctions) {
    return null;
  }

  // 境界値関連のパターンを検出（codeOnlyContent に対して適用）
  const patterns = [
    /\bnull\b/, // null
    /\bundefined\b/, // undefined
    /(?:===?\s*0\b|\b0\s*===?)/, // 0 との比較
    /\[\s*\]/, // 空配列 []
  ];

  const hasBoundaryTestInCodeOnly = patterns.some((pattern) => pattern.test(codeOnlyContent));

  // 空文字リテラルは codeOnlyContent では消えるため、元の content から lexer で検出
  const hasEmptyStringBoundary = hasEmptyStringLiteralInCode(content);

  if (!hasBoundaryTestInCodeOnly && !hasEmptyStringBoundary) {
    return {
      type: 'missing-boundary',
      file: relativePath,
      detail: t('analysis.detail.noBoundaryTests'),
    };
  }

  return null;
}

/**
 * 例外メッセージの検証をチェック（厳格版）
 *
 * 以下のパターンで例外を検証しているが、メッセージを検証していない場合を検出:
 * - assert.throws(() => ...) のみ（第2引数なし） → NG
 * - assert.throws(() => ..., TypeError) のみ（型だけ指定） → NG
 * - assert.throws(() => ..., /message/) → OK（正規表現でメッセージ検証）
 * - assert.throws(() => ..., { message: ... }) → OK
 * - assert.throws(() => ..., (err) => { ... .message ... }) → OK
 * - expect(...).toThrow() のみ（引数なし） → NG
 *
 * @param relativePath ファイルの相対パス
 * @param content 元のソースコード
 * @param codeOnlyContent コード領域のみのテキスト（検索に使用）
 */
function checkExceptionMessageVerificationStrict(
  relativePath: string,
  content: string,
  codeOnlyContent: string,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const lineStartIndices = buildLineStartIndices(content);

  // assert.throws(...) の検出と厳格な検証
  const assertThrowsCalls = findAssertThrowsCallsStrict(content, codeOnlyContent, lineStartIndices);
  for (const call of assertThrowsCalls) {
    if (!call.hasMessageVerification) {
      issues.push({
        type: 'missing-exception-message',
        file: relativePath,
        line: call.line,
        detail: call.reason,
      });
    }
  }

  // expect(...).toThrow() で引数がないパターン
  // NOTE: codeOnlyContent で位置を見つけ、元の content で引数の有無を確認する
  //       （codeOnlyContent では文字列引数が空白に置き換えられ誤検出になるため）
  const toThrowLocator = /\.toThrow\s*\(/g;
  for (const match of codeOnlyContent.matchAll(toThrowLocator)) {
    const index = match.index;
    if (index === undefined) {
      continue;
    }
    // 元の content で実際の引数を確認
    // NOTE:
    // - ネストした括弧が含まれる場合があるため、簡易スキャンではなく parseCallArgsWithRanges を使う。
    // - match[0] は ".toThrow   (" まで含むので、最後の "(" の位置に戻す。
    const openParenIndex = index + match[0].length - 1;
    const parsed = parseCallArgsWithRanges(content, openParenIndex);
    if (parsed.args.length === 0) {
      issues.push({
        type: 'missing-exception-message',
        file: relativePath,
        line: indexToLineNumber(lineStartIndices, index),
        detail: t('analysis.detail.toThrowNoMessage'),
      });
    }
  }

  return issues;
}

function buildLineStartIndices(content: string): number[] {
  // 1-based 行番号の逆引き用に、各行の開始インデックスを保持する
  const indices: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      indices.push(i + 1);
    }
  }
  return indices;
}

function indexToLineNumber(lineStartIndices: number[], index: number): number {
  // lineStartIndices は昇順なので二分探索
  let low = 0;
  let high = lineStartIndices.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = lineStartIndices[mid];
    const nextStart =
      mid + 1 < lineStartIndices.length ? lineStartIndices[mid + 1] : Number.POSITIVE_INFINITY;
    if (start <= index && index < nextStart) {
      return mid + 1; // 1-based
    }
    if (index < start) {
      high = mid - 1;
      continue;
    }
    low = mid + 1;
  }
  return 1;
}

type AssertThrowsCallInfoStrict = {
  line: number;
  hasMessageVerification: boolean;
  reason: string;
};

/**
 * assert.throws 呼び出しを検出し、メッセージ検証の有無を厳格に判定する。
 *
 * @param content 元のソースコード
 * @param codeOnlyContent コード領域のみのテキスト（検索に使用）
 * @param lineStartIndices 行番号逆引き用インデックス
 */
function findAssertThrowsCallsStrict(
  content: string,
  codeOnlyContent: string,
  lineStartIndices: number[],
): AssertThrowsCallInfoStrict[] {
  const result: AssertThrowsCallInfoStrict[] = [];
  const needle = 'assert.throws';
  let cursor = 0;

  while (cursor < codeOnlyContent.length) {
    const found = codeOnlyContent.indexOf(needle, cursor);
    if (found === -1) {
      break;
    }

    // "assert.throws" の直後から "(" まで進める（空白を許容）
    let i = found + needle.length;
    while (i < codeOnlyContent.length && /\s/.test(codeOnlyContent[i])) {
      i++;
    }
    if (i >= codeOnlyContent.length || codeOnlyContent[i] !== '(') {
      cursor = found + needle.length;
      continue;
    }

    const openParenIndex = i;
    const parsed = parseCallArgsWithRanges(content, openParenIndex);
    const line = indexToLineNumber(lineStartIndices, found);

    // 厳格な検証
    const verification = checkAssertThrowsMessageVerification(parsed.args, content);
    result.push({
      line,
      hasMessageVerification: verification.valid,
      reason: verification.reason,
    });

    cursor = parsed.endIndex + 1;
  }

  return result;
}

/**
 * assert.throws の引数からメッセージ検証の有無を厳格に判定する。
 */
function checkAssertThrowsMessageVerification(
  args: ArgumentRange[],
  content: string,
): { valid: boolean; reason: string } {
  // 第2引数がない → NG
  if (args.length < 2) {
    return { valid: false, reason: t('analysis.detail.assertThrowsNoMessage') };
  }

  const secondArg = content.slice(args[1].start, args[1].end).trim();

  // 正規表現リテラル → OK
  if (/^\/.*\/[a-z]*$/.test(secondArg)) {
    return { valid: true, reason: '' };
  }

  // new RegExp(...) → OK
  if (/^new\s+RegExp\s*\(/.test(secondArg)) {
    return { valid: true, reason: '' };
  }

  // オブジェクトリテラル { message: ... } または { name: ..., message: ... } → OK
  if (/^\{[\s\S]*\bmessage\s*:/.test(secondArg)) {
    return { valid: true, reason: '' };
  }

  // アロー関数または関数式で .message を参照している → OK
  if (/(?:=>|function)/.test(secondArg) && /\.message\b/.test(secondArg)) {
    return { valid: true, reason: '' };
  }

  // Error クラス名のみ（例: TypeError, Error, SyntaxError）→ NG
  if (/^[A-Z][a-zA-Z]*Error$/.test(secondArg) || secondArg === 'Error') {
    return { valid: false, reason: t('analysis.detail.assertThrowsTypeOnly') };
  }

  // その他（不明な形式）→ 安全側で OK 扱い
  // 例: 変数参照、カスタムマッチャーなど
  return { valid: true, reason: '' };
}

type ArgumentRange = {
  start: number;
  end: number;
};

type ParseCallArgsWithRangesResult = {
  endIndex: number;
  args: ArgumentRange[];
};

/**
 * 関数呼び出しの引数を解析し、各引数の範囲を返す。
 */
function parseCallArgsWithRanges(content: string, openParenIndex: number): ParseCallArgsWithRangesResult {
  const args: ArgumentRange[] = [];
  let parenDepth = 1;
  let braceDepth = 0;
  let bracketDepth = 0;

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
    /** `${...}` の `{` ネスト深さ（`${` 開始時点で 1）。0 の場合はテンプレート文字列部分。 */
    exprBraceDepth: number;
    /** テンプレート文字列部分でのエスケープ（\` や \${ を誤検出しないため） */
    escaped: boolean;
    /** 対応する `...` を閉じたときに戻る状態 */
    resumeState: ResumeState;
  };

  let state: LexerState = 'code';
  let resumeState: ResumeState = 'code';
  // 文字列/正規表現でのエスケープ
  let escaped = false;
  // テンプレートリテラルのネスト管理（`${...}` 内のネストしたテンプレートも追跡する）
  const templateStack: TemplateContext[] = [];

  let argStart = openParenIndex + 1;
  // 正規表現開始判定（除算との誤判定を避けるため、前の非空白文字を追跡）
  let lastNonWsChar = '';

  const pushArgRange = (endIndexExclusive: number): void => {
    if (endIndexExclusive <= argStart) {
      return;
    }
    const trimmedStart = skipWhitespace(content, argStart);
    const trimmedEnd = skipWhitespaceReverse(content, endIndexExclusive);
    if (trimmedEnd > trimmedStart) {
      args.push({ start: trimmedStart, end: trimmedEnd });
    }
  };

  for (let i = openParenIndex + 1; i < content.length; i++) {
    const ch = content[i];
    const next = i + 1 < content.length ? content[i + 1] : '';

    switch (state) {
      case 'lineComment': {
        if (ch === '\n') {
          state = resumeState;
        }
        continue;
      }
      case 'blockComment': {
        if (ch === '*' && next === '/') {
          state = resumeState;
          i++;
        }
        continue;
      }
      case 'singleQuote': {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === "'") {
          state = resumeState;
          // 文字列リテラル終了は「式の終端」として扱う（`/` の正規表現開始判定に影響）
          lastNonWsChar = "'";
        }
        continue;
      }
      case 'doubleQuote': {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          state = resumeState;
          // 文字列リテラル終了は「式の終端」として扱う（`/` の正規表現開始判定に影響）
          lastNonWsChar = '"';
        }
        continue;
      }
      case 'regex': {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '/') {
          state = resumeState;
          // 正規表現リテラル終了は「式の終端」として扱う
          lastNonWsChar = '/';
        }
        continue;
      }
      case 'template': {
        const ctx = templateStack.length > 0 ? templateStack[templateStack.length - 1] : undefined;
        if (!ctx) {
          // 異常系（スタック不整合）: 安全側でコード状態に戻す
          state = 'code';
          continue;
        }

        // 1) `${...}` の外側（テンプレート文字列部分）
        if (ctx.exprBraceDepth === 0) {
          if (ctx.escaped) {
            ctx.escaped = false;
            continue;
          }
          if (ch === '\\') {
            ctx.escaped = true;
            continue;
          }

          if (ch === '$' && next === '{') {
            // ${...} 開始
            // NOTE:
            // - `${` の "{" を次ループでカウントしてしまうと二重カウントになるため、ここでまとめて処理する。
            ctx.exprBraceDepth = 1;
            braceDepth++;
            lastNonWsChar = '{';
            i++; // '{' をスキップ
            continue;
          }

          if (ch === '`') {
            // テンプレートリテラル終了（ネスト対応）
            templateStack.pop();
            state = ctx.resumeState;
            // テンプレートリテラル終了は「式の終端」として扱う（`/` の正規表現開始判定に影響）
            lastNonWsChar = '`';
            // ネストしたテンプレートから戻る場合は outer が残っているため template を維持
            if (state === 'template' && templateStack.length === 0) {
              state = 'code';
            }
            continue;
          }

          // 文字列部分は引数解析に影響しないため、それ以外は無視
          continue;
        }

        // 2) `${...}` の内側（式部分）: code と同様に扱う
        if (ch === '/' && next === '/') {
          state = 'lineComment';
          resumeState = 'template';
          i++;
          continue;
        }
        if (ch === '/' && next === '*') {
          state = 'blockComment';
          resumeState = 'template';
          i++;
          continue;
        }
        if (ch === "'") {
          state = 'singleQuote';
          escaped = false;
          resumeState = 'template';
          continue;
        }
        if (ch === '"') {
          state = 'doubleQuote';
          escaped = false;
          resumeState = 'template';
          continue;
        }
        if (ch === '`') {
          // ネストしたテンプレートリテラル開始
          templateStack.push({ exprBraceDepth: 0, escaped: false, resumeState: 'template' });
          state = 'template';
          continue;
        }
        // 正規表現開始（ヒューリスティック）
        if (ch === '/' && next !== '/' && next !== '*' && isRegexStart(lastNonWsChar)) {
          state = 'regex';
          escaped = false;
          resumeState = 'template';
          lastNonWsChar = '/';
          continue;
        }

        // ネスト管理（テンプレート式内でも paren/brace/bracket を追跡）
        if (ch === '(') {
          parenDepth++;
          lastNonWsChar = '(';
          continue;
        }
        if (ch === ')') {
          parenDepth--;
          if (parenDepth === 0) {
            pushArgRange(i);
            return { endIndex: i, args };
          }
          lastNonWsChar = ')';
          continue;
        }
        if (ch === '{') {
          braceDepth++;
          ctx.exprBraceDepth++;
          lastNonWsChar = '{';
          continue;
        }
        if (ch === '}') {
          braceDepth = Math.max(0, braceDepth - 1);
          ctx.exprBraceDepth = Math.max(0, ctx.exprBraceDepth - 1);
          lastNonWsChar = '}';
          continue;
        }
        if (ch === '[') {
          bracketDepth++;
          lastNonWsChar = '[';
          continue;
        }
        if (ch === ']') {
          bracketDepth = Math.max(0, bracketDepth - 1);
          lastNonWsChar = ']';
          continue;
        }

        // トップレベルの引数区切り
        if (ch === ',' && parenDepth === 1 && braceDepth === 0 && bracketDepth === 0) {
          pushArgRange(i);
          argStart = i + 1;
          lastNonWsChar = ',';
          continue;
        }

        if (!/\s/.test(ch)) {
          lastNonWsChar = ch;
        }
        continue;
      }
      case 'code': {
        // コメント開始
        if (ch === '/' && next === '/') {
          state = 'lineComment';
          resumeState = 'code';
          i++;
          continue;
        }
        if (ch === '/' && next === '*') {
          state = 'blockComment';
          resumeState = 'code';
          i++;
          continue;
        }

        // 文字列開始
        if (ch === "'") {
          state = 'singleQuote';
          escaped = false;
          resumeState = 'code';
          continue;
        }
        if (ch === '"') {
          state = 'doubleQuote';
          escaped = false;
          resumeState = 'code';
          continue;
        }
        if (ch === '`') {
          // テンプレートリテラル開始（ネスト対応）
          state = 'template';
          templateStack.push({ exprBraceDepth: 0, escaped: false, resumeState: 'code' });
          continue;
        }

        // 正規表現開始（ヒューリスティック）
        if (ch === '/' && next !== '/' && next !== '*' && isRegexStart(lastNonWsChar)) {
          state = 'regex';
          escaped = false;
          resumeState = 'code';
          lastNonWsChar = '/';
          continue;
        }

        // ネスト管理
        if (ch === '(') {
          parenDepth++;
          lastNonWsChar = '(';
          continue;
        }
        if (ch === ')') {
          parenDepth--;
          if (parenDepth === 0) {
            pushArgRange(i);
            return { endIndex: i, args };
          }
          lastNonWsChar = ')';
          continue;
        }
        if (ch === '{') {
          braceDepth++;
          lastNonWsChar = '{';
          continue;
        }
        if (ch === '}') {
          braceDepth = Math.max(0, braceDepth - 1);
          lastNonWsChar = '}';
          continue;
        }
        if (ch === '[') {
          bracketDepth++;
          lastNonWsChar = '[';
          continue;
        }
        if (ch === ']') {
          bracketDepth = Math.max(0, bracketDepth - 1);
          lastNonWsChar = ']';
          continue;
        }

        // トップレベルの引数区切り
        if (ch === ',' && parenDepth === 1 && braceDepth === 0 && bracketDepth === 0) {
          pushArgRange(i);
          argStart = i + 1;
          lastNonWsChar = ',';
          continue;
        }

        if (!/\s/.test(ch)) {
          lastNonWsChar = ch;
        }
        continue;
      }
    }
  }

  // ) が見つからない場合
  return { endIndex: content.length - 1, args };
}

function skipWhitespace(content: string, index: number): number {
  while (index < content.length && /\s/.test(content[index])) {
    index++;
  }
  return index;
}

function skipWhitespaceReverse(content: string, index: number): number {
  while (index > 0 && /\s/.test(content[index - 1])) {
    index--;
  }
  return index;
}
/**
 * サマリーを計算する
 */
function calculateSummary(issues: AnalysisIssue[]): AnalysisSummary {
  return {
    missingGwt: issues.filter((i) => i.type === 'missing-gwt').length,
    missingBoundary: issues.filter((i) => i.type === 'missing-boundary').length,
    missingExceptionMessage: issues.filter((i) => i.type === 'missing-exception-message').length,
  };
}

/**
 * テストファイルを検索する
 */
async function findTestFiles(workspaceRoot: string, pattern: string): Promise<string[]> {
  const globPattern = new vscode.RelativePattern(workspaceRoot, pattern);
  const uris = await vscode.workspace.findFiles(globPattern);
  return uris.map((uri) => uri.fsPath);
}

/**
 * ファイル内容を読み取る
 */
async function readFileContent(filePath: string): Promise<string | undefined> {
  try {
    const data = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    return Buffer.from(data).toString('utf8');
  } catch {
    return undefined;
  }
}

/**
 * 分析レポートを Markdown として生成する
 */
export function buildAnalysisReportMarkdown(
  result: AnalysisResult,
  generatedAtMs: number,
): string {
  const tsLocal = formatLocalIso8601WithOffset(new Date(generatedAtMs));
  const totalIssues = result.issues.length;

  const lines: string[] = [
    `# ${t('analysis.report.title')}`,
    '',
    `- ${t('analysis.report.generatedAt')}: ${tsLocal}`,
    `- ${t('analysis.report.target')}: ${result.pattern}`,
    `- ${t('analysis.report.fileCount')}: ${result.analyzedFiles}`,
    '',
    '---',
    '',
  ];

  // サマリー
  lines.push(`## ${t('analysis.report.summary')}`);
  lines.push('');
  lines.push(`| ${t('analysis.tableHeader.category')} | ${t('analysis.tableHeader.count')} |`);
  lines.push('|----------|------|');
  lines.push(`| ${t('analysis.category.missingGwt')} | ${result.summary.missingGwt} |`);
  lines.push(`| ${t('analysis.category.missingBoundary')} | ${result.summary.missingBoundary} |`);
  lines.push(`| ${t('analysis.category.missingExceptionMessage')} | ${result.summary.missingExceptionMessage} |`);
  lines.push('');

  if (totalIssues === 0) {
    lines.push(t('analysis.noIssues'));
    lines.push('');
    return lines.join('\n');
  }

  lines.push('---');
  lines.push('');
  lines.push(`## ${t('analysis.report.details')}`);
  lines.push('');

  // Given/When/Then コメントなし
  const gwtIssues = result.issues.filter((i) => i.type === 'missing-gwt');
  if (gwtIssues.length > 0) {
    lines.push(`### ${t('analysis.category.missingGwt')} (${gwtIssues.length}${t('analysis.unit.count')})`);
    lines.push('');
    lines.push(`| ${t('analysis.tableHeader.file')} | ${t('analysis.tableHeader.line')} | ${t('analysis.tableHeader.detail')} |`);
    lines.push('|----------|-----|------|');
    for (const issue of gwtIssues) {
      const lineStr = issue.line !== undefined ? String(issue.line) : '-';
      lines.push(`| ${escapeTableCell(issue.file)} | ${lineStr} | ${escapeTableCell(issue.detail)} |`);
    }
    lines.push('');
  }

  // 境界値テスト不足
  const boundaryIssues = result.issues.filter((i) => i.type === 'missing-boundary');
  if (boundaryIssues.length > 0) {
    lines.push(`### ${t('analysis.category.missingBoundary')} (${boundaryIssues.length}${t('analysis.unit.count')})`);
    lines.push('');
    lines.push(`| ${t('analysis.tableHeader.file')} | ${t('analysis.tableHeader.detail')} |`);
    lines.push('|----------|------|');
    for (const issue of boundaryIssues) {
      lines.push(`| ${escapeTableCell(issue.file)} | ${escapeTableCell(issue.detail)} |`);
    }
    lines.push('');
  }

  // 例外メッセージ未検証
  const exceptionIssues = result.issues.filter((i) => i.type === 'missing-exception-message');
  if (exceptionIssues.length > 0) {
    lines.push(`### ${t('analysis.category.missingExceptionMessage')} (${exceptionIssues.length}${t('analysis.unit.count')})`);
    lines.push('');
    lines.push(`| ${t('analysis.tableHeader.file')} | ${t('analysis.tableHeader.line')} | ${t('analysis.tableHeader.detail')} |`);
    lines.push('|----------|-----|------|');
    for (const issue of exceptionIssues) {
      const lineStr = issue.line !== undefined ? String(issue.line) : '-';
      lines.push(`| ${escapeTableCell(issue.file)} | ${lineStr} | ${escapeTableCell(issue.detail)} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 分析レポートを保存する
 */
export async function saveAnalysisReport(
  workspaceRoot: string,
  result: AnalysisResult,
  reportDir: string,
): Promise<{ absolutePath: string; relativePath: string }> {
  const absDir = resolveDirAbsolute(workspaceRoot, reportDir);
  const timestamp = formatTimestamp(new Date());
  const filename = `test-analysis_${timestamp}.md`;
  const absolutePath = path.join(absDir, filename);

  const content = buildAnalysisReportMarkdown(result, nowMs());

  // ディレクトリを作成してファイルを書き込む
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(absDir));
  await vscode.workspace.fs.writeFile(vscode.Uri.file(absolutePath), Buffer.from(content, 'utf8'));

  const relativePath = path.relative(workspaceRoot, absolutePath);

  return { absolutePath, relativePath };
}

/**
 * テーブルセルをエスケープする
 */
function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/**
 * ローカル時刻を視認性の良い形式（UTCオフセット付き）で整形する。
 */
function formatLocalIso8601WithOffset(date: Date): string {
  const yyyy = String(date.getFullYear());
  const MM = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  const SSS = pad3(date.getMilliseconds());

  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const offH = pad2(Math.floor(abs / 60));
  const offM = pad2(abs % 60);

  return `${yyyy}-${MM}-${dd}  ${hh}:${mm}:${ss}.${SSS} ${sign}${offH}:${offM}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function pad3(n: number): string {
  if (n < 10) {
    return `00${n}`;
  }
  if (n < 100) {
    return `0${n}`;
  }
  return String(n);
}
