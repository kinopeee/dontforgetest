import * as path from 'path';
import * as vscode from 'vscode';
import { formatTimestamp, resolveDirAbsolute } from './artifacts';
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

  // テスト関数を抽出
  const testFunctions = extractTestFunctions(content);

  // 1. Given/When/Then コメントのチェック
  for (const testFn of testFunctions) {
    if (!hasGivenWhenThenComment(testFn.content)) {
      issues.push({
        type: 'missing-gwt',
        file: relativePath,
        line: testFn.startLine,
        detail: testFn.name,
      });
    }
  }

  // 2. 境界値テストのチェック（ファイル単位）
  const boundaryIssue = checkBoundaryValueTests(relativePath, content);
  if (boundaryIssue) {
    issues.push(boundaryIssue);
  }

  // 3. 例外メッセージ未検証のチェック
  const exceptionIssues = checkExceptionMessageVerification(relativePath, content);
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
 */
function extractTestFunctions(content: string): TestFunction[] {
  const functions: TestFunction[] = [];
  const lines = content.split('\n');

  // test() または it() の開始を検出
  const testStartPattern = /^\s*(?:test|it)\s*\(\s*(['"`])(.+?)\1/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = testStartPattern.exec(line);
    if (match) {
      const testName = match[2];
      const startLine = i + 1; // 1始まり

      // テスト関数の終了を探す（簡易的にブレース数をカウント）
      const endLine = findFunctionEnd(lines, i);
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
 */
function findFunctionEnd(lines: string[], startIndex: number): number {
  let braceCount = 0;
  let started = false;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];

    // 文字列リテラル内のブレースを除外するための簡易処理
    // （完全な対応は困難なため、基本的なケースのみ対応）
    const cleanedLine = removeStringLiterals(line);

    for (const char of cleanedLine) {
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

  return lines.length;
}

/**
 * 文字列リテラルを除去する（簡易版）
 */
function removeStringLiterals(line: string): string {
  // シングルクォート、ダブルクォート、バッククォート内を除去
  // エスケープは考慮しない簡易版
  return line
    .replace(/'[^']*'/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/`[^`]*`/g, '');
}

/**
 * Given/When/Then コメントが存在するかチェック
 */
function hasGivenWhenThenComment(content: string): boolean {
  // "// Given:" または "// When:" が存在するかチェック
  // 大文字小文字は区別しない
  const givenPattern = /\/\/\s*Given\s*:/i;
  const whenPattern = /\/\/\s*When\s*:/i;

  return givenPattern.test(content) || whenPattern.test(content);
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
 */
function checkBoundaryValueTests(relativePath: string, content: string): AnalysisIssue | null {
  // テスト関数が存在しない場合はスキップ
  const hasTestFunctions = /(?:test|it)\s*\(/.test(content);
  if (!hasTestFunctions) {
    return null;
  }

  // 境界値関連のパターンを検出
  const patterns = [
    /\bnull\b/, // null
    /\bundefined\b/, // undefined
    /(?:===?\s*0\b|\b0\s*===?)/, // 0 との比較
    /['"]\s*['"]/, // 空文字列 '' or ""
    /\[\s*\]/, // 空配列 []
  ];

  const hasBoundaryTest = patterns.some((pattern) => pattern.test(content));

  if (!hasBoundaryTest) {
    return {
      type: 'missing-boundary',
      file: relativePath,
      detail: t('analysis.detail.noBoundaryTests'),
    };
  }

  return null;
}

/**
 * 例外メッセージの検証をチェック
 *
 * 以下のパターンで例外を検証しているが、メッセージ/型を指定していない場合を検出:
 * - assert.throws(() => ...) のみ（第2引数なし）
 * - expect(...).toThrow() のみ（引数なし）
 */
function checkExceptionMessageVerification(
  relativePath: string,
  content: string,
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];
  const lineStartIndices = buildLineStartIndices(content);

  // assert.throws(...) の第2引数（メッセージ/型）未指定を検出する
  // ポイント: よくある整形（第2引数が改行後に続く）でも誤検知しないよう、呼び出し全体を解析する
  // 例: assert.throws(() => fn()); -> 検出（第2引数なし）
  // 例: assert.throws(() => fn(), /message/); -> 検出しない（第2引数あり）
  // 例: assert.throws(
  //       () => fn(),
  //       /message/,
  //     ); -> 検出しない（複数行だが第2引数あり）
  const assertThrowsCalls = findAssertThrowsCalls(content, lineStartIndices);
  for (const call of assertThrowsCalls) {
    if (!call.hasSecondArg) {
      issues.push({
        type: 'missing-exception-message',
        file: relativePath,
        line: call.line,
        detail: t('analysis.detail.assertThrowsNoMessage'),
      });
    }
  }

  // expect(...).toThrow() で引数がないパターン（複数行も含めて検出）
  // 例: expect(() => fn()).toThrow();
  const expectToThrowPattern = /\.toThrow\s*\(\s*\)/g;
  for (const match of content.matchAll(expectToThrowPattern)) {
    const index = match.index;
    if (index === undefined) {
      continue;
    }
    issues.push({
      type: 'missing-exception-message',
      file: relativePath,
      line: indexToLineNumber(lineStartIndices, index),
      detail: t('analysis.detail.toThrowNoMessage'),
    });
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

type AssertThrowsCallInfo = {
  line: number;
  hasSecondArg: boolean;
};

function findAssertThrowsCalls(content: string, lineStartIndices: number[]): AssertThrowsCallInfo[] {
  const result: AssertThrowsCallInfo[] = [];
  const needle = 'assert.throws';
  let cursor = 0;

  while (cursor < content.length) {
    const found = content.indexOf(needle, cursor);
    if (found === -1) {
      break;
    }

    // "assert.throws" の直後から "(" まで進める（空白を許容）
    let i = found + needle.length;
    while (i < content.length && /\s/.test(content[i])) {
      i++;
    }
    if (i >= content.length || content[i] !== '(') {
      cursor = found + needle.length;
      continue;
    }

    const openParenIndex = i;
    const parsed = parseCallArgsForTopLevelComma(content, openParenIndex);
    result.push({
      line: indexToLineNumber(lineStartIndices, found),
      hasSecondArg: parsed.hasTopLevelComma,
    });

    cursor = parsed.endIndex + 1;
  }

  return result;
}

type ParseCallArgsResult = {
  endIndex: number;
  hasTopLevelComma: boolean;
};

function parseCallArgsForTopLevelComma(content: string, openParenIndex: number): ParseCallArgsResult {
  // openParenIndex は "(" の位置
  let parenDepth = 1;
  let braceDepth = 0;
  let bracketDepth = 0;

  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let inRegex = false;
  let inLineComment = false;
  let inBlockComment = false;

  let escaped = false;
  let hasTopLevelComma = false;

  for (let i = openParenIndex + 1; i < content.length; i++) {
    const ch = content[i];
    const next = i + 1 < content.length ? content[i + 1] : '';

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inSingleQuote || inDoubleQuote || inTemplate) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (inSingleQuote && ch === "'") {
        inSingleQuote = false;
        continue;
      }
      if (inDoubleQuote && ch === '"') {
        inDoubleQuote = false;
        continue;
      }
      if (inTemplate && ch === '`') {
        inTemplate = false;
        continue;
      }
      continue;
    }

    if (inRegex) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '/') {
        inRegex = false;
      }
      continue;
    }

    // コメント開始
    if (ch === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }

    // 文字列開始
    if (ch === "'") {
      inSingleQuote = true;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      continue;
    }
    if (ch === '`') {
      inTemplate = true;
      continue;
    }

    // 正規表現開始（厳密ではないが、assert.throws 引数内では実用上十分）
    if (ch === '/' && next !== '/' && next !== '*') {
      inRegex = true;
      continue;
    }

    // ネスト管理
    if (ch === '(') {
      parenDepth++;
      continue;
    }
    if (ch === ')') {
      parenDepth--;
      if (parenDepth === 0) {
        return { endIndex: i, hasTopLevelComma };
      }
      continue;
    }
    if (ch === '{') {
      braceDepth++;
      continue;
    }
    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (ch === '[') {
      bracketDepth++;
      continue;
    }
    if (ch === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }

    // トップレベルの引数区切り（外側の () の直下）
    if (ch === ',' && parenDepth === 1 && braceDepth === 0 && bracketDepth === 0) {
      hasTopLevelComma = true;
      // ここで早期returnしてもよいが、終端インデックスも欲しいので継続
      continue;
    }
  }

  // ) が見つからない場合は、最後まで走査した扱いにする
  return { endIndex: content.length - 1, hasTopLevelComma };
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
