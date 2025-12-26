import * as path from 'path';
import * as fs from 'fs';
import * as childProcess from 'child_process';
import * as os from 'os';
import { downloadAndUnzipVSCode, TestRunFailedError } from '@vscode/test-electron';
import { getProfileArguments } from '@vscode/test-electron/out/util';

export type TestCaseState = 'passed' | 'failed' | 'pending';

type VscodeTestLauncher = 'open' | 'direct';

export interface TestCaseInfo {
  suite?: string;
  title?: string;
  fullTitle?: string;
  state?: TestCaseState;
  durationMs?: number;
}

export interface TestResultFile {
  timestamp?: number;
  vscodeVersion?: string;
  failures?: number;
  passes?: number;
  pending?: number;
  total?: number;
  durationMs?: number;
  tests?: TestCaseInfo[];
}

const DEFAULT_TEST_RESULT_WAIT_TIMEOUT_MS = 3000;
const DEFAULT_TEST_RESULT_WAIT_INTERVAL_MS = 100;
const DEFAULT_VSCODE_TEST_MAX_ATTEMPTS = 2;
const DEFAULT_VSCODE_TEST_LOCALE = 'ja';

function normalizeBooleanEnv(value: string | undefined): boolean | undefined {
  const v = (value ?? '').trim().toLowerCase();
  if (v === '') {
    return undefined;
  }
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') {
    return true;
  }
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') {
    return false;
  }
  return undefined;
}

function shouldUseXvfb(): boolean {
  // Linux では DISPLAY が設定されていても X サーバが存在しない環境がある（例: DISPLAY=:1 だが実体が無い）。
  // その場合、VS Code（Electron）が SIGSEGV 等で落ちてテストが実行できない。
  // 安定性を優先し、Linux ではデフォルトで xvfb-run を使う（明示的に無効化したい場合は env で opt-out）。
  if (process.platform !== 'linux') {
    return false;
  }
  const opt = normalizeBooleanEnv(process.env.DONTFORGETEST_VSCODE_TEST_USE_XVFB);
  return opt ?? true;
}

function parseIntOrFallback(params: { value: string | undefined; fallback: number; min: number; label: string }): number {
  const raw = params.value?.trim();
  if (!raw) {
    return params.fallback;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return params.fallback;
  }
  const i = Math.floor(n);
  if (i < params.min) {
    return params.fallback;
  }
  return i;
}

function normalizeLauncher(value: string | undefined): VscodeTestLauncher | undefined {
  const v = (value ?? '').trim();
  if (v === 'open' || v === 'direct') {
    return v;
  }
  return undefined;
}

function normalizeLocale(value: string | undefined): string {
  const v = (value ?? '').trim();
  return v.length > 0 ? v : DEFAULT_VSCODE_TEST_LOCALE;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function waitForFile(params: { filePath: string; timeoutMs: number; intervalMs: number }): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start <= params.timeoutMs) {
    if (await fileExists(params.filePath)) {
      return true;
    }
    await sleepMs(params.intervalMs);
  }
  return await fileExists(params.filePath);
}

async function tryRemoveVscodeCache(cachePath: string): Promise<void> {
  try {
    await fs.promises.rm(cachePath, { recursive: true, force: true });
    console.warn(`[dontforgetest] 再試行前に VS Code キャッシュを削除しました: ${cachePath}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[dontforgetest] VS Code キャッシュ削除に失敗しました（続行します）: ${message}`);
  }
}

export function resolveSuiteFromFullTitle(fullTitle: string, title: string): string {
  // 不正な入力は明示的に弾く（テスト観点上、TypeError を期待するケースがある）
  if (typeof fullTitle !== 'string' || typeof title !== 'string') {
    throw new TypeError('fullTitle と title は文字列である必要があります');
  }
  // title が空の場合、endsWith('') は常に true になるため例外扱いにする
  if (title.trim() === '') {
    return '';
  }
  if (!fullTitle.endsWith(title)) {
    return '';
  }
  return fullTitle.slice(0, Math.max(0, fullTitle.length - title.length)).trim();
}

