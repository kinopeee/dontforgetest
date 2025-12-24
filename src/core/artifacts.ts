import * as path from 'path';
import * as vscode from 'vscode';
import { nowMs, type TestGenEvent } from './event';
import { parseMochaOutput, stripAnsi, type ParsedTestResult, type TestCaseResult } from './testResultParser';

// 型の再エクスポート（既存の利用箇所との互換性のため）
export type { ParsedTestResult, TestCaseResult };
export { parseMochaOutput };

export interface ArtifactSettings {
  includeTestPerspectiveTable: boolean;
  perspectiveReportDir: string;
  testExecutionReportDir: string;
  /** 空文字の場合は実行しない */
  testCommand: string;
  /**
   * テスト実行の担当者。
   * - extension: 拡張機能（Node child_process）で実行
   * - cursorAgent: cursor-agent に実行させ、結果を抽出して保存
   */
  testExecutionRunner: 'extension' | 'cursorAgent';
  /**
   * VS Code を別プロセスで起動しそうなテストコマンドを、あえて実行するか。
   * 既定は安全のため false（重複起動で不安定になる可能性があるため）。
   */
  allowUnsafeTestCommand: boolean;
  /**
   * cursor-agent の `--force` をテスト実行時にも付与するか。
   *
   * `--force` はコマンド実行の承認を省略できる一方、ファイル編集も可能にするため、
   * 既定は false とし、必要な場合のみ明示的に有効化する。
   */
  cursorAgentForceForTestExecution: boolean;
  /**
   * テストコード生成後に型チェック/Lintを実行し、エラーがあれば自動修正を試みる。
   */
  enablePreTestCheck: boolean;
  /**
   * 生成後に実行する型チェック/Lintコマンド（例: npm run compile）。
   */
  preTestCheckCommand: string;
}

export interface SavedArtifact {
  absolutePath: string;
  relativePath?: string;
}

export interface TestExecutionResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  errorMessage?: string;
  /**
   * 実行が「意図的にスキップ」された場合に true。
   * - 例: VS Code を起動しそうなテストコマンドを検出したため拡張機能内実行を回避
   */
  skipped?: boolean;
  /** スキップ理由（ユーザー表示用） */
  skipReason?: string;
  /**
   * 拡張機能が収集した実行ログ（Output Channel 相当）。
   * - 例: cursor-agent の長文レポート、WRITE イベント、警告ログなど
   */
  extensionLog?: string;
}

/**
 * 成果物（観点表/実行レポート）保存に関する設定を取得する。
 */
export function getArtifactSettings(): ArtifactSettings {
  const config = vscode.workspace.getConfiguration('dontforgetest');
  const runnerRaw = (config.get<string>('testExecutionRunner', 'cursorAgent') ?? 'cursorAgent').trim();
  const runner: ArtifactSettings['testExecutionRunner'] = runnerRaw === 'extension' ? 'extension' : 'cursorAgent';
  return {
    includeTestPerspectiveTable: config.get<boolean>('includeTestPerspectiveTable', true),
    perspectiveReportDir: (config.get<string>('perspectiveReportDir', 'docs/test-perspectives') ?? 'docs/test-perspectives').trim(),
    testExecutionReportDir: (config.get<string>('testExecutionReportDir', 'docs/test-execution-reports') ?? 'docs/test-execution-reports').trim(),
    testCommand: (config.get<string>('testCommand', 'npm test') ?? 'npm test').trim(),
    testExecutionRunner: runner,
    allowUnsafeTestCommand: config.get<boolean>('allowUnsafeTestCommand', false),
    cursorAgentForceForTestExecution: config.get<boolean>('cursorAgentForceForTestExecution', false),
    enablePreTestCheck: config.get<boolean>('enablePreTestCheck', true),
    preTestCheckCommand: (config.get<string>('preTestCheckCommand', 'npm run compile') ?? 'npm run compile').trim(),
  };
}

/**
 * タイムスタンプ（推奨形式: YYYYMMDD_HHmmss）を生成する。
 */
