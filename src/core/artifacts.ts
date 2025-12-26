import * as path from 'path';
import * as vscode from 'vscode';
import { nowMs, type TestGenEvent } from './event';
import { t } from './l10n';
import { parseMochaOutput, stripAnsi, type ParsedTestResult, type TestCaseResult } from './testResultParser';

// 型の再エクスポート（既存の利用箇所との互換性のため）
export type { ParsedTestResult, TestCaseResult };
export { parseMochaOutput };

/**
 * テスト観点表（固定列のMarkdown表）へ変換するためのJSONケース定義。
 *
 * cursor-agent からは揺れを避けるため「JSON（マーカー付き）」で返させ、
 * 拡張機能側で必ず同一列・同一順のMarkdown表に整形して保存する。
 */
export interface PerspectiveCase {
  caseId: string;
  inputPrecondition: string;
  perspective: string;
  expectedResult: string;
  notes: string;
}

export interface PerspectiveJsonV1 {
  version: 1;
  cases: PerspectiveCase[];
}

/**
 * cursor-agent のテスト実行結果を、固定レポート生成に使える形へ変換するためのJSON定義。
 *
 * 観点表と同様に、cursor-agent 側には「JSON（マーカー付き）」で返させ、
 * 拡張機能側で必ず同じ章立て・同じ表フォーマットのMarkdownへ整形する。
 */
export interface TestExecutionJsonV1 {
  version: 1;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  stdout: string;
  stderr: string;
}

/**
 * 観点表（Markdownテーブル）のヘッダ行を取得する。
 * VS Code の表示言語に追従する（= 実行時言語で表示される）。
 */
export function getPerspectiveTableHeader(): string {
  return t('artifact.perspectiveTable.tableHeader');
}

/**
 * 観点表（Markdownテーブル）の区切り行を取得する。
 * - Markdown上、ダッシュ数は重要ではないため固定の短い形を採用する
 * - ロケールに依存せず同一の形にする
 */
export function getPerspectiveTableSeparator(): string {
  return '|---|---|---|---|---|';
}

/**
 * 互換性のために残す定数（推奨: getPerspectiveTableHeader / getPerspectiveTableSeparator を使用）。
 *
 * NOTE:
 * - これらの定数は、モジュールロード時に一度だけ初期化されます。
 * - 実行時の言語変更には追従しないため、動的な翻訳が必要な場合はゲッター関数を使用してください。
 */
export const PERSPECTIVE_TABLE_HEADER = getPerspectiveTableHeader();
export const PERSPECTIVE_TABLE_SEPARATOR = getPerspectiveTableSeparator();

export type ParsePerspectiveJsonResult =
  | { ok: true; value: PerspectiveJsonV1 }
  | { ok: false; error: string };

export type ParseTestExecutionJsonResult =
  | { ok: true; value: TestExecutionJsonV1 }
  | { ok: false; error: string };

/**
 * cursor-agent の出力から抽出した JSON テキストを、観点表JSONとしてパースする（多少の揺れに寛容）。
 * - コードフェンスが混入しても除去する
 * - JSON前後に余計なテキストが混入しても `{...}` 部分を推定して切り出す
 */
