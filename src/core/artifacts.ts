import * as path from 'path';
import * as vscode from 'vscode';
import { nowMs, type TestGenEvent } from './event';

export interface ArtifactSettings {
  includeTestPerspectiveTable: boolean;
  perspectiveReportDir: string;
  testExecutionReportDir: string;
  /** 空文字の場合は実行しない */
  testCommand: string;
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
}

/**
 * 成果物（観点表/実行レポート）保存に関する設定を取得する。
 */
export function getArtifactSettings(): ArtifactSettings {
  const config = vscode.workspace.getConfiguration('testgen-agent');
  return {
    includeTestPerspectiveTable: config.get<boolean>('includeTestPerspectiveTable', true),
    perspectiveReportDir: (config.get<string>('perspectiveReportDir', 'docs/test-perspectives') ?? 'docs/test-perspectives').trim(),
    testExecutionReportDir: (config.get<string>('testExecutionReportDir', 'docs/test-execution-reports') ?? 'docs/test-execution-reports').trim(),
    testCommand: (config.get<string>('testCommand', 'npm test') ?? 'npm test').trim(),
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
  const envLines = [
    `- OS: ${process.platform} (${process.arch})`,
    `- Node.js: ${process.version}`,
    `- VS Code: ${vscode.version}`,
  ].join('\n');

  const stdoutBlock = toCodeBlock('text', truncate(stripAnsi(params.result.stdout), 200_000));
  const stderrBlock = toCodeBlock('text', truncate(stripAnsi(params.result.stderr), 200_000));
  const errMsg = params.result.errorMessage ? `\n- spawn error: ${params.result.errorMessage}` : '';
  const modelLine = params.model && params.model.trim().length > 0 ? `- model: ${params.model}` : '- model: (auto)';

  return [
    '# テスト実行レポート（自動生成）',
    '',
    `- 生成日時: ${tsIso}`,
    `- 生成対象: ${params.generationLabel}`,
    modelLine,
    `- 対象ファイル:`,
    targets.length > 0 ? targets : '- (なし)',
    '',
    '## 実行環境',
    envLines,
    '',
    '## 実行コマンド',
    toCodeBlock('bash', params.result.command),
    '',
    '## 実行結果',
    `- exitCode: ${params.result.exitCode ?? 'null'}`,
    `- signal: ${params.result.signal ?? 'null'}`,
    `- durationMs: ${params.result.durationMs}`,
    errMsg.trim().length > 0 ? errMsg.trim() : '',
    '',
    '## stdout',
    stdoutBlock,
    '',
    '## stderr',
    stderrBlock,
    '',
  ]
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

function stripAnsi(text: string): string {
  // 例: "\u001b[90m" などのANSIエスケープを除去する（文字化けに見えるため）
  // 参考: strip-ansi の実装パターン
  const ansiPattern =
    // eslint-disable-next-line no-control-regex
    /[\u001B\u009B][[\]()#;?]*(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-ORZcf-nqry=><])/g;
  return text.replace(ansiPattern, '');
}

function toCodeBlock(lang: 'bash' | 'text', content: string): string {
  return ['```' + lang, content, '```'].join('\n');
}