export function printMochaLikeResultsFromTestResultFile(
  result: TestResultFile,
  log: (message?: unknown, ...optionalParams: unknown[]) => void = console.log,
): void {
  const tests = Array.isArray(result.tests) ? result.tests : [];
  if (tests.length === 0) {
    return;
  }

  log('');
  log('[dontforgetest] --- テスト結果（test-result.json から再構築） ---');
  log('');

  // suite ごとにまとめて出力する（src/core/testResultParser.ts の parseMochaOutput で拾える形式に寄せる）
  const suiteOrder: string[] = [];
  const bySuite = new Map<string, TestCaseInfo[]>();

  const normalizeSuite = (t: TestCaseInfo): string => {
    if (typeof t.suite === 'string' && t.suite.trim() !== '') {
      return t.suite.trim();
    }
    const fullTitle = typeof t.fullTitle === 'string' ? t.fullTitle : '';
    const title = typeof t.title === 'string' ? t.title : '';
    if (fullTitle !== '' && title !== '') {
      const derived = resolveSuiteFromFullTitle(fullTitle, title);
      if (derived !== '') {
        return derived;
      }
    }
    return '(root)';
  };

  for (const t of tests) {
    const suite = normalizeSuite(t);
    if (!bySuite.has(suite)) {
      bySuite.set(suite, []);
      suiteOrder.push(suite);
    }
    bySuite.get(suite)?.push(t);
  }

  let failureIndex = 1;
  for (const suite of suiteOrder) {
    log(`  ${suite}`);
    const suiteTests = bySuite.get(suite) ?? [];
    for (const t of suiteTests) {
      const title = typeof t.title === 'string' && t.title.trim() !== '' ? t.title.trim() : '(no title)';
      const state = t.state;
      if (state === 'failed') {
        log(`      ${failureIndex}) ${title}`);
        failureIndex += 1;
        continue;
      }
      if (state === 'passed') {
        log(`      ✔ ${title}`);
        continue;
      }
      // pending は parseMochaOutput が拾えないが、情報としては出しておく
      log(`      - ${title}`);
    }
    log('');
  }
}

