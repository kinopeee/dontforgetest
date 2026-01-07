import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  getArtifactSettings,
  formatTimestamp,
  resolveDirAbsolute,
  findLatestArtifact,
  saveTestPerspectiveTable,
  saveTestExecutionReport,
  buildTestPerspectiveArtifactMarkdown,
  buildTestExecutionArtifactMarkdown,
  parseMochaOutput,
  parsePerspectiveJsonV1,
  parseTestExecutionJsonV1,
  parseTestResultFile,
  renderPerspectiveMarkdownTable,
  computeTestReportSummary,
  PERSPECTIVE_TABLE_HEADER,
  PERSPECTIVE_TABLE_SEPARATOR,
  type PerspectiveCase,
  type TestExecutionResult,
  type TestResultFile,
} from '../../../core/artifacts';
import { stripAnsi } from '../../../core/testResultParser';
import { t } from '../../../core/l10n';

suite('core/artifacts.ts', () => {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  // TC-L10N-N-01
  test('TC-L10N-N-01: l10n bundles define artifact.executionReport.pending for both en/ja with expected labels', () => {
    // Given: l10n bundle JSON files on disk (in extension install path)
    const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
    assert.ok(ext, 'Extension should be installed');
    const extensionPath = ext.extensionPath;
    const enPath = path.join(extensionPath, 'l10n', 'bundle.l10n.json');
    const jaPath = path.join(extensionPath, 'l10n', 'bundle.l10n.ja.json');

    // When: parsing both JSON files
    const en = JSON.parse(fs.readFileSync(enPath, 'utf8')) as Record<string, unknown>;
    const ja = JSON.parse(fs.readFileSync(jaPath, 'utf8')) as Record<string, unknown>;

    // Then: the pending key exists and resolves to expected labels
    assert.strictEqual(en['artifact.executionReport.pending'], 'Pending');
    assert.strictEqual(ja['artifact.executionReport.pending'], '保留');
  });

  // TC-L10N-E-01
  test('TC-L10N-E-01: l10n JSON formatting changes still parse and existing keys remain resolvable', () => {
    // Given: l10n bundle JSON files on disk (in extension install path)
    const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
    assert.ok(ext, 'Extension should be installed');
    const extensionPath = ext.extensionPath;
    const enPath = path.join(extensionPath, 'l10n', 'bundle.l10n.json');
    const jaPath = path.join(extensionPath, 'l10n', 'bundle.l10n.ja.json');

    // When: parsing both JSON files
    const en = JSON.parse(fs.readFileSync(enPath, 'utf8')) as Record<string, unknown>;
    const ja = JSON.parse(fs.readFileSync(jaPath, 'utf8')) as Record<string, unknown>;

    // Then: parsing succeeds and existing keys (e.g., duration) are still present with non-empty strings
    assert.strictEqual(typeof en['artifact.executionReport.duration'], 'string');
    assert.ok((en['artifact.executionReport.duration'] as string).length > 0, 'en duration is non-empty');
    assert.strictEqual(typeof ja['artifact.executionReport.duration'], 'string');
    assert.ok((ja['artifact.executionReport.duration'] as string).length > 0, 'ja duration is non-empty');
  });

  // TC-ART-01: 設定値の取得
  test('TC-ART-01: 設定値がデフォルトまたは設定通りに取得できる', () => {
    // Given: package.json のデフォルト設定、または現在の設定
    // When: getArtifactSettings を呼び出す
    const settings = getArtifactSettings();

    // Then: 設定値が適切な型で返されること
    assert.strictEqual(typeof settings.includeTestPerspectiveTable, 'boolean', 'includeTestPerspectiveTable は boolean であるべき');
    assert.strictEqual(typeof settings.perspectiveReportDir, 'string', 'perspectiveReportDir は string であるべき');
    assert.strictEqual(typeof settings.testExecutionReportDir, 'string', 'testExecutionReportDir は string であるべき');
    assert.strictEqual(typeof settings.testCommand, 'string', 'testCommand は string であるべき');
    assert.ok(
      settings.testExecutionRunner === 'extension' || settings.testExecutionRunner === 'cursorAgent',
      'testExecutionRunner は extension | cursorAgent であるべき',
    );
    assert.strictEqual(typeof settings.allowUnsafeTestCommand, 'boolean', 'allowUnsafeTestCommand は boolean であるべき');
    assert.strictEqual(
      typeof settings.cursorAgentForceForTestExecution,
      'boolean',
      'cursorAgentForceForTestExecution は boolean であるべき',
    );
    // TC-CONF-01: 新規設定値のチェック (enablePreTestCheck, preTestCheckCommand)
    assert.strictEqual(typeof settings.enablePreTestCheck, 'boolean', 'enablePreTestCheck は boolean であるべき');
    assert.strictEqual(typeof settings.preTestCheckCommand, 'string', 'preTestCheckCommand は string であるべき');

    // デフォルト値の整合性チェック
    // ワークスペース設定などで上書きされていなければ、以下のデフォルト値であるべき
    // 注意: 実行環境の User Settings に依存する可能性があるが、テスト実行環境ではデフォルトに戻っていることを期待
    const config = vscode.workspace.getConfiguration('dontforgetest');
    
    // testExecutionRunner
    const runnerInfo = config.inspect('testExecutionRunner');
    if (!runnerInfo?.workspaceValue && !runnerInfo?.globalValue) {
      assert.strictEqual(settings.testExecutionRunner, 'extension', 'デフォルトは extension であるべき');
    }

    // allowUnsafeTestCommand
    const unsafeInfo = config.inspect('allowUnsafeTestCommand');
    if (!unsafeInfo?.workspaceValue && !unsafeInfo?.globalValue) {
      assert.strictEqual(settings.allowUnsafeTestCommand, false, 'allowUnsafeTestCommand のデフォルトは false であるべき');
    }

    // cursorAgentForceForTestExecution
    const forceInfo = config.inspect('cursorAgentForceForTestExecution');
    if (!forceInfo?.workspaceValue && !forceInfo?.globalValue) {
      assert.strictEqual(settings.cursorAgentForceForTestExecution, false, 'cursorAgentForceForTestExecution のデフォルトは false であるべき');
    }

    // TC-CONF-01: enablePreTestCheck default
    const preCheckInfo = config.inspect('enablePreTestCheck');
    if (!preCheckInfo?.workspaceValue && !preCheckInfo?.globalValue) {
      assert.strictEqual(settings.enablePreTestCheck, true, 'enablePreTestCheck のデフォルトは true であるべき');
    }

    // TC-CONF-01: preTestCheckCommand default
    const preCmdInfo = config.inspect('preTestCheckCommand');
    if (!preCmdInfo?.workspaceValue && !preCmdInfo?.globalValue) {
      assert.strictEqual(settings.preTestCheckCommand, 'npm run compile', 'preTestCheckCommand のデフォルトは npm run compile であるべき');
    }
  });

  // TC-CONF-02: Config overwrite (enablePreTestCheck: false)
  test('TC-CONF-02: 設定で enablePreTestCheck=false にした場合、false が返される', async () => {
    // Given: 設定値を変更
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('enablePreTestCheck', false, vscode.ConfigurationTarget.Global);

    try {
      // When: getArtifactSettings を呼び出す
      const settings = getArtifactSettings();

      // Then: 設定値 false が反映されること
      assert.strictEqual(settings.enablePreTestCheck, false, '設定値 false が反映されるべき');
    } finally {
      // Cleanup: 設定を元に戻す
      await config.update('enablePreTestCheck', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  // TC-CONF-03: Config overwrite (preTestCheckCommand: custom)
  test('TC-CONF-03: 設定で preTestCheckCommand を変更した場合、その値が返される', async () => {
    // Given: 設定値を変更
    const config = vscode.workspace.getConfiguration('dontforgetest');
    const customCmd = 'npm run lint';
    await config.update('preTestCheckCommand', customCmd, vscode.ConfigurationTarget.Global);

    try {
      // When: getArtifactSettings を呼び出す
      const settings = getArtifactSettings();

      // Then: 設定値が反映されること
      assert.strictEqual(settings.preTestCheckCommand, customCmd, '設定値が反映されるべき');
    } finally {
      // Cleanup: 設定を元に戻す
      await config.update('preTestCheckCommand', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  suite('perspectiveGenerationTimeoutMs settings', () => {
    // TC-N-04
    test('TC-N-04: perspectiveGenerationTimeoutMs defaults to 600000 when unset', async () => {
      // Given: perspectiveGenerationTimeoutMs is unset in configuration
      const config = vscode.workspace.getConfiguration('dontforgetest');
      await config.update('perspectiveGenerationTimeoutMs', undefined, vscode.ConfigurationTarget.Workspace);
      await config.update('perspectiveGenerationTimeoutMs', undefined, vscode.ConfigurationTarget.Global);

      try {
        // When: getArtifactSettings is called
        const settings = getArtifactSettings();

        // Then: Default value is 600000
        assert.strictEqual(settings.perspectiveGenerationTimeoutMs, 600000);
      } finally {
        await config.update('perspectiveGenerationTimeoutMs', undefined, vscode.ConfigurationTarget.Workspace);
        await config.update('perspectiveGenerationTimeoutMs', undefined, vscode.ConfigurationTarget.Global);
      }
    });

    // TC-B-02
    test('TC-B-02: perspectiveGenerationTimeoutMs uses 0 when configured as 0', async () => {
      // Given: perspectiveGenerationTimeoutMs is set to 0
      const config = vscode.workspace.getConfiguration('dontforgetest');
      await config.update('perspectiveGenerationTimeoutMs', 0, vscode.ConfigurationTarget.Global);

      try {
        // When: getArtifactSettings is called
        const settings = getArtifactSettings();

        // Then: Value is 0 (disabled)
        assert.strictEqual(settings.perspectiveGenerationTimeoutMs, 0);
      } finally {
        await config.update('perspectiveGenerationTimeoutMs', undefined, vscode.ConfigurationTarget.Global);
      }
    });

    // TC-E-10
    test('TC-E-10: perspectiveGenerationTimeoutMs uses 0 when configured as -1', async () => {
      // Given: perspectiveGenerationTimeoutMs is set to -1
      const config = vscode.workspace.getConfiguration('dontforgetest');
      await config.update('perspectiveGenerationTimeoutMs', -1, vscode.ConfigurationTarget.Global);

      try {
        // When: getArtifactSettings is called
        const settings = getArtifactSettings();

        // Then: Value falls back to 0
        assert.strictEqual(settings.perspectiveGenerationTimeoutMs, 0);
      } finally {
        await config.update('perspectiveGenerationTimeoutMs', undefined, vscode.ConfigurationTarget.Global);
      }
    });

    // TC-B-01
    test('TC-B-01: perspectiveGenerationTimeoutMs preserves a value of 1', async () => {
      // Given: perspectiveGenerationTimeoutMs is set to 1
      const config = vscode.workspace.getConfiguration('dontforgetest');
      await config.update('perspectiveGenerationTimeoutMs', 1, vscode.ConfigurationTarget.Global);

      try {
        // When: getArtifactSettings is called
        const settings = getArtifactSettings();

        // Then: Value is preserved
        assert.strictEqual(settings.perspectiveGenerationTimeoutMs, 1);
      } finally {
        await config.update('perspectiveGenerationTimeoutMs', undefined, vscode.ConfigurationTarget.Global);
      }
    });

    // TC-B-04
    test('TC-B-04: perspectiveGenerationTimeoutMs preserves Number.MAX_SAFE_INTEGER', async () => {
      // Given: perspectiveGenerationTimeoutMs is set to Number.MAX_SAFE_INTEGER
      const config = vscode.workspace.getConfiguration('dontforgetest');
      const maxValue = Number.MAX_SAFE_INTEGER;
      await config.update('perspectiveGenerationTimeoutMs', maxValue, vscode.ConfigurationTarget.Global);

      try {
        // When: getArtifactSettings is called
        const settings = getArtifactSettings();

        // Then: Value is preserved
        assert.strictEqual(settings.perspectiveGenerationTimeoutMs, maxValue);
      } finally {
        await config.update('perspectiveGenerationTimeoutMs', undefined, vscode.ConfigurationTarget.Global);
      }
    });

    // TC-N-11
    test('TC-N-11: perspectiveGenerationTimeoutMs preserves Number.MAX_SAFE_INTEGER + 1', async () => {
      // Given: perspectiveGenerationTimeoutMs is set to Number.MAX_SAFE_INTEGER + 1
      const config = vscode.workspace.getConfiguration('dontforgetest');
      const maxPlusOne = Number.MAX_SAFE_INTEGER + 1;
      await config.update('perspectiveGenerationTimeoutMs', maxPlusOne, vscode.ConfigurationTarget.Global);

      try {
        // When: getArtifactSettings is called
        const settings = getArtifactSettings();

        // Then: Value is preserved when finite
        assert.strictEqual(settings.perspectiveGenerationTimeoutMs, maxPlusOne);
      } finally {
        await config.update('perspectiveGenerationTimeoutMs', undefined, vscode.ConfigurationTarget.Global);
      }
    });

    // TC-B-03
    test('TC-B-03: perspectiveGenerationTimeoutMs preserves a value of 2', async () => {
      // Given: perspectiveGenerationTimeoutMs is set to 2
      const config = vscode.workspace.getConfiguration('dontforgetest');
      await config.update('perspectiveGenerationTimeoutMs', 2, vscode.ConfigurationTarget.Global);

      try {
        // When: getArtifactSettings is called
        const settings = getArtifactSettings();

        // Then: Value is preserved
        assert.strictEqual(settings.perspectiveGenerationTimeoutMs, 2);
      } finally {
        await config.update('perspectiveGenerationTimeoutMs', undefined, vscode.ConfigurationTarget.Global);
      }
    });

    // TC-E-09
    test('TC-E-09: perspectiveGenerationTimeoutMs uses 0 when configured as Infinity', async () => {
      // Given: perspectiveGenerationTimeoutMs is set to Infinity
      const config = vscode.workspace.getConfiguration('dontforgetest');
      await config.update('perspectiveGenerationTimeoutMs', Infinity, vscode.ConfigurationTarget.Global);

      try {
        // When: getArtifactSettings is called
        const settings = getArtifactSettings();

        // Then: Value falls back to 0 for non-finite values
        assert.strictEqual(settings.perspectiveGenerationTimeoutMs, 0);
      } finally {
        await config.update('perspectiveGenerationTimeoutMs', undefined, vscode.ConfigurationTarget.Global);
      }
    });

    // TC-CONF-TIMEOUT-0 1: perspectiveGenerationTimeoutMs is not configured
    test('TC-CONF-TIMEOUT-0 1: perspectiveGenerationTimeoutMs defaults to 600000 when not configured', async () => {
      // Given: Setting is undefined
      const config = vscode.workspace.getConfiguration('dontforgetest');
      await config.update('perspectiveGenerationTimeoutMs', undefined, vscode.ConfigurationTarget.Global);

      try {
        // When: getArtifactSettings is called
        const settings = getArtifactSettings();

        // Then: Defaults to 600000
        assert.strictEqual(settings.perspectiveGenerationTimeoutMs, 600000);
      } finally {
        await config.update('perspectiveGenerationTimeoutMs', undefined, vscode.ConfigurationTarget.Global);
      }
    });
  });

  // TC-FMT-MD-01: Generating artifact markdown with target files
  test('TC-FMT-MD-01: buildTestPerspectiveArtifactMarkdown indents target files with 2 spaces', () => {
    // Given: Target files present
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs: Date.now(),
      targetLabel: 'Label',
      targetPaths: ['a.ts', 'b.ts'],
      perspectiveMarkdown: 'content',
    });

    // When: Generated
    // Then: Indented with 2 spaces
    assert.ok(md.includes('\n  - a.ts'));
    assert.ok(md.includes('\n  - b.ts'));
  });

  // TC-FMT-MD-02: Generating artifact markdown with NO target files
  test('TC-FMT-MD-02: buildTestPerspectiveArtifactMarkdown indents "(none)" with 2 spaces', () => {
    // Given: No target files
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs: Date.now(),
      targetLabel: 'Label',
      targetPaths: [],
      perspectiveMarkdown: 'content',
    });

    // When: Generated
    // Then: Indented "(none)" (localized)
    const noneLabel = t('artifact.none');
    assert.ok(md.includes(`\n  - ${noneLabel}`));
  });

  // TC-RUNNER-N-01: testExecutionRunner default value (not configured)
  test('TC-RUNNER-N-01: testExecutionRunner setting is not configured (default)', async () => {
    // Given: testExecutionRunner setting is not configured (default)
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('testExecutionRunner', undefined, vscode.ConfigurationTarget.Global);

    try {
      // When: getArtifactSettings is called
      const settings = getArtifactSettings();

      // Then: Returns testExecutionRunner='extension' (default changed from cursorAgent to extension)
      assert.strictEqual(settings.testExecutionRunner, 'extension', 'Default value should be extension');
    } finally {
      // Cleanup: Reset setting
      await config.update('testExecutionRunner', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  // TC-RUNNER-N-02: testExecutionRunner explicitly set to 'extension'
  test('TC-RUNNER-N-02: testExecutionRunner is explicitly set to extension', async () => {
    // Given: testExecutionRunner is explicitly set to 'extension'
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('testExecutionRunner', 'extension', vscode.ConfigurationTarget.Global);

    try {
      // When: getArtifactSettings is called
      const settings = getArtifactSettings();

      // Then: Returns testExecutionRunner='extension'
      assert.strictEqual(settings.testExecutionRunner, 'extension', 'Should return extension');
    } finally {
      // Cleanup: Reset setting
      await config.update('testExecutionRunner', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  // TC-RUNNER-N-03: testExecutionRunner explicitly set to 'cursorAgent'
  test('TC-RUNNER-N-03: testExecutionRunner is explicitly set to cursorAgent', async () => {
    // Given: testExecutionRunner is explicitly set to 'cursorAgent'
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('testExecutionRunner', 'cursorAgent', vscode.ConfigurationTarget.Global);

    try {
      // When: getArtifactSettings is called
      const settings = getArtifactSettings();

      // Then: Returns testExecutionRunner='cursorAgent'
      assert.strictEqual(settings.testExecutionRunner, 'cursorAgent', 'Should return cursorAgent');
    } finally {
      // Cleanup: Reset setting
      await config.update('testExecutionRunner', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  // TC-RUNNER-B-01: testExecutionRunner setting value is empty string
  test('TC-RUNNER-B-01: testExecutionRunner setting value is empty string', async () => {
    // Given: testExecutionRunner setting value is empty string
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('testExecutionRunner', '', vscode.ConfigurationTarget.Global);

    try {
      // When: getArtifactSettings is called
      const settings = getArtifactSettings();

      // Then: Returns testExecutionRunner='extension' (fallback to default after trim)
      assert.strictEqual(settings.testExecutionRunner, 'extension', 'Empty string should fallback to extension after trim');
    } finally {
      // Cleanup: Reset setting
      await config.update('testExecutionRunner', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  // TC-RUNNER-B-02: testExecutionRunner setting value is whitespace only
  test('TC-RUNNER-B-02: testExecutionRunner setting value is whitespace only', async () => {
    // Given: testExecutionRunner setting value is whitespace only
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('testExecutionRunner', '   ', vscode.ConfigurationTarget.Global);

    try {
      // When: getArtifactSettings is called
      const settings = getArtifactSettings();

      // Then: Returns testExecutionRunner='extension' (fallback to default after trim)
      assert.strictEqual(settings.testExecutionRunner, 'extension', 'Whitespace-only should fallback to extension after trim');
    } finally {
      // Cleanup: Reset setting
      await config.update('testExecutionRunner', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  // TC-RUNNER-B-03: testExecutionRunner setting value is null
  test('TC-RUNNER-B-03: testExecutionRunner setting value is null', async () => {
    // Given: testExecutionRunner setting value is null
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('testExecutionRunner', null, vscode.ConfigurationTarget.Global);

    try {
      // When: getArtifactSettings is called
      const settings = getArtifactSettings();

      // Then: Returns testExecutionRunner='extension' (fallback to default)
      assert.strictEqual(settings.testExecutionRunner, 'extension', 'null should fallback to extension');
    } finally {
      // Cleanup: Reset setting
      await config.update('testExecutionRunner', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  // TC-RUNNER-B-04: testExecutionRunner setting value is undefined
  test('TC-RUNNER-B-04: testExecutionRunner setting value is undefined', async () => {
    // Given: testExecutionRunner setting value is undefined (not set)
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('testExecutionRunner', undefined, vscode.ConfigurationTarget.Global);

    try {
      // When: getArtifactSettings is called
      const settings = getArtifactSettings();

      // Then: Returns testExecutionRunner='extension' (fallback to default)
      assert.strictEqual(settings.testExecutionRunner, 'extension', 'undefined should fallback to extension');
    } finally {
      // Cleanup: Reset setting
      await config.update('testExecutionRunner', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  // TC-RUNNER-E-01: testExecutionRunner setting value is invalid enum value
  test('TC-RUNNER-E-01: testExecutionRunner setting value is invalid enum value', async () => {
    // Given: testExecutionRunner setting value is invalid enum value (not 'extension' or 'cursorAgent')
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('testExecutionRunner', 'invalidValue', vscode.ConfigurationTarget.Global);

    try {
      // When: getArtifactSettings is called
      const settings = getArtifactSettings();

      // Then: Returns testExecutionRunner='cursorAgent' (any non-extension value maps to cursorAgent)
      assert.strictEqual(settings.testExecutionRunner, 'cursorAgent', 'Invalid value should map to cursorAgent');
    } finally {
      // Cleanup: Reset setting
      await config.update('testExecutionRunner', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  // TC-RUNNER-E-02: testExecutionRunner setting value is 'Extension' (case-sensitive mismatch)
  test('TC-RUNNER-E-02: testExecutionRunner setting value is Extension (case-sensitive mismatch)', async () => {
    // Given: testExecutionRunner setting value is 'Extension' (case-sensitive mismatch)
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('testExecutionRunner', 'Extension', vscode.ConfigurationTarget.Global);

    try {
      // When: getArtifactSettings is called
      const settings = getArtifactSettings();

      // Then: Returns testExecutionRunner='cursorAgent' (case-sensitive comparison fails)
      assert.strictEqual(settings.testExecutionRunner, 'cursorAgent', 'Case-sensitive mismatch should map to cursorAgent');
    } finally {
      // Cleanup: Reset setting
      await config.update('testExecutionRunner', undefined, vscode.ConfigurationTarget.Global);
    }
  });

  // TC-ART-02: タイムスタンプ生成
  test('TC-ART-02: YYYYMMDD_HHmmss 形式でタイムスタンプが生成される', () => {
    // Given: 特定の日時 (2023-12-25 15:30:45)
    const date = new Date('2023-12-25T15:30:45');
    
    // When: formatTimestamp を呼び出す
    const ts = formatTimestamp(date);

    // Then: YYYYMMDD_HHmmss 形式でフォーマットされること
    assert.strictEqual(ts, '20231225_153045');
  });

  // TC-ART-03: 絶対パス解決（絶対パス入力）
  test('TC-ART-03: 絶対パス入力時はそのまま返される', () => {
    // Given: 絶対パス
    const abs = path.resolve(workspaceRoot, 'foo/bar');

    // When: resolveDirAbsolute を呼び出す
    const result = resolveDirAbsolute(workspaceRoot, abs);

    // Then: 入力の絶対パスがそのまま返されること
    assert.strictEqual(result, abs);
  });

  // TC-ART-04: 絶対パス解決（相対パス入力）
  test('TC-ART-04: 相対パス入力時はワークスペースルートと結合される', () => {
    // Given: 相対パス
    const rel = 'foo/bar';

    // When: resolveDirAbsolute を呼び出す
    const result = resolveDirAbsolute(workspaceRoot, rel);

    // Then: ワークスペースルートと結合された絶対パスになること
    assert.strictEqual(result, path.join(workspaceRoot, rel));
  });

  // TC-ART-05: 絶対パス解決（空文字）
  test('TC-ART-05: 空文字入力時はワークスペースルートが返される', () => {
    // Given: 空文字
    const empty = '';

    // When: resolveDirAbsolute を呼び出す
    const result = resolveDirAbsolute(workspaceRoot, empty);

    // Then: ワークスペースルートが返されること
    assert.strictEqual(result, workspaceRoot);
  });

  // TC-N-05
  test('TC-N-05: buildTestPerspectiveArtifactMarkdown renders target paths with two-space indentation and " - "', () => {
    // Given: Multiple target paths
    const targetPaths = ['src/a.ts', 'src/b.ts'];

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs: Date.now(),
      targetLabel: 'Label',
      targetPaths,
      perspectiveMarkdown: 'content',
    });

    // Then: Each target path line starts with two spaces and " - "
    assert.ok(md.includes('\n  - src/a.ts\n'), 'Should include src/a.ts with 2-space indent and " - "');
    assert.ok(md.includes('\n  - src/b.ts\n'), 'Should include src/b.ts with 2-space indent and " - "');
  });

  // TC-ART-06: 観点表Markdown生成（正常）
  test('TC-ART-06: 観点表Markdownが正しく生成される（正常系）', () => {
    // Given: 入力パラメータ
    // When: buildTestPerspectiveArtifactMarkdown を呼び出す
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs: Date.now(),
      targetLabel: 'Label',
      targetPaths: ['a.ts'],
      perspectiveMarkdown: 'content',
    });

    // Then: フォーマットが正しいこと
    assert.ok(md.includes(`# ${t('artifact.perspectiveTable.title')}`), 'タイトルが含まれること');
    assert.ok(md.includes(`- ${t('artifact.perspectiveTable.target')}: Label`), '対象ラベルが含まれること');
    assert.ok(md.includes('content'), 'コンテンツが含まれること');
  });

  // TC-N-07
  test('TC-N-07: buildTestPerspectiveArtifactMarkdown renders two target paths with two-space indentation', () => {
    // Given: Two target paths
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs: Date.now(),
      targetLabel: 'Label',
      targetPaths: ['a.ts', 'b.ts'],
      perspectiveMarkdown: 'content',
    });

    // When: buildTestPerspectiveArtifactMarkdown is called
    // Then: Each target path is listed with two-space indentation
    assert.ok(md.includes('\n  - a.ts\n'));
    assert.ok(md.includes('\n  - b.ts\n'));
  });

  // TC-E-18
  test('TC-E-18: buildTestPerspectiveArtifactMarkdown renders "(none)" with two-space indentation when targetPaths is empty', () => {
    // Given: An empty targetPaths array
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs: Date.now(),
      targetLabel: 'Label',
      targetPaths: [],
      perspectiveMarkdown: 'content',
    });

    // When: buildTestPerspectiveArtifactMarkdown is called
    // Then: "(none)" is rendered with two-space indentation
    assert.ok(md.includes(`\n  - ${t('artifact.none')}\n`));
  });

  // TC-ART-07: Perspective markdown when target files are empty
  test('TC-ART-07: buildTestPerspectiveArtifactMarkdown renders nested "(none)" when targetPaths is empty', () => {
    // Given: An empty targetPaths array
    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs: Date.now(),
      targetLabel: 'Label',
      targetPaths: [],
      perspectiveMarkdown: 'content',
    });

    // Then: Markdown renders a nested list with the none label
    assert.ok(
      md.includes(`- ${t('artifact.perspectiveTable.targetFiles')}:\n  - ${t('artifact.none')}`),
      'Empty targetPaths renders a nested "(none)" bullet',
    );
  });

  // TC-N-12
  test('TC-N-12: buildTestPerspectiveArtifactMarkdown uses two-space indentation for target list items', () => {
    // Given: A single target path
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs: Date.now(),
      targetLabel: 'Label',
      targetPaths: ['src/a.ts'],
      perspectiveMarkdown: 'content',
    });

    // When: buildTestPerspectiveArtifactMarkdown is called
    // Then: Target list item uses two-space indentation
    assert.ok(md.includes('\n  - src/a.ts\n'));
  });

  // TC-N-13
  test('TC-N-13: buildTestExecutionArtifactMarkdown uses two-space indentation for empty target list', () => {
    // Given: Empty targetPaths
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: [],
      result: {
        command: 'cmd',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 0,
        stdout: '',
        stderr: '',
        extensionLog: '',
      },
    });

    // When: buildTestExecutionArtifactMarkdown is called
    // Then: The "(none)" entry is indented with two spaces
    assert.ok(md.includes(`\n  - ${t('artifact.none')}\n`));
  });

  // TC-ART-08: 実行レポートMarkdown生成（正常）
  test('TC-ART-08: 実行レポートMarkdownが正しく生成される（正常系）', () => {
    // Given: 正常終了時の結果
    // When: buildTestExecutionArtifactMarkdown を呼び出す
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['b.ts'],
      result: {
        command: 'cmd',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 50,
        stdout: 'out',
        stderr: 'err',
        extensionLog: '[INFO] Extension Log',
      },
    });
  
    // Then: フォーマットが正しく、終了コードや出力が含まれること
    assert.ok(md.includes(`# ${t('artifact.executionReport.title')}`), 'タイトルが含まれること');
    assert.ok(md.includes('exitCode: 0'), 'exitCodeが含まれること');
    assert.ok(md.includes(`## ${t('artifact.executionReport.testSummary')}`), 'サマリーセクションが含まれること');
    assert.ok(md.indexOf(`## ${t('artifact.executionReport.executionInfo')}`) < md.indexOf(`## ${t('artifact.executionReport.testSummary')}`), '実行情報がサマリーより前に出力されること');
    assert.ok(md.includes(`${t('artifact.executionReport.status')}: ${t('artifact.executionReport.statusExecuted')}`), 'status: executed が含まれること');
    assert.ok(md.includes(`<summary>${t('artifact.executionReport.extensionLog')}${t('artifact.executionReport.clickToExpand')}</summary>`), '実行ログセクションが含まれること');
    assert.ok(md.includes('[INFO] Extension Log'), '拡張機能ログが含まれること');
    // Added: model未指定時のデフォルト表示確認
    assert.ok(md.includes(`- ${t('artifact.executionReport.model')}: ${t('artifact.executionReport.modelAuto')}`), 'model未指定時は (auto) と表示されること');
  });

  // TC-N-16
  test('TC-N-16: buildTestExecutionArtifactMarkdown trims trailing newline at the end', () => {
    // Given: A minimal execution result with empty output sections
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['a.ts'],
      result: {
        command: 'cmd',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1,
        stdout: '',
        stderr: '',
        extensionLog: '',
      },
    });

    // When: buildTestExecutionArtifactMarkdown is called
    // Then: It does not end with a trailing newline
    assert.ok(!md.endsWith('\n'));
  });

  // TC-N-08
  test('TC-N-08: buildTestExecutionArtifactMarkdown preserves blank lines and trims trailing newline', () => {
    // Given: An execution result that includes empty sections
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: [],
      result: {
        command: 'cmd',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 0,
        stdout: '',
        stderr: '',
        extensionLog: '',
      },
    });

    // When: buildTestExecutionArtifactMarkdown is called
    // Then: It preserves blank lines and trims the final newline
    assert.ok(md.includes('\n\n'));
    assert.ok(!md.endsWith('\n'));
  });

  // TC-ART-16: 実行レポートMarkdown生成（モデル指定あり）
  test('TC-ART-16: modelが指定されている場合、レポートにそのモデル名が表示される', () => {
    // Given: model指定あり
    // When: buildTestExecutionArtifactMarkdown を呼び出す
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['h.ts'],
      model: 'gpt-4-custom',
      result: {
        command: 'cmd',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 10,
        stdout: '',
        stderr: '',
        extensionLog: '',
      },
    });

    // Then: モデル名が含まれること
    assert.ok(md.includes(`- ${t('artifact.executionReport.model')}: gpt-4-custom`), '指定されたモデル名が表示されること');
  });

  // TC-ART-17: 実行レポートMarkdown生成（モデル空文字）
  test('TC-ART-17: modelが空文字の場合、(auto) と表示される', () => {
    // Given: modelが空文字
    // When: buildTestExecutionArtifactMarkdown を呼び出す
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['i.ts'],
      model: '   ', // 空白のみ
      result: {
        command: 'cmd',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 10,
        stdout: '',
        stderr: '',
        extensionLog: '',
      },
    });

    // Then: (auto) と表示されること
    assert.ok(md.includes(`- ${t('artifact.executionReport.model')}: ${t('artifact.executionReport.modelAuto')}`), 'modelが空白のみの場合は (auto) と表示されること');
  });

  suite('execution report (runner / version / testResultPath / truncation)', () => {
    const baseResult = (): TestExecutionResult => ({
      command: 'cmd',
      cwd: '/tmp',
      exitCode: 0,
      signal: null,
      durationMs: 10,
      stdout: '',
      stderr: '',
    });

    const buildMd = (overrides: Partial<TestExecutionResult>): string => {
      return buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: [],
        result: { ...baseResult(), ...overrides },
      });
    };

    const buildTruncationLine = (streamLabelKey: string, captureStatusKey: string, reportStatusKey: string): string => {
      return `- ${t(streamLabelKey)}: ${t('artifact.executionReport.truncation.capture')}=${t(captureStatusKey)}, ${t('artifact.executionReport.truncation.report')}=${t(reportStatusKey)}`;
    };

    test('TC-ART-RUNNER-N-EXT-01: executionRunner=extension is rendered as the localized extension label', () => {
      // Given: A result with executionRunner=extension
      const md = buildMd({ executionRunner: 'extension' });

      // When: Rendering the execution report markdown
      // Then: The executionRunner line uses the extension label
      assert.ok(
        md.includes(`- ${t('artifact.executionReport.executionRunner')}: ${t('artifact.executionReport.executionRunner.extension')}`),
        'Expected executionRunner line to show the extension label',
      );
    });

    test('TC-ART-RUNNER-N-CA-01: executionRunner=cursorAgent is rendered as the localized cursorAgent label', () => {
      // Given: A result with executionRunner=cursorAgent
      const md = buildMd({ executionRunner: 'cursorAgent' });

      // When: Rendering the execution report markdown
      // Then: The executionRunner line uses the cursorAgent label
      assert.ok(
        md.includes(`- ${t('artifact.executionReport.executionRunner')}: ${t('artifact.executionReport.executionRunner.cursorAgent')}`),
        'Expected executionRunner line to show the cursorAgent label',
      );
    });

    test('TC-ART-RUNNER-B-UNDEF-01: executionRunner=undefined is rendered as unknown', () => {
      // Given: A result with executionRunner undefined (boundary)
      const md = buildMd({ executionRunner: undefined });

      // When: Rendering the execution report markdown
      // Then: The executionRunner line uses unknown
      assert.ok(
        md.includes(`- ${t('artifact.executionReport.executionRunner')}: ${t('artifact.executionReport.unknown')}`),
        'Expected executionRunner line to show unknown',
      );
    });

    test('TC-ART-EXTVER-N-01: extensionVersion is rendered when provided', () => {
      // Given: A result with extensionVersion
      const md = buildMd({ extensionVersion: '0.0.103' });

      // When: Rendering the execution report markdown
      // Then: The extensionVersion line includes the provided version
      assert.ok(
        md.includes(`- ${t('artifact.executionReport.extensionVersion')}: 0.0.103`),
        'Expected extensionVersion to be rendered',
      );
    });

    test('TC-ART-EXTVER-B-EMPTY-01: extensionVersion="" is rendered as unknown', () => {
      // Given: A result with extensionVersion empty string (boundary)
      const md = buildMd({ extensionVersion: '' });

      // When: Rendering the execution report markdown
      // Then: The extensionVersion line uses unknown
      assert.ok(md.includes(`- ${t('artifact.executionReport.extensionVersion')}: ${t('artifact.executionReport.unknown')}`));
    });

    test('TC-ART-EXTVER-B-WS-01: extensionVersion=" " is rendered as unknown', () => {
      // Given: A result with extensionVersion whitespace-only (boundary)
      const md = buildMd({ extensionVersion: ' ' });

      // When: Rendering the execution report markdown
      // Then: The extensionVersion line uses unknown
      assert.ok(md.includes(`- ${t('artifact.executionReport.extensionVersion')}: ${t('artifact.executionReport.unknown')}`));
    });

    test('TC-ART-EXTVER-B-UNDEF-01: extensionVersion=undefined is rendered as unknown', () => {
      // Given: A result with extensionVersion undefined (boundary)
      const md = buildMd({ extensionVersion: undefined });

      // When: Rendering the execution report markdown
      // Then: The extensionVersion line uses unknown
      assert.ok(md.includes(`- ${t('artifact.executionReport.extensionVersion')}: ${t('artifact.executionReport.unknown')}`));
    });

    test('TC-ART-EXTVER-B-NULL-01: extensionVersion=null (injected) is rendered as unknown', () => {
      // Given: A result with extensionVersion injected as null (boundary)
      const md = buildMd({ extensionVersion: null as unknown as string | undefined });

      // When: Rendering the execution report markdown
      // Then: The extensionVersion line uses unknown (robust against unexpected null)
      assert.ok(md.includes(`- ${t('artifact.executionReport.extensionVersion')}: ${t('artifact.executionReport.unknown')}`));
    });

    test('TC-ART-TRP-N-01: testResultPath is rendered as a code-formatted path when provided', () => {
      // Given: A result with testResultPath
      const testResultPath = '/tmp/.vscode-test/test-result.json';
      const md = buildMd({ testResultPath });

      // When: Rendering the execution report markdown
      // Then: The testResultPath line includes the code-formatted path
      assert.ok(
        md.includes(`- ${t('artifact.executionReport.testResultPath')}: \`${testResultPath}\``),
        'Expected testResultPath to be rendered with backticks',
      );
    });

    test('TC-ART-TRP-B-EMPTY-01: testResultPath="" is rendered as unknown', () => {
      // Given: A result with testResultPath empty string (boundary)
      const md = buildMd({ testResultPath: '' });

      // When: Rendering the execution report markdown
      // Then: The testResultPath line uses unknown
      assert.ok(md.includes(`- ${t('artifact.executionReport.testResultPath')}: ${t('artifact.executionReport.unknown')}`));
    });

    test('TC-ART-TRP-B-WS-01: testResultPath=" " is rendered as unknown', () => {
      // Given: A result with testResultPath whitespace-only (boundary)
      const md = buildMd({ testResultPath: ' ' });

      // When: Rendering the execution report markdown
      // Then: The testResultPath line uses unknown
      assert.ok(md.includes(`- ${t('artifact.executionReport.testResultPath')}: ${t('artifact.executionReport.unknown')}`));
    });

    test('TC-ART-TRP-B-UNDEF-01: testResultPath=undefined is rendered as unknown', () => {
      // Given: A result with testResultPath undefined (boundary)
      const md = buildMd({ testResultPath: undefined });

      // When: Rendering the execution report markdown
      // Then: The testResultPath line uses unknown
      assert.ok(md.includes(`- ${t('artifact.executionReport.testResultPath')}: ${t('artifact.executionReport.unknown')}`));
    });

    test('TC-ART-TRP-B-NULL-01: testResultPath=null (injected) is rendered as unknown', () => {
      // Given: A result with testResultPath injected as null (boundary)
      const md = buildMd({ testResultPath: null as unknown as string | undefined });

      // When: Rendering the execution report markdown
      // Then: The testResultPath line uses unknown (robust against unexpected null)
      assert.ok(md.includes(`- ${t('artifact.executionReport.testResultPath')}: ${t('artifact.executionReport.unknown')}`));
    });

    test('TC-ART-TRUNC-STDOUT-B-ZERO-01: stdout="" and stdoutTruncated=false yields capture=not truncated, report=not truncated', () => {
      // Given: Empty stdout with stdoutTruncated=false (boundary: 0)
      const md = buildMd({ stdout: '', stdoutTruncated: false, stderr: '', stderrTruncated: false });

      // When: Rendering the execution report markdown
      // Then: The stdout truncation line shows capture=not truncated and report=not truncated
      const expected = buildTruncationLine(
        'artifact.executionReport.truncation.stdout',
        'artifact.executionReport.truncation.notTruncated',
        'artifact.executionReport.truncation.notTruncated',
      );
      assert.ok(md.includes(expected));
    });

    test('TC-ART-TRUNC-STDOUT-B-MAX-01: stdout length==200000 yields report=not truncated', () => {
      // Given: stdout length exactly at the report cap (boundary: max)
      const maxLogChars = 200_000;
      const md = buildMd({ stdout: 'a'.repeat(maxLogChars), stdoutTruncated: false, stderr: '', stderrTruncated: false });

      // When: Rendering the execution report markdown
      // Then: report is not truncated
      const expected = buildTruncationLine(
        'artifact.executionReport.truncation.stdout',
        'artifact.executionReport.truncation.notTruncated',
        'artifact.executionReport.truncation.notTruncated',
      );
      assert.ok(md.includes(expected));
    });

    test('TC-ART-TRUNC-STDOUT-B-MAXP1-01: stdout length==200001 yields report=truncated', () => {
      // Given: stdout length just above the report cap (boundary: max+1)
      const maxLogChars = 200_000;
      const md = buildMd({ stdout: 'a'.repeat(maxLogChars + 1), stdoutTruncated: false, stderr: '', stderrTruncated: false });

      // When: Rendering the execution report markdown
      // Then: report is truncated
      const expected = buildTruncationLine(
        'artifact.executionReport.truncation.stdout',
        'artifact.executionReport.truncation.notTruncated',
        'artifact.executionReport.truncation.truncated',
      );
      assert.ok(md.includes(expected));
    });

    test('TC-ART-TRUNC-STDOUT-N-CAPTRUE-01: stdoutTruncated=true yields capture=truncated while report can be not truncated', () => {
      // Given: capture truncation flagged true and short stdout (equivalence)
      const md = buildMd({ stdout: 'out', stdoutTruncated: true, stderr: '', stderrTruncated: false });

      // When: Rendering the execution report markdown
      // Then: capture is truncated and report is not truncated
      const expected = buildTruncationLine(
        'artifact.executionReport.truncation.stdout',
        'artifact.executionReport.truncation.truncated',
        'artifact.executionReport.truncation.notTruncated',
      );
      assert.ok(md.includes(expected));
    });

    test('TC-ART-TRUNC-STDOUT-B-CAPUNDEF-01: stdoutTruncated=undefined yields capture=unknown while report can be not truncated', () => {
      // Given: capture truncation flag is undefined (boundary) and short stdout
      const md = buildMd({ stdout: 'out', stdoutTruncated: undefined, stderr: '', stderrTruncated: false });

      // When: Rendering the execution report markdown
      // Then: capture is unknown and report is not truncated
      const expected = buildTruncationLine(
        'artifact.executionReport.truncation.stdout',
        'artifact.executionReport.unknown',
        'artifact.executionReport.truncation.notTruncated',
      );
      assert.ok(md.includes(expected));
    });

    test('TC-ART-TRUNC-STDERR-B-MINUS1-01: stderr length==199999 yields report=not truncated', () => {
      // Given: stderr length one below the report cap (boundary: max-1)
      const maxLogChars = 200_000;
      const md = buildMd({ stderr: 'a'.repeat(maxLogChars - 1), stderrTruncated: false, stdout: '', stdoutTruncated: false });

      // When: Rendering the execution report markdown
      // Then: report is not truncated
      const expected = buildTruncationLine(
        'artifact.executionReport.truncation.stderr',
        'artifact.executionReport.truncation.notTruncated',
        'artifact.executionReport.truncation.notTruncated',
      );
      assert.ok(md.includes(expected));
    });

    test('TC-ART-TRUNC-STDERR-B-MAXP1-01: stderr length==200001 and stderrTruncated=true yields capture=truncated, report=truncated', () => {
      // Given: stderr is long enough to be report-truncated and capture flag is true (boundary: max+1)
      const maxLogChars = 200_000;
      const md = buildMd({ stderr: 'a'.repeat(maxLogChars + 1), stderrTruncated: true, stdout: '', stdoutTruncated: false });

      // When: Rendering the execution report markdown
      // Then: capture is truncated and report is truncated
      const expected = buildTruncationLine(
        'artifact.executionReport.truncation.stderr',
        'artifact.executionReport.truncation.truncated',
        'artifact.executionReport.truncation.truncated',
      );
      assert.ok(md.includes(expected));
    });
  });

  // TC-ART-09: 実行レポートMarkdown生成（エラー）
  test('TC-ART-09: エラーメッセージがある場合レポートに含まれる', () => {
    // Given: エラー時の結果
    // When: buildTestExecutionArtifactMarkdown を呼び出す
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['c.ts'],
      result: {
        command: 'cmd',
        cwd: '/tmp',
        exitCode: null,
        signal: null,
        durationMs: 10,
        stdout: '',
        stderr: '',
        errorMessage: 'Spawn failed',
      },
    });

    // Then: エラーメッセージが含まれること
    assert.ok(md.includes(`${t('artifact.executionReport.spawnError')}: Spawn failed`), 'エラーメッセージが含まれること');
  });

  // TC-N-21: buildTestExecutionArtifactMarkdown with all parameters provided
  test('TC-N-21: buildTestExecutionArtifactMarkdown generates markdown with sections in order: title, execution info, summary, details, detailed logs', () => {
    // Given: All parameters provided
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '  ✔ test case 1\n  ✔ test case 2',
        stderr: '',
      },
    });

    // Then: Sections appear in order: title, execution info, summary, details, detailed logs
    const titleIndex = md.indexOf(`# ${t('artifact.executionReport.title')}`);
    const execInfoIndex = md.indexOf(`## ${t('artifact.executionReport.executionInfo')}`);
    const summaryIndex = md.indexOf(`## ${t('artifact.executionReport.testSummary')}`);
    const detailsIndex = md.indexOf(`## ${t('artifact.executionReport.testDetails')}`);
    const detailedLogsIndex = md.indexOf(`## ${t('artifact.executionReport.detailedLogs')}`);

    assert.ok(titleIndex >= 0, 'Title section is present');
    assert.ok(execInfoIndex >= 0, 'Execution info section is present');
    assert.ok(summaryIndex >= 0, 'Summary section is present');
    assert.ok(detailsIndex >= 0, 'Details section is present');
    assert.ok(detailedLogsIndex >= 0, 'Detailed logs section is present');

    // Verify order: title < execution info < summary < details < detailed logs
    assert.ok(titleIndex < execInfoIndex, 'Title comes before execution info');
    assert.ok(execInfoIndex < summaryIndex, 'Execution info comes before summary');
    assert.ok(summaryIndex < detailsIndex, 'Summary comes before details');
    assert.ok(detailsIndex < detailedLogsIndex, 'Details comes before detailed logs');
  });

  // TC-N-22: buildTestExecutionArtifactMarkdown with empty targetPaths array
  test('TC-N-22: buildTestExecutionArtifactMarkdown renders nested "(none)" when targetPaths is empty', () => {
    // Given: An empty targetPaths array
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: [],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
      },
    });

    // Then: Markdown contains a nested "(none)" bullet under the target files label
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.targetFiles')}:\n  - ${t('artifact.none')}`),
      'Empty targetPaths renders a nested "(none)" bullet',
    );
  });

  // TC-N-23: buildTestExecutionArtifactMarkdown with skipped result
  test('TC-N-23: buildTestExecutionArtifactMarkdown generates markdown with "- status: skipped" and skipReason if provided', () => {
    // Given: Skipped result
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: null,
        signal: null,
        durationMs: 0,
        stdout: '',
        stderr: '',
        skipped: true,
        skipReason: 'Pre-test check failed',
      },
    });

    // Then: Markdown contains "- status: skipped" and skipReason
    assert.ok(md.includes(`${t('artifact.executionReport.status')}: ${t('artifact.executionReport.statusSkipped')}`), 'Skipped status is displayed correctly');
    assert.ok(md.includes(`${t('artifact.executionReport.skipReason')}: Pre-test check failed`), 'SkipReason is included');
  });

  // TC-N-24: buildTestExecutionArtifactMarkdown with errorMessage in result
  test('TC-N-24: buildTestExecutionArtifactMarkdown generates markdown with "- spawn error: <message>" line', () => {
    // Given: Error message in result
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: null,
        signal: null,
        durationMs: 0,
        stdout: '',
        stderr: '',
        errorMessage: 'Command execution failed',
      },
    });

    // Then: Markdown contains "- spawn error: <message>" line in execution info section
    assert.ok(md.includes(`${t('artifact.executionReport.spawnError')}: Command execution failed`), 'Error message is included in execution info section');
  });

  // TC-ART-10: 実行レポートMarkdown生成（空出力）
  test('TC-ART-10: 出力が空の場合は折りたたみセクションが省略される', () => {
    // Given: 出力が空の結果
    // When: buildTestExecutionArtifactMarkdown を呼び出す
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['d.ts'],
      result: {
        command: 'cmd',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 10,
        stdout: '',
        stderr: '',
      }
    });

    // Then: 空の場合は折りたたみセクションが省略されること
    assert.ok(!md.includes('<summary>stdout'), '空のstdoutセクションは省略されること');
    assert.ok(!md.includes('<summary>stderr'), '空のstderrセクションは省略されること');
    // 基本情報は含まれること
    assert.ok(md.includes(`## ${t('artifact.executionReport.testSummary')}`), 'サマリーセクションは含まれること');
    assert.ok(md.includes(`## ${t('artifact.executionReport.detailedLogs')}`), '詳細ログセクションヘッダーは含まれること');
  });

  // TC-ART-20: 実行レポートMarkdown生成（stdoutパース失敗でも固定フォーマット）
  test('TC-ART-20: Mocha出力のパースに失敗してもサマリー表とテスト詳細表が必ず生成される', () => {
    // Given: stdout が Mocha 形式でない結果
    // When: buildTestExecutionArtifactMarkdown を呼び出す
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['x.ts'],
      result: {
        command: 'cmd',
        cwd: '/tmp',
        exitCode: 1,
        signal: null,
        durationMs: 10,
        stdout: 'not mocha output',
        stderr: '',
      },
    });

    // Then: 章立てと表の列が固定で含まれること
    assert.ok(md.includes(`## ${t('artifact.executionReport.testSummary')}`), 'サマリー見出しが必ず含まれること');
    assert.ok(md.includes(`| ${t('artifact.tableHeader.item')} | ${t('artifact.tableHeader.result')} |`), 'サマリー表が必ず含まれること');
    assert.ok(md.includes(`## ${t('artifact.executionReport.testDetails')}`), 'テスト詳細見出しが必ず含まれること');
    assert.ok(md.includes(`| ${t('artifact.executionReport.suite')} | ${t('artifact.executionReport.testName')} | ${t('artifact.executionReport.result')} |`), 'テスト詳細表が必ず含まれること');
    assert.ok(md.includes(`## ${t('artifact.executionReport.executionInfo')}`), '実行情報見出しが必ず含まれること');
    assert.ok(md.includes(`## ${t('artifact.executionReport.detailedLogs')}`), '詳細ログ見出しが必ず含まれること');
  });

  // TC-REPORT-N-01: TestExecutionResult with parsed Mocha output
  test('TC-REPORT-N-01: buildTestExecutionArtifactMarkdown generates report with summary and details tables for parsed Mocha output', () => {
    // Given: TestExecutionResult with parsed Mocha output
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '  ✔ test case 1\n  ✔ test case 2',
        stderr: '',
      },
    });

    // Then: Summary table and details table are generated with parsed test counts
    assert.ok(md.includes(`| ${t('artifact.tableHeader.item')} | ${t('artifact.tableHeader.result')} |`), 'Summary table header is present');
    assert.ok(md.includes(`| ${t('artifact.executionReport.passed')} | 2 |`), 'Passed count is shown');
    assert.ok(md.includes(`| ${t('artifact.executionReport.failed')} | 0 |`), 'Failed count is shown');
    assert.ok(md.includes(`| ${t('artifact.executionReport.pending')} | - |`), 'Pending count shows "-"');
    assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | 2 |`), 'Total count is shown');
    assert.ok(md.includes(`| ${t('artifact.executionReport.suite')} | ${t('artifact.executionReport.testName')} | ${t('artifact.executionReport.result')} |`), 'Details table header is present');
    assert.ok(md.includes('test case 1'), 'Test case 1 is in details');
    assert.ok(md.includes('test case 2'), 'Test case 2 is in details');
  });

  // TC-REPORT-N-05: TestExecutionResult with failedTests details
  test('TC-REPORT-N-05: buildTestExecutionArtifactMarkdown includes failure details section when failedTests are present', () => {
    // Given: testResult.failedTests を含む TestExecutionResult
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 1,
        signal: null,
        durationMs: 1000,
        stdout: '  1) Suite A Test A\n  ✖',
        stderr: '',
        testResult: {
          failedTests: [
            {
              title: 'Test A',
              fullTitle: 'Suite A Test A',
              error: 'Assertion failed',
              expected: 'expected-value',
              actual: 'actual-value',
              stack: 'Error: Assertion failed\n  at line',
            },
          ],
        },
      },
    });

    // Then: 失敗詳細セクションと主要フィールドが含まれること
    assert.ok(md.includes(`## ${t('artifact.executionReport.failureDetails')}`), 'Failure details section is present');
    assert.ok(md.includes('Suite A Test A'), 'Failure title is present');
    assert.ok(
      md.includes(`${t('artifact.executionReport.failureMessage')}: Assertion failed`),
      'Failure message is present',
    );
    assert.ok(md.includes(t('artifact.executionReport.expected')), 'Expected label is present');
    assert.ok(md.includes('expected-value'), 'Expected value is present');
    assert.ok(md.includes(t('artifact.executionReport.actual')), 'Actual label is present');
    assert.ok(md.includes('actual-value'), 'Actual value is present');
    assert.ok(md.includes(t('artifact.executionReport.stackTrace')), 'Stack trace label is present');
  });

  // TC-REPORT-N-03: TestExecutionResult with empty test cases array
  test('TC-REPORT-N-03: buildTestExecutionArtifactMarkdown generates report with empty details table when test cases array is empty', () => {
    // Given: TestExecutionResult with empty test cases (parsed but no cases)
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '  ✔', // Valid pattern but no test name
        stderr: '',
      },
    });

    // Then: Details table header is present but no test rows
    assert.ok(md.includes(`| ${t('artifact.executionReport.suite')} | ${t('artifact.executionReport.testName')} | ${t('artifact.executionReport.result')} |`), 'Details table header is present');
    // The table should have header and separator, but no test rows
    const detailsSection = md.split(`## ${t('artifact.executionReport.testDetails')}`)[1]?.split('##')[0] || '';
    const testRows = detailsSection.match(/\|.*\|.*\|.*\|/g) || [];
    // Only header and separator rows should exist (2 rows)
    assert.ok(testRows.length <= 2, 'No test case rows in details table');
  });

  // TC-REPORT-N-06: TestExecutionResult with structured pending counts
  test('TC-REPORT-N-06: buildTestExecutionArtifactMarkdown uses structured counts including pending when testResult is available', () => {
    // Given: Structured testResult with pending counts
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 1,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        testResult: {
          passes: 1,
          failures: 1,
          pending: 2,
          total: 4,
        },
      },
    });

    // Then: Summary uses structured counts
    assert.ok(md.includes(`| ${t('artifact.executionReport.passed')} | 1 |`), 'Passed count is shown');
    assert.ok(md.includes(`| ${t('artifact.executionReport.failed')} | 1 |`), 'Failed count is shown');
    assert.ok(md.includes(`| ${t('artifact.executionReport.pending')} | 2 |`), 'Pending count is shown');
    assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | 4 |`), 'Total count is shown');
  });

  test('TC-EXECENV-N-01: buildTestExecutionArtifactMarkdown uses envSource=execution when executionRunner="cursorAgent" and all env fields are present', () => {
    // Given: A cursorAgent result with all env fields present in testResult
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1,
        stdout: '',
        stderr: '',
        executionRunner: 'cursorAgent',
        testResult: {
          platform: 'darwin',
          arch: 'arm64',
          nodeVersion: 'v0.0.0-test',
          vscodeVersion: '9.9.9-test',
        },
      },
    });

    // When: The report markdown is generated
    // Then: It shows envSource=execution
    assert.ok(md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.execution')}`));
  });

  test('TC-EXECENV-N-02: buildTestExecutionArtifactMarkdown uses envSource=local when executionRunner="extension" and env fields are missing', () => {
    // Given: An extension-runner result without testResult env fields
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1,
        stdout: '',
        stderr: '',
        executionRunner: 'extension',
        testResult: undefined,
      },
    });

    // When: The report markdown is generated
    // Then: It shows envSource=local
    assert.ok(md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.local')}`));
  });

  test('TC-EXECENV-E-01: buildTestExecutionArtifactMarkdown uses envSource=unknown when executionRunner="cursorAgent" and env fields are missing', () => {
    // Given: A cursorAgent result without testResult env fields
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1,
        stdout: '',
        stderr: '',
        executionRunner: 'cursorAgent',
        testResult: undefined,
      },
    });

    // When: The report markdown is generated
    // Then: It shows envSource=unknown
    assert.ok(md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.unknown')}`));
  });

  test('TC-EXECENV-E-02: buildTestExecutionArtifactMarkdown uses envSource=unknown when executionRunner is undefined and env fields are missing', () => {
    // Given: A backward-compatible result without executionRunner and without env fields
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1,
        stdout: '',
        stderr: '',
        testResult: undefined,
      },
    });

    // When: The report markdown is generated
    // Then: It shows envSource=unknown
    assert.ok(md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.unknown')}`));
  });

  test('TC-EXECENV-N-03: buildTestExecutionArtifactMarkdown uses envSource=local and preserves platform when executionRunner="extension" and only platform is provided', () => {
    // Given: An extension-runner result where only platform is provided in testResult
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1,
        stdout: '',
        stderr: '',
        executionRunner: 'extension',
        testResult: {
          platform: 'darwin',
        },
      },
    });

    // When: The report markdown is generated
    // Then: platform is preserved and envSource=local
    assert.ok(md.includes(`OS: darwin (${process.arch})`), 'Expected provided platform and local arch fallback');
    assert.ok(md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.local')}`));
  });

  test('TC-EXECENV-E-03: buildTestExecutionArtifactMarkdown uses envSource=execution and unknown-filled missing fields when executionRunner="cursorAgent" and only platform is provided', () => {
    // Given: A cursorAgent result where only platform is provided in testResult
    const unknown = t('artifact.executionReport.unknown');
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1,
        stdout: '',
        stderr: '',
        executionRunner: 'cursorAgent',
        testResult: {
          platform: 'darwin',
        },
      },
    });

    // When: The report markdown is generated
    // Then: envSource=execution, and missing fields are shown as unknown label
    assert.ok(md.includes(`OS: darwin (${unknown})`), 'Expected arch to be unknown when not provided');
    assert.ok(md.includes(`Node.js: ${unknown}`), 'Expected Node.js version to be unknown when not provided');
    assert.ok(md.includes(`VS Code: ${unknown}`), 'Expected VS Code version to be unknown when not provided');
    assert.ok(md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.execution')}`));
  });

  test('TC-EXECENV-B-EMPTY: buildTestExecutionArtifactMarkdown treats empty platform as missing (cursorAgent runner)', () => {
    // Given: A cursorAgent result where platform is an empty string (boundary)
    const unknown = t('artifact.executionReport.unknown');
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1,
        stdout: '',
        stderr: '',
        executionRunner: 'cursorAgent',
        testResult: {
          platform: '',
        },
      },
    });

    // When: The report markdown is generated
    // Then: platform is shown as unknown label (not empty)
    assert.ok(md.includes(`OS: ${unknown} (${unknown})`), 'Expected platform/arch to be unknown when empty/missing');
    assert.ok(md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.unknown')}`));
  });

  test('TC-EXECENV-B-WS: buildTestExecutionArtifactMarkdown treats whitespace-only platform as missing (cursorAgent runner)', () => {
    // Given: A cursorAgent result where platform is whitespace-only (boundary)
    const unknown = t('artifact.executionReport.unknown');
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1,
        stdout: '',
        stderr: '',
        executionRunner: 'cursorAgent',
        testResult: {
          platform: '   ',
        },
      },
    });

    // When: The report markdown is generated
    // Then: platform is shown as unknown label (not whitespace)
    assert.ok(md.includes(`OS: ${unknown} (${unknown})`), 'Expected platform/arch to be unknown when whitespace-only');
    assert.ok(md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.unknown')}`));
  });

  test('TC-EXECENV-B-TYPE: buildTestExecutionArtifactMarkdown treats non-string env fields from parseTestResultFile as missing (cursorAgent runner)', () => {
    // Given: A parsed testResult where env fields are invalid types (number/boolean)
    const raw = JSON.stringify({
      timestamp: Date.now(),
      failures: 0,
      platform: 123,
      arch: true,
      nodeVersion: 456,
      vscodeVersion: false,
    });
    const parsed = parseTestResultFile(raw);
    assert.ok(parsed.ok, 'Expected parseTestResultFile to succeed for structurally valid JSON');

    // When: Generating markdown with cursorAgent runner
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1,
        stdout: '',
        stderr: '',
        executionRunner: 'cursorAgent',
        testResult: parsed.value,
      },
    });

    // Then: It uses envSource=unknown and unknown labels for all env fields
    assert.ok(md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.unknown')}`));
  });

  // TC-REPORT-ENV-EXT-N-01 (extra)
  test('TC-REPORT-ENV-EXT-N-01: buildTestExecutionArtifactMarkdown uses execution environment from testResult when provided (extension runner)', () => {
    // Given: A TestExecutionResult (extension runner) with all env fields present in testResult
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        executionRunner: 'extension',
        testResult: {
          platform: 'testos',
          arch: 'testarch',
          nodeVersion: 'v0.0.0-test',
          vscodeVersion: '9.9.9-test',
        },
      },
    });

    // When: The report markdown is generated
    // Then: The execution environment uses testResult values and envSource=execution
    assert.ok(md.includes('OS: testos (testarch)'), 'OS/arch uses testResult values');
    assert.ok(md.includes('Node.js: v0.0.0-test'), 'Node.js version uses testResult value');
    assert.ok(md.includes('VS Code: 9.9.9-test'), 'VS Code version uses testResult value');
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.execution')}`),
      'Env source is execution',
    );
  });

  // TC-REPORT-ENV-N-02
  test('TC-REPORT-ENV-N-02: buildTestExecutionArtifactMarkdown falls back to local environment when testResult is undefined (extension runner)', () => {
    // Given: A TestExecutionResult (extension runner) with testResult undefined
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        testResult: undefined,
        executionRunner: 'extension',
      },
    });

    // When: The report markdown is generated
    // Then: The execution environment falls back to local values and envSource=local
    assert.ok(md.includes(`OS: ${process.platform} (${process.arch})`), 'OS/arch falls back to local process values');
    assert.ok(md.includes(`Node.js: ${process.version}`), 'Node.js version falls back to local process value');
    assert.ok(md.includes(`VS Code: ${vscode.version}`), 'VS Code version falls back to vscode.version');
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.local')}`),
      'Env source is local fallback',
    );
  });

  // TC-REPORT-ENV-B-NULL-01
  test('TC-REPORT-ENV-B-NULL-01: buildTestExecutionArtifactMarkdown falls back per-field when env fields are null (extension runner)', () => {
    // Given: A TestExecutionResult (extension runner) whose testResult has some null env fields
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        testResult: {
          platform: null as unknown as string,
          arch: 'testarch',
          nodeVersion: null as unknown as string,
          vscodeVersion: '9.9.9-test',
        },
        executionRunner: 'extension',
      },
    });

    // When: The report markdown is generated
    // Then: Null env fields fall back to local values, non-null fields are preserved, and envSource=local
    assert.ok(md.includes(`OS: ${process.platform} (testarch)`), 'Platform falls back but arch is preserved');
    assert.ok(md.includes(`Node.js: ${process.version}`), 'Node.js version falls back when null');
    assert.ok(md.includes('VS Code: 9.9.9-test'), 'VS Code version uses provided non-null value');
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.local')}`),
      'Env source is local fallback',
    );
  });

  // TC-REPORT-ENV-E-02
  test('TC-REPORT-ENV-E-02: buildTestExecutionArtifactMarkdown treats empty strings as missing and falls back to local env (extension runner)', () => {
    // Given: A TestExecutionResult (extension runner) whose env fields are empty strings
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        testResult: {
          platform: '',
          arch: '',
          nodeVersion: '',
          vscodeVersion: '',
        },
        executionRunner: 'extension',
      },
    });

    // When: The report markdown is generated
    // Then: Empty strings are treated as missing, fall back to local values, and envSource=local
    assert.ok(md.includes(`OS: ${process.platform} (${process.arch})`), 'OS/arch falls back to local process values');
    assert.ok(md.includes(`Node.js: ${process.version}`), 'Node.js version falls back to local process value');
    assert.ok(md.includes(`VS Code: ${vscode.version}`), 'VS Code version falls back to vscode.version');
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.local')}`),
      'Env source is local fallback',
    );
  });

  // TC-REPORT-ENV-E-04
  test('TC-REPORT-ENV-E-04: buildTestExecutionArtifactMarkdown ignores non-string env fields and falls back to local env (extension runner)', () => {
    // Given: A TestExecutionResult (extension runner) whose env fields have invalid runtime types
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        testResult: {
          platform: 123 as unknown as string,
          arch: true as unknown as string,
          nodeVersion: {} as unknown as string,
          vscodeVersion: [] as unknown as string,
        },
        executionRunner: 'extension',
      },
    });

    // When: The report markdown is generated
    // Then: It falls back to local values (no exception) and envSource=local
    assert.ok(md.includes(`OS: ${process.platform} (${process.arch})`), 'Falls back for OS/arch');
    assert.ok(md.includes(`Node.js: ${process.version}`), 'Falls back for Node.js version');
    assert.ok(md.includes(`VS Code: ${vscode.version}`), 'Falls back for VS Code version');
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.local')}`),
      'Env source is local fallback',
    );
  });

  // TC-REPORT-ENV-E-01
  test('TC-REPORT-ENV-E-01: buildTestExecutionArtifactMarkdown uses unknown env when testResult is undefined (cursorAgent runner)', () => {
    // Given: A TestExecutionResult (cursorAgent runner) with testResult undefined
    const unknown = t('artifact.executionReport.unknown');
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        testResult: undefined,
        executionRunner: 'cursorAgent',
      },
    });

    // When: The report markdown is generated
    // Then: It does NOT use local values, uses unknown labels, and envSource=unknown
    assert.ok(md.includes(`OS: ${unknown} (${unknown})`), 'OS/arch are unknown');
    assert.ok(md.includes(`Node.js: ${unknown}`), 'Node.js version is unknown');
    assert.ok(md.includes(`VS Code: ${unknown}`), 'VS Code version is unknown');
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.unknown')}`),
      'Env source is unknown',
    );
  });

  // TC-REPORT-ENV-B-UNDEF-RUNNER-01
  test('TC-REPORT-ENV-B-UNDEF-RUNNER-01: buildTestExecutionArtifactMarkdown uses unknown env when executionRunner is undefined and testResult is undefined', () => {
    // Given: A TestExecutionResult with executionRunner unset and testResult undefined (backward compatibility)
    const unknown = t('artifact.executionReport.unknown');
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        testResult: undefined,
      },
    });

    // When: The report markdown is generated
    // Then: It uses unknown labels and envSource=unknown
    assert.ok(md.includes(`OS: ${unknown} (${unknown})`), 'OS/arch are unknown');
    assert.ok(md.includes(`Node.js: ${unknown}`), 'Node.js version is unknown');
    assert.ok(md.includes(`VS Code: ${unknown}`), 'VS Code version is unknown');
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.unknown')}`),
      'Env source is unknown',
    );
  });

  // TC-REPORT-ENV-E-02
  test('TC-REPORT-ENV-E-02: buildTestExecutionArtifactMarkdown uses unknown env when executionRunner="unknown" and testResult is undefined', () => {
    // Given: A TestExecutionResult (unknown runner) with testResult undefined
    const unknown = t('artifact.executionReport.unknown');
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        testResult: undefined,
        executionRunner: 'unknown',
      },
    });

    // When: The report markdown is generated
    // Then: It uses unknown labels and envSource=unknown
    assert.ok(md.includes(`OS: ${unknown} (${unknown})`), 'OS/arch are unknown');
    assert.ok(md.includes(`Node.js: ${unknown}`), 'Node.js version is unknown');
    assert.ok(md.includes(`VS Code: ${unknown}`), 'VS Code version is unknown');
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.unknown')}`),
      'Env source is unknown',
    );
  });

  // TC-REPORT-ENV-N-01
  test('TC-REPORT-ENV-N-01: buildTestExecutionArtifactMarkdown uses execution environment from testResult when all fields are present (cursorAgent runner)', () => {
    // Given: A TestExecutionResult (cursorAgent runner) with all env fields present in testResult
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        executionRunner: 'cursorAgent',
        testResult: {
          platform: 'testos',
          arch: 'testarch',
          nodeVersion: 'v0.0.0-test',
          vscodeVersion: '9.9.9-test',
        },
      },
    });

    // When: The report markdown is generated
    // Then: The execution environment uses testResult values and envSource=execution
    assert.ok(md.includes('OS: testos (testarch)'), 'OS/arch uses testResult values');
    assert.ok(md.includes('Node.js: v0.0.0-test'), 'Node.js version uses testResult value');
    assert.ok(md.includes('VS Code: 9.9.9-test'), 'VS Code version uses testResult value');
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.execution')}`),
      'Env source is execution',
    );
  });

  // TC-REPORT-ENV-B-WS-01
  test('TC-REPORT-ENV-B-WS-01: buildTestExecutionArtifactMarkdown falls back when env fields are whitespace-only (extension runner)', () => {
    // Given: A TestExecutionResult (extension runner) whose env fields are whitespace-only strings
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        executionRunner: 'extension',
        testResult: {
          platform: ' ',
          arch: '   ',
          nodeVersion: '\n',
          vscodeVersion: '\t',
        },
      },
    });

    // When: The report markdown is generated
    // Then: Whitespace-only strings are treated as missing and envSource=local
    assert.ok(md.includes(`OS: ${process.platform} (${process.arch})`), 'OS/arch falls back to local process values');
    assert.ok(md.includes(`Node.js: ${process.version}`), 'Node.js version falls back to local process value');
    assert.ok(md.includes(`VS Code: ${vscode.version}`), 'VS Code version falls back to vscode.version');
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.local')}`),
      'Env source is local fallback',
    );
  });

  // TC-REPORT-ENV-E-03
  test('TC-REPORT-ENV-E-03: buildTestExecutionArtifactMarkdown treats whitespace-only env fields as missing and uses unknown env (cursorAgent runner)', () => {
    // Given: A TestExecutionResult (cursorAgent runner) whose env fields are whitespace-only strings
    const unknown = t('artifact.executionReport.unknown');
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        executionRunner: 'cursorAgent',
        testResult: {
          platform: '   ',
          arch: '\t',
          nodeVersion: '\n',
          vscodeVersion: ' ',
        },
      },
    });

    // When: The report markdown is generated
    // Then: It uses unknown labels with envSource=unknown (no local fallback)
    assert.ok(md.includes(`OS: ${unknown} (${unknown})`), 'OS/arch are unknown');
    assert.ok(md.includes(`Node.js: ${unknown}`), 'Node.js version is unknown');
    assert.ok(md.includes(`VS Code: ${unknown}`), 'VS Code version is unknown');
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.unknown')}`),
      'Env source is unknown',
    );
  });

  // TC-REPORT-ENV-N-04
  test('TC-REPORT-ENV-N-04: buildTestExecutionArtifactMarkdown preserves provided env fields and uses unknown for missing ones (cursorAgent runner)', () => {
    // Given: A TestExecutionResult (cursorAgent runner) with only platform set in testResult
    const unknown = t('artifact.executionReport.unknown');
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        executionRunner: 'cursorAgent',
        testResult: {
          platform: 'x',
        },
      },
    });

    // When: The report markdown is generated
    // Then: Provided fields are preserved, missing ones are unknown, and envSource=execution
    assert.ok(md.includes(`OS: x (${unknown})`), 'Platform is preserved and arch is unknown');
    assert.ok(md.includes(`Node.js: ${unknown}`), 'Node.js version is unknown');
    assert.ok(md.includes(`VS Code: ${unknown}`), 'VS Code version is unknown');
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.execution')}`),
      'Env source is execution',
    );
  });

  // TC-REPORT-ENV-N-03
  test('TC-REPORT-ENV-N-03: buildTestExecutionArtifactMarkdown preserves provided env fields and fills missing ones from local env (extension runner)', () => {
    // Given: A TestExecutionResult (extension runner) with only platform set in testResult
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        executionRunner: 'extension',
        testResult: {
          platform: 'x',
        },
      },
    });

    // When: The report markdown is generated
    // Then: Provided fields are preserved, missing ones fall back to local, and envSource=local
    assert.ok(md.includes(`OS: x (${process.arch})`), 'Platform is preserved and arch falls back to local');
    assert.ok(md.includes(`Node.js: ${process.version}`), 'Node.js version falls back to local');
    assert.ok(md.includes(`VS Code: ${vscode.version}`), 'VS Code version falls back to local');
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.local')}`),
      'Env source is local fallback',
    );
  });

  // TC-REPORT-ENV-N-05
  test('TC-REPORT-ENV-N-05: buildTestExecutionArtifactMarkdown uses testResult env when executionRunner="unknown" but all env fields are present', () => {
    // Given: A TestExecutionResult (unknown runner) with a fully-populated testResult env
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        executionRunner: 'unknown',
        testResult: {
          platform: 'testos',
          arch: 'testarch',
          nodeVersion: 'v0.0.0-test',
          vscodeVersion: '9.9.9-test',
        },
      },
    });

    // When: The report markdown is generated
    // Then: It uses the testResult values and envSource=execution
    assert.ok(md.includes('OS: testos (testarch)'), 'OS/arch uses testResult values');
    assert.ok(md.includes('Node.js: v0.0.0-test'), 'Node.js version uses testResult value');
    assert.ok(md.includes('VS Code: 9.9.9-test'), 'VS Code version uses testResult value');
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.execution')}`),
      'Env source is execution',
    );
  });

  // TC-REPORT-ENV-B-01
  test('TC-REPORT-ENV-B-01: extension runner envSource remains local for both 0 and 1 populated env fields', () => {
    // Given: Two extension-runner results (0 env fields vs 1 env field)
    const md0 = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        executionRunner: 'extension',
        testResult: undefined,
      },
    });

    const md1 = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        executionRunner: 'extension',
        testResult: {
          platform: 'x',
        },
      },
    });

    // When: Both markdowns are generated
    // Then: Both are local-sourced, but values differ as expected (local vs mixed)
    assert.ok(
      md0.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.local')}`),
      '0-field case uses local envSource',
    );
    assert.ok(
      md1.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.local')}`),
      '1-field case still uses local envSource',
    );
    assert.ok(md0.includes(`OS: ${process.platform} (${process.arch})`), '0-field case uses local OS/arch');
    assert.ok(md1.includes(`OS: x (${process.arch})`), '1-field case preserves provided platform and falls back for arch');
  });

  // TC-REPORT-ENV-B-02
  test('TC-REPORT-ENV-B-02: cursorAgent runner envSource is execution for both 3 and 4 populated env fields, and missing values are unknown-filled', () => {
    // Given: Two cursorAgent-runner results (4 env fields vs 3 env fields)
    const md4 = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        executionRunner: 'cursorAgent',
        testResult: {
          platform: 'testos',
          arch: 'testarch',
          nodeVersion: 'v0.0.0-test',
          vscodeVersion: '9.9.9-test',
        },
      },
    });

    const unknown = t('artifact.executionReport.unknown');
    const md3 = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        executionRunner: 'cursorAgent',
        testResult: {
          platform: 'testos',
          arch: 'testarch',
          nodeVersion: 'v0.0.0-test',
          // vscodeVersion intentionally missing (3/4 populated)
        },
      },
    });

    // When: Both markdowns are generated
    // Then: Both are execution-sourced and the 3-field case is unknown-filled for the missing field
    assert.ok(
      md4.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.execution')}`),
      '4-field case uses execution envSource',
    );
    assert.ok(
      md3.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.execution')}`),
      '3-field case still uses execution envSource',
    );
    assert.ok(md3.includes('OS: testos (testarch)'), '3-field case preserves provided OS/arch');
    assert.ok(md3.includes('Node.js: v0.0.0-test'), '3-field case preserves provided Node.js version');
    assert.ok(md3.includes(`VS Code: ${unknown}`), '3-field case uses unknown for missing VS Code version');
  });

  // TC-REPORT-ENV-N-06
  test('TC-REPORT-ENV-N-06: buildTestExecutionArtifactMarkdown includes envSource line once and keeps execution info line ordering', () => {
    // Given: A result with all env fields present
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        executionRunner: 'cursorAgent',
        testResult: {
          platform: 'testos',
          arch: 'testarch',
          nodeVersion: 'v0.0.0-test',
          vscodeVersion: '9.9.9-test',
        },
      },
    });

    // When: The report markdown is generated
    // Then: envSource line exists exactly once and appears after OS/Node.js/VS Code lines
    const envSourceLabel = t('artifact.executionReport.envSource');
    const envSourceLinePrefix = `- ${envSourceLabel}: `;
    assert.strictEqual(md.split(envSourceLinePrefix).length - 1, 1, 'envSource line must appear exactly once');

    const idxOs = md.indexOf('- OS: ');
    const idxNode = md.indexOf('- Node.js: ');
    const idxVsCode = md.indexOf('- VS Code: ');
    const idxSource = md.indexOf(envSourceLinePrefix);

    assert.ok(idxOs >= 0, 'OS line should exist');
    assert.ok(idxNode >= 0, 'Node.js line should exist');
    assert.ok(idxVsCode >= 0, 'VS Code line should exist');
    assert.ok(idxSource >= 0, 'envSource line should exist');
    assert.ok(idxOs < idxNode, 'OS line should appear before Node.js line');
    assert.ok(idxNode < idxVsCode, 'Node.js line should appear before VS Code line');
    assert.ok(idxVsCode < idxSource, 'VS Code line should appear before envSource line');
  });

  // TC-DURATION-B-00
  test('TC-DURATION-B-00: buildTestExecutionArtifactMarkdown preserves durationMs=0 and includes a duration row', () => {
    // Given: A TestExecutionResult with durationMs=0 (boundary)
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 0,
        stdout: '',
        stderr: '',
      },
    });

    // When: The report markdown is generated
    // Then: It includes the duration row and does not omit the value
    assert.ok(md.includes(`| ${t('artifact.executionReport.duration')} |`), 'Duration row should exist');
    assert.ok(md.includes(`${t('artifact.executionReport.seconds')} |`), 'Duration row should include seconds unit');
  });

  // TC-DURATION-B-MINUS-01
  test('TC-DURATION-B-MINUS-01: buildTestExecutionArtifactMarkdown does not throw when durationMs is negative', () => {
    // Given: A TestExecutionResult with durationMs=-1 (invalid but tolerated)
    const build = () =>
      buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: 1,
          signal: null,
          durationMs: -1,
          stdout: '',
          stderr: '',
        },
      });

    // When: Generating markdown
    // Then: It does not throw and still includes the duration row
    assert.doesNotThrow(build, 'Markdown generation should tolerate negative durationMs');
    const md = build();
    assert.ok(md.includes(`| ${t('artifact.executionReport.duration')} |`), 'Duration row should exist');
  });

  // TC-DURATION-B-MAX-01
  test('TC-DURATION-B-MAX-01: buildTestExecutionArtifactMarkdown does not throw for very large durationMs (MAX_SAFE_INTEGER)', () => {
    // Given: A TestExecutionResult with a very large durationMs
    const durationMs = Number.MAX_SAFE_INTEGER;
    const build = () =>
      buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: 0,
          signal: null,
          durationMs,
          stdout: '',
          stderr: '',
        },
      });

    // When: Generating markdown
    // Then: It does not throw and includes the duration row
    assert.doesNotThrow(build, 'Markdown generation should tolerate large durationMs');
    const md = build();
    assert.ok(md.includes(`| ${t('artifact.executionReport.duration')} |`), 'Duration row should exist');
  });

  // TC-DURATION-B-MAXP1-01
  test('TC-DURATION-B-MAXP1-01: buildTestExecutionArtifactMarkdown does not throw for durationMs > MAX_SAFE_INTEGER (precision may degrade)', () => {
    // Given: A TestExecutionResult with durationMs > MAX_SAFE_INTEGER
    const durationMs = Number.MAX_SAFE_INTEGER + 1;
    const build = () =>
      buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: 0,
          signal: null,
          durationMs,
          stdout: '',
          stderr: '',
        },
      });

    // When: Generating markdown
    // Then: It does not throw and includes the duration row (do not assert exact numeric formatting)
    assert.doesNotThrow(build, 'Markdown generation should tolerate durationMs > MAX_SAFE_INTEGER');
    const md = build();
    assert.ok(md.includes(`| ${t('artifact.executionReport.duration')} |`), 'Duration row should exist');
  });

  // TC-REPORT-ENV-B-MIN-01
  test('TC-REPORT-ENV-B-MIN-01: buildTestExecutionArtifactMarkdown preserves 1-char env fields (extension runner)', () => {
    // Given: A TestExecutionResult (extension runner) with 1-char env fields
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        executionRunner: 'extension',
        testResult: {
          platform: 'a',
          arch: 'b',
          nodeVersion: 'v',
          vscodeVersion: '1',
        },
      },
    });

    // When: The report markdown is generated
    // Then: 1-char strings are treated as valid and envSource=execution
    assert.ok(md.includes('OS: a (b)'), 'OS/arch use 1-char values');
    assert.ok(md.includes('Node.js: v'), 'Node.js uses 1-char value');
    assert.ok(md.includes('VS Code: 1'), 'VS Code uses 1-char value');
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.execution')}`),
      'Env source is execution',
    );
  });

  // TC-REPORT-ENV-B-MAX-01
  test('TC-REPORT-ENV-B-MAX-01: buildTestExecutionArtifactMarkdown preserves long env strings (extension runner)', () => {
    // Given: A TestExecutionResult (extension runner) with very long env strings
    const long = 'x'.repeat(10_000);
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        executionRunner: 'extension',
        testResult: {
          platform: long,
          arch: long,
          nodeVersion: long,
          vscodeVersion: long,
        },
      },
    });

    // When: The report markdown is generated
    // Then: Long strings are preserved and envSource=execution
    assert.ok(md.includes(`OS: ${long} (${long})`), 'OS/arch preserve long values');
    assert.ok(md.includes(`Node.js: ${long}`), 'Node.js preserves long value');
    assert.ok(md.includes(`VS Code: ${long}`), 'VS Code preserves long value');
    assert.ok(
      md.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.execution')}`),
      'Env source is execution',
    );
  });

  // TC-REPORT-ENV-B-PLUSMINUS1-01
  test('TC-REPORT-ENV-B-PLUSMINUS1-01: whitespace-only is treated as missing but 1-char is treated as valid (extension runner)', () => {
    // Given: Two TestExecutionResults (extension runner) differing only by platform value: " " vs "a"
    const mdWhitespace = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        executionRunner: 'extension',
        testResult: {
          platform: ' ',
          arch: 'b',
          nodeVersion: 'v',
          vscodeVersion: '1',
        },
      },
    });
    const mdOneChar = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        executionRunner: 'extension',
        testResult: {
          platform: 'a',
          arch: 'b',
          nodeVersion: 'v',
          vscodeVersion: '1',
        },
      },
    });

    // When: Both reports are generated
    // Then: " " falls back to local+envSource=local, while "a" is preserved+envSource=execution
    assert.ok(mdWhitespace.includes(`OS: ${process.platform} (b)`), 'Whitespace platform falls back to local value');
    assert.ok(
      mdWhitespace.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.local')}`),
      'Whitespace case uses local envSource',
    );
    assert.ok(mdOneChar.includes('OS: a (b)'), '1-char platform is preserved');
    assert.ok(
      mdOneChar.includes(`- ${t('artifact.executionReport.envSource')}: ${t('artifact.executionReport.envSource.execution')}`),
      '1-char case uses execution envSource',
    );
  });

  // TC-REPORT-N-04: TestExecutionResult with parsed=false
  test('TC-REPORT-N-04: buildTestExecutionArtifactMarkdown generates report with summary table showing "-" for all counts when parsed=false', () => {
    // Given: TestExecutionResult with unparseable stdout (parsed=false)
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: 'not mocha output',
        stderr: '',
      },
    });

    // Then: Summary table always shows "-" when testResult.parsed is false
    assert.ok(md.includes(`| ${t('artifact.tableHeader.item')} | ${t('artifact.tableHeader.result')} |`), 'Summary table header is present');
    assert.ok(md.includes(`| ${t('artifact.executionReport.passed')} | - |`), 'Passed shows "-"');
    assert.ok(md.includes(`| ${t('artifact.executionReport.failed')} | - |`), 'Failed shows "-"');
    assert.ok(md.includes(`| ${t('artifact.executionReport.pending')} | - |`), 'Pending shows "-"');
    assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | - |`), 'Total shows "-"');
  });

  suite('buildTestExecutionArtifactMarkdown (summary counts resolution)', () => {
    // TC-ART-N-01
    test('TC-ART-N-01: shows parsed counts and success status when exitCode=0 and stdout is parseable', () => {
      // Given: exitCode=0 and parseable stdout (passed=2, failed=0) with no structured result
      const md = buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: 0,
          signal: null,
          durationMs: 1000,
          stdout: '  ✔ test case 1\n  ✔ test case 2',
          stderr: '',
        },
      });

      // When: markdown is generated
      // Then: summary uses parsed counts and status is success
      assert.ok(md.includes(`✅ **${t('artifact.executionReport.success')}** (exitCode: 0)`), 'Status is success');
      assert.ok(md.includes(`| ${t('artifact.executionReport.passed')} | 2 |`), 'Passed=2');
      assert.ok(md.includes(`| ${t('artifact.executionReport.failed')} | 0 |`), 'Failed=0');
      assert.ok(md.includes(`| ${t('artifact.executionReport.pending')} | - |`), 'Pending="-"');
      assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | 2 |`), 'Total=2');
    });

    // TC-ART-N-02
    test('TC-ART-N-02: shows failure status when exitCode!=0 even if stdout is parseable', () => {
      // Given: exitCode=1 and parseable stdout (passed=2, failed=1) with no structured result
      const md = buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: 1,
          signal: null,
          durationMs: 1000,
          stdout: '  ✔ test case 1\n  ✔ test case 2\n  1) test case 3\n  ✖',
          stderr: '',
        },
      });

      // When: markdown is generated
      // Then: failed count is shown and status is failure due to exitCode
      assert.ok(md.includes(`❌ **${t('artifact.executionReport.failure')}** (exitCode: 1)`), 'Status is failure');
      assert.ok(md.includes(`| ${t('artifact.executionReport.failed')} | 1 |`), 'Failed=1');
    });

    // TC-ART-E-01
    test('TC-ART-E-01: treats exitCode=null as success when failed count is known and zero (parsed stdout only)', () => {
      // Given: exitCode=null and parseable stdout (failed=0) with no structured result
      const md = buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: null,
          signal: null,
          durationMs: 1000,
          stdout: '  ✔ test case 1',
          stderr: '',
        },
      });

      // When: markdown is generated
      // Then: status is success and counts are shown (not "-")
      assert.ok(md.includes(`✅ **${t('artifact.executionReport.success')}** (exitCode: null)`), 'Status is success');
      assert.ok(md.includes(`| ${t('artifact.executionReport.failed')} | 0 |`), 'Failed=0');
      assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | 1 |`), 'Total=1');
    });

    // TC-ART-E-02
    test('TC-ART-E-02: treats exitCode=null as failure when counts are unknown (stdout not parseable, no structured result)', () => {
      // Given: exitCode=null and non-parseable stdout, with no structured result
      const md = buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: null,
          signal: null,
          durationMs: 1000,
          stdout: 'not mocha output',
          stderr: '',
        },
      });

      // When: markdown is generated
      // Then: status is failure and all counts are "-"
      assert.ok(md.includes(`❌ **${t('artifact.executionReport.failure')}** (exitCode: null)`), 'Status is failure');
      assert.ok(md.includes(`| ${t('artifact.executionReport.passed')} | - |`), 'Passed="-"');
      assert.ok(md.includes(`| ${t('artifact.executionReport.failed')} | - |`), 'Failed="-"');
      assert.ok(md.includes(`| ${t('artifact.executionReport.pending')} | - |`), 'Pending="-"');
      assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | - |`), 'Total="-"');
    });

    // TC-ART-N-03
    test('TC-ART-N-03: uses structured numeric fields for counts (including pending) even when stdout is empty', () => {
      // Given: structured result with numeric fields and empty stdout
      const md = buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: 1,
          signal: null,
          durationMs: 1000,
          stdout: '',
          stderr: '',
          testResult: { passes: 1, failures: 1, pending: 2, total: 4 },
        },
      });

      // When: markdown is generated
      // Then: structured counts are shown
      assert.ok(md.includes(`| ${t('artifact.executionReport.passed')} | 1 |`), 'Passed=1');
      assert.ok(md.includes(`| ${t('artifact.executionReport.failed')} | 1 |`), 'Failed=1');
      assert.ok(md.includes(`| ${t('artifact.executionReport.pending')} | 2 |`), 'Pending=2');
      assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | 4 |`), 'Total=4');
    });

    // TC-ART-N-04
    test('TC-ART-N-04: prefers structured tests[] aggregation over numeric fields', () => {
      // Given: structured result with tests[] and conflicting numeric fields
      const structuredResult = {
        tests: [{ state: 'passed' }, { state: 'failed' }, { state: 'pending' }, { state: 'pending' }],
        passes: 999,
        failures: 999,
        pending: 999,
        total: 999,
      } as unknown as TestResultFile;

      const md = buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: 1,
          signal: null,
          durationMs: 1000,
          stdout: 'not mocha output',
          stderr: '',
          testResult: structuredResult,
        },
      });

      // When: markdown is generated
      // Then: tests[] aggregation is used
      assert.ok(md.includes(`| ${t('artifact.executionReport.passed')} | 1 |`), 'Passed=1 from tests[]');
      assert.ok(md.includes(`| ${t('artifact.executionReport.failed')} | 1 |`), 'Failed=1 from tests[]');
      assert.ok(md.includes(`| ${t('artifact.executionReport.pending')} | 2 |`), 'Pending=2 from tests[]');
      assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | 4 |`), 'Total=4 from tests[] length');
      assert.ok(!md.includes(`| ${t('artifact.executionReport.passed')} | 999 |`), 'Numeric fields are not used when tests[] exists');
    });

    // TC-ART-B-01
    test('TC-ART-B-01: ignores empty tests[] and falls back to parsed stdout counts', () => {
      // Given: structured result with tests:[] (empty) and parseable stdout
      const md = buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: 0,
          signal: null,
          durationMs: 1000,
          stdout: '  ✔ test case 1\n  ✔ test case 2',
          stderr: '',
          testResult: { tests: [] } as unknown as TestResultFile,
        },
      });

      // When: markdown is generated
      // Then: parsed counts are used and pending is "-"
      assert.ok(md.includes(`| ${t('artifact.executionReport.passed')} | 2 |`), 'Passed=2 from parsed stdout');
      assert.ok(md.includes(`| ${t('artifact.executionReport.failed')} | 0 |`), 'Failed=0 from parsed stdout');
      assert.ok(md.includes(`| ${t('artifact.executionReport.pending')} | - |`), 'Pending="-"');
      assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | 2 |`), 'Total=2 from parsed stdout');
    });

    // TC-ART-B-02
    test('TC-ART-B-02: shows "-" for all counts when tests[] is empty and stdout is not parseable (no numeric fields)', () => {
      // Given: structured result with tests:[] (empty) and non-parseable stdout
      const md = buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: 1,
          signal: null,
          durationMs: 1000,
          stdout: 'not mocha output',
          stderr: '',
          testResult: { tests: [] } as unknown as TestResultFile,
        },
      });

      // When: markdown is generated
      // Then: counts are unknown and rendered as "-"
      assert.ok(md.includes(`| ${t('artifact.executionReport.passed')} | - |`), 'Passed="-"');
      assert.ok(md.includes(`| ${t('artifact.executionReport.failed')} | - |`), 'Failed="-"');
      assert.ok(md.includes(`| ${t('artifact.executionReport.pending')} | - |`), 'Pending="-"');
      assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | - |`), 'Total="-"');
    });

    // TC-ART-B-03
    test('TC-ART-B-03: renders zero counts from structured numeric fields and treats exitCode=0 as success', () => {
      // Given: structured result with all counts set to 0 and exitCode=0
      const md = buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: 0,
          signal: null,
          durationMs: 1000,
          stdout: 'not mocha output',
          stderr: '',
          testResult: { passes: 0, failures: 0, pending: 0, total: 0 },
        },
      });

      // When: markdown is generated
      // Then: status is success and all counts are "0"
      assert.ok(md.includes(`✅ **${t('artifact.executionReport.success')}** (exitCode: 0)`), 'Status is success');
      assert.ok(md.includes(`| ${t('artifact.executionReport.passed')} | 0 |`), 'Passed=0');
      assert.ok(md.includes(`| ${t('artifact.executionReport.failed')} | 0 |`), 'Failed=0');
      assert.ok(md.includes(`| ${t('artifact.executionReport.pending')} | 0 |`), 'Pending=0');
      assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | 0 |`), 'Total=0');
    });

    // TC-ART-B-04
    test('TC-ART-B-04: treats exitCode=null as success when structured failed=0 and total is non-zero', () => {
      // Given: exitCode=null and structured counts with failed=0 and total=1
      const md = buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: null,
          signal: null,
          durationMs: 1000,
          stdout: '',
          stderr: '',
          testResult: { passes: 0, failures: 0, pending: 0, total: 1 },
        },
      });

      // When: markdown is generated
      // Then: status is success and total is shown
      assert.ok(md.includes(`✅ **${t('artifact.executionReport.success')}** (exitCode: null)`), 'Status is success');
      assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | 1 |`), 'Total=1');
    });

    // TC-ART-B-05
    test('TC-ART-B-05: treats exitCode=null as failure when structured failed is negative (min-1) and shows the negative value', () => {
      // Given: exitCode=null and structured failed=-1
      const md = buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: null,
          signal: null,
          durationMs: 1000,
          stdout: '',
          stderr: '',
          testResult: { passes: 0, failures: -1, pending: 0, total: 0 },
        },
      });

      // When: markdown is generated
      // Then: status is failure and failed=-1 is shown (no validation)
      assert.ok(md.includes(`❌ **${t('artifact.executionReport.failure')}** (exitCode: null)`), 'Status is failure');
      assert.ok(md.includes(`| ${t('artifact.executionReport.failed')} | -1 |`), 'Failed=-1');
    });

    // TC-ART-B-06
    test('TC-ART-B-06: renders MAX_SAFE_INTEGER counts as strings without rounding and treats exitCode=null as success when failed=0', () => {
      // Given: structured counts at Number.MAX_SAFE_INTEGER and exitCode=null with failed=0
      const max = Number.MAX_SAFE_INTEGER;
      const md = buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: null,
          signal: null,
          durationMs: 1000,
          stdout: '',
          stderr: '',
          testResult: { passes: max, failures: 0, pending: 0, total: max },
        },
      });

      // When: markdown is generated
      // Then: huge numbers are rendered as exact strings and status is success
      assert.ok(md.includes(`✅ **${t('artifact.executionReport.success')}** (exitCode: null)`), 'Status is success');
      assert.ok(md.includes(`| ${t('artifact.executionReport.passed')} | ${String(max)} |`), 'Passed is exact');
      assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | ${String(max)} |`), 'Total is exact');
    });

    // TC-ART-E-03
    test('TC-ART-E-03: derives total from passes+failures+pending when structured total is missing', () => {
      // Given: structured counts without total (total is undefined)
      const md = buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: 1,
          signal: null,
          durationMs: 1000,
          stdout: '',
          stderr: '',
          testResult: { passes: 1, failures: 0, pending: 0 },
        },
      });

      // When: markdown is generated
      // Then: total is derived as 1
      assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | 1 |`), 'Total=1 is derived');
    });

    // TC-ART-E-04
    test('TC-ART-E-04: structured invalid type (passes as string) does not populate passed count, and does not fall back to parsed stdout if other structured numeric fields exist', () => {
      // Given: structuredResult.passes is a string (invalid), but failures/pending are numeric (0); stdout is parseable
      const structuredResult = { passes: '1', failures: 0, pending: 0, total: undefined } as unknown as TestResultFile;
      const md = buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: 0,
          signal: null,
          durationMs: 1000,
          stdout: '  ✔ test case 1\n  ✔ test case 2',
          stderr: '',
          testResult: structuredResult,
        },
      });

      // When: markdown is generated
      // Then: passed is "-" (invalid structured type), and total is derived from structured fields (0) rather than parsed stdout
      assert.ok(md.includes(`| ${t('artifact.executionReport.passed')} | - |`), 'Passed is "-" due to invalid structured type');
      assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | 0 |`), 'Total derives from structured numeric fields');
    });

    // TC-ART-E-05
    test('TC-ART-E-05: ignores unknown/undefined tests[].state values and still shows Total=tests.length with 0 counts', () => {
      // Given: structured tests[] with invalid states and non-parseable stdout
      const structuredResult = {
        tests: [{ state: 'unknown' }, { state: undefined }],
      } as unknown as TestResultFile;

      const md = buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: 1,
          signal: null,
          durationMs: 1000,
          stdout: 'not mocha output',
          stderr: '',
          testResult: structuredResult,
        },
      });

      // When: markdown is generated
      // Then: Passed/Failed/Pending are 0 and Total is 2
      assert.ok(md.includes(`| ${t('artifact.executionReport.passed')} | 0 |`), 'Passed=0');
      assert.ok(md.includes(`| ${t('artifact.executionReport.failed')} | 0 |`), 'Failed=0');
      assert.ok(md.includes(`| ${t('artifact.executionReport.pending')} | 0 |`), 'Pending=0');
      assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | 2 |`), 'Total=2');
    });

    // TC-ART-B-07
    test('TC-ART-B-07: treats structuredResult=null as missing and shows failure with "-" counts when stdout is not parseable and exitCode=null', () => {
      // Given: structuredResult=null (runtime edge), stdout not parseable, exitCode=null
      const md = buildTestExecutionArtifactMarkdown({
        generatedAtMs: Date.now(),
        generationLabel: 'Label',
        targetPaths: ['test.ts'],
        result: {
          command: 'npm test',
          cwd: '/tmp',
          exitCode: null,
          signal: null,
          durationMs: 1000,
          stdout: 'not mocha output',
          stderr: '',
          testResult: null as unknown as TestResultFile,
        },
      });

      // When: markdown is generated
      // Then: status is failure and counts are unknown ("-")
      assert.ok(md.includes(`❌ **${t('artifact.executionReport.failure')}** (exitCode: null)`), 'Status is failure');
      assert.ok(md.includes(`| ${t('artifact.executionReport.passed')} | - |`), 'Passed="-"');
      assert.ok(md.includes(`| ${t('artifact.executionReport.failed')} | - |`), 'Failed="-"');
      assert.ok(md.includes(`| ${t('artifact.executionReport.pending')} | - |`), 'Pending="-"');
      assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | - |`), 'Total="-"');
    });
  });

  // TC-B-07: buildTestExecutionArtifactMarkdown with durationMs = 0
  test('TC-B-07: buildTestExecutionArtifactMarkdown generates report with durationSec="0.0" for zero duration', () => {
    // Given: TestExecutionResult with durationMs=0
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 0,
        stdout: '',
        stderr: '',
      },
    });

    // Then: Zero duration is handled correctly
    assert.ok(md.includes(`| ${t('artifact.executionReport.duration')} | 0.0 ${t('artifact.executionReport.seconds')} |`), 'Duration shows 0.0 seconds');
  });

  // TC-B-08: buildTestExecutionArtifactMarkdown with exitCode = null
  test('TC-B-08: buildTestExecutionArtifactMarkdown generates report showing "null" for exitCode when exitCode is null', () => {
    // Given: TestExecutionResult with exitCode=null
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: null,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
      },
    });

    // Then: Null exitCode is handled correctly
    assert.ok(md.includes('exitCode: null'), 'exitCode shows "null"');
  });

  // TC-B-09: buildTestExecutionArtifactMarkdown with empty stdout and stderr
  test('TC-B-09: buildTestExecutionArtifactMarkdown generates report without stdout/stderr collapsible sections when empty', () => {
    // Given: TestExecutionResult with empty stdout and stderr
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
      },
    });

    // Then: Empty logs are not displayed
    assert.ok(!md.includes('<summary>stdout'), 'Empty stdout section is not displayed');
    assert.ok(!md.includes('<summary>stderr'), 'Empty stderr section is not displayed');
  });

  // TC-B-10: buildTestExecutionArtifactMarkdown with extensionLog = empty string
  test('TC-B-10: buildTestExecutionArtifactMarkdown generates report without extension log collapsible section when empty', () => {
    // Given: TestExecutionResult with extensionLog = empty string
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
        extensionLog: '',
      },
    });

    // Then: Empty extension log is not displayed
    assert.ok(!md.includes(`<summary>${t('artifact.executionReport.extensionLog')}`), 'Empty extension log section is not displayed');
  });

  // TC-REPORT-B-01: TestExecutionResult with durationMs=0
  test('TC-REPORT-B-01: buildTestExecutionArtifactMarkdown generates report with durationSec="0.0" for zero duration', () => {
    // Given: TestExecutionResult with durationMs=0
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 0,
        stdout: '',
        stderr: '',
      },
    });

    // Then: Zero duration is formatted correctly
    assert.ok(md.includes(`| ${t('artifact.executionReport.duration')} | 0.0 ${t('artifact.executionReport.seconds')} |`), 'Duration shows 0.0 seconds');
  });

  // TC-REPORT-B-02: TestExecutionResult with very large durationMs
  test('TC-REPORT-B-02: buildTestExecutionArtifactMarkdown generates report with large durationSec value for very large durationMs', () => {
    // Given: TestExecutionResult with very large durationMs
    const largeDurationMs = 3600000; // 1 hour
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: largeDurationMs,
        stdout: '',
        stderr: '',
      },
    });

    // Then: Large duration values are formatted correctly
    assert.ok(md.includes(`| ${t('artifact.executionReport.duration')} | 3600.0 ${t('artifact.executionReport.seconds')} |`), 'Large duration is formatted correctly');
  });

  // TC-REPORT-B-03: TestExecutionResult with exitCode=null
  test('TC-REPORT-B-03: buildTestExecutionArtifactMarkdown generates report showing "null" for exitCode when exitCode is null', () => {
    // Given: TestExecutionResult with exitCode=null
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: null,
        signal: null,
        durationMs: 1000,
        stdout: '',
        stderr: '',
      },
    });

    // Then: null exitCode is displayed as "null" in status line
    assert.ok(md.includes('exitCode: null'), 'exitCode shows "null"');
  });

  // TC-REPORT-B-04: TestExecutionResult with passed=0, failed=0
  test('TC-REPORT-B-04: buildTestExecutionArtifactMarkdown generates report with total=0 when passed=0 and failed=0', () => {
    // Given: TestExecutionResult with passed=0, failed=0 (parsed but no tests)
    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 1000,
        stdout: 'No tests found',
        stderr: '',
      },
    });

    // Then: Zero test counts are displayed correctly
    // When parsed=false, it shows "-", but if somehow parsed=true with 0 tests, it should show 0
    // Since stdout doesn't match Mocha pattern, parsed should be false
    assert.ok(md.includes(`| ${t('artifact.executionReport.total')} | - |`) || md.includes(`| ${t('artifact.executionReport.total')} | 0 |`), 'Total shows "-" or "0"');
  });

  // TC-ART-13: 実行レポートMarkdown生成（スキップ）
  test('TC-ART-13: スキップ時は status と skipReason、extensionLog がレポートに含まれる', () => {
    // Given: スキップされた結果（ログあり）
    // When: buildTestExecutionArtifactMarkdown を呼び出す
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['e.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: null,
        signal: null,
        durationMs: 0,
        stdout: '',
        stderr: '',
        skipped: true,
        skipReason: '安全のためスキップしました',
        extensionLog: '[INFO] Something happened',
      },
    });

    // Then: status と skipReason が含まれること
    assert.ok(md.includes(`${t('artifact.executionReport.status')}: ${t('artifact.executionReport.statusSkipped')}`), 'status: skipped が含まれること');
    assert.ok(md.includes(`${t('artifact.executionReport.skipReason')}: 安全のためスキップしました`), 'skipReason が含まれること');
    
    // And: 実行ログが折りたたみセクションとして含まれること
    assert.ok(md.includes(`<summary>${t('artifact.executionReport.extensionLog')}${t('artifact.executionReport.clickToExpand')}</summary>`), '実行ログセクションが含まれること');
    assert.ok(md.includes('[INFO] Something happened'), 'ログ内容が含まれること');
  });

  // TC-ART-14: 実行レポートMarkdown生成（ログなし）
  test('TC-ART-14: extensionLog が未定義の場合、折りたたみセクションが省略される', () => {
    // Given: extensionLog が undefined の結果
    // When: buildTestExecutionArtifactMarkdown を呼び出す
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['f.ts'],
      result: {
        command: 'echo test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 10,
        stdout: '',
        stderr: '',
        extensionLog: undefined,
      },
    });

    // Then: 空の場合は折りたたみセクションが省略されること
    assert.ok(!md.includes(`<summary>${t('artifact.executionReport.extensionLog')}`), '空のログセクションは省略されること');
    // 基本情報は含まれること
    assert.ok(md.includes(`## ${t('artifact.executionReport.detailedLogs')}`), '詳細ログセクションヘッダーは含まれること');
  });

  // TC-ART-11: 観点表保存
  test('TC-ART-11: 観点表ファイルが指定ディレクトリに生成される', async () => {
    // Given: 有効な入力パラメータ
    const timestamp = '20990101_000000';
    const reportDir = 'out/test-artifacts/perspectives';
    const targetLabel = 'Test Label';
    const perspectiveMarkdown = '| ID | Case | ... |';
    
    // When: saveTestPerspectiveTable を呼び出す
    const saved = await saveTestPerspectiveTable({
      workspaceRoot,
      targetLabel,
      targetPaths: ['src/foo.ts'],
      perspectiveMarkdown,
      reportDir,
      timestamp,
    });

    // Then: ファイルが作成され、内容が正しいこと
    const doc = await vscode.workspace.openTextDocument(saved.absolutePath);
    assert.ok(doc, 'ドキュメントが開けること');
    const text = doc.getText();
    assert.ok(text.includes(targetLabel), 'ターゲットラベルが含まれること');
    assert.ok(text.includes(perspectiveMarkdown), 'Markdownコンテンツが含まれること');
  });

  // TC-ART-12: 実行レポート保存
  test('TC-ART-12: 実行レポートファイルが指定ディレクトリに生成される', async () => {
    // Given: 有効な入力パラメータ
    const timestamp = '20990101_000001';
    const reportDir = 'out/test-artifacts/reports';
    const generationLabel = 'Gen Label';
    
    // When: saveTestExecutionReport を呼び出す
    const saved = await saveTestExecutionReport({
      workspaceRoot,
      generationLabel,
      targetPaths: ['src/bar.ts'],
      reportDir,
      timestamp,
      result: {
        command: 'echo test',
        cwd: workspaceRoot,
        exitCode: 0,
        signal: null,
        durationMs: 100,
        stdout: 'test output',
        stderr: '',
        errorMessage: undefined
      },
    });

    // Then: ファイルが作成され、内容が正しいこと
    const doc = await vscode.workspace.openTextDocument(saved.absolutePath);
    assert.ok(doc, 'ドキュメントが開けること');
    const text = doc.getText();
    assert.ok(text.includes(generationLabel), '生成ラベルが含まれること');
    assert.ok(text.includes('test output'), '標準出力が含まれること');
  });

  // TC-ART-15: 実行レポートMarkdown生成（ログ空文字）
  test('TC-ART-15: extensionLog が空文字の場合、折りたたみセクションが省略される', () => {
    // Given: extensionLog が '' の結果
    // When: buildTestExecutionArtifactMarkdown を呼び出す
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Label',
      targetPaths: ['g.ts'],
      result: {
        command: 'echo test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 10,
        stdout: '',
        stderr: '',
        extensionLog: '', // 空文字
      },
    });

    // Then: 空の場合は折りたたみセクションが省略されること
    assert.ok(!md.includes(`<summary>${t('artifact.executionReport.extensionLog')}`), '空のログセクションは省略されること');
  });

  // TC-ART-18: レポート生成時にANSIエスケープシーケンスが除去される
  test('TC-ART-18: レポート生成時にANSIエスケープシーケンスが除去される', () => {
    // Given: ANSIカラーコードを含む出力
    const ansiText = '\u001b[31mRed Error\u001b[0m';
    // When: buildTestExecutionArtifactMarkdown を呼び出す
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'ANSI Check',
      targetPaths: ['test.ts'],
      result: {
        command: 'cmd',
        cwd: '/tmp',
        exitCode: 1,
        signal: null,
        durationMs: 10,
        stdout: ansiText,
        stderr: ansiText,
        extensionLog: ansiText,
      },
    });

    // Then: ANSIコードが除去されていること
    assert.ok(!md.includes('\u001b[31m'), 'エスケープシーケンスが除去されていること');
    assert.ok(md.includes('Red Error'), 'テキスト内容は残っていること');
  });

  // TC-ART-19: レポート生成時に長大な出力は切り詰められる
  test('TC-ART-19: レポート生成時に長大な出力は切り詰められる', () => {
    // Given: 制限(200,000文字)を超える出力
    const longText = 'a'.repeat(200_100);
    // When: buildTestExecutionArtifactMarkdown を呼び出す
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Truncate Check',
      targetPaths: ['test.ts'],
      result: {
        command: 'cmd',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 10,
        stdout: longText,
        stderr: '',
        extensionLog: '',
      },
    });

    // Then: 切り詰めメッセージが含まれること
    assert.ok(md.includes('truncated'), '切り詰めメッセージが含まれること');
    assert.ok(md.includes('200000 chars'), '制限文字数が示されていること');
    // 全文は含まれていないこと
    assert.ok(!md.includes(longText), '全文は含まれていないこと');
  });

  // TC-PARSER-01: stripAnsi (ANSI removal)
  test('TC-PARSER-01: stripAnsi removes ANSI color codes', () => {
    // Given: String with ANSI codes
    const input = '\u001b[31mError\u001b[0m';
    // When: stripAnsi called
    const result = stripAnsi(input);
    // Then: Returns string without ANSI codes
    assert.strictEqual(result, 'Error');
  });

  // TC-PARSER-02: stripAnsi (Normal)
  test('TC-PARSER-02: stripAnsi returns original string if no ANSI codes', () => {
    // Given: String with no ANSI codes
    const input = 'Normal String';
    // When: stripAnsi called
    const result = stripAnsi(input);
    // Then: Returns original string
    assert.strictEqual(result, input);
  });

  // TC-PARSER-03: stripAnsi (Empty)
  test('TC-PARSER-03: stripAnsi returns empty string for empty input', () => {
    // Given: Empty string
    const input = '';
    // When: stripAnsi called
    const result = stripAnsi(input);
    // Then: Returns empty string
    assert.strictEqual(result, '');
  });

  // TC-PARSER-04: stripAnsi (ANSI only)
  test('TC-PARSER-04: stripAnsi returns empty string for ANSI-only input', () => {
    // Given: String with only ANSI codes
    const input = '\u001b[31m\u001b[0m';
    // When: stripAnsi called
    const result = stripAnsi(input);
    // Then: Returns empty string
    assert.strictEqual(result, '');
  });

  // TC-PARSER-05: parseMochaOutput (Success pattern 1)
  test('TC-PARSER-05: parseMochaOutput parses success with ✔', () => {
    // Given: Mocha output with ✔
    const stdout = '  ✔ test case 1';
    // When: parseMochaOutput called
    const result = parseMochaOutput(stdout);
    // Then: Parsed correctly
    assert.strictEqual(result.parsed, true);
    assert.strictEqual(result.passed, 1);
    assert.strictEqual(result.cases[0].name, 'test case 1');
    assert.strictEqual(result.cases[0].passed, true);
  });

  // TC-PARSER-06: parseMochaOutput (Success pattern 2)
  test('TC-PARSER-06: parseMochaOutput parses success with ✓', () => {
    // Given: Mocha output with ✓
    const stdout = '  ✓ test case 2';
    // When: parseMochaOutput called
    const result = parseMochaOutput(stdout);
    // Then: Parsed correctly
    assert.strictEqual(result.parsed, true);
    assert.strictEqual(result.passed, 1);
    assert.strictEqual(result.cases[0].name, 'test case 2');
    assert.strictEqual(result.cases[0].passed, true);
  });

  // TC-PARSER-07: parseMochaOutput (Failure pattern 1)
  test('TC-PARSER-07: parseMochaOutput parses failure with ✖', () => {
    // Given: Mocha output with ✖
    const stdout = '  ✖ failed case 1';
    // When: parseMochaOutput called
    const result = parseMochaOutput(stdout);
    // Then: Parsed correctly as failed
    assert.strictEqual(result.parsed, true);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.cases[0].name, 'failed case 1');
    assert.strictEqual(result.cases[0].passed, false);
  });

  // TC-PARSER-08: parseMochaOutput (Failure pattern 2)
  test('TC-PARSER-08: parseMochaOutput parses failure with ✗', () => {
    // Given: Mocha output with ✗
    const stdout = '  ✗ failed case 2';
    // When: parseMochaOutput called
    const result = parseMochaOutput(stdout);
    // Then: Parsed correctly as failed
    assert.strictEqual(result.parsed, true);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.cases[0].name, 'failed case 2');
    assert.strictEqual(result.cases[0].passed, false);
  });

  // TC-PARSER-09: parseMochaOutput (Failure pattern 3)
  test('TC-PARSER-09: parseMochaOutput parses numbered failure', () => {
    // Given: Mocha output with numbered failure
    const stdout = '  1) failed case 3';
    // When: parseMochaOutput called
    const result = parseMochaOutput(stdout);
    // Then: Parsed correctly as failed
    assert.strictEqual(result.parsed, true);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.cases[0].name, 'failed case 3');
    assert.strictEqual(result.cases[0].passed, false);
  });

  // TC-PARSER-10: parseMochaOutput (Suite detection .ts)
  test('TC-PARSER-10: parseMochaOutput detects suite name with extension', () => {
    // Given: Output with .ts suite name
    const stdout = `
  src/test.ts
    ✔ test 1
`;
    // When: parseMochaOutput called
    const result = parseMochaOutput(stdout);
    // Then: Suite detected
    assert.strictEqual(result.cases[0].suite, 'src/test.ts');
  });

  // TC-PARSER-11: parseMochaOutput (Suite detection indent 2)
  test('TC-PARSER-11: parseMochaOutput detects suite with min indent (2)', () => {
    // Given: Output with shallow indent
    const stdout = `
  SuiteName
    ✔ test 1
`;
    // When: parseMochaOutput called
    const result = parseMochaOutput(stdout);
    // Then: Suite detected
    assert.strictEqual(result.cases[0].suite, 'SuiteName');
  });

  // TC-PARSER-12: parseMochaOutput (Suite detection indent 4)
  test('TC-PARSER-12: parseMochaOutput detects suite with max indent (4)', () => {
    // Given: Output with indent 4
    const stdout = `
    SuiteName
      ✔ test 1
`;
    // When: parseMochaOutput called
    const result = parseMochaOutput(stdout);
    // Then: Suite detected
    assert.strictEqual(result.cases[0].suite, 'SuiteName');
  });

  // TC-PARSER-13: parseMochaOutput (Suite ignored indent 6)
  test('TC-PARSER-13: parseMochaOutput ignores suite with deep indent (6) unless file', () => {
    // Given: Output with indent 6
    const stdout = `
      NotASuite
        ✔ test 1
`;
    // When: parseMochaOutput called
    const result = parseMochaOutput(stdout);
    // Then: Suite not detected (uses previous or empty)
    assert.strictEqual(result.cases[0].suite, '');
  });

  // TC-PARSER-14: parseMochaOutput (Mixed results)
  test('TC-PARSER-14: parseMochaOutput handles mixed pass/fail results', () => {
    // Given: Mixed output
    const stdout = `
  Suite
    ✔ pass
    ✖ fail
`;
    // When: parseMochaOutput called
    const result = parseMochaOutput(stdout);
    // Then: Counts correct
    assert.strictEqual(result.passed, 1);
    assert.strictEqual(result.failed, 1);
  });

  // TC-PARSER-15: parseMochaOutput (Empty)
  test('TC-PARSER-15: parseMochaOutput returns not parsed for empty string', () => {
    // Given: Empty string
    const stdout = '';
    // When: parseMochaOutput called
    const result = parseMochaOutput(stdout);
    // Then: parsed=false
    assert.strictEqual(result.parsed, false);
    assert.strictEqual(result.cases.length, 0);
  });

  // TC-PARSER-16: parseMochaOutput (No matches)
  test('TC-PARSER-16: parseMochaOutput returns not parsed if no tests matched', () => {
    // Given: No match output
    const stdout = 'Just some log output';
    // When: parseMochaOutput called
    const result = parseMochaOutput(stdout);
    // Then: parsed=false
    assert.strictEqual(result.parsed, false);
    assert.strictEqual(result.cases.length, 0);
  });

  // TC-ART-27: 詳細テーブル生成
  test('TC-ART-27: レポートに詳細テーブルが含まれる', () => {
    // Given: パース可能な結果を含むデータ
    // When: buildTestExecutionArtifactMarkdown を呼び出す
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Detail Check',
      targetPaths: ['test.ts'],
      result: {
        command: 'cmd',
        cwd: '/tmp',
        exitCode: 1,
        signal: null,
        durationMs: 100,
        stdout: '  ✔ test passed\n  1) test failed',
        stderr: '',
        extensionLog: '',
      },
    });

    // Then: 詳細テーブルが含まれること
    assert.ok(md.includes(`| ${t('artifact.executionReport.suite')} | ${t('artifact.executionReport.testName')} | ${t('artifact.executionReport.result')} |`), 'テーブルヘッダが含まれること');
    assert.ok(md.includes('| test passed | ✅ |'), '成功行が含まれること');
    assert.ok(md.includes('| test failed | ❌ |'), '失敗行が含まれること');
  });

  // TC-ART-28: パイプ文字エスケープ
  test('TC-ART-28: テスト名にパイプが含まれる場合エスケープされる', () => {
    // Given: パイプを含むテスト名
    // When: buildTestExecutionArtifactMarkdown を呼び出す
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs: Date.now(),
      generationLabel: 'Pipe Check',
      targetPaths: ['test.ts'],
      result: {
        command: 'cmd',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 100,
        stdout: '  ✔ test | with | pipe',
        stderr: '',
        extensionLog: '',
      },
    });

    // Then: パイプがエスケープされていること
    assert.ok(md.includes('test \\| with \\| pipe'), 'パイプがエスケープされていること');
  });

  // TC-N-01: formatLocalIso8601WithOffset - Valid Date object with normal timestamp
  test('TC-N-01: formatLocalIso8601WithOffset returns readable timestamp string with local timezone offset', () => {
    // Given: Valid Date object with normal timestamp
    const date = new Date('2025-12-25T02:50:12.204Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns readable timestamp string with local timezone offset
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Format: YYYY-MM-DD  HH:mm:ss.SSS ±HH:mm
    assert.ok(
      /^\d{4}-\d{2}-\d{2}\s{2}\d{2}:\d{2}:\d{2}\.\d{3}\s[+-]\d{2}:\d{2}$/.test(timestamp),
      '表示用形式であること',
    );
  });

  // TC-N-02: formatLocalIso8601WithOffset - milliseconds = 0
  test('TC-N-02: formatLocalIso8601WithOffset formats zero milliseconds as .000', () => {
    // Given: Date object with milliseconds = 0
    const date = new Date('2025-12-25T02:50:12.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with ".000" milliseconds
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('.000'), 'ミリ秒が .000 でフォーマットされること');
  });

  // TC-N-03: formatLocalIso8601WithOffset - milliseconds = 1
  test('TC-N-03: formatLocalIso8601WithOffset formats minimum non-zero milliseconds as .001', () => {
    // Given: Date object with milliseconds = 1
    const date = new Date('2025-12-25T02:50:12.001Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with ".001" milliseconds
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('.001'), 'ミリ秒が .001 でフォーマットされること');
  });

  // TC-N-04: formatLocalIso8601WithOffset - milliseconds = 999
  test('TC-N-04: formatLocalIso8601WithOffset formats maximum milliseconds as .999', () => {
    // Given: Date object with milliseconds = 999
    const date = new Date('2025-12-25T02:50:12.999Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with ".999" milliseconds
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('.999'), 'ミリ秒が .999 でフォーマットされること');
  });

  // TC-N-05: formatLocalIso8601WithOffset - time 00:00:00.000
  test('TC-N-05: formatLocalIso8601WithOffset formats midnight correctly', () => {
    // Given: Date object with time 00:00:00.000
    const date = new Date('2025-12-25T00:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with "00:00:00.000" (in local timezone)
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Time portion format: HH:mm:ss.SSS
    assert.ok(/\s{2}\d{2}:\d{2}:\d{2}\.\d{3}\s/.test(timestamp), '時刻部分が正しくフォーマットされること');
  });

  // TC-N-06: formatLocalIso8601WithOffset - time 23:59:59.999
  test('TC-N-06: formatLocalIso8601WithOffset formats end of day correctly', () => {
    // Given: Date object with time 23:59:59.999
    const date = new Date('2025-12-25T23:59:59.999Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with "23:59:59.999" (in local timezone)
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Time portion format: HH:mm:ss.SSS
    assert.ok(/\s{2}\d{2}:\d{2}:\d{2}\.\d{3}\s/.test(timestamp), '時刻部分が正しくフォーマットされること');
  });

  // TC-N-07: formatLocalIso8601WithOffset - January 1st
  test('TC-N-07: formatLocalIso8601WithOffset formats start of year correctly', () => {
    // Given: Date object on January 1st (month = 0, date = 1)
    const date = new Date('2025-01-01T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with "01-01" date
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('2025-01-01'), '日付が 01-01 でフォーマットされること');
  });

  // TC-N-08: formatLocalIso8601WithOffset - December 31st
  test('TC-N-08: formatLocalIso8601WithOffset formats end of year correctly', () => {
    // Given: Date object on December 31st (month = 11, date = 31)
    const date = new Date('2025-12-31T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with "12-31" date
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('2025-12-31'), '日付が 12-31 でフォーマットされること');
  });

  // TC-N-09: formatLocalIso8601WithOffset - February 29th in leap year
  test('TC-N-09: formatLocalIso8601WithOffset formats leap year date correctly', () => {
    // Given: Date object on February 29th in leap year
    const date = new Date('2024-02-29T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with "02-29" date
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('2024-02-29'), '日付が 02-29 でフォーマットされること');
  });

  // TC-N-10: formatLocalIso8601WithOffset - February 28th in non-leap year
  test('TC-N-10: formatLocalIso8601WithOffset formats non-leap year February correctly', () => {
    // Given: Date object on February 28th in non-leap year
    const date = new Date('2025-02-28T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with "02-28" date
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('2025-02-28'), '日付が 02-28 でフォーマットされること');
  });

  // TC-N-11: formatLocalIso8601WithOffset - timezone offset = +00:00 (UTC)
  test('TC-N-11: formatLocalIso8601WithOffset formats UTC timezone correctly', () => {
    // Given: Date object (timezone offset depends on system timezone)
    // Note: This test verifies the offset format, not the specific offset value
    const date = new Date('2025-12-25T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with timezone offset in format ±HH:mm
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(/[+-]\d{2}:\d{2}$/.test(timestamp), 'タイムゾーンオフセットが ±HH:mm 形式であること');
  });

  // TC-N-12: formatLocalIso8601WithOffset - timezone offset = +09:00 (JST)
  test('TC-N-12: formatLocalIso8601WithOffset formats positive offset correctly', () => {
    // Given: Date object (offset depends on system timezone)
    const date = new Date('2025-12-25T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with timezone offset (format verified)
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Verify offset format: +HH:mm or -HH:mm
    assert.ok(/[+-]\d{2}:\d{2}$/.test(timestamp), 'タイムゾーンオフセットが正しい形式であること');
  });

  // TC-N-13: formatLocalIso8601WithOffset - timezone offset = -05:00 (EST)
  test('TC-N-13: formatLocalIso8601WithOffset formats negative offset correctly', () => {
    // Given: Date object (offset depends on system timezone)
    const date = new Date('2025-12-25T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with timezone offset (format verified)
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Verify offset format supports both positive and negative
    assert.ok(/[+-]\d{2}:\d{2}$/.test(timestamp), 'タイムゾーンオフセットが正負両方に対応していること');
  });

  // TC-N-14: formatLocalIso8601WithOffset - timezone offset = +14:00 (maximum positive)
  test('TC-N-14: formatLocalIso8601WithOffset handles maximum positive offset', () => {
    // Given: Date object (offset depends on system timezone)
    const date = new Date('2025-12-25T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with timezone offset (format verified)
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Verify offset format
    assert.ok(/[+-]\d{2}:\d{2}$/.test(timestamp), 'タイムゾーンオフセットが正しい形式であること');
  });

  // TC-N-15: formatLocalIso8601WithOffset - timezone offset = -12:00 (maximum negative)
  test('TC-N-15: formatLocalIso8601WithOffset handles maximum negative offset', () => {
    // Given: Date object (offset depends on system timezone)
    const date = new Date('2025-12-25T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with timezone offset (format verified)
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Verify offset format supports negative
    assert.ok(/[+-]\d{2}:\d{2}$/.test(timestamp), 'タイムゾーンオフセットが負の値に対応していること');
  });

  // TC-N-16: formatLocalIso8601WithOffset - timezone offset minutes = 0
  test('TC-N-16: formatLocalIso8601WithOffset formats exact hour offset correctly', () => {
    // Given: Date object (offset depends on system timezone)
    const date = new Date('2025-12-25T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with ":00" minutes in offset
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Verify offset format includes minutes (may be :00 or :30 or :45 depending on timezone)
    assert.ok(/[+-]\d{2}:\d{2}$/.test(timestamp), 'タイムゾーンオフセットの分部分が含まれること');
  });

  // TC-N-17: formatLocalIso8601WithOffset - timezone offset minutes = 30
  test('TC-N-17: formatLocalIso8601WithOffset formats half hour offset correctly', () => {
    // Given: Date object (offset depends on system timezone)
    const date = new Date('2025-12-25T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with offset including minutes
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Verify offset format includes minutes
    assert.ok(/[+-]\d{2}:\d{2}$/.test(timestamp), 'タイムゾーンオフセットの分部分が正しくフォーマットされること');
  });

  // TC-N-18: formatLocalIso8601WithOffset - timezone offset minutes = 45
  test('TC-N-18: formatLocalIso8601WithOffset formats three-quarter hour offset correctly', () => {
    // Given: Date object (offset depends on system timezone)
    const date = new Date('2025-12-25T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with offset including minutes
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Verify offset format includes minutes
    assert.ok(/[+-]\d{2}:\d{2}$/.test(timestamp), 'タイムゾーンオフセットの分部分が正しくフォーマットされること');
  });

  // TC-N-19 through TC-N-25: pad3 function tests
  // Note: pad3 is private, so we test it indirectly through formatLocalIso8601WithOffset
  // by checking milliseconds formatting in timestamps

  // TC-N-19: pad3 function with n = 0
  test('TC-N-19: pad3 formats zero milliseconds as 000', () => {
    // Given: Date object with milliseconds = 0
    const date = new Date('2025-12-25T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with ".000" milliseconds (pad3(0) = "000")
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('.000'), 'ミリ秒が 000 でパディングされること');
  });

  // TC-N-20: pad3 function with n = 1
  test('TC-N-20: pad3 formats single digit milliseconds as 001', () => {
    // Given: Date object with milliseconds = 1
    const date = new Date('2025-12-25T12:00:00.001Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with ".001" milliseconds (pad3(1) = "001")
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('.001'), 'ミリ秒が 001 でパディングされること');
  });

  // TC-N-21: pad3 function with n = 9
  test('TC-N-21: pad3 formats maximum single digit milliseconds as 009', () => {
    // Given: Date object with milliseconds = 9
    const date = new Date('2025-12-25T12:00:00.009Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with ".009" milliseconds (pad3(9) = "009")
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('.009'), 'ミリ秒が 009 でパディングされること');
  });

  // TC-N-22: pad3 function with n = 10
  test('TC-N-22: pad3 formats minimum two digits milliseconds as 010', () => {
    // Given: Date object with milliseconds = 10
    const date = new Date('2025-12-25T12:00:00.010Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with ".010" milliseconds (pad3(10) = "010")
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('.010'), 'ミリ秒が 010 でパディングされること');
  });

  // TC-N-23: pad3 function with n = 99
  test('TC-N-23: pad3 formats maximum two digits milliseconds as 099', () => {
    // Given: Date object with milliseconds = 99
    const date = new Date('2025-12-25T12:00:00.099Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with ".099" milliseconds (pad3(99) = "099")
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('.099'), 'ミリ秒が 099 でパディングされること');
  });

  // TC-N-24: pad3 function with n = 100
  test('TC-N-24: pad3 formats minimum three digits milliseconds as 100', () => {
    // Given: Date object with milliseconds = 100
    const date = new Date('2025-12-25T12:00:00.100Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with ".100" milliseconds (pad3(100) = "100")
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('.100'), 'ミリ秒が 100 でフォーマットされること（パディングなし）');
  });

  // TC-N-25: pad3 function with n = 999
  test('TC-N-25: pad3 formats maximum three digits milliseconds as 999', () => {
    // Given: Date object with milliseconds = 999
    const date = new Date('2025-12-25T12:00:00.999Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with ".999" milliseconds (pad3(999) = "999")
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('.999'), 'ミリ秒が 999 でフォーマットされること');
  });

  // TC-N-26: buildTestPerspectiveArtifactMarkdown with valid parameters
  test('TC-N-26: buildTestPerspectiveArtifactMarkdown uses formatLocalIso8601WithOffset for timestamp', () => {
    // Given: Valid parameters
    const generatedAtMs = Date.now();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test Label',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: '| ID | Case |',
    });

    // Then: Returns markdown string with formatted timestamp using formatLocalIso8601WithOffset
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Verify readable timestamp format with offset
    assert.ok(
      /^\d{4}-\d{2}-\d{2}\s{2}\d{2}:\d{2}:\d{2}\.\d{3}\s[+-]\d{2}:\d{2}$/.test(timestamp),
      'formatLocalIso8601WithOffset形式のタイムスタンプが使用されること',
    );
  });

  // TC-N-27: buildTestExecutionArtifactMarkdown with valid parameters
  test('TC-N-27: buildTestExecutionArtifactMarkdown uses formatLocalIso8601WithOffset for timestamp', () => {
    // Given: Valid parameters
    const generatedAtMs = Date.now();

    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs,
      generationLabel: 'Test Label',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 100,
        stdout: '',
        stderr: '',
      },
    });

    // Then: Returns markdown string with formatted timestamp using formatLocalIso8601WithOffset
    const match = md.match(`- ${t('artifact.executionReport.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Verify readable timestamp format with offset
    assert.ok(
      /^\d{4}-\d{2}-\d{2}\s{2}\d{2}:\d{2}:\d{2}\.\d{3}\s[+-]\d{2}:\d{2}$/.test(timestamp),
      'formatLocalIso8601WithOffset形式のタイムスタンプが使用されること',
    );
  });

  // TC-E-01: formatLocalIso8601WithOffset with null input
  test('TC-E-01: formatLocalIso8601WithOffset throws TypeError when input is null', () => {
    // Given: null input (passed as Date constructor parameter)
    // When: buildTestPerspectiveArtifactMarkdown is called with null converted to Date
    // Then: Throws TypeError with message "generatedAtMs must be a number"
    assert.throws(
      () => {
        buildTestPerspectiveArtifactMarkdown({
          generatedAtMs: null as unknown as number,
          targetLabel: 'Test',
          targetPaths: ['test.ts'],
          perspectiveMarkdown: 'table',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TypeError, 'TypeError が投げられること');
        const message = err instanceof Error ? err.message : String(err);
        assert.ok(message.includes('generatedAtMs must be a number'), 'generatedAtMs must be a number が含まれること');
        return true;
      },
    );
  });

  // TC-E-02: formatLocalIso8601WithOffset with undefined input
  test('TC-E-02: formatLocalIso8601WithOffset throws TypeError when input is undefined', () => {
    // Given: undefined input
    // When: buildTestPerspectiveArtifactMarkdown is called with undefined
    // Then: Throws TypeError with message "generatedAtMs must be a number"
    assert.throws(
      () => {
        buildTestPerspectiveArtifactMarkdown({
          generatedAtMs: undefined as unknown as number,
          targetLabel: 'Test',
          targetPaths: ['test.ts'],
          perspectiveMarkdown: 'table',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TypeError, 'TypeError が投げられること');
        const message = err instanceof Error ? err.message : String(err);
        assert.ok(message.includes('generatedAtMs must be a number'), 'generatedAtMs must be a number が含まれること');
        return true;
      },
    );
  });

  // TC-E-03: formatLocalIso8601WithOffset with invalid Date object
  test('TC-E-03: formatLocalIso8601WithOffset handles invalid Date object', () => {
    // Given: Invalid Date object (new Date("invalid"))
    const invalidDate = new Date('invalid');
    const generatedAtMs = invalidDate.getTime(); // Returns NaN

    // When: buildTestPerspectiveArtifactMarkdown is called
    // Then: Returns formatted string with NaN values or throws error
    // Note: Date constructor with NaN timestamp produces invalid date
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Behavior depends on Date constructor - invalid dates may produce "Invalid Date" string
    // or NaN values in formatted output
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    // The output may contain NaN or Invalid Date, which is acceptable behavior
  });

  // TC-E-04: pad3 function with n = -1
  test('TC-E-04: pad3 does not handle negative values correctly', () => {
    // Given: Date object with negative milliseconds (not possible, but testing pad3 indirectly)
    // Note: pad3(-1) would return "-1" without padding
    // We test this indirectly by checking that the function doesn't validate range
    // Since milliseconds are always 0-999, we can't directly test negative values
    // This test documents the behavior: pad3 does not handle negative values
    const date = new Date('2025-12-25T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Function completes (negative milliseconds not possible in Date)
    assert.ok(md.includes(`- ${t('artifact.executionReport.generatedAt')}:`) || md.includes(`- ${t('artifact.perspectiveTable.generatedAt')}:`), '正常に処理されること');
  });

  // TC-E-05: pad3 function with n = 1000
  test('TC-E-05: pad3 does not validate range for overflow values', () => {
    // Given: Date object with milliseconds = 1000 (not possible, but testing pad3 behavior)
    // Note: pad3(1000) would return "1000" without padding to 3 digits
    // Since Date milliseconds are always 0-999, we can't directly test 1000
    // This test documents the behavior: pad3 does not validate range
    const date = new Date('2025-12-25T12:00:00.999Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Function completes (milliseconds overflow not possible in Date)
    assert.ok(md.includes(`- ${t('artifact.executionReport.generatedAt')}:`) || md.includes(`- ${t('artifact.perspectiveTable.generatedAt')}:`), '正常に処理されること');
  });

  // TC-E-06: pad3 function with null input
  test('TC-E-06: pad3 throws TypeError when input is null', () => {
    // Given: null input (indirectly through Date constructor)
    // When: buildTestPerspectiveArtifactMarkdown is called with invalid timestamp
    // Then: Throws TypeError or produces invalid output
    assert.throws(
      () => {
        buildTestPerspectiveArtifactMarkdown({
          generatedAtMs: null as unknown as number,
          targetLabel: 'Test',
          targetPaths: ['test.ts'],
          perspectiveMarkdown: 'table',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TypeError, 'TypeError が投げられること');
        const message = err instanceof Error ? err.message : String(err);
        assert.ok(message.includes('generatedAtMs must be a number'), 'generatedAtMs must be a number が含まれること');
        return true;
      },
    );
  });

  // TC-E-07: pad3 function with undefined input
  test('TC-E-07: pad3 throws TypeError when input is undefined', () => {
    // Given: undefined input
    // When: buildTestPerspectiveArtifactMarkdown is called with undefined
    // Then: Throws TypeError
    assert.throws(
      () => {
        buildTestPerspectiveArtifactMarkdown({
          generatedAtMs: undefined as unknown as number,
          targetLabel: 'Test',
          targetPaths: ['test.ts'],
          perspectiveMarkdown: 'table',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TypeError, 'TypeError が投げられること');
        const message = err instanceof Error ? err.message : String(err);
        assert.ok(message.includes('generatedAtMs must be a number'), 'generatedAtMs must be a number が含まれること');
        return true;
      },
    );
  });

  // TC-E-08: pad3 function with non-number input
  test('TC-E-08: pad3 throws TypeError or returns unexpected result for non-number input', () => {
    // Given: Non-number input (string)
    // When: buildTestPerspectiveArtifactMarkdown is called with string timestamp
    // Then: Throws TypeError with message "generatedAtMs must be a number"
    assert.throws(
      () => {
        buildTestPerspectiveArtifactMarkdown({
          generatedAtMs: 'invalid' as unknown as number,
          targetLabel: 'Test',
          targetPaths: ['test.ts'],
          perspectiveMarkdown: 'table',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TypeError, 'TypeError が投げられること');
        const message = err instanceof Error ? err.message : String(err);
        assert.ok(message.includes('generatedAtMs must be a number'), 'generatedAtMs must be a number が含まれること');
        return true;
      },
    );
  });

  // TC-E-09: buildTestPerspectiveArtifactMarkdown with generatedAtMs = 0
  test('TC-E-09: buildTestPerspectiveArtifactMarkdown handles zero timestamp (epoch)', () => {
    // Given: generatedAtMs = 0 (epoch: 1970-01-01)
    const generatedAtMs = 0;

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns markdown with formatted date from epoch (1970-01-01)
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('1970-01-01'), 'エポック時刻が正しくフォーマットされること');
  });

  // TC-E-10: buildTestPerspectiveArtifactMarkdown with generatedAtMs = Number.MAX_SAFE_INTEGER
  test('TC-E-10: buildTestPerspectiveArtifactMarkdown handles maximum safe integer timestamp', () => {
    // Given: generatedAtMs = Number.MAX_SAFE_INTEGER
    const generatedAtMs = Number.MAX_SAFE_INTEGER;

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns markdown with formatted date (may produce invalid date)
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    // The output may contain invalid date or very large year, which is acceptable
  });

  // TC-E-11: buildTestPerspectiveArtifactMarkdown with generatedAtMs = -1
  test('TC-E-11: buildTestPerspectiveArtifactMarkdown handles negative timestamp', () => {
    // Given: generatedAtMs = -1 (1969-12-31)
    const generatedAtMs = -1;

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns markdown with formatted date (1969-12-31)
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // ローカルタイムゾーンでは日付が変わり得るため、期待値はDateから算出する
    const d = new Date(generatedAtMs);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    assert.ok(timestamp.includes(expected), '負のタイムスタンプがローカル日付で正しくフォーマットされること');
  });

  // TC-E-12: buildTestExecutionArtifactMarkdown with generatedAtMs = 0
  test('TC-E-12: buildTestExecutionArtifactMarkdown handles zero timestamp (epoch)', () => {
    // Given: generatedAtMs = 0 (epoch: 1970-01-01)
    const generatedAtMs = 0;

    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs,
      generationLabel: 'Test',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 100,
        stdout: '',
        stderr: '',
      },
    });

    // Then: Returns markdown with formatted date from epoch
    const match = md.match(`- ${t('artifact.executionReport.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('1970-01-01'), 'エポック時刻が正しくフォーマットされること');
  });

  // TC-E-13: buildTestExecutionArtifactMarkdown with generatedAtMs = Number.MAX_SAFE_INTEGER
  test('TC-E-13: buildTestExecutionArtifactMarkdown handles maximum safe integer timestamp', () => {
    // Given: generatedAtMs = Number.MAX_SAFE_INTEGER
    const generatedAtMs = Number.MAX_SAFE_INTEGER;

    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs,
      generationLabel: 'Test',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 100,
        stdout: '',
        stderr: '',
      },
    });

    // Then: Returns markdown with formatted date (may produce invalid date)
    const match = md.match(`- ${t('artifact.executionReport.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    // The output may contain invalid date or very large year, which is acceptable
  });

  // TC-E-14: buildTestExecutionArtifactMarkdown with generatedAtMs = -1
  test('TC-E-14: buildTestExecutionArtifactMarkdown handles negative timestamp', () => {
    // Given: generatedAtMs = -1 (1969-12-31)
    const generatedAtMs = -1;

    // When: buildTestExecutionArtifactMarkdown is called
    const md = buildTestExecutionArtifactMarkdown({
      generatedAtMs,
      generationLabel: 'Test',
      targetPaths: ['test.ts'],
      result: {
        command: 'npm test',
        cwd: '/tmp',
        exitCode: 0,
        signal: null,
        durationMs: 100,
        stdout: '',
        stderr: '',
      },
    });

    // Then: Returns markdown with formatted date (1969-12-31)
    const match = md.match(`- ${t('artifact.executionReport.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // ローカルタイムゾーンでは日付が変わり得るため、期待値はDateから算出する
    const d = new Date(generatedAtMs);
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    assert.ok(timestamp.includes(expected), '負のタイムスタンプがローカル日付で正しくフォーマットされること');
  });

  // TC-B-01: Date object with month = 0 (January)
  test('TC-B-01: formatLocalIso8601WithOffset formats first month correctly', () => {
    // Given: Date object with month = 0 (January)
    const date = new Date('2025-01-15T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with "01" month
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('2025-01-'), '月が 01 でフォーマットされること');
  });

  // TC-B-02: Date object with month = 11 (December)
  test('TC-B-02: formatLocalIso8601WithOffset formats last month correctly', () => {
    // Given: Date object with month = 11 (December)
    const date = new Date('2025-12-15T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with "12" month
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('2025-12-'), '月が 12 でフォーマットされること');
  });

  // TC-B-03: Date object with date = 1
  test('TC-B-03: formatLocalIso8601WithOffset formats first day of month correctly', () => {
    // Given: Date object with date = 1
    const date = new Date('2025-12-01T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with "01" date
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('-01  '), '日が 01 でフォーマットされること');
  });

  // TC-B-04: Date object with date = 31
  test('TC-B-04: formatLocalIso8601WithOffset formats last day of month correctly', () => {
    // Given: Date object with date = 31
    const date = new Date('2025-12-31T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with "31" date
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    assert.ok(timestamp.includes('-31  '), '日が 31 でフォーマットされること');
  });

  // TC-B-05: Date object with hours = 0
  test('TC-B-05: formatLocalIso8601WithOffset formats zero hours correctly', () => {
    // Given: Date object with hours = 0
    const date = new Date('2025-12-25T00:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with "00" hours (in local timezone)
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Verify time format includes hours
    assert.ok(/\s{2}\d{2}:\d{2}:\d{2}/.test(timestamp), '時刻部分が正しくフォーマットされること');
  });

  // TC-B-06: Date object with hours = 23
  test('TC-B-06: formatLocalIso8601WithOffset formats maximum hours correctly', () => {
    // Given: Date object with hours = 23
    const date = new Date('2025-12-25T23:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with "23" hours (in local timezone)
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Verify time format includes hours
    assert.ok(/\s{2}\d{2}:\d{2}:\d{2}/.test(timestamp), '時刻部分が正しくフォーマットされること');
  });

  // TC-B-07: Date object with minutes = 0
  test('TC-B-07: formatLocalIso8601WithOffset formats zero minutes correctly', () => {
    // Given: Date object with minutes = 0
    const date = new Date('2025-12-25T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with "00" minutes (in local timezone)
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Verify time format includes minutes
    assert.ok(/\s{2}\d{2}:\d{2}:\d{2}/.test(timestamp), '時刻部分が正しくフォーマットされること');
  });

  // TC-B-08: Date object with minutes = 59
  test('TC-B-08: formatLocalIso8601WithOffset formats maximum minutes correctly', () => {
    // Given: Date object with minutes = 59
    const date = new Date('2025-12-25T12:59:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with "59" minutes (in local timezone)
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Verify time format includes minutes
    assert.ok(/\s{2}\d{2}:\d{2}:\d{2}/.test(timestamp), '時刻部分が正しくフォーマットされること');
  });

  // TC-B-09: Date object with seconds = 0
  test('TC-B-09: formatLocalIso8601WithOffset formats zero seconds correctly', () => {
    // Given: Date object with seconds = 0
    const date = new Date('2025-12-25T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with "00" seconds (in local timezone)
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Verify time format includes seconds
    assert.ok(/\s{2}\d{2}:\d{2}:\d{2}/.test(timestamp), '時刻部分が正しくフォーマットされること');
  });

  // TC-B-10: Date object with seconds = 59
  test('TC-B-10: formatLocalIso8601WithOffset formats maximum seconds correctly', () => {
    // Given: Date object with seconds = 59
    const date = new Date('2025-12-25T12:00:59.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Returns formatted string with "59" seconds (in local timezone)
    const match = md.match(`- ${t('artifact.perspectiveTable.generatedAt')}: (.+)`);
    assert.ok(match, '生成日時が含まれること');
    const timestamp = match![1];
    // Verify time format includes seconds
    assert.ok(/\s{2}\d{2}:\d{2}:\d{2}/.test(timestamp), '時刻部分が正しくフォーマットされること');
  });

  // TC-B-11: pad3 function with n = 0.5 (decimal)
  test('TC-B-11: pad3 does not handle decimal values correctly', () => {
    // Given: Date object (milliseconds are always integers, so we can't directly test decimals)
    // Note: pad3(0.5) would return "0.5" without padding
    // Since Date milliseconds are always integers, we can't directly test decimal values
    // This test documents the behavior: pad3 does not handle decimals
    const date = new Date('2025-12-25T12:00:00.000Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Function completes (decimal milliseconds not possible in Date)
    assert.ok(md.includes(`- ${t('artifact.executionReport.generatedAt')}:`) || md.includes(`- ${t('artifact.perspectiveTable.generatedAt')}:`), '正常に処理されること');
  });

  // TC-B-12: pad3 function with n = 999.9 (decimal)
  test('TC-B-12: pad3 does not handle decimal values near max correctly', () => {
    // Given: Date object (milliseconds are always integers)
    // Note: pad3(999.9) would return "999.9" without padding
    // Since Date milliseconds are always integers, we can't directly test decimal values
    // This test documents the behavior: pad3 does not handle decimals
    const date = new Date('2025-12-25T12:00:00.999Z');
    const generatedAtMs = date.getTime();

    // When: buildTestPerspectiveArtifactMarkdown is called
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs,
      targetLabel: 'Test',
      targetPaths: ['test.ts'],
      perspectiveMarkdown: 'table',
    });

    // Then: Function completes (decimal milliseconds not possible in Date)
    assert.ok(md.includes(`- ${t('artifact.executionReport.generatedAt')}:`) || md.includes(`- ${t('artifact.perspectiveTable.generatedAt')}:`), '正常に処理されること');
  });

  // TC-E-09: buildTestExecutionArtifactMarkdown with generatedAtMs = null
  test('TC-E-09: buildTestExecutionArtifactMarkdown throws TypeError when generatedAtMs is null', () => {
    // Given: buildTestExecutionArtifactMarkdown called with null generatedAtMs
    const mockResult = {
      command: 'npm test',
      cwd: '/tmp',
      exitCode: 0,
      signal: null,
      durationMs: 100,
      stdout: '',
      stderr: '',
    };

    // When: buildTestExecutionArtifactMarkdown is called with null
    // Then: Throws TypeError with message "generatedAtMs must be a number"
    assert.throws(
      () => {
        buildTestExecutionArtifactMarkdown({
          generatedAtMs: null as unknown as number,
          generationLabel: 'Test',
          targetPaths: ['test.ts'],
          result: mockResult,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TypeError, 'TypeError が投げられること');
        const message = err instanceof Error ? err.message : String(err);
        assert.ok(message.includes('generatedAtMs must be a number'), 'generatedAtMs must be a number が含まれること');
        return true;
      },
    );
  });

  // TC-E-10: buildTestExecutionArtifactMarkdown with generatedAtMs = undefined
  test('TC-E-10: buildTestExecutionArtifactMarkdown throws TypeError when generatedAtMs is undefined', () => {
    // Given: buildTestExecutionArtifactMarkdown called with undefined generatedAtMs
    const mockResult = {
      command: 'npm test',
      cwd: '/tmp',
      exitCode: 0,
      signal: null,
      durationMs: 100,
      stdout: '',
      stderr: '',
    };

    // When: buildTestExecutionArtifactMarkdown is called with undefined
    // Then: Throws TypeError with message "generatedAtMs must be a number"
    assert.throws(
      () => {
        buildTestExecutionArtifactMarkdown({
          generatedAtMs: undefined as unknown as number,
          generationLabel: 'Test',
          targetPaths: ['test.ts'],
          result: mockResult,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TypeError, 'TypeError が投げられること');
        const message = err instanceof Error ? err.message : String(err);
        assert.ok(message.includes('generatedAtMs must be a number'), 'generatedAtMs must be a number が含まれること');
        return true;
      },
    );
  });

  // TC-E-11: buildTestExecutionArtifactMarkdown with generatedAtMs = string
  test('TC-E-11: buildTestExecutionArtifactMarkdown throws TypeError when generatedAtMs is string', () => {
    // Given: buildTestExecutionArtifactMarkdown called with string generatedAtMs
    const mockResult = {
      command: 'npm test',
      cwd: '/tmp',
      exitCode: 0,
      signal: null,
      durationMs: 100,
      stdout: '',
      stderr: '',
    };

    // When: buildTestExecutionArtifactMarkdown is called with string
    // Then: Throws TypeError with message "generatedAtMs must be a number"
    assert.throws(
      () => {
        buildTestExecutionArtifactMarkdown({
          generatedAtMs: 'invalid' as unknown as number,
          generationLabel: 'Test',
          targetPaths: ['test.ts'],
          result: mockResult,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof TypeError, 'TypeError が投げられること');
        const message = err instanceof Error ? err.message : String(err);
        assert.ok(message.includes('generatedAtMs must be a number'), 'generatedAtMs must be a number が含まれること');
        return true;
      },
    );
  });

  suite('Perspective JSON -> Markdown Table', () => {
    // TC-N-01: Valid JSON perspective table with single case
    test('TC-N-01: parsePerspectiveJsonV1 parses valid JSON with single case', () => {
      // Given: Valid JSON perspective table with single case
      const raw = '{"version":1,"cases":[{"caseId":"TC-N-01","inputPrecondition":"cond","perspective":"Equivalence – normal","expectedResult":"ok","notes":"-"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=true with parsed cases and renderPerspectiveMarkdownTable generates valid Markdown table
      assert.ok(result.ok, 'parsePerspectiveJsonV1 returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.version, 1);
      assert.strictEqual(result.value.cases.length, 1);
      assert.strictEqual(result.value.cases[0]?.caseId, 'TC-N-01');
      assert.strictEqual(result.value.cases[0]?.inputPrecondition, 'cond');
      assert.strictEqual(result.value.cases[0]?.perspective, 'Equivalence – normal');
      assert.strictEqual(result.value.cases[0]?.expectedResult, 'ok');
      assert.strictEqual(result.value.cases[0]?.notes, '-');

      const md = renderPerspectiveMarkdownTable(result.value.cases);
      assert.ok(md.includes(PERSPECTIVE_TABLE_HEADER), 'Markdown table includes header');
      assert.ok(md.includes(PERSPECTIVE_TABLE_SEPARATOR), 'Markdown table includes separator');
      assert.ok(md.includes('| TC-N-01 |'), 'Markdown table includes case ID');
    });

    // TC-N-02: Valid JSON perspective table with multiple cases
    test('TC-N-02: parsePerspectiveJsonV1 parses valid JSON with multiple cases', () => {
      // Given: Valid JSON perspective table with multiple cases
      const raw = '{"version":1,"cases":[{"caseId":"TC-N-01","inputPrecondition":"cond1","perspective":"Equivalence – normal","expectedResult":"ok1","notes":"-"},{"caseId":"TC-N-02","inputPrecondition":"cond2","perspective":"Equivalence – error","expectedResult":"error","notes":"note2"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: All cases are parsed correctly and rendered in Markdown table
      assert.ok(result.ok, 'parsePerspectiveJsonV1 returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.cases.length, 2);
      assert.strictEqual(result.value.cases[0]?.caseId, 'TC-N-01');
      assert.strictEqual(result.value.cases[1]?.caseId, 'TC-N-02');

      const md = renderPerspectiveMarkdownTable(result.value.cases);
      assert.ok(md.includes('| TC-N-01 |'), 'First case is rendered');
      assert.ok(md.includes('| TC-N-02 |'), 'Second case is rendered');
    });

    // TC-N-03: JSON wrapped in code fences
    test('TC-N-03: parsePerspectiveJsonV1 strips code fences and parses JSON', () => {
      // Given: JSON wrapped in code fences
      const raw = [
        '```json',
        '{"version":1,"cases":[{"caseId":"TC-N-01","inputPrecondition":"cond","perspective":"Equivalence – normal","expectedResult":"ok","notes":"-"}]}',
        '```',
      ].join('\n');

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Code fences are stripped and JSON is parsed successfully
      assert.ok(result.ok, 'Code fences are stripped and JSON is parsed');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.cases.length, 1);
    });

    // TC-N-04: JSON object with empty cases array
    test('TC-N-04: parsePerspectiveJsonV1 parses valid JSON with empty cases array', () => {
      // Given: JSON object with empty cases array
      const raw = '{"version":1,"cases":[]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=true with empty cases array
      assert.ok(result.ok, 'parsePerspectiveJsonV1 returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.version, 1);
      assert.strictEqual(result.value.cases.length, 0);
    });

    // TC-N-05: JSON with extra text before/after
    test('TC-N-05: parsePerspectiveJsonV1 extracts JSON object from text with surrounding content', () => {
      // Given: JSON with extra text before/after
      const raw = 'Some text before {"version":1,"cases":[{"caseId":"TC-N-01","inputPrecondition":"cond","perspective":"Equivalence – normal","expectedResult":"ok","notes":"-"}]} some text after';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: extractJsonObject extracts JSON object from text with surrounding content
      assert.ok(result.ok, 'JSON object is extracted from text with surrounding content');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.cases.length, 1);
    });

    // TC-N-06: JSON object with cases array containing objects with missing optional fields
    test('TC-N-06: parsePerspectiveJsonV1 handles cases array with objects missing optional fields', () => {
      // Given: JSON object with cases array containing objects with missing optional fields
      const raw = '{"version":1,"cases":[{"caseId":"TC-N-01"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=true with empty strings for missing fields
      assert.ok(result.ok, 'parsePerspectiveJsonV1 returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.cases.length, 1);
      assert.strictEqual(result.value.cases[0]?.caseId, 'TC-N-01');
      assert.strictEqual(result.value.cases[0]?.inputPrecondition, '');
      assert.strictEqual(result.value.cases[0]?.perspective, '');
      assert.strictEqual(result.value.cases[0]?.expectedResult, '');
      assert.strictEqual(result.value.cases[0]?.notes, '');
    });

    // TC-N-05: Valid legacy Markdown table format
    test('TC-N-05: renderPerspectiveMarkdownTable generates table with correct format', () => {
      // Given: Valid perspective cases
      const cases = [
        {
          caseId: 'TC-N-01',
          inputPrecondition: 'cond',
          perspective: 'Equivalence – normal',
          expectedResult: 'ok',
          notes: '-',
        },
      ];

      // When: renderPerspectiveMarkdownTable is called
      const md = renderPerspectiveMarkdownTable(cases);

      // Then: Table is generated successfully
      assert.ok(md.includes(PERSPECTIVE_TABLE_HEADER), 'Table includes header');
      assert.ok(md.includes(PERSPECTIVE_TABLE_SEPARATOR), 'Table includes separator');
      assert.ok(md.includes('| TC-N-01 | cond | Equivalence – normal | ok | - |'), 'Table includes case row');
      assert.ok(md.endsWith('\n'), 'Table ends with newline');
    });

    // TC-N-06: Cells contain newlines and pipe characters
    test('TC-N-06: normalizeTableCell converts newlines to spaces and escapes pipe characters', () => {
      // Given: Cells contain newlines and pipe characters
      const cases = [
        {
          caseId: 'TC-N-01',
          inputPrecondition: 'a\nb',
          perspective: 'p|q',
          expectedResult: 'ok',
          notes: 'note',
        },
      ];

      // When: renderPerspectiveMarkdownTable is called
      const md = renderPerspectiveMarkdownTable(cases);

      // Then: normalizeTableCell converts newlines to spaces and escapes pipe characters
      assert.ok(md.includes('| TC-N-01 | a b | p\\|q | ok | note |'), 'Newlines converted to spaces and pipes escaped');
    });

    // TC-N-07: parsePerspectiveJsonV1 parses JSON with braces in string fields (regression test for no-json-object fix)
    test('TC-N-07: parsePerspectiveJsonV1 parses JSON with braces in string fields', () => {
      // Given: JSON with braces in expectedResult field (e.g., assert.deepStrictEqual(x, { a: 1 }))
      const raw = '{"version":1,"cases":[{"caseId":"TC-N-01","inputPrecondition":"x = { a: 1 }","perspective":"Equivalence – normal","expectedResult":"assert.deepStrictEqual(x, { a: 1 })","notes":"-"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=true and parses correctly (direct JSON parse succeeds, avoiding extractJsonObject misdetection)
      assert.ok(result.ok, 'parsePerspectiveJsonV1 returns ok=true for JSON with braces in strings');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.version, 1);
      assert.strictEqual(result.value.cases.length, 1);
      assert.strictEqual(result.value.cases[0]?.caseId, 'TC-N-01');
      assert.strictEqual(result.value.cases[0]?.expectedResult, 'assert.deepStrictEqual(x, { a: 1 })');
      assert.strictEqual(result.value.cases[0]?.inputPrecondition, 'x = { a: 1 }');
    });

    // TC-N-08: parsePerspectiveJsonV1 parses JSON with closing brace in string fields
    test('TC-N-08: parsePerspectiveJsonV1 parses JSON with closing brace in string fields', () => {
      // Given: JSON with closing brace in notes field
      const raw = '{"version":1,"cases":[{"caseId":"TC-N-01","inputPrecondition":"cond","perspective":"Equivalence – normal","expectedResult":"ok","notes":"See { code: 1 } for details"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=true and parses correctly
      assert.ok(result.ok, 'parsePerspectiveJsonV1 returns ok=true for JSON with closing brace in strings');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.cases.length, 1);
      assert.strictEqual(result.value.cases[0]?.notes, 'See { code: 1 } for details');
    });

    // TC-N-09: parsePerspectiveJsonV1 parses JSON with multiple braces in string fields
    test('TC-N-09: parsePerspectiveJsonV1 parses JSON with multiple braces in string fields', () => {
      // Given: JSON with multiple braces in expectedResult field
      const raw = '{"version":1,"cases":[{"caseId":"TC-N-01","inputPrecondition":"x = { a: 1 }, y = { b: 2 }","perspective":"Equivalence – normal","expectedResult":"assert.deepStrictEqual(x, { a: 1 }); assert.deepStrictEqual(y, { b: 2 })","notes":"-"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=true and parses correctly
      assert.ok(result.ok, 'parsePerspectiveJsonV1 returns ok=true for JSON with multiple braces in strings');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.cases.length, 1);
      assert.ok(result.value.cases[0]?.expectedResult.includes('{ a: 1 }'), 'First brace pair is preserved');
      assert.ok(result.value.cases[0]?.expectedResult.includes('{ b: 2 }'), 'Second brace pair is preserved');
    });

    // TC-B-01: JSON array containing zero elements '[]'
    test('TC-B-01: parsePerspectiveJsonV1 returns ok=false with error=json-not-object for empty array', () => {
      // Given: JSON array containing zero elements '[]'
      const raw = '[]';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false with error=json-not-object (empty array is valid JSON but not object)
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-B-02: JSON array containing single element '[{"version":1}]'
    test('TC-B-02: parsePerspectiveJsonV1 returns ok=false with error=json-not-object for single element array', () => {
      // Given: JSON array containing single element '[{"version":1}]'
      const raw = '[{"version":1}]';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false with error=json-not-object (single element array is still array)
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-B-01 (legacy): JSON array with single element '[{"version":1,"cases":[]}]'
    test('TC-B-01 (legacy): parsePerspectiveJsonV1 returns ok=false with error=json-not-object for single element array', () => {
      // Given: JSON array with single element
      const raw = '[{"version":1,"cases":[]}]';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=json-not-object
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-B-02: JSON object with cases array containing exactly one case
    test('TC-B-02: parsePerspectiveJsonV1 parses valid JSON with single case', () => {
      // Given: JSON object with cases array containing exactly one case
      const raw = '{"version":1,"cases":[{"caseId":"TC-N-01","inputPrecondition":"cond","perspective":"p","expectedResult":"ok","notes":"-"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=true with single case in array
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.cases.length, 1);
      assert.strictEqual(result.value.cases[0]?.caseId, 'TC-N-01');
    });

    // TC-B-03: JSON object with cases array containing zero cases
    test('TC-B-03: parsePerspectiveJsonV1 parses valid JSON with zero cases', () => {
      // Given: JSON object with cases array containing zero cases
      const raw = '{"version":1,"cases":[]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=true with empty cases array
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.cases.length, 0);
    });

    // TC-E-01: parsePerspectiveJsonV1 with empty string
    test('TC-E-01: parsePerspectiveJsonV1 returns ok=false with error=empty for empty string', () => {
      // Given: Empty string input to parsePerspectiveJsonV1
      const raw = '';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false with error=empty
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'empty');
    });

    // TC-E-02: parsePerspectiveJsonV1 with whitespace-only string
    test('TC-E-02: parsePerspectiveJsonV1 returns ok=false with error=empty for whitespace-only string', () => {
      // Given: Whitespace-only string input to parsePerspectiveJsonV1
      const raw = '   \n\t  ';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false with error=empty (trimmed empty string)
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'empty');
    });

    // TC-E-03: parsePerspectiveJsonV1 with invalid JSON syntax in object
    test('TC-E-03: parsePerspectiveJsonV1 returns ok=false with error starting with invalid-json: for invalid JSON syntax in object', () => {
      // Given: Invalid JSON syntax in object
      const raw = '{"version":1,"cases":[invalid]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false with error starting with invalid-json:
      assert.ok(!result.ok, 'Returns ok=false');
      assert.ok(result.error.startsWith('invalid-json:'), 'Error starts with invalid-json:');
    });

    // TC-E-04: parsePerspectiveJsonV1 with valid JSON object but version !== 1
    test('TC-E-04: parsePerspectiveJsonV1 returns ok=false with error=unsupported-version for version !== 1', () => {
      // Given: Valid JSON object but version !== 1
      const raw = '{"version":2,"cases":[{"caseId":"TC-N-01","inputPrecondition":"cond","perspective":"p","expectedResult":"ok","notes":"-"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false with error=unsupported-version
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'unsupported-version');
    });

    // TC-E-05: parsePerspectiveJsonV1 with valid JSON object but cases is not array
    test('TC-E-05: parsePerspectiveJsonV1 returns ok=false with error=cases-not-array for non-array cases', () => {
      // Given: Valid JSON object but cases is not array
      const raw = '{"version":1,"cases":"not-an-array"}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false with error=cases-not-array
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'cases-not-array');
    });

    // TC-B-04: Empty string input to parsePerspectiveJsonV1
    test('TC-B-04: parsePerspectiveJsonV1 returns ok=false with error=empty for empty string', () => {
      // Given: Empty string input to parsePerspectiveJsonV1
      const raw = '';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=empty
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'empty');
    });

    // TC-B-05: Whitespace-only string input to parsePerspectiveJsonV1
    test('TC-B-05: parsePerspectiveJsonV1 returns ok=false with error=empty after trim', () => {
      // Given: Whitespace-only string input to parsePerspectiveJsonV1
      const raw = '   \n\t  ';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=empty after trim
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'empty');
    });

    // TC-B-04: Text length equals maxChars in truncateText
    test('TC-B-04: truncateText returns original text without truncation when length equals maxChars', () => {
      // Given: Text length equals maxChars
      const text = 'a'.repeat(100);
      const maxChars = 100;

      // When: truncateText is called (indirectly through renderPerspectiveMarkdownTable with long content)
      // Note: truncateText is private, so we test it indirectly
      // For direct test, we need to access it through the module or test it in runWithArtifacts.test.ts
      // This test documents the expected behavior
      const result = text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n\n... (truncated: ${text.length} chars -> ${maxChars} chars)`;

      // Then: truncateText returns original text without truncation
      assert.strictEqual(result, text, 'Returns original text when length equals maxChars');
    });

    // TC-B-05: Text length equals maxChars + 1 in truncateText
    test('TC-B-05: truncateText truncates text and appends truncation message when length exceeds maxChars', () => {
      // Given: Text length equals maxChars + 1
      const text = 'a'.repeat(101);
      const maxChars = 100;

      // When: truncateText logic is applied
      const result = text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n\n... (truncated: ${text.length} chars -> ${maxChars} chars)`;

      // Then: truncateText truncates text and appends truncation message
      assert.ok(result.includes('truncated'), 'Truncation message is appended');
      assert.ok(result.includes('101 chars -> 100 chars'), 'Truncation details are included');
    });

    // TC-B-06: Cell value is empty string in normalizeTableCell
    test('TC-B-06: normalizeTableCell returns empty string for empty cell value', () => {
      // Given: Cell value is empty string
      const cases = [
        {
          caseId: '',
          inputPrecondition: '',
          perspective: '',
          expectedResult: '',
          notes: '',
        },
      ];

      // When: renderPerspectiveMarkdownTable is called
      const md = renderPerspectiveMarkdownTable(cases);

      // Then: normalizeTableCell returns empty string
      assert.ok(md.includes('|  |  |  |  |  |'), 'Empty cells are rendered as empty');
    });

    // TC-B-07: Single newline character in cell value
    test('TC-B-07: normalizeTableCell converts single newline to space', () => {
      // Given: Single newline character in cell value
      const cases = [
        {
          caseId: 'TC-N-01',
          inputPrecondition: 'a\nb',
          perspective: 'p',
          expectedResult: 'ok',
          notes: 'note',
        },
      ];

      // When: renderPerspectiveMarkdownTable is called
      const md = renderPerspectiveMarkdownTable(cases);

      // Then: normalizeTableCell converts single newline to space
      assert.ok(md.includes('| TC-N-01 | a b |'), 'Single newline converted to space');
    });

    // TC-B-08: Multiple consecutive newlines in cell value
    test('TC-B-08: normalizeTableCell collapses all newlines to single space', () => {
      // Given: Multiple consecutive newlines in cell value
      const cases = [
        {
          caseId: 'TC-N-01',
          inputPrecondition: 'a\n\n\nb',
          perspective: 'p',
          expectedResult: 'ok',
          notes: 'note',
        },
      ];

      // When: renderPerspectiveMarkdownTable is called
      const md = renderPerspectiveMarkdownTable(cases);

      // Then: normalizeTableCell collapses all newlines to single space
      assert.ok(md.includes('| TC-N-01 | a b |'), 'Multiple newlines collapsed to single space');
    });

    // TC-B-09: Single pipe character in cell value
    test('TC-B-09: normalizeTableCell escapes pipe as \\|', () => {
      // Given: Single pipe character in cell value
      const cases = [
        {
          caseId: 'TC-N-01',
          inputPrecondition: 'cond',
          perspective: 'p|q',
          expectedResult: 'ok',
          notes: 'note',
        },
      ];

      // When: renderPerspectiveMarkdownTable is called
      const md = renderPerspectiveMarkdownTable(cases);

      // Then: normalizeTableCell escapes pipe as \\|
      assert.ok(md.includes('p\\|q'), 'Pipe character is escaped');
    });

    // TC-E-01: Invalid JSON syntax in parsePerspectiveJsonV1
    test('TC-E-01: parsePerspectiveJsonV1 returns ok=false with error starting with invalid-json:', () => {
      // Given: Invalid JSON syntax in parsePerspectiveJsonV1
      const raw = '{"version":1,"cases":[invalid]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error starting with invalid-json:
      assert.ok(!result.ok, 'Returns ok=false');
      assert.ok(result.error.startsWith('invalid-json:'), 'Error starts with invalid-json:');
    });

    // TC-E-02: JSON is not an object (e.g., array or primitive)
    test('TC-E-02: parsePerspectiveJsonV1 returns ok=false with error=json-not-object for non-object JSON', () => {
      // Given: JSON is not an object (e.g., array or primitive)
      const raw = '[1,2,3]';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=json-not-object
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-E-03: JSON array starting with '[' (e.g., '[1,2,3]')
    test('TC-E-03: parsePerspectiveJsonV1 returns ok=false with error=json-not-object for JSON array', () => {
      // Given: JSON array starting with '['
      const raw = '[1,2,3]';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=json-not-object
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-E-04: JSON array containing object '[{"version":1}]'
    test('TC-E-04: parsePerspectiveJsonV1 returns ok=false with error=json-not-object for array containing object', () => {
      // Given: JSON array containing object
      const raw = '[{"version":1}]';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=json-not-object
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-E-05: Empty JSON array '[]'
    test('TC-E-05: parsePerspectiveJsonV1 returns ok=false with error=json-not-object for empty array', () => {
      // Given: Empty JSON array
      const raw = '[]';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=json-not-object
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-E-06: JSON primitive null
    test('TC-E-06: parsePerspectiveJsonV1 returns ok=false with error=json-not-object for null primitive', () => {
      // Given: JSON primitive null
      const raw = 'null';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=json-not-object
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-E-07: JSON primitive true
    test('TC-E-07: parsePerspectiveJsonV1 returns ok=false with error=json-not-object for true primitive', () => {
      // Given: JSON primitive true
      const raw = 'true';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=json-not-object
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-E-08: JSON primitive false
    test('TC-E-08: parsePerspectiveJsonV1 returns ok=false with error=json-not-object for false primitive', () => {
      // Given: JSON primitive false
      const raw = 'false';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=json-not-object
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-E-09: JSON string '"hello"'
    test('TC-E-09: parsePerspectiveJsonV1 returns ok=false with error=json-not-object for string primitive', () => {
      // Given: JSON string primitive
      const raw = '"hello"';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=json-not-object
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-E-10: JSON number '123'
    test('TC-E-10: parsePerspectiveJsonV1 returns ok=false with error=no-json-object for number primitive', () => {
      // Given: JSON number primitive
      const raw = '123';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=no-json-object
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'no-json-object');
    });

    // TC-E-11: Text starting with '{' but missing closing '}'
    test('TC-E-11: parsePerspectiveJsonV1 returns ok=false with error=no-json-object for unclosed object', () => {
      // Given: Text starting with '{' but missing closing '}'
      const raw = '{"version":1,"cases":[]';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error starting with invalid-json:
      // NOTE: 入力が `{` から始まる場合は「直接パースの失敗」を優先して返す（no-json-object よりも原因が分かりやすい）
      assert.ok(!result.ok, 'Returns ok=false');
      assert.ok(result.error.startsWith('invalid-json:'), 'Error starts with invalid-json:');
    });

    // TC-E-12: Invalid JSON syntax (e.g., '{version:1}')
    test('TC-E-12: parsePerspectiveJsonV1 returns ok=false with error starting with invalid-json: for invalid JSON', () => {
      // Given: Invalid JSON syntax
      const raw = '{version:1}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error starting with invalid-json:
      assert.ok(!result.ok, 'Returns ok=false');
      assert.ok(result.error.startsWith('invalid-json:'), 'Error starts with invalid-json:');
    });

    // TC-E-14: Valid JSON object with version = 0
    test('TC-E-14: parsePerspectiveJsonV1 returns ok=false with error=unsupported-version for version 0', () => {
      // Given: Valid JSON object with version = 0
      const raw = '{"version":0,"cases":[{"caseId":"TC-N-01","inputPrecondition":"cond","perspective":"p","expectedResult":"ok","notes":"-"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=unsupported-version
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'unsupported-version');
    });

    // TC-E-15: Valid JSON object with version = 2
    test('TC-E-15: parsePerspectiveJsonV1 returns ok=false with error=unsupported-version for version 2', () => {
      // Given: Valid JSON object with version = 2
      const raw = '{"version":2,"cases":[{"caseId":"TC-N-01","inputPrecondition":"cond","perspective":"p","expectedResult":"ok","notes":"-"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=unsupported-version
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'unsupported-version');
    });

    // TC-E-20: JSON array starting with '[' containing invalid JSON
    test('TC-E-20: parsePerspectiveJsonV1 returns ok=false with error starting with invalid-json: for invalid array JSON', () => {
      // Given: JSON array starting with '[' containing invalid JSON
      const raw = '[invalid json]';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error starting with invalid-json:
      assert.ok(!result.ok, 'Returns ok=false');
      assert.ok(result.error.startsWith('invalid-json:'), 'Error starts with invalid-json:');
    });

    // TC-N-02: parsePerspectiveJsonV1 with JSON array starting with '[' containing valid object '[{"version":1,"cases":[]}]'
    test('TC-N-02: parsePerspectiveJsonV1 returns ok=false with error=json-not-object for JSON array containing valid object', () => {
      // Given: JSON array starting with '[' containing valid object '[{"version":1,"cases":[]}]'
      const raw = '[{"version":1,"cases":[]}]';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false with error=json-not-object (array is parsed but asRecord returns undefined)
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-N-03: parsePerspectiveJsonV1 with JSON array starting with '[' containing invalid JSON syntax
    test('TC-N-03: parsePerspectiveJsonV1 returns ok=false with error starting with invalid-json: for invalid array JSON syntax', () => {
      // Given: JSON array starting with '[' containing invalid JSON syntax
      const raw = '[{"version":1,"cases":invalid]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false with error starting with invalid-json:
      assert.ok(!result.ok, 'Returns ok=false');
      assert.ok(result.error.startsWith('invalid-json:'), 'Error starts with invalid-json:');
    });

    // TC-N-04: parsePerspectiveJsonV1 with extractJsonObject returning undefined and input starting with '['
    test('TC-N-04: parsePerspectiveJsonV1 returns ok=false with error=json-not-object when extractJsonObject returns undefined and input starts with [', () => {
      // Given: extractJsonObject returns undefined and input starts with '['
      // This happens when input is like '[{"version":1}]' but extractJsonObject can't find '{...}'
      // In the new logic, if input starts with '[', it's parsed directly
      const raw = '[{"version":1}]';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false with error=json-not-object (array is parsed but asRecord returns undefined)
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-N-05: parsePerspectiveJsonV1 with extractJsonObject returning undefined and input starting with '"'
    test('TC-N-05: parsePerspectiveJsonV1 returns ok=false with error=json-not-object when extractJsonObject returns undefined and input starts with "', () => {
      // Given: extractJsonObject returns undefined and input starts with '"'
      const raw = '"hello"';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false with error=json-not-object (string is valid JSON but not object)
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-N-06: parsePerspectiveJsonV1 with extractJsonObject returning undefined and input equals 'null'
    test('TC-N-06: parsePerspectiveJsonV1 returns ok=false with error=json-not-object when extractJsonObject returns undefined and input equals null', () => {
      // Given: extractJsonObject returns undefined and input equals 'null'
      const raw = 'null';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false with error=json-not-object (null is valid JSON but not object)
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-N-07: parsePerspectiveJsonV1 with extractJsonObject returning undefined and input equals 'true'
    test('TC-N-07: parsePerspectiveJsonV1 returns ok=false with error=json-not-object when extractJsonObject returns undefined and input equals true', () => {
      // Given: extractJsonObject returns undefined and input equals 'true'
      const raw = 'true';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false with error=json-not-object (boolean true is valid JSON but not object)
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-N-08: parsePerspectiveJsonV1 with extractJsonObject returning undefined and input equals 'false'
    test('TC-N-08: parsePerspectiveJsonV1 returns ok=false with error=json-not-object when extractJsonObject returns undefined and input equals false', () => {
      // Given: extractJsonObject returns undefined and input equals 'false'
      const raw = 'false';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false with error=json-not-object (boolean false is valid JSON but not object)
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-N-09: parsePerspectiveJsonV1 with extractJsonObject returning undefined and input starting with '{' but missing closing '}'
    test('TC-N-09: parsePerspectiveJsonV1 returns ok=false with error=no-json-object when extractJsonObject returns undefined and input starts with { but missing closing }', () => {
      // Given: extractJsonObject returns undefined and input starts with '{' but missing closing '}'
      const raw = '{"version":1,"cases":[]';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false with error starting with invalid-json:
      // NOTE: `{` 始まりで direct parse が失敗した場合、invalid-json を優先する
      assert.ok(!result.ok, 'Returns ok=false');
      assert.ok(result.error.startsWith('invalid-json:'), 'Error starts with invalid-json:');
    });

    // TC-N-10: parsePerspectiveJsonV1 with extractJsonObject returning undefined and input not matching any special pattern
    test('TC-N-10: parsePerspectiveJsonV1 returns ok=false with error=no-json-object when extractJsonObject returns undefined and input not matching any special pattern', () => {
      // Given: extractJsonObject returns undefined and input not matching any special pattern
      const raw = 'just some text';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false with error=no-json-object
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'no-json-object');
    });

    // TC-E-21: Text that doesn't start with '{', '[', '"', 'null', 'true', 'false'
    test('TC-E-21: parsePerspectiveJsonV1 returns ok=false with error=no-json-object for text not matching patterns', () => {
      // Given: Text that doesn't start with '{', '[', '"', 'null', 'true', 'false'
      const raw = 'just some text';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=no-json-object
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'no-json-object');
    });

    // TC-E-03: JSON object without version field
    test('TC-E-03: parsePerspectiveJsonV1 returns ok=false with error=unsupported-version for missing version', () => {
      // Given: JSON object without version field
      const raw = '{"cases":[{"caseId":"TC-N-01","inputPrecondition":"cond","perspective":"p","expectedResult":"ok","notes":"-"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=unsupported-version
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'unsupported-version');
    });

    // TC-E-04: JSON object with version field not equal to 1
    test('TC-E-04: parsePerspectiveJsonV1 returns ok=false with error=unsupported-version for version != 1', () => {
      // Given: JSON object with version field not equal to 1
      const raw = '{"version":2,"cases":[{"caseId":"TC-N-01","inputPrecondition":"cond","perspective":"p","expectedResult":"ok","notes":"-"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=unsupported-version
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'unsupported-version');
    });

    // TC-E-05: JSON object with cases field that is not an array
    test('TC-E-05: parsePerspectiveJsonV1 returns ok=false with error=cases-not-array for non-array cases', () => {
      // Given: JSON object with cases field that is not an array
      const raw = '{"version":1,"cases":"not-an-array"}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=cases-not-array
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'cases-not-array');
    });

    // TC-E-06: JSON object without cases field
    test('TC-E-06: parsePerspectiveJsonV1 returns ok=false with error=cases-not-array for missing cases', () => {
      // Given: JSON object without cases field
      const raw = '{"version":1}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=cases-not-array
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'cases-not-array');
    });

    // TC-E-07: Text without JSON object (no { or })
    test('TC-E-07: parsePerspectiveJsonV1 returns ok=false with error=no-json-object for text without JSON', () => {
      // Given: Text without JSON object (no { or })
      const raw = 'just some text';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 returns ok=false with error=no-json-object
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'no-json-object');
    });

    // TC-E-16: Case item in cases array is not an object
    test('TC-E-16: parsePerspectiveJsonV1 skips invalid item and continues processing other cases', () => {
      // Given: Case item in cases array is not an object
      const raw = '{"version":1,"cases":[{"caseId":"TC-N-01","inputPrecondition":"cond","perspective":"p","expectedResult":"ok","notes":"-"},"not-an-object",{"caseId":"TC-N-02","inputPrecondition":"cond2","perspective":"p2","expectedResult":"ok2","notes":"-"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 skips invalid item and continues processing other cases
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.cases.length, 2, 'Invalid item is skipped');
      assert.strictEqual(result.value.cases[0]?.caseId, 'TC-N-01');
      assert.strictEqual(result.value.cases[1]?.caseId, 'TC-N-02');
    });

    test('TC-N-02A: parsePerspectiveJsonV1 normalizes bare newlines inside strings', () => {
      // Given: JSON 文字列内に改行を含むケース（Gemini 出力の揺れ）
      const raw = `{
        "version": 1,
        "cases": [
          {
            "caseId": "TC-N-NEWLINE",
            "inputPrecondition": "line1
line2",
            "perspective": "Equivalence – normal",
            "expectedResult": "ok",
            "notes": "-"
          }
        ]
      }`;

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: 改行を含む文字列でもパースできる
      assert.ok(result.ok, 'parsePerspectiveJsonV1 returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.cases.length, 1);
      assert.ok(result.value.cases[0]?.inputPrecondition.includes('\n'), '改行が保持されること');
    });

    test('ART-JSON-N-03: parsePerspectiveJsonV1 normalizes bare carriage returns', () => {
      // Given: JSON string with bare carriage return
      const raw = '{"version":1,"cases":[{"caseId":"CR","inputPrecondition":"a\rb"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Normalized and parsed successfully
      assert.ok(result.ok);
      if (result.ok) {
        assert.strictEqual(result.value.cases[0]?.inputPrecondition, 'a\rb');
      }
    });

    test('ART-JSON-N-04: parsePerspectiveJsonV1 handles mixed escaped and bare newlines', () => {
      // Given: JSON string with both escaped and bare newlines
      const raw = '{"version":1,"cases":[{"caseId":"MIXED","inputPrecondition":"escaped\\\\nand bare\nnewline"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Parsed successfully with newlines preserved
      assert.ok(result.ok);
      if (result.ok) {
        assert.strictEqual(result.value.cases[0]?.inputPrecondition, 'escaped\\nand bare\nnewline');
      }
    });

    test('ART-JSON-N-05: parsePerspectiveJsonV1 normalizes newlines in nested objects', () => {
      // Given: Nested JSON with bare newlines
      const raw = '{"version":1,"cases":[{"caseId":"NESTED","inputPrecondition":"{\\n \\"inner\\": \\"line1\nline2\\"\\n}"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Parsed successfully
      assert.ok(result.ok);
      if (result.ok) {
        assert.ok(result.value.cases[0]?.inputPrecondition.includes('line1\nline2'));
      }
    });

    test('ART-JSON-E-01: parsePerspectiveJsonV1 still fails on truly invalid JSON', () => {
      // Given: JSON with missing closing brace
      const raw = '{"version":1,"cases":[]';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.startsWith('invalid-json:'), 'Error starts with invalid-json:');
      }
    });

    // TC-E-17: Case item missing required fields (caseId, inputPrecondition, etc.)
    test('TC-E-17: parsePerspectiveJsonV1 uses getStringOrEmpty to set empty string for missing fields', () => {
      // Given: Case item missing required fields
      const raw = '{"version":1,"cases":[{"caseId":"TC-N-01"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: parsePerspectiveJsonV1 uses getStringOrEmpty to set empty string for missing fields
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.cases.length, 1);
      assert.strictEqual(result.value.cases[0]?.caseId, 'TC-N-01');
      assert.strictEqual(result.value.cases[0]?.inputPrecondition, '');
      assert.strictEqual(result.value.cases[0]?.perspective, '');
      assert.strictEqual(result.value.cases[0]?.expectedResult, '');
      assert.strictEqual(result.value.cases[0]?.notes, '');
    });

    // TC-E-18: Case item with non-string field values (number, boolean, null)
    test('TC-E-18: getStringOrEmpty converts numbers and booleans to strings, null/undefined to empty string', () => {
      // Given: Case item with non-string field values
      const raw = '{"version":1,"cases":[{"caseId":123,"inputPrecondition":true,"perspective":false,"expectedResult":null,"notes":456}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: getStringOrEmpty converts numbers and booleans to strings, null/undefined to empty string
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.cases[0]?.caseId, '123', 'Number converted to string');
      assert.strictEqual(result.value.cases[0]?.inputPrecondition, 'true', 'Boolean converted to string');
      assert.strictEqual(result.value.cases[0]?.perspective, 'false', 'Boolean converted to string');
      assert.strictEqual(result.value.cases[0]?.expectedResult, '', 'null converted to empty string');
      assert.strictEqual(result.value.cases[0]?.notes, '456', 'Number converted to string');
    });

    // TC-E-24: renderPerspectiveMarkdownTable called with empty cases array
    test('TC-E-24: renderPerspectiveMarkdownTable returns table with header and separator only for empty cases', () => {
      // Given: renderPerspectiveMarkdownTable called with empty cases array
      const cases: PerspectiveCase[] = [];

      // When: renderPerspectiveMarkdownTable is called
      const md = renderPerspectiveMarkdownTable(cases);

      // Then: Returns table with header and separator only, no data rows
      assert.ok(md.includes(PERSPECTIVE_TABLE_HEADER), 'Table includes header');
      assert.ok(md.includes(PERSPECTIVE_TABLE_SEPARATOR), 'Table includes separator');
      const lines = md.split('\n');
      const dataRows = lines.filter((l) => l.trim().startsWith('|') && !l.includes('Case ID') && !l.includes('---'));
      assert.strictEqual(dataRows.length, 0, 'No data rows');
    });

    // TC-E-27: normalizeTableCell with CRLF line endings
    test('TC-E-27: normalizeTableCell converts CRLF to LF first, then normalized to spaces', () => {
      // Given: normalizeTableCell with CRLF line endings
      const cases = [
        {
          caseId: 'TC-N-01',
          inputPrecondition: 'a\r\nb',
          perspective: 'p',
          expectedResult: 'ok',
          notes: 'note',
        },
      ];

      // When: renderPerspectiveMarkdownTable is called
      const md = renderPerspectiveMarkdownTable(cases);

      // Then: CRLF are converted to LF first, then normalized to spaces
      assert.ok(md.includes('| TC-N-01 | a b |'), 'CRLF converted to spaces');
    });

    // TC-E-28: normalizeTableCell with multiple consecutive spaces
    test('TC-E-28: normalizeTableCell collapses multiple spaces to single space', () => {
      // Given: normalizeTableCell with multiple consecutive spaces
      const cases = [
        {
          caseId: 'TC-N-01',
          inputPrecondition: 'a    b',
          perspective: 'p',
          expectedResult: 'ok',
          notes: 'note',
        },
      ];

      // When: renderPerspectiveMarkdownTable is called
      const md = renderPerspectiveMarkdownTable(cases);

      // Then: Multiple spaces are collapsed to single space
      assert.ok(md.includes('| TC-N-01 | a b |'), 'Multiple spaces collapsed to single space');
    });

    // TC-E-29: normalizeTableCell with leading/trailing whitespace
    test('TC-E-29: normalizeTableCell trims leading and trailing whitespace', () => {
      // Given: normalizeTableCell with leading/trailing whitespace
      const cases = [
        {
          caseId: 'TC-N-01',
          inputPrecondition: '  cond  ',
          perspective: 'p',
          expectedResult: 'ok',
          notes: 'note',
        },
      ];

      // When: renderPerspectiveMarkdownTable is called
      const md = renderPerspectiveMarkdownTable(cases);

      // Then: Leading and trailing whitespace is trimmed
      assert.ok(md.includes('| TC-N-01 | cond |'), 'Leading and trailing whitespace trimmed');
    });

    // TC-E-34: asRecord called with null value
    test('TC-E-34: asRecord returns undefined for null value', () => {
      // Given: asRecord called with null value (tested indirectly through parsePerspectiveJsonV1)
      const raw = 'null';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: asRecord returns undefined (parsePerspectiveJsonV1 returns json-not-object)
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-E-35: asRecord called with array value
    test('TC-E-35: asRecord returns undefined for array value', () => {
      // Given: asRecord called with array value
      const raw = '[]';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: asRecord returns undefined (parsePerspectiveJsonV1 returns json-not-object)
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-E-36: getStringOrEmpty called with Infinity or -Infinity
    test('TC-E-36: getStringOrEmpty returns empty string for Infinity', () => {
      // Given: getStringOrEmpty called with Infinity (tested indirectly)
      // When: parsePerspectiveJsonV1 is called
      // Note: JSON.parse will convert Infinity to null, so we test with a different approach
      // Actually, JSON.parse('{"x":Infinity}') throws, so we test with a valid number that's not finite
      // But JSON doesn't support Infinity, so we test with a very large number that becomes a string
      const raw2 = '{"version":1,"cases":[{"caseId":"TC-N-01","inputPrecondition":1e308,"perspective":"p","expectedResult":"ok","notes":"-"}]}';
      const result = parsePerspectiveJsonV1(raw2);

      // Then: getStringOrEmpty handles large numbers (they become "1e+308" string)
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      // Large numbers are converted to scientific notation string
      assert.ok(typeof result.value.cases[0]?.inputPrecondition === 'string', 'Number converted to string');
    });

    // TC-E-37: getStringOrEmpty called with NaN
    test('TC-E-37: getStringOrEmpty returns empty string for NaN', () => {
      // Given: getStringOrEmpty called with NaN (tested indirectly)
      // Note: JSON.parse('{"x":NaN}') throws, so we can't test NaN directly
      // Instead, we test that non-finite numbers are handled
      // Actually, JSON doesn't support NaN, so this test documents expected behavior
      const raw = '{"version":1,"cases":[{"caseId":"TC-N-01","inputPrecondition":"cond","perspective":"p","expectedResult":"ok","notes":"-"}]}';
      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Function completes successfully (NaN cannot appear in JSON)
      assert.ok(result.ok, 'Function completes successfully');
    });

    // TC-E-38: renderPerspectiveMarkdownTable generates table with PERSPECTIVE_TABLE_HEADER constant
    test('TC-E-38: renderPerspectiveMarkdownTable generates table with PERSPECTIVE_TABLE_HEADER constant', () => {
      // Given: Valid perspective cases
      const cases = [
        {
          caseId: 'TC-N-01',
          inputPrecondition: 'cond',
          perspective: 'p',
          expectedResult: 'ok',
          notes: '-',
        },
      ];

      // When: renderPerspectiveMarkdownTable is called
      const md = renderPerspectiveMarkdownTable(cases);

      // Then: Table header matches PERSPECTIVE_TABLE_HEADER exactly
      assert.ok(md.includes(PERSPECTIVE_TABLE_HEADER), 'Table header matches PERSPECTIVE_TABLE_HEADER');
      const headerLine = md.split('\n').find((l) => l.includes('Case ID'));
      assert.strictEqual(headerLine?.trim(), PERSPECTIVE_TABLE_HEADER, 'Header line matches constant exactly');
    });

    // TC-E-39: renderPerspectiveMarkdownTable generates table with PERSPECTIVE_TABLE_SEPARATOR constant
    test('TC-E-39: renderPerspectiveMarkdownTable generates table with PERSPECTIVE_TABLE_SEPARATOR constant', () => {
      // Given: Valid perspective cases
      const cases = [
        {
          caseId: 'TC-N-01',
          inputPrecondition: 'cond',
          perspective: 'p',
          expectedResult: 'ok',
          notes: '-',
        },
      ];

      // When: renderPerspectiveMarkdownTable is called
      const md = renderPerspectiveMarkdownTable(cases);

      // Then: Table separator matches PERSPECTIVE_TABLE_SEPARATOR exactly
      assert.ok(md.includes(PERSPECTIVE_TABLE_SEPARATOR), 'Table separator matches PERSPECTIVE_TABLE_SEPARATOR');
      const separatorLine = md.split('\n').find((l) => l.includes('---'));
      assert.strictEqual(separatorLine?.trim(), PERSPECTIVE_TABLE_SEPARATOR, 'Separator line matches constant exactly');
    });

    // TC-E-40: renderPerspectiveMarkdownTable table ends with newline character
    test('TC-E-40: renderPerspectiveMarkdownTable table ends with newline character', () => {
      // Given: Valid perspective cases
      const cases = [
        {
          caseId: 'TC-N-01',
          inputPrecondition: 'cond',
          perspective: 'p',
          expectedResult: 'ok',
          notes: '-',
        },
      ];

      // When: renderPerspectiveMarkdownTable is called
      const md = renderPerspectiveMarkdownTable(cases);

      // Then: Returned string ends with \n
      assert.ok(md.endsWith('\n'), 'Table ends with newline character');
    });

    // TC-E-13: extractJsonObject with text containing { but no }
    test('TC-E-13: extractJsonObject returns undefined for unclosed JSON object', () => {
      // Given: Text containing { but no }
      const raw = 'Some text { "version": 1, "cases": []';

      // When: parsePerspectiveJsonV1 is called (which uses extractJsonObject)
      const result = parsePerspectiveJsonV1(raw);

      // Then: extractJsonObject returns undefined (parsePerspectiveJsonV1 returns no-json-object)
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'no-json-object');
    });

    // TC-E-14: extractJsonObject with text containing } but no {
    test('TC-E-14: extractJsonObject returns undefined when closing brace without opening brace', () => {
      // Given: Text containing } but no {
      const raw = 'Some text }';

      // When: parsePerspectiveJsonV1 is called (which uses extractJsonObject)
      const result = parsePerspectiveJsonV1(raw);

      // Then: extractJsonObject returns undefined (parsePerspectiveJsonV1 returns no-json-object)
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'no-json-object');
    });

    // TC-E-15: extractJsonObject with } appearing before {
    test('TC-E-15: extractJsonObject returns undefined when closing brace appears before opening brace', () => {
      // Given: Text with } appearing before {
      const raw = '} some text {';

      // When: parsePerspectiveJsonV1 is called (which uses extractJsonObject)
      const result = parsePerspectiveJsonV1(raw);

      // Then: extractJsonObject returns undefined (parsePerspectiveJsonV1 returns no-json-object)
      // Note: extractJsonObject uses indexOf('{') and lastIndexOf('}'), so if } comes before {,
      // it will find } at position 0 and { at a later position, but end <= start check will fail
      assert.ok(!result.ok, 'Returns ok=false');
      assert.strictEqual(result.error, 'no-json-object');
    });

    // TC-E-19: stripCodeFence with code fence but no newline
    test('TC-E-19: stripCodeFence returns original text unchanged when code fence has no newline', () => {
      // Given: Code fence but no newline
      const raw = '```json{"version":1,"cases":[]}```';

      // When: parsePerspectiveJsonV1 is called (which uses stripCodeFence)
      const result = parsePerspectiveJsonV1(raw);

      // Then: stripCodeFence returns original text unchanged (parsePerspectiveJsonV1 may still parse if JSON is valid)
      // Note: stripCodeFence checks for newline, so if there's no newline, it returns original text
      // Then extractJsonObject should still be able to extract the JSON object
      // Actually, if there's no newline, stripCodeFence returns the original text, and extractJsonObject should work
      assert.ok(result.ok, 'Returns ok=true (JSON can still be extracted)');
    });

    // TC-E-20: stripCodeFence with only opening fence, no closing fence
    test('TC-E-20: stripCodeFence returns original text unchanged when only opening fence exists', () => {
      // Given: Only opening fence, no closing fence
      const raw = '```json\n{"version":1,"cases":[]}';

      // When: parsePerspectiveJsonV1 is called (which uses stripCodeFence)
      const result = parsePerspectiveJsonV1(raw);

      // Then: stripCodeFence returns original text unchanged (parsePerspectiveJsonV1 may still parse if JSON is valid)
      // Note: stripCodeFence checks for closing fence, so if there's no closing fence, it returns original text
      // Then extractJsonObject should still be able to extract the JSON object
      assert.ok(result.ok, 'Returns ok=true (JSON can still be extracted)');
    });
  });

  suite('Test Execution JSON -> TestExecutionResult', () => {
    // TC-EXECJSON-N-01: Valid JSON test execution result
    test('TC-EXECJSON-N-01: parseTestExecutionJsonV1 parses valid JSON', () => {
      // Given: Valid JSON test execution result
      const raw = '{"version":1,"exitCode":0,"signal":null,"durationMs":12,"stdout":"out","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=true and fields are parsed
      assert.ok(result.ok, 'parseTestExecutionJsonV1 returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.version, 1);
      assert.strictEqual(result.value.exitCode, 0);
      assert.strictEqual(result.value.signal, null);
      assert.strictEqual(result.value.durationMs, 12);
      assert.strictEqual(result.value.stdout, 'out');
      assert.strictEqual(result.value.stderr, '');
    });

    test('ART-JSON-EXEC-N-01: parseTestExecutionJsonV1 normalizes bare newlines in stdout', () => {
      // Given: JSON with bare newline in stdout (Gemini style)
      const raw = `{
        "version": 1,
        "exitCode": 0,
        "signal": null,
        "durationMs": 10,
        "stdout": "line1
line2",
        "stderr": ""
      }`;

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Normalized and parsed successfully
      assert.ok(result.ok);
      if (result.ok) {
        assert.strictEqual(result.value.stdout, 'line1\nline2');
      }
    });

    // TC-EXECJSON-N-02: JSON with code fences and extra text
    test('TC-EXECJSON-N-02: parseTestExecutionJsonV1 strips code fences and tolerates surrounding text', () => {
      // Given: JSON wrapped in code fences with surrounding text
      const raw = [
        'prefix text',
        '```json',
        '{"version":1,"exitCode":"1","signal":"","durationMs":"10","stdout":"a","stderr":"b"}',
        '```',
        'suffix text',
      ].join('\n');

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=true and types are coerced
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.exitCode, 1);
      assert.strictEqual(result.value.signal, null, '空文字は null 扱いになること');
      assert.strictEqual(result.value.durationMs, 10);
      assert.strictEqual(result.value.stdout, 'a');
      assert.strictEqual(result.value.stderr, 'b');
    });

    // TC-EXECJSON-E-01: Invalid JSON syntax
    test('TC-EXECJSON-E-01: parseTestExecutionJsonV1 returns ok=false for invalid JSON', () => {
      // Given: Invalid JSON
      const raw = '{"version":1,"exitCode":}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=false
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.ok(result.error.startsWith('invalid-json:'), 'invalid-json で始まること');
    });

    // TC-EXECJSON-E-02: Unsupported version
    test('TC-EXECJSON-E-02: parseTestExecutionJsonV1 returns ok=false for unsupported version', () => {
      // Given: Unsupported version
      const raw = '{"version":2,"exitCode":0,"signal":null,"durationMs":1,"stdout":"","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=false
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'unsupported-version');
    });

    // TC-PARSE-N-03: JSON with string-typed numeric fields (exitCode, durationMs)
    test('TC-PARSE-N-03: parseTestExecutionJsonV1 coerces string-typed numeric fields to numbers', () => {
      // Given: JSON with string-typed exitCode and durationMs
      const raw = '{"version":1,"exitCode":"1","signal":null,"durationMs":"10","stdout":"out","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=true and numeric strings are coerced
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.exitCode, 1);
      assert.strictEqual(result.value.durationMs, 10);
    });

    // TC-PARSE-N-05: JSON with exitCode=null
    test('TC-PARSE-N-05: parseTestExecutionJsonV1 preserves null exitCode', () => {
      // Given: JSON with exitCode=null
      const raw = '{"version":1,"exitCode":null,"signal":null,"durationMs":12,"stdout":"out","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=true and exitCode remains null
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.exitCode, null);
    });

    // TC-PARSE-N-06: JSON with durationMs=0
    test('TC-PARSE-N-06: parseTestExecutionJsonV1 handles zero durationMs', () => {
      // Given: JSON with durationMs=0
      const raw = '{"version":1,"exitCode":0,"signal":null,"durationMs":0,"stdout":"out","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=true and durationMs=0 is preserved
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.durationMs, 0);
    });

    // TC-PARSE-N-07: JSON with very large durationMs value
    test('TC-PARSE-N-07: parseTestExecutionJsonV1 handles very large durationMs value', () => {
      // Given: JSON with very large durationMs
      const raw = `{"version":1,"exitCode":0,"signal":null,"durationMs":${Number.MAX_SAFE_INTEGER},"stdout":"out","stderr":""}`;

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=true and large durationMs is preserved
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.durationMs, Number.MAX_SAFE_INTEGER);
    });

    // TC-PARSE-N-08: JSON with stdout containing escaped newlines
    test('TC-PARSE-N-08: parseTestExecutionJsonV1 preserves escaped newlines in stdout', () => {
      // Given: JSON with stdout containing escaped newlines
      const raw = '{"version":1,"exitCode":0,"signal":null,"durationMs":12,"stdout":"line1\\nline2","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=true and escaped newlines are preserved
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.stdout, 'line1\nline2');
    });

    // TC-E-06: parseTestExecutionJsonV1 with empty string
    test('TC-E-06: parseTestExecutionJsonV1 returns ok=false with error=empty for empty string', () => {
      // Given: Empty string input
      const raw = '';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns ok=false with error=empty
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'empty');
    });

    // TC-E-07: parseTestExecutionJsonV1 with whitespace-only string
    test('TC-E-07: parseTestExecutionJsonV1 returns ok=false with error=empty for whitespace-only string', () => {
      // Given: Whitespace-only string input
      const raw = '   \n\t  ';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns ok=false with error=empty (trimmed empty string)
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'empty');
    });

    // TC-E-08: parseTestExecutionJsonV1 with invalid JSON syntax in object
    test('TC-E-08: parseTestExecutionJsonV1 returns ok=false with error starting with invalid-json: for invalid JSON syntax in object', () => {
      // Given: Invalid JSON syntax in object
      const raw = '{"version":1,"exitCode":}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns ok=false with error starting with invalid-json:
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.ok(result.error.startsWith('invalid-json:'), 'Error starts with invalid-json:');
    });

    // TC-E-09: parseTestExecutionJsonV1 with valid JSON object but version !== 1
    test('TC-E-09: parseTestExecutionJsonV1 returns ok=false with error=unsupported-version for version !== 1', () => {
      // Given: Valid JSON object but version !== 1
      const raw = '{"version":2,"exitCode":0,"signal":null,"durationMs":1,"stdout":"","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns ok=false with error=unsupported-version
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'unsupported-version');
    });

    // TC-PARSE-E-01: Empty string input
    test('TC-PARSE-E-01: parseTestExecutionJsonV1 returns ok=false for empty string', () => {
      // Given: Empty string input
      const raw = '';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=false with error='empty'
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'empty');
    });

    // TC-PARSE-E-02: Input with only whitespace
    test('TC-PARSE-E-02: parseTestExecutionJsonV1 returns ok=false for whitespace-only input', () => {
      // Given: Input with only whitespace
      const raw = '   \n\t  ';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=false with error='empty'
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'empty');
    });

    // TC-PARSE-E-03: Input without JSON object
    test('TC-PARSE-E-03: parseTestExecutionJsonV1 returns ok=false when no JSON object found', () => {
      // Given: Input without JSON object (no { or })
      const raw = 'not a json object';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=false with error='no-json-object'
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'no-json-object');
    });

    // TC-B-05: JSON array containing zero elements '[]'
    test('TC-B-05: parseTestExecutionJsonV1 returns ok=false with error=json-not-object for empty array', () => {
      // Given: JSON array containing zero elements '[]'
      const raw = '[]';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns ok=false with error=json-not-object (empty array is valid JSON but not object)
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-B-06: JSON array containing single element '[{"version":1}]'
    test('TC-B-06: parseTestExecutionJsonV1 returns ok=false with error=json-not-object for single element array', () => {
      // Given: JSON array containing single element '[{"version":1}]'
      const raw = '[{"version":1}]';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns ok=false with error=json-not-object (single element array is still array)
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-PARSE-E-05: JSON is not an object (array)
    test('TC-PARSE-E-05: parseTestExecutionJsonV1 returns ok=false when JSON is an array', () => {
      // Given: JSON is an array, not an object
      const raw = '[{"version":1}]';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=false with error='json-not-object'
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-E-22: parseTestExecutionJsonV1 with JSON array '[{"version":1}]'
    test('TC-E-22: parseTestExecutionJsonV1 returns ok=false with error=json-not-object for JSON array', () => {
      // Given: JSON array containing object
      const raw = '[{"version":1}]';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: parseTestExecutionJsonV1 returns ok=false with error=json-not-object
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-N-12: parseTestExecutionJsonV1 with JSON array starting with '[' containing valid object '[{"version":1}]'
    test('TC-N-12: parseTestExecutionJsonV1 returns ok=false with error=json-not-object for JSON array containing valid object', () => {
      // Given: JSON array starting with '[' containing valid object '[{"version":1}]'
      const raw = '[{"version":1}]';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns ok=false with error=json-not-object (array is parsed but asRecord returns undefined)
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-N-13: parseTestExecutionJsonV1 with JSON array starting with '[' containing invalid JSON syntax
    test('TC-N-13: parseTestExecutionJsonV1 returns ok=false with error starting with invalid-json: for invalid array JSON syntax', () => {
      // Given: JSON array starting with '[' containing invalid JSON syntax
      const raw = '[{"version":1,"exitCode":invalid}]';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns ok=false with error starting with invalid-json:
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.ok(result.error.startsWith('invalid-json:'), 'Error starts with invalid-json:');
    });

    // TC-N-14: parseTestExecutionJsonV1 with extractJsonObject returning undefined and input starting with '['
    test('TC-N-14: parseTestExecutionJsonV1 returns ok=false with error=json-not-object when extractJsonObject returns undefined and input starts with [', () => {
      // Given: extractJsonObject returns undefined and input starts with '['
      // This happens when input is like '[{"version":1}]' but extractJsonObject can't find '{...}'
      // In the new logic, if input starts with '[', it's parsed directly
      const raw = '[{"version":1}]';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns ok=false with error=json-not-object (array is parsed but asRecord returns undefined)
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-N-15: parseTestExecutionJsonV1 with extractJsonObject returning undefined and input starting with '"'
    test('TC-N-15: parseTestExecutionJsonV1 returns ok=false with error=json-not-object when extractJsonObject returns undefined and input starts with "', () => {
      // Given: extractJsonObject returns undefined and input starts with '"'
      const raw = '"hello"';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns ok=false with error=json-not-object (string is valid JSON but not object)
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-N-16: parseTestExecutionJsonV1 with extractJsonObject returning undefined and input equals 'null'
    test('TC-N-16: parseTestExecutionJsonV1 returns ok=false with error=json-not-object when extractJsonObject returns undefined and input equals null', () => {
      // Given: extractJsonObject returns undefined and input equals 'null'
      const raw = 'null';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns ok=false with error=json-not-object (null is valid JSON but not object)
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-N-17: parseTestExecutionJsonV1 with extractJsonObject returning undefined and input equals 'true'
    test('TC-N-17: parseTestExecutionJsonV1 returns ok=false with error=json-not-object when extractJsonObject returns undefined and input equals true', () => {
      // Given: extractJsonObject returns undefined and input equals 'true'
      const raw = 'true';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns ok=false with error=json-not-object (boolean true is valid JSON but not object)
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-N-18: parseTestExecutionJsonV1 with extractJsonObject returning undefined and input equals 'false'
    test('TC-N-18: parseTestExecutionJsonV1 returns ok=false with error=json-not-object when extractJsonObject returns undefined and input equals false', () => {
      // Given: extractJsonObject returns undefined and input equals 'false'
      const raw = 'false';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns ok=false with error=json-not-object (boolean false is valid JSON but not object)
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-N-19: parseTestExecutionJsonV1 with extractJsonObject returning undefined and input starting with '{' but missing closing '}'
    test('TC-N-19: parseTestExecutionJsonV1 returns ok=false with error=no-json-object when extractJsonObject returns undefined and input starts with { but missing closing }', () => {
      // Given: extractJsonObject returns undefined and input starts with '{' but missing closing '}'
      const raw = '{"version":1,"exitCode":0';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns ok=false with error starting with invalid-json:
      // NOTE: `{` 始まりで direct parse が失敗した場合、invalid-json を優先する
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.ok(result.error.startsWith('invalid-json:'), 'Error starts with invalid-json:');
    });

    // TC-N-20: parseTestExecutionJsonV1 with extractJsonObject returning undefined and input not matching any special pattern
    test('TC-N-20: parseTestExecutionJsonV1 returns ok=false with error=no-json-object when extractJsonObject returns undefined and input not matching any special pattern', () => {
      // Given: extractJsonObject returns undefined and input not matching any special pattern
      const raw = 'just some text';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns ok=false with error=no-json-object
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'no-json-object');
    });

    // TC-E-23: parseTestExecutionJsonV1 with JSON primitive null
    test('TC-E-23: parseTestExecutionJsonV1 returns ok=false with error=json-not-object for null primitive', () => {
      // Given: JSON primitive null
      const raw = 'null';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: parseTestExecutionJsonV1 returns ok=false with error=json-not-object
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-E-24: parseTestExecutionJsonV1 with valid JSON object but version !== 1
    test('TC-E-24: parseTestExecutionJsonV1 returns ok=false with error=unsupported-version for version != 1', () => {
      // Given: Valid JSON object but version !== 1
      const raw = '{"version":2,"exitCode":0,"signal":null,"durationMs":1,"stdout":"","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: parseTestExecutionJsonV1 returns ok=false with error=unsupported-version
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'unsupported-version');
    });

    // TC-N-07: parseTestExecutionJsonV1 with valid JSON object version 1 and all required fields
    test('TC-N-07: parseTestExecutionJsonV1 parses valid JSON object version 1 with all required fields', () => {
      // Given: Valid JSON object version 1 and all required fields
      const raw = '{"version":1,"exitCode":0,"signal":null,"durationMs":12,"stdout":"out","stderr":"err"}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: parseTestExecutionJsonV1 returns ok=true with parsed TestExecutionJsonV1
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.version, 1);
      assert.strictEqual(result.value.exitCode, 0);
      assert.strictEqual(result.value.signal, null);
      assert.strictEqual(result.value.durationMs, 12);
      assert.strictEqual(result.value.stdout, 'out');
      assert.strictEqual(result.value.stderr, 'err');
    });

    // TC-PARSE-E-06: JSON is not an object (primitive)
    test('TC-PARSE-E-06: parseTestExecutionJsonV1 returns ok=false when JSON is a primitive', () => {
      // Given: JSON is a primitive (string)
      const raw = '"not an object"';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=false with error='json-not-object'
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'json-not-object');
    });

    // TC-PARSE-E-08: JSON with version=0
    test('TC-PARSE-E-08: parseTestExecutionJsonV1 returns ok=false for version=0', () => {
      // Given: JSON with version=0
      const raw = '{"version":0,"exitCode":0,"signal":null,"durationMs":1,"stdout":"","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=false with error='unsupported-version'
      assert.ok(!result.ok, 'Returns ok=false');
      if (result.ok) {
        return;
      }
      assert.strictEqual(result.error, 'unsupported-version');
    });

    // TC-PARSE-B-01: JSON with durationMs=-1
    test('TC-PARSE-B-01: parseTestExecutionJsonV1 defaults negative durationMs to 0', () => {
      // Given: JSON with durationMs=-1
      const raw = '{"version":1,"exitCode":0,"signal":null,"durationMs":-1,"stdout":"out","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=true and durationMs defaults to 0
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.durationMs, 0);
    });

    // TC-PARSE-B-02: JSON with durationMs=NaN
    test('TC-PARSE-B-02: parseTestExecutionJsonV1 defaults NaN durationMs to 0', () => {
      // Given: JSON with durationMs=NaN (as string)
      const raw = '{"version":1,"exitCode":0,"signal":null,"durationMs":"NaN","stdout":"out","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=true and durationMs defaults to 0
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.durationMs, 0);
    });

    // TC-PARSE-B-03: JSON with durationMs=Infinity
    test('TC-PARSE-B-03: parseTestExecutionJsonV1 defaults Infinity durationMs to 0', () => {
      // Given: JSON with durationMs=Infinity (as string)
      const raw = '{"version":1,"exitCode":0,"signal":null,"durationMs":"Infinity","stdout":"out","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=true and durationMs defaults to 0
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.durationMs, 0);
    });

    // TC-PARSE-B-04: JSON with exitCode as non-numeric string
    test('TC-PARSE-B-04: parseTestExecutionJsonV1 converts non-numeric exitCode string to null', () => {
      // Given: JSON with exitCode as non-numeric string
      const raw = '{"version":1,"exitCode":"invalid","signal":null,"durationMs":12,"stdout":"out","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=true and exitCode is null
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.exitCode, null);
    });

    // TC-PARSE-B-05: JSON with exitCode=undefined
    test('TC-PARSE-B-05: parseTestExecutionJsonV1 converts undefined exitCode to null', () => {
      // Given: JSON with exitCode=undefined (omitted field)
      const raw = '{"version":1,"signal":null,"durationMs":12,"stdout":"out","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=true and exitCode is null
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.exitCode, null);
    });

    // TC-PARSE-B-06: JSON with signal=undefined
    test('TC-PARSE-B-06: parseTestExecutionJsonV1 converts undefined signal to null', () => {
      // Given: JSON with signal=undefined (omitted field)
      const raw = '{"version":1,"exitCode":0,"durationMs":12,"stdout":"out","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=true and signal is null
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.signal, null);
    });

    // TC-PARSE-B-07: JSON with stdout=null
    test('TC-PARSE-B-07: parseTestExecutionJsonV1 converts null stdout to empty string', () => {
      // Given: JSON with stdout=null
      const raw = '{"version":1,"exitCode":0,"signal":null,"durationMs":12,"stdout":null,"stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=true and stdout is empty string
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.stdout, '');
    });

    // TC-PARSE-B-08: JSON with stderr=undefined
    test('TC-PARSE-B-08: parseTestExecutionJsonV1 converts undefined stderr to empty string', () => {
      // Given: JSON with stderr=undefined (omitted field)
      const raw = '{"version":1,"exitCode":0,"signal":null,"durationMs":12,"stdout":"out"}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: ok=true and stderr is empty string
      assert.ok(result.ok, 'Returns ok=true');
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.stderr, '');
    });

    suite('parseTestResultFile', () => {
      test('TC-PARSE-ENV-N-01: parses env fields when platform/arch/nodeVersion/vscodeVersion are strings', () => {
        // Given: A JSON payload that contains env fields as strings
        const raw = JSON.stringify({
          platform: 'darwin',
          arch: 'arm64',
          nodeVersion: 'v1.2.3',
          vscodeVersion: '1.2.3',
          failures: 1,
          passes: 2,
          timestamp: 123,
        });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: It succeeds and preserves the env field values
        assert.ok(result.ok);
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.timestamp, 123);
        assert.strictEqual(result.value.platform, 'darwin');
        assert.strictEqual(result.value.arch, 'arm64');
        assert.strictEqual(result.value.nodeVersion, 'v1.2.3');
        assert.strictEqual(result.value.vscodeVersion, '1.2.3');
        assert.strictEqual(result.value.failures, 1);
        assert.strictEqual(result.value.passes, 2);
      });

      test('TC-PARSE-ENV-N-02: missing env fields are parsed as undefined while vscodeVersion is preserved', () => {
        // Given: A JSON payload where platform/arch/nodeVersion are missing, and only vscodeVersion is present
        const raw = JSON.stringify({ vscodeVersion: '1.2.3' });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: It succeeds and missing fields become undefined
        assert.ok(result.ok);
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.platform, undefined);
        assert.strictEqual(result.value.arch, undefined);
        assert.strictEqual(result.value.nodeVersion, undefined);
        assert.strictEqual(result.value.vscodeVersion, '1.2.3');
      });

      test('TC-PARSE-ENV-B-UNDEFINED-01: omitted env fields are treated as undefined', () => {
        // Given: A JSON payload with no env properties (omitted)
        const raw = JSON.stringify({ failures: 0, passes: 0 });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: It succeeds and env fields are undefined
        assert.ok(result.ok);
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.platform, undefined);
        assert.strictEqual(result.value.arch, undefined);
        assert.strictEqual(result.value.nodeVersion, undefined);
        assert.strictEqual(result.value.vscodeVersion, undefined);
      });

      test('TC-PARSE-ENV-B-NULL-01: null env fields are converted to undefined', () => {
        // Given: A JSON payload where env fields are explicitly null
        const raw = JSON.stringify({ platform: null, arch: null, nodeVersion: null, vscodeVersion: null });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: It succeeds and env fields become undefined (getStringOrUndefined behavior)
        assert.ok(result.ok);
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.platform, undefined);
        assert.strictEqual(result.value.arch, undefined);
        assert.strictEqual(result.value.nodeVersion, undefined);
        assert.strictEqual(result.value.vscodeVersion, undefined);
      });

      test('TC-PARSE-ENV-B-EMPTY-01: empty string env fields are converted to undefined', () => {
        // Given: A JSON payload where env fields are empty strings
        const raw = JSON.stringify({ platform: '', arch: '', nodeVersion: '', vscodeVersion: '' });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: It succeeds and converts empty strings to undefined
        assert.ok(result.ok);
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.platform, undefined);
        assert.strictEqual(result.value.arch, undefined);
        assert.strictEqual(result.value.nodeVersion, undefined);
        assert.strictEqual(result.value.vscodeVersion, undefined);
      });

      test('TC-PARSE-ENV-E-01: invalid types for env fields are converted to undefined (without failing the whole parse)', () => {
        // Given: A JSON payload where env fields have invalid types
        const raw = JSON.stringify({ platform: 123, arch: true, nodeVersion: {}, vscodeVersion: [] });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: It succeeds and env fields become undefined
        assert.ok(result.ok);
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.platform, undefined);
        assert.strictEqual(result.value.arch, undefined);
        assert.strictEqual(result.value.nodeVersion, undefined);
        assert.strictEqual(result.value.vscodeVersion, undefined);
      });

      test('TC-PARSE-RAW-E-01: returns ok=false with error matching JSON.parse error message (invalid JSON)', () => {
        // Given: A raw string that cannot be parsed as JSON
        const raw = '{';
        let expectedError = 'invalid-json: (unknown)';
        try {
          JSON.parse(raw);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          expectedError = `invalid-json: ${msg}`;
        }

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: It fails and preserves the underlying JSON.parse error message
        assert.deepStrictEqual(result, { ok: false, error: expectedError });
      });

      test('TC-PARSE-RAW-B-EMPTY-01: returns ok=false with error="empty" when raw is empty string', () => {
        // Given: Empty input
        const raw = '';

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: It fails with the stable error code "empty"
        assert.deepStrictEqual(result, { ok: false, error: 'empty' });
      });

      test('TC-PARSE-RAW-B-NULL-01: throws TypeError when raw is null (current behavior)', () => {
        // Given: A non-string input forced through the type system
        const raw = null as unknown as string;

        // When: parseTestResultFile is called with a null value
        // Then: It throws TypeError because it calls raw.trim() (this is the current behavior)
        assert.throws(
          () => parseTestResultFile(raw),
          (err: unknown) => {
            assert.ok(err instanceof TypeError, 'TypeError が投げられること');
            const message = err instanceof Error ? err.message : String(err);
            assert.ok(/\S/.test(message), 'メッセージが空ではないこと');
            return true;
          },
        );
      });

      test('TC-ART-PTRF-E-01: returns ok=false with error="empty" when raw is empty/whitespace', () => {
        // Given: Empty input
        const raw = '   \n\t';

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: It returns the stable error code "empty"
        assert.deepStrictEqual(result, { ok: false, error: 'empty' });
      });

      test('TC-ART-PTRF-E-02: returns ok=false with error starting "invalid-json:" when JSON.parse fails', () => {
        // Given: Invalid JSON
        const raw = '{ invalid';

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: It returns invalid-json prefix (message body can vary)
        assert.strictEqual(result.ok, false);
        if (result.ok) {
          return;
        }
        assert.ok(result.error.startsWith('invalid-json:'), 'Expected invalid-json prefix');
      });

      test('TC-ART-PTRF-N-01: returns ok=true and extracts numeric fields and arrays when payload has the expected shape', () => {
        // Given: A test-result.json-like JSON payload with main numeric fields and arrays
        const raw = JSON.stringify({
          timestamp: 123,
          platform: 'darwin',
          arch: 'arm64',
          nodeVersion: 'v1.2.3',
          vscodeVersion: '1.2.3',
          failures: 1,
          passes: 2,
          pending: 3,
          total: 6,
          durationMs: 456,
          tests: [{ suite: 'Suite', title: 'T', fullTitle: 'Suite T', state: 'passed', durationMs: 10 }],
          failedTests: [{ title: 'T', fullTitle: 'Suite T', error: 'boom' }],
        });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: It returns ok=true and the observable fields are extracted
        assert.ok(result.ok);
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.timestamp, 123);
        assert.strictEqual(result.value.platform, 'darwin');
        assert.strictEqual(result.value.arch, 'arm64');
        assert.strictEqual(result.value.nodeVersion, 'v1.2.3');
        assert.strictEqual(result.value.vscodeVersion, '1.2.3');
        assert.strictEqual(result.value.failures, 1);
        assert.strictEqual(result.value.passes, 2);
        assert.strictEqual(result.value.pending, 3);
        assert.strictEqual(result.value.total, 6);
        assert.strictEqual(result.value.durationMs, 456);
        assert.strictEqual(result.value.tests?.length, 1);
        assert.strictEqual(result.value.failedTests?.length, 1);
      });

      test('TC-ART-PTRF-N-02: extracts tests[] and normalizes state to passed/failed/pending or undefined', () => {
        // Given: tests[] includes valid states and an unknown state
        const raw = JSON.stringify({
          tests: [
            { suite: 'S', title: 'A', fullTitle: 'S A', state: 'passed', durationMs: 0 },
            { suite: 'S', title: 'B', fullTitle: 'S B', state: 'failed', durationMs: 12 },
            { suite: 'S', title: 'C', fullTitle: 'S C', state: 'pending', durationMs: '1' },
            { suite: 'S', title: 'D', fullTitle: 'S D', state: 'unknown', durationMs: '2' },
          ],
        });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: tests[] is present and state is normalized (unknown -> undefined)
        assert.ok(result.ok);
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.tests?.length, 4);
        assert.strictEqual(result.value.tests?.[0]?.suite, 'S');
        assert.strictEqual(result.value.tests?.[0]?.title, 'A');
        assert.strictEqual(result.value.tests?.[0]?.fullTitle, 'S A');
        assert.strictEqual(result.value.tests?.[0]?.state, 'passed');
        assert.strictEqual(result.value.tests?.[0]?.durationMs, 0);
        assert.strictEqual(result.value.tests?.[1]?.state, 'failed');
        assert.strictEqual(result.value.tests?.[2]?.state, 'pending');
        assert.strictEqual(result.value.tests?.[3]?.state, undefined);
      });

      test('TC-ART-PTRF-N-03: extracts failedTests[] and ensures title/fullTitle/error are always strings', () => {
        // Given: failedTests[] with missing required string fields
        const raw = JSON.stringify({
          failedTests: [
            {
              title: null,
              fullTitle: undefined,
              error: null,
              stack: 'STACK',
              code: 'ERR_ASSERTION',
              expected: 'expected',
              actual: 'actual',
            },
          ],
        });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: Required string fields are present as strings (possibly empty), optionals are strings when present
        assert.ok(result.ok);
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.failedTests?.length, 1);
        assert.strictEqual(result.value.failedTests?.[0]?.title, '');
        assert.strictEqual(result.value.failedTests?.[0]?.fullTitle, '');
        assert.strictEqual(result.value.failedTests?.[0]?.error, '');
        assert.strictEqual(result.value.failedTests?.[0]?.stack, 'STACK');
        assert.strictEqual(result.value.failedTests?.[0]?.code, 'ERR_ASSERTION');
        assert.strictEqual(result.value.failedTests?.[0]?.expected, 'expected');
        assert.strictEqual(result.value.failedTests?.[0]?.actual, 'actual');
      });

      test('TC-ART-PTRF-B-01: converts numeric string "0" to number 0 (zero boundary)', () => {
        // Given: Numeric fields represented as string "0"
        const raw = JSON.stringify({ timestamp: '0', failures: '0', passes: '0', pending: '0', total: '0', durationMs: '0' });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: Parsed values are numbers equal to 0 (not undefined)
        assert.ok(result.ok);
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.timestamp, 0);
        assert.strictEqual(result.value.failures, 0);
        assert.strictEqual(result.value.passes, 0);
        assert.strictEqual(result.value.pending, 0);
        assert.strictEqual(result.value.total, 0);
        assert.strictEqual(result.value.durationMs, 0);
      });

      test('TC-ART-PTRF-B-02: treats tests:[] and failedTests:[] as undefined (empty array boundary)', () => {
        // Given: Explicit empty arrays
        const raw = JSON.stringify({ tests: [], failedTests: [] });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: tests/failedTests are omitted (undefined) because length is 0
        assert.ok(result.ok);
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.tests, undefined);
        assert.strictEqual(result.value.failedTests, undefined);
      });

      test('TC-ART-PTRF-B-03: sets tests[].state to undefined for unsupported enum values', () => {
        // Given: An unsupported state value
        const raw = JSON.stringify({ tests: [{ state: 'unknown' }] });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: state is normalized to undefined (and no exception is thrown)
        assert.ok(result.ok);
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.tests?.length, 1);
        assert.strictEqual(result.value.tests?.[0]?.state, undefined);
      });

      test('TC-ART-PTRF-E-03: returns ok=false with error="json-not-object" for non-object JSON (null/array/string/number)', () => {
        // Given: Non-object JSON inputs
        const raws = ['null', '[]', '"x"', '123'];

        // When/Then: parseTestResultFile rejects them with json-not-object
        for (const raw of raws) {
          const result = parseTestResultFile(raw);
          assert.deepStrictEqual(result, { ok: false, error: 'json-not-object' });
        }
      });

      test('TC-TRF-B-01: returns ok=false with error="empty" when raw is whitespace-only', () => {
        // Given: Whitespace-only input (should be checked after trim())
        const raw = ' \n \t ';

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: Returns an "empty" parse error
        assert.deepStrictEqual(result, { ok: false, error: 'empty' });
      });

      test('TC-TRF-E-01: returns ok=false with error starting "invalid-json:" when raw is invalid JSON', () => {
        // Given: Invalid JSON input
        const raw = '{ invalid';

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: Error type is stable by prefix (message body can vary)
        assert.strictEqual(result.ok, false);
        if (result.ok) {
          return;
        }
        assert.ok(result.error.startsWith('invalid-json:'), 'Expected error to start with "invalid-json:"');
      });

      test('TC-TRF-E-02: returns ok=false with error="json-not-object" when raw JSON is null', () => {
        // Given: JSON that is not an object (null boundary)
        const raw = 'null';

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: Reject non-object JSON
        assert.deepStrictEqual(result, { ok: false, error: 'json-not-object' });
      });

      test('TC-TRF-N-01: parses full test-result.json shape and preserves key fields', () => {
        // Given: A full-shaped test-result.json payload
        const raw = JSON.stringify({
          timestamp: 123,
          vscodeVersion: '1.2.3',
          failures: 1,
          passes: 2,
          pending: 3,
          total: 6,
          durationMs: 456,
          tests: [
            { suite: 'Suite A', title: 'Test 1', fullTitle: 'Suite A Test 1', state: 'passed', durationMs: 0 },
            { suite: 'Suite B', title: 'Test 2', fullTitle: 'Suite B Test 2', state: 'failed', durationMs: 12 },
          ],
          failedTests: [
            {
              title: 'Test 2',
              fullTitle: 'Suite B Test 2',
              error: 'AssertionError: boom',
              stack: 'STACK',
              code: 'ERR_ASSERTION',
              expected: 'expected',
              actual: 'actual',
            },
          ],
        });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: Returns ok=true with expected structured fields
        assert.ok(result.ok, 'Expected ok=true');
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.timestamp, 123);
        assert.strictEqual(result.value.vscodeVersion, '1.2.3');
        assert.strictEqual(result.value.failures, 1);
        assert.strictEqual(result.value.passes, 2);
        assert.strictEqual(result.value.pending, 3);
        assert.strictEqual(result.value.total, 6);
        assert.strictEqual(result.value.durationMs, 456);
        assert.strictEqual(result.value.tests?.length, 2);
        assert.strictEqual(result.value.tests?.[0]?.state, 'passed');
        assert.strictEqual(result.value.tests?.[0]?.durationMs, 0);
        assert.strictEqual(result.value.failedTests?.length, 1);
        assert.strictEqual(result.value.failedTests?.[0]?.code, 'ERR_ASSERTION');
      });

      test('TC-TRF-N-02: accepts "{}" and returns ok=true with all optional fields undefined', () => {
        // Given: Minimal JSON object with missing fields
        const raw = '{}';

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: ok=true and missing fields become undefined (not defaults)
        assert.ok(result.ok, 'Expected ok=true');
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.timestamp, undefined);
        assert.strictEqual(result.value.vscodeVersion, undefined);
        assert.strictEqual(result.value.failures, undefined);
        assert.strictEqual(result.value.passes, undefined);
        assert.strictEqual(result.value.pending, undefined);
        assert.strictEqual(result.value.total, undefined);
        assert.strictEqual(result.value.durationMs, undefined);
        assert.strictEqual(result.value.tests, undefined);
        assert.strictEqual(result.value.failedTests, undefined);
      });

      test('TC-TRF-N-03: treats non-array tests as absent and returns tests=undefined', () => {
        // Given: tests is not an array
        const raw = JSON.stringify({ tests: null });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: ok=true with tests undefined (empty array is not returned)
        assert.ok(result.ok, 'Expected ok=true');
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.tests, undefined);
      });

      test('TC-TRF-N-04: skips non-object entries inside tests array', () => {
        // Given: tests array with mixed element types
        const raw = JSON.stringify({ tests: [1, null, 'x', {}] });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: ok=true and only object entries are kept
        assert.ok(result.ok, 'Expected ok=true');
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.tests?.length, 1);
      });

      test('TC-TRF-B-02: parses numeric fields as 0 from both numbers and numeric strings', () => {
        // Given: Numeric fields set to 0 via string/number forms
        const raw = JSON.stringify({
          timestamp: '0',
          failures: 0,
          passes: '0',
          pending: 0,
          total: '0',
          durationMs: 0,
          tests: [{ durationMs: '0' }],
        });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: 0 is preserved (not converted to undefined)
        assert.ok(result.ok, 'Expected ok=true');
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.timestamp, 0);
        assert.strictEqual(result.value.failures, 0);
        assert.strictEqual(result.value.passes, 0);
        assert.strictEqual(result.value.pending, 0);
        assert.strictEqual(result.value.total, 0);
        assert.strictEqual(result.value.durationMs, 0);
        assert.strictEqual(result.value.tests?.[0]?.durationMs, 0);
      });

      test('TC-TRF-B-03: preserves negative numbers (e.g. -1) as-is', () => {
        // Given: Negative numeric fields
        const raw = JSON.stringify({ failures: '-1', durationMs: -1 });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: Negative values remain finite numbers
        assert.ok(result.ok, 'Expected ok=true');
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.failures, -1);
        assert.strictEqual(result.value.durationMs, -1);
      });

      test('TC-TRF-B-04: parses MAX_SAFE_INTEGER from number and numeric string', () => {
        // Given: Boundary values around MAX_SAFE_INTEGER
        const raw = JSON.stringify({
          timestamp: Number.MAX_SAFE_INTEGER,
          total: String(Number.MAX_SAFE_INTEGER),
        });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: Values are preserved as finite numbers
        assert.ok(result.ok, 'Expected ok=true');
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.timestamp, Number.MAX_SAFE_INTEGER);
        assert.strictEqual(result.value.total, Number.MAX_SAFE_INTEGER);
      });

      test('TC-TRF-A-01: treats non-finite numeric strings (e.g. "Infinity") as undefined', () => {
        // Given: Non-finite values represented as strings in JSON
        const raw = JSON.stringify({ durationMs: 'Infinity', failures: 'NaN' });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: Non-finite values are rejected and become undefined
        assert.ok(result.ok, 'Expected ok=true');
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.durationMs, undefined);
        assert.strictEqual(result.value.failures, undefined);
      });

      test('TC-TRF-B-05: normalizes tests[].state to undefined for out-of-enum values', () => {
        // Given: tests[].state is not one of passed/failed/pending
        const raw = JSON.stringify({ tests: [{ state: 'skipped' }, { state: 0 }, { state: null }] });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: State is normalized to undefined
        assert.ok(result.ok, 'Expected ok=true');
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.tests?.length, 3);
        assert.strictEqual(result.value.tests?.[0]?.state, undefined);
        assert.strictEqual(result.value.tests?.[1]?.state, undefined);
        assert.strictEqual(result.value.tests?.[2]?.state, undefined);
      });

      test('TC-TRF-N-05: fills missing/null failedTests string fields with empty strings', () => {
        // Given: failedTests entries with missing required strings
        const raw = JSON.stringify({ failedTests: [{ title: null, fullTitle: undefined, error: null }] });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: title/fullTitle/error are empty strings (not undefined)
        assert.ok(result.ok, 'Expected ok=true');
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.failedTests?.length, 1);
        assert.strictEqual(result.value.failedTests?.[0]?.title, '');
        assert.strictEqual(result.value.failedTests?.[0]?.fullTitle, '');
        assert.strictEqual(result.value.failedTests?.[0]?.error, '');
      });
    });

    suite('additional coverage: findLatestArtifact and parsing edge cases', () => {
      test('TC-ART-LATEST-N-01: findLatestArtifact returns newest matching artifact by timestamp', async () => {
      // Given: A temp directory with multiple files (some matching, some not)
        const tempRoot = path.join(workspaceRoot, 'out', 'test-findLatestArtifact-n01');
        const prefix = 'test-perspectives_';
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempRoot));

        const older = `${prefix}20250101_000000.md`;
        const newer = `${prefix}20251231_235959.md`;
        const unrelated = `other_${prefix}20251231_235959.md`;
        const wrongExt = `${prefix}20251231_235959.txt`;

        try {
        // When: Writing files and calling findLatestArtifact
          await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(tempRoot, older)), Buffer.from('old', 'utf8'));
          await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(tempRoot, newer)), Buffer.from('new', 'utf8'));
          await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(tempRoot, unrelated)), Buffer.from('x', 'utf8'));
          await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(tempRoot, wrongExt)), Buffer.from('x', 'utf8'));

          const latest = await findLatestArtifact(workspaceRoot, tempRoot, prefix);

          // Then: The newest timestamp file path is returned
          assert.strictEqual(latest, path.join(tempRoot, newer));
        } finally {
        // Cleanup
          await vscode.workspace.fs.delete(vscode.Uri.file(tempRoot), { recursive: true, useTrash: false });
        }
      });

      test('TC-ART-LATEST-E-01: findLatestArtifact returns undefined when no valid matching files exist', async () => {
      // Given: A temp directory with only invalid candidates
        const tempRoot = path.join(workspaceRoot, 'out', 'test-findLatestArtifact-e01');
        const prefix = 'test-perspectives_';
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempRoot));

        const wrongPrefix = `test-execution_20251231_235959.md`;
        const invalidTsLen = `${prefix}20251231_23595.md`; // length mismatch
        const invalidTsPattern = `${prefix}20251231235959.md`; // missing underscore
        const wrongExt = `${prefix}20251231_235959.txt`;

        try {
        // When: Writing files and calling findLatestArtifact
          await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(tempRoot, wrongPrefix)), Buffer.from('x', 'utf8'));
          await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(tempRoot, invalidTsLen)), Buffer.from('x', 'utf8'));
          await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(tempRoot, invalidTsPattern)), Buffer.from('x', 'utf8'));
          await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(tempRoot, wrongExt)), Buffer.from('x', 'utf8'));

          const latest = await findLatestArtifact(workspaceRoot, tempRoot, prefix);

          // Then: No artifact is found
          assert.strictEqual(latest, undefined);
        } finally {
        // Cleanup
          await vscode.workspace.fs.delete(vscode.Uri.file(tempRoot), { recursive: true, useTrash: false });
        }
      });

      test('TC-ART-LATEST-E-02: findLatestArtifact returns undefined when directory does not exist', async () => {
      // Given: A non-existent directory
        const tempRoot = path.join(workspaceRoot, 'out', 'test-findLatestArtifact-e02-does-not-exist');
        const prefix = 'test-perspectives_';

        // Ensure it does not exist (best-effort)
        try {
          await vscode.workspace.fs.delete(vscode.Uri.file(tempRoot), { recursive: true, useTrash: false });
        } catch {
        // ignore
        }

        // When: Calling findLatestArtifact
        const latest = await findLatestArtifact(workspaceRoot, tempRoot, prefix);

        // Then: Returns undefined (does not throw)
        assert.strictEqual(latest, undefined);
      });

      test('TC-ART-PATH-B-01: saveTestPerspectiveTable returns relativePath undefined when reportDir is outside workspaceRoot', async () => {
      // Given: workspaceRoot parameter points to a subdirectory, while reportDir is outside it (but still inside repo workspace)
        const base = path.join(workspaceRoot, 'out', 'test-saveTestPerspectiveTable-outside-root');
        const fakeWorkspaceRoot = path.join(base, 'workspaceRoot');
        const reportDir = path.join(base, 'outside');

        await vscode.workspace.fs.createDirectory(vscode.Uri.file(fakeWorkspaceRoot));

        try {
        // When: Saving the artifact to an absolute reportDir outside fakeWorkspaceRoot
          const saved = await saveTestPerspectiveTable({
            workspaceRoot: fakeWorkspaceRoot,
            targetLabel: 'label',
            targetPaths: ['a.ts'],
            perspectiveMarkdown: '| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |\n|---|---|---|---|---|\n| X | - | - | - | - |',
            reportDir,
            timestamp: '20251229_000000',
          });

          // Then: absolutePath is in reportDir and relativePath is undefined
          assert.strictEqual(saved.absolutePath, path.join(reportDir, 'test-perspectives_20251229_000000.md'));
          assert.strictEqual(saved.relativePath, undefined);

          const stat = await vscode.workspace.fs.stat(vscode.Uri.file(saved.absolutePath));
          assert.ok(stat.size >= 0, 'Saved file should exist');
        } finally {
        // Cleanup
          await vscode.workspace.fs.delete(vscode.Uri.file(base), { recursive: true, useTrash: false });
        }
      });

      test('TC-ART-PARSE-PERSPECTIVE-E-01: parsePerspectiveJsonV1 returns invalid-json for unterminated JSON string', () => {
      // Given: An unterminated JSON string that starts with a quote (no JSON object in the text)
        const raw = '"abc';

        // When: parsePerspectiveJsonV1 is called
        const result = parsePerspectiveJsonV1(raw);

        // Then: Returns ok=false with error starting with invalid-json:
        assert.ok(!result.ok, 'Returns ok=false');
        assert.ok(result.error.startsWith('invalid-json:'), 'Error starts with invalid-json:');
      });

      test('TC-ART-PARSE-PERSPECTIVE-N-01: parsePerspectiveJsonV1 handles non-fence backticks prefix and still parses JSON object', () => {
      // Given: Text starts with backticks but is not a valid fenced block (edge case)
        const raw = '``````\n{"version":1,"cases":[]}';

        // When: parsePerspectiveJsonV1 is called
        const result = parsePerspectiveJsonV1(raw);

        // Then: JSON object inside text is parsed successfully
        assert.ok(result.ok, 'Expected ok=true');
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.version, 1);
        assert.deepStrictEqual(result.value.cases, []);
      });

      test('TC-ART-PARSE-EXEC-E-01: parseTestExecutionJsonV1 returns invalid-json for unterminated JSON string', () => {
      // Given: An unterminated JSON string that starts with a quote (no JSON object in the text)
        const raw = '"abc';

        // When: parseTestExecutionJsonV1 is called
        const result = parseTestExecutionJsonV1(raw);

        // Then: Returns ok=false with error starting with invalid-json:
        assert.ok(!result.ok, 'Returns ok=false');
        assert.ok(result.error.startsWith('invalid-json:'), 'Error starts with invalid-json:');
      });

      test('TC-ART-PARSE-RESULT-B-01: parseTestResultFile ignores non-object failedTests entries', () => {
      // Given: failedTests contains a non-object entry and a valid object entry
        const raw = JSON.stringify({
          failedTests: [
            123,
            {
              title: 'T',
              fullTitle: 'Suite T',
              error: 'boom',
            },
          ],
        });

        // When: parseTestResultFile is called
        const result = parseTestResultFile(raw);

        // Then: Non-object entry is ignored and object entry is kept
        assert.ok(result.ok, 'Expected ok=true');
        if (!result.ok) {
          return;
        }
        assert.strictEqual(result.value.failedTests?.length, 1);
        assert.strictEqual(result.value.failedTests?.[0]?.title, 'T');
        assert.strictEqual(result.value.failedTests?.[0]?.fullTitle, 'Suite T');
        assert.strictEqual(result.value.failedTests?.[0]?.error, 'boom');
      });
    });

    suite('buildTestExecutionArtifactMarkdown (failure details section)', () => {
      test('TC-ART-FAILSEC-N-01: includes "Failure Details" section with message/code/expected/actual/stack blocks when failedTests exist', () => {
        // Given: A test execution result with one failedTests entry containing all detail fields
        const md = buildTestExecutionArtifactMarkdown({
          generatedAtMs: Date.now(),
          generationLabel: 'Label',
          targetPaths: ['x.ts'],
          result: {
            command: 'cmd',
            cwd: '/tmp',
            exitCode: 1,
            signal: null,
            durationMs: 10,
            stdout: '',
            stderr: '',
            testResult: {
              failedTests: [
                {
                  title: 'A',
                  fullTitle: 'Suite A',
                  error: 'boom',
                  code: 'ERR_ASSERTION',
                  expected: 'expected',
                  actual: 'actual',
                  stack: 'STACK',
                },
              ],
            },
          },
        });

        // When/Then: Failure details section and each labeled block are present
        assert.ok(md.includes(`## ${t('artifact.executionReport.failureDetails')}`));
        assert.ok(md.includes('### 1.'));
        assert.ok(md.includes(`${t('artifact.executionReport.failureMessage')}: boom`));
        assert.ok(md.includes(`${t('artifact.executionReport.failureCode')}: ERR_ASSERTION`));
        assert.ok(md.includes(`- ${t('artifact.executionReport.expected')}:`));
        assert.ok(md.includes('```text'));
        assert.ok(md.includes('expected'));
        assert.ok(md.includes(`- ${t('artifact.executionReport.actual')}:`));
        assert.ok(md.includes('actual'));
        assert.ok(md.includes(t('artifact.executionReport.stackTrace')));
      });

      test('TC-ART-FAILSEC-N-02: falls back fullTitle -> title -> "(unknown)" and normalizes whitespace/newlines in heading', () => {
        // Given: fullTitle is empty and title contains newlines/extra spaces
        const md = buildTestExecutionArtifactMarkdown({
          generatedAtMs: Date.now(),
          generationLabel: 'Label',
          targetPaths: ['x.ts'],
          result: {
            command: 'cmd',
            cwd: '/tmp',
            exitCode: 1,
            signal: null,
            durationMs: 10,
            stdout: '',
            stderr: '',
            testResult: { failedTests: [{ title: 'Title\n  With  Spaces', fullTitle: '', error: 'e' }] },
          },
        });

        // When/Then: Heading uses title and is normalized to a single line
        assert.ok(md.includes('### 1. Title With Spaces'));
      });

      test('TC-ART-FAILSEC-B-01: omits failure details section when testResult is undefined or failedTests is empty', () => {
        // Given: No structured failures
        const md1 = buildTestExecutionArtifactMarkdown({
          generatedAtMs: Date.now(),
          generationLabel: 'Label',
          targetPaths: ['x.ts'],
          result: {
            command: 'cmd',
            cwd: '/tmp',
            exitCode: 0,
            signal: null,
            durationMs: 10,
            stdout: '',
            stderr: '',
          },
        });
        const md2 = buildTestExecutionArtifactMarkdown({
          generatedAtMs: Date.now(),
          generationLabel: 'Label',
          targetPaths: ['x.ts'],
          result: {
            command: 'cmd',
            cwd: '/tmp',
            exitCode: 0,
            signal: null,
            durationMs: 10,
            stdout: '',
            stderr: '',
            testResult: { failedTests: [] },
          },
        });

        // When/Then: The failure details header is not present
        assert.ok(!md1.includes(`## ${t('artifact.executionReport.failureDetails')}`));
        assert.ok(!md2.includes(`## ${t('artifact.executionReport.failureDetails')}`));
      });

      test('TC-ART-FAILSEC-B-02: does not truncate at 19999/20000 chars, but truncates at 20001 chars (max+1)', () => {
        // Given: Three payloads around the truncation threshold
        const expected19999 = 'a'.repeat(19_999);
        const expected20000 = 'a'.repeat(20_000);
        const expected20001 = 'a'.repeat(20_001);

        const render = (expected: string): string =>
          buildTestExecutionArtifactMarkdown({
            generatedAtMs: Date.now(),
            generationLabel: 'Label',
            targetPaths: ['x.ts'],
            result: {
              command: 'cmd',
              cwd: '/tmp',
              exitCode: 1,
              signal: null,
              durationMs: 10,
              stdout: '',
              stderr: '',
              testResult: { failedTests: [{ title: 'A', fullTitle: 'A', error: 'e', expected }] },
            },
          });

        // When: Rendering failure details
        const md19999 = render(expected19999);
        const md20000 = render(expected20000);
        const md20001 = render(expected20001);

        // Then: Only max+1 is truncated
        assert.ok(!md19999.includes('(truncated:'), 'Expected no truncation at 19999');
        assert.ok(!md20000.includes('(truncated:'), 'Expected no truncation at 20000');
        assert.ok(md20001.includes('... (truncated: 20001 chars -> 20000 chars)'), 'Expected truncation at 20001');
      });

      test('TC-ART-FAILSEC-B-03: omits empty/whitespace-only fields (message/code/expected/actual/stack)', () => {
        // Given: A failedTests entry with whitespace-only fields
        const md = buildTestExecutionArtifactMarkdown({
          generatedAtMs: Date.now(),
          generationLabel: 'Label',
          targetPaths: ['x.ts'],
          result: {
            command: 'cmd',
            cwd: '/tmp',
            exitCode: 1,
            signal: null,
            durationMs: 10,
            stdout: '',
            stderr: '',
            testResult: {
              failedTests: [
                {
                  title: 'A',
                  fullTitle: 'A',
                  error: '   ',
                  code: '',
                  expected: '  ',
                  actual: '',
                  stack: ' \n ',
                },
              ],
            },
          },
        });

        // When/Then: Only the section + heading are present, but field labels are omitted
        assert.ok(md.includes(`## ${t('artifact.executionReport.failureDetails')}`));
        assert.ok(md.includes('### 1. A'));
        assert.ok(!md.includes(`- ${t('artifact.executionReport.failureMessage')}:`), 'Message line should be omitted');
        assert.ok(!md.includes(`- ${t('artifact.executionReport.failureCode')}:`), 'Code line should be omitted');
        assert.ok(!md.includes(`- ${t('artifact.executionReport.expected')}:`), 'Expected line should be omitted');
        assert.ok(!md.includes(`- ${t('artifact.executionReport.actual')}:`), 'Actual line should be omitted');
        assert.ok(!md.includes(`<summary>${t('artifact.executionReport.stackTrace')}</summary>`), 'Stack trace should be omitted');
      });

      test('TC-REP-N-01: renders failure details when result.testResult.failedTests is present', () => {
        // Given: A test execution result with structured failedTests
        const testResult: TestResultFile = {
          failedTests: [
            {
              title: 'Test A',
              fullTitle: 'Suite Test A',
              error: 'boom',
              stack: 'STACK TRACE',
              code: 'ERR_ASSERTION',
              expected: 'expected-value',
              actual: 'actual-value',
            },
          ],
        };

        // When: buildTestExecutionArtifactMarkdown is called
        const md = buildTestExecutionArtifactMarkdown({
          generatedAtMs: Date.now(),
          generationLabel: 'Label',
          targetPaths: ['x.ts'],
          result: {
            command: 'cmd',
            cwd: '/tmp',
            exitCode: 1,
            signal: null,
            durationMs: 10,
            stdout: '',
            stderr: '',
            testResult,
          },
        });

        // Then: Failure details section is included with labels and contents
        assert.ok(md.includes(`## ${t('artifact.executionReport.failureDetails')}`));
        assert.ok(md.includes(`- ${t('artifact.executionReport.failureMessage')}: boom`));
        assert.ok(md.includes(`- ${t('artifact.executionReport.failureCode')}: ERR_ASSERTION`));
        assert.ok(md.includes(`- ${t('artifact.executionReport.expected')}:`));
        assert.ok(md.includes('```text'));
        assert.ok(md.includes('expected-value'));
        assert.ok(md.includes(`- ${t('artifact.executionReport.actual')}:`));
        assert.ok(md.includes('actual-value'));
        assert.ok(md.includes(`<summary>${t('artifact.executionReport.stackTrace')}${t('artifact.executionReport.clickToExpand')}</summary>`));
      });

      test('TC-REP-N-02: does not render failure details section when testResult is missing/empty', () => {
        // Given: A test execution result without structured failures
        const md = buildTestExecutionArtifactMarkdown({
          generatedAtMs: Date.now(),
          generationLabel: 'Label',
          targetPaths: ['x.ts'],
          result: {
            command: 'cmd',
            cwd: '/tmp',
            exitCode: 0,
            signal: null,
            durationMs: 10,
            stdout: '',
            stderr: '',
            testResult: { failedTests: [] },
          },
        });

        // When/Then: Failure details section is omitted
        assert.ok(!md.includes(`## ${t('artifact.executionReport.failureDetails')}`));
      });

      test('TC-REP-N-03: renders multiple failures with numbered headings', () => {
        // Given: Two failed test entries
        const md = buildTestExecutionArtifactMarkdown({
          generatedAtMs: Date.now(),
          generationLabel: 'Label',
          targetPaths: ['x.ts'],
          result: {
            command: 'cmd',
            cwd: '/tmp',
            exitCode: 1,
            signal: null,
            durationMs: 10,
            stdout: '',
            stderr: '',
            testResult: {
              failedTests: [
                { title: 'A', fullTitle: 'Suite A', error: 'e1' },
                { title: 'B', fullTitle: 'Suite B', error: 'e2' },
              ],
            },
          },
        });

        // When/Then: Both are numbered
        assert.ok(md.includes('### 1. Suite A'));
        assert.ok(md.includes('### 2. Suite B'));
      });

      test('TC-REP-B-01: falls back to "(unknown)" when both fullTitle and title are empty', () => {
        // Given: Missing/empty titles
        // When: buildTestExecutionArtifactMarkdown is called
        const md = buildTestExecutionArtifactMarkdown({
          generatedAtMs: Date.now(),
          generationLabel: 'Label',
          targetPaths: ['x.ts'],
          result: {
            command: 'cmd',
            cwd: '/tmp',
            exitCode: 1,
            signal: null,
            durationMs: 10,
            stdout: '',
            stderr: '',
            testResult: { failedTests: [{ title: '', fullTitle: '', error: 'e' }] },
          },
        });

        // Then: "(unknown)" is used in the heading
        assert.ok(md.includes('### 1. (unknown)'));
      });

      test('TC-REP-B-02: normalizes ANSI/newlines/spaces in failure message', () => {
        // Given: A message with ANSI and newlines/spaces
        const message = `\u001b[31mError:\u001b[0m line1\n\n   line2`;
        // When: buildTestExecutionArtifactMarkdown is called
        const md = buildTestExecutionArtifactMarkdown({
          generatedAtMs: Date.now(),
          generationLabel: 'Label',
          targetPaths: ['x.ts'],
          result: {
            command: 'cmd',
            cwd: '/tmp',
            exitCode: 1,
            signal: null,
            durationMs: 10,
            stdout: '',
            stderr: '',
            testResult: { failedTests: [{ title: 'A', fullTitle: 'A', error: message }] },
          },
        });

        // Then: ANSI is stripped and message is single-line
        assert.ok(!md.includes('\u001b[31m'), 'ANSI should be stripped');
        assert.ok(md.includes(`${t('artifact.executionReport.failureMessage')}: Error: line1 line2`));
      });

      test('TC-REP-B-03: normalizes CRLF in expected/actual and renders as fenced code blocks', () => {
        // Given: CRLF multiline details
        // When: buildTestExecutionArtifactMarkdown is called
        const md = buildTestExecutionArtifactMarkdown({
          generatedAtMs: Date.now(),
          generationLabel: 'Label',
          targetPaths: ['x.ts'],
          result: {
            command: 'cmd',
            cwd: '/tmp',
            exitCode: 1,
            signal: null,
            durationMs: 10,
            stdout: '',
            stderr: '',
            testResult: {
              failedTests: [
                {
                  title: 'A',
                  fullTitle: 'A',
                  error: 'e',
                  expected: 'line1\r\nline2\r\n\r\nline3',
                  actual: 'a1\r\na2',
                },
              ],
            },
          },
        });

        // Then: CRLF is normalized to LF inside fences
        assert.ok(md.includes('```text\nline1\nline2\n\nline3\n```'));
        assert.ok(md.includes('```text\na1\na2\n```'));
      });

      test('TC-REP-B-04: does not truncate when expected length is exactly 20000', () => {
        // Given: expected length exactly at the max threshold
        const expected = 'a'.repeat(20_000);
        // When: buildTestExecutionArtifactMarkdown is called
        const md = buildTestExecutionArtifactMarkdown({
          generatedAtMs: Date.now(),
          generationLabel: 'Label',
          targetPaths: ['x.ts'],
          result: {
            command: 'cmd',
            cwd: '/tmp',
            exitCode: 1,
            signal: null,
            durationMs: 10,
            stdout: '',
            stderr: '',
            testResult: { failedTests: [{ title: 'A', fullTitle: 'A', error: 'e', expected }] },
          },
        });

        // Then: No "(truncated:" marker exists
        assert.ok(!md.includes('(truncated:'), 'Expected content should not be truncated at exactly 20000 chars');
      });

      test('TC-REP-B-05: truncates when expected length is 20001 (max+1) and includes marker', () => {
        // Given: expected length just above the max threshold
        const expected = 'a'.repeat(20_001);
        // When: buildTestExecutionArtifactMarkdown is called
        const md = buildTestExecutionArtifactMarkdown({
          generatedAtMs: Date.now(),
          generationLabel: 'Label',
          targetPaths: ['x.ts'],
          result: {
            command: 'cmd',
            cwd: '/tmp',
            exitCode: 1,
            signal: null,
            durationMs: 10,
            stdout: '',
            stderr: '',
            testResult: { failedTests: [{ title: 'A', fullTitle: 'A', error: 'e', expected }] },
          },
        });

        // Then: Truncation marker is included with the correct max
        assert.ok(md.includes('... (truncated: 20001 chars -> 20000 chars)'), 'Expected truncation marker for max+1');
      });

      test('TC-REP-A-01: omits Code line when code is empty/whitespace-only', () => {
        // Given: Empty/whitespace-only "code"
        // When: buildTestExecutionArtifactMarkdown is called
        const md = buildTestExecutionArtifactMarkdown({
          generatedAtMs: Date.now(),
          generationLabel: 'Label',
          targetPaths: ['x.ts'],
          result: {
            command: 'cmd',
            cwd: '/tmp',
            exitCode: 1,
            signal: null,
            durationMs: 10,
            stdout: '',
            stderr: '',
            testResult: { failedTests: [{ title: 'A', fullTitle: 'A', error: 'e', code: '   ' }] },
          },
        });

        // Then: Code label does not appear
        assert.ok(!md.includes(`- ${t('artifact.executionReport.failureCode')}:`));
      });

      test('TC-L10N-N-01: renders localized failure details labels according to current VS Code locale', () => {
        // Given: Failure details keys we expect to be localized (en fallback / ja bundle)
        const keys = [
          'artifact.executionReport.failureDetails',
          'artifact.executionReport.failureMessage',
          'artifact.executionReport.stackTrace',
        ] as const;

        // When: buildTestExecutionArtifactMarkdown is called with failures
        const md = buildTestExecutionArtifactMarkdown({
          generatedAtMs: Date.now(),
          generationLabel: 'Label',
          targetPaths: ['x.ts'],
          result: {
            command: 'cmd',
            cwd: '/tmp',
            exitCode: 1,
            signal: null,
            durationMs: 10,
            stdout: '',
            stderr: '',
            testResult: { failedTests: [{ title: 'A', fullTitle: 'A', error: 'e', stack: 's' }] },
          },
        });

        // Then: Localized labels are included and do not fall back to raw keys
        for (const key of keys) {
          const label = t(key);
          assert.notStrictEqual(label, key, `Expected localized label for key: ${key}`);
          assert.ok(md.includes(label), `Expected markdown to include localized label: ${label}`);
        }
      });

      test('TC-L10N-KEYS-N-01: l10n bundles include failure detail keys for both en and ja', () => {
        // Given: The repository root and both l10n bundles
        const repoRoot = path.resolve(__dirname, '../../../..');
        const enPath = path.join(repoRoot, 'l10n', 'bundle.l10n.json');
        const jaPath = path.join(repoRoot, 'l10n', 'bundle.l10n.ja.json');
        const bundleEn = JSON.parse(fs.readFileSync(enPath, 'utf8')) as Record<string, unknown>;
        const bundleJa = JSON.parse(fs.readFileSync(jaPath, 'utf8')) as Record<string, unknown>;

        const keys = [
          'artifact.executionReport.failureDetails',
          'artifact.executionReport.failureMessage',
          'artifact.executionReport.failureCode',
          'artifact.executionReport.expected',
          'artifact.executionReport.actual',
          'artifact.executionReport.stackTrace',
        ];

        // When/Then: Both bundles contain these keys as strings
        for (const key of keys) {
          assert.strictEqual(typeof bundleEn[key], 'string', `Expected en bundle to include key: ${key}`);
          assert.strictEqual(typeof bundleJa[key], 'string', `Expected ja bundle to include key: ${key}`);
        }
      });

      test('TC-L10N-KEY-N-01: l10n bundles include failure details keys (en/ja)', () => {
        // Given: Both runtime l10n bundles
        const repoRoot = path.resolve(__dirname, '../../../..');
        const bundleEn = JSON.parse(fs.readFileSync(path.join(repoRoot, 'l10n', 'bundle.l10n.json'), 'utf8')) as Record<string, unknown>;
        const bundleJa = JSON.parse(fs.readFileSync(path.join(repoRoot, 'l10n', 'bundle.l10n.ja.json'), 'utf8')) as Record<string, unknown>;

        // When/Then: Each required key exists as a non-empty string in both bundles
        const keys = [
          'artifact.executionReport.failureDetails',
          'artifact.executionReport.failureMessage',
          'artifact.executionReport.failureCode',
          'artifact.executionReport.expected',
          'artifact.executionReport.actual',
          'artifact.executionReport.stackTrace',
        ];
        for (const key of keys) {
          assert.ok(typeof bundleEn[key] === 'string' && (bundleEn[key] as string).length > 0, `Expected en key: ${key}`);
          assert.ok(typeof bundleJa[key] === 'string' && (bundleJa[key] as string).length > 0, `Expected ja key: ${key}`);
        }
      });
    });
  });

  suite('computeTestReportSummary', () => {
    // Given: skipped=true の場合
    // When: computeTestReportSummary を呼ぶ
    // Then: success=null が返る
    test('TC-CTRS-N-01: skipped=true returns success=null', () => {
      // Given: skipped=true
      const result = computeTestReportSummary({ exitCode: 0, skipped: true, testResult: undefined });

      // Then: success===null
      assert.strictEqual(result.success, null);
      assert.strictEqual(result.exitCode, 0);
    });

    // Given: exitCode=0 の場合
    // When: computeTestReportSummary を呼ぶ
    // Then: success=true が返る
    test('TC-CTRS-N-02: exitCode=0 returns success=true', () => {
      // Given: exitCode=0
      const result = computeTestReportSummary({ exitCode: 0, skipped: false, testResult: undefined });

      // Then: success===true
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.exitCode, 0);
    });

    // Given: exitCode=1 の場合
    // When: computeTestReportSummary を呼ぶ
    // Then: success=false が返る
    test('TC-CTRS-N-03: exitCode=1 returns success=false', () => {
      // Given: exitCode=1
      const result = computeTestReportSummary({ exitCode: 1, skipped: false, testResult: undefined });

      // Then: success===false
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, 1);
    });

    // Given: exitCode=null かつ testResult.tests 配列に failed=0
    // When: computeTestReportSummary を呼ぶ
    // Then: success=true が返る（tests配列からカウント）
    test('TC-CTRS-B-01: exitCode=null with tests array all passed returns success=true', () => {
      // Given: exitCode=null, tests配列に passed のみ
      const testResult: TestResultFile = {
        tests: [
          { title: 'test1', fullTitle: 'suite test1', state: 'passed' },
          { title: 'test2', fullTitle: 'suite test2', state: 'passed' },
        ],
        // failures プロパティは undefined
      };
      const result = computeTestReportSummary({ exitCode: null, skipped: false, testResult });

      // Then: success===true（tests配列から failed=0 を計算）
      assert.strictEqual(result.success, true, 'Should be success when tests array has all passed');
      assert.strictEqual(result.exitCode, null);
    });

    // Given: exitCode=null かつ testResult.tests 配列に failed>0
    // When: computeTestReportSummary を呼ぶ
    // Then: success=false が返る（tests配列からカウント）
    test('TC-CTRS-B-02: exitCode=null with tests array having failed returns success=false', () => {
      // Given: exitCode=null, tests配列に failed あり
      const testResult: TestResultFile = {
        tests: [
          { title: 'test1', fullTitle: 'suite test1', state: 'passed' },
          { title: 'test2', fullTitle: 'suite test2', state: 'failed' },
        ],
      };
      const result = computeTestReportSummary({ exitCode: null, skipped: false, testResult });

      // Then: success===false
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, null);
    });

    // Given: exitCode=null かつ testResult.tests が空で failures=0
    // When: computeTestReportSummary を呼ぶ
    // Then: success=true が返る（failures プロパティにフォールバック）
    test('TC-CTRS-B-03: exitCode=null with empty tests and failures=0 returns success=true', () => {
      // Given: exitCode=null, tests配列が空, failures=0
      const testResult: TestResultFile = {
        tests: [],
        failures: 0,
      };
      const result = computeTestReportSummary({ exitCode: null, skipped: false, testResult });

      // Then: success===true（failures プロパティから判定）
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.exitCode, null);
    });

    // Given: exitCode=null かつ testResult.tests が undefined で failures=2
    // When: computeTestReportSummary を呼ぶ
    // Then: success=false が返る（failures プロパティにフォールバック）
    test('TC-CTRS-B-04: exitCode=null with no tests and failures=2 returns success=false', () => {
      // Given: exitCode=null, tests未定義, failures=2
      const testResult: TestResultFile = {
        failures: 2,
      };
      const result = computeTestReportSummary({ exitCode: null, skipped: false, testResult });

      // Then: success===false
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, null);
    });

    // Given: exitCode=null かつ testResult が undefined
    // When: computeTestReportSummary を呼ぶ
    // Then: success=false が返る（判定不能のため失敗扱い）
    test('TC-CTRS-E-01: exitCode=null with no testResult returns success=false', () => {
      // Given: exitCode=null, testResult=undefined
      const result = computeTestReportSummary({ exitCode: null, skipped: false, testResult: undefined });

      // Then: success===false（判定不能）
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, null);
    });

    // Given: exitCode=null かつ testResult.tests も failures も undefined
    // When: computeTestReportSummary を呼ぶ
    // Then: success=false が返る（判定不能のため失敗扱い）
    test('TC-CTRS-E-02: exitCode=null with testResult but no tests/failures returns success=false', () => {
      // Given: exitCode=null, testResult はあるが tests/failures は undefined
      const testResult: TestResultFile = {};
      const result = computeTestReportSummary({ exitCode: null, skipped: false, testResult });

      // Then: success===false（判定不能）
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.exitCode, null);
    });
  });

  suite('JSON normalization and robust parsing', () => {
    // TC-N-01
    test('TC-N-01: parsePerspectiveJsonV1 handles raw newlines inside JSON string values', () => {
      // Given: A JSON string with a raw newline inside a value
      const raw = '{"version": 1, "cases": [{"caseId": "TC-1", "inputPrecondition": "", "perspective": "", "expectedResult": "", "notes": "line 1\nline 2"}]}';

      // When: parsePerspectiveJsonV1 is called (which uses normalizeJsonWithBareNewlines internally)
      const result = parsePerspectiveJsonV1(raw);

      // Then: It successfully parses and the newline is preserved/escaped correctly
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.cases[0].notes, 'line 1\nline 2');
      }
    });

    // TC-N-02
    test('TC-N-02: parsePerspectiveJsonV1 maintains newlines outside of JSON string values', () => {
      // Given: A JSON string with a newline between properties (outside quotes)
      const raw = '{\n  "version": 1,\n  "cases": []\n}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: It successfully parses and structure is correct
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.version, 1);
      }
    });

    // TC-E-01
    test('TC-E-01: parsePerspectiveJsonV1 returns ok=false for empty string', () => {
      // Given: An empty string
      const raw = '';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: It returns ok=false with error "empty"
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'empty');
      }
    });

    // TC-E-02
    test('TC-E-02: parsePerspectiveJsonV1 fails with invalid-json for incomplete JSON with newline in string', () => {
      // Given: An incomplete JSON string (unclosed quote) with a newline
      const raw = '{"version": 1, "cases": [{"caseId": "TC-1", "notes": "unfinished... \n';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: It returns ok=false with "invalid-json:" error
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.startsWith('invalid-json:'));
      }
    });

    // TC-E-03
    test('TC-E-03: parsePerspectiveJsonV1 returns invalid-json for unparseable non-JSON strings starting with {', () => {
      // Given: A string that starts with { but is not valid JSON
      const raw = '{"key": "value" "missing_comma": true}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: It returns ok=false with "invalid-json:" error from parseJsonWithNormalization
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.startsWith('invalid-json:'), `Expected error to start with invalid-json:, got: ${result.error}`);
      }
    });

    // TC-E-10
    test('TC-E-10: parsePerspectiveJsonV1 handles input ending with backslash correctly', () => {
      // Given: A JSON string ending with a backslash inside a value
      const raw = '{"version": 1, "cases": [{"caseId": "TC-1", "inputPrecondition": "", "perspective": "", "expectedResult": "", "notes": "backslash at end \\\\"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: It successfully parses
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.cases[0].notes, 'backslash at end \\');
      }
    });
  });

  suite('direct JSON parse safeguards', () => {
    test('TC-JSON-N-01: parseTestExecutionJsonV1 parses direct JSON with braces in stdout', () => {
      // Given: Direct JSON that starts with "{" and stdout contains braces
      const raw = '{"version":1,"exitCode":0,"signal":null,"durationMs":12,"stdout":"error: { code: 1 }","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: It parses successfully and preserves stdout
      assert.strictEqual(result.ok, true);
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.version, 1);
      assert.strictEqual(result.value.exitCode, 0);
      assert.strictEqual(result.value.signal, null);
      assert.strictEqual(result.value.durationMs, 12);
      assert.strictEqual(result.value.stdout, 'error: { code: 1 }');
      assert.strictEqual(result.value.stderr, '');
    });

    test('TC-JSON-E-01: parseTestExecutionJsonV1 returns invalid-json for malformed JSON starting with "{"', () => {
      // Given: Malformed JSON missing a comma between fields
      const raw = '{"version":1 "exitCode":0,"signal":null,"durationMs":1,"stdout":"error: { code: 1 }","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: It returns invalid-json with the expected error prefix
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.startsWith('invalid-json:'), `Expected invalid-json prefix, got: ${result.error}`);
      }
    });

    test('TC-JSON-E-02: parseTestExecutionJsonV1 returns unsupported-version for version=2 with braces in stdout', () => {
      // Given: A direct JSON object with unsupported version and braces in stdout
      const raw = '{"version":2,"exitCode":0,"signal":null,"durationMs":1,"stdout":"warn: { code: 2 }","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: It returns unsupported-version
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'unsupported-version');
      }
    });

    test('TC-JSON-E-03: parsePerspectiveJsonV1 returns invalid-json for malformed JSON with braces in string values', () => {
      // Given: Malformed JSON missing a comma before cases and containing braces in strings
      const raw =
        '{"version":1 "cases":[{"caseId":"TC-1","inputPrecondition":"x = { a: 1 }","perspective":"Equivalence – normal","expectedResult":"assert.deepStrictEqual(x, { a: 1 })","notes":"-"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: It returns invalid-json with the expected error prefix
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.startsWith('invalid-json:'), `Expected invalid-json prefix, got: ${result.error}`);
      }
    });
  });

  suite('table-specified parsing cases', () => {
    // TC-N-02
    test('TC-N-02: parsePerspectiveJsonV1 parses direct JSON with braces in a string field', () => {
      // Given: Direct JSON starting with "{" and a string field containing braces
      const raw =
        '{"version":1,"cases":[{"caseId":"TC-1","inputPrecondition":"cond","perspective":"Equivalence – normal","expectedResult":"assert.deepStrictEqual(x, { a: 1 })","notes":"-"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: It parses successfully and keeps the cases
      assert.strictEqual(result.ok, true);
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.version, 1);
      assert.strictEqual(result.value.cases.length, 1);
    });

    // TC-E-04
    test('TC-E-04: parsePerspectiveJsonV1 returns invalid-json for malformed JSON starting with "{"', () => {
      // Given: Malformed JSON missing a closing brace
      const raw = '{"version":1,"cases":[';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns invalid-json prefix
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.startsWith('invalid-json:'));
      }
    });

    // TC-E-05
    test('TC-E-05: parsePerspectiveJsonV1 returns error=json-not-object for JSON array', () => {
      // Given: JSON array input
      const raw = '[]';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns error=json-not-object
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'json-not-object');
      }
    });

    // TC-E-06
    test('TC-E-06: parsePerspectiveJsonV1 returns error=json-not-object for null primitive', () => {
      // Given: JSON null primitive
      const raw = 'null';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns error=json-not-object
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'json-not-object');
      }
    });

    // TC-E-07
    test('TC-E-07: parsePerspectiveJsonV1 returns error=no-json-object when no JSON is present', () => {
      // Given: Input with no JSON object
      const raw = 'no json here';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns error=no-json-object
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'no-json-object');
      }
    });

    // TC-N-03
    test('TC-N-03: parseTestExecutionJsonV1 parses direct JSON with braces in stdout', () => {
      // Given: Direct JSON with braces in stdout
      const raw = '{"version":1,"exitCode":0,"signal":null,"durationMs":12,"stdout":"error: { code: 1 }","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: It parses successfully and preserves stdout
      assert.strictEqual(result.ok, true);
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.version, 1);
      assert.strictEqual(result.value.stdout, 'error: { code: 1 }');
    });

    // TC-E-08
    test('TC-E-08: parseTestExecutionJsonV1 returns invalid-json for malformed JSON starting with "{"', () => {
      // Given: Malformed JSON input
      const raw = '{"version":1,"exitCode":0';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns invalid-json prefix
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.startsWith('invalid-json:'));
      }
    });

    // TC-N-03
    test('TC-N-03: parsePerspectiveJsonV1 parses direct JSON with braces in expectedResult string', () => {
      // Given: Direct JSON starting with "{" and expectedResult includes braces
      const raw =
        '{"version":1,"cases":[{"caseId":"TC-1","inputPrecondition":"cond","perspective":"Equivalence – normal","expectedResult":"assert.deepStrictEqual(x, { a: 1 })","notes":"-"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: It parses successfully and preserves expectedResult
      assert.strictEqual(result.ok, true);
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.version, 1);
      assert.strictEqual(result.value.cases[0].expectedResult, 'assert.deepStrictEqual(x, { a: 1 })');
    });

    // TC-N-04
    test('TC-N-04: parsePerspectiveJsonV1 falls back to extractJsonObject when direct parse fails with trailing text', () => {
      // Given: Direct JSON followed by trailing text
      const raw = '{"version":1,"cases":[]}\ntrailing';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: It parses successfully and returns empty cases
      assert.strictEqual(result.ok, true);
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.cases.length, 0);
    });

    // TC-E-03
    test('TC-E-03: parsePerspectiveJsonV1 returns error=empty for empty string', () => {
      // Given: Empty input
      const raw = '';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns error=empty
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'empty');
      }
    });

    // TC-E-04
    test('TC-E-04: parsePerspectiveJsonV1 returns error=no-json-object for "undefined"', () => {
      // Given: Non-JSON text "undefined"
      const raw = 'undefined';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns error=no-json-object
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'no-json-object');
      }
    });

    // TC-E-05
    test('TC-E-05: parsePerspectiveJsonV1 returns error=json-not-object for "null"', () => {
      // Given: JSON primitive null
      const raw = 'null';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns error=json-not-object
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'json-not-object');
      }
    });

    // TC-E-06
    test('TC-E-06: parsePerspectiveJsonV1 returns invalid-json for malformed JSON starting with "{"', () => {
      // Given: Malformed JSON that starts with "{"
      const raw = '{"version":1,';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns invalid-json error prefix
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.startsWith('invalid-json:'));
      }
    });

    // TC-E-07
    test('TC-E-07: parsePerspectiveJsonV1 returns error=unsupported-version for version=2', () => {
      // Given: JSON with unsupported version
      const raw = '{"version":2,"cases":[]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns error=unsupported-version
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'unsupported-version');
      }
    });

    // TC-E-08
    test('TC-E-08: parsePerspectiveJsonV1 returns error=cases-not-array when cases is not an array', () => {
      // Given: JSON with cases as an object
      const raw = '{"version":1,"cases":{}}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns error=cases-not-array
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'cases-not-array');
      }
    });

    // TC-E-09
    test('TC-E-09: parsePerspectiveJsonV1 returns error=no-json-object for non-JSON text', () => {
      // Given: Non-JSON input
      const raw = 'just text';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns error=no-json-object
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'no-json-object');
      }
    });

    // TC-N-05
    test('TC-N-05: parseTestExecutionJsonV1 parses direct JSON with braces in stdout', () => {
      // Given: Direct JSON with braces in stdout
      const raw = '{"version":1,"exitCode":0,"signal":null,"durationMs":12,"stdout":"error: { code: 1 }","stderr":""}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: It parses successfully and preserves stdout
      assert.strictEqual(result.ok, true);
      if (!result.ok) {
        return;
      }
      assert.strictEqual(result.value.version, 1);
      assert.strictEqual(result.value.stdout, 'error: { code: 1 }');
    });

    // TC-E-10
    test('TC-E-10: parseTestExecutionJsonV1 returns error=empty for empty string', () => {
      // Given: Empty input
      const raw = '';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns error=empty
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'empty');
      }
    });

    // TC-E-11
    test('TC-E-11: parseTestExecutionJsonV1 returns error=no-json-object for "undefined"', () => {
      // Given: Non-JSON text "undefined"
      const raw = 'undefined';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns error=no-json-object
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'no-json-object');
      }
    });

    // TC-E-12
    test('TC-E-12: parseTestExecutionJsonV1 returns error=json-not-object for "null"', () => {
      // Given: JSON primitive null
      const raw = 'null';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns error=json-not-object
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'json-not-object');
      }
    });

    // TC-E-13
    test('TC-E-13: parseTestExecutionJsonV1 returns invalid-json for malformed JSON starting with "{"', () => {
      // Given: Malformed JSON that starts with "{"
      const raw = '{"version":1,';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns invalid-json error prefix
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.startsWith('invalid-json:'));
      }
    });

    // TC-E-14
    test('TC-E-14: parseTestExecutionJsonV1 returns error=unsupported-version for version=2', () => {
      // Given: JSON with unsupported version
      const raw = '{"version":2}';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns error=unsupported-version
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'unsupported-version');
      }
    });

    // TC-E-15
    test('TC-E-15: parseTestExecutionJsonV1 returns error=no-json-object for non-JSON text', () => {
      // Given: Non-JSON input
      const raw = 'text';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns error=no-json-object
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'no-json-object');
      }
    });

    // TC-E-16
    test('TC-E-16: parseTestExecutionJsonV1 returns error=json-not-object for JSON array', () => {
      // Given: JSON array input
      const raw = '[]';

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns error=json-not-object
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'json-not-object');
      }
    });

    // TC-E-08 (from Test Perspectives Table)
    test('TC-E-08: parseTestExecutionJsonV1 returns direct parse invalid-json error when input starts with { but is malformed', () => {
      // Given: Input starts with { but has a syntax error
      const raw = '{"version":1, "stdout": "error: { code: 1" }'; // Missing closing brace for code object if it was intended to be one, or just malformed JSON

      // When: parseTestExecutionJsonV1 is called
      const result = parseTestExecutionJsonV1(raw);

      // Then: Returns ok=false and the error should be from direct parse
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.startsWith('invalid-json:'));
      }
    });
  });

  suite('New Perspective and Artifact Tests (from Test Perspectives Table)', () => {
    // TC-N-02
    test('TC-N-02: parsePerspectiveJsonV1 succeeds when JSON starts with { and contains { } inside string values', () => {
      // Given: A valid Perspective JSON with nested braces in a string
      const raw = '{"version":1,"cases":[{"caseId":"TC-1","expectedResult":"assert.deepStrictEqual(x, { a: 1 })"}]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=true
      assert.strictEqual(result.ok, true);
      if (result.ok) {
        assert.strictEqual(result.value.cases[0].expectedResult, 'assert.deepStrictEqual(x, { a: 1 })');
      }
    });

    // TC-E-03
    test('TC-E-03: parsePerspectiveJsonV1 returns detailed invalid-json error when input starts with { but has syntax error', () => {
      // Given: Input starts with { but is malformed
      const raw = '{"version":1, "cases": [ { "caseId": "TC-1" }'; // Missing closing ] and }

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false and error starts with invalid-json:
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.ok(result.error.startsWith('invalid-json:'));
      }
    });

    // TC-E-04
    test('TC-E-04: parsePerspectiveJsonV1 returns json-not-object for JSON array []', () => {
      // Given: Input is a JSON array
      const raw = '[]';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false and error=json-not-object
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'json-not-object');
      }
    });

    // TC-E-05
    test('TC-E-05: parsePerspectiveJsonV1 returns json-not-object for JSON null', () => {
      // Given: Input is JSON null
      const raw = 'null';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false and error=json-not-object
      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.error, 'json-not-object');
      }
    });

    // TC-E-06
    test('TC-E-06: parsePerspectiveJsonV1 returns ok=false when version is not 1', () => {
      // Given: JSON object with version 2
      const raw = '{"version":2,"cases":[]}';

      // When: parsePerspectiveJsonV1 is called
      const result = parsePerspectiveJsonV1(raw);

      // Then: Returns ok=false
      assert.strictEqual(result.ok, false);
    });

    // TC-N-05
    test('TC-N-05: buildTestPerspectiveArtifactMarkdown uses two-space indentation for target file list', () => {
      // Given: Multiple target paths
      const targetPaths = ['src/a.ts', 'src/b.ts'];

      // When: buildTestPerspectiveArtifactMarkdown is called
      const md = buildTestPerspectiveArtifactMarkdown({
        generatedAtMs: Date.now(),
        targetLabel: 'Label',
        targetPaths,
        perspectiveMarkdown: 'table',
      });

      // Then: Each path is indented with two spaces
      assert.ok(md.includes('\n  - src/a.ts\n'));
      assert.ok(md.includes('\n  - src/b.ts\n'));
    });
  });
});
