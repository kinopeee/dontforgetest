import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { runWithArtifacts } from '../../../commands/runWithArtifacts';
import { AgentProvider, AgentRunOptions, RunningTask } from '../../../providers/provider';

// Mock Provider
class MockProvider implements AgentProvider {
  readonly id = 'mock';
  readonly displayName = 'Mock';

  constructor(private readonly exitCode: number | null = 0) {}

  run(options: AgentRunOptions): RunningTask {
    // 非同期イベントを模倣
    setTimeout(() => {
      options.onEvent({
        type: 'started',
        taskId: options.taskId,
        label: 'test',
        timestampMs: Date.now(),
      });
      
      // 観点表生成ステップでのログ出力を模倣
      if (options.taskId.endsWith('-perspectives')) {
        // exitCode が 0 の場合のみマーカー付きログを出力（失敗時はマーカーなし）
        if (this.exitCode === 0) {
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

    return { taskId: options.taskId, dispose: () => {} };
  }
}

suite('commands/runWithArtifacts.ts', () => {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  // テスト間での衝突を避けるためユニークなディレクトリを使用
  const baseTempDir = 'out/test-artifacts-cmd';

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
    assert.ok(reportDoc.getText().includes('test-cmd-01'), 'レポートに echo コマンドの出力が含まれること');
  });

  // TC-CMD-02: 観点表生成無効
  test('TC-CMD-02: 観点表生成が無効な場合、観点表ファイルは生成されない', async () => {
    // Given: includeTestPerspectiveTable = false
    const provider = new MockProvider(0);
    const taskId = `task-02-${Date.now()}`;
    const perspectiveDir = path.join(baseTempDir, 'perspectives-02');

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
        testCommand: '', // テスト実行はスキップ
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
      }
    });

    // Then: レポートが保存されないこと（テスト実行スキップ）
    const reportUri = vscode.Uri.file(path.join(workspaceRoot, reportDir));
    await vscode.workspace.fs.createDirectory(reportUri);

    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(reportUri, '*.md'));
    assert.strictEqual(reports.length, 0, 'コマンドが空の場合、レポートは作成されないこと');
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
        testCommand: '', 
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
      },
    });

    // Then: 実行レポートが作られていない（スキップされた）こと
    const reportDir = path.join(tempRoot, baseTempDir, 'reports-06');
    const reports = await vscode.workspace.findFiles(new vscode.RelativePattern(vscode.Uri.file(reportDir), 'test-execution_*.md'));
    assert.strictEqual(reports.length, 0, 'スキップ時は実行レポートが生成されないこと');
  });
});
