import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { sanitizeAgentLogMessage } from '../../core/agentLogSanitizer';
import { type TestGenEvent, nowMs } from '../../core/event';
import { t } from '../../core/l10n';
import {
  emitLogEvent,
  formatTimestamp,
  getArtifactSettings,
  parseTestResultFile,
  saveTestExecutionReport,
  computeTestReportSummary,
  type ArtifactSettings,
  type TestExecutionResult,
  type TestResultFile,
} from '../../core/artifacts';
import { taskManager } from '../../core/taskManager';
import { runTestCommand } from '../../core/testRunner';
import {
  runComplianceCheck,
  formatComplianceIssuesForPrompt,
  isTestFilePath,
  type ComplianceCheckResult,
} from '../../core/strategyComplianceCheck';
import { createTemporaryWorktree, removeTemporaryWorktree } from '../../git/worktreeManager';
import { type RunningTask } from '../../providers/provider';
import { runProviderToCompletion } from '../../providers/runToCompletion';
import { appendEventToOutput } from '../../ui/outputChannel';
import { handleTestGenEventForStatusBar } from '../../ui/statusBar';
import { handleTestGenEventForProgressView, emitPhaseEvent } from '../../ui/progressTreeView';
import { cleanupUnexpectedPerspectiveFiles } from './cleanupStep';
import { applyWorktreeTestChanges, type WorktreeApplyResult } from './worktreeApplyStep';
import { runTestCommandViaCursorAgent } from './testExecutionStep';
import { runPerspectiveTableStep } from './perspectiveStep';
import type { RunWithArtifactsOptions, TestGenerationRunMode, WorktreeOps } from '../runWithArtifacts';

type ReadFileUtf8 = (filePath: string) => Promise<string>;