export function parsePerspectiveJsonV1(raw: string): ParsePerspectiveJsonResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'empty' };
  }

  const unfenced = stripCodeFence(trimmed);
  const trimmedUnfenced = unfenced.trim();

  // 入力が JSON 配列から始まる場合は、内側の `{...}` を拾わずに全体をパースして型検証する。
  // 例: `[{"version":1}]` は JSON だが object ではないため json-not-object とする。
  if (trimmedUnfenced.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmedUnfenced);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `invalid-json: ${msg}` };
    }
    const rec = asRecord(parsed);
    if (!rec) {
      return { ok: false, error: 'json-not-object' };
    }
    // 以降は object として通常の検証へ進める
    const versionRaw = rec.version;
    if (versionRaw !== 1) {
      return { ok: false, error: 'unsupported-version' };
    }

    const casesRaw = rec.cases;
    if (!Array.isArray(casesRaw)) {
      return { ok: false, error: 'cases-not-array' };
    }

    const cases: PerspectiveCase[] = [];
    for (const item of casesRaw) {
      const itemRec = asRecord(item);
      if (!itemRec) {
        continue;
      }
      cases.push({
        caseId: getStringOrEmpty(itemRec.caseId),
        inputPrecondition: getStringOrEmpty(itemRec.inputPrecondition),
        perspective: getStringOrEmpty(itemRec.perspective),
        expectedResult: getStringOrEmpty(itemRec.expectedResult),
        notes: getStringOrEmpty(itemRec.notes),
      });
    }

    return { ok: true, value: { version: 1, cases } };
  }

  const jsonText = extractJsonObject(unfenced);

  let parsed: unknown;
  if (jsonText) {
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `invalid-json: ${msg}` };
    }
  } else {
    // `{...}` が見つからない場合でも、入力自体が JSON（配列/プリミティブ）であればパースして型検証する。
    // 例: [] / "..." / null / true / false は JSON として成立し、object でないため json-not-object を返したい。
    if (trimmedUnfenced.startsWith('{')) {
      // `{` はあるが閉じ `}` がない等のケースは、従来どおり no-json-object 扱いとする。
      return { ok: false, error: 'no-json-object' };
    }
    if (
      trimmedUnfenced.startsWith('[') ||
      trimmedUnfenced.startsWith('"') ||
      trimmedUnfenced === 'null' ||
      trimmedUnfenced === 'true' ||
      trimmedUnfenced === 'false'
    ) {
      try {
        parsed = JSON.parse(trimmedUnfenced);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: `invalid-json: ${msg}` };
      }
    } else {
      return { ok: false, error: 'no-json-object' };
    }
  }

  const rec = asRecord(parsed);
  if (!rec) {
    return { ok: false, error: 'json-not-object' };
  }

  const versionRaw = rec.version;
  if (versionRaw !== 1) {
    return { ok: false, error: 'unsupported-version' };
  }

  const casesRaw = rec.cases;
  if (!Array.isArray(casesRaw)) {
    return { ok: false, error: 'cases-not-array' };
  }

  const cases: PerspectiveCase[] = [];
  for (const item of casesRaw) {
    const itemRec = asRecord(item);
    if (!itemRec) {
      continue;
    }
    cases.push({
      caseId: getStringOrEmpty(itemRec.caseId),
      inputPrecondition: getStringOrEmpty(itemRec.inputPrecondition),
      perspective: getStringOrEmpty(itemRec.perspective),
      expectedResult: getStringOrEmpty(itemRec.expectedResult),
      notes: getStringOrEmpty(itemRec.notes),
    });
  }

  return { ok: true, value: { version: 1, cases } };
}

/**
 * cursor-agent の出力から抽出した JSON テキストを、テスト実行結果JSONとしてパースする（多少の揺れに寛容）。
 * - コードフェンスが混入しても除去する
 * - JSON前後に余計なテキストが混入しても `{...}` 部分を推定して切り出す
 */
