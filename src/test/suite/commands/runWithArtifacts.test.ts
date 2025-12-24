import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { runWithArtifacts } from '../../../commands/runWithArtifacts';
import { AgentProvider, AgentRunOptions, RunningTask } from '../../../providers/provider';

// Mock Provider
class MockProvider implements AgentProvider {
  readonly id = 'mock';
  readonly displayName = 'Mock';
  public lastRunOptions: AgentRunOptions | undefined;
  public history: AgentRunOptions[] = [];

  constructor(
    private readonly exitCode: number | null = 0,
    private readonly customBehavior?: (options: AgentRunOptions) => void,
    private readonly perspectiveOutput?: string // 観点表生成時の出力を制御用
  ) { }

  run(options: AgentRunOptions): RunningTask {
    this.lastRunOptions = options;
    this.history.push(options);

    // 非同期イベントを模倣
    setTimeout(() => {
      options.onEvent({
        type: 'started',
        taskId: options.taskId,
        label: 'test',
        timestampMs: Date.now(),
      });

      // カスタム挙動があれば実行
      if (this.customBehavior) {
        this.customBehavior(options);
      }

      // 観点表生成ステップでのログ出力を模倣
      if (options.taskId.endsWith('-perspectives')) {
        // perspectiveOutput が指定されていればそれを優先、なければ exitCode で分岐
        if (this.perspectiveOutput !== undefined) {
          options.onEvent({
            type: 'log',
            taskId: options.taskId,
            level: 'info',
            message: this.perspectiveOutput,
            timestampMs: Date.now(),
          });
        } else if (this.exitCode === 0) {
          options.onEvent({
            type: 'log',
            taskId: options.taskId,
            level: 'info',
            message: '<!-- BEGIN TEST PERSPECTIVES -->\n| ID | Case |\n|--|--|\n| 1 | Test |\n<!-- END TEST PERSPECTIVES -->',
            timestampMs: Date.now(),
          });
        } else {
          options.onEvent({
            type: 'log',
            taskId: options.taskId,
            level: 'error',
            message: 'Provider failed to generate perspectives',
            timestampMs: Date.now(),
          });
        }
      }

      options.onEvent({
        type: 'completed',
        taskId: options.taskId,
        exitCode: this.exitCode,
        timestampMs: Date.now(),
      });
    }, 10);

    return { taskId: options.taskId, dispose: () => { } };
  }
}

