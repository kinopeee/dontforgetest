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
} from '../../../core/artifacts';

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
      },
    });

    // Then: フォーマットが正しく、終了コードや出力が含まれること
    assert.ok(md.includes('# テスト実行レポート（自動生成）'), 'タイトルが含まれること');
    assert.ok(md.includes('exitCode: 0'), 'exitCodeが含まれること');
    assert.ok(md.includes('```text\nout\n```'), 'stdoutブロックが含まれること');
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
  test('TC-ART-10: 出力が空の場合でもコードブロックが生成される', () => {
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

    // Then: 空のコードブロックが含まれること
    assert.ok(md.includes('## stdout\n```text\n\n```'), '空のstdoutブロックが含まれること');
    assert.ok(md.includes('## stderr\n```text\n\n```'), '空のstderrブロックが含まれること');
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
});
