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
  saveTestExecutionReport,
  type ArtifactSettings,
  type TestExecutionResult,
} from '../../core/artifacts';
import { taskManager } from '../../core/taskManager';
import { runTestCommand } from '../../core/testRunner';
import { createTemporaryWorktree, removeTemporaryWorktree } from '../../git/worktreeManager';
import { type RunningTask } from '../../providers/provider';
import { runProviderToCompletion } from '../../providers/runToCompletion';
import { appendEventToOutput } from '../../ui/outputChannel';
import { handleTestGenEventForStatusBar } from '../../ui/statusBar';
import { handleTestGenEventForProgressView, emitPhaseEvent } from '../../ui/progressTreeView';
import { cleanupUnexpectedPerspectiveFiles } from './cleanupStep';
import { applyWorktreeTestChanges } from './worktreeApplyStep';
import { runTestCommandViaCursorAgent } from './testExecutionStep';
import { runPerspectiveTableStep } from './perspectiveStep';
import type { RunWithArtifactsOptions, WorktreeOps } from '../runWithArtifacts';

export class TestGenerationSession {
  private readonly options: RunWithArtifactsOptions;
  private readonly settings: ArtifactSettings;
  private readonly timestamp: string;
  private readonly runLocation: 'local' | 'worktree';
  private readonly localWorkspaceRoot: string;
  private readonly worktreeOps: WorktreeOps;

  private aborted: boolean = false;
  private runWorkspaceRoot: string;
  private worktreeDir: string | undefined;
  private testExecutionLogLines: string[] = [];

  constructor(options: RunWithArtifactsOptions) {
    this.options = options;
    const baseSettings = getArtifactSettings();
    this.settings = { ...baseSettings, ...options.settingsOverride };
    this.timestamp = formatTimestamp(new Date());
    this.runLocation = options.runLocation === 'worktree' ? 'worktree' : 'local';
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
    if (!this.settings.includeTestPerspectiveTable) {
      return undefined;
    }

    handleTestGenEventForProgressView(
      emitPhaseEvent(this.options.generationTaskId, 'perspectives', t('progressTreeView.phase.perspectives')),
    );

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

    if (perspectiveResult?.extracted) {
      return perspectiveResult.markdown;
    }
    return undefined;
  }

  private async generateTests(perspectiveMarkdown: string | undefined): Promise<number | null> {
    handleTestGenEventForProgressView(
      emitPhaseEvent(this.options.generationTaskId, 'generating', t('progressTreeView.phase.generating')),
    );

    let finalPrompt = this.options.generationPrompt;
    if (perspectiveMarkdown) {
      finalPrompt = this.appendPerspectiveToPrompt(this.options.generationPrompt, perspectiveMarkdown);
    }

    const genExit = await runProviderToCompletion({
      provider: this.options.provider,
      run: {
        taskId: this.options.generationTaskId,
        workspaceRoot: this.runWorkspaceRoot,
        agentCommand: this.options.cursorAgentCommand,
        prompt: finalPrompt,
        model: this.options.model,
        outputFormat: 'stream-json',
        allowWrite: true,
      },
      onEvent: (event) => {
        handleTestGenEventForStatusBar(event);
        appendEventToOutput(event);
      },
      onRunningTask: (runningTask) => {
        taskManager.updateRunningTask(this.options.generationTaskId, runningTask);
      },
    });

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

  private async runTestExecution(genExit: number | null): Promise<void> {
    if (this.runLocation === 'worktree' && this.worktreeDir && this.options.extensionContext) {
      await applyWorktreeTestChanges({
        generationTaskId: this.options.generationTaskId,
        genExit,
        localWorkspaceRoot: this.localWorkspaceRoot,
        runWorkspaceRoot: this.runWorkspaceRoot,
        extensionContext: this.options.extensionContext,
        preTestCheckCommand: this.settings.preTestCheckCommand,
      });
    }

    handleTestGenEventForProgressView(
      emitPhaseEvent(this.options.generationTaskId, 'running-tests', t('progressTreeView.phase.runningTests')),
    );

    const shouldSkipTestExecution = this.runLocation === 'worktree' || this.settings.testCommand.trim().length === 0;
    if (shouldSkipTestExecution) {
      const msg =
        this.runLocation === 'worktree'
          ? t('testExecution.skip.worktreeMvp')
          : t('testExecution.skip.emptyCommand');
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
        cwd: this.runWorkspaceRoot,
        exitCode: null,
        signal: null,
        durationMs: 0,
        stdout: '',
        stderr: '',
        skipped: true,
        skipReason: msg,
        extensionLog: this.testExecutionLogLines.join('\n'),
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
      appendEventToOutput(emitLogEvent(ev.taskId, 'info', t('testExecution.reportSaved', saved.relativePath ?? saved.absolutePath)));
      // 進捗TreeView完了イベント
      handleTestGenEventForProgressView({ type: 'completed', taskId: this.options.generationTaskId, exitCode: null, timestampMs: nowMs() });
      return;
    }

    const testTaskId = `${this.options.generationTaskId}-test`;
    const willLaunchVsCode = await this.looksLikeVsCodeLaunchingTestCommand(this.runWorkspaceRoot, this.settings.testCommand);

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

      const result = await runTestCommandViaCursorAgent({
        provider: this.options.provider,
        taskId: `${testTaskId}-agent`,
        workspaceRoot: this.runWorkspaceRoot,
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

        const fallbackResult = await runTestCommand({ command: this.settings.testCommand, cwd: this.runWorkspaceRoot });

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
          result: { ...fallbackResult, extensionLog: this.testExecutionLogLines.join('\n') },
        });
        appendEventToOutput(
          emitLogEvent(testTaskId, 'info', t('testExecution.reportSaved', saved.relativePath ?? saved.absolutePath)),
        );
        handleTestGenEventForProgressView({ type: 'completed', taskId: this.options.generationTaskId, exitCode: fallbackResult.exitCode, timestampMs: nowMs() });
        return;
      }

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
        result: { ...result, extensionLog: this.testExecutionLogLines.join('\n') },
      });
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

    const result = await runTestCommand({ command: this.settings.testCommand, cwd: this.runWorkspaceRoot });

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
      result: { ...result, extensionLog: this.testExecutionLogLines.join('\n') },
    });

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
    const cmd = testCommand.trim();

    if (/(^|[\s/])out[/\\]test[/\\]runTest(\.js)?\b/.test(cmd) || /@vscode\/test-electron/.test(cmd)) {
      return true;
    }

    if (!/^npm(\s+run)?\s+test\b/.test(cmd)) {
      return false;
    }

    const pkgPath = path.join(workspaceRoot, 'package.json');
    try {
      const raw = await fs.promises.readFile(pkgPath, 'utf8');
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
}
