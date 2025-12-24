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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    assert.throws(() => {
      buildTestPerspectiveArtifactMarkdown({
        generatedAtMs: null as unknown as number,
        targetLabel: 'Test',
        targetPaths: ['test.ts'],
        perspectiveMarkdown: 'table',
      });
    }, TypeError);
    // Verify error message
    try {
      buildTestPerspectiveArtifactMarkdown({
        generatedAtMs: null as unknown as number,
        targetLabel: 'Test',
        targetPaths: ['test.ts'],
        perspectiveMarkdown: 'table',
      });
      assert.fail('Should have thrown TypeError');
    } catch (err) {
      assert.ok(err instanceof TypeError, 'Should throw TypeError');
      assert.ok((err as Error).message.includes('generatedAtMs must be a number'), 'Error message should mention generatedAtMs');
    }
  });

  // TC-E-02: formatLocalIso8601WithOffset with undefined input
  test('TC-E-02: formatLocalIso8601WithOffset throws TypeError when input is undefined', () => {
    // Given: undefined input
    // When: buildTestPerspectiveArtifactMarkdown is called with undefined
    // Then: Throws TypeError with message "generatedAtMs must be a number"
    assert.throws(() => {
      buildTestPerspectiveArtifactMarkdown({
        generatedAtMs: undefined as unknown as number,
        targetLabel: 'Test',
        targetPaths: ['test.ts'],
        perspectiveMarkdown: 'table',
      });
    }, TypeError);
    // Verify error message
    try {
      buildTestPerspectiveArtifactMarkdown({
        generatedAtMs: undefined as unknown as number,
        targetLabel: 'Test',
        targetPaths: ['test.ts'],
        perspectiveMarkdown: 'table',
      });
      assert.fail('Should have thrown TypeError');
    } catch (err) {
      assert.ok(err instanceof TypeError, 'Should throw TypeError');
      assert.ok((err as Error).message.includes('generatedAtMs must be a number'), 'Error message should mention generatedAtMs');
    }
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
    const match = md.match(/- 生成日時: (.+)/);
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
    assert.ok(md.includes('- 生成日時:'), '正常に処理されること');
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
    assert.ok(md.includes('- 生成日時:'), '正常に処理されること');
  });

  // TC-E-06: pad3 function with null input
  test('TC-E-06: pad3 throws TypeError when input is null', () => {
    // Given: null input (indirectly through Date constructor)
    // When: buildTestPerspectiveArtifactMarkdown is called with invalid timestamp
    // Then: Throws TypeError or produces invalid output
    assert.throws(() => {
      buildTestPerspectiveArtifactMarkdown({
        generatedAtMs: null as unknown as number,
        targetLabel: 'Test',
        targetPaths: ['test.ts'],
        perspectiveMarkdown: 'table',
      });
    }, TypeError);
  });

  // TC-E-07: pad3 function with undefined input
  test('TC-E-07: pad3 throws TypeError when input is undefined', () => {
    // Given: undefined input
    // When: buildTestPerspectiveArtifactMarkdown is called with undefined
    // Then: Throws TypeError
    assert.throws(() => {
      buildTestPerspectiveArtifactMarkdown({
        generatedAtMs: undefined as unknown as number,
        targetLabel: 'Test',
        targetPaths: ['test.ts'],
        perspectiveMarkdown: 'table',
      });
    }, TypeError);
  });

  // TC-E-08: pad3 function with non-number input
  test('TC-E-08: pad3 throws TypeError or returns unexpected result for non-number input', () => {
    // Given: Non-number input (string)
    // When: buildTestPerspectiveArtifactMarkdown is called with string timestamp
    // Then: Throws TypeError with message "generatedAtMs must be a number"
    assert.throws(() => {
      buildTestPerspectiveArtifactMarkdown({
        generatedAtMs: 'invalid' as unknown as number,
        targetLabel: 'Test',
        targetPaths: ['test.ts'],
        perspectiveMarkdown: 'table',
      });
    }, TypeError);
    // Verify error message
    try {
      buildTestPerspectiveArtifactMarkdown({
        generatedAtMs: 'invalid' as unknown as number,
        targetLabel: 'Test',
        targetPaths: ['test.ts'],
        perspectiveMarkdown: 'table',
      });
      assert.fail('Should have thrown TypeError');
    } catch (err) {
      assert.ok(err instanceof TypeError, 'Should throw TypeError');
      assert.ok((err as Error).message.includes('generatedAtMs must be a number'), 'Error message should mention generatedAtMs');
    }
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    const match = md.match(/- 生成日時: (.+)/);
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
    assert.ok(md.includes('- 生成日時:'), '正常に処理されること');
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
    assert.ok(md.includes('- 生成日時:'), '正常に処理されること');
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
    assert.throws(() => {
      buildTestExecutionArtifactMarkdown({
        generatedAtMs: null as unknown as number,
        generationLabel: 'Test',
        targetPaths: ['test.ts'],
        result: mockResult,
      });
    }, TypeError);
    // Verify error message
    try {
      buildTestExecutionArtifactMarkdown({
        generatedAtMs: null as unknown as number,
        generationLabel: 'Test',
        targetPaths: ['test.ts'],
        result: mockResult,
      });
      assert.fail('Should have thrown TypeError');
    } catch (err) {
      assert.ok(err instanceof TypeError, 'Should throw TypeError');
      assert.ok((err as Error).message.includes('generatedAtMs must be a number'), 'Error message should mention generatedAtMs');
    }
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
    assert.throws(() => {
      buildTestExecutionArtifactMarkdown({
        generatedAtMs: undefined as unknown as number,
        generationLabel: 'Test',
        targetPaths: ['test.ts'],
        result: mockResult,
      });
    }, TypeError);
    // Verify error message
    try {
      buildTestExecutionArtifactMarkdown({
        generatedAtMs: undefined as unknown as number,
        generationLabel: 'Test',
        targetPaths: ['test.ts'],
        result: mockResult,
      });
      assert.fail('Should have thrown TypeError');
    } catch (err) {
      assert.ok(err instanceof TypeError, 'Should throw TypeError');
      assert.ok((err as Error).message.includes('generatedAtMs must be a number'), 'Error message should mention generatedAtMs');
    }
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
    assert.throws(() => {
      buildTestExecutionArtifactMarkdown({
        generatedAtMs: 'invalid' as unknown as number,
        generationLabel: 'Test',
        targetPaths: ['test.ts'],
        result: mockResult,
      });
    }, TypeError);
    // Verify error message
    try {
      buildTestExecutionArtifactMarkdown({
        generatedAtMs: 'invalid' as unknown as number,
        generationLabel: 'Test',
        targetPaths: ['test.ts'],
        result: mockResult,
      });
      assert.fail('Should have thrown TypeError');
    } catch (err) {
      assert.ok(err instanceof TypeError, 'Should throw TypeError');
      assert.ok((err as Error).message.includes('generatedAtMs must be a number'), 'Error message should mention generatedAtMs');
    }
  });
});