export async function stageExtensionToTemp(params: {
  sourceExtensionRoot: string;
  stageExtensionRoot: string;
}): Promise<void> {
  // Cursor が「ワークスペース配下から起動された VS Code（拡張機能テスト）」を検知して kill している可能性がある。
  // そのため、拡張機能（ソース/ビルド成果物/リソース）を一時ディレクトリへ退避してからテストを起動する。
  //
  // テストが参照するファイル（例: src/core/event.ts, media/dontforgetest-view.svg, LICENSE）も含めてコピーする。
  await fs.promises.rm(params.stageExtensionRoot, { recursive: true, force: true });
  await fs.promises.mkdir(params.stageExtensionRoot, { recursive: true });

  type CopyEntry = { src: string; dest: string };

  // NOTE:
  // - 必須ファイルが欠けている場合、ここで即座に失敗させる（後続の拡張機能テストが「なぜ落ちたか」分かりづらくなるため）
  // - 任意ファイル（ローカライズ関連など）は、存在しない場合（ENOENT）のみスキップする
  const requiredCopyEntries: CopyEntry[] = [
    { src: path.join(params.sourceExtensionRoot, 'package.json'), dest: path.join(params.stageExtensionRoot, 'package.json') },
    { src: path.join(params.sourceExtensionRoot, 'LICENSE'), dest: path.join(params.stageExtensionRoot, 'LICENSE') },
    { src: path.join(params.sourceExtensionRoot, 'out'), dest: path.join(params.stageExtensionRoot, 'out') },
    { src: path.join(params.sourceExtensionRoot, 'src'), dest: path.join(params.stageExtensionRoot, 'src') },
    { src: path.join(params.sourceExtensionRoot, 'docs'), dest: path.join(params.stageExtensionRoot, 'docs') },
    { src: path.join(params.sourceExtensionRoot, 'media'), dest: path.join(params.stageExtensionRoot, 'media') },
  ];

  const optionalCopyEntries: CopyEntry[] = [
    // package-lock.json は拡張機能本体の実行に必須ではないため、無い場合はスキップしてよい（テスト用の最小構成対応）
    { src: path.join(params.sourceExtensionRoot, 'package-lock.json'), dest: path.join(params.stageExtensionRoot, 'package-lock.json') },
    // package.json のローカライズ（%key% -> package.nls*.json）
    { src: path.join(params.sourceExtensionRoot, 'package.nls.json'), dest: path.join(params.stageExtensionRoot, 'package.nls.json') },
    { src: path.join(params.sourceExtensionRoot, 'package.nls.ja.json'), dest: path.join(params.stageExtensionRoot, 'package.nls.ja.json') },
    // runtime ローカライズ（vscode.l10n.t 用）
    { src: path.join(params.sourceExtensionRoot, 'l10n'), dest: path.join(params.stageExtensionRoot, 'l10n') },
  ];

  // 必須ファイルは事前に存在確認し、欠落があれば cp ループに入る前に ENOENT を投げる（部分的コピーを避ける）
  for (const entry of requiredCopyEntries) {
    await fs.promises.access(entry.src);
  }

  for (const entry of requiredCopyEntries) {
    await fs.promises.cp(entry.src, entry.dest, { recursive: true, force: true });
  }

  for (const entry of optionalCopyEntries) {
    try {
      await fs.promises.cp(entry.src, entry.dest, { recursive: true, force: true });
    } catch (e) {
      // 任意ファイル（package-lock / package.nls / l10n 等）が無い場合はスキップする。
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        continue;
      }
      throw e;
    }
  }

  // テストランナー（out/test/suite/index.js）は mocha / glob などを node_modules から require する。
  // 退避先には node_modules をコピーしないため、シンボリックリンクで参照できるようにする。
  const sourceNodeModules = path.join(params.sourceExtensionRoot, 'node_modules');
  const stageNodeModules = path.join(params.stageExtensionRoot, 'node_modules');

  // sourceNodeModules が存在しない場合はスキップ（テストで無効なパスを渡すケース対応）
  try {
    await fs.promises.access(sourceNodeModules);
  } catch {
    return;
  }

  const linkType: fs.symlink.Type = process.platform === 'win32' ? 'junction' : 'dir';
  await fs.promises.symlink(sourceNodeModules, stageNodeModules, linkType);
}

function sanitizeEnvForDetachedVscodeTest(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const nextEnv: NodeJS.ProcessEnv = { ...env };
  for (const key of Object.keys(nextEnv)) {
    if (key.startsWith('CURSOR_')) {
      delete nextEnv[key];
    }
  }
  delete nextEnv.VSCODE_IPC_HOOK;
  delete nextEnv.VSCODE_IPC_HOOK_CLI;
  delete nextEnv.VSCODE_IPC_HOOK_EXTHOST;
  return nextEnv;
}