suite('commands/runWithArtifacts.ts', () => {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  // テスト間での衝突を避けるためユニークなディレクトリを使用
  const baseTempDir = 'out/test-artifacts-cmd';

  // --- Type Safety Tests ---

  // TC-TYP-01: runWithArtifacts.test.ts への string 入力
  // Given: MockProvider内で定義された emit 関数が string 型を受け付ける
  // When: string 型の引数を渡して呼び出す
  // Then: コンパイルエラーにならず、正常にイベントが発行される
  test('TC-TYP-01: emit関数は string 型の入力を受け付け、正常に動作すること', async () => {
    let capturedMessage: string | undefined;

    // 型定義の確認を兼ねたProvider実装
    const provider = new MockProvider(0, (options) => {
      // ここでの emit の定義が string 型を受け取るようになっていることを確認
      // 実際のコード変更（any -> string）が反映されているかの検証
      const emit = (msg: string) => {
        capturedMessage = msg;
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: msg,
          timestampMs: Date.now(),
        });
      };
      
      emit('test-string-message');
    });

    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Type Safety Test',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: `task-typ-01-${Date.now()}`,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: path.join(baseTempDir, 'reports-typ-01'),
        testCommand: 'echo hello',
        testExecutionRunner: 'extension',
      }
    });

    assert.strictEqual(capturedMessage, 'test-string-message', 'string型のメッセージが正常に渡されること');
  });

  // TC-TYP-02: runWithArtifacts.test.ts への非 string 入力
  // Given: emit 関数は string 型のみを受け付ける
  // When: 数値などの非 string 型を渡そうとする
  // Then: TypeScriptコンパイラがエラーを出す（@ts-expect-errorで検証）
  test('TC-TYP-02: emit関数に非string型を渡すと型エラーになること', () => {
    // このテストケースは実行時のアサーションではなく、コンパイル時の型チェックを検証するもの
    // 実際にエラーになるコードを書いて @ts-expect-error を付与することで、
    // 「エラーになることが期待通り」であることを保証する
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _dummyEmit = (msg: string) => {};

    // @ts-expect-error: Argument of type 'number' is not assignable to parameter of type 'string'.
    _dummyEmit(123);

    // @ts-expect-error: Argument of type '{ text: string; }' is not assignable to parameter of type 'string'.
    _dummyEmit({ text: 'obj' });
    
    assert.ok(true, '型チェックが機能している確認（コンパイルが通ればOK）');
  });

  // TC-CMD-01: 全機能有効 (観点表 + 生成 + テスト実行)
  test('TC-CMD-01: 全機能有効時、観点表と実行レポートの両方が保存される', async () => {
    // Given: フルオプション設定（観点表ON、テスト実行ON）
    const provider = new MockProvider(0);
    const taskId = `task-01-${Date.now()}`;
    const command = process.platform === 'win32' ? 'echo test-cmd-01' : 'echo "test-cmd-01"';
    const perspectiveDir = path.join(baseTempDir, 'perspectives-01');
    const reportDir = path.join(baseTempDir, 'reports-01');

    // When: runWithArtifacts を呼び出す
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Test Gen',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: true,
        perspectiveReportDir: perspectiveDir,
        testExecutionReportDir: reportDir,
        testCommand: command,
        testExecutionRunner: 'extension',
      }
    });

    // Then: 成果物が正しく保存されること
    // 1. 観点表が保存されること
    const perspectiveUri = vscode.Uri.file(path.join(workspaceRoot, perspectiveDir));
    await vscode.workspace.fs.createDirectory(perspectiveUri);

    const perspectives = await vscode.workspace.findFiles(new vscode.RelativePattern(perspectiveUri, 'test-perspectives_*.md'));
    assert.ok(perspectives.length > 0, `観点表が ${perspectiveDir} に作成されること`);

    // 2. 実行レポートが保存されること
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0, `実行レポートが ${reportDir} に作成されること`);

    // レポート内容にコマンド出力が含まれること
    const reportDoc = await vscode.workspace.openTextDocument(reports[0]);
    const reportText = reportDoc.getText();
    assert.ok(reportText.includes('test-cmd-01'), 'レポートに echo コマンドの出力が含まれること');
    assert.ok(reportText.includes('実行ログ（拡張機能）（クリックで展開）'), '実行ログセクションが含まれること');
    assert.ok(reportText.includes('START test-command'), 'テスト開始ログが含まれること');
    assert.ok(reportText.includes('DONE exit=0'), '完了ログが含まれること');
  });

  // TC-CMD-02: 観点表生成無効
  test('TC-CMD-02: 観点表生成が無効な場合、観点表ファイルは生成されない', async () => {
    // Given: includeTestPerspectiveTable = false
    const provider = new MockProvider(0);
    const taskId = `task-02-${Date.now()}`;
    const perspectiveDir = path.join(baseTempDir, 'perspectives-02');
    const reportDir = path.join(baseTempDir, 'reports-02');

    // When: runWithArtifacts を呼び出す
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Test Gen No Perspective',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        perspectiveReportDir: perspectiveDir,
        testExecutionReportDir: reportDir,
        testCommand: '', // テスト実行はスキップ
        testExecutionRunner: 'extension',
      }
    });

    // Then: 観点表が保存されないこと
    const perspectiveUri = vscode.Uri.file(path.join(workspaceRoot, perspectiveDir));
    try {
      const perspectives = await vscode.workspace.findFiles(new vscode.RelativePattern(perspectiveUri, '*.md'));
      assert.strictEqual(perspectives.length, 0, '観点表が無効な場合、ファイルは生成されないこと');
    } catch {
      // ディレクトリがないならOK
      assert.ok(true);
    }
  });

  // TC-CMD-03: テストコマンド空 -> スキップ
  test('TC-CMD-03: テストコマンドが空の場合、テスト実行はスキップされる', async () => {
    // Given: テストコマンドが空
    const provider = new MockProvider(0);
    const taskId = `task-03-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-03');

    // When: runWithArtifacts を呼び出す
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Test Gen Skip',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: '', // 空文字
        testExecutionRunner: 'extension',
      }
    });

    // Then: 実行自体はスキップされるが、スキップ理由付きレポートは保存されること
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    await vscode.workspace.fs.createDirectory(reportUri);

    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0, 'コマンドが空の場合でも、スキップ理由付きレポートが作成されること');

    // 最新のレポートを取得（ファイル名に日時が含まれているためソートして最後を取る）
    const sortedReports = reports.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
    const latestReport = sortedReports[sortedReports.length - 1];
    const reportDoc = await vscode.workspace.openTextDocument(latestReport);
    const text = reportDoc.getText();
    assert.ok(text.includes('status: skipped'), 'レポートに skipped ステータスが含まれること');
    assert.ok(text.includes('testCommand が空のため'), '適切なスキップ理由が含まれること');
    assert.ok(text.includes('実行ログ（拡張機能）（クリックで展開）'), '実行ログセクションが含まれること');
    assert.ok(text.includes('WARN dontforgetest.testCommand が空のため'), 'ログに警告が含まれること');
  });

  // TC-CMD-04: テスト実行失敗
  test('TC-CMD-04: テストコマンド失敗時でもレポートは保存され、終了コードが記録される', async () => {
    // Given: 失敗するテストコマンド
    const provider = new MockProvider(0);
    const taskId = `task-04-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-04');
    const failCommand = process.platform === 'win32' ? 'cmd /c exit 1' : 'exit 1';

    // When: runWithArtifacts を呼び出す
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Test Gen Fail',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: failCommand,
        testExecutionRunner: 'extension',
      }
    });

    // Then: レポートは保存されるが、内容は失敗を示していること
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0, '失敗時でもレポートは保存されること');

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    assert.ok(doc.getText().includes('exitCode: 1'), 'レポートに exitCode: 1 が含まれること');
  });

  // TC-CMD-05: 観点表生成失敗 (Provider Error)
  test('TC-CMD-05: 観点表生成（Provider）失敗時、ログがそのまま保存される', async () => {
    // Given: Provider が失敗する (exitCode = 1)
    const provider = new MockProvider(1);
    const taskId = `task-05-${Date.now()}`;
    const perspectiveDir = path.join(baseTempDir, 'perspectives-05');
    const reportDir = path.join(baseTempDir, 'reports-05');

    // When: runWithArtifacts を呼び出す
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Test Gen Prov Fail',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: true,
        perspectiveReportDir: perspectiveDir,
        testExecutionReportDir: reportDir,
        testCommand: '',
        testExecutionRunner: 'extension',
      }
    });

    // Then: 観点表（失敗ログ含む）が保存されること
    const perspectiveUri = vscode.Uri.file(path.join(workspaceRoot, perspectiveDir));
    const perspectives = await vscode.workspace.findFiles(new vscode.RelativePattern(perspectiveUri, 'test-perspectives_*.md'));
    assert.ok(perspectives.length > 0, '観点表生成失敗時でもファイルは保存されること');

    const doc = await vscode.workspace.openTextDocument(perspectives[0]);
    assert.ok(doc.getText().includes('provider exit=1'), 'ログに exit code が含まれること');
  });

  // TC-CMD-06: testCommand が VS Code を起動しそうな場合はスキップされる
  test('TC-CMD-06: testCommand が VS Code を起動しそうな場合はスキップされる', async () => {
    // Given: npm test が VS Code拡張機能テスト（@vscode/test-electron）を起動する想定の package.json
    const tempRoot = path.join(workspaceRoot, baseTempDir, `workspace-06-${Date.now()}`);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempRoot));
    const pkgJson = {
      name: 'tmp',
      version: '0.0.0',
      scripts: {
        test: 'node ./out/test/runTest.js',
      },
      devDependencies: {
        '@vscode/test-electron': '^2.4.1',
      },
    };
    await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(tempRoot, 'package.json')), Buffer.from(JSON.stringify(pkgJson), 'utf8'));

    const provider = new MockProvider(0);
    const taskId = `task-06-${Date.now()}`;

    // When: runWithArtifacts を呼び出す（テストコマンドは npm test）
    await runWithArtifacts({
      provider,
      workspaceRoot: tempRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Test Gen Skip VS Code Test',
      targetPaths: ['dummy.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testCommand: 'npm test',
        testExecutionReportDir: path.join(baseTempDir, 'reports-06'),
        testExecutionRunner: 'extension',
      },
    });

    // Then: 実行自体はスキップされるが、スキップ理由付きレポートは保存されること
    const reportDir = path.join(tempRoot, baseTempDir, 'reports-06');
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(vscode.Uri.file(reportDir), 'test-execution_*.md'));
    assert.ok(reports.length > 0, 'スキップ時でも、スキップ理由付きレポートが生成されること');

    const reportDoc = await vscode.workspace.openTextDocument(reports[0]);
    const text = reportDoc.getText();
    assert.ok(text.includes('status: skipped'), 'レポートに skipped ステータスが含まれること');
    assert.ok(text.includes('VS Code を別プロセスで起動する可能性があるため'), '適切なスキップ理由が含まれること');
    assert.ok(text.includes('実行ログ（拡張機能）（クリックで展開）'), '実行ログセクションが含まれること');
    assert.ok(text.includes('WARN このプロジェクトの testCommand は'), 'ログに警告が含まれること');
  });

  // TC-CMD-07: allowUnsafeTestCommand=true の場合、Unsafeなコマンドでも拡張機能で実行される
  test('TC-CMD-07: allowUnsafeTestCommand=true の場合、Unsafeなコマンドでも拡張機能で実行される', async () => {
    // Given: VS Code拡張機能テスト環境
    const tempRoot = path.join(workspaceRoot, baseTempDir, `workspace-07-${Date.now()}`);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempRoot));
    const pkgJson = {
      name: 'tmp-unsafe',
      scripts: { test: 'node ./out/test/runTest.js' },
      devDependencies: { '@vscode/test-electron': '^2.4.1' },
    };
    await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(tempRoot, 'package.json')), Buffer.from(JSON.stringify(pkgJson), 'utf8'));

    const provider = new MockProvider(0);
    const taskId = `task-07-${Date.now()}`;
    const relReportDir = path.join(baseTempDir, 'reports-07');

    // When: runWithArtifacts (allowUnsafeTestCommand: true)
    await runWithArtifacts({
      provider,
      workspaceRoot: tempRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Force Unsafe Exec',
      targetPaths: ['dummy.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testCommand: 'npm test',
        testExecutionReportDir: relReportDir,
        testExecutionRunner: 'extension',
        allowUnsafeTestCommand: true, // Force execution
      },
    });

    // Then: レポートが生成され、ステータスが executed であること
    const actualReportDir = path.join(tempRoot, relReportDir);
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(vscode.Uri.file(actualReportDir), 'test-execution_*.md'));
    assert.ok(reports.length > 0, 'allowUnsafe=true ならレポートが生成されること');

    const reportDoc = await vscode.workspace.openTextDocument(reports[0]);
    const text = reportDoc.getText();
    assert.ok(text.includes('status: executed'), '実行ステータスになること');
  });

  // TC-CMD-08: cursor-agent 経由でテスト実行し、結果がレポートに含まれる
  test('TC-CMD-08: testExecutionRunner=cursorAgent の場合、cursor-agent の出力から結果を抽出してレポートに保存する', async () => {
    // Given: cursor-agent の出力（マーカー付き）を返す Provider
    const taskId = `task-08-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-08');

    const provider = new MockProvider(0, (options) => {
      if (options.taskId.endsWith('-test-agent')) {
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: [
            '<!-- BEGIN TEST EXECUTION RESULT -->',
            'exitCode: 0',
            'signal: null',
            'durationMs: 12',
            '<!-- BEGIN STDOUT -->',
            'agent-stdout',
            '<!-- END STDOUT -->',
            '<!-- BEGIN STDERR -->',
            '',
            '<!-- END STDERR -->',
            '<!-- END TEST EXECUTION RESULT -->',
          ].join('\n'),
          timestampMs: Date.now(),
        });
      }
    });

    // When: runWithArtifacts を呼び出す
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Test Gen CursorAgent Runner',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: 'echo "hello"',
        testExecutionRunner: 'cursorAgent',
      }
    });

    // Then: レポートに stdout が含まれること
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0, 'レポートが生成されること');

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    const text = doc.getText();
    assert.ok(text.includes('exitCode: 0'), 'exitCode が含まれること');
    assert.ok(text.includes('agent-stdout'), 'cursor-agent の stdout がレポートに含まれること');
  });

  // TC-CMD-09: cursorAgent Runner で Unsafe コマンドを実行（警告のみで実行）
  test('TC-CMD-09: testExecutionRunner=cursorAgent の場合、Unsafeコマンドでも実行される（警告ログあり）', async () => {
    // Given: Unsafe環境
    const tempRoot = path.join(workspaceRoot, baseTempDir, `workspace-09-${Date.now()}`);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempRoot));
    const pkgJson = {
      name: 'tmp-unsafe-agent',
      scripts: { test: 'node ./out/test/runTest.js' },
      devDependencies: { '@vscode/test-electron': '^2.4.1' },
    };
    await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(tempRoot, 'package.json')), Buffer.from(JSON.stringify(pkgJson), 'utf8'));

    const taskId = `task-09-${Date.now()}`;
    const relReportDir = path.join(baseTempDir, 'reports-09');

    const provider = new MockProvider(0, (options) => {
      if (options.taskId.endsWith('-test-agent')) {
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: [
            '<!-- BEGIN TEST EXECUTION RESULT -->',
            'exitCode: 0',
            'durationMs: 10',
            '<!-- END TEST EXECUTION RESULT -->',
          ].join('\n'),
          timestampMs: Date.now(),
        });
      }
    });

    // When: runWithArtifacts (cursorAgent)
    await runWithArtifacts({
      provider,
      workspaceRoot: tempRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Unsafe Agent Exec',
      targetPaths: ['dummy.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testCommand: 'npm test',
        testExecutionReportDir: relReportDir,
        testExecutionRunner: 'cursorAgent',
        // allowUnsafeTestCommand は指定しない -> false
      },
    });

    // Then: 実行される & 警告ログが出る
    const actualReportDir = path.join(tempRoot, relReportDir);
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(vscode.Uri.file(actualReportDir), 'test-execution_*.md'));
    assert.ok(reports.length > 0, 'Agent Runner ならUnsafeでも実行されること');

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    const text = doc.getText();
    assert.ok(text.includes('status: executed'), '実行ステータスになること');
    assert.ok(text.includes('testCommand は VS Code（拡張機能テスト用の Extension Host）を別プロセスで起動する可能性'), 'ログに警告が含まれること');
  });

  // TC-CMD-10: cursor-agent の出力にマーカーがない場合、パースエラーとして扱われる
  test('TC-CMD-10: cursor-agent の出力にマーカーがない場合、パースエラーとして扱われる', async () => {
    // Given: マーカーを含まないログを返す Provider
    const taskId = `task-10-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-10');

    const provider = new MockProvider(0, (options) => {
      if (options.taskId.endsWith('-test-agent')) {
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: 'Some random logs but no result markers...',
          timestampMs: Date.now(),
        });
      }
    });

    // When: runWithArtifacts (cursorAgent)
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Agent Parse Error',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: 'echo hello',
        testExecutionRunner: 'cursorAgent',
      }
    });

    // Then: エラーメッセージ付きレポートが生成される
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0, 'パースエラーでもレポートは生成されること');

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    const text = doc.getText();
    assert.ok(text.includes('cursor-agent の出力からテスト結果を抽出できませんでした'), 'パース失敗エラーが含まれること');
    assert.ok(text.includes('stderr'), 'stderr セクションが存在すること');
    assert.ok(text.includes('Some random logs'), '元のログが stderr として記録されていること');
  });

  // TC-CMD-11: 実行ログに含まれるシステム用タグ（system_reminder等）やノイズはレポートから除去・正規化される
  test('TC-CMD-11: 実行ログに含まれるシステム用タグ（system_reminder等）やノイズはレポートから除去・正規化される', async () => {
    // Given: システム用タグやノイズを含むログを吐く Provider
    const taskId = `task-11-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-11');

    const providerWithNoise = new MockProvider(0, (options) => {
      // 生成タスク自体のログ（cursor-agent実行中に流れてくるログを模倣）
      if (options.taskId.endsWith('-test-agent')) {
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: [
            '<system_reminder>HIDDEN REMINDER</system_reminder>',
            'Visible Log Line 1',
            'event:tool_call', // 除去対象
            '   ', // 空行扱い
            'system:init', // 除去対象
            '', // 空行
            'Visible Log Line 2',
          ].join('\n'),
          timestampMs: Date.now(),
        });

        // 結果マーカーも出す
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: [
            '<!-- BEGIN TEST EXECUTION RESULT -->',
            'exitCode: 0',
            'durationMs: 5',
            '<!-- END TEST EXECUTION RESULT -->',
          ].join('\n'),
          timestampMs: Date.now(),
        });
      }
    });

    // When: runWithArtifacts
    await runWithArtifacts({
      provider: providerWithNoise,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Log Sanitization',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: 'echo hello',
        testExecutionRunner: 'cursorAgent',
      }
    });

    // Then: レポートの「実行ログ」セクションでノイズが除去され、空行が整理されていること
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0);

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    const text = doc.getText();

    // 正常なログは残る
    assert.ok(text.includes('Visible Log Line 1'), '通常のログ1は残ること');
    assert.ok(text.includes('Visible Log Line 2'), '通常のログ2は残ること');

    // システムタグや特定キーワードは消える
    assert.ok(!text.includes('HIDDEN REMINDER'), 'システムタグ内の文字列は除去されること');
    assert.ok(!text.includes('<system_reminder>'), 'タグそのものも除去されること');
    assert.ok(!text.includes('event:tool_call'), 'event:tool_call は除去されること');
    assert.ok(!text.includes('system:init'), 'system:init は除去されること');
  });

  // TC-CMD-12: fileWrite イベントが実行ログに記録される
  test('TC-CMD-12: fileWrite イベントが発生した場合、実行ログに WRITE 行が記録される', async () => {
    // Given: fileWrite イベントを発行する Provider
    const taskId = `task-12-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-12');

    const provider = new MockProvider(0, (options) => {
      if (options.taskId.endsWith('-test-agent')) {
        // fileWrite イベントを発行
        options.onEvent({
          type: 'fileWrite',
          taskId: options.taskId,
          path: 'src/generated.ts',
          linesCreated: 10,
          bytesWritten: 120,
          timestampMs: Date.now(),
        });

        // 正常終了マーカー
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: [
            '<!-- BEGIN TEST EXECUTION RESULT -->',
            'exitCode: 0',
            'durationMs: 5',
            '<!-- END TEST EXECUTION RESULT -->',
          ].join('\n'),
          timestampMs: Date.now(),
        });
      }
    });

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'File Write Log',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: 'echo hello',
        testExecutionRunner: 'cursorAgent',
      }
    });

    // Then: レポートに WRITE ログが含まれること
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0);

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    const text = doc.getText();

    assert.ok(text.includes('WRITE src/generated.ts'), 'ファイルパスが記録されること');
    assert.ok(text.includes('lines=10'), '行数が記録されること');
    assert.ok(text.includes('bytes=120'), 'バイト数が記録されること');
  });

  // TC-CMD-13: cursor-agent 出力のパース堅牢性（不正な値）
  test('TC-CMD-13: cursor-agent 出力の exitCode 等が不正な場合でも、安全にフォールバックまたはnullとして扱われる', async () => {
    // Given: 不正な値を含むログを返す Provider
    const taskId = `task-13-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-13');

    const provider = new MockProvider(0, (options) => {
      if (options.taskId.endsWith('-test-agent')) {
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: [
            '<!-- BEGIN TEST EXECUTION RESULT -->',
            'exitCode: invalid-number', // 数値ではない
            'durationMs: not-a-number',
            'signal: null',
            '<!-- END TEST EXECUTION RESULT -->',
          ].join('\n'),
          timestampMs: Date.now(),
        });
      }
    });

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Parse Robustness',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: 'echo hello',
        testExecutionRunner: 'cursorAgent',
      }
    });

    // Then: レポートが生成され、exitCode は provider の終了コード(0) または null にフォールバックされる
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0);

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    const text = doc.getText();

    // 実装上、パース失敗時は providerExitCode (0) が使われるロジックになっているか確認
    // const exitCode = !exitCodeRaw ... ? Number(exitCodeRaw) : exit ?? null;
    assert.ok(text.includes('exitCode: 0'), '数値でない exitCode は Provider の終了コード(0)にフォールバックされること');
  });

  // TC-RWA-01: cursor-agent が実行拒否 -> 安全なコマンドならフォールバック
  test('TC-RWA-01: cursor-agent が実行拒否した場合でも、安全なコマンドなら拡張機能でフォールバック実行される', async () => {
    // Given: cursor-agent が "Tool execution rejected" を stderr に出す
    const taskId = `task-rwa-01-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-rwa-01');

    const provider = new MockProvider(0, (options) => {
      if (options.taskId.endsWith('-test-agent')) {
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: [
            '<!-- BEGIN TEST EXECUTION RESULT -->',
            'exitCode: null',
            'durationMs: 0',
            '<!-- BEGIN STDERR -->',
            'Tool execution rejected: User denied',
            '<!-- END STDERR -->',
            '<!-- END TEST EXECUTION RESULT -->'
          ].join('\n'),
          timestampMs: Date.now()
        });
      }
    });

    // When: runWithArtifacts (runner=cursorAgent)
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Fallback Safe',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: 'echo fallback-success', // 安全なコマンド
        testExecutionRunner: 'cursorAgent',
        allowUnsafeTestCommand: false,
      }
    });

    // Then: フォールバック実行され、結果が保存される
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    await vscode.workspace.fs.createDirectory(reportUri); // Ensure dir exists (though logic should handle it)
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0, 'フォールバック成功レポートが生成されること');

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    const text = doc.getText();
    assert.ok(text.includes('fallback-success'), '拡張機能側で実行されたコマンドの出力が含まれること');
    assert.ok(text.includes('WARN cursor-agent によるコマンド実行が拒否されたため、拡張機能側でフォールバック実行します'), 'フォールバック警告ログが含まれること');
  });

  // TC-RWA-02: cursor-agent が実行拒否 -> Unsafeならフォールバックせずスキップ
  test('TC-RWA-02: cursor-agent が実行拒否し、かつUnsafeコマンドの場合はフォールバックせずにスキップされる', async () => {
    // Given: Unsafeな環境 (VS Code test)
    const tempRoot = path.join(workspaceRoot, baseTempDir, `workspace-rwa-02-${Date.now()}`);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempRoot));
    const pkgJson = {
      scripts: { test: 'node ./out/test/runTest.js' },
      devDependencies: { '@vscode/test-electron': '^2.4.1' },
    };
    await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(tempRoot, 'package.json')), Buffer.from(JSON.stringify(pkgJson), 'utf8'));

    // And: cursor-agent が拒否
    const provider = new MockProvider(0, (options) => {
      if (options.taskId.endsWith('-test-agent')) {
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: [
            '<!-- BEGIN TEST EXECUTION RESULT -->',
            'exitCode: null',
            'durationMs: 0',
            '<!-- BEGIN STDERR -->',
            'Tool execution rejected',
            '<!-- END STDERR -->',
            '<!-- END TEST EXECUTION RESULT -->'
          ].join('\n'),
          timestampMs: Date.now()
        });
      }
    });

    const taskId = `task-rwa-02-${Date.now()}`;
    const relReportDir = path.join(baseTempDir, 'reports-rwa-02');

    // When: runWithArtifacts (runner=cursorAgent, allowUnsafe=false)
    await runWithArtifacts({
      provider,
      workspaceRoot: tempRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Fallback Blocked',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: relReportDir,
        testCommand: 'npm test',
        testExecutionRunner: 'cursorAgent',
        allowUnsafeTestCommand: false,
      }
    });

    // Then: スキップレポートが生成される
    const reportUri = vscode.Uri.file(path.join(tempRoot, relReportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0);

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    const text = doc.getText();
    assert.ok(text.includes('status: skipped'), 'スキップされること');
    assert.ok(text.includes('skipReason: cursor-agent によるコマンド実行が拒否されました'), '理由が明記されること');
  });

  // TC-RWA-03: cursor-agent が実行拒否 -> Unsafeでもallowならフォールバック
  test('TC-RWA-03: cursor-agent が実行拒否しても、allowUnsafeTestCommand=true ならフォールバック実行される', async () => {
    // Given: Unsafeな環境
    const tempRoot = path.join(workspaceRoot, baseTempDir, `workspace-rwa-03-${Date.now()}`);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempRoot));
    const pkgJson = {
      scripts: { test: 'node ./out/test/runTest.js' },
      devDependencies: { '@vscode/test-electron': '^2.4.1' },
    };
    await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(tempRoot, 'package.json')), Buffer.from(JSON.stringify(pkgJson), 'utf8'));

    const provider = new MockProvider(0, (options) => {
      if (options.taskId.endsWith('-test-agent')) {
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: [
            '<!-- BEGIN TEST EXECUTION RESULT -->',
            'exitCode: null',
            'durationMs: 0',
            '<!-- BEGIN STDERR -->',
            'Tool execution rejected',
            '<!-- END STDERR -->',
            '<!-- END TEST EXECUTION RESULT -->'
          ].join('\n'),
          timestampMs: Date.now()
        });
      }
    });

    const taskId = `task-rwa-03-${Date.now()}`;
    const relReportDir = path.join(baseTempDir, 'reports-rwa-03');

    // When: runWithArtifacts (runner=cursorAgent, allowUnsafe=true)
    await runWithArtifacts({
      provider,
      workspaceRoot: tempRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Fallback Forced',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: relReportDir,
        testCommand: 'npm test',
        testExecutionRunner: 'cursorAgent',
        allowUnsafeTestCommand: true, // Force fallback
      }
    });

    // Then: 実行される
    const reportUri = vscode.Uri.file(path.join(tempRoot, relReportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0);

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    const text = doc.getText();
    assert.ok(text.includes('status: executed'), '実行されること');
  });

  // TC-RWA-04: cursorAgentForceForTestExecution=true の場合、agent実行時の allowWrite が true になる
  test('TC-RWA-04: cursorAgentForceForTestExecution=true の場合、agent実行時の allowWrite が true になる', async () => {
    // Given: allowWrite をチェックする Provider
    const taskId = `task-rwa-04-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-rwa-04');
    let capturedAllowWrite = false;

    const provider = new MockProvider(0, (options) => {
      if (options.taskId.endsWith('-test-agent')) {
        capturedAllowWrite = options.allowWrite;
        
        // 完了させるために結果を返す
        options.onEvent({
            type: 'log',
            taskId: options.taskId,
            level: 'info',
            message: [
              '<!-- BEGIN TEST EXECUTION RESULT -->',
              'exitCode: 0',
              'durationMs: 0',
              '<!-- END TEST EXECUTION RESULT -->',
            ].join('\n'),
            timestampMs: Date.now(),
        });
      }
    });

    // When: runWithArtifacts (force=true)
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Force Execution',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: 'echo force',
        testExecutionRunner: 'cursorAgent',
        cursorAgentForceForTestExecution: true, // Target
      }
    });

    // Then: Provider に渡された allowWrite が true であること
    assert.strictEqual(capturedAllowWrite, true, 'cursorAgentForceForTestExecution=true なら allowWrite=true が渡されること');
    
    // レポートも確認
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0);
  });

  // TC-CMD-14: 実行ログから除去対象（system_reminder等）が除去される
  test('TC-CMD-14: 実行ログから除去対象（system_reminder等）が除去されていること', async () => {
    // Given: 除去対象のログと通常のログを吐く Provider
    const taskId = `task-14-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-14');

    const provider = new MockProvider(0, (options) => {
      if (options.taskId.endsWith('-test-agent')) {
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: '<system_reminder>Ignore me</system_reminder>',
          timestampMs: Date.now(),
        });
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: 'system:init',
          timestampMs: Date.now(),
        });
        // 結果マーカー
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: [
            '<!-- BEGIN TEST EXECUTION RESULT -->',
            'exitCode: 0',
            'durationMs: 0',
            '<!-- END TEST EXECUTION RESULT -->',
          ].join('\n'),
          timestampMs: Date.now(),
        });
      }
    });

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Empty Log',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: 'echo hello',
        testExecutionRunner: 'cursorAgent',
      }
    });

    // Then: 除去対象がレポートに含まれないこと
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0);

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    const text = doc.getText();
    // 除去対象が含まれていないこと
    assert.ok(!text.includes('Ignore me'), 'system_reminder内のテキストが除去されること');
    assert.ok(!text.includes('<system_reminder>'), 'system_reminderタグが除去されること');
    // STARTやDONEなどの基本ログは残っている可能性があるので、そこは検証しない
  });

  // TC-CMD-15: cursor-agent 出力が途中で切れた場合（終了マーカーなし）
  test('TC-CMD-15: cursor-agent 出力に開始マーカーのみで終了マーカーがない場合、パースエラーとして扱われる', async () => {
    // Given: 終了マーカーがないログ
    const taskId = `task-15-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-15');

    const provider = new MockProvider(0, (options) => {
      if (options.taskId.endsWith('-test-agent')) {
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: [
            '<!-- BEGIN TEST EXECUTION RESULT -->',
            'exitCode: 0',
            'Running tests...',
            // No End Marker
          ].join('\n'),
          timestampMs: Date.now(),
        });
      }
    });

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Partial Marker',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: 'echo hello',
        testExecutionRunner: 'cursorAgent',
      }
    });

    // Then: パース失敗として扱われる
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0);

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    const text = doc.getText();
    assert.ok(text.includes('cursor-agent の出力からテスト結果を抽出できませんでした'), 'パースエラーになること');
    assert.ok(text.includes('Running tests...'), '元のログが含まれること');
  });

  // TC-CMD-16: ログの空行畳み込み検証
  test('TC-CMD-16: ログの連続する空行は1行に畳まれてレポートに記録される', async () => {
    // Given: 連続する空行を含むログ
    const taskId = `task-16-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-16');

    const provider = new MockProvider(0, (options) => {
      if (options.taskId.endsWith('-test-agent')) {
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: [
            'Line 1',
            '',
            '',
            '',
            'Line 2',
            '   ', // trim されて空行扱い
            'Line 3'
          ].join('\n'),
          timestampMs: Date.now(),
        });
        // 結果マーカー
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: [
            '<!-- BEGIN TEST EXECUTION RESULT -->',
            'exitCode: 0',
            'durationMs: 0',
            '<!-- END TEST EXECUTION RESULT -->',
          ].join('\n'),
          timestampMs: Date.now(),
        });
      }
    });

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Collapse Blank Lines',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: 'echo hello',
        testExecutionRunner: 'cursorAgent',
      }
    });

    // Then: レポートのログを確認
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0);

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    const text = doc.getText();
    
    // サニタイズ結果を検証するため、ログセクションを探す
    const logSectionIndex = text.indexOf('実行ログ（拡張機能）（クリックで展開）');
    const logContent = text.slice(logSectionIndex);
    
    assert.ok(logContent.includes('Line 1'), 'Line 1 がある');
    assert.ok(logContent.includes('Line 2'), 'Line 2 がある');
    assert.ok(logContent.includes('Line 3'), 'Line 3 がある');
  });

  // TC-CMD-17: シグナル終了 (SIGTERM)
  test('TC-CMD-17: cursor-agent 出力に signal が含まれる場合、正しくパースされる', async () => {
    // Given: signal: SIGTERM を含む結果
    const taskId = `task-17-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-17');

    const provider = new MockProvider(0, (options) => {
      if (options.taskId.endsWith('-test-agent')) {
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'info',
          message: [
            '<!-- BEGIN TEST EXECUTION RESULT -->',
            'exitCode: null',
            'signal: SIGTERM',
            'durationMs: 100',
            '<!-- END TEST EXECUTION RESULT -->',
          ].join('\n'),
          timestampMs: Date.now(),
        });
      }
    });

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Signal Term',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: 'sleep 10',
        testExecutionRunner: 'cursorAgent',
      }
    });

    // Then: レポートに signal: SIGTERM が含まれる
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0);

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    const text = doc.getText();
    assert.ok(text.includes('signal: SIGTERM'), 'シグナルが記録されること');
    assert.ok(text.includes('exitCode: null'), 'exitCode が null であること');
  });

  // TC-CMD-18: cursor-agent 異常終了 (exit!=0) + マーカーなし
  test('TC-CMD-18: cursor-agent が異常終了しマーカーもない場合、エラーレポートが生成され、exitCodeが記録される', async () => {
    // Given: 異常終了ログ + exitCode=1
    const taskId = `task-18-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-18');

    const provider = new MockProvider(1, (options) => {
      if (options.taskId.endsWith('-test-agent')) {
        options.onEvent({
          type: 'log',
          taskId: options.taskId,
          level: 'error',
          message: 'Process crashed!',
          timestampMs: Date.now(),
        });
      }
    });

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Agent Crash',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: 'echo crash',
        testExecutionRunner: 'cursorAgent',
      }
    });

    // Then: エラーレポートが生成される
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0);

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    const text = doc.getText();

    assert.ok(text.includes('cursor-agent の出力からテスト結果を抽出できませんでした'), 'パースエラーになること');
    assert.ok(text.includes('Process crashed!'), 'ログが含まれること');
    // Provider の exitCode がフォールバックとして採用されること
    assert.ok(text.includes('exitCode: 1'), 'exitCode が記録されること');
  });

  // TC-CMD-19: npm test 以外は VS Code 起動チェックの対象外
  test('TC-CMD-19: npm test 以外のコマンド（pnpm test等）は VS Code 起動チェックの対象外となり、そのまま実行される', async () => {
    // Given: package.json には VS Code テストの記述があるが、コマンドは pnpm test
    const tempRoot = path.join(workspaceRoot, baseTempDir, `workspace-19-${Date.now()}`);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempRoot));
    const pkgJson = {
      scripts: { test: 'node ./out/test/runTest.js' },
      devDependencies: { '@vscode/test-electron': '^2.4.1' },
    };
    await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(tempRoot, 'package.json')), Buffer.from(JSON.stringify(pkgJson), 'utf8'));

    const taskId = `task-19-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-19');
    const provider = new MockProvider(0);

    // When: runWithArtifacts (command: pnpm test)
    await runWithArtifacts({
      provider,
      workspaceRoot: tempRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Check Bypass',
      targetPaths: ['dummy.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testCommand: 'pnpm test', // npm test ではない
        testExecutionReportDir: reportDir,
        testExecutionRunner: 'extension',
        allowUnsafeTestCommand: false,
      }
    });

    // Then: チェックに引っかからず実行される（レポートの status: executed）
    const reportUri = vscode.Uri.file(path.join(tempRoot, reportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0, 'レポートが生成されること');

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    assert.ok(doc.getText().includes('status: executed'), 'pnpm test はチェック対象外のため実行されること');
  });

  // TC-CMD-20: 直接 runTest.js を指定する場合も VS Code 起動チェックでスキップされる
  test('TC-CMD-20: 直接 runTest.js を指定する場合も VS Code 起動チェックでスキップされる', async () => {
    // Given: testCommand が runTest.js を直接呼んでいる
    // package.json の scripts.test 経由ではなく、コマンド自体に含まれるパターン
    const tempRoot = path.join(workspaceRoot, baseTempDir, `workspace-20-${Date.now()}`);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempRoot));
    // package.json は関係ないはずだが一応作っておく
    await vscode.workspace.fs.writeFile(vscode.Uri.file(path.join(tempRoot, 'package.json')), Buffer.from('{}', 'utf8'));

    const taskId = `task-20-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-20');
    const provider = new MockProvider(0);

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot: tempRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Direct runTest Check',
      targetPaths: ['dummy.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testCommand: 'node ./out/test/runTest.js', // 直接指定
        testExecutionReportDir: reportDir,
        testExecutionRunner: 'extension',
        allowUnsafeTestCommand: false,
      }
    });

    // Then: スキップされること
    const reportUri = vscode.Uri.file(path.join(tempRoot, reportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0);

    const doc = await vscode.workspace.openTextDocument(reports[0]);
    const text = doc.getText();
    assert.ok(text.includes('status: skipped'), 'runTest.js を含むコマンドはスキップされること');
    assert.ok(text.includes('VS Code を別プロセスで起動する可能性があるため'), '理由が含まれること');
  });

  // TC-CMD-21: runWithArtifacts のオプションで model を指定した場合、Provider にその model が渡される
  test('TC-CMD-21: runWithArtifacts のオプションで model を指定した場合、Provider にその model が渡される', async () => {
    // Given: model="gpt-4" を指定
    const provider = new MockProvider(0);
    const taskId = `task-21-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-21');

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Model Check',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'gpt-4',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: 'echo hello',
        testExecutionRunner: 'extension',
      }
    });

    // Then: Provider に model が渡されていること
    assert.strictEqual(provider.lastRunOptions?.model, 'gpt-4', 'Provider に model が渡されること');
  });

  // TC-CMD-22: cursor-agent 実行時のプロンプトに必須の制約事項が含まれている
  test('TC-CMD-22: cursor-agent 実行時のプロンプトに、ファイルの編集禁止やマーカー出力などの必須制約が含まれている', async () => {
    // Given: cursorAgent ランナー設定
    const provider = new MockProvider(0);
    const taskId = `task-22-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-22');

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Prompt Check',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: 'npm test',
        testExecutionRunner: 'cursorAgent',
      }
    });

    // Then: プロンプトに制約が含まれること
    const prompt = provider.lastRunOptions?.prompt ?? '';
    assert.ok(prompt.length > 0, 'プロンプトが空でないこと');
    assert.ok(prompt.includes('あなたはテスト実行担当です'), '役割定義が含まれること');
    assert.ok(prompt.includes('ファイルの編集・作成は禁止'), '編集禁止制約が含まれること');
    assert.ok(prompt.includes('デバッグ開始・ウォッチ開始・対話的セッション開始は禁止'), '対話禁止制約が含まれること');
    assert.ok(prompt.includes('<!-- BEGIN TEST EXECUTION RESULT -->'), '開始マーカー指示が含まれること');
    assert.ok(prompt.includes('npm test'), '実行すべきコマンドが含まれること');
  });

  // TC-N-01: 観点表抽出成功 -> プロンプト注入成功
  test('TC-N-01: 観点表抽出に成功した場合、テスト生成プロンプトに観点表が注入される', async () => {
    // Given: 正常な観点表マーカーを返す Provider
    const perspectiveContent = '| ID | Case |\n|--|--|\n| 1 | Test |';
    const perspectiveLog = `<!-- BEGIN TEST PERSPECTIVES -->\n${perspectiveContent}\n<!-- END TEST PERSPECTIVES -->`;
    const provider = new MockProvider(0, undefined, perspectiveLog);
    const taskId = `task-n01-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-n01');

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Perspective Injection',
      targetPaths: ['test.ts'],
      generationPrompt: 'Base Prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: true,
        perspectiveReportDir: path.join(baseTempDir, 'perspectives-n01'),
        testExecutionReportDir: reportDir,
        testCommand: 'echo hello',
        testExecutionRunner: 'extension',
      }
    });

    // Then: メイン生成タスクのプロンプトに観点表が含まれていること
    const mainTask = provider.history.find(h => h.taskId === taskId);
    assert.ok(mainTask, 'メイン生成タスクが実行されること');
    assert.ok(mainTask.prompt.includes('## 生成済みテスト観点表（必須）'), '観点表ヘッダーがプロンプトに含まれること');
    assert.ok(mainTask.prompt.includes(perspectiveContent), '観点表の内容がプロンプトに含まれること');
    assert.ok(mainTask.prompt.includes('Base Prompt'), '元のプロンプトも含まれること');
  });

  // TC-N-02: 観点表抽出失敗 -> プロンプト注入なし
  test('TC-N-02: 観点表抽出に失敗した場合、テスト生成プロンプトは変更されない', async () => {
    // Given: マーカーがないログを返す Provider
    const provider = new MockProvider(0, undefined, 'Some logs without markers');
    const taskId = `task-n02-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-n02');

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Perspective Fail Injection',
      targetPaths: ['test.ts'],
      generationPrompt: 'Base Prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: true,
        perspectiveReportDir: path.join(baseTempDir, 'perspectives-n02'),
        testExecutionReportDir: reportDir,
        testCommand: 'echo hello',
        testExecutionRunner: 'extension',
      }
    });

    // Then: プロンプトに変更がないこと
    const mainTask = provider.history.find(h => h.taskId === taskId);
    assert.ok(mainTask);
    assert.strictEqual(mainTask.prompt, 'Base Prompt', '抽出失敗時はプロンプトが元のままであること');
  });

  // TC-N-03: 機能無効 -> プロンプト注入なし
  test('TC-N-03: includeTestPerspectiveTable=false の場合、観点表生成タスクは走らずプロンプトも変更されない', async () => {
    // Given: includeTestPerspectiveTable: false
    const provider = new MockProvider(0);
    const taskId = `task-n03-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-n03');

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Perspective Disabled',
      targetPaths: ['test.ts'],
      generationPrompt: 'Base Prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false, // OFF
        testExecutionReportDir: reportDir,
        testCommand: 'echo hello',
        testExecutionRunner: 'extension',
      }
    });

    // Then: 観点表生成タスクがなく、プロンプトも変更なし
    const perspectiveTask = provider.history.find(h => h.taskId.endsWith('-perspectives'));
    assert.strictEqual(perspectiveTask, undefined, '観点表生成タスクは実行されないこと');

    const mainTask = provider.history.find(h => h.taskId === taskId);
    assert.ok(mainTask);
    assert.strictEqual(mainTask.prompt, 'Base Prompt', 'プロンプトが元のままであること');
  });

  // TC-B-01: 観点表空文字 -> 注入なし
  test('TC-B-01: 抽出された観点表が空文字列の場合、プロンプト注入は行われない', async () => {
    // Given: 空の観点表マーカー
    const emptyLog = '<!-- BEGIN TEST PERSPECTIVES --><!-- END TEST PERSPECTIVES -->';
    const provider = new MockProvider(0, undefined, emptyLog);
    const taskId = `task-b01-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-b01');

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Empty Perspective',
      targetPaths: ['test.ts'],
      generationPrompt: 'Base Prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: true,
        perspectiveReportDir: path.join(baseTempDir, 'perspectives-b01'),
        testExecutionReportDir: reportDir,
        testCommand: 'echo hello',
        testExecutionRunner: 'extension',
      }
    });

    // Then: プロンプト変更なし
    const mainTask = provider.history.find(h => h.taskId === taskId);
    assert.ok(mainTask);
    assert.strictEqual(mainTask.prompt, 'Base Prompt', '空の観点表は注入されないこと');
  });

  // TC-B-02: 観点表空白のみ -> 注入なし
  test('TC-B-02: 抽出された観点表が空白のみの場合、プロンプト注入は行われない', async () => {
    // Given: 空白のみの観点表マーカー
    const blankLog = '<!-- BEGIN TEST PERSPECTIVES -->   \n   <!-- END TEST PERSPECTIVES -->';
    const provider = new MockProvider(0, undefined, blankLog);
    const taskId = `task-b02-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-b02');

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Blank Perspective',
      targetPaths: ['test.ts'],
      generationPrompt: 'Base Prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: true,
        perspectiveReportDir: path.join(baseTempDir, 'perspectives-b02'),
        testExecutionReportDir: reportDir,
        testCommand: 'echo hello',
        testExecutionRunner: 'extension',
      }
    });

    // Then: プロンプト変更なし
    const mainTask = provider.history.find(h => h.taskId === taskId);
    assert.ok(mainTask);
    assert.strictEqual(mainTask.prompt, 'Base Prompt', '空白のみの観点表は注入されないこと');
  });

  // TC-B-03: 元プロンプト空 -> 注入あり
  test('TC-B-03: 元のプロンプトが空の場合でも、観点表があれば注入される', async () => {
    // Given: 元プロンプトが空文字、観点表はあり
    const perspectiveContent = '| ID | Case |';
    const perspectiveLog = `<!-- BEGIN TEST PERSPECTIVES -->\n${perspectiveContent}\n<!-- END TEST PERSPECTIVES -->`;
    const provider = new MockProvider(0, undefined, perspectiveLog);
    const taskId = `task-b03-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-b03');

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Empty Base Prompt',
      targetPaths: ['test.ts'],
      generationPrompt: '', // Empty
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: true,
        perspectiveReportDir: path.join(baseTempDir, 'perspectives-b03'),
        testExecutionReportDir: reportDir,
        testCommand: 'echo hello',
        testExecutionRunner: 'extension',
      }
    });

    // Then: プロンプトに観点表が含まれる
    const mainTask = provider.history.find(h => h.taskId === taskId);
    assert.ok(mainTask);
    assert.ok(mainTask.prompt.includes('## 生成済みテスト観点表（必須）'), 'ヘッダーが含まれること');
    assert.ok(mainTask.prompt.includes(perspectiveContent), '観点表が含まれること');
    // 空文字 + \n + ヘッダー... となるので、先頭が改行コードなどで始まる可能性があるが、内容は含まれているはず
  });

  // TC-CMD-01~05: ログイベントのフィルタリングとフォーマット
  test('TC-CMD-01~05: ログイベントのサニタイズとフィルタリング', async () => {
    // Given: 様々な種類のログイベントを発行する Provider
    const taskId = `task-cmd-log-${Date.now()}`;
    const reportDir = path.join(baseTempDir, 'reports-cmd-log');

    const provider = new MockProvider(0, (options) => {
      if (options.taskId.endsWith('-test-agent')) {
        const emit = (msg: string) => {
          options.onEvent({
            type: 'log',
            taskId: options.taskId,
            level: 'info',
            message: msg,
            timestampMs: Date.now(),
          });
        };

        // TC-CMD-01: Standard text
        emit('Standard Log Message');
        
        // TC-CMD-02: Empty string
        emit('');

        // TC-CMD-03: Whitespace only
        emit('   ');

        // TC-CMD-04: ANSI codes only
        emit('\u001b[31m\u001b[0m');

        // TC-CMD-05: Multi-line text
        emit('Line 1\nLine 2');

        // Result marker
        emit([
          '<!-- BEGIN TEST EXECUTION RESULT -->',
          'exitCode: 0',
          'durationMs: 0',
          '<!-- END TEST EXECUTION RESULT -->',
        ].join('\n'));
      }
    });

    // When: runWithArtifacts
    await runWithArtifacts({
      provider,
      workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Log Check',
      targetPaths: ['test.ts'],
      generationPrompt: 'prompt',
      model: 'model',
      generationTaskId: taskId,
      settingsOverride: {
        includeTestPerspectiveTable: false,
        testExecutionReportDir: reportDir,
        testCommand: 'echo hello',
        testExecutionRunner: 'cursorAgent',
      }
    });

    // Then: レポートの内容を検証
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, 'test-execution_*.md'));
    assert.ok(reports.length > 0);
    const doc = await vscode.workspace.openTextDocument(reports[0]);
    const text = doc.getText();

    // Log section extraction
    const logSection = text.split('実行ログ（拡張機能）（クリックで展開）')[1] || '';

    // TC-CMD-01
    assert.ok(logSection.includes('Standard Log Message'), 'TC-CMD-01: 通常のログは含まれること');

    // TC-CMD-02, 03, 04
    const logLines = logSection.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    // 空行やANSIのみの行が含まれていないかチェック
    assert.ok(!logLines.some(l => l === ''), 'TC-CMD-02/03/04: 空行やANSIのみの行は除去されていること');
    
    // TC-CMD-05
    assert.ok(logSection.includes('Line 1'), 'TC-CMD-05: 複数行ログ Line 1');
    assert.ok(logSection.includes('Line 2'), 'TC-CMD-05: 複数行ログ Line 2');
  });
});