export function formatTimestamp(date: Date): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${y}${m}${d}_${hh}${mm}${ss}`;
}

export function resolveDirAbsolute(workspaceRoot: string, dir: string): string {
  const trimmed = dir.trim();
  if (trimmed.length === 0) {
    return workspaceRoot;
  }
  return path.isAbsolute(trimmed) ? trimmed : path.join(workspaceRoot, trimmed);
}

/**
 * 指定されたディレクトリ内で、プレフィックスに一致する最新の成果物ファイルを検索する。
 * ファイル名のタイムスタンプ（YYYYMMDD_HHmmss）でソートし、最新のファイルパスを返す。
 *
 * @param workspaceRoot ワークスペースルートパス
 * @param dir 検索対象ディレクトリ（ワークスペース相対または絶対）
 * @param prefix ファイル名のプレフィックス（例: 'test-perspectives_' または 'test-execution_'）
 * @returns 最新のファイルの絶対パス。見つからない場合は undefined
 */
export async function findLatestArtifact(
  workspaceRoot: string,
  dir: string,
  prefix: string,
): Promise<string | undefined> {
  const absDir = resolveDirAbsolute(workspaceRoot, dir);

  try {
    // ディレクトリ内のファイル一覧を取得
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(absDir));

    // プレフィックスに一致する .md ファイルをフィルタリング
    const matchingFiles = entries
      .filter(([name, type]) => type === vscode.FileType.File && name.startsWith(prefix) && name.endsWith('.md'))
      .map(([name]) => ({
        name,
        path: path.join(absDir, name),
        timestamp: extractTimestamp(name, prefix),
      }))
      .filter((file): file is typeof file & { timestamp: string } => file.timestamp !== null)
      .sort((a, b) => {
        // タイムスタンプで降順ソート（最新が先頭）
        return b.timestamp.localeCompare(a.timestamp);
      });

    if (matchingFiles.length === 0) {
      return undefined;
    }

    return matchingFiles[0].path;
  } catch {
    // ディレクトリが存在しない場合などは undefined を返す
    return undefined;
  }
}

/**
 * ファイル名からタイムスタンプ部分を抽出する。
 * 形式: {prefix}YYYYMMDD_HHmmss.md
 *
 * @param filename ファイル名
 * @param prefix プレフィックス
 * @returns タイムスタンプ文字列（YYYYMMDD_HHmmss）。抽出できない場合は null
 */
function extractTimestamp(filename: string, prefix: string): string | null {
  if (!filename.startsWith(prefix) || !filename.endsWith('.md')) {
    return null;
  }

  // プレフィックスと拡張子を除去
  const withoutPrefix = filename.slice(prefix.length);
  const withoutExt = withoutPrefix.slice(0, -3); // '.md' を除去

  // YYYYMMDD_HHmmss 形式かチェック（15文字）
  if (withoutExt.length !== 15) {
    return null;
  }

  // 形式チェック: YYYYMMDD_HHmmss
  const timestampPattern = /^\d{8}_\d{6}$/;
  if (!timestampPattern.test(withoutExt)) {
    return null;
  }

  return withoutExt;
}

export async function saveTestPerspectiveTable(params: {
  workspaceRoot: string;
  targetLabel: string;
  targetPaths: string[];
  perspectiveMarkdown: string;
  reportDir: string;
  timestamp: string;
}): Promise<SavedArtifact> {
  const absDir = resolveDirAbsolute(params.workspaceRoot, params.reportDir);
  const filename = `test-perspectives_${params.timestamp}.md`;
  const absolutePath = path.join(absDir, filename);

  const content = buildTestPerspectiveArtifactMarkdown({
    generatedAtMs: nowMs(),
    targetLabel: params.targetLabel,
    targetPaths: params.targetPaths,
    perspectiveMarkdown: params.perspectiveMarkdown,
  });
  await writeTextFileEnsuringDir(absDir, absolutePath, content);

  return {
    absolutePath,
    relativePath: toWorkspaceRelativePath(params.workspaceRoot, absolutePath),
  };
}

export async function saveTestExecutionReport(params: {
  workspaceRoot: string;
  generationLabel: string;
  targetPaths: string[];
  model?: string;
  reportDir: string;
  timestamp: string;
  result: TestExecutionResult;
}): Promise<SavedArtifact> {
  const absDir = resolveDirAbsolute(params.workspaceRoot, params.reportDir);
  const filename = `test-execution_${params.timestamp}.md`;
  const absolutePath = path.join(absDir, filename);

  const content = buildTestExecutionArtifactMarkdown({
    generatedAtMs: nowMs(),
    generationLabel: params.generationLabel,
    targetPaths: params.targetPaths,
    model: params.model,
    result: params.result,
  });
  await writeTextFileEnsuringDir(absDir, absolutePath, content);

  return {
    absolutePath,
    relativePath: toWorkspaceRelativePath(params.workspaceRoot, absolutePath),
  };
}

export function buildTestPerspectiveArtifactMarkdown(params: {
  generatedAtMs: number;
  targetLabel: string;
  targetPaths: string[];
  perspectiveMarkdown: string;
}): string {
  const tsIso = new Date(params.generatedAtMs).toISOString();
  const targets = params.targetPaths.map((p) => `- ${p}`).join('\n');
  const table = params.perspectiveMarkdown.trim();
  return [
    '# テスト観点表（自動生成）',
    '',
    `- 生成日時: ${tsIso}`,
    `- 対象: ${params.targetLabel}`,
    `- 対象ファイル:`,
    targets.length > 0 ? targets : '- (なし)',
    '',
    '---',
    '',
    table.length > 0 ? table : '(観点表の生成結果が空でした)',
    '',
  ].join('\n');
}

export function buildTestExecutionArtifactMarkdown(params: {
  generatedAtMs: number;
  generationLabel: string;
  targetPaths: string[];
  model?: string;
  result: TestExecutionResult;
}): string {
  const tsIso = new Date(params.generatedAtMs).toISOString();
  const targets = params.targetPaths.map((p) => `- ${p}`).join('\n');
  const modelLine = params.model && params.model.trim().length > 0 ? `- model: ${params.model}` : '- model: (auto)';

  // stdoutをパースしてテスト結果を抽出
  const testResult = parseMochaOutput(params.result.stdout);
  const summarySection = buildTestSummarySection(params.result.exitCode, params.result.durationMs, testResult);
  const detailsSection = buildTestDetailsSection(testResult);

  // 実行情報
  const envLines = [
    `- OS: ${process.platform} (${process.arch})`,
    `- Node.js: ${process.version}`,
    `- VS Code: ${vscode.version}`,
  ].join('\n');
  const errMsg = params.result.errorMessage ? `- spawn error: ${params.result.errorMessage}` : '';
  const statusLine = params.result.skipped ? '- status: skipped' : '- status: executed';
  const skipReasonLine =
    params.result.skipped && params.result.skipReason && params.result.skipReason.trim().length > 0
      ? `- skipReason: ${params.result.skipReason.trim()}`
      : '';

  // 折りたたみ式の詳細ログセクション
  const stdoutContent = truncate(stripAnsi(params.result.stdout), 200_000);
  const stderrContent = truncate(stripAnsi(params.result.stderr), 200_000);
  const extensionLog = (params.result.extensionLog ?? '').trim();
  const extensionLogContent = truncate(stripAnsi(extensionLog.length > 0 ? extensionLog : ''), 200_000);
  const stdoutCollapsible = buildCollapsibleSection('stdout', stdoutContent);
  const stderrCollapsible = buildCollapsibleSection('stderr', stderrContent);
  const extensionLogCollapsible = buildCollapsibleSection('実行ログ（拡張機能）', extensionLogContent);

  const sections: string[] = [
    '# テスト実行レポート（自動生成）',
    '',
    summarySection,
    detailsSection,
    '## 実行情報',
    '',
    `- 生成日時: ${tsIso}`,
    `- 生成対象: ${params.generationLabel}`,
    modelLine,
    `- 実行コマンド: \`${params.result.command}\``,
    statusLine,
    skipReasonLine,
    errMsg,
    envLines,
    '',
    `- 対象ファイル:`,
    targets.length > 0 ? targets : '- (なし)',
    '',
    '## 詳細ログ',
    '',
    stdoutCollapsible,
    stderrCollapsible,
    extensionLogCollapsible,
  ];

  return sections
    .filter((line) => line !== '')
    .join('\n');
}