async function runDetachedVscodeExtensionTests(options: {
  extensionDevelopmentPath: string;
  extensionTestsPath: string;
  launchArgs: string[];
  extensionTestsEnv: NodeJS.ProcessEnv;
  version: 'stable' | 'insiders' | string;
  testResultFilePath: string;
  cachePath: string;
  launcher?: VscodeTestLauncher;
}): Promise<void> {
  const vscodeExecutablePath = await downloadAndUnzipVSCode({
    version: options.version,
    cachePath: options.cachePath,
    extensionDevelopmentPath: options.extensionDevelopmentPath,
  });

  const baseArgs: string[] = [
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--disable-updates',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
    `--extensionTestsPath=${options.extensionTestsPath}`,
    `--extensionDevelopmentPath=${options.extensionDevelopmentPath}`,
  ];

  const allArgs = options.launchArgs.concat(baseArgs);
  allArgs.push(...getProfileArguments(allArgs));

  const fullEnv = sanitizeEnvForDetachedVscodeTest({ ...process.env, ...options.extensionTestsEnv });
  const shell = process.platform === 'win32';

  // 起動方法：
  // - darwin(macOS) は Cursor 実行中に direct spawn が kill されやすいため、デフォルトで open 起動に寄せる
  // - 明示的に切り替えたい場合は DONTFORGETEST_VSCODE_TEST_LAUNCHER=direct|open を指定
  const launcherFromEnv = normalizeLauncher(process.env.DONTFORGETEST_VSCODE_TEST_LAUNCHER);
  const launcher = (() => {
    if (options.launcher) {
      return options.launcher;
    }
    if (launcherFromEnv) {
      return launcherFromEnv;
    }
    if (process.platform === 'darwin') {
      return 'open';
    }
    return 'direct';
  })();

  // macOS では LaunchServices 経由（open）で起動すると、親子関係が切れて
  // Cursor 統合ターミナルの kill に巻き込まれにくい可能性がある。
  // まずは opt-in で検証できるよう、環境変数で切り替える。
  const canUseOpen = process.platform === 'darwin' && launcher === 'open' && vscodeExecutablePath.includes('.app/');

  if (canUseOpen) {
    const appPath = vscodeExecutablePath.slice(0, vscodeExecutablePath.lastIndexOf('.app') + 4);
    console.log(`[dontforgetest] VS Code tests launcher: open (-n -W) appPath=${appPath}`);

    await new Promise<void>((resolve, reject) => {
      // NOTE:
      // macOS では `open -a <appPath>` が LaunchServices 側の解釈により失敗する場合がある（kLSNoExecutableErr 等）。
      // `open <appPath>`（アプリバンドルへのパスを直接渡す）に統一し、起動の安定性を優先する。
      const cmd = childProcess.spawn(
        'open',
        ['-n', '-W', appPath, '--args', ...allArgs],
        {
          // open には env を渡せるが、起動されたGUIアプリ側には伝播しない可能性が高い
          env: fullEnv,
          stdio: 'inherit',
          windowsHide: true,
        },
      );
      cmd.on('error', reject);
      cmd.on('exit', (code, signal) => {
        console.log(`Exit code:   ${code ?? signal}`);
        if (code !== 0) {
          reject(new TestRunFailedError(code ?? undefined, signal ?? undefined));
          return;
        }
        resolve();
      });
    });
    return;
  }

  console.log(`[dontforgetest] VS Code tests launcher: direct (spawn) executable=${vscodeExecutablePath}`);

  await new Promise<void>((resolve, reject) => {
    const useXvfb = shouldUseXvfb();
    const command = useXvfb ? 'xvfb-run' : shell ? `"${vscodeExecutablePath}"` : vscodeExecutablePath;
    const args = useXvfb ? ['-a', vscodeExecutablePath, ...allArgs] : allArgs;
    if (useXvfb) {
      console.log('[dontforgetest] xvfb-run を使用してヘッドレス環境で VS Code を起動します');
    }

    const cmd = childProcess.spawn(command, args, {
      env: fullEnv,
      shell,
      detached: true,
      stdio: 'pipe',
      windowsHide: true,
    });

    cmd.stdout?.on('data', (d) => process.stdout.write(d));
    cmd.stderr?.on('data', (d) => process.stderr.write(d));
    cmd.on('error', reject);
    cmd.on('exit', (code, signal) => {
      console.log(`Exit code:   ${code ?? signal}`);
      if (code !== 0) {
        reject(new TestRunFailedError(code ?? undefined, signal ?? undefined));
        return;
      }
      resolve();
    });
  });
}