export function parseTestExecutionJsonV1(raw: string): ParseTestExecutionJsonResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'empty' };
  }

  const unfenced = stripCodeFence(trimmed);
  const trimmedUnfenced = unfenced.trim();

  // 入力が JSON 配列から始まる場合は、内側の `{...}` を拾わずに全体をパースして型検証する。
  // 例: `[{"version":1}]` は JSON だが object ではないため json-not-object とする。
  if (trimmedUnfenced.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmedUnfenced);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `invalid-json: ${msg}` };
    }
    const rec = asRecord(parsed);
    if (!rec) {
      return { ok: false, error: 'json-not-object' };
    }
    // 以降は object として通常の検証へ進める
    if (rec.version !== 1) {
      return { ok: false, error: 'unsupported-version' };
    }

    const exitCode = getNumberOrNull(rec.exitCode);
    const signal = getStringOrNull(rec.signal);
    const durationMs = getNonNegativeNumberOrDefault(rec.durationMs, 0);
    const stdout = getStringOrEmpty(rec.stdout);
    const stderr = getStringOrEmpty(rec.stderr);

    return {
      ok: true,
      value: {
        version: 1,
        exitCode,
        signal,
        durationMs,
        stdout,
        stderr,
      },
    };
  }

  const jsonText = extractJsonObject(unfenced);

  let parsed: unknown;
  if (jsonText) {
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `invalid-json: ${msg}` };
    }
  } else {
    // `{...}` が見つからない場合でも、入力自体が JSON（配列/プリミティブ）であればパースして型検証する。
    if (trimmedUnfenced.startsWith('{')) {
      return { ok: false, error: 'no-json-object' };
    }
    if (
      trimmedUnfenced.startsWith('[') ||
      trimmedUnfenced.startsWith('"') ||
      trimmedUnfenced === 'null' ||
      trimmedUnfenced === 'true' ||
      trimmedUnfenced === 'false'
    ) {
      try {
        parsed = JSON.parse(trimmedUnfenced);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: `invalid-json: ${msg}` };
      }
    } else {
      return { ok: false, error: 'no-json-object' };
    }
  }

  const rec = asRecord(parsed);
  if (!rec) {
    return { ok: false, error: 'json-not-object' };
  }

  if (rec.version !== 1) {
    return { ok: false, error: 'unsupported-version' };
  }

  const exitCode = getNumberOrNull(rec.exitCode);
  const signal = getStringOrNull(rec.signal);
  const durationMs = getNonNegativeNumberOrDefault(rec.durationMs, 0);
  const stdout = getStringOrEmpty(rec.stdout);
  const stderr = getStringOrEmpty(rec.stderr);

  return {
    ok: true,
    value: {
      version: 1,
      exitCode,
      signal,
      durationMs,
      stdout,
      stderr,
    },
  };
}

/**
 * 観点表ケース配列を、列固定のMarkdown表へレンダリングする。
 * - セル内改行は表パーサ互換性のためスペースへ潰す
 * - パイプ（|）は `\\|` にエスケープする
 */
export function renderPerspectiveMarkdownTable(cases: PerspectiveCase[]): string {
  const rows: string[] = [getPerspectiveTableHeader(), getPerspectiveTableSeparator()];
  for (const c of cases) {
    rows.push(
      `| ${normalizeTableCell(c.caseId)} | ${normalizeTableCell(c.inputPrecondition)} | ${normalizeTableCell(c.perspective)} | ${normalizeTableCell(c.expectedResult)} | ${normalizeTableCell(c.notes)} |`,
    );
  }
  return `${rows.join('\n')}\n`;
}

