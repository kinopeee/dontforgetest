import * as path from 'path';
import * as fs from 'fs';
import * as childProcess from 'child_process';
import * as os from 'os';
import { downloadAndUnzipVSCode, TestRunFailedError } from '@vscode/test-electron';
import { getProfileArguments } from '@vscode/test-electron/out/util';

export type TestCaseState = 'passed' | 'failed' | 'pending';

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
  // テストが参照するファイル（例: src/core/event.ts, media/testgen-view.svg, LICENSE）も含めてコピーする。
  await fs.promises.rm(params.stageExtensionRoot, { recursive: true, force: true });
  await fs.promises.mkdir(params.stageExtensionRoot, { recursive: true });

  const copyEntries: Array<{ src: string; dest: string }> = [
    { src: path.join(params.sourceExtensionRoot, 'package.json'), dest: path.join(params.stageExtensionRoot, 'package.json') },
    { src: path.join(params.sourceExtensionRoot, 'package-lock.json'), dest: path.join(params.stageExtensionRoot, 'package-lock.json') },
    { src: path.join(params.sourceExtensionRoot, 'LICENSE'), dest: path.join(params.stageExtensionRoot, 'LICENSE') },
    { src: path.join(params.sourceExtensionRoot, 'out'), dest: path.join(params.stageExtensionRoot, 'out') },
    { src: path.join(params.sourceExtensionRoot, 'src'), dest: path.join(params.stageExtensionRoot, 'src') },
    { src: path.join(params.sourceExtensionRoot, 'docs'), dest: path.join(params.stageExtensionRoot, 'docs') },
    { src: path.join(params.sourceExtensionRoot, 'media'), dest: path.join(params.stageExtensionRoot, 'media') },
  ];

  for (const entry of copyEntries) {
    await fs.promises.cp(entry.src, entry.dest, { recursive: true, force: true });
  }

  // テストランナー（out/test/suite/index.js）は mocha / glob などを node_modules から require する。
  // 退避先には node_modules をコピーしないため、シンボリックリンクで参照できるようにする。
  const sourceNodeModules = path.join(params.sourceExtensionRoot, 'node_modules');
  const stageNodeModules = path.join(params.stageExtensionRoot, 'node_modules');
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
  const launcherFromEnv = (process.env.DONTFORGETEST_VSCODE_TEST_LAUNCHER ?? '').trim();
  const launcher = (() => {
    if (launcherFromEnv === 'open' || launcherFromEnv === 'direct') {
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
      const cmd = childProcess.spawn(
        'open',
        ['-n', '-W', '-a', appPath, '--args', ...allArgs],
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
    const cmd = childProcess.spawn(shell ? `"${vscodeExecutablePath}"` : vscodeExecutablePath, allArgs, {
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
    const runId = `run-${Date.now()}-${process.pid}`;
    // Cursor 側のプロセス検知（VS Code起動）に巻き込まれにくくするため、
    // VS Code本体/ユーザーデータ/ワークスペース等は tmp 配下へ隔離して起動する。
    const vscodeTestRoot = path.join(os.tmpdir(), 'dontforgetest-vscode-test');
    const vscodeCachePath = path.join(vscodeTestRoot, 'vscode');
    const runtimeRoot = path.join(vscodeTestRoot, 'runtime');
    const userDataDir = path.join(runtimeRoot, 'user-data', runId);
    const extensionsDir = path.join(runtimeRoot, 'extensions', runId);
    const testWorkspace = path.join(runtimeRoot, 'workspace', runId);
    // open 起動でも確実に参照できるよう、ワークスペース直下に結果ファイルを置く
    // （suite 側は workspaceRoot を優先して .vscode-test/test-result.json に書く）
    const testResultFilePath = path.join(testWorkspace, '.vscode-test', 'test-result.json');

    const stageRoot = path.join(runtimeRoot, 'stage', runId);
    const stageExtensionRoot = path.join(stageRoot, 'extension');
    const stagedExtensionTestsPath = path.join(stageExtensionRoot, 'out', 'test', 'suite', 'index');

    await fs.promises.mkdir(userDataDir, { recursive: true });
    await fs.promises.mkdir(extensionsDir, { recursive: true });
    await fs.promises.mkdir(testWorkspace, { recursive: true });
    await fs.promises.mkdir(path.dirname(testResultFilePath), { recursive: true });
    await fs.promises.rm(testResultFilePath, { force: true });

    await stageExtensionToTemp({ sourceExtensionRoot, stageExtensionRoot });

    // VS Codeをダウンロードして起動し、テストを実行
    // 拡張機能のengines.vscodeに合わせてバージョンを指定
    await runDetachedVscodeExtensionTests({
      extensionDevelopmentPath: stageExtensionRoot,
      extensionTestsPath: stagedExtensionTestsPath,
      version: 'stable',
      testResultFilePath,
      cachePath: vscodeCachePath,
      launchArgs: [
        testWorkspace,
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
        `--dontforgetest-test-result-file=${testResultFilePath}`,
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
        // Cursor / VS Code の IPC 関連の環境変数をクリア
        CURSOR_IPC_HOOK: undefined,
        VSCODE_IPC_HOOK: undefined,
        VSCODE_IPC_HOOK_CLI: undefined,
      },
    });

    // open 起動の場合はプロセスのexit codeが取れない可能性があるため、結果ファイルを参照して最終判定する
    try {
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
    } catch (resultErr) {
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
      console.error(resultErr);
      process.exit(1);
    }
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
