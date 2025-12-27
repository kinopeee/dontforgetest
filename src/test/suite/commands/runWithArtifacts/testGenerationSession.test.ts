import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { TestGenerationSession, __test__ } from '../../../../commands/runWithArtifacts/testGenerationSession';

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
});
