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

export type TestCaseState = 'passed' | 'failed' | 'pending';

export interface TestCaseInfo {
  suite?: string;
  title?: string;
  fullTitle?: string;
  state?: TestCaseState;
  durationMs?: number;
}

export interface FailedTestInfo {
  title: string;
  fullTitle: string;
  error: string;
  stack?: string;
  code?: string;
  expected?: string;
  actual?: string;
}

export interface TestResultFile {
  timestamp?: number;
  platform?: string;
  arch?: string;
  nodeVersion?: string;
  vscodeVersion?: string;
  failures?: number;
  passes?: number;
  pending?: number;
  total?: number;
  durationMs?: number;
  tests?: TestCaseInfo[];
  failedTests?: FailedTestInfo[];
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

export type ParseTestResultFileResult =
  | { ok: true; value: TestResultFile }
  | { ok: false; error: string };

function parseJsonWithNormalization(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const first = tryParseJson(raw);
  if (first.ok) {
    return first;
  }

  const normalized = normalizeJsonWithBareNewlines(raw);
  if (normalized === raw) {
    return first;
  }

  const retry = tryParseJson(normalized);
  return retry;
}

function tryParseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `invalid-json: ${msg}` };
  }
}

/**
 * 文字列内の「生の改行」をエスケープし、JSONとしてパース可能な形に整える。
 * - Gemini などが JSON 文字列内に改行を含めるケースの補正用
 */