export function emitLogEvent(taskId: string, level: 'info' | 'warn' | 'error', message: string): TestGenEvent {
  return { type: 'log', taskId, level, message, timestampMs: nowMs() };
}

async function writeTextFileEnsuringDir(absDir: string, absolutePath: string, content: string): Promise<void> {
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(absDir));
  await vscode.workspace.fs.writeFile(vscode.Uri.file(absolutePath), Buffer.from(content, 'utf8'));
}

function toWorkspaceRelativePath(workspaceRoot: string, absolutePath: string): string | undefined {
  const rel = path.relative(workspaceRoot, absolutePath);
  if (rel.startsWith('..')) {
    return undefined;
  }
  return rel;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}\n\n... (truncated: ${text.length} chars -> ${maxChars} chars)`;
}


/**
 * テスト結果サマリーのMarkdownを生成する。
 */
function buildTestSummarySection(exitCode: number | null, durationMs: number, testResult: ParsedTestResult): string {
  // 成功判定:
  // 1. exitCode === 0 の場合は成功
  // 2. exitCode === null でも、テスト結果がパースできて失敗数が0なら成功とみなす
  //    （VS Code 拡張機能テストでは Extension Host が別プロセスで起動するため exitCode が null になることがある）
  const isSuccess = exitCode === 0 || (exitCode === null && testResult.parsed && testResult.failed === 0);
  const statusEmoji = isSuccess ? '✅' : '❌';
  const statusText = isSuccess ? '成功' : '失敗';
  const durationSec = (durationMs / 1000).toFixed(1);

  const lines: string[] = [
    '## テスト結果サマリー',
    '',
    `${statusEmoji} **${statusText}** (exitCode: ${exitCode ?? 'null'})`,
    '',
  ];

  if (testResult.parsed) {
    lines.push(
      '| 項目 | 結果 |',
      '|------|------|',
      `| 成功 | ${testResult.passed} |`,
      `| 失敗 | ${testResult.failed} |`,
      `| 合計 | ${testResult.passed + testResult.failed} |`,
      `| 実行時間 | ${durationSec}秒 |`,
      '',
    );
  } else {
    lines.push(`- 実行時間: ${durationSec}秒`, '');
  }

  return lines.join('\n');
}

/**
 * テスト詳細表のMarkdownを生成する。
 */
function buildTestDetailsSection(testResult: ParsedTestResult): string {
  if (!testResult.parsed || testResult.cases.length === 0) {
    return '';
  }

  const lines: string[] = [
    '## テスト詳細',
    '',
    '| スイート | テスト名 | 結果 |',
    '|---------|---------|------|',
  ];

  for (const c of testResult.cases) {
    const resultEmoji = c.passed ? '✅' : '❌';
    const suite = c.suite || '(root)';
    // テーブルセル内のパイプ文字をエスケープ
    const safeName = c.name.replace(/\|/g, '\\|');
    const safeSuite = suite.replace(/\|/g, '\\|');
    lines.push(`| ${safeSuite} | ${safeName} | ${resultEmoji} |`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * 折りたたみ可能な詳細ログセクションを生成する。
 */
function buildCollapsibleSection(title: string, content: string): string {
  const trimmed = content.trim();
  if (trimmed.length === 0 || trimmed === '(ログなし)') {
    return '';
  }
  return [
    '<details>',
    `<summary>${title}（クリックで展開）</summary>`,
    '',
    '```text',
    trimmed,
    '```',
    '',
    '</details>',
    '',
  ].join('\n');
}