export interface ArtifactSettings {
  includeTestPerspectiveTable: boolean;
  perspectiveReportDir: string;
  /**
   * テスト観点表生成（cursor-agent）の最大実行時間（ミリ秒）。
   * 0 以下の場合はタイムアウトしない。
   */
  perspectiveGenerationTimeoutMs: number;
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
   *
   * 以前は拡張機能内のテスト実行で「VS Code 起動の可能性」を検出した場合にスキップしていたため、
   * その挙動を上書きするためのフラグとして使用していた。
   *
   * 現在は改善策により **常にテストを実行する** 方針のため、本設定は互換性のために残している。
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
   * - 例: testCommand が空のため実行しない
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
  const runnerRaw = config.get<string>('testExecutionRunner', 'extension');
  const runnerTrimmed = (runnerRaw ?? 'extension').trim();
  // 設定値が空文字/空白のみの場合は「未指定」とみなし、既定値（extension）へフォールバックする。
  const runner: ArtifactSettings['testExecutionRunner'] =
    runnerTrimmed.length === 0 ? 'extension' : runnerTrimmed === 'extension' ? 'extension' : 'cursorAgent';
  const perspectiveTimeoutRaw = config.get<number>('perspectiveGenerationTimeoutMs', 300_000);
  const perspectiveGenerationTimeoutMs =
    typeof perspectiveTimeoutRaw === 'number' && Number.isFinite(perspectiveTimeoutRaw) && perspectiveTimeoutRaw > 0 ? perspectiveTimeoutRaw : 0;
  return {
    includeTestPerspectiveTable: config.get<boolean>('includeTestPerspectiveTable', true),
    perspectiveReportDir: (config.get<string>('perspectiveReportDir', 'docs/test-perspectives') ?? 'docs/test-perspectives').trim(),
    perspectiveGenerationTimeoutMs,
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
  assertNumber(params.generatedAtMs, 'generatedAtMs');
  const tsLocal = formatLocalIso8601WithOffset(new Date(params.generatedAtMs));
  const targets = params.targetPaths.map((p) => `- ${p}`).join('\n');
  const table = params.perspectiveMarkdown.trim();
  return [
    `# ${t('artifact.perspectiveTable.title')}`,
    '',
    `- ${t('artifact.perspectiveTable.generatedAt')}: ${tsLocal}`,
    `- ${t('artifact.perspectiveTable.target')}: ${params.targetLabel}`,
    `- ${t('artifact.perspectiveTable.targetFiles')}:`,
    targets.length > 0 ? targets : `- ${t('artifact.none')}`,
    '',
    '---',
    '',
    table.length > 0 ? table : t('artifact.perspectiveTable.empty'),
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
  assertNumber(params.generatedAtMs, 'generatedAtMs');
  const tsLocal = formatLocalIso8601WithOffset(new Date(params.generatedAtMs));
  const targets = params.targetPaths.map((p) => `- ${p}`).join('\n');
  const modelLine =
    params.model && params.model.trim().length > 0
      ? `- ${t('artifact.executionReport.model')}: ${params.model}`
      : `- ${t('artifact.executionReport.model')}: ${t('artifact.executionReport.modelAuto')}`;

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
  const errMsg = params.result.errorMessage
    ? `- ${t('artifact.executionReport.spawnError')}: ${params.result.errorMessage}`
    : '';
  const statusLine = params.result.skipped
    ? `- ${t('artifact.executionReport.status')}: ${t('artifact.executionReport.statusSkipped')}`
    : `- ${t('artifact.executionReport.status')}: ${t('artifact.executionReport.statusExecuted')}`;
  const skipReasonLine =
    params.result.skipped && params.result.skipReason && params.result.skipReason.trim().length > 0
      ? `- ${t('artifact.executionReport.skipReason')}: ${params.result.skipReason.trim()}`
      : '';

  // 折りたたみ式の詳細ログセクション
  const stdoutContent = truncate(stripAnsi(params.result.stdout), 200_000);
  const stderrContent = truncate(stripAnsi(params.result.stderr), 200_000);
  const extensionLog = (params.result.extensionLog ?? '').trim();
  const extensionLogContent = truncate(stripAnsi(extensionLog.length > 0 ? extensionLog : ''), 200_000);
  const stdoutCollapsible = buildCollapsibleSection('stdout', stdoutContent);
  const stderrCollapsible = buildCollapsibleSection('stderr', stderrContent);
  const extensionLogCollapsible = buildCollapsibleSection(
    t('artifact.executionReport.extensionLog'),
    extensionLogContent,
  );

  const sections: string[] = [
    `# ${t('artifact.executionReport.title')}`,
    `## ${t('artifact.executionReport.executionInfo')}`,
    '',
    `- ${t('artifact.executionReport.generatedAt')}: ${tsLocal}`,
    `- ${t('artifact.executionReport.generationTarget')}: ${params.generationLabel}`,
    modelLine,
    `- ${t('artifact.executionReport.executionCommand')}: \`${params.result.command}\``,
    statusLine,
    skipReasonLine,
    errMsg,
    envLines,
    '',
    `- ${t('artifact.executionReport.targetFiles')}:`,
    targets.length > 0 ? targets : `- ${t('artifact.none')}`,
    '',
    summarySection,
    detailsSection,
    `## ${t('artifact.executionReport.detailedLogs')}`,
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

function assertNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number') {
    throw new TypeError(`${label} must be a number`);
  }
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

/**
 * ローカル時刻を視認性の良い形式（UTCオフセット付き）で整形する。
 *
 * 例: 2025-12-25  02:50:12.204 +09:00
 */
function formatLocalIso8601WithOffset(date: Date): string {
  const yyyy = String(date.getFullYear());
  const MM = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mm = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  const SSS = pad3(date.getMilliseconds());

  // Date#getTimezoneOffset は「UTC - ローカル」の分。ISO表記の符号とは逆になるので反転する。
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const offH = pad2(Math.floor(abs / 60));
  const offM = pad2(abs % 60);

  // 例: 2025-12-25␠␠04:25:26.549␠+09:00
  return `${yyyy}-${MM}-${dd}  ${hh}:${mm}:${ss}.${SSS} ${sign}${offH}:${offM}`;
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
  const statusText = isSuccess ? t('artifact.executionReport.success') : t('artifact.executionReport.failure');
  const durationSec = (durationMs / 1000).toFixed(1);

  const lines: string[] = [
    `## ${t('artifact.executionReport.testSummary')}`,
    '',
    `${statusEmoji} **${statusText}** (exitCode: ${exitCode ?? 'null'})`,
    '',
  ];

  const passed = testResult.parsed ? String(testResult.passed) : '-';
  const failed = testResult.parsed ? String(testResult.failed) : '-';
  const total = testResult.parsed ? String(testResult.passed + testResult.failed) : '-';
  lines.push(
    `| ${t('artifact.tableHeader.item')} | ${t('artifact.tableHeader.result')} |`,
    '|------|------|',
    `| ${t('artifact.executionReport.passed')} | ${passed} |`,
    `| ${t('artifact.executionReport.failed')} | ${failed} |`,
    `| ${t('artifact.executionReport.total')} | ${total} |`,
    `| ${t('artifact.executionReport.duration')} | ${durationSec} ${t('artifact.executionReport.seconds')} |`,
    '',
  );

  return lines.join('\n');
}

/**
 * テスト詳細表のMarkdownを生成する。
 */
function buildTestDetailsSection(testResult: ParsedTestResult): string {
  const lines: string[] = [
    `## ${t('artifact.executionReport.testDetails')}`,
    '',
    `| ${t('artifact.executionReport.suite')} | ${t('artifact.executionReport.testName')} | ${t('artifact.executionReport.result')} |`,
    '|---------|---------|------|',
  ];

  if (!testResult.parsed || testResult.cases.length === 0) {
    lines.push('');
    return lines.join('\n');
  }

  for (const c of testResult.cases) {
    const resultEmoji = c.passed ? '✅' : '❌';
    const suite = c.suite || '(root)';
    const safeName = normalizeTableCell(c.name);
    const safeSuite = normalizeTableCell(suite);
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
  if (trimmed.length === 0 || trimmed === t('artifact.noLog')) {
    return '';
  }
  return [
    '<details>',
    `<summary>${title}${t('artifact.executionReport.clickToExpand')}</summary>`,
    '',
    '```text',
    trimmed,
    '```',
    '',
    '</details>',
    '',
  ].join('\n');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function getStringOrEmpty(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return '';
}

function getStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const s = getStringOrEmpty(value);
  return s.length > 0 ? s : null;
}

function getNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const n = Number(value.trim());
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
}

function getNonNegativeNumberOrDefault(value: unknown, defaultValue: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string') {
    const n = Number(value.trim());
    if (Number.isFinite(n) && n >= 0) {
      return n;
    }
  }
  return defaultValue;
}

function normalizeTableCell(value: string): string {
  // Markdown表セルを壊しやすい文字（改行、パイプ）を正規化する
  const withoutCrlf = value.replace(/\r\n/g, '\n');
  const withoutLf = withoutCrlf.replace(/\n+/g, ' ');
  const collapsedSpaces = withoutLf.replace(/\s+/g, ' ').trim();
  return collapsedSpaces.replace(/\|/g, '\\|');
}

function stripCodeFence(text: string): string {
  const trimmedText = text.trim();
  if (!trimmedText.startsWith('```')) {
    return trimmedText;
  }
  const firstNewline = trimmedText.indexOf('\n');
  if (firstNewline === -1) {
    return trimmedText;
  }
  const lastFence = trimmedText.lastIndexOf('```');
  if (lastFence <= 0 || lastFence === 0) {
    return trimmedText;
  }
  if (lastFence <= firstNewline) {
    return trimmedText;
  }
  return trimmedText.slice(firstNewline + 1, lastFence).trim();
}

function extractJsonObject(text: string): string | undefined {
  const start = text.indexOf('{');
  if (start === -1) {
    return undefined;
  }
  const end = text.lastIndexOf('}');
  if (end === -1 || end <= start) {
    return undefined;
  }
  return text.slice(start, end + 1).trim();
}