function normalizeJsonWithBareNewlines(raw: string): string {
  let inString = false;
  let escaped = false;
  let changed = false;
  const out: string[] = [];

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        if (ch === '\n') {
          out.push('\\n');
          changed = true;
          continue;
        }
        if (ch === '\r') {
          out.push('\\r');
          changed = true;
          continue;
        }
        out.push(ch);
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        out.push(ch);
        continue;
      }
      if (ch === '"') {
        inString = false;
        out.push(ch);
        continue;
      }
      if (ch === '\n') {
        out.push('\\n');
        changed = true;
        continue;
      }
      if (ch === '\r') {
        out.push('\\r');
        changed = true;
        continue;
      }
      out.push(ch);
      continue;
    }

    if (ch === '"') {
      inString = true;
      out.push(ch);
      continue;
    }

    out.push(ch);
  }

  if (!changed) {
    return raw;
  }
  return out.join('');
}

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
    const parsedResult = parseJsonWithNormalization(trimmedUnfenced);
    if (!parsedResult.ok) {
      return { ok: false, error: parsedResult.error };
    }
    const parsed = parsedResult.value;
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

  // `{` で始まる場合、まず全体を JSON として直接パースを試す。
  // これにより「マーカー内が純 JSON なのに extractJsonObject で誤判定」を防ぐ。
  // 文字列内に `{}` を含む JSON（例: `"assert.deepStrictEqual(x, { a: 1 })"`）でも正しくパースできる。
  let parsed: unknown;
  if (trimmedUnfenced.startsWith('{')) {
    const directParseResult = parseJsonWithNormalization(trimmedUnfenced);
    if (directParseResult.ok) {
      const parsedValue = directParseResult.value;
      const rec = asRecord(parsedValue);
      if (rec) {
        // 直接パースが成功し、object として検証可能な場合はここで処理
        const versionRaw = rec.version;
        if (versionRaw === 1) {
          const casesRaw = rec.cases;
          if (Array.isArray(casesRaw)) {
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
        }
      }
    }
    // 直接パースが失敗した場合、エラーを保存して推定抽出へフォールバック
    // 推定抽出も失敗した場合は、直接パースのエラー（invalid-json: を含む）を返す
    const directParseError = directParseResult.ok ? undefined : directParseResult.error;
    const jsonText = extractJsonObject(unfenced);
    if (jsonText) {
      const parsedResult = parseJsonWithNormalization(jsonText);
      if (!parsedResult.ok) {
        return { ok: false, error: parsedResult.error };
      }
      parsed = parsedResult.value;
    } else {
      // `{` 始まりで直接パースも extractJsonObject も失敗した場合、
      // 直接パースのエラー（invalid-json: を含む）を優先して返す
      if (directParseError) {
        return { ok: false, error: directParseError };
      }
      return { ok: false, error: 'no-json-object' };
    }
  } else {
    // `{` で始まらない場合は従来どおりの処理
    const jsonText = extractJsonObject(unfenced);

    if (jsonText) {
      const parsedResult = parseJsonWithNormalization(jsonText);
      if (!parsedResult.ok) {
        return { ok: false, error: parsedResult.error };
      }
      parsed = parsedResult.value;
    } else {
      // `{...}` が見つからない場合でも、入力自体が JSON（配列/プリミティブ）であればパースして型検証する。
      // 例: [] / "..." / null / true / false は JSON として成立し、object でないため json-not-object を返したい。
      if (
        trimmedUnfenced.startsWith('[') ||
        trimmedUnfenced.startsWith('"') ||
        trimmedUnfenced === 'null' ||
        trimmedUnfenced === 'true' ||
        trimmedUnfenced === 'false'
      ) {
        const parsedResult = parseJsonWithNormalization(trimmedUnfenced);
        if (!parsedResult.ok) {
          return { ok: false, error: parsedResult.error };
        }
        parsed = parsedResult.value;
      } else {
        return { ok: false, error: 'no-json-object' };
      }
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
    const parsedResult = parseJsonWithNormalization(trimmedUnfenced);
    if (!parsedResult.ok) {
      return { ok: false, error: parsedResult.error };
    }
    const parsed = parsedResult.value;
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

  // `{` で始まる場合、まず全体を JSON として直接パースを試す。
  // これにより「マーカー内が純 JSON なのに extractJsonObject で誤判定」を防ぐ。
  // 文字列内に `{}` を含む JSON（例: `"stdout": "error: { code: 1 }"`）でも正しくパースできる。
  let directParseError: string | undefined;
  if (trimmedUnfenced.startsWith('{')) {
    const directParseResult = parseJsonWithNormalization(trimmedUnfenced);
    if (directParseResult.ok) {
      const parsed = directParseResult.value;
      const rec = asRecord(parsed);
      if (rec) {
        // 直接パースが成功し、object として検証可能な場合はここで処理
        if (rec.version === 1) {
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
      }
    }
    // 直接パースが失敗した場合、または object として検証できない場合は推定抽出へフォールバック
    if (!directParseResult.ok) {
      directParseError = directParseResult.error;
    }
  }

  const jsonText = extractJsonObject(unfenced);

  let parsed: unknown;
  if (jsonText) {
    const parsedResult = parseJsonWithNormalization(jsonText);
    if (!parsedResult.ok) {
      return { ok: false, error: parsedResult.error };
    }
    parsed = parsedResult.value;
  } else {
    // `{...}` が見つからない場合でも、入力自体が JSON（配列/プリミティブ）であればパースして型検証する。
    if (trimmedUnfenced.startsWith('{')) {
      // `{` 始まりで直接パースが失敗している場合は invalid-json を優先する（原因が分かりやすい）
      if (directParseError) {
        return { ok: false, error: directParseError };
      }
      return { ok: false, error: 'no-json-object' };
    }
    if (
      trimmedUnfenced.startsWith('[') ||
      trimmedUnfenced.startsWith('"') ||
      trimmedUnfenced === 'null' ||
      trimmedUnfenced === 'true' ||
      trimmedUnfenced === 'false'
    ) {
      const parsedResult = parseJsonWithNormalization(trimmedUnfenced);
      if (!parsedResult.ok) {
        return { ok: false, error: parsedResult.error };
      }
      parsed = parsedResult.value;
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
 * test-result.json をパースし、実行レポート用の構造化データとして抽出する。
 */
export function parseTestResultFile(raw: string): ParseTestResultFileResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'empty' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `invalid-json: ${msg}` };
  }

  const rec = asRecord(parsed);
  if (!rec) {
    return { ok: false, error: 'json-not-object' };
  }

  const testsRaw = Array.isArray(rec.tests) ? rec.tests : [];
  const tests: TestCaseInfo[] = [];
  for (const item of testsRaw) {
    const itemRec = asRecord(item);
    if (!itemRec) {
      continue;
    }
    const state = normalizeTestCaseState(itemRec.state);
    tests.push({
      suite: getStringOrUndefined(itemRec.suite),
      title: getStringOrUndefined(itemRec.title),
      fullTitle: getStringOrUndefined(itemRec.fullTitle),
      state,
      durationMs: getNumberOrUndefined(itemRec.durationMs),
    });
  }

  const failedTestsRaw = Array.isArray(rec.failedTests) ? rec.failedTests : [];
  const failedTests: FailedTestInfo[] = [];
  for (const item of failedTestsRaw) {
    const itemRec = asRecord(item);
    if (!itemRec) {
      continue;
    }
    failedTests.push({
      title: getStringOrEmpty(itemRec.title),
      fullTitle: getStringOrEmpty(itemRec.fullTitle),
      error: getStringOrEmpty(itemRec.error),
      stack: getStringOrUndefined(itemRec.stack),
      code: getStringOrUndefined(itemRec.code),
      expected: getStringOrUndefined(itemRec.expected),
      actual: getStringOrUndefined(itemRec.actual),
    });
  }

  // 環境情報フィールドは厳密な文字列型のみを受理（数値・真偽値は undefined にフォールバック）
  const vscodeVersion = getStrictStringOrUndefined(rec.vscodeVersion);
  const platform = getStrictStringOrUndefined(rec.platform);
  const arch = getStrictStringOrUndefined(rec.arch);
  const nodeVersion = getStrictStringOrUndefined(rec.nodeVersion);

  const result: TestResultFile = {
    timestamp: getNumberOrUndefined(rec.timestamp),
    platform,
    arch,
    nodeVersion,
    vscodeVersion,
    failures: getNumberOrUndefined(rec.failures),
    passes: getNumberOrUndefined(rec.passes),
    pending: getNumberOrUndefined(rec.pending),
    total: getNumberOrUndefined(rec.total),
    durationMs: getNumberOrUndefined(rec.durationMs),
    tests: tests.length > 0 ? tests : undefined,
    failedTests: failedTests.length > 0 ? failedTests : undefined,
  };

  return { ok: true, value: result };
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
  /**
   * 生成後に戦略準拠チェック（G/W/T、境界値、例外メッセージ、caseID網羅）を行う。
   */
  enableStrategyComplianceCheck: boolean;
  /**
   * 戦略準拠の問題が見つかった場合の自動修正最大試行回数。0の場合は自動修正なし。
   */
  strategyComplianceAutoFixMaxRetries: number;
}

export interface SavedArtifact {
  absolutePath: string;
  relativePath?: string;
}

export type TestExecutionRunner = 'extension' | 'cursorAgent' | 'unknown';

export interface TestExecutionResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  /** 収集時にstdoutが切り詰められた場合は true */
  stdoutTruncated?: boolean;
  /** 収集時にstderrが切り詰められた場合は true */
  stderrTruncated?: boolean;
  errorMessage?: string;
  /**
   * テスト実行の担当者。
   * - extension: 拡張機能で実行
   * - cursorAgent: cursor-agent で実行
   * - unknown: 不明/未設定
   */
  executionRunner?: TestExecutionRunner;
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
  /**
   * test-result.json から抽出した構造化テスト結果（取得できた場合のみ）。
   */
  testResult?: TestResultFile;
  /** test-result.json の参照パス（読み取りを試みた場所） */
  testResultPath?: string;
  /** レポート生成時の拡張機能バージョン */
  extensionVersion?: string;
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
  const perspectiveTimeoutRaw = config.get<number>('perspectiveGenerationTimeoutMs', 600_000);
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
    enableStrategyComplianceCheck: config.get<boolean>('enableStrategyComplianceCheck', true),
    strategyComplianceAutoFixMaxRetries: Math.max(0, Math.min(5, config.get<number>('strategyComplianceAutoFixMaxRetries', 1) ?? 1)),
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
  const targets = params.targetPaths.map((p) => `  - ${p}`).join('\n');
  const table = params.perspectiveMarkdown.trim();
  return [
    `# ${t('artifact.perspectiveTable.title')}`,
    '',
    `- ${t('artifact.perspectiveTable.generatedAt')}: ${tsLocal}`,
    `- ${t('artifact.perspectiveTable.target')}: ${params.targetLabel}`,
    `- ${t('artifact.perspectiveTable.targetFiles')}:`,
    targets.length > 0 ? targets : `  - ${t('artifact.none')}`,
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
  const targets = params.targetPaths.map((p) => `  - ${p}`).join('\n');
  const modelLine =
    params.model && params.model.trim().length > 0
      ? `- ${t('artifact.executionReport.model')}: ${params.model}`
      : `- ${t('artifact.executionReport.model')}: ${t('artifact.executionReport.modelAuto')}`;
  const executionRunnerLine = `- ${t('artifact.executionReport.executionRunner')}: ${resolveExecutionRunnerLabel(params.result.executionRunner)}`;
  const extensionVersionLine = `- ${t('artifact.executionReport.extensionVersion')}: ${resolveOptionalLabel(params.result.extensionVersion)}`;
  const testResultPathLine = `- ${t('artifact.executionReport.testResultPath')}: ${formatTestResultPathLabel(params.result.testResultPath)}`;

  // stdoutをパースしてテスト結果を抽出
  const testResult = parseMochaOutput(params.result.stdout);
  const summarySection = buildTestSummarySection(params.result.exitCode, params.result.durationMs, testResult, params.result.testResult);
  const failureDetailsSection = buildFailureDetailsSection(params.result.testResult);
  const detailsSection = buildTestDetailsSection(testResult);

  // 実行情報
  const executionEnv = resolveExecutionEnvironment(params.result);
  const envSourceLabel = resolveExecutionEnvironmentSourceLabel(executionEnv.source);
  const envLines = [
    `- OS: ${executionEnv.platform} (${executionEnv.arch})`,
    `- Node.js: ${executionEnv.nodeVersion}`,
    `- VS Code: ${executionEnv.vscodeVersion}`,
    `- ${t('artifact.executionReport.envSource')}: ${envSourceLabel}`,
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
  const maxLogChars = 200_000;
  const stdoutRaw = stripAnsi(params.result.stdout);
  const stderrRaw = stripAnsi(params.result.stderr);
  const stdoutReportTruncated = stdoutRaw.length > maxLogChars;
  const stderrReportTruncated = stderrRaw.length > maxLogChars;
  const stdoutContent = truncate(stdoutRaw, maxLogChars);
  const stderrContent = truncate(stderrRaw, maxLogChars);
  const extensionLog = (params.result.extensionLog ?? '').trim();
  const extensionLogContent = truncate(stripAnsi(extensionLog.length > 0 ? extensionLog : ''), maxLogChars);
  const stdoutCollapsible = buildCollapsibleSection('stdout', stdoutContent);
  const stderrCollapsible = buildCollapsibleSection('stderr', stderrContent);
  const extensionLogCollapsible = buildCollapsibleSection(
    t('artifact.executionReport.extensionLog'),
    extensionLogContent,
  );
  const truncationLines = [
    buildTruncationLine(t('artifact.executionReport.truncation.stdout'), params.result.stdoutTruncated, stdoutReportTruncated),
    buildTruncationLine(t('artifact.executionReport.truncation.stderr'), params.result.stderrTruncated, stderrReportTruncated),
  ].join('\n');

  const sections: string[] = [
    `# ${t('artifact.executionReport.title')}`,
    `## ${t('artifact.executionReport.executionInfo')}`,
    '',
    `- ${t('artifact.executionReport.generatedAt')}: ${tsLocal}`,
    `- ${t('artifact.executionReport.generationTarget')}: ${params.generationLabel}`,
    modelLine,
    extensionVersionLine,
    `- ${t('artifact.executionReport.executionCommand')}: \`${params.result.command}\``,
    statusLine,
    skipReasonLine,
    errMsg,
    executionRunnerLine,
    envLines,
    testResultPathLine,
    '',
    `- ${t('artifact.executionReport.targetFiles')}:`,
    targets.length > 0 ? targets : `  - ${t('artifact.none')}`,
    '',
    summarySection,
    failureDetailsSection,
    detailsSection,
    `## ${t('artifact.executionReport.detailedLogs')}`,
    '',
    truncationLines,
    stdoutCollapsible,
    stderrCollapsible,
    extensionLogCollapsible,
  ];

  return sections.join('\n').trimEnd();
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
function buildTestSummarySection(
  exitCode: number | null,
  durationMs: number,
  testResult: ParsedTestResult,
  structuredResult: TestResultFile | undefined,
): string {
  const summary = resolveSummaryCounts(testResult, structuredResult);
  const hasFailedCount = summary.hasCounts && typeof summary.failed === 'number';
  // 成功判定:
  // 1. exitCode === 0 の場合は成功
  // 2. exitCode === null でも、テスト結果が取得できて失敗数が0なら成功とみなす
  //    （VS Code 拡張機能テストでは Extension Host が別プロセスで起動するため exitCode が null になることがある）
  const isSuccess = exitCode === 0 || (exitCode === null && hasFailedCount && summary.failed === 0);
  const statusEmoji = isSuccess ? '✅' : '❌';
  const statusText = isSuccess ? t('artifact.executionReport.success') : t('artifact.executionReport.failure');
  const durationSec = (durationMs / 1000).toFixed(1);

  const lines: string[] = [
    `## ${t('artifact.executionReport.testSummary')}`,
    '',
    `${statusEmoji} **${statusText}** (exitCode: ${exitCode ?? 'null'})`,
    '',
  ];

  const passed = summary.hasCounts && typeof summary.passed === 'number' ? String(summary.passed) : '-';
  const failed = summary.hasCounts && typeof summary.failed === 'number' ? String(summary.failed) : '-';
  const pending = summary.hasCounts && typeof summary.pending === 'number' ? String(summary.pending) : '-';
  const total = summary.hasCounts && typeof summary.total === 'number' ? String(summary.total) : '-';
  lines.push(
    `| ${t('artifact.tableHeader.item')} | ${t('artifact.tableHeader.result')} |`,
    '|------|------|',
    `| ${t('artifact.executionReport.passed')} | ${passed} |`,
    `| ${t('artifact.executionReport.failed')} | ${failed} |`,
    `| ${t('artifact.executionReport.pending')} | ${pending} |`,
    `| ${t('artifact.executionReport.total')} | ${total} |`,
    `| ${t('artifact.executionReport.duration')} | ${durationSec} ${t('artifact.executionReport.seconds')} |`,
    '',
  );

  return lines.join('\n');
}

/**
 * test-result.json に含まれる失敗詳細をレポートへ整形する。
 */
function buildFailureDetailsSection(testResult: TestResultFile | undefined): string {
  const failedTests = testResult?.failedTests;
  if (!failedTests || failedTests.length === 0) {
    return '';
  }

  const maxDetailChars = 20_000;
  const lines: string[] = [
    `## ${t('artifact.executionReport.failureDetails')}`,
    '',
  ];

  let index = 1;
  for (const entry of failedTests) {
    const title = normalizeInlineText(entry.fullTitle || entry.title || '(unknown)');
    lines.push(`### ${index}. ${title}`);

    const message = normalizeInlineText(entry.error ?? '');
    if (message.length > 0) {
      lines.push(`- ${t('artifact.executionReport.failureMessage')}: ${message}`);
    }

    const code = normalizeInlineText(entry.code ?? '');
    if (code.length > 0) {
      lines.push(`- ${t('artifact.executionReport.failureCode')}: ${code}`);
    }

    const expected = normalizeMultilineText(entry.expected ?? '');
    if (expected.length > 0) {
      lines.push(`- ${t('artifact.executionReport.expected')}:`);
      lines.push('```text');
      lines.push(truncate(expected, maxDetailChars));
      lines.push('```');
    }

    const actual = normalizeMultilineText(entry.actual ?? '');
    if (actual.length > 0) {
      lines.push(`- ${t('artifact.executionReport.actual')}:`);
      lines.push('```text');
      lines.push(truncate(actual, maxDetailChars));
      lines.push('```');
    }

    const stack = normalizeMultilineText(entry.stack ?? '');
    if (stack.length > 0) {
      const stackSection = buildCollapsibleSection(
        t('artifact.executionReport.stackTrace'),
        truncate(stack, maxDetailChars),
      );
      if (stackSection) {
        lines.push(stackSection.trimEnd());
      }
    }

    lines.push('');
    index += 1;
  }

  return lines.join('\n');
}

type ExecutionEnvironmentSource = 'execution' | 'local' | 'unknown';

type ExecutionEnvironment = {
  platform: string;
  arch: string;
  nodeVersion: string;
  vscodeVersion: string;
  source: ExecutionEnvironmentSource;
};

/**
 * 実行環境情報を取得する。
 * - test-result.json の値を優先する
 * - 拡張機能実行のみローカル値へフォールバックする
 * - それ以外は unknown として扱う
 */
function resolveExecutionEnvironment(result: TestExecutionResult): ExecutionEnvironment {
  const unknownLabel = t('artifact.executionReport.unknown');
  const testResult = result.testResult;

  const platform = getStrictStringOrUndefined(testResult?.platform);
  const arch = getStrictStringOrUndefined(testResult?.arch);
  const nodeVersion = getStrictStringOrUndefined(testResult?.nodeVersion);
  const vscodeVersion = getStrictStringOrUndefined(testResult?.vscodeVersion);

  const hasAny = [platform, arch, nodeVersion, vscodeVersion].some((value) => value !== undefined);
  const hasAll = [platform, arch, nodeVersion, vscodeVersion].every((value) => value !== undefined);
  const canUseLocalFallback = result.executionRunner === 'extension';

  const resolveValue = (value: string | undefined, fallback: string): string => {
    if (value !== undefined) {
      return value;
    }
    if (canUseLocalFallback) {
      return fallback;
    }
    return unknownLabel;
  };

  let source: ExecutionEnvironmentSource;
  if (hasAll) {
    source = 'execution';
  } else if (hasAny) {
    source = canUseLocalFallback ? 'local' : 'execution';
  } else if (canUseLocalFallback) {
    source = 'local';
  } else {
    source = 'unknown';
  }

  return {
    platform: resolveValue(platform, process.platform),
    arch: resolveValue(arch, process.arch),
    nodeVersion: resolveValue(nodeVersion, process.version),
    vscodeVersion: resolveValue(vscodeVersion, vscode.version),
    source,
  };
}

function resolveExecutionEnvironmentSourceLabel(source: ExecutionEnvironmentSource): string {
  if (source === 'execution') {
    return t('artifact.executionReport.envSource.execution');
  }
  if (source === 'local') {
    return t('artifact.executionReport.envSource.local');
  }
  return t('artifact.executionReport.envSource.unknown');
}

function resolveExecutionRunnerLabel(runner: TestExecutionRunner | undefined): string {
  if (runner === 'extension') {
    return t('artifact.executionReport.executionRunner.extension');
  }
  if (runner === 'cursorAgent') {
    return t('artifact.executionReport.executionRunner.cursorAgent');
  }
  return t('artifact.executionReport.unknown');
}

function resolveOptionalLabel(value: string | undefined): string {
  return getStrictStringOrUndefined(value) ?? t('artifact.executionReport.unknown');
}

function formatTestResultPathLabel(value: string | undefined): string {
  const resolved = getStrictStringOrUndefined(value);
  if (!resolved) {
    return t('artifact.executionReport.unknown');
  }
  return `\`${resolved}\``;
}

function resolveTruncationStatusLabel(truncated: boolean | undefined): string {
  if (truncated === true) {
    return t('artifact.executionReport.truncation.truncated');
  }
  if (truncated === false) {
    return t('artifact.executionReport.truncation.notTruncated');
  }
  return t('artifact.executionReport.unknown');
}

function buildTruncationLine(label: string, captureTruncated: boolean | undefined, reportTruncated: boolean): string {
  const captureLabel = resolveTruncationStatusLabel(captureTruncated);
  const reportLabel = resolveTruncationStatusLabel(reportTruncated);
  return `- ${label}: ${t('artifact.executionReport.truncation.capture')}=${captureLabel}, ${t('artifact.executionReport.truncation.report')}=${reportLabel}`;
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

type SummaryCounts = {
  hasCounts: boolean;
  passed?: number;
  failed?: number;
  pending?: number;
  total?: number;
};

/**
 * パネル表示用のテスト結果サマリーを計算する。
 *
 * レポート本文の成功判定（buildTestSummarySection + resolveSummaryCounts）と同じロジックを採用。
 * - skipped=true の場合は success=null（スキップ扱い）
 * - exitCode===0 → success=true
 * - exitCode===null でも失敗数が0と判定できる場合は success=true
 *   （tests配列から計算 → failures プロパティにフォールバック）
 * - それ以外は success=false
 */
export function computeTestReportSummary(params: {
  exitCode: number | null;
  skipped: boolean;
  testResult?: TestResultFile;
}): { success: boolean | null; exitCode: number | null } {
  if (params.skipped) {
    return { success: null, exitCode: params.exitCode };
  }

  // exitCode===0 なら成功
  if (params.exitCode === 0) {
    return { success: true, exitCode: params.exitCode };
  }

  // exitCode===null の場合は、resolveSummaryCounts と同じ優先度で失敗数を判定
  // 1. tests 配列から failed をカウント
  // 2. failures プロパティにフォールバック
  if (params.exitCode === null && params.testResult) {
    const tests = params.testResult.tests;
    if (Array.isArray(tests) && tests.length > 0) {
      let failedCount = 0;
      for (const t of tests) {
        if (t.state === 'failed') {
          failedCount += 1;
        }
      }
      // tests 配列から失敗数を計算できた場合、0なら成功
      return { success: failedCount === 0, exitCode: params.exitCode };
    }

    // tests 配列がない場合は failures プロパティを確認
    if (typeof params.testResult.failures === 'number') {
      return { success: params.testResult.failures === 0, exitCode: params.exitCode };
    }
  }

  // 失敗数を判定できない場合は失敗扱い
  return { success: false, exitCode: params.exitCode };
}

function resolveSummaryCounts(testResult: ParsedTestResult, structuredResult: TestResultFile | undefined): SummaryCounts {
  if (structuredResult) {
    const tests = structuredResult.tests;
    if (Array.isArray(tests) && tests.length > 0) {
      let passed = 0;
      let failed = 0;
      let pending = 0;
      for (const t of tests) {
        if (t.state === 'passed') {
          passed += 1;
          continue;
        }
        if (t.state === 'failed') {
          failed += 1;
          continue;
        }
        if (t.state === 'pending') {
          pending += 1;
        }
      }
      return { hasCounts: true, passed, failed, pending, total: tests.length };
    }

    const passed = typeof structuredResult.passes === 'number' ? structuredResult.passes : undefined;
    const failed = typeof structuredResult.failures === 'number' ? structuredResult.failures : undefined;
    const pending = typeof structuredResult.pending === 'number' ? structuredResult.pending : undefined;
    const total = typeof structuredResult.total === 'number' ? structuredResult.total : undefined;

    if (passed !== undefined || failed !== undefined || pending !== undefined || total !== undefined) {
      const resolvedTotal =
        total !== undefined ? total : (passed ?? 0) + (failed ?? 0) + (pending ?? 0);
      return { hasCounts: true, passed, failed, pending, total: resolvedTotal };
    }
  }

  if (testResult.parsed) {
    return {
      hasCounts: true,
      passed: testResult.passed,
      failed: testResult.failed,
      total: testResult.passed + testResult.failed,
    };
  }

  return { hasCounts: false };
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

function getStringOrUndefined(value: unknown): string | undefined {
  const s = getStringOrEmpty(value);
  return s.length > 0 ? s : undefined;
}

/**
 * 厳密な文字列抽出。typeof === 'string' のみを受理し、空文字/空白のみは undefined とする。
 * 数値や真偽値など他の型は undefined として扱う。
 */
function getStrictStringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

function getNumberOrUndefined(value: unknown): number | undefined {
  const n = getNumberOrNull(value);
  return n === null ? undefined : n;
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

function normalizeTestCaseState(value: unknown): TestCaseState | undefined {
  if (value === 'passed' || value === 'failed' || value === 'pending') {
    return value;
  }
  return undefined;
}

function normalizeTableCell(value: string): string {
  // Markdown表セルを壊しやすい文字（改行、パイプ）を正規化する
  const withoutCrlf = value.replace(/\r\n/g, '\n');
  const withoutLf = withoutCrlf.replace(/\n+/g, ' ');
  const collapsedSpaces = withoutLf.replace(/\s+/g, ' ').trim();
  return collapsedSpaces.replace(/\|/g, '\\|');
}

function normalizeInlineText(value: string): string {
  return stripAnsi(value).replace(/\r\n/g, '\n').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeMultilineText(value: string): string {
  return stripAnsi(value).replace(/\r\n/g, '\n').trim();
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
