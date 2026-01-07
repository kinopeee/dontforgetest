import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TestGenerationSession, __test__ } from '../../../../commands/runWithArtifacts/testGenerationSession';
import { taskManager } from '../../../../core/taskManager';

suite('commands/runWithArtifacts/testGenerationSession.ts', () => {
  const workspaceRoots: string[] = [];
  const readFileUtf8 = (filePath: string) => fs.promises.readFile(filePath, 'utf8');

  teardown(async () => {
    for (const root of workspaceRoots) {
      try {
        await fs.promises.rm(root, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    workspaceRoots.length = 0;
  });

  // TC-LL-N-01: Commands containing out/test/runTest.js return true
  test('TC-LL-N-01: returns true for commands containing out/test/runTest.js', async () => {
    // Given: A temporary workspace root
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    workspaceRoots.push(workspaceRoot);

    // When: Checking a command containing out/test/runTest.js
    const result = await __test__.looksLikeVsCodeLaunchingTestCommand({
      workspaceRoot,
      testCommand: 'node ./out/test/runTest.js',
      readFileUtf8,
    });

    // Then: It returns true
    assert.strictEqual(result, true, 'Expected true for commands containing out/test/runTest.js');
  });

  // TC-LL-N-02: For "npm test", returns true when package.json test script launches VS Code
  test('TC-LL-N-02: returns true for "npm test" when package.json test script uses @vscode/test-electron', async () => {
    // Given: A package.json with a VS Code launching test script
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    workspaceRoots.push(workspaceRoot);
    const pkg = {
      scripts: {
        test: 'node ./node_modules/@vscode/test-electron/out/runTest.js',
      },
    };
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify(pkg), 'utf8');

    // When: Checking "npm test"
    const result = await __test__.looksLikeVsCodeLaunchingTestCommand({
      workspaceRoot,
      testCommand: 'npm test',
      readFileUtf8,
    });

    // Then: It returns true
    assert.strictEqual(result, true, 'Expected true when npm test launches VS Code tests');
  });

  // TC-LL-E-01: Returns false when package.json is missing
  test('TC-LL-E-01: returns false when package.json is missing', async () => {
    // Given: A workspace root without package.json
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    workspaceRoots.push(workspaceRoot);

    // When: Checking "npm test"
    const result = await __test__.looksLikeVsCodeLaunchingTestCommand({
      workspaceRoot,
      testCommand: 'npm test',
      readFileUtf8,
    });

    // Then: It returns false
    assert.strictEqual(result, false, 'Expected false when package.json is missing');
  });

  // TC-LL-B-01: Empty command returns false
  test('TC-LL-B-01: returns false for an empty command', async () => {
    // Given: An empty command (boundary)
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    workspaceRoots.push(workspaceRoot);

    // When: Checking an empty command
    const result = await __test__.looksLikeVsCodeLaunchingTestCommand({
      workspaceRoot,
      testCommand: '',
      readFileUtf8,
    });

    // Then: It returns false
    assert.strictEqual(result, false, 'Expected false for an empty command');
  });

  // TC-LL-B-02: Non-"npm test" commands return false
  test('TC-LL-B-02: returns false for commands other than "npm test"', async () => {
    // Given: A command that is not "npm test"
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
    workspaceRoots.push(workspaceRoot);

    // When: Checking "npm run build"
    const result = await __test__.looksLikeVsCodeLaunchingTestCommand({
      workspaceRoot,
      testCommand: 'npm run build',
      readFileUtf8,
    });

    // Then: It returns false
    assert.strictEqual(result, false, 'Expected false for commands other than "npm test"');
  });

  suite('readTestResultFile / attachTestResult', () => {
    const dummyProvider = {
      id: 'dummy',
      displayName: 'dummy',
      run: () => ({ taskId: 'dummy-task', dispose: () => {} }),
    };

    const createSession = (
      workspaceRoot: string,
      settingsOverride?: Record<string, unknown>,
      extensionContextOverride?: unknown,
    ) => {
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
        extensionContext: extensionContextOverride as import('vscode').ExtensionContext,
      });
    };

    const ensureTestResultFile = (workspaceRoot: string, content: string): string => {
      const dir = path.join(workspaceRoot, '.vscode-test');
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, 'test-result.json');
      fs.writeFileSync(filePath, content, 'utf8');
      return filePath;
    };

    test('TC-SES-TRP-N-01: resolveTestResultFilePath(testWorkspaceRoot) returns <root>/.vscode-test/test-result.json', () => {
      // Given: A session and a workspace root
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const session = createSession(workspaceRoot);

      // When: resolveTestResultFilePath is called
      const resolveTestResultFilePath = (session as unknown as { resolveTestResultFilePath: (root: string) => string })
        .resolveTestResultFilePath.bind(session);
      const filePath = resolveTestResultFilePath(workspaceRoot);

      // Then: It matches path.join(...) for the workspace root
      assert.strictEqual(filePath, path.join(workspaceRoot, '.vscode-test', 'test-result.json'));
    });

    test('TC-SES-ENV-N-01: buildTestResultEnv(testResultFilePath) sets DONTFORGETEST_TEST_RESULT_FILE to the provided file path', () => {
      // Given: A session and a resolved test result file path
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const session = createSession(workspaceRoot);
      const testResultFilePath = path.join(workspaceRoot, '.vscode-test', 'test-result.json');

      // When: buildTestResultEnv is called with a file path
      const buildTestResultEnv = (session as unknown as { buildTestResultEnv: (filePath: string) => NodeJS.ProcessEnv }).buildTestResultEnv.bind(
        session,
      );
      const env = buildTestResultEnv(testResultFilePath);

      // Then: It uses the given file path verbatim
      assert.strictEqual(env.DONTFORGETEST_TEST_RESULT_FILE, testResultFilePath);
    });

    // TC-N-04
    test('TC-N-04: constructor sets DONTFORGETEST_DEBUG_LOG_ROOT to workspaceRoot when it is undefined', () => {
      // Given: DONTFORGETEST_DEBUG_LOG_ROOT is undefined
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const originalDebugRoot = process.env.DONTFORGETEST_DEBUG_LOG_ROOT;
      delete process.env.DONTFORGETEST_DEBUG_LOG_ROOT;

      try {
        // When: A session is created
        createSession(workspaceRoot);

        // Then: DONTFORGETEST_DEBUG_LOG_ROOT is set to the workspaceRoot
        assert.strictEqual(process.env.DONTFORGETEST_DEBUG_LOG_ROOT, workspaceRoot);
      } finally {
        process.env.DONTFORGETEST_DEBUG_LOG_ROOT = originalDebugRoot;
      }
    });

    test('TC-ENV-DEBUG-03: constructor does NOT overwrite DONTFORGETEST_DEBUG_LOG_ROOT when already set', () => {
      // Given: DONTFORGETEST_DEBUG_LOG_ROOT is already set
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const originalDebugRoot = process.env.DONTFORGETEST_DEBUG_LOG_ROOT;
      const existingValue = '/existing/path';
      process.env.DONTFORGETEST_DEBUG_LOG_ROOT = existingValue;

      try {
        // When: A session is created
        createSession(workspaceRoot);

        // Then: DONTFORGETEST_DEBUG_LOG_ROOT remains unchanged
        assert.strictEqual(process.env.DONTFORGETEST_DEBUG_LOG_ROOT, existingValue);
      } finally {
        process.env.DONTFORGETEST_DEBUG_LOG_ROOT = originalDebugRoot;
      }
    });

    // TC-B-03
    test('TC-B-03: constructor sets DONTFORGETEST_DEBUG_LOG_ROOT to workspaceRoot when it is an empty string', () => {
      // Given: DONTFORGETEST_DEBUG_LOG_ROOT is an empty string
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const originalDebugRoot = process.env.DONTFORGETEST_DEBUG_LOG_ROOT;
      process.env.DONTFORGETEST_DEBUG_LOG_ROOT = '';

      try {
        // When: A session is created
        createSession(workspaceRoot);

        // Then: DONTFORGETEST_DEBUG_LOG_ROOT is set to the workspaceRoot
        assert.strictEqual(process.env.DONTFORGETEST_DEBUG_LOG_ROOT, workspaceRoot);
      } finally {
        process.env.DONTFORGETEST_DEBUG_LOG_ROOT = originalDebugRoot;
      }
    });

    test('TC-B-03 (whitespace): constructor sets DONTFORGETEST_DEBUG_LOG_ROOT to workspaceRoot when it is whitespace only', () => {
      // Given: DONTFORGETEST_DEBUG_LOG_ROOT is whitespace only
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const originalDebugRoot = process.env.DONTFORGETEST_DEBUG_LOG_ROOT;
      process.env.DONTFORGETEST_DEBUG_LOG_ROOT = '   ';

      try {
        // When: A session is created
        createSession(workspaceRoot);

        // Then: DONTFORGETEST_DEBUG_LOG_ROOT is set to the workspaceRoot
        assert.strictEqual(process.env.DONTFORGETEST_DEBUG_LOG_ROOT, workspaceRoot);
      } finally {
        process.env.DONTFORGETEST_DEBUG_LOG_ROOT = originalDebugRoot;
      }
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

    test('TC-SES-ATTACH-N-01: runTestExecution passes enriched result (with testResult + testResultPath + extensionVersion) to saveTestExecutionReport', async () => {
      // Given: A session with stubbed runTestCommand and saveTestExecutionReport, and a fresh test-result.json
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ scripts: { test: 'echo ok' } }), 'utf8');
      ensureTestResultFile(workspaceRoot, JSON.stringify({ timestamp: Date.now(), failures: 0, tests: [], failedTests: [] }));

      const session = createSession(
        workspaceRoot,
        undefined,
        { extension: { packageJSON: { version: ' 1.2.3 ' } } } as unknown,
      );

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

        // Then: saveTestExecutionReport receives a result that includes testResult + metadata
        assert.ok(captured, 'Expected saveTestExecutionReport to be called');
        assert.ok(captured?.testResult, 'Expected testResult to be attached');
        assert.strictEqual(captured?.testResultPath, path.join(workspaceRoot, '.vscode-test', 'test-result.json'));
        assert.strictEqual(captured?.extensionVersion, '1.2.3');
        assert.ok(capturedEnv, 'Expected env to be passed to runTestCommand');
        assert.strictEqual(capturedEnv?.DONTFORGETEST_TEST_RESULT_FILE, path.join(workspaceRoot, '.vscode-test', 'test-result.json'));
      } finally {
        artifacts.saveTestExecutionReport = originalSave;
        testRunner.runTestCommand = originalRun;
      }
    });

    test('TC-SES-ATTACH-E-01: runTestExecution does not attach stale test-result.json but still passes testResultPath + extensionVersion', async () => {
      // Given: A stale test-result.json (timestamp/mtime are old)
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ scripts: { test: 'echo ok' } }), 'utf8');
      const filePath = ensureTestResultFile(workspaceRoot, JSON.stringify({ timestamp: 0, failures: 0, tests: [], failedTests: [] }));
      fs.utimesSync(filePath, new Date(0), new Date(0));

      const session = createSession(
        workspaceRoot,
        undefined,
        { extension: { packageJSON: { version: ' 1.2.3 ' } } } as unknown,
      );

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

        // Then: saveTestExecutionReport receives a result without testResult but with testResultPath + extensionVersion
        assert.ok(captured, 'Expected saveTestExecutionReport to be called');
        assert.strictEqual(captured?.testResult, undefined);
        assert.strictEqual(captured?.testResultPath, path.join(workspaceRoot, '.vscode-test', 'test-result.json'));
        assert.strictEqual(captured?.extensionVersion, '1.2.3');
        assert.ok(capturedEnv, 'Expected env to be passed to runTestCommand');
        assert.strictEqual(capturedEnv?.DONTFORGETEST_TEST_RESULT_FILE, path.join(workspaceRoot, '.vscode-test', 'test-result.json'));
      } finally {
        artifacts.saveTestExecutionReport = originalSave;
        testRunner.runTestCommand = originalRun;
      }
    });

    test('TC-SES-EXTVER-N-01: resolveExtensionVersion prefers extensionContext version and trims whitespace', () => {
      // Given: A session with a context-provided version and a self extension version also available
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);

      const originalGetExtension = vscode.extensions.getExtension;
      (vscode.extensions as unknown as { getExtension: typeof vscode.extensions.getExtension }).getExtension = (() => {
        return { packageJSON: { version: '0.0.103' } } as unknown as vscode.Extension<unknown>;
      }) as typeof vscode.extensions.getExtension;

      const session = createSession(
        workspaceRoot,
        undefined,
        { extension: { packageJSON: { version: ' 1.2.3 ' } } } as unknown,
      );

      try {
        // When: resolveExtensionVersion is called
        const resolveExtensionVersion = (session as unknown as { resolveExtensionVersion: () => string | undefined }).resolveExtensionVersion.bind(
          session,
        );
        const resolved = resolveExtensionVersion();

        // Then: It prefers the context version and trims it
        assert.strictEqual(resolved, '1.2.3');
      } finally {
        (vscode.extensions as unknown as { getExtension: typeof originalGetExtension }).getExtension = originalGetExtension;
      }
    });

    test('TC-SES-EXTVER-B-EMPTY-01: resolveExtensionVersion ignores empty context version and falls back to self extension version', async () => {
      // Given: A session with empty context version and a stubbed vscode.extensions.getExtension
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ scripts: { test: 'echo ok' } }), 'utf8');

      const originalGetExtension = vscode.extensions.getExtension;
      (vscode.extensions as unknown as { getExtension: typeof vscode.extensions.getExtension }).getExtension = (() => {
        return { packageJSON: { version: '0.0.103' } } as unknown as vscode.Extension<unknown>;
      }) as typeof vscode.extensions.getExtension;

      const session = createSession(
        workspaceRoot,
        undefined,
        { extension: { packageJSON: { version: '' } } } as unknown,
      );

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const testRunner = require('../../../../core/testRunner') as typeof import('../../../../core/testRunner');

      const originalSave = artifacts.saveTestExecutionReport;
      const originalRun = testRunner.runTestCommand;

      let captured: import('../../../../core/artifacts').TestExecutionResult | undefined;
      artifacts.saveTestExecutionReport = (async (params: { result: import('../../../../core/artifacts').TestExecutionResult }) => {
        captured = params.result;
        return { absolutePath: '/tmp/report.md' };
      }) as unknown as typeof artifacts.saveTestExecutionReport;
      testRunner.runTestCommand = (async () => {
        return { command: 'npm test', cwd: workspaceRoot, exitCode: 0, signal: null, durationMs: 1, stdout: '', stderr: '' };
      }) as unknown as typeof testRunner.runTestCommand;

      try {
        // When: runTestExecution is called
        const runTestExecution = (session as unknown as { runTestExecution: (genExit: number | null) => Promise<void> }).runTestExecution.bind(session);
        await runTestExecution(0);

        // Then: The saved result uses the self version (fallback)
        assert.ok(captured);
        assert.strictEqual(captured?.extensionVersion, '0.0.103');
      } finally {
        artifacts.saveTestExecutionReport = originalSave;
        testRunner.runTestCommand = originalRun;
        (vscode.extensions as unknown as { getExtension: typeof originalGetExtension }).getExtension = originalGetExtension;
      }
    });

    test('TC-SES-EXTVER-B-WS-01: resolveExtensionVersion ignores whitespace-only context version and falls back to self extension version', async () => {
      // Given: A session with whitespace-only context version and a stubbed vscode.extensions.getExtension
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ scripts: { test: 'echo ok' } }), 'utf8');

      const originalGetExtension = vscode.extensions.getExtension;
      (vscode.extensions as unknown as { getExtension: typeof vscode.extensions.getExtension }).getExtension = (() => {
        return { packageJSON: { version: '0.0.103' } } as unknown as vscode.Extension<unknown>;
      }) as typeof vscode.extensions.getExtension;

      const session = createSession(
        workspaceRoot,
        undefined,
        { extension: { packageJSON: { version: ' ' } } } as unknown,
      );

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const testRunner = require('../../../../core/testRunner') as typeof import('../../../../core/testRunner');

      const originalSave = artifacts.saveTestExecutionReport;
      const originalRun = testRunner.runTestCommand;

      let captured: import('../../../../core/artifacts').TestExecutionResult | undefined;
      artifacts.saveTestExecutionReport = (async (params: { result: import('../../../../core/artifacts').TestExecutionResult }) => {
        captured = params.result;
        return { absolutePath: '/tmp/report.md' };
      }) as unknown as typeof artifacts.saveTestExecutionReport;
      testRunner.runTestCommand = (async () => {
        return { command: 'npm test', cwd: workspaceRoot, exitCode: 0, signal: null, durationMs: 1, stdout: '', stderr: '' };
      }) as unknown as typeof testRunner.runTestCommand;

      try {
        // When: runTestExecution is called
        const runTestExecution = (session as unknown as { runTestExecution: (genExit: number | null) => Promise<void> }).runTestExecution.bind(session);
        await runTestExecution(0);

        // Then: The saved result uses the self version (fallback)
        assert.ok(captured);
        assert.strictEqual(captured?.extensionVersion, '0.0.103');
      } finally {
        artifacts.saveTestExecutionReport = originalSave;
        testRunner.runTestCommand = originalRun;
        (vscode.extensions as unknown as { getExtension: typeof originalGetExtension }).getExtension = originalGetExtension;
      }
    });

    test('TC-SES-EXTVER-N-02: resolveExtensionVersion uses self extension version when extensionContext is undefined', async () => {
      // Given: A session with no extensionContext and a stubbed vscode.extensions.getExtension
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ scripts: { test: 'echo ok' } }), 'utf8');

      const originalGetExtension = vscode.extensions.getExtension;
      (vscode.extensions as unknown as { getExtension: typeof vscode.extensions.getExtension }).getExtension = (() => {
        return { packageJSON: { version: '0.0.103' } } as unknown as vscode.Extension<unknown>;
      }) as typeof vscode.extensions.getExtension;

      const session = createSession(workspaceRoot, undefined, undefined);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const testRunner = require('../../../../core/testRunner') as typeof import('../../../../core/testRunner');

      const originalSave = artifacts.saveTestExecutionReport;
      const originalRun = testRunner.runTestCommand;

      let captured: import('../../../../core/artifacts').TestExecutionResult | undefined;
      artifacts.saveTestExecutionReport = (async (params: { result: import('../../../../core/artifacts').TestExecutionResult }) => {
        captured = params.result;
        return { absolutePath: '/tmp/report.md' };
      }) as unknown as typeof artifacts.saveTestExecutionReport;
      testRunner.runTestCommand = (async () => {
        return { command: 'npm test', cwd: workspaceRoot, exitCode: 0, signal: null, durationMs: 1, stdout: '', stderr: '' };
      }) as unknown as typeof testRunner.runTestCommand;

      try {
        // When: runTestExecution is called
        const runTestExecution = (session as unknown as { runTestExecution: (genExit: number | null) => Promise<void> }).runTestExecution.bind(session);
        await runTestExecution(0);

        // Then: The saved result uses the self version
        assert.ok(captured);
        assert.strictEqual(captured?.extensionVersion, '0.0.103');
      } finally {
        artifacts.saveTestExecutionReport = originalSave;
        testRunner.runTestCommand = originalRun;
        (vscode.extensions as unknown as { getExtension: typeof originalGetExtension }).getExtension = originalGetExtension;
      }
    });

    test('TC-SES-EXTVER-B-NULL-01: resolveExtensionVersion returns undefined when extensionContext is null and self extension is unavailable', async () => {
      // Given: A session with null extensionContext and vscode.extensions.getExtension returning undefined
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ scripts: { test: 'echo ok' } }), 'utf8');

      const originalGetExtension = vscode.extensions.getExtension;
      (vscode.extensions as unknown as { getExtension: typeof vscode.extensions.getExtension }).getExtension = (() => {
        return undefined;
      }) as typeof vscode.extensions.getExtension;

      const session = createSession(workspaceRoot, undefined, null);

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const testRunner = require('../../../../core/testRunner') as typeof import('../../../../core/testRunner');

      const originalSave = artifacts.saveTestExecutionReport;
      const originalRun = testRunner.runTestCommand;

      let captured: import('../../../../core/artifacts').TestExecutionResult | undefined;
      artifacts.saveTestExecutionReport = (async (params: { result: import('../../../../core/artifacts').TestExecutionResult }) => {
        captured = params.result;
        return { absolutePath: '/tmp/report.md' };
      }) as unknown as typeof artifacts.saveTestExecutionReport;
      testRunner.runTestCommand = (async () => {
        return { command: 'npm test', cwd: workspaceRoot, exitCode: 0, signal: null, durationMs: 1, stdout: '', stderr: '' };
      }) as unknown as typeof testRunner.runTestCommand;

      try {
        // When: runTestExecution is called
        const runTestExecution = (session as unknown as { runTestExecution: (genExit: number | null) => Promise<void> }).runTestExecution.bind(session);
        await runTestExecution(0);

        // Then: The saved result has extensionVersion undefined
        assert.ok(captured);
        assert.strictEqual(captured?.extensionVersion, undefined);
      } finally {
        artifacts.saveTestExecutionReport = originalSave;
        testRunner.runTestCommand = originalRun;
        (vscode.extensions as unknown as { getExtension: typeof originalGetExtension }).getExtension = originalGetExtension;
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

    // TC-SESSION-SKIP-N-01
    test('TC-SESSION-SKIP-N-01: runTestExecution creates a skipped result with durationMs=0 and executionRunner="unknown" when testCommand is empty', async () => {
      // Given: A session where testCommand is empty (intentional skip) and saveTestExecutionReport is stubbed
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const session = createSession(workspaceRoot, { testCommand: '' });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const l10n = require('../../../../core/l10n') as typeof import('../../../../core/l10n');

      const originalSave = artifacts.saveTestExecutionReport;
      let captured: import('../../../../core/artifacts').TestExecutionResult | undefined;
      artifacts.saveTestExecutionReport = (async (params: { result: import('../../../../core/artifacts').TestExecutionResult }) => {
        captured = params.result;
        return { absolutePath: '/tmp/report.md' };
      }) as unknown as typeof artifacts.saveTestExecutionReport;

      try {
        // When: runTestExecution is called
        const runTestExecution = (session as unknown as { runTestExecution: (genExit: number | null) => Promise<void> }).runTestExecution.bind(session);
        await runTestExecution(0);

        // Then: The skipped result has durationMs=0 and executionRunner="unknown"
        assert.ok(captured, 'Expected saveTestExecutionReport to be called');
        assert.strictEqual(captured?.skipped, true, 'Expected skipped=true');
        assert.strictEqual(captured?.durationMs, 0, 'Expected durationMs=0');
        assert.strictEqual(captured?.executionRunner, 'unknown', 'Expected executionRunner=unknown');
        assert.strictEqual(captured?.skipReason, l10n.t('testExecution.skip.emptyCommand'), 'Expected skipReason for empty command');
        assert.ok(typeof captured?.extensionLog === 'string', 'Expected extensionLog to be present');

      } finally {
        artifacts.saveTestExecutionReport = originalSave;
      }
    });

    // TC-SESSION-SKIP-E-01
    test('TC-SESSION-SKIP-E-01: buildTestExecutionArtifactMarkdown uses envSource=unknown for skipped result (executionRunner="unknown")', async () => {
      // Given: A skipped result created by runTestExecution (empty testCommand)
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      const session = createSession(workspaceRoot, { testCommand: '' });

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const l10n = require('../../../../core/l10n') as typeof import('../../../../core/l10n');

      const originalSave = artifacts.saveTestExecutionReport;
      let captured: import('../../../../core/artifacts').TestExecutionResult | undefined;
      artifacts.saveTestExecutionReport = (async (params: { result: import('../../../../core/artifacts').TestExecutionResult }) => {
        captured = params.result;
        return { absolutePath: '/tmp/report.md' };
      }) as unknown as typeof artifacts.saveTestExecutionReport;

      try {
        // When: runTestExecution is called
        const runTestExecution = (session as unknown as { runTestExecution: (genExit: number | null) => Promise<void> }).runTestExecution.bind(
          session,
        );
        await runTestExecution(0);

        // Then: The report markdown uses envSource=unknown (no local fallback)
        assert.ok(captured, 'Expected skipped result to be saved');
        const md = artifacts.buildTestExecutionArtifactMarkdown({
          generatedAtMs: Date.now(),
          generationLabel: 'Label',
          targetPaths: [],
          result: captured as import('../../../../core/artifacts').TestExecutionResult,
        });
        assert.ok(
          md.includes(`- ${l10n.t('artifact.executionReport.envSource')}: ${l10n.t('artifact.executionReport.envSource.unknown')}`),
          'Expected envSource label to be unknown',
        );
      } finally {
        artifacts.saveTestExecutionReport = originalSave;
      }
    });

    // TC-SESSION-SKIP-N-02
    test('TC-SESSION-SKIP-N-02: runTestExecution skips with executionRunner="unknown" when runLocation="worktree" and worktree changes are not applied', async () => {
      // Given: A worktree-mode session where applyWorktreeTestChanges returns applied=false
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      workspaceRoots.push(workspaceRoot);
      fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ scripts: { test: 'echo ok' } }), 'utf8');

      const session = new TestGenerationSession({
        provider: dummyProvider,
        workspaceRoot,
        cursorAgentCommand: 'cursor-agent',
        testStrategyPath: '',
        generationLabel: 'Label',
        targetPaths: [],
        generationPrompt: '',
        perspectiveReferenceText: '',
        model: undefined,
        generationTaskId: 'task-worktree-skip',
        runLocation: 'worktree',
        settingsOverride: {
          includeTestPerspectiveTable: false,
          testExecutionRunner: 'extension',
          testCommand: 'npm test',
          enablePreTestCheck: false,
        },
        // Minimal ExtensionContext stub (only globalStorageUri is potentially accessed downstream)
        extensionContext: { globalStorageUri: { fsPath: workspaceRoot } } as unknown as import('vscode').ExtensionContext,
      });

      // Force worktreeDir truthy so runTestExecution enters the worktree apply step block
      (session as unknown as { worktreeDir?: string }).worktreeDir = path.join(workspaceRoot, '.worktree');

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const worktreeApplyStep = require('../../../../commands/runWithArtifacts/worktreeApplyStep') as typeof import('../../../../commands/runWithArtifacts/worktreeApplyStep');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const l10n = require('../../../../core/l10n') as typeof import('../../../../core/l10n');

      const originalApply = worktreeApplyStep.applyWorktreeTestChanges;
      const originalSave = artifacts.saveTestExecutionReport;

      let captured: import('../../../../core/artifacts').TestExecutionResult | undefined;
      worktreeApplyStep.applyWorktreeTestChanges = (async () => {
        return { applied: false, reason: 'apply-failed' };
      }) as unknown as typeof worktreeApplyStep.applyWorktreeTestChanges;
      artifacts.saveTestExecutionReport = (async (params: { result: import('../../../../core/artifacts').TestExecutionResult }) => {
        captured = params.result;
        return { absolutePath: '/tmp/report.md' };
      }) as unknown as typeof artifacts.saveTestExecutionReport;

      try {
        // When: runTestExecution is called
        const runTestExecution = (session as unknown as { runTestExecution: (genExit: number | null) => Promise<void> }).runTestExecution.bind(
          session,
        );
        await runTestExecution(0);

        // Then: It saves a skipped result with executionRunner=unknown and the worktree MVP skip reason
        assert.ok(captured, 'Expected saveTestExecutionReport to be called');
        assert.strictEqual(captured?.skipped, true);
        assert.strictEqual(captured?.executionRunner, 'unknown');
        assert.strictEqual(captured?.skipReason, l10n.t('testExecution.skip.worktreeMvp'));
      } finally {
        worktreeApplyStep.applyWorktreeTestChanges = originalApply;
        artifacts.saveTestExecutionReport = originalSave;
      }
    });
  });

  suite('phase updates (taskManager.updatePhase)', () => {
    const dummyProvider = {
      id: 'dummy',
      displayName: 'dummy',
      run: () => ({ taskId: 'dummy-task', dispose: () => {} }),
    };

    const createSession = (params: {
      workspaceRoot: string;
      generationTaskId: string;
      runMode: 'full' | 'perspectiveOnly';
      includeTestPerspectiveTable: boolean;
      testCommand: string;
    }): TestGenerationSession => {
      return new TestGenerationSession({
        provider: dummyProvider,
        workspaceRoot: params.workspaceRoot,
        cursorAgentCommand: 'cursor-agent',
        testStrategyPath: '',
        generationLabel: 'Label',
        targetPaths: [],
        generationPrompt: 'prompt',
        perspectiveReferenceText: 'ref',
        model: undefined,
        generationTaskId: params.generationTaskId,
        runLocation: 'local',
        runMode: params.runMode,
        settingsOverride: {
          includeTestPerspectiveTable: params.includeTestPerspectiveTable,
          testExecutionRunner: 'extension',
          testCommand: params.testCommand,
          enablePreTestCheck: false,
        },
        // Minimal ExtensionContext stub (not required for local runLocation)
        extensionContext: { extension: { packageJSON: { version: '0.0.0' } } } as unknown as vscode.ExtensionContext,
      });
    };

    setup(() => {
      taskManager.cancelAll();
      process.env.VSCODE_TEST_RUNNER = '1';
    });

    teardown(() => {
      taskManager.cancelAll();
      delete process.env.VSCODE_TEST_RUNNER;
    });

    test('TC-N-TGS-01: run() calls taskManager.updatePhase(taskId,"preparing","preparing") during prepare()', async () => {
      // Case ID: TC-N-TGS-01
      // Given: A full-mode session in local runLocation and patched dependencies
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-phase-'));
      workspaceRoots.push(workspaceRoot);
      const taskId = 'phase-preparing';

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const runToCompletion = require('../../../../providers/runToCompletion') as typeof import('../../../../providers/runToCompletion');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const testRunner = require('../../../../core/testRunner') as typeof import('../../../../core/testRunner');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const cleanupStep = require('../../../../commands/runWithArtifacts/cleanupStep') as typeof import('../../../../commands/runWithArtifacts/cleanupStep');

      const originalUpdatePhase = taskManager.updatePhase.bind(taskManager);
      const originalRunProviderToCompletion = runToCompletion.runProviderToCompletion;
      const originalSave = artifacts.saveTestExecutionReport;
      const originalRunTest = testRunner.runTestCommand;
      const originalCleanup = cleanupStep.cleanupUnexpectedPerspectiveFiles;

      const calls: Array<{ taskId: string; phase: string; phaseLabel: string }> = [];
      (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = ((id, phase, phaseLabel) => {
        calls.push({ taskId: id, phase, phaseLabel });
        originalUpdatePhase(id, phase, phaseLabel);
      }) as typeof taskManager.updatePhase;

      runToCompletion.runProviderToCompletion = (async () => 0) as unknown as typeof runToCompletion.runProviderToCompletion;
      cleanupStep.cleanupUnexpectedPerspectiveFiles = (async () => []) as unknown as typeof cleanupStep.cleanupUnexpectedPerspectiveFiles;
      testRunner.runTestCommand = (async () => {
        return { command: 'npm test', cwd: workspaceRoot, exitCode: 0, signal: null, durationMs: 1, stdout: '', stderr: '' };
      }) as unknown as typeof testRunner.runTestCommand;
      artifacts.saveTestExecutionReport = (async () => ({ absolutePath: '/tmp/report.md', relativePath: 'docs/report.md' })) as unknown as typeof artifacts.saveTestExecutionReport;

      const session = createSession({
        workspaceRoot,
        generationTaskId: taskId,
        runMode: 'full',
        includeTestPerspectiveTable: false,
        testCommand: '',
      });

      try {
        // When: run() is executed
        await session.run();

        // Then: updatePhase is called with preparing exactly once for the taskId
        const preparingCalls = calls.filter((c) => c.taskId === taskId && c.phase === 'preparing' && c.phaseLabel === 'preparing');
        assert.strictEqual(preparingCalls.length, 1);
      } finally {
        (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = originalUpdatePhase;
        runToCompletion.runProviderToCompletion = originalRunProviderToCompletion;
        artifacts.saveTestExecutionReport = originalSave;
        testRunner.runTestCommand = originalRunTest;
        cleanupStep.cleanupUnexpectedPerspectiveFiles = originalCleanup;
      }
    });

    test('TC-N-TGS-02: generatePerspectives() updates phase before runPerspectiveTableStep and calls updatePhase even if extraction fails', async () => {
      // Case ID: TC-N-TGS-02
      // Given: A full-mode session with includeTestPerspectiveTable=true and a stubbed runPerspectiveTableStep
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-phase-'));
      workspaceRoots.push(workspaceRoot);
      const taskId = 'phase-perspectives';

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const perspectiveStep = require('../../../../commands/runWithArtifacts/perspectiveStep') as typeof import('../../../../commands/runWithArtifacts/perspectiveStep');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const runToCompletion = require('../../../../providers/runToCompletion') as typeof import('../../../../providers/runToCompletion');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const testRunner = require('../../../../core/testRunner') as typeof import('../../../../core/testRunner');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const cleanupStep = require('../../../../commands/runWithArtifacts/cleanupStep') as typeof import('../../../../commands/runWithArtifacts/cleanupStep');

      const originalUpdatePhase = taskManager.updatePhase.bind(taskManager);
      const originalPerspective = perspectiveStep.runPerspectiveTableStep;
      const originalRunProviderToCompletion = runToCompletion.runProviderToCompletion;
      const originalSave = artifacts.saveTestExecutionReport;
      const originalRunTest = testRunner.runTestCommand;
      const originalCleanup = cleanupStep.cleanupUnexpectedPerspectiveFiles;

      let seenPerspectivesPhase = false;
      const calls: Array<{ phase: string; phaseLabel: string }> = [];
      (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = ((id, phase, phaseLabel) => {
        if (id === taskId && phase === 'perspectives' && phaseLabel === 'perspectives') {
          seenPerspectivesPhase = true;
        }
        calls.push({ phase, phaseLabel });
        originalUpdatePhase(id, phase, phaseLabel);
      }) as typeof taskManager.updatePhase;

      perspectiveStep.runPerspectiveTableStep = (async () => {
        assert.strictEqual(seenPerspectivesPhase, true, 'Expected updatePhase(perspectives) before runPerspectiveTableStep');
        return {
          saved: { absolutePath: '/tmp/p.md', relativePath: 'docs/test-perspectives/p.md' },
          extracted: false,
          markdown: 'ignored',
        };
      }) as unknown as typeof perspectiveStep.runPerspectiveTableStep;

      runToCompletion.runProviderToCompletion = (async () => 0) as unknown as typeof runToCompletion.runProviderToCompletion;
      cleanupStep.cleanupUnexpectedPerspectiveFiles = (async () => []) as unknown as typeof cleanupStep.cleanupUnexpectedPerspectiveFiles;
      testRunner.runTestCommand = (async () => {
        return { command: 'npm test', cwd: workspaceRoot, exitCode: 0, signal: null, durationMs: 1, stdout: '', stderr: '' };
      }) as unknown as typeof testRunner.runTestCommand;
      artifacts.saveTestExecutionReport = (async () => ({ absolutePath: '/tmp/report.md', relativePath: 'docs/report.md' })) as unknown as typeof artifacts.saveTestExecutionReport;

      const session = createSession({
        workspaceRoot,
        generationTaskId: taskId,
        runMode: 'full',
        includeTestPerspectiveTable: true,
        testCommand: '',
      });

      try {
        // When: run() is executed (generatePerspectives runs)
        await session.run();

        // Then: updatePhase was called for perspectives at least once
        const perspectiveCalls = calls.filter((c) => c.phase === 'perspectives' && c.phaseLabel === 'perspectives');
        assert.strictEqual(perspectiveCalls.length, 1);
      } finally {
        (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = originalUpdatePhase;
        perspectiveStep.runPerspectiveTableStep = originalPerspective;
        runToCompletion.runProviderToCompletion = originalRunProviderToCompletion;
        artifacts.saveTestExecutionReport = originalSave;
        testRunner.runTestCommand = originalRunTest;
        cleanupStep.cleanupUnexpectedPerspectiveFiles = originalCleanup;
      }
    });

    test('TC-E-TGS-03: generatePerspectives() does not update phase when includeTestPerspectiveTable=false in full mode', async () => {
      // Case ID: TC-E-TGS-03
      // Given: A full-mode session with includeTestPerspectiveTable=false
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-phase-'));
      workspaceRoots.push(workspaceRoot);
      const taskId = 'phase-no-perspectives';

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const runToCompletion = require('../../../../providers/runToCompletion') as typeof import('../../../../providers/runToCompletion');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const testRunner = require('../../../../core/testRunner') as typeof import('../../../../core/testRunner');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const cleanupStep = require('../../../../commands/runWithArtifacts/cleanupStep') as typeof import('../../../../commands/runWithArtifacts/cleanupStep');

      const originalUpdatePhase = taskManager.updatePhase.bind(taskManager);
      const originalRunProviderToCompletion = runToCompletion.runProviderToCompletion;
      const originalSave = artifacts.saveTestExecutionReport;
      const originalRunTest = testRunner.runTestCommand;
      const originalCleanup = cleanupStep.cleanupUnexpectedPerspectiveFiles;

      const phases: string[] = [];
      (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = ((id, phase, phaseLabel) => {
        if (id === taskId) {
          phases.push(`${phase}:${phaseLabel}`);
        }
        originalUpdatePhase(id, phase, phaseLabel);
      }) as typeof taskManager.updatePhase;

      runToCompletion.runProviderToCompletion = (async () => 0) as unknown as typeof runToCompletion.runProviderToCompletion;
      cleanupStep.cleanupUnexpectedPerspectiveFiles = (async () => []) as unknown as typeof cleanupStep.cleanupUnexpectedPerspectiveFiles;
      testRunner.runTestCommand = (async () => {
        return { command: 'npm test', cwd: workspaceRoot, exitCode: 0, signal: null, durationMs: 1, stdout: '', stderr: '' };
      }) as unknown as typeof testRunner.runTestCommand;
      artifacts.saveTestExecutionReport = (async () => ({ absolutePath: '/tmp/report.md', relativePath: 'docs/report.md' })) as unknown as typeof artifacts.saveTestExecutionReport;

      const session = createSession({
        workspaceRoot,
        generationTaskId: taskId,
        runMode: 'full',
        includeTestPerspectiveTable: false,
        testCommand: '',
      });

      try {
        // When: run() is executed
        await session.run();

        // Then: No perspectives phase update occurs for this task
        assert.strictEqual(phases.some((p) => p === 'perspectives:perspectives'), false);
      } finally {
        (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = originalUpdatePhase;
        runToCompletion.runProviderToCompletion = originalRunProviderToCompletion;
        artifacts.saveTestExecutionReport = originalSave;
        testRunner.runTestCommand = originalRunTest;
        cleanupStep.cleanupUnexpectedPerspectiveFiles = originalCleanup;
      }
    });

    test('TC-N-03: perspectiveOnly run never updates phase "generating"', async () => {
      // Case ID: TC-N-03
      // Given: A perspectiveOnly-mode session
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-phase-'));
      workspaceRoots.push(workspaceRoot);
      const taskId = 'phase-po-no-generating';

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const perspectiveStep = require('../../../../commands/runWithArtifacts/perspectiveStep') as typeof import('../../../../commands/runWithArtifacts/perspectiveStep');

      const originalUpdatePhase = taskManager.updatePhase.bind(taskManager);
      const originalPerspective = perspectiveStep.runPerspectiveTableStep;

      const phases: string[] = [];
      (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = ((id, phase, phaseLabel) => {
        if (id === taskId) {
          phases.push(`${phase}:${phaseLabel}`);
        }
        originalUpdatePhase(id, phase, phaseLabel);
      }) as typeof taskManager.updatePhase;

      perspectiveStep.runPerspectiveTableStep = (async () => {
        return {
          saved: { absolutePath: '/tmp/p.md', relativePath: 'docs/test-perspectives/p.md' },
          extracted: true,
          markdown: '| table |',
        };
      }) as unknown as typeof perspectiveStep.runPerspectiveTableStep;

      const session = createSession({
        workspaceRoot,
        generationTaskId: taskId,
        runMode: 'perspectiveOnly',
        includeTestPerspectiveTable: false,
        testCommand: 'npm test',
      });

      try {
        // When: run() is executed
        await session.run();

        // Then: It never emits generating phase update for the base taskId
        assert.strictEqual(phases.some((p) => p === 'generating:generating'), false);
      } finally {
        (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = originalUpdatePhase;
        perspectiveStep.runPerspectiveTableStep = originalPerspective;
      }
    });

    test('TC-N-04: perspectiveOnly run never updates phase "running-tests"', async () => {
      // Case ID: TC-N-04
      // Given: A perspectiveOnly-mode session
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-phase-'));
      workspaceRoots.push(workspaceRoot);
      const taskId = 'phase-po-no-running-tests';

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const perspectiveStep = require('../../../../commands/runWithArtifacts/perspectiveStep') as typeof import('../../../../commands/runWithArtifacts/perspectiveStep');

      const originalUpdatePhase = taskManager.updatePhase.bind(taskManager);
      const originalPerspective = perspectiveStep.runPerspectiveTableStep;

      const phases: string[] = [];
      (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = ((id, phase, phaseLabel) => {
        if (id === taskId) {
          phases.push(`${phase}:${phaseLabel}`);
        }
        originalUpdatePhase(id, phase, phaseLabel);
      }) as typeof taskManager.updatePhase;

      perspectiveStep.runPerspectiveTableStep = (async () => {
        return {
          saved: { absolutePath: '/tmp/p.md', relativePath: 'docs/test-perspectives/p.md' },
          extracted: true,
          markdown: '| table |',
        };
      }) as unknown as typeof perspectiveStep.runPerspectiveTableStep;

      const session = createSession({
        workspaceRoot,
        generationTaskId: taskId,
        runMode: 'perspectiveOnly',
        includeTestPerspectiveTable: true,
        testCommand: 'npm test',
      });

      try {
        // When: run() is executed
        await session.run();

        // Then: It never emits running-tests phase update for the base taskId
        assert.strictEqual(phases.some((p) => p === 'running-tests:running-tests'), false);
      } finally {
        (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = originalUpdatePhase;
        perspectiveStep.runPerspectiveTableStep = originalPerspective;
      }
    });

    test('TC-N-TGS-04: generateTests() updates phase "generating" before provider run starts', async () => {
      // Case ID: TC-N-TGS-04
      // Given: A full-mode session and a stubbed runProviderToCompletion that asserts phase update ordering
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-phase-'));
      workspaceRoots.push(workspaceRoot);
      const taskId = 'phase-generating-order';

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const runToCompletion = require('../../../../providers/runToCompletion') as typeof import('../../../../providers/runToCompletion');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const testRunner = require('../../../../core/testRunner') as typeof import('../../../../core/testRunner');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const cleanupStep = require('../../../../commands/runWithArtifacts/cleanupStep') as typeof import('../../../../commands/runWithArtifacts/cleanupStep');

      const originalUpdatePhase = taskManager.updatePhase.bind(taskManager);
      const originalRunProviderToCompletion = runToCompletion.runProviderToCompletion;
      const originalSave = artifacts.saveTestExecutionReport;
      const originalRunTest = testRunner.runTestCommand;
      const originalCleanup = cleanupStep.cleanupUnexpectedPerspectiveFiles;

      let generatingUpdated = false;
      (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = ((id, phase, phaseLabel) => {
        if (id === taskId && phase === 'generating' && phaseLabel === 'generating') {
          generatingUpdated = true;
        }
        originalUpdatePhase(id, phase, phaseLabel);
      }) as typeof taskManager.updatePhase;

      runToCompletion.runProviderToCompletion = (async () => {
        assert.strictEqual(generatingUpdated, true, 'Expected updatePhase(generating) before runProviderToCompletion');
        return 0;
      }) as unknown as typeof runToCompletion.runProviderToCompletion;

      cleanupStep.cleanupUnexpectedPerspectiveFiles = (async () => []) as unknown as typeof cleanupStep.cleanupUnexpectedPerspectiveFiles;
      testRunner.runTestCommand = (async () => {
        return { command: 'npm test', cwd: workspaceRoot, exitCode: 0, signal: null, durationMs: 1, stdout: '', stderr: '' };
      }) as unknown as typeof testRunner.runTestCommand;
      artifacts.saveTestExecutionReport = (async () => ({ absolutePath: '/tmp/report.md', relativePath: 'docs/report.md' })) as unknown as typeof artifacts.saveTestExecutionReport;

      const session = createSession({
        workspaceRoot,
        generationTaskId: taskId,
        runMode: 'full',
        includeTestPerspectiveTable: false,
        testCommand: '',
      });

      try {
        // When: run() is executed (generateTests runs)
        await session.run();

        // Then: generating phase update was observed
        assert.strictEqual(generatingUpdated, true);
      } finally {
        (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = originalUpdatePhase;
        runToCompletion.runProviderToCompletion = originalRunProviderToCompletion;
        artifacts.saveTestExecutionReport = originalSave;
        testRunner.runTestCommand = originalRunTest;
        cleanupStep.cleanupUnexpectedPerspectiveFiles = originalCleanup;
      }
    });

    test('TC-N-06: runTestExecution() updates phase "running-tests" even when testCommand is empty', async () => {
      // Case ID: TC-N-06
      // Given: A session with empty testCommand and a stubbed saveTestExecutionReport
      const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-phase-'));
      workspaceRoots.push(workspaceRoot);
      const taskId = 'phase-running-tests-empty';

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
      const originalSave = artifacts.saveTestExecutionReport;
      artifacts.saveTestExecutionReport = (async () => ({ absolutePath: '/tmp/report.md', relativePath: 'docs/report.md' })) as unknown as typeof artifacts.saveTestExecutionReport;

      const originalUpdatePhase = taskManager.updatePhase.bind(taskManager);
      const calls: Array<{ phase: string; phaseLabel: string }> = [];
      (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = ((id, phase, phaseLabel) => {
        if (id === taskId) {
          calls.push({ phase, phaseLabel });
        }
        originalUpdatePhase(id, phase, phaseLabel);
      }) as typeof taskManager.updatePhase;

      const session = createSession({
        workspaceRoot,
        generationTaskId: taskId,
        runMode: 'full',
        includeTestPerspectiveTable: false,
        testCommand: '',
      });

      try {
        // When: Calling runTestExecution directly
        const runTestExecution = (session as unknown as { runTestExecution: (genExit: number | null) => Promise<void> }).runTestExecution.bind(session);
        await runTestExecution(0);

        // Then: running-tests phase update occurred even though execution is skipped
        const runningTestCalls = calls.filter((c) => c.phase === 'running-tests' && c.phaseLabel === 'running-tests');
        assert.strictEqual(runningTestCalls.length, 1);
      } finally {
        (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = originalUpdatePhase;
        artifacts.saveTestExecutionReport = originalSave;
      }
    });

    suite('provided table cases (TC-SES-*)', () => {
      test('TC-SES-N-01: run() updates phase to "preparing" exactly once during prepare()', async () => {
        // Case ID: TC-SES-N-01
        // Given: A full-mode session in local runLocation and patched dependencies
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-phase-'));
        workspaceRoots.push(workspaceRoot);
        const taskId = 'tc-ses-preparing';

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const runToCompletion = require('../../../../providers/runToCompletion') as typeof import('../../../../providers/runToCompletion');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const testRunner = require('../../../../core/testRunner') as typeof import('../../../../core/testRunner');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const cleanupStep = require('../../../../commands/runWithArtifacts/cleanupStep') as typeof import('../../../../commands/runWithArtifacts/cleanupStep');

        const originalUpdatePhase = taskManager.updatePhase.bind(taskManager);
        const originalRunProviderToCompletion = runToCompletion.runProviderToCompletion;
        const originalSave = artifacts.saveTestExecutionReport;
        const originalRunTest = testRunner.runTestCommand;
        const originalCleanup = cleanupStep.cleanupUnexpectedPerspectiveFiles;

        const calls: Array<{ phase: string; phaseLabel: string }> = [];
        (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = ((id, phase, phaseLabel) => {
          if (id === taskId) {
            calls.push({ phase, phaseLabel });
          }
          originalUpdatePhase(id, phase, phaseLabel);
        }) as typeof taskManager.updatePhase;

        runToCompletion.runProviderToCompletion = (async () => 0) as unknown as typeof runToCompletion.runProviderToCompletion;
        cleanupStep.cleanupUnexpectedPerspectiveFiles = (async () => []) as unknown as typeof cleanupStep.cleanupUnexpectedPerspectiveFiles;
        testRunner.runTestCommand = (async () => {
          return { command: 'npm test', cwd: workspaceRoot, exitCode: 0, signal: null, durationMs: 1, stdout: '', stderr: '' };
        }) as unknown as typeof testRunner.runTestCommand;
        artifacts.saveTestExecutionReport = (async () => ({ absolutePath: '/tmp/report.md', relativePath: 'docs/report.md' })) as unknown as typeof artifacts.saveTestExecutionReport;

        const session = createSession({
          workspaceRoot,
          generationTaskId: taskId,
          runMode: 'full',
          includeTestPerspectiveTable: false,
          testCommand: '',
        });

        try {
          // When: run() is executed
          await session.run();

          // Then: updatePhase(preparing) occurs exactly once
          const preparing = calls.filter((c) => c.phase === 'preparing' && c.phaseLabel === 'preparing');
          assert.strictEqual(preparing.length, 1);
        } finally {
          (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = originalUpdatePhase;
          runToCompletion.runProviderToCompletion = originalRunProviderToCompletion;
          artifacts.saveTestExecutionReport = originalSave;
          testRunner.runTestCommand = originalRunTest;
          cleanupStep.cleanupUnexpectedPerspectiveFiles = originalCleanup;
        }
      });

      test('TC-SES-N-02: generatePerspectives() updates phase before runPerspectiveTableStep() is awaited', async () => {
        // Case ID: TC-SES-N-02
        // Given: A full-mode session with includeTestPerspectiveTable=true and a stubbed runPerspectiveTableStep
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-phase-'));
        workspaceRoots.push(workspaceRoot);
        const taskId = 'tc-ses-perspectives-order';

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const perspectiveStep = require('../../../../commands/runWithArtifacts/perspectiveStep') as typeof import('../../../../commands/runWithArtifacts/perspectiveStep');

        const originalUpdatePhase = taskManager.updatePhase.bind(taskManager);
        const originalPerspective = perspectiveStep.runPerspectiveTableStep;

        let phaseUpdated = false;
        (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = ((id, phase, phaseLabel) => {
          if (id === taskId && phase === 'perspectives' && phaseLabel === 'perspectives') {
            phaseUpdated = true;
          }
          originalUpdatePhase(id, phase, phaseLabel);
        }) as typeof taskManager.updatePhase;

        perspectiveStep.runPerspectiveTableStep = (async () => {
          assert.strictEqual(phaseUpdated, true, 'Expected updatePhase(perspectives) before runPerspectiveTableStep()');
          return {
            saved: { absolutePath: '/tmp/p.md', relativePath: 'docs/test-perspectives/p.md' },
            extracted: true,
            markdown: '| table |',
          };
        }) as unknown as typeof perspectiveStep.runPerspectiveTableStep;

        const session = createSession({
          workspaceRoot,
          generationTaskId: taskId,
          runMode: 'full',
          includeTestPerspectiveTable: true,
          testCommand: '',
        });

        // Given: The task is registered so updatePhase is not a no-op
        taskManager.register(taskId, 'Label', { taskId, dispose: () => {} });

        try {
          // When: Calling generatePerspectives() directly
          const markdown = await (session as unknown as { generatePerspectives: () => Promise<string | undefined> }).generatePerspectives();

          // Then: It returns extracted markdown and the phase update ordering check passed
          assert.strictEqual(markdown, '| table |');
          assert.strictEqual(phaseUpdated, true);
        } finally {
          (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = originalUpdatePhase;
          perspectiveStep.runPerspectiveTableStep = originalPerspective;
          taskManager.cancelAll();
        }
      });

      test('TC-SES-E-01: full mode + includeTestPerspectiveTable=false skips generatePerspectives() without calling updatePhase(perspectives)', async () => {
        // Case ID: TC-SES-E-01
        // Given: A full-mode session with includeTestPerspectiveTable=false
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-phase-'));
        workspaceRoots.push(workspaceRoot);
        const taskId = 'tc-ses-skip-perspectives';

        const originalUpdatePhase = taskManager.updatePhase.bind(taskManager);
        const calls: Array<{ phase: string; phaseLabel: string }> = [];
        (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = ((id, phase, phaseLabel) => {
          if (id === taskId) {
            calls.push({ phase, phaseLabel });
          }
          originalUpdatePhase(id, phase, phaseLabel);
        }) as typeof taskManager.updatePhase;

        const session = createSession({
          workspaceRoot,
          generationTaskId: taskId,
          runMode: 'full',
          includeTestPerspectiveTable: false,
          testCommand: '',
        });

        try {
          // When: Calling generatePerspectives() directly
          const result = await (session as unknown as { generatePerspectives: () => Promise<string | undefined> }).generatePerspectives();

          // Then: It returns undefined and does not call updatePhase(perspectives)
          assert.strictEqual(result, undefined);
          assert.strictEqual(calls.some((c) => c.phase === 'perspectives' && c.phaseLabel === 'perspectives'), false);
        } finally {
          (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = originalUpdatePhase;
        }
      });

      test('TC-SES-N-03: perspectiveOnly mode runs generatePerspectives() even when includeTestPerspectiveTable=false', async () => {
        // Case ID: TC-SES-N-03
        // Given: A perspectiveOnly-mode session with includeTestPerspectiveTable=false and a stubbed runPerspectiveTableStep
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-phase-'));
        workspaceRoots.push(workspaceRoot);
        const taskId = 'tc-ses-perspective-only';

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const perspectiveStep = require('../../../../commands/runWithArtifacts/perspectiveStep') as typeof import('../../../../commands/runWithArtifacts/perspectiveStep');
        const originalPerspective = perspectiveStep.runPerspectiveTableStep;
        const originalUpdatePhase = taskManager.updatePhase.bind(taskManager);

        let calledRunPerspective = 0;
        const phases: Array<{ phase: string; phaseLabel: string }> = [];
        (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = ((id, phase, phaseLabel) => {
          if (id === taskId) {
            phases.push({ phase, phaseLabel });
          }
          originalUpdatePhase(id, phase, phaseLabel);
        }) as typeof taskManager.updatePhase;

        perspectiveStep.runPerspectiveTableStep = (async () => {
          calledRunPerspective += 1;
          return {
            saved: { absolutePath: '/tmp/p.md', relativePath: 'docs/test-perspectives/p.md' },
            extracted: true,
            markdown: '| table |',
          };
        }) as unknown as typeof perspectiveStep.runPerspectiveTableStep;

        const session = createSession({
          workspaceRoot,
          generationTaskId: taskId,
          runMode: 'perspectiveOnly',
          includeTestPerspectiveTable: false,
          testCommand: '',
        });

        // Given: The task is registered so updatePhase is not a no-op
        taskManager.register(taskId, 'Label', { taskId, dispose: () => {} });

        try {
          // When: Calling generatePerspectives() directly
          const result = await (session as unknown as { generatePerspectives: () => Promise<string | undefined> }).generatePerspectives();

          // Then: It calls runPerspectiveTableStep and updates phase to perspectives
          assert.strictEqual(result, '| table |');
          assert.strictEqual(calledRunPerspective, 1);
          assert.strictEqual(phases.some((p) => p.phase === 'perspectives' && p.phaseLabel === 'perspectives'), true);
        } finally {
          perspectiveStep.runPerspectiveTableStep = originalPerspective;
          (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = originalUpdatePhase;
          taskManager.cancelAll();
        }
      });

      test('TC-SES-N-04: generateTests() updates phase "generating" before runProviderToCompletion()', async () => {
        // Case ID: TC-SES-N-04
        // Given: A full-mode session and a stubbed runProviderToCompletion that asserts ordering
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-phase-'));
        workspaceRoots.push(workspaceRoot);
        const taskId = 'tc-ses-generating-order';

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const runToCompletion = require('../../../../providers/runToCompletion') as typeof import('../../../../providers/runToCompletion');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const testRunner = require('../../../../core/testRunner') as typeof import('../../../../core/testRunner');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const cleanupStep = require('../../../../commands/runWithArtifacts/cleanupStep') as typeof import('../../../../commands/runWithArtifacts/cleanupStep');

        const originalUpdatePhase = taskManager.updatePhase.bind(taskManager);
        const originalRunProviderToCompletion = runToCompletion.runProviderToCompletion;
        const originalSave = artifacts.saveTestExecutionReport;
        const originalRunTest = testRunner.runTestCommand;
        const originalCleanup = cleanupStep.cleanupUnexpectedPerspectiveFiles;

        let generatingUpdated = false;
        (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = ((id, phase, phaseLabel) => {
          if (id === taskId && phase === 'generating' && phaseLabel === 'generating') {
            generatingUpdated = true;
          }
          originalUpdatePhase(id, phase, phaseLabel);
        }) as typeof taskManager.updatePhase;

        runToCompletion.runProviderToCompletion = (async () => {
          assert.strictEqual(generatingUpdated, true, 'Expected updatePhase(generating) before runProviderToCompletion()');
          return 0;
        }) as unknown as typeof runToCompletion.runProviderToCompletion;

        cleanupStep.cleanupUnexpectedPerspectiveFiles = (async () => []) as unknown as typeof cleanupStep.cleanupUnexpectedPerspectiveFiles;
        testRunner.runTestCommand = (async () => {
          return { command: 'npm test', cwd: workspaceRoot, exitCode: 0, signal: null, durationMs: 1, stdout: '', stderr: '' };
        }) as unknown as typeof testRunner.runTestCommand;
        artifacts.saveTestExecutionReport = (async () => ({ absolutePath: '/tmp/report.md', relativePath: 'docs/report.md' })) as unknown as typeof artifacts.saveTestExecutionReport;

        const session = createSession({
          workspaceRoot,
          generationTaskId: taskId,
          runMode: 'full',
          includeTestPerspectiveTable: false,
          testCommand: '',
        });

        try {
          // When: run() is executed (generateTests runs)
          await session.run();

          // Then: generating phase update was observed
          assert.strictEqual(generatingUpdated, true);
        } finally {
          (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = originalUpdatePhase;
          runToCompletion.runProviderToCompletion = originalRunProviderToCompletion;
          artifacts.saveTestExecutionReport = originalSave;
          testRunner.runTestCommand = originalRunTest;
          cleanupStep.cleanupUnexpectedPerspectiveFiles = originalCleanup;
        }
      });

      test('TC-N-TGS-05: runTestExecution() updates phase "running-tests" even when execution is skipped and a report is saved', async () => {
        // Case ID: TC-N-TGS-05
        // Given: A session with empty testCommand (skip path) and a stubbed saveTestExecutionReport
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-phase-'));
        workspaceRoots.push(workspaceRoot);
        const taskId = 'tc-ses-running-tests-skip';

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const artifacts = require('../../../../core/artifacts') as typeof import('../../../../core/artifacts');
        const originalSave = artifacts.saveTestExecutionReport;
        artifacts.saveTestExecutionReport = (async () => ({ absolutePath: '/tmp/report.md', relativePath: 'docs/report.md' })) as unknown as typeof artifacts.saveTestExecutionReport;

        const originalUpdatePhase = taskManager.updatePhase.bind(taskManager);
        const phases: Array<string> = [];
        (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = ((id, phase, phaseLabel) => {
          if (id === taskId) {
            phases.push(`${phase}:${phaseLabel}`);
          }
          originalUpdatePhase(id, phase, phaseLabel);
        }) as typeof taskManager.updatePhase;

        const session = createSession({
          workspaceRoot,
          generationTaskId: taskId,
          runMode: 'full',
          includeTestPerspectiveTable: false,
          testCommand: '',
        });

        try {
          // When: Calling runTestExecution directly (skip branch)
          const runTestExecution = (session as unknown as { runTestExecution: (genExit: number | null) => Promise<void> }).runTestExecution.bind(session);
          await runTestExecution(0);

          // Then: running-tests phase update occurred
          assert.strictEqual(phases.includes('running-tests:running-tests'), true);
        } finally {
          (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = originalUpdatePhase;
          artifacts.saveTestExecutionReport = originalSave;
        }
      });

      test('TC-SES-E-02: worktree run without extensionContext updates phase to preparing then aborts safely with progress completed exitCode=null', async () => {
        // Case ID: TC-SES-E-02
        // Given: A worktree-mode session with extensionContext missing and stubbed UI hooks
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-phase-'));
        workspaceRoots.push(workspaceRoot);
        const taskId = 'tc-ses-worktree-no-context';

        const session = new TestGenerationSession({
          provider: dummyProvider,
          workspaceRoot,
          cursorAgentCommand: 'cursor-agent',
          testStrategyPath: '',
          generationLabel: 'Label',
          targetPaths: [],
          generationPrompt: 'prompt',
          perspectiveReferenceText: 'ref',
          model: undefined,
          generationTaskId: taskId,
          runLocation: 'worktree',
          runMode: 'full',
          settingsOverride: {
            includeTestPerspectiveTable: false,
            testExecutionRunner: 'extension',
            testCommand: '',
            enablePreTestCheck: false,
          },
          extensionContext: undefined,
        });

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const progressTreeView = require('../../../../ui/progressTreeView') as typeof import('../../../../ui/progressTreeView');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const outputChannel = require('../../../../ui/outputChannel') as typeof import('../../../../ui/outputChannel');

        const originalProgressHandler = progressTreeView.handleTestGenEventForProgressView;
        const originalAppendEvent = outputChannel.appendEventToOutput;
        const originalShowError = vscode.window.showErrorMessage;
        const originalUpdatePhase = taskManager.updatePhase.bind(taskManager);

        const progressEvents: Array<{ type: string; taskId: string; exitCode?: unknown }> = [];
        (progressTreeView as unknown as { handleTestGenEventForProgressView: typeof progressTreeView.handleTestGenEventForProgressView }).handleTestGenEventForProgressView =
          (event) => {
            progressEvents.push({ type: event.type, taskId: event.taskId, exitCode: (event as unknown as { exitCode?: unknown }).exitCode });
          };
        (outputChannel as unknown as { appendEventToOutput: typeof outputChannel.appendEventToOutput }).appendEventToOutput = () => {};
        (vscode.window as unknown as { showErrorMessage: typeof vscode.window.showErrorMessage }).showErrorMessage = async () => undefined;

        const phases: Array<string> = [];
        (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = ((id, phase, phaseLabel) => {
          if (id === taskId) {
            phases.push(`${phase}:${phaseLabel}`);
          }
          originalUpdatePhase(id, phase, phaseLabel);
        }) as typeof taskManager.updatePhase;

        try {
          // When: run() is executed
          await session.run();

          // Then: preparing phase update occurred and progress completed has exitCode=null
          assert.strictEqual(phases.includes('preparing:preparing'), true);
          const completed = progressEvents.find((e) => e.type === 'completed' && e.taskId === taskId);
          assert.ok(completed, 'Expected a progressTreeView completed event');
          assert.strictEqual(completed?.exitCode, null);
        } finally {
          (progressTreeView as unknown as { handleTestGenEventForProgressView: typeof originalProgressHandler }).handleTestGenEventForProgressView =
            originalProgressHandler;
          (outputChannel as unknown as { appendEventToOutput: typeof originalAppendEvent }).appendEventToOutput = originalAppendEvent;
          (vscode.window as unknown as { showErrorMessage: typeof originalShowError }).showErrorMessage = originalShowError;
          (taskManager as unknown as { updatePhase: typeof taskManager.updatePhase }).updatePhase = originalUpdatePhase;
        }
      });

      test('TC-SES-B-01: checkCancelled() returns true when task is missing and emits log + progress completed exitCode=null', () => {
        // Case ID: TC-SES-B-01
        // Given: A session whose taskId is not registered in taskManager (isCancelled() returns true)
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-phase-'));
        workspaceRoots.push(workspaceRoot);
        const taskId = 'tc-ses-cancelled-missing';

        const session = createSession({
          workspaceRoot,
          generationTaskId: taskId,
          runMode: 'full',
          includeTestPerspectiveTable: false,
          testCommand: '',
        });

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const progressTreeView = require('../../../../ui/progressTreeView') as typeof import('../../../../ui/progressTreeView');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const outputChannel = require('../../../../ui/outputChannel') as typeof import('../../../../ui/outputChannel');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const l10n = require('../../../../core/l10n') as typeof import('../../../../core/l10n');

        const originalProgressHandler = progressTreeView.handleTestGenEventForProgressView;
        const originalAppendEvent = outputChannel.appendEventToOutput;

        const progressEvents: Array<{ type: string; taskId: string; exitCode?: unknown }> = [];
        const outputEvents: Array<{ type: string; taskId: string; level?: unknown; message?: unknown; exitCode?: unknown }> = [];

        (progressTreeView as unknown as { handleTestGenEventForProgressView: typeof progressTreeView.handleTestGenEventForProgressView }).handleTestGenEventForProgressView =
          (event) => {
            progressEvents.push({ type: event.type, taskId: event.taskId, exitCode: (event as unknown as { exitCode?: unknown }).exitCode });
          };
        (outputChannel as unknown as { appendEventToOutput: typeof outputChannel.appendEventToOutput }).appendEventToOutput = (event) => {
          outputEvents.push({
            type: event.type,
            taskId: event.taskId,
            level: (event as unknown as { level?: unknown }).level,
            message: (event as unknown as { message?: unknown }).message,
            exitCode: (event as unknown as { exitCode?: unknown }).exitCode,
          });
        };

        try {
          // When: checkCancelled() is called
          const cancelled = (session as unknown as { checkCancelled: () => boolean }).checkCancelled();

          // Then: It returns true, logs task.cancelled, and emits progress completed exitCode=null
          assert.strictEqual(cancelled, true);
          assert.ok(
            outputEvents.some((e) => e.type === 'log' && e.taskId === taskId && e.message === l10n.t('task.cancelled')),
            'Expected output log message "task.cancelled"',
          );
          const completed = progressEvents.find((e) => e.type === 'completed' && e.taskId === taskId);
          assert.ok(completed, 'Expected a progressTreeView completed event');
          assert.strictEqual(completed?.exitCode, null);
        } finally {
          (progressTreeView as unknown as { handleTestGenEventForProgressView: typeof originalProgressHandler }).handleTestGenEventForProgressView =
            originalProgressHandler;
          (outputChannel as unknown as { appendEventToOutput: typeof originalAppendEvent }).appendEventToOutput = originalAppendEvent;
        }
      });

      // NOTE: DONTFORGETEST_DEBUG_LOG_ROOT のテストは上部に既に存在するため、ここでは重複定義しない
    });
  });
});
