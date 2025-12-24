import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  getArtifactSettings,
  formatTimestamp,
  resolveDirAbsolute,
  saveTestPerspectiveTable,
  saveTestExecutionReport,
  buildTestPerspectiveArtifactMarkdown,
  buildTestExecutionArtifactMarkdown,
  parseMochaOutput,
} from '../../../core/artifacts';
import { stripAnsi } from '../../../core/testResultParser';

suite('core/artifacts.ts', () => {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

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
      assert.strictEqual(settings.testExecutionRunner, 'cursorAgent', 'デフォルトは cursorAgent であるべき');
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

  // TC-ART-06: 観点表Markdown生成（正常）
  test('TC-ART-06: 観点表Markdownが正しく生成される（正常系）', () => {
    // Given: 入力パラメータ
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs: Date.now(),
      targetLabel: 'Label',
      targetPaths: ['a.ts'],
      perspectiveMarkdown: 'content',
    });

    // Then: フォーマットが正しいこと
    assert.ok(md.includes('# テスト観点表（自動生成）'), 'タイトルが含まれること');
    assert.ok(md.includes('- 対象: Label'), '対象ラベルが含まれること');
    assert.ok(md.includes('content'), 'コンテンツが含まれること');
  });

  // TC-ART-07: 観点表Markdown生成（対象なし）
  test('TC-ART-07: 対象ファイルがない場合「(なし)」と表示される', () => {
    // Given: ターゲットリストが空
    const md = buildTestPerspectiveArtifactMarkdown({
      generatedAtMs: Date.now(),
      targetLabel: 'Label',
      targetPaths: [],
      perspectiveMarkdown: 'content',
    });

    // Then: (なし) と表示されること
    assert.ok(md.includes('- 対象ファイル:\n- (なし)'), '対象ファイルなしの表示が正しいこと');
  });

    // TC-ART-08: 実行レポートMarkdown生成（正常）
    test('TC-ART-08: 実行レポートMarkdownが正しく生成される（正常系）', () => {
      // Given: 正常終了時の結果
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
      assert.ok(md.includes('# テスト実行レポート（自動生成）'), 'タイトルが含まれること');
      assert.ok(md.includes('exitCode: 0'), 'exitCodeが含まれること');
      assert.ok(md.includes('## テスト結果サマリー'), 'サマリーセクションが含まれること');
      assert.ok(md.includes('status: executed'), 'status: executed が含まれること');
      assert.ok(md.includes('<summary>実行ログ（拡張機能）（クリックで展開）</summary>'), '実行ログセクションが含まれること');
      assert.ok(md.includes('[INFO] Extension Log'), '拡張機能ログが含まれること');
      // Added: model未指定時のデフォルト表示確認
      assert.ok(md.includes('- model: (auto)'), 'model未指定時は (auto) と表示されること');
    });

    // TC-ART-16: 実行レポートMarkdown生成（モデル指定あり）
    test('TC-ART-16: modelが指定されている場合、レポートにそのモデル名が表示される', () => {
      // Given: model指定あり
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
      assert.ok(md.includes('- model: gpt-4-custom'), '指定されたモデル名が表示されること');
    });

    // TC-ART-17: 実行レポートMarkdown生成（モデル空文字）
    test('TC-ART-17: modelが空文字の場合、(auto) と表示される', () => {
      // Given: modelが空文字
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
      assert.ok(md.includes('- model: (auto)'), 'modelが空白のみの場合は (auto) と表示されること');
    });

  // TC-ART-09: 実行レポートMarkdown生成（エラー）
  test('TC-ART-09: エラーメッセージがある場合レポートに含まれる', () => {
    // Given: エラー時の結果
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
    assert.ok(md.includes('spawn error: Spawn failed'), 'エラーメッセージが含まれること');
  });

  // TC-ART-10: 実行レポートMarkdown生成（空出力）
  test('TC-ART-10: 出力が空の場合は折りたたみセクションが省略される', () => {
    // Given: 出力が空の結果
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
    assert.ok(md.includes('## テスト結果サマリー'), 'サマリーセクションは含まれること');
    assert.ok(md.includes('## 詳細ログ'), '詳細ログセクションヘッダーは含まれること');
  });

  // TC-ART-13: 実行レポートMarkdown生成（スキップ）
  test('TC-ART-13: スキップ時は status と skipReason、extensionLog がレポートに含まれる', () => {
    // Given: スキップされた結果（ログあり）
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
    assert.ok(md.includes('status: skipped'), 'status: skipped が含まれること');
    assert.ok(md.includes('skipReason: 安全のためスキップしました'), 'skipReason が含まれること');
    
    // And: 実行ログが折りたたみセクションとして含まれること
    assert.ok(md.includes('<summary>実行ログ（拡張機能）（クリックで展開）</summary>'), '実行ログセクションが含まれること');
    assert.ok(md.includes('[INFO] Something happened'), 'ログ内容が含まれること');
  });

  // TC-ART-14: 実行レポートMarkdown生成（ログなし）
  test('TC-ART-14: extensionLog が未定義の場合、折りたたみセクションが省略される', () => {
    // Given: extensionLog が undefined の結果
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
    assert.ok(!md.includes('<summary>実行ログ（拡張機能）'), '空のログセクションは省略されること');
    // 基本情報は含まれること
    assert.ok(md.includes('## 詳細ログ'), '詳細ログセクションヘッダーは含まれること');
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
    assert.ok(!md.includes('<summary>実行ログ（拡張機能）'), '空のログセクションは省略されること');
  });

  // TC-ART-18: レポート生成時にANSIエスケープシーケンスが除去される
  test('TC-ART-18: レポート生成時にANSIエスケープシーケンスが除去される', () => {
    // Given: ANSIカラーコードを含む出力
    const ansiText = '\u001b[31mRed Error\u001b[0m';
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
    assert.ok(md.includes('| スイート | テスト名 | 結果 |'), 'テーブルヘッダが含まれること');
    assert.ok(md.includes('| test passed | ✅ |'), '成功行が含まれること');
    assert.ok(md.includes('| test failed | ❌ |'), '失敗行が含まれること');
  });

  // TC-ART-28: パイプ文字エスケープ
  test('TC-ART-28: テスト名にパイプが含まれる場合エスケープされる', () => {
    // Given: パイプを含むテスト名
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
});
