import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TestGenerationSession, __test__ } from '../../../../commands/runWithArtifacts/testGenerationSession';

suite('commands/runWithArtifacts/testGenerationSession.ts', () => {
  const workspaceRoots: string[] = [];
  const readFileUtf8 = (filePath: string) => fs.promises.readFile(filePath, 'utf8');

  teardown(async () => {
    for (const root of workspaceRoots) {
      try {
        await fs.promises.rm(root, { recursive: true, force: true });
      } catch {
        // クリーンアップエラーは無視
      }
    }
    workspaceRoots.length = 0;
  });

  // TC-LL-N-01: out/test/runTest.js を含むコマンドは true
  test('TC-LL-N-01: out/test/runTest.js を含むコマンドは true を返す', async () => {
    // Given: 一時ワークスペースと session
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    workspaceRoots.push(workspaceRoot);

    // When: out/test/runTest.js を含むコマンドを判定
    const result = await __test__.looksLikeVsCodeLaunchingTestCommand({
      workspaceRoot,
      testCommand: 'node ./out/test/runTest.js',
      readFileUtf8,
    });

    // Then: true が返る
    assert.strictEqual(result, true, 'out/test/runTest.js を含むコマンドは true になること');
  });

  // TC-LL-N-02: npm test で package.json の test が VS Code 実行系なら true
  test('TC-LL-N-02: npm test で @vscode/test-electron を含む場合は true を返す', async () => {
    // Given: package.json に VS Code 実行系の test script
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    workspaceRoots.push(workspaceRoot);
    const pkg = {
      scripts: {
        test: 'node ./node_modules/@vscode/test-electron/out/runTest.js',
      },
    };
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify(pkg), 'utf8');

    // When: npm test を判定
    const result = await __test__.looksLikeVsCodeLaunchingTestCommand({
      workspaceRoot,
      testCommand: 'npm test',
      readFileUtf8,
    });

    // Then: true が返る
    assert.strictEqual(result, true, 'npm test で VS Code 実行系なら true になること');
  });

  // TC-LL-E-01: package.json が無い場合は false
  test('TC-LL-E-01: package.json が無い場合は false を返す', async () => {
    // Given: package.json が存在しないワークスペース
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    workspaceRoots.push(workspaceRoot);

    // When: npm test を判定
    const result = await __test__.looksLikeVsCodeLaunchingTestCommand({
      workspaceRoot,
      testCommand: 'npm test',
      readFileUtf8,
    });

    // Then: false が返る
    assert.strictEqual(result, false, 'package.json が無い場合は false になること');
  });

  // TC-LL-B-01: 空文字コマンドは false
  test('TC-LL-B-01: 空文字コマンドは false を返す', async () => {
    // Given: 空のコマンド
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    workspaceRoots.push(workspaceRoot);

    // When: 空文字を判定
    const result = await __test__.looksLikeVsCodeLaunchingTestCommand({
      workspaceRoot,
      testCommand: '',
      readFileUtf8,
    });

    // Then: false が返る
    assert.strictEqual(result, false, '空文字コマンドは false になること');
  });

  // TC-LL-B-02: npm test 以外のコマンドは false
  test('TC-LL-B-02: npm test 以外のコマンドは false を返す', async () => {
    // Given: npm test 以外のコマンド
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    workspaceRoots.push(workspaceRoot);

    // When: npm run build を判定
    const result = await __test__.looksLikeVsCodeLaunchingTestCommand({
      workspaceRoot,
      testCommand: 'npm run build',
      readFileUtf8,
    });

    // Then: false が返る
    assert.strictEqual(result, false, 'npm test 以外のコマンドは false になること');
  });

  suite('readTestResultFile / attachTestResult', () => {
    const dummyProvider = {
      id: 'dummy',
      displayName: 'dummy',
      run: () => ({ taskId: 'dummy-task', dispose: () => {} }),
    };

    const createSession = (workspaceRoot: string, settingsOverride?: Record<string, unknown>) => {
      return new TestGenerationSession({
        provider: dummyProvider,
        workspaceRoot,
        cursorAgentCommand: 'cursor-agent',
        testStrategyPath: '',
        generationLabel: 'Label',
        targetPaths: [],
        generationPrompt: '',
        perspectiveReferenceText: '',
        model: undefined,
        generationTaskId: 'task-1',
        runLocation: 'local',
        settingsOverride: {
          includeTestPerspectiveTable: false,
          testExecutionRunner: 'extension',
          testCommand: 'npm test',
          enablePreTestCheck: false,
          ...(settingsOverride ?? {}),
        },
      });
    };

    const ensureTestResultFile = (workspaceRoot: string, content: string): string => {
      const dir = path.join(workspaceRoot, '.vscode-test');
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, 'test-result.json');
      fs.writeFileSync(filePath, content, 'utf8');
      return filePath;
    };

    test('TC-TGS-ENV-N-01: buildTestResultEnv sets DONTFORGETEST_TEST_RESULT_FILE to <workspace>/.vscode-test/test-result.json', () => {
      // Given: A session and a workspace root
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const session = createSession(workspaceRoot);

      // When: buildTestResultEnv is called
      const buildTestResultEnv = (session as unknown as { buildTestResultEnv: (root: string) => NodeJS.ProcessEnv }).buildTestResultEnv.bind(
        session,
      );
      const env = buildTestResultEnv(workspaceRoot);

      // Then: It points to the workspace-local test-result.json path
      assert.strictEqual(env.DONTFORGETEST_TEST_RESULT_FILE, path.join(workspaceRoot, '.vscode-test', 'test-result.json'));
    });

    test('TC-TGS-READ-E-01: readTestResultFile returns undefined when test-result.json does not exist', async () => {
      // Given: A workspace without the file
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const session = createSession(workspaceRoot);

      // When: readTestResultFile is called
      const readTestResultFile = (session as unknown as {
        readTestResultFile: (testWorkspaceRoot: string, startedAtMs: number) => Promise<unknown>;
      }).readTestResultFile.bind(session);
      const result = await readTestResultFile(workspaceRoot, Date.now());

      // Then: It returns undefined and does not throw
      assert.strictEqual(result, undefined);
    });

    test('TC-TGS-READ-E-02: readTestResultFile returns undefined when fs.stat/readFile fails (e.g., EACCES)', async () => {
      // Given: A file exists but fs.readFile rejects
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const session = createSession(workspaceRoot);
      const filePath = ensureTestResultFile(workspaceRoot, JSON.stringify({ timestamp: Date.now(), failures: 0 }));

      const originalReadFile = fs.promises.readFile;
      fs.promises.readFile = (async () => {
        const err = new Error('EACCES');
        (err as NodeJS.ErrnoException).code = 'EACCES';
        throw err;
      }) as unknown as typeof fs.promises.readFile;

      try {
        // When: readTestResultFile is called
        const readTestResultFile = (session as unknown as {
          readTestResultFile: (testWorkspaceRoot: string, startedAtMs: number) => Promise<unknown>;
        }).readTestResultFile.bind(session);
        const result = await readTestResultFile(workspaceRoot, Date.now());

        // Then: It returns undefined
        assert.strictEqual(result, undefined);
      } finally {
        fs.promises.readFile = originalReadFile;
        assert.ok(fs.existsSync(filePath));
      }
    });

    test('TC-TGS-READ-E-03: readTestResultFile returns undefined when parseTestResultFile returns ok=false', async () => {
      // Given: test-result.json exists but is invalid JSON
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const session = createSession(workspaceRoot);
      ensureTestResultFile(workspaceRoot, '{ invalid');

      // When: readTestResultFile is called
      const readTestResultFile = (session as unknown as {
        readTestResultFile: (testWorkspaceRoot: string, startedAtMs: number) => Promise<unknown>;
      }).readTestResultFile.bind(session);
      const result = await readTestResultFile(workspaceRoot, Date.now());

      // Then: It returns undefined
      assert.strictEqual(result, undefined);
    });

    test('TC-TGS-READ-N-01: readTestResultFile accepts by mtime freshness (within 1000ms grace)', async () => {
      // Given: A valid file whose mtime is within the grace window
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const session = createSession(workspaceRoot);
      const startedAtMs = Date.now();
      const filePath = ensureTestResultFile(workspaceRoot, JSON.stringify({ timestamp: 0, failures: 0 }));
      fs.utimesSync(filePath, new Date(startedAtMs - 999), new Date(startedAtMs - 999));

      // When: readTestResultFile is called
      const readTestResultFile = (session as unknown as {
        readTestResultFile: (testWorkspaceRoot: string, startedAtMs: number) => Promise<unknown>;
      }).readTestResultFile.bind(session);
      const result = await readTestResultFile(workspaceRoot, startedAtMs);

      // Then: The structured result is accepted
      assert.ok(result !== undefined);
    });

    test('TC-TGS-READ-N-02: readTestResultFile accepts by JSON timestamp freshness even if mtime is stale', async () => {
      // Given: mtime is stale but JSON timestamp is fresh
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const session = createSession(workspaceRoot);
      const startedAtMs = Date.now();
      const filePath = ensureTestResultFile(workspaceRoot, JSON.stringify({ timestamp: startedAtMs, failures: 0 }));
      fs.utimesSync(filePath, new Date(0), new Date(0));

      // When: readTestResultFile is called
      const readTestResultFile = (session as unknown as {
        readTestResultFile: (testWorkspaceRoot: string, startedAtMs: number) => Promise<unknown>;
      }).readTestResultFile.bind(session);
      const result = await readTestResultFile(workspaceRoot, startedAtMs);

      // Then: It is accepted by timestamp freshness
      assert.ok(result !== undefined);
    });

    test('TC-TGS-READ-A-01: readTestResultFile rejects stale file when mtime and timestamp are both too old', async () => {
      // Given: A stale file (mtime and timestamp are old)
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const session = createSession(workspaceRoot);
      const filePath = ensureTestResultFile(workspaceRoot, JSON.stringify({ timestamp: 0, failures: 0 }));
      fs.utimesSync(filePath, new Date(0), new Date(0));
      const startedAtMs = Date.now();

      // When: readTestResultFile is called
      const readTestResultFile = (session as unknown as {
        readTestResultFile: (testWorkspaceRoot: string, startedAtMs: number) => Promise<unknown>;
      }).readTestResultFile.bind(session);
      const result = await readTestResultFile(workspaceRoot, startedAtMs);

      // Then: It is rejected (undefined)
      assert.strictEqual(result, undefined);
    });

    test('TC-TGS-READ-B-01: readTestResultFile accepts when mtimeMs == startedAtMs - 1000 (grace boundary)', async () => {
      // Given: mtime exactly at the boundary (using rounded values to avoid FS precision issues)
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const session = createSession(workspaceRoot);
      const startedAtMs = Math.floor(Date.now() / 1000) * 1000;
      const filePath = ensureTestResultFile(workspaceRoot, JSON.stringify({ timestamp: 0, failures: 0 }));
      fs.utimesSync(filePath, new Date(startedAtMs - 1000), new Date(startedAtMs - 1000));

      // When: readTestResultFile is called
      const readTestResultFile = (session as unknown as {
        readTestResultFile: (testWorkspaceRoot: string, startedAtMs: number) => Promise<unknown>;
      }).readTestResultFile.bind(session);
      const result = await readTestResultFile(workspaceRoot, startedAtMs);

      // Then: It is accepted
      assert.ok(result !== undefined);
    });

    test('TC-TGS-READ-B-02: readTestResultFile rejects when mtimeMs is outside grace (startedAtMs - 1001) and timestamp is stale', async () => {
      // Given: mtime is 1ms outside grace and timestamp is stale
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const session = createSession(workspaceRoot);
      const startedAtMs = Date.now();
      const filePath = ensureTestResultFile(workspaceRoot, JSON.stringify({ timestamp: 0, failures: 0 }));
      fs.utimesSync(filePath, new Date(startedAtMs - 1001), new Date(startedAtMs - 1001));

      // When: readTestResultFile is called
      const readTestResultFile = (session as unknown as {
        readTestResultFile: (testWorkspaceRoot: string, startedAtMs: number) => Promise<unknown>;
      }).readTestResultFile.bind(session);
      const result = await readTestResultFile(workspaceRoot, startedAtMs);

      // Then: It is rejected
      assert.strictEqual(result, undefined);
    });

    test('TC-TGS-ATTACH-N-01: attachTestResult returns a new object with testResult when a fresh file is available', async () => {
      // Given: A fresh test-result.json
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const session = createSession(workspaceRoot);
      const startedAtMs = Date.now();
      ensureTestResultFile(workspaceRoot, JSON.stringify({ timestamp: startedAtMs, failures: 0, tests: [], failedTests: [] }));

      // When: attachTestResult is called
      const attachTestResult = (session as unknown as {
        attachTestResult: (params: { result: unknown; testWorkspaceRoot: string; startedAtMs: number }) => Promise<unknown>;
      }).attachTestResult.bind(session);
      const original = { command: 'cmd' };
      const enriched = (await attachTestResult({ result: original, testWorkspaceRoot: workspaceRoot, startedAtMs })) as {
        testResult?: { timestamp?: number };
      };

      // Then: It returns a different reference and has testResult
      assert.notStrictEqual(enriched, original);
      assert.ok(typeof enriched.testResult?.timestamp === 'number');
    });

    test('TC-TGS-ATTACH-A-01: attachTestResult returns the original object when testResult is unavailable', async () => {
      // Given: No test-result.json file
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const session = createSession(workspaceRoot);

      // When: attachTestResult is called
      const attachTestResult = (session as unknown as {
        attachTestResult: (params: { result: unknown; testWorkspaceRoot: string; startedAtMs: number }) => Promise<unknown>;
      }).attachTestResult.bind(session);
      const original = { command: 'cmd' };
      const enriched = (await attachTestResult({ result: original, testWorkspaceRoot: workspaceRoot, startedAtMs: Date.now() })) as unknown;

      // Then: It returns the original reference (no unnecessary object creation)
      assert.strictEqual(enriched, original);
    });

    test('TC-TGS-N-01: runTestExecution passes enriched result (with testResult) to saveTestExecutionReport', async () => {
      // Given: A session with stubbed runTestCommand and saveTestExecutionReport, and a fresh test-result.json
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ scripts: { test: 'echo ok' } }), 'utf8');
      ensureTestResultFile(workspaceRoot, JSON.stringify({ timestamp: Date.now(), failures: 0, tests: [], failedTests: [] }));

      const session = createSession(workspaceRoot);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const testRunner = require('../../../../core/testRunner') as typeof import('../../../../core/testRunner');

      const originalSave = artifacts.saveTestExecutionReport;
      const originalRun = testRunner.runTestCommand;

      let captured: import('../../../../core/artifacts').TestExecutionResult | undefined;
      let capturedEnv: NodeJS.ProcessEnv | undefined;
      artifacts.saveTestExecutionReport = (async (params: { result: import('../../../../core/artifacts').TestExecutionResult }) => {
        captured = params.result;
        return { absolutePath: '/tmp/report.md' };
      }) as unknown as typeof artifacts.saveTestExecutionReport;

      testRunner.runTestCommand = (async (params: { env?: NodeJS.ProcessEnv }) => {
        capturedEnv = params.env;
        return {
          command: 'npm test',
          cwd: workspaceRoot,
          exitCode: 0,
          signal: null,
          durationMs: 1,
          stdout: '',
          stderr: '',
        };
      }) as unknown as typeof testRunner.runTestCommand;

      try {
        // When: runTestExecution is called
        const runTestExecution = (session as unknown as { runTestExecution: (genExit: number | null) => Promise<void> }).runTestExecution.bind(session);
        await runTestExecution(0);

        // Then: saveTestExecutionReport receives a result that includes testResult
        assert.ok(captured, 'Expected saveTestExecutionReport to be called');
        assert.ok(captured?.testResult, 'Expected testResult to be attached');
        assert.ok(capturedEnv, 'Expected env to be passed to runTestCommand');
        assert.strictEqual(capturedEnv?.DONTFORGETEST_TEST_RESULT_FILE, path.join(workspaceRoot, '.vscode-test', 'test-result.json'));
      } finally {
        artifacts.saveTestExecutionReport = originalSave;
        testRunner.runTestCommand = originalRun;
      }
    });

    test('TC-TGS-A-01: runTestExecution does not attach stale test-result.json to saveTestExecutionReport', async () => {
      // Given: A stale test-result.json (timestamp/mtime are old)
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ scripts: { test: 'echo ok' } }), 'utf8');
      const filePath = ensureTestResultFile(workspaceRoot, JSON.stringify({ timestamp: 0, failures: 0, tests: [], failedTests: [] }));
      fs.utimesSync(filePath, new Date(0), new Date(0));

      const session = createSession(workspaceRoot);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const testRunner = require('../../../../core/testRunner') as typeof import('../../../../core/testRunner');

      const originalSave = artifacts.saveTestExecutionReport;
      const originalRun = testRunner.runTestCommand;

      let captured: import('../../../../core/artifacts').TestExecutionResult | undefined;
      let capturedEnv: NodeJS.ProcessEnv | undefined;
      artifacts.saveTestExecutionReport = (async (params: { result: import('../../../../core/artifacts').TestExecutionResult }) => {
        captured = params.result;
        return { absolutePath: '/tmp/report.md' };
      }) as unknown as typeof artifacts.saveTestExecutionReport;

      testRunner.runTestCommand = (async (params: { env?: NodeJS.ProcessEnv }) => {
        capturedEnv = params.env;
        return {
          command: 'npm test',
          cwd: workspaceRoot,
          exitCode: 0,
          signal: null,
          durationMs: 1,
          stdout: '',
          stderr: '',
        };
      }) as unknown as typeof testRunner.runTestCommand;

      try {
        // When: runTestExecution is called
        const runTestExecution = (session as unknown as { runTestExecution: (genExit: number | null) => Promise<void> }).runTestExecution.bind(session);
        await runTestExecution(0);

        // Then: saveTestExecutionReport receives a result without testResult
        assert.ok(captured, 'Expected saveTestExecutionReport to be called');
        assert.strictEqual(captured?.testResult, undefined);
        assert.ok(capturedEnv, 'Expected env to be passed to runTestCommand');
        assert.strictEqual(capturedEnv?.DONTFORGETEST_TEST_RESULT_FILE, path.join(workspaceRoot, '.vscode-test', 'test-result.json'));
      } finally {
        artifacts.saveTestExecutionReport = originalSave;
        testRunner.runTestCommand = originalRun;
      }
    });

    test('TC-TGS-RUN-N-02: cursorAgent runner fallback calls runTestCommand with env and passes enrichedFallbackResult to saveTestExecutionReport', async () => {
      // Given: A session configured to use cursorAgent runner and a cursorAgent result that should be treated as rejected
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ scripts: { test: 'echo ok' } }), 'utf8');
      ensureTestResultFile(workspaceRoot, JSON.stringify({ timestamp: Date.now(), failures: 0, tests: [], failedTests: [] }));

      const session = createSession(workspaceRoot, { testExecutionRunner: 'cursorAgent' });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const testRunner = require('../../../../core/testRunner') as typeof import('../../../../core/testRunner');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const testExecutionStep = require('../../../../commands/runWithArtifacts/testExecutionStep') as typeof import('../../../../commands/runWithArtifacts/testExecutionStep');

      const originalSave = artifacts.saveTestExecutionReport;
      const originalRun = testRunner.runTestCommand;
      const originalAgent = testExecutionStep.runTestCommandViaCursorAgent;

      let capturedResult: import('../../../../core/artifacts').TestExecutionResult | undefined;
      let capturedEnv: NodeJS.ProcessEnv | undefined;

      artifacts.saveTestExecutionReport = (async (params: { result: import('../../../../core/artifacts').TestExecutionResult }) => {
        capturedResult = params.result;
        return { absolutePath: '/tmp/report.md' };
      }) as unknown as typeof artifacts.saveTestExecutionReport;

      testExecutionStep.runTestCommandViaCursorAgent = (async () => {
        return {
          command: 'npm test',
          cwd: workspaceRoot,
          exitCode: null,
          signal: null,
          durationMs: 0,
          stdout: '',
          stderr: 'Tool execution rejected',
        };
      }) as unknown as typeof testExecutionStep.runTestCommandViaCursorAgent;

      testRunner.runTestCommand = (async (params: { env?: NodeJS.ProcessEnv }) => {
        capturedEnv = params.env;
        return {
          command: 'npm test',
          cwd: workspaceRoot,
          exitCode: 0,
          signal: null,
          durationMs: 1,
          stdout: '',
          stderr: '',
        };
      }) as unknown as typeof testRunner.runTestCommand;

      try {
        // When: runTestExecution is called
        const runTestExecution = (session as unknown as { runTestExecution: (genExit: number | null) => Promise<void> }).runTestExecution.bind(session);
        await runTestExecution(0);

        // Then: Fallback runTestCommand receives env and saveTestExecutionReport receives a result (possibly enriched)
        assert.ok(capturedEnv, 'Expected env to be passed to fallback runTestCommand');
        assert.strictEqual(capturedEnv?.DONTFORGETEST_TEST_RESULT_FILE, path.join(workspaceRoot, '.vscode-test', 'test-result.json'));
        assert.ok(capturedResult, 'Expected saveTestExecutionReport to be called');
      } finally {
        artifacts.saveTestExecutionReport = originalSave;
        testRunner.runTestCommand = originalRun;
        testExecutionStep.runTestCommandViaCursorAgent = originalAgent;
      }
    });

    test('TC-TGS-RUN-N-01: extension runner passes env (DONTFORGETEST_TEST_RESULT_FILE) to runTestCommand', async () => {
      // Given: A session configured to use extension runner and a stubbed runTestCommand
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ scripts: { test: 'echo ok' } }), 'utf8');
      ensureTestResultFile(workspaceRoot, JSON.stringify({ timestamp: Date.now(), failures: 0, tests: [], failedTests: [] }));

      const session = createSession(workspaceRoot, { testExecutionRunner: 'extension' });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const testRunner = require('../../../../core/testRunner') as typeof import('../../../../core/testRunner');

      const originalSave = artifacts.saveTestExecutionReport;
      const originalRun = testRunner.runTestCommand;

      let capturedEnv: NodeJS.ProcessEnv | undefined;
      artifacts.saveTestExecutionReport = (async () => {
        return { absolutePath: '/tmp/report.md' };
      }) as unknown as typeof artifacts.saveTestExecutionReport;

      testRunner.runTestCommand = (async (params: { env?: NodeJS.ProcessEnv }) => {
        capturedEnv = params.env;
        return {
          command: 'npm test',
          cwd: workspaceRoot,
          exitCode: 0,
          signal: null,
          durationMs: 1,
          stdout: '',
          stderr: '',
        };
      }) as unknown as typeof testRunner.runTestCommand;

      try {
        // When: runTestExecution is called
        const runTestExecution = (session as unknown as { runTestExecution: (genExit: number | null) => Promise<void> }).runTestExecution.bind(session);
        await runTestExecution(0);

        // Then: env is passed to runTestCommand with the workspace-local test result path
        assert.ok(capturedEnv);
        assert.strictEqual(capturedEnv?.DONTFORGETEST_TEST_RESULT_FILE, path.join(workspaceRoot, '.vscode-test', 'test-result.json'));
      } finally {
        artifacts.saveTestExecutionReport = originalSave;
        testRunner.runTestCommand = originalRun;
      }
    });
  });
});