async function looksLikeVsCodeLaunchingTestCommand(params: {
  workspaceRoot: string;
  testCommand: string;
  readFileUtf8: ReadFileUtf8;
}): Promise<boolean> {
  const cmd = params.testCommand.trim();

  if (/(^|[\s/])out[/\\]test[/\\]runTest(\.js)?\b/.test(cmd) || /@vscode\/test-electron/.test(cmd)) {
    return true;
  }

  if (!/^npm(\s+run)?\s+test\b/.test(cmd)) {
    return false;
  }

  const pkgPath = path.join(params.workspaceRoot, 'package.json');
  try {
    const raw = await params.readFileUtf8(pkgPath);
    const parsed: unknown = JSON.parse(raw);
    const pkg = parsed as { scripts?: Record<string, unknown> } | undefined;
    const scripts = pkg?.scripts;
    const testScript = scripts?.test;
    if (typeof testScript !== 'string') {
      return false;
    }

    if (/(@vscode\/test-electron|vscode-test|out\/test\/runTest\.js|out\\test\\runTest\.js)/.test(testScript)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export class TestGenerationSession {
  private readonly options: RunWithArtifactsOptions;
  private readonly settings: ArtifactSettings;
  private readonly timestamp: string;
  private readonly runMode: TestGenerationRunMode;
  private readonly runLocation: 'local' | 'worktree';
  private readonly localWorkspaceRoot: string;
  private readonly worktreeOps: WorktreeOps;

  private aborted: boolean = false;
  private runWorkspaceRoot: string;
  private worktreeDir: string | undefined;
  private testExecutionLogLines: string[] = [];
  private lastPerspectiveSavedAbsolutePath: string | undefined;
  private lastPerspectiveSavedRelativePath: string | undefined;
  private lastPerspectiveExtracted: boolean = false;
  /** 生成中に fileWrite イベントで収集されたファイルパス（絶対パス） */
  private generatedFilePaths: string[] = [];

  constructor(options: RunWithArtifactsOptions) {
    this.options = options;
    const baseSettings = getArtifactSettings();
    this.settings = { ...baseSettings, ...options.settingsOverride };
    this.timestamp = formatTimestamp(new Date());
    this.runMode = options.runMode === 'perspectiveOnly' ? 'perspectiveOnly' : 'full';
    // 観点表のみモードでは編集を行わないため、Worktree 実行は不要（常に local 扱い）
    this.runLocation = this.runMode === 'perspectiveOnly' ? 'local' : options.runLocation === 'worktree' ? 'worktree' : 'local';
    this.localWorkspaceRoot = options.workspaceRoot;
    this.runWorkspaceRoot = this.localWorkspaceRoot;
    this.worktreeOps = options.worktreeOps ?? {
      createTemporaryWorktree,
      removeTemporaryWorktree,
    };
  }

  public async run(): Promise<void> {
    // 初期化とタスク登録
    const startedEvent: TestGenEvent = {
      type: 'started',
      taskId: this.options.generationTaskId,
      label: this.options.generationLabel,
      detail: this.options.targetPaths.join(', '),
      timestampMs: nowMs(),
    };
    handleTestGenEventForProgressView(startedEvent);

    const initialRunningTask: RunningTask = {
      taskId: this.options.generationTaskId,
      dispose: () => {
        // 初期状態では何もしない
      },
    };
    taskManager.register(this.options.generationTaskId, this.options.generationLabel, initialRunningTask);

    try {
      // キャンセルチェック（開始直後）
      if (this.checkCancelled()) return;

      // 準備フェーズ (Worktree作成など)
      await this.prepare();

      // 準備フェーズで中断された場合は以降を実行しない
      if (this.aborted) return;

      // キャンセルチェック
      if (this.checkCancelled()) return;

      // 観点表生成
      const perspectiveMarkdown = await this.generatePerspectives();

      // キャンセルチェック
      if (this.checkCancelled()) return;

      // 観点表のみモード: ここで停止し、ユーザーの確認を待つ
      if (this.runMode === 'perspectiveOnly') {
        await this.finishAfterPerspective();
        return;
      }

      // テストコード生成
      const genExit = await this.generateTests(perspectiveMarkdown);

      // キャンセルチェック
      if (this.checkCancelled()) return;

      // テスト実行とレポート保存
      await this.runTestExecution(genExit);

    } finally {
      await this.cleanup();
    }
  }

  private checkCancelled(): boolean {
    if (taskManager.isCancelled(this.options.generationTaskId)) {
      appendEventToOutput(emitLogEvent(this.options.generationTaskId, 'warn', t('task.cancelled')));
      handleTestGenEventForProgressView({
        type: 'completed',
        taskId: this.options.generationTaskId,
        exitCode: null,
        timestampMs: nowMs()
      });
      return true;
    }
    return false;
  }

  private captureEvent(event: TestGenEvent): void {
    const tsIso = new Date(event.timestampMs).toISOString();
    switch (event.type) {
      case 'started':
        this.testExecutionLogLines.push(`[${tsIso}] [${event.taskId}] START ${event.label}${event.detail ? ` (${event.detail})` : ''}`);
        break;
      case 'log': {
        const sanitized = sanitizeAgentLogMessage(event.message);
        if (sanitized.length === 0) break;
        const lines = sanitized.split('\n');
        const level = event.level.toUpperCase();
        this.testExecutionLogLines.push(`[${tsIso}] [${event.taskId}] ${level} ${lines[0] ?? ''}`.trimEnd());
        for (let i = 1; i < lines.length; i += 1) {
          this.testExecutionLogLines.push(`  ${lines[i] ?? ''}`.trimEnd());
        }
        break;
      }
      case 'fileWrite':
        this.testExecutionLogLines.push(
          `[${tsIso}] [${event.taskId}] WRITE ${event.path}` +
          `${event.linesCreated !== undefined ? ` lines=${event.linesCreated}` : ''}` +
          `${event.bytesWritten !== undefined ? ` bytes=${event.bytesWritten}` : ''}`,
        );
        break;
      case 'completed':
        this.testExecutionLogLines.push(`[${tsIso}] [${event.taskId}] DONE exit=${event.exitCode ?? 'null'}`);
        break;
      case 'phase':
        this.testExecutionLogLines.push(`[${tsIso}] [${event.taskId}] PHASE ${event.phase}: ${event.phaseLabel}`);
        break;
      default:
        break;
    }
  }

  private async prepare(): Promise<void> {
    handleTestGenEventForProgressView(
      emitPhaseEvent(this.options.generationTaskId, 'preparing', t('progressTreeView.phase.preparing')),
    );
    taskManager.updatePhase(this.options.generationTaskId, 'preparing', 'preparing');

    if (this.runLocation === 'worktree') {
      if (!this.options.extensionContext) {
        const msg = t('worktree.extensionContextRequired');
        appendEventToOutput(emitLogEvent(this.options.generationTaskId, 'error', msg));
        void vscode.window.showErrorMessage(msg);
        handleTestGenEventForProgressView({ type: 'completed', taskId: this.options.generationTaskId, exitCode: null, timestampMs: nowMs() });
        // 例外を投げるとコマンド実行全体が失敗扱いになり、呼び出し側（テスト含む）で扱いづらい。
        // エラーメッセージを表示して安全に中断する。
        this.aborted = true;
        return;
      }

      try {
        const baseDir = this.options.extensionContext.globalStorageUri.fsPath;
        await fs.promises.mkdir(baseDir, { recursive: true });
        appendEventToOutput(emitLogEvent(this.options.generationTaskId, 'info', t('worktree.creating')));
        const created = await this.worktreeOps.createTemporaryWorktree({
          repoRoot: this.localWorkspaceRoot,
          baseDir,
          taskId: this.options.generationTaskId,
          ref: 'HEAD',
        });
        this.worktreeDir = created.worktreeDir;
        this.runWorkspaceRoot = this.worktreeDir;
        appendEventToOutput(emitLogEvent(this.options.generationTaskId, 'info', t('worktree.created', this.worktreeDir)));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const msg = t('worktree.createFailed', message);
        appendEventToOutput(emitLogEvent(this.options.generationTaskId, 'error', msg));
        void vscode.window.showErrorMessage(msg);
        handleTestGenEventForProgressView({ type: 'completed', taskId: this.options.generationTaskId, exitCode: null, timestampMs: nowMs() });
        // worktree 作成に失敗しても、拡張機能全体をクラッシュさせずに中断する。
        this.aborted = true;
        return;
      }
    }
  }

  private async generatePerspectives(): Promise<string | undefined> {
    // NOTE:
    // - full モードでは設定（includeTestPerspectiveTable）に従う
    // - perspectiveOnly モードでは、ユーザーが明示的に「観点表だけ欲しい」ため常に実行する
    if (!this.settings.includeTestPerspectiveTable && this.runMode !== 'perspectiveOnly') {
      return undefined;
    }

    handleTestGenEventForProgressView(
      emitPhaseEvent(this.options.generationTaskId, 'perspectives', t('progressTreeView.phase.perspectives')),
    );
    taskManager.updatePhase(this.options.generationTaskId, 'perspectives', 'perspectives');

    const perspectiveResult = await runPerspectiveTableStep({
      provider: this.options.provider,
      runWorkspaceRoot: this.runWorkspaceRoot,
      artifactWorkspaceRoot: this.localWorkspaceRoot,
      cursorAgentCommand: this.options.cursorAgentCommand,
      testStrategyPath: this.options.testStrategyPath,
      generationLabel: this.options.generationLabel,
      targetPaths: this.options.targetPaths,
      referenceText: this.options.perspectiveReferenceText,
      model: this.options.model,
      reportDir: this.settings.perspectiveReportDir,
      timeoutMs: this.settings.perspectiveGenerationTimeoutMs,
      timestamp: this.timestamp,
      baseTaskId: this.options.generationTaskId,
      onRunningTask: (runningTask) => {
        taskManager.updateRunningTask(this.options.generationTaskId, runningTask);
      },
    });

    this.lastPerspectiveSavedAbsolutePath = perspectiveResult?.saved.absolutePath;
    this.lastPerspectiveSavedRelativePath = perspectiveResult?.saved.relativePath;
    this.lastPerspectiveExtracted = perspectiveResult?.extracted === true;

    if (perspectiveResult?.extracted) {
      return perspectiveResult.markdown;
    }
    return undefined;
  }

  /**
   * 観点表生成で停止する（ユーザー確認待ち）。
   * - 進捗TreeViewで「完了」扱いにして残骸を残さない
   * - 保存された観点表を開く（テスト環境ではスキップ）
   */
  private async finishAfterPerspective(): Promise<void> {
    const taskId = `${this.options.generationTaskId}-perspectiveOnly`;
    const savedPath = this.lastPerspectiveSavedRelativePath ?? this.lastPerspectiveSavedAbsolutePath ?? '';
    const message = this.lastPerspectiveExtracted
      ? t('runMode.perspectiveOnly.completed', savedPath.length > 0 ? savedPath : t('artifact.none'))
      : t('runMode.perspectiveOnly.completedWithWarning', savedPath.length > 0 ? savedPath : t('artifact.none'));

    const log = emitLogEvent(taskId, this.lastPerspectiveExtracted ? 'info' : 'warn', message);
    appendEventToOutput(log);
    this.captureEvent(log);

    // 進捗TreeView完了イベント（完了扱いにしてタスクが残り続けないようにする）
    const completed: TestGenEvent = { type: 'completed', taskId: this.options.generationTaskId, exitCode: null, timestampMs: nowMs() };
    handleTestGenEventForProgressView(completed);

    // ユーザー通知（非ブロッキング）
    if (this.lastPerspectiveExtracted) {
      void vscode.window.showInformationMessage(message);
    } else {
      void vscode.window.showWarningMessage(message);
    }

    // 観点表ファイルを開いてレビューしやすくする（VS Code 拡張機能テストではスキップ）
    if (process.env.VSCODE_TEST_RUNNER !== '1' && this.lastPerspectiveSavedAbsolutePath) {
      const abs = this.lastPerspectiveSavedAbsolutePath.trim();
      if (abs.length > 0) {
        void vscode.workspace
          .openTextDocument(vscode.Uri.file(abs))
          .then((doc) => vscode.window.showTextDocument(doc, { preview: true }))
          .then(undefined, () => {
            // 失敗しても本体フローは完了扱いにしたいので無視する
          });
      }
    }
  }

  private async generateTests(perspectiveMarkdown: string | undefined): Promise<number | null> {
    handleTestGenEventForProgressView(
      emitPhaseEvent(this.options.generationTaskId, 'generating', t('progressTreeView.phase.generating')),
    );
    taskManager.updatePhase(this.options.generationTaskId, 'generating', 'generating');

    // 生成したファイルパスを収集
    this.generatedFilePaths = [];

    let finalPrompt = this.options.generationPrompt;
    if (perspectiveMarkdown) {
      finalPrompt = this.appendPerspectiveToPrompt(this.options.generationPrompt, perspectiveMarkdown);
    }

    const genExit = await this.runGenerationWithFileCollection(finalPrompt);

    const cleanupResults = await cleanupUnexpectedPerspectiveFiles(this.localWorkspaceRoot);
    for (const cleanup of cleanupResults) {
      if (cleanup.deleted) {
        appendEventToOutput(
          emitLogEvent(
            `${this.options.generationTaskId}-guard`,
            'warn',
            t('cleanup.unexpectedPerspectiveDeleted', cleanup.relativePath),
          ),
        );
      } else if (cleanup.errorMessage) {
        appendEventToOutput(
          emitLogEvent(
            `${this.options.generationTaskId}-guard`,
            'warn',
            t('cleanup.unexpectedPerspectiveDeleteFailed', cleanup.relativePath, cleanup.errorMessage),
          ),
        );
      }
    }

    // 生成成功時に戦略準拠チェック＋自動修正ループを実行
    if (genExit === 0 && this.settings.enableStrategyComplianceCheck) {
      await this.runComplianceCheckAndAutoFix(perspectiveMarkdown);
    }

    const genMsg =
      genExit === 0
        ? t('testGeneration.completed', this.options.generationLabel)
        : t('testGeneration.failed', this.options.generationLabel, String(genExit ?? 'null'));

    if (genExit === 0) {
      // Worktreeモードは「適用結果（成功/要手動マージ）」の通知を別途出すため、
      // ここで完了トーストを出すと二重通知になり、誤解を招きやすい。
      if (this.runLocation === 'local') {
        void vscode.window.showInformationMessage(genMsg);
      }
    } else {
      void vscode.window.showErrorMessage(genMsg);
    }

    return genExit;
  }

  /**
   * テスト生成を実行し、fileWrite イベントからファイルパスを収集する
   */
  private async runGenerationWithFileCollection(prompt: string): Promise<number | null> {
    return await runProviderToCompletion({
      provider: this.options.provider,
      run: {
        taskId: this.options.generationTaskId,
        workspaceRoot: this.runWorkspaceRoot,
        agentCommand: this.options.cursorAgentCommand,
        prompt,
        model: this.options.model,
        outputFormat: 'stream-json',
        allowWrite: true,
      },
      onEvent: (event) => {
        handleTestGenEventForStatusBar(event);
        appendEventToOutput(event);
        // fileWrite イベントからファイルパスを収集
        if (event.type === 'fileWrite') {
          const absPath = this.resolveToAbsolutePath(event.path);
          if (!this.generatedFilePaths.includes(absPath)) {
            this.generatedFilePaths.push(absPath);
          }
        }
      },
      onRunningTask: (runningTask) => {
        taskManager.updateRunningTask(this.options.generationTaskId, runningTask);
      },
    });
  }

  /**
   * ワークスペース相対パスまたは絶対パスを、絶対パスに正規化する
   */
  private resolveToAbsolutePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.runWorkspaceRoot, filePath);
  }

  /**
   * 戦略準拠チェックと自動修正ループを実行する
   */
  private async runComplianceCheckAndAutoFix(perspectiveMarkdown: string | undefined): Promise<void> {
    const maxRetries = this.settings.strategyComplianceAutoFixMaxRetries;

    let retryCount = 0;
    let lastResult: ComplianceCheckResult | undefined;

    while (retryCount <= maxRetries) {
      // NOTE: 自動修正（cursor-agent再実行）で新しいテストファイルが追加される可能性があるため、
      // 各ループで最新の generatedFilePaths からテスト対象を再計算する。
      const testFilePaths = this.generatedFilePaths.filter((absPath) => {
        const relativePath = path.relative(this.runWorkspaceRoot, absPath);
        return isTestFilePath(relativePath);
      });

      if (testFilePaths.length === 0) {
        appendEventToOutput(
          emitLogEvent(this.options.generationTaskId, 'info', t('compliance.noTestFiles')),
        );
        return;
      }

      const result = await runComplianceCheck({
        workspaceRoot: this.runWorkspaceRoot,
        testFilePaths,
        perspectiveMarkdown,
        includeTestPerspectiveTable: this.settings.includeTestPerspectiveTable,
      });
      lastResult = result;

      if (result.passed) {
        appendEventToOutput(
          emitLogEvent(this.options.generationTaskId, 'info', t('compliance.passed')),
        );
        return;
      }

      const issueCount = result.analysisIssues.length + result.missingCaseIdIssues.length;
      appendEventToOutput(
        emitLogEvent(
          this.options.generationTaskId,
          'warn',
          t('compliance.issuesFound', String(issueCount)),
        ),
      );

      // 自動修正試行
      if (retryCount < maxRetries) {
        retryCount += 1;
        appendEventToOutput(
          emitLogEvent(
            this.options.generationTaskId,
            'info',
            t('compliance.autoFixAttempt', String(retryCount), String(maxRetries)),
          ),
        );

        const fixPrompt = this.buildAutoFixPrompt(result, perspectiveMarkdown);
        await this.runGenerationWithFileCollection(fixPrompt);
      } else {
        break;
      }
    }

    // 最大回数到達後も違反が残る場合は警告＋レポート保存
    if (lastResult && !lastResult.passed) {
      const warningMsg = t('compliance.autoFixLimitReached', String(maxRetries));
      appendEventToOutput(
        emitLogEvent(this.options.generationTaskId, 'warn', warningMsg),
      );
      void vscode.window.showWarningMessage(warningMsg);

      // レポート保存
      await this.saveComplianceReport(lastResult);
    }
  }

  /**
   * 自動修正用のプロンプトを構築する
   */
  private buildAutoFixPrompt(result: ComplianceCheckResult, perspectiveMarkdown: string | undefined): string {
    const issuesText = formatComplianceIssuesForPrompt(result);
    const parts: string[] = [
      '## テストコード自動修正',
      '',
      '以下のテスト品質の問題が検出されました。各問題を修正してください。',
      '',
      issuesText,
      '',
      '## 修正ルール',
      '',
      '1. **Given/When/Then コメント**: 各テストケースに必ず付与',
      '2. **境界値テスト**: 0 / 最小値 / 最大値 / ±1 / 空 / null / undefined を考慮',
      '3. **例外メッセージ検証**: 例外の型とメッセージを明示的に検証',
      '',
    ];

    if (perspectiveMarkdown) {
      parts.push(
        '## 観点表',
        '',
        perspectiveMarkdown,
        '',
        '観点表のすべてのケース（Case ID）をテストとして実装し、各テストケースに対応する Case ID をコメントで記載すること。',
        '',
      );
    }

    parts.push(
      '## 重要: 編集対象ファイル',
      '',
      '以下のファイルのみを編集してください:',
      '',
    );
    for (const absPath of this.generatedFilePaths) {
      const relativePath = path.relative(this.runWorkspaceRoot, absPath);
      if (isTestFilePath(relativePath)) {
        parts.push(`- ${relativePath}`);
      }
    }
    parts.push('', '**上記以外のファイル（docs/, 設定ファイル等）は編集禁止です。**');

    return parts.join('\n');
  }

  /**
   * 準拠チェック結果をレポートとして保存する
   */
  private async saveComplianceReport(result: ComplianceCheckResult): Promise<void> {
    const reportDir = this.settings.testExecutionReportDir;
    const reportContent = this.formatComplianceReportMarkdown(result);
    const fileName = `compliance-report_${this.timestamp}.md`;

    try {
      const dirAbsolute = path.isAbsolute(reportDir)
        ? reportDir
        : path.join(this.localWorkspaceRoot, reportDir);
      await fs.promises.mkdir(dirAbsolute, { recursive: true });
      const filePath = path.join(dirAbsolute, fileName);
      await fs.promises.writeFile(filePath, reportContent, 'utf8');
      const relativePath = path.relative(this.localWorkspaceRoot, filePath);
      appendEventToOutput(
        emitLogEvent(this.options.generationTaskId, 'info', t('compliance.reportSaved', relativePath)),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      appendEventToOutput(
        emitLogEvent(this.options.generationTaskId, 'error', t('compliance.reportSaveFailed', message)),
      );
    }
  }

  /**
   * 準拠チェック結果をMarkdown形式でフォーマットする
   */
  private formatComplianceReportMarkdown(result: ComplianceCheckResult): string {
    const lines: string[] = [
      '# Strategy Compliance Report',
      '',
      `**Generated**: ${new Date().toISOString()}`,
      `**Analyzed Files**: ${result.analyzedFiles}`,
      `**Status**: ${result.passed ? '✅ Passed' : '❌ Issues Found'}`,
      '',
    ];

    if (result.analysisIssues.length > 0) {
      lines.push('## Test Quality Issues');
      lines.push('');
      lines.push('| Type | File | Line | Detail |');
      lines.push('|------|------|------|--------|');
      for (const issue of result.analysisIssues) {
        const lineInfo = issue.line !== undefined ? String(issue.line) : '-';
        lines.push(`| ${issue.type} | ${issue.file} | ${lineInfo} | ${issue.detail} |`);
      }
      lines.push('');
    }

    if (result.missingCaseIdIssues.length > 0) {
      lines.push('## Missing Case ID Implementations');
      lines.push('');
      lines.push('| Case ID | Detail |');
      lines.push('|---------|--------|');
      for (const issue of result.missingCaseIdIssues) {
        lines.push(`| ${issue.caseId} | ${issue.detail} |`);
      }
      lines.push('');
    }

    if (result.perspectiveSkippedWarning) {
      lines.push('## Warnings');
      lines.push('');
      lines.push(`- ${result.perspectiveSkippedWarning}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  private async runTestExecution(genExit: number | null): Promise<void> {
    let worktreeApplyResult: WorktreeApplyResult | undefined;
    let testWorkspaceRoot = this.runWorkspaceRoot;
    if (this.runLocation === 'worktree' && this.worktreeDir && this.options.extensionContext) {
      worktreeApplyResult = await applyWorktreeTestChanges({
        generationTaskId: this.options.generationTaskId,
        genExit,
        localWorkspaceRoot: this.localWorkspaceRoot,
        runWorkspaceRoot: this.runWorkspaceRoot,
        extensionContext: this.options.extensionContext,
        preTestCheckCommand: this.settings.preTestCheckCommand,
      });
      if (worktreeApplyResult.applied) {
        testWorkspaceRoot = this.localWorkspaceRoot;
      }
    }

    handleTestGenEventForProgressView(
      emitPhaseEvent(this.options.generationTaskId, 'running-tests', t('progressTreeView.phase.runningTests')),
    );
    taskManager.updatePhase(this.options.generationTaskId, 'running-tests', 'running-tests');

    const extensionVersion = this.resolveExtensionVersion();
    const trimmedTestCommand = this.settings.testCommand.trim();
    const isTestCommandEmpty = trimmedTestCommand.length === 0;
    const isWorktreeMode = this.runLocation === 'worktree';
    // NOTE:
    // Worktree モードでは、ローカルへテスト差分の適用に成功した場合のみ自動テストを実行する。
    // worktreeApplyResult が未設定（例: 途中で例外が発生）な場合も「適用できていない」とみなし、テストは安全側でスキップする。
    const isWorktreeAppliedToLocal = worktreeApplyResult?.applied === true;
    const shouldSkipTestExecution = isTestCommandEmpty || (isWorktreeMode && !isWorktreeAppliedToLocal);
    if (shouldSkipTestExecution) {
      const msg =
        isTestCommandEmpty
          ? t('testExecution.skip.emptyCommand')
          : t('testExecution.skip.worktreeMvp');
      const ev = emitLogEvent(`${this.options.generationTaskId}-test`, 'warn', msg);
      handleTestGenEventForStatusBar({ type: 'started', taskId: ev.taskId, label: 'test-command', detail: 'skipped', timestampMs: nowMs() });
      this.captureEvent({ type: 'started', taskId: ev.taskId, label: 'test-command', detail: 'skipped', timestampMs: nowMs() });
      appendEventToOutput(ev);
      this.captureEvent(ev);
      handleTestGenEventForStatusBar({ type: 'completed', taskId: ev.taskId, exitCode: null, timestampMs: nowMs() });
      const completedEv: TestGenEvent = { type: 'completed', taskId: ev.taskId, exitCode: null, timestampMs: nowMs() };
      appendEventToOutput(completedEv);
      this.captureEvent(completedEv);
      const skippedResult: TestExecutionResult = {
        command: this.settings.testCommand,
        cwd: testWorkspaceRoot,
        exitCode: null,
        signal: null,
        durationMs: 0,
        stdout: '',
        stderr: '',
        executionRunner: 'unknown',
        skipped: true,
        skipReason: msg,
        extensionLog: this.testExecutionLogLines.join('\n'),
        extensionVersion,
      };
      const saved = await saveTestExecutionReport({
        workspaceRoot: this.localWorkspaceRoot,
        generationLabel: this.options.generationLabel,
        targetPaths: this.options.targetPaths,
        model: this.options.model,
        reportDir: this.settings.testExecutionReportDir,
        timestamp: this.timestamp,
        result: skippedResult,
      });
      // パネル向け最終結果を更新（スキップ）
      const summarySkipped = computeTestReportSummary({ exitCode: null, skipped: true, testResult: undefined });
      taskManager.setLastTestReportStatus({ success: summarySkipped.success, exitCode: summarySkipped.exitCode, updatedAt: nowMs() });
      appendEventToOutput(emitLogEvent(ev.taskId, 'info', t('testExecution.reportSaved', saved.relativePath ?? saved.absolutePath)));
      // 進捗TreeView完了イベント
      handleTestGenEventForProgressView({ type: 'completed', taskId: this.options.generationTaskId, exitCode: null, timestampMs: nowMs() });
      return;
    }

    const testTaskId = `${this.options.generationTaskId}-test`;
    const testResultPath = this.resolveTestResultFilePath(testWorkspaceRoot);
    const testResultEnv = this.buildTestResultEnv(testResultPath);
    const willLaunchVsCode = await this.looksLikeVsCodeLaunchingTestCommand(testWorkspaceRoot, this.settings.testCommand);

    if (willLaunchVsCode && this.settings.testExecutionRunner === 'extension') {
      const warn = emitLogEvent(
        testTaskId,
        'warn',
        t('testExecution.warn.mayLaunchVsCode.extensionRunner'),
      );
      appendEventToOutput(warn);
      this.captureEvent(warn);
    }

    if (this.settings.testExecutionRunner === 'cursorAgent') {
      if (willLaunchVsCode) {
        const warn = emitLogEvent(
          testTaskId,
          'warn',
          t('testExecution.warn.mayLaunchVsCode.cursorAgentRunner'),
        );
        appendEventToOutput(warn);
        this.captureEvent(warn);
      }

      const started: TestGenEvent = {
        type: 'started',
        taskId: testTaskId,
        label: 'test-command',
        detail: `runner=cursorAgent cmd=${this.settings.testCommand}`,
        timestampMs: nowMs(),
      };
      handleTestGenEventForStatusBar(started);
      appendEventToOutput(started);
      this.captureEvent(started);

      const testStartedAt = nowMs();
      const result = await runTestCommandViaCursorAgent({
        provider: this.options.provider,
        taskId: `${testTaskId}-agent`,
        workspaceRoot: testWorkspaceRoot,
        cursorAgentCommand: this.options.cursorAgentCommand,
        model: this.options.model,
        testCommand: this.settings.testCommand,
        allowForce: this.settings.cursorAgentForceForTestExecution,
        onEvent: (event) => {
          handleTestGenEventForStatusBar(event);
          appendEventToOutput(event);
          this.captureEvent(event);
        },
      });
      const resultWithPath = { ...result, testResultPath, extensionVersion };

      const stderrLower = result.stderr.toLowerCase();
      const toolExecutionRejected =
        (stderrLower.includes('rejected') && (stderrLower.includes('execution') || stderrLower.includes('tool') || stderrLower.includes('command'))) ||
        result.stderr.includes('Tool execution rejected') ||
        result.stderr.includes('Execution rejected') ||
        (result.errorMessage?.includes('ツール') ?? false);

      const suspiciousEmptyResult =
        result.exitCode === null &&
        result.durationMs === 0 &&
        result.signal === null &&
        result.stdout.trim().length === 0 &&
        result.stderr.trim().length === 0 &&
        (result.errorMessage?.trim().length ?? 0) === 0;

      const rejectedJpMessage =
        result.stderr.includes('コマンドの実行が拒否されました') ||
        result.stderr.includes('コマンドが拒否されました') ||
        result.stderr.includes('実行が拒否されました') ||
        result.stderr.includes('手動で承認が必要') ||
        (result.errorMessage?.includes('拒否') ?? false);

      const shouldTreatAsRejected = toolExecutionRejected || suspiciousEmptyResult || rejectedJpMessage;

      if (shouldTreatAsRejected) {
        const warnMessage = t('testExecution.warn.cursorAgentRejectedFallback');
        const warn = emitLogEvent(testTaskId, 'warn', warnMessage);
        appendEventToOutput(warn);
        this.captureEvent(warn);

        const fallbackStartedAt = nowMs();
        const fallbackResult = await runTestCommand({ command: this.settings.testCommand, cwd: testWorkspaceRoot, env: testResultEnv });
        const fallbackWithPath = { ...fallbackResult, testResultPath, extensionVersion };
        const enrichedFallbackResult = await this.attachTestResult({
          result: fallbackWithPath,
          testWorkspaceRoot,
          startedAtMs: fallbackStartedAt,
        });

        const completed: TestGenEvent = { type: 'completed', taskId: testTaskId, exitCode: fallbackResult.exitCode, timestampMs: nowMs() };
        handleTestGenEventForStatusBar(completed);
        appendEventToOutput(completed);
        this.captureEvent(completed);

        const saved = await saveTestExecutionReport({
          workspaceRoot: this.localWorkspaceRoot,
          generationLabel: this.options.generationLabel,
          targetPaths: this.options.targetPaths,
          model: this.options.model,
          reportDir: this.settings.testExecutionReportDir,
          timestamp: this.timestamp,
          result: { ...enrichedFallbackResult, extensionLog: this.testExecutionLogLines.join('\n') },
        });
        // パネル向け最終結果を更新（cursorAgentフォールバック経路）
        const summaryFallback = computeTestReportSummary({ exitCode: fallbackResult.exitCode, skipped: false, testResult: enrichedFallbackResult.testResult });
        taskManager.setLastTestReportStatus({ success: summaryFallback.success, exitCode: summaryFallback.exitCode, updatedAt: nowMs() });
        appendEventToOutput(
          emitLogEvent(testTaskId, 'info', t('testExecution.reportSaved', saved.relativePath ?? saved.absolutePath)),
        );
        handleTestGenEventForProgressView({ type: 'completed', taskId: this.options.generationTaskId, exitCode: fallbackResult.exitCode, timestampMs: nowMs() });
        return;
      }

      const enrichedResult = await this.attachTestResult({ result: resultWithPath, testWorkspaceRoot, startedAtMs: testStartedAt });
      const completed: TestGenEvent = { type: 'completed', taskId: testTaskId, exitCode: result.exitCode, timestampMs: nowMs() };
      handleTestGenEventForStatusBar(completed);
      appendEventToOutput(completed);
      this.captureEvent(completed);

      const saved = await saveTestExecutionReport({
        workspaceRoot: this.localWorkspaceRoot,
        generationLabel: this.options.generationLabel,
        targetPaths: this.options.targetPaths,
        model: this.options.model,
        reportDir: this.settings.testExecutionReportDir,
        timestamp: this.timestamp,
        result: { ...enrichedResult, extensionLog: this.testExecutionLogLines.join('\n') },
      });
      // パネル向け最終結果を更新（cursorAgent経路）
      const summaryAgent = computeTestReportSummary({ exitCode: result.exitCode, skipped: false, testResult: enrichedResult.testResult });
      taskManager.setLastTestReportStatus({ success: summaryAgent.success, exitCode: summaryAgent.exitCode, updatedAt: nowMs() });
      appendEventToOutput(emitLogEvent(testTaskId, 'info', t('testExecution.reportSaved', saved.relativePath ?? saved.absolutePath)));
      handleTestGenEventForProgressView({ type: 'completed', taskId: this.options.generationTaskId, exitCode: result.exitCode, timestampMs: nowMs() });
      return;
    }

    const started: TestGenEvent = {
      type: 'started',
      taskId: testTaskId,
      label: 'test-command',
      detail: `cmd=${this.settings.testCommand}`,
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(started);
    appendEventToOutput(started);
    this.captureEvent(started);

    const testStartedAt = nowMs();
    const result = await runTestCommand({ command: this.settings.testCommand, cwd: testWorkspaceRoot, env: testResultEnv });
    const resultWithPath = { ...result, testResultPath, extensionVersion };
    const enrichedResult = await this.attachTestResult({ result: resultWithPath, testWorkspaceRoot, startedAtMs: testStartedAt });

    const testCompletedMsg = t(
      'testExecution.completed',
      String(result.exitCode ?? 'null'),
      String(result.durationMs),
    );
    const testCompletedEvent = emitLogEvent(
      testTaskId,
      result.exitCode === 0 ? 'info' : 'error',
      testCompletedMsg,
    );
    appendEventToOutput(testCompletedEvent);
    this.captureEvent(testCompletedEvent);

    const completed: TestGenEvent = { type: 'completed', taskId: testTaskId, exitCode: result.exitCode, timestampMs: nowMs() };
    handleTestGenEventForStatusBar(completed);
    appendEventToOutput(completed);
    this.captureEvent(completed);

    const saved = await saveTestExecutionReport({
      workspaceRoot: this.localWorkspaceRoot,
      generationLabel: this.options.generationLabel,
      targetPaths: this.options.targetPaths,
      model: this.options.model,
      reportDir: this.settings.testExecutionReportDir,
      timestamp: this.timestamp,
      result: { ...enrichedResult, extensionLog: this.testExecutionLogLines.join('\n') },
    });
    // パネル向け最終結果を更新（extension経路）
    const summaryExt = computeTestReportSummary({ exitCode: result.exitCode, skipped: false, testResult: enrichedResult.testResult });
    taskManager.setLastTestReportStatus({ success: summaryExt.success, exitCode: summaryExt.exitCode, updatedAt: nowMs() });

    appendEventToOutput(emitLogEvent(testTaskId, 'info', t('testExecution.reportSaved', saved.relativePath ?? saved.absolutePath)));
    handleTestGenEventForProgressView({ type: 'completed', taskId: this.options.generationTaskId, exitCode: result.exitCode, timestampMs: nowMs() });
  }

  private async cleanup(): Promise<void> {
    if (this.worktreeDir) {
      try {
        await this.worktreeOps.removeTemporaryWorktree(this.localWorkspaceRoot, this.worktreeDir);
        appendEventToOutput(emitLogEvent(this.options.generationTaskId, 'info', t('worktree.deleted')));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        appendEventToOutput(emitLogEvent(this.options.generationTaskId, 'warn', t('worktree.deleteFailed', message)));
      }
    }

    taskManager.unregister(this.options.generationTaskId);
  }

  private buildTestResultEnv(testResultFilePath: string): NodeJS.ProcessEnv {
    return {
      // テスト結果ファイルの出力先をワークスペース内に固定する
      DONTFORGETEST_TEST_RESULT_FILE: testResultFilePath,
    };
  }

  private resolveTestResultFilePath(testWorkspaceRoot: string): string {
    return path.join(testWorkspaceRoot, '.vscode-test', 'test-result.json');
  }

  private resolveExtensionVersion(): string | undefined {
    const fromContext = this.options.extensionContext?.extension?.packageJSON?.version;
    if (typeof fromContext === 'string' && fromContext.trim().length > 0) {
      return fromContext.trim();
    }
    const fromSelf = vscode.extensions.getExtension('kinopeee.dontforgetest')?.packageJSON?.version;
    if (typeof fromSelf === 'string' && fromSelf.trim().length > 0) {
      return fromSelf.trim();
    }
    return undefined;
  }

  private async attachTestResult(params: {
    result: TestExecutionResult;
    testWorkspaceRoot: string;
    startedAtMs: number;
  }): Promise<TestExecutionResult> {
    const testResult = await this.readTestResultFile(params.testWorkspaceRoot, params.startedAtMs);
    if (!testResult) {
      return params.result;
    }
    return { ...params.result, testResult };
  }

  private async readTestResultFile(testWorkspaceRoot: string, startedAtMs: number): Promise<TestResultFile | undefined> {
    const testResultPath = this.resolveTestResultFilePath(testWorkspaceRoot);
    const freshnessGraceMs = 1000;
    try {
      const stat = await fs.promises.stat(testResultPath);
      const raw = await fs.promises.readFile(testResultPath, 'utf8');
      const parsed = parseTestResultFile(raw);
      if (!parsed.ok) {
        return undefined;
      }
      const timestamp = typeof parsed.value.timestamp === 'number' ? parsed.value.timestamp : undefined;
      const isFreshByMtime = stat.mtimeMs >= startedAtMs - freshnessGraceMs;
      const isFreshByTimestamp = timestamp !== undefined && timestamp >= startedAtMs - freshnessGraceMs;
      if (!isFreshByMtime && !isFreshByTimestamp) {
        return undefined;
      }
      return parsed.value;
    } catch {
      return undefined;
    }
  }

  private appendPerspectiveToPrompt(basePrompt: string, perspectiveMarkdown: string): string {
    return [
      basePrompt,
      '',
      '## 生成済みテスト観点表（必須）',
      '以下の観点表に記載された **すべてのケース** をテストとして実装してください。',
      '観点表のケースを漏れなく網羅し、各テストケースに対応する Case ID をコメントで記載すること。',
      '',
      '## 重要: 観点表の保存について（必須）',
      '- 観点表は拡張機能が所定フローで保存済みです（docs 配下に保存されます）。',
      '- **観点表を別ファイルに保存しない**（例: ルート直下の `test_perspectives.md` を作らない）。',
      '- **docs/** や *.md の編集/作成は禁止**（テストコードのみを変更してください）。',
      '',
      perspectiveMarkdown,
    ].join('\n');
  }

  private async looksLikeVsCodeLaunchingTestCommand(workspaceRoot: string, testCommand: string): Promise<boolean> {
    return await looksLikeVsCodeLaunchingTestCommand({
      workspaceRoot,
      testCommand,
      readFileUtf8: (filePath: string) => fs.promises.readFile(filePath, 'utf8'),
    });
  }
}

/**
 * テスト専用の内部関数エクスポート。
 * 本番利用は禁止。
 */
export const __test__ = {
  looksLikeVsCodeLaunchingTestCommand,
};