async function main() {
  try {
    // 拡張機能のパス
    const sourceExtensionRoot = path.resolve(__dirname, '../../');

    // VS Code拡張機能テストは別プロセス（Electron/Extension Host）を起動する。
    // 実行中のIDE（Cursor/VS Code）と user-data / extensions が衝突すると不安定になり得るため、
    // テスト用のディレクトリを明示的に隔離して起動する。
    //
    // 【重要】Cursor IDE 実行中の SIGTERM 問題について：
    // Cursor が実行中だと、テスト用 VS Code プロセスが SIGTERM で終了させられる場合がある。
    // 以下の対策を講じているが、完全には防げない可能性がある：
    // - 毎回ユニークな user-data-dir / extensions-dir を使用
    // - プロセス分離オプションを追加
    // - 環境変数でプロセス識別を分離
    // 
    // それでも問題が発生する場合は、テスト前に Cursor を終了するか、
    // CI 環境（GitHub Actions 等）でテストを実行することを推奨。
    // Cursor 側のプロセス検知（VS Code起動）に巻き込まれにくくするため、
    // VS Code本体/ユーザーデータ/ワークスペース等は tmp 配下へ隔離して起動する。
    const vscodeTestRoot = path.join(os.tmpdir(), 'dontforgetest-vscode-test');
    const vscodeCachePath = path.join(vscodeTestRoot, 'vscode');
    const runtimeRoot = path.join(vscodeTestRoot, 'runtime');

    // stage は重いので 1 回だけ作る（runId ごとに分ける必要はない）
    const stageRoot = path.join(runtimeRoot, 'stage');
    const stageExtensionRoot = path.join(stageRoot, 'extension');
    const stagedExtensionTestsPath = path.join(stageExtensionRoot, 'out', 'test', 'suite', 'index');

    await stageExtensionToTemp({ sourceExtensionRoot, stageExtensionRoot });

    // 結果ファイルの生成が遅延するケース（FSの遅延/flush等）を吸収するため、短い待機を入れる
    const resultWaitTimeoutMs = parseIntOrFallback({
      value: process.env.DONTFORGETEST_TEST_RESULT_WAIT_TIMEOUT_MS,
      fallback: DEFAULT_TEST_RESULT_WAIT_TIMEOUT_MS,
      min: 0,
      label: 'DONTFORGETEST_TEST_RESULT_WAIT_TIMEOUT_MS',
    });
    const resultWaitIntervalMs = parseIntOrFallback({
      value: process.env.DONTFORGETEST_TEST_RESULT_WAIT_INTERVAL_MS,
      fallback: DEFAULT_TEST_RESULT_WAIT_INTERVAL_MS,
      min: 1,
      label: 'DONTFORGETEST_TEST_RESULT_WAIT_INTERVAL_MS',
    });
    const maxAttempts = parseIntOrFallback({
      value: process.env.DONTFORGETEST_VSCODE_TEST_MAX_ATTEMPTS,
      fallback: DEFAULT_VSCODE_TEST_MAX_ATTEMPTS,
      min: 1,
      label: 'DONTFORGETEST_VSCODE_TEST_MAX_ATTEMPTS',
    });

    // 起動方式は環境変数で固定できる。未指定なら 1 回だけ別方式で再試行する。
    const pinnedLauncher = normalizeLauncher(process.env.DONTFORGETEST_VSCODE_TEST_LAUNCHER);
    const defaultLauncher: VscodeTestLauncher = process.platform === 'darwin' ? 'open' : 'direct';

    let lastUserDataDir: string | null = null;
    let lastTestResultFilePath: string | null = null;
    let lastRunError: unknown | null = null;
    let lastResultError: unknown | null = null;

    for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
      const runId = `run-${Date.now()}-${process.pid}-${attemptIndex + 1}`;
      const userDataDir = path.join(runtimeRoot, 'user-data', runId);
      const extensionsDir = path.join(runtimeRoot, 'extensions', runId);
      const testWorkspace = path.join(runtimeRoot, 'workspace', runId);
      // open 起動でも確実に参照できるよう、ワークスペース直下に結果ファイルを置く
      // （suite 側は workspaceRoot を優先して .vscode-test/test-result.json に書く）
      const testResultFilePath = path.join(testWorkspace, '.vscode-test', 'test-result.json');

      lastUserDataDir = userDataDir;
      lastTestResultFilePath = testResultFilePath;
      lastRunError = null;
      lastResultError = null;

      await fs.promises.mkdir(userDataDir, { recursive: true });
      await fs.promises.mkdir(extensionsDir, { recursive: true });
      await fs.promises.mkdir(testWorkspace, { recursive: true });
      await fs.promises.mkdir(path.dirname(testResultFilePath), { recursive: true });
      await fs.promises.rm(testResultFilePath, { force: true });

      const launcher: VscodeTestLauncher = (() => {
        if (pinnedLauncher) {
          return pinnedLauncher;
        }
        if (process.platform === 'darwin') {
          // NOTE:
          // macOS では direct(spawn) 起動が SIGABRT で落ちるケースがある（AppKit の _RegisterApplication 等）。
          // 安定性優先で、未指定の場合は open 起動に固定する。
          return 'open';
        }
        return attemptIndex === 0 ? defaultLauncher : defaultLauncher === 'open' ? 'direct' : 'open';
      })();

      const locale = normalizeLocale(process.env.DONTFORGETEST_VSCODE_TEST_LOCALE);
      // VS Code 本体の表示言語を強制するための設定。
      // `availableLanguages` は言語パック有無に依存せずロケールを固定するために付与する。
      const nlsConfig = JSON.stringify({ locale, availableLanguages: { '*': locale } });

      // VS Codeをダウンロードして起動し、テストを実行
      // 拡張機能のengines.vscodeに合わせてバージョンを指定
      try {
        await runDetachedVscodeExtensionTests({
          extensionDevelopmentPath: stageExtensionRoot,
          extensionTestsPath: stagedExtensionTestsPath,
          version: 'stable',
          testResultFilePath,
          cachePath: vscodeCachePath,
          launcher,
          launchArgs: [
            testWorkspace,
            `--user-data-dir=${userDataDir}`,
            `--extensions-dir=${extensionsDir}`,
            `--dontforgetest-test-result-file=${testResultFilePath}`,
            `--locale=${locale}`,
            // UIの揺れや初回ダイアログ類を減らす（完全なヘッドレスにはならない）
            '--disable-workspace-trust',
            '--skip-release-notes',
            // GPU関連の問題を回避（一部環境での安定性向上）
            '--disable-gpu',
            // Extension Host の衝突を減らす
            '--disable-extensions',
            // サンドボックスを無効化（一部環境でのプロセス終了問題を回避）
            '--no-sandbox',
            // Chromium の crash handler を無効化（テスト中の不要なダイアログを防止）
            '--disable-crash-reporter',
            // テレメトリを無効化
            '--disable-telemetry',
            // 新しいウィンドウとして起動（既存インスタンスとの衝突を避ける）
            '--new-window',
            // IPC ハンドルを分離（Cursor との競合を避ける）
            `--logsPath=${path.join(userDataDir, 'logs')}`,
          ],
          extensionTestsEnv: {
            ELECTRON_RUN_AS_NODE: undefined,
            // テスト用プロセスであることを識別
            VSCODE_TEST_RUNNER: '1',
            // VS Code の表示言語を固定（テストの期待値を安定させる）
            VSCODE_NLS_CONFIG: nlsConfig,
            // Cursor / VS Code の IPC 関連の環境変数をクリア
            CURSOR_IPC_HOOK: undefined,
            VSCODE_IPC_HOOK: undefined,
            VSCODE_IPC_HOOK_CLI: undefined,
          },
        });
      } catch (runErr) {
        // launcher の exit code が取得できない/信頼できないケースがあるため、
        // 可能なら test-result.json を見て最終判定する。
        lastRunError = runErr;
      }

      // open 起動の場合はプロセスのexit codeが取れない可能性があるため、結果ファイルを参照して最終判定する
      try {
        if (resultWaitTimeoutMs > 0) {
          await waitForFile({ filePath: testResultFilePath, timeoutMs: resultWaitTimeoutMs, intervalMs: resultWaitIntervalMs });
        }
        const raw = await fs.promises.readFile(testResultFilePath, 'utf8');
        const parsed = JSON.parse(raw) as TestResultFile;
        const failures = typeof parsed.failures === 'number' ? parsed.failures : undefined;
        if (failures === undefined) {
          throw new Error('testResultFileの形式が不正です');
        }
        // stdout に Mocha 風の結果を出す（open 起動だと Extension Host の stdout が拾えないため）
        printMochaLikeResultsFromTestResultFile(parsed);
        if (failures > 0) {
          throw new Error(`テスト失敗: ${failures}個`);
        }
        // success: runError があっても、結果ファイルが成功なら通す（念のためログだけ出す）
        if (lastRunError) {
          console.warn('[dontforgetest] 補足: VS Code 起動のエラーがありましたが、結果ファイルは成功を示しています');
        }
        return;
      } catch (resultErr) {
        lastResultError = resultErr;
        const isExplicitTestFailure = resultErr instanceof Error && resultErr.message.startsWith('テスト失敗:');
        if (isExplicitTestFailure) {
          throw resultErr;
        }
        if (attemptIndex + 1 < maxAttempts && !pinnedLauncher) {
          await tryRemoveVscodeCache(vscodeCachePath);
          console.warn(
            `[dontforgetest] テスト実行が不安定なため再試行します (attempt=${attemptIndex + 1}/${maxAttempts}, launcher=${launcher})`,
          );
          continue;
        }
        break;
      }
    }

    // 最終的に成功しなかった場合は、最後の試行の情報を出力して失敗にする
    const userDataDir = lastUserDataDir;
    const testResultFilePath = lastTestResultFilePath;
    if (!userDataDir || !testResultFilePath) {
      throw new Error('テスト実行の状態が不正です（userDataDir/testResultFilePath が未設定）');
    }

    // 失敗時は VS Code 側の main.log を解析して、kill(code=15) かどうかを切り分ける
    const mainLogPath = path.join(userDataDir, 'logs', 'main.log');
    let killedCode15: boolean | null = null;
    let mainLogTail: string | null = null;
    try {
      const content = await fs.promises.readFile(mainLogPath, 'utf8');
      killedCode15 = content.includes('code 15') && content.includes('killed');
      const lines = content.split('\n').filter((l) => l.trim() !== '');
      mainLogTail = lines.slice(-12).join('\n');
    } catch {
      killedCode15 = null;
      mainLogTail = null;
    }

    console.error('テスト結果ファイルの検証に失敗しました');
    console.error(`testResultFilePath: ${testResultFilePath}`);
    console.error(`mainLogPath: ${mainLogPath}`);
    if (killedCode15 === true) {
      console.error('補足: VS Code 側が code=15 (killed) で終了した可能性があります');
    }
    if (mainLogTail) {
      console.error('main.log（末尾）:');
      console.error(mainLogTail);
    }
    if (lastRunError) {
      console.error(lastRunError);
    }
    if (lastResultError) {
      console.error(lastResultError);
    }
    process.exit(1);
  } catch (err) {
    console.error('テストの実行に失敗しました');
    console.error(err);
    process.exit(1);
  }
}

// テストから import される場合は main を実行しない（副作用で VS Code を起動してしまうため）
// node ./out/test/runTest.js で直接実行された場合のみ main を起動する。
if (require.main === module) {
  void main();
}
