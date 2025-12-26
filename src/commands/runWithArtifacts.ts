import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { sanitizeAgentLogMessage } from '../core/agentLogSanitizer';
import { type TestGenEvent, nowMs } from '../core/event';
import { t } from '../core/l10n';
import {
  emitLogEvent,
  formatTimestamp,
  getArtifactSettings,
  saveTestExecutionReport,
  type ArtifactSettings,
  type TestExecutionResult,
} from '../core/artifacts';
import { taskManager } from '../core/taskManager';
import { runTestCommand } from '../core/testRunner';
import { createTemporaryWorktree, removeTemporaryWorktree } from '../git/worktreeManager';
import { type AgentProvider, type RunningTask } from '../providers/provider';
import { runProviderToCompletion } from '../providers/runToCompletion';
import { appendEventToOutput } from '../ui/outputChannel';
import { handleTestGenEventForStatusBar } from '../ui/statusBar';
import { handleTestGenEventForProgressView, emitPhaseEvent } from '../ui/progressTreeView';
import { cleanupUnexpectedPerspectiveFiles } from './runWithArtifacts/cleanupStep';
import { applyWorktreeTestChanges } from './runWithArtifacts/worktreeApplyStep';
import { runTestCommandViaCursorAgent } from './runWithArtifacts/testExecutionStep';
import { runPerspectiveTableStep } from './runWithArtifacts/perspectiveStep';

/**
 * `testCommand` が VS Code（Electron）を起動するタイプのテストである可能性が高い場合に true を返す。
 *
 * 例:
 * - VS Code拡張機能の統合テスト（@vscode/test-electron）: `npm test` が VS Code を別プロセスで起動する
 *
 * 以前は Cursor/VS Code 上の拡張機能からさらに VS Code を起動すると不安定になり得るため、
 * 自動テスト実行をスキップしていた。
 *
 * 現在は別プロセス起動の衝突回避策を講じたため、**スキップせず常に実行する**。
 * 本関数は「警告ログを出すための推定」にのみ使用する。
 */
async function looksLikeVsCodeLaunchingTestCommand(workspaceRoot: string, testCommand: string): Promise<boolean> {
  const cmd = testCommand.trim();

  // コマンド自体に VS Codeテストランナーの痕跡がある場合
  if (/(^|[\s/])out[/\\]test[/\\]runTest(\.js)?\b/.test(cmd) || /@vscode\/test-electron/.test(cmd)) {
    return true;
  }

  // `npm test` / `npm run test` 系のみ package.json を参照して推定する
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

    // VS Code拡張機能テストでよく見られるパターン
    if (/(@vscode\/test-electron|vscode-test|out\/test\/runTest\.js|out\\test\\runTest\.js)/.test(testScript)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export interface RunWithArtifactsOptions {
  provider: AgentProvider;
  workspaceRoot: string;
  cursorAgentCommand: string;
  testStrategyPath: string;
  /** UI表示用 */
  generationLabel: string;
  /** 観点表/生成の対象ファイル（ワークスペース相対推奨） */
  targetPaths: string[];
  /** 生成用プロンプト（buildTestGenPrompt 結果など） */
  generationPrompt: string;
  /** 観点表生成の参考テキスト（差分など。任意） */
  perspectiveReferenceText?: string;
  /** モデル上書き（undefined=設定に従う） */
  model: string | undefined;
  /** 生成タスクID（lastRun と紐づく） */
  generationTaskId: string;
  /**
   * 実行先。
   * - local: 現在のワークスペースを直接編集
   * - worktree: 一時worktreeで生成し、テスト差分だけをローカルへ適用（MVP）
   */
  runLocation?: 'local' | 'worktree';
  /** worktree実行時に必要（globalStorage を使用する） */
  extensionContext?: vscode.ExtensionContext;
  /** テスト用: 設定の上書き */
  settingsOverride?: Partial<ArtifactSettings>;
}

/**
 * 生成フローに「観点表保存」「テスト実行レポート保存」を差し込んで実行する。
 */
export async function runWithArtifacts(options: RunWithArtifactsOptions): Promise<void> {
  const baseSettings = getArtifactSettings();
  const settings: ArtifactSettings = { ...baseSettings, ...options.settingsOverride };
  const timestamp = formatTimestamp(new Date());
  const runLocation: 'local' | 'worktree' = options.runLocation === 'worktree' ? 'worktree' : 'local';
  const localWorkspaceRoot = options.workspaceRoot;
  let runWorkspaceRoot = localWorkspaceRoot;
  let worktreeDir: string | undefined;
  // テスト実行レポートに載せるのは「テスト実行（またはスキップ）」に関するログだけに限定する。
  // 生成（cursor-agent）の長文ログまで混ぜると、テスト実行レポートとして読みにくくなるため。
  const testExecutionLogLines: string[] = [];

  /**
   * cursor-agent の出力には、実行環境向けのメタ情報（system_reminder 等）が混ざることがある。
   * レポートにはユーザー向けの内容だけ残すため、保存前に最低限の正規化を行う。
   */
  const sanitizeLogMessageForReport = (message: string): string => {
    return sanitizeAgentLogMessage(message);
  };

  const captureEvent = (event: TestGenEvent): void => {
    const tsIso = new Date(event.timestampMs).toISOString();
    switch (event.type) {
      case 'started':
        testExecutionLogLines.push(`[${tsIso}] [${event.taskId}] START ${event.label}${event.detail ? ` (${event.detail})` : ''}`);
        break;
      case 'log': {
        // Output Channel と同等の情報を残しつつ、レポート向けに整形する（message は改行を含み得る）
        const sanitized = sanitizeLogMessageForReport(event.message);
        if (sanitized.length === 0) {
          break;
        }
        const lines = sanitized.split('\n');
        const level = event.level.toUpperCase();
        testExecutionLogLines.push(`[${tsIso}] [${event.taskId}] ${level} ${lines[0] ?? ''}`.trimEnd());
        for (let i = 1; i < lines.length; i += 1) {
          testExecutionLogLines.push(`  ${lines[i] ?? ''}`.trimEnd());
        }
        break;
      }
      case 'fileWrite':
        testExecutionLogLines.push(
          `[${tsIso}] [${event.taskId}] WRITE ${event.path}` +
          `${event.linesCreated !== undefined ? ` lines=${event.linesCreated}` : ''}` +
          `${event.bytesWritten !== undefined ? ` bytes=${event.bytesWritten}` : ''}`,
        );
        break;
      case 'completed':
        testExecutionLogLines.push(`[${tsIso}] [${event.taskId}] DONE exit=${event.exitCode ?? 'null'}`);
        break;
      case 'phase':
        testExecutionLogLines.push(`[${tsIso}] [${event.taskId}] PHASE ${event.phase}: ${event.phaseLabel}`);
        break;
      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _exhaustive: never = event;
        break;
      }
    }
  };

  // タスク開始イベントを発火（進捗TreeView用）
  const startedEvent: TestGenEvent = {
    type: 'started',
    taskId: options.generationTaskId,
    label: options.generationLabel,
    detail: options.targetPaths.join(', '),
    timestampMs: nowMs(),
  };
  handleTestGenEventForProgressView(startedEvent);

  // 初期のRunningTask（後で各フェーズで更新される）
  const initialRunningTask: RunningTask = {
    taskId: options.generationTaskId,
    dispose: () => {
      // 初期状態では何もしない（各フェーズでupdateRunningTaskにより更新される）
    },
  };
  taskManager.register(options.generationTaskId, options.generationLabel, initialRunningTask);

  // キャンセルチェック用のヘルパー関数
  const checkCancelled = (): boolean => {
    return taskManager.isCancelled(options.generationTaskId);
  };

  try {

    // 準備フェーズ
    handleTestGenEventForProgressView(
      emitPhaseEvent(options.generationTaskId, 'preparing', t('progressTreeView.phase.preparing')),
    );

    // worktree モードの場合、生成先を隔離するために一時worktreeを作成する
    if (runLocation === 'worktree') {
      if (!options.extensionContext) {
        const msg = t('worktree.extensionContextRequired');
        appendEventToOutput(emitLogEvent(options.generationTaskId, 'error', msg));
        void vscode.window.showErrorMessage(msg);
        handleTestGenEventForProgressView({ type: 'completed', taskId: options.generationTaskId, exitCode: null, timestampMs: nowMs() });
        return;
      }

      // キャンセルチェック（worktree作成前）
      if (checkCancelled()) {
        appendEventToOutput(emitLogEvent(options.generationTaskId, 'warn', t('task.cancelled')));
        handleTestGenEventForProgressView({ type: 'completed', taskId: options.generationTaskId, exitCode: null, timestampMs: nowMs() });
        return;
      }

      try {
        const baseDir = options.extensionContext.globalStorageUri.fsPath;
        await fs.promises.mkdir(baseDir, { recursive: true });
        appendEventToOutput(emitLogEvent(options.generationTaskId, 'info', t('worktree.creating')));
        const created = await createTemporaryWorktree({
          repoRoot: localWorkspaceRoot,
          baseDir,
          taskId: options.generationTaskId,
          ref: 'HEAD',
        });
        worktreeDir = created.worktreeDir;
        runWorkspaceRoot = worktreeDir;
        appendEventToOutput(emitLogEvent(options.generationTaskId, 'info', t('worktree.created', worktreeDir)));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const msg = t('worktree.createFailed', message);
        appendEventToOutput(emitLogEvent(options.generationTaskId, 'error', msg));
        void vscode.window.showErrorMessage(msg);
        handleTestGenEventForProgressView({ type: 'completed', taskId: options.generationTaskId, exitCode: null, timestampMs: nowMs() });
        return;
      }
    }

    // 1) 生成前: 観点表を生成して保存し、テスト生成プロンプトに注入
    let finalPrompt = options.generationPrompt;
    if (settings.includeTestPerspectiveTable) {
      // 観点表生成フェーズ
      handleTestGenEventForProgressView(
        emitPhaseEvent(options.generationTaskId, 'perspectives', t('progressTreeView.phase.perspectives')),
      );

      const perspectiveResult = await runPerspectiveTableStep({
        provider: options.provider,
        runWorkspaceRoot,
        artifactWorkspaceRoot: localWorkspaceRoot,
        cursorAgentCommand: options.cursorAgentCommand,
        testStrategyPath: options.testStrategyPath,
        generationLabel: options.generationLabel,
        targetPaths: options.targetPaths,
        referenceText: options.perspectiveReferenceText,
        model: options.model,
        reportDir: settings.perspectiveReportDir,
        timeoutMs: settings.perspectiveGenerationTimeoutMs,
        timestamp,
        baseTaskId: options.generationTaskId,
        onRunningTask: (runningTask) => {
          // 観点表生成フェーズのRunningTaskを更新
          taskManager.updateRunningTask(options.generationTaskId, runningTask);
        },
      });

      // 観点表が正常に抽出できた場合のみ、テスト生成プロンプトに注入する
      if (perspectiveResult?.extracted) {
        finalPrompt = appendPerspectiveToPrompt(options.generationPrompt, perspectiveResult.markdown);
      }
    }

    // 2) 生成（本体）
    // テストコード生成フェーズ
    handleTestGenEventForProgressView(
      emitPhaseEvent(options.generationTaskId, 'generating', t('progressTreeView.phase.generating')),
    );

    // キャンセルチェック（観点表生成後）
    if (checkCancelled()) {
      appendEventToOutput(emitLogEvent(options.generationTaskId, 'warn', t('task.cancelled')));
      handleTestGenEventForProgressView({ type: 'completed', taskId: options.generationTaskId, exitCode: null, timestampMs: nowMs() });
      return;
    }

    const genExit = await runProviderToCompletion({
      provider: options.provider,
      run: {
        taskId: options.generationTaskId,
        workspaceRoot: runWorkspaceRoot,
        agentCommand: options.cursorAgentCommand,
        prompt: finalPrompt,
        model: options.model,
        outputFormat: 'stream-json',
        allowWrite: true,
      },
      onEvent: (event) => {
        handleTestGenEventForStatusBar(event);
        appendEventToOutput(event);
      },
      onRunningTask: (runningTask) => {
        // タスクマネージャーのRunningTaskを更新（キャンセル用）
        taskManager.updateRunningTask(options.generationTaskId, runningTask);
      },
    });

    // 生成（allowWrite=true）の副産物として、所定フロー外のファイルが作られることがある。
    // 代表例: 生成済みの観点表をルート直下に `test_perspectives.md` や `test_perspectives_output.md` として保存してしまう。
    // これは拡張機能の所定フロー（docs 配下への成果物保存）と競合し、ユーザー体験を悪化させるため削除する。
    const cleanupResults = await cleanupUnexpectedPerspectiveFiles(localWorkspaceRoot);
    for (const cleanup of cleanupResults) {
      if (cleanup.deleted) {
        appendEventToOutput(
          emitLogEvent(
            `${options.generationTaskId}-guard`,
            'warn',
            `所定フロー外で作成された観点表ファイルを削除しました: ${cleanup.relativePath}`,
          ),
        );
      } else if (cleanup.errorMessage) {
        appendEventToOutput(
          emitLogEvent(
            `${options.generationTaskId}-guard`,
            'warn',
            `所定フロー外の観点表ファイル削除を試みましたが失敗しました: ${cleanup.relativePath} - ${cleanup.errorMessage}`,
          ),
        );
      }
    }

    const genMsg =
      genExit === 0
        ? `テスト生成が完了しました: ${options.generationLabel}`
        : `テスト生成に失敗しました: ${options.generationLabel} (exit=${genExit ?? 'null'})`;
    if (genExit === 0) {
      // Worktreeモードは「適用結果（成功/要手動マージ）」の通知を別途出すため、
      // ここで完了トーストを出すと二重通知になり、誤解を招きやすい。
      if (runLocation === 'local') {
        void vscode.window.showInformationMessage(genMsg);
      }
    } else {
      void vscode.window.showErrorMessage(genMsg);
    }

    // 3) 生成後: テスト実行 + レポート保存

    // キャンセルチェック（生成後）
    if (checkCancelled()) {
      appendEventToOutput(emitLogEvent(options.generationTaskId, 'warn', t('task.cancelled')));
      handleTestGenEventForProgressView({ type: 'completed', taskId: options.generationTaskId, exitCode: null, timestampMs: nowMs() });
      return;
    }

    // worktree モードの場合、生成結果（テスト差分のみ）をローカルへ適用する
    if (runLocation === 'worktree' && worktreeDir && options.extensionContext) {
      await applyWorktreeTestChanges({
        generationTaskId: options.generationTaskId,
        genExit,
        localWorkspaceRoot,
        runWorkspaceRoot,
        extensionContext: options.extensionContext,
        preTestCheckCommand: settings.preTestCheckCommand,
      });
    }

    // テスト実行フェーズ
    handleTestGenEventForProgressView(
      emitPhaseEvent(options.generationTaskId, 'running-tests', t('progressTreeView.phase.runningTests')),
    );

    const shouldSkipTestExecution = runLocation === 'worktree' || settings.testCommand.trim().length === 0;
    if (shouldSkipTestExecution) {
      const msg =
        runLocation === 'worktree'
          ? t('testExecution.skip.worktreeMvp')
          : t('testExecution.skip.emptyCommand');
      const ev = emitLogEvent(`${options.generationTaskId}-test`, 'warn', msg);
      handleTestGenEventForStatusBar({ type: 'started', taskId: ev.taskId, label: 'test-command', detail: 'skipped', timestampMs: nowMs() });
      captureEvent({ type: 'started', taskId: ev.taskId, label: 'test-command', detail: 'skipped', timestampMs: nowMs() });
      appendEventToOutput(ev);
      captureEvent(ev);
      handleTestGenEventForStatusBar({ type: 'completed', taskId: ev.taskId, exitCode: null, timestampMs: nowMs() });
      const completedEv: TestGenEvent = { type: 'completed', taskId: ev.taskId, exitCode: null, timestampMs: nowMs() };
      appendEventToOutput(completedEv);
      captureEvent(completedEv);
      const skippedResult: TestExecutionResult = {
        command: settings.testCommand,
        cwd: runWorkspaceRoot,
        exitCode: null,
        signal: null,
        durationMs: 0,
        stdout: '',
        stderr: '',
        skipped: true,
        skipReason: msg,
        extensionLog: testExecutionLogLines.join('\n'),
      };
      const saved = await saveTestExecutionReport({
        workspaceRoot: localWorkspaceRoot,
        generationLabel: options.generationLabel,
        targetPaths: options.targetPaths,
        model: options.model,
        reportDir: settings.testExecutionReportDir,
        timestamp,
        result: skippedResult,
      });
      appendEventToOutput(emitLogEvent(ev.taskId, 'info', t('testExecution.reportSaved', saved.relativePath ?? saved.absolutePath)));
      // 進捗TreeView完了イベント
      handleTestGenEventForProgressView({ type: 'completed', taskId: options.generationTaskId, exitCode: null, timestampMs: nowMs() });
      return;
    }

    const testTaskId = `${options.generationTaskId}-test`;

    const willLaunchVsCode = await looksLikeVsCodeLaunchingTestCommand(runWorkspaceRoot, settings.testCommand);
    // VS Code 起動の可能性がある場合は警告ログを出す（スキップはしない）
    if (willLaunchVsCode && settings.testExecutionRunner === 'extension') {
      const warn = emitLogEvent(
        testTaskId,
        'warn',
        t('testExecution.warn.mayLaunchVsCode.extensionRunner'),
      );
      appendEventToOutput(warn);
      captureEvent(warn);
    }

    // runner に応じて実行
    if (settings.testExecutionRunner === 'cursorAgent') {
      // VS Code 起動の可能性がある場合は注意ログを残して実行する（runner=cursorAgent ではスキップしない）
      if (willLaunchVsCode) {
        const warn = emitLogEvent(
          testTaskId,
          'warn',
          t('testExecution.warn.mayLaunchVsCode.cursorAgentRunner'),
        );
        appendEventToOutput(warn);
        captureEvent(warn);
      }

      const started: TestGenEvent = {
        type: 'started',
        taskId: testTaskId,
        label: 'test-command',
        detail: `runner=cursorAgent cmd=${settings.testCommand}`,
        timestampMs: nowMs(),
      };
      handleTestGenEventForStatusBar(started);
      appendEventToOutput(started);
      captureEvent(started);

      const result = await runTestCommandViaCursorAgent({
        provider: options.provider,
        taskId: `${testTaskId}-agent`,
        workspaceRoot: runWorkspaceRoot,
        cursorAgentCommand: options.cursorAgentCommand,
        model: options.model,
        testCommand: settings.testCommand,
        allowForce: settings.cursorAgentForceForTestExecution,
        onEvent: (event) => {
          handleTestGenEventForStatusBar(event);
          appendEventToOutput(event);
          captureEvent(event);
        },
      });
      // cursor-agent 経由だと、テスト側（npm test の子プロセス）から debug ingest へ到達できない場合がある。
      // そのため、取得できた stdout から「VS Code（Extension Host）起動回数」を数えて拡張機能側で記録する。

      const stderrLower = result.stderr.toLowerCase();
      const toolExecutionRejected =
        // cursor-agent / 実行環境側のポリシーでコマンド実行が拒否されるケース
        (stderrLower.includes('rejected') && (stderrLower.includes('execution') || stderrLower.includes('tool') || stderrLower.includes('command'))) ||
        // 既存の代表的な文言
        result.stderr.includes('Tool execution rejected') ||
        result.stderr.includes('Execution rejected') ||
        // 日本語メッセージ
        (result.errorMessage?.includes('ツール') ?? false);

      // cursor-agent の拒否/失敗が「空の結果」として返ってくる場合がある（stderr に明示メッセージが無い）。
      // 例: exitCode=null, durationMs=0, stdout/stderr空, errorMessageなし
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

      // cursor-agent 側でコマンド実行が拒否された場合、結果が空になってしまう。
      // 以前は VS Code 起動の可能性がある場合にフォールバックを抑止していたが、
      // 現在は改善策により **常にテストを実行**する方針のため、拡張機能側でフォールバック実行する。
      if (shouldTreatAsRejected) {
        const warnMessage = t('testExecution.warn.cursorAgentRejectedFallback');
        const warn = emitLogEvent(testTaskId, 'warn', warnMessage);
        appendEventToOutput(warn);
        captureEvent(warn);

        // フォールバック（extension runner）
        const fallbackResult = await runTestCommand({ command: settings.testCommand, cwd: runWorkspaceRoot });

        const completed: TestGenEvent = { type: 'completed', taskId: testTaskId, exitCode: fallbackResult.exitCode, timestampMs: nowMs() };
        handleTestGenEventForStatusBar(completed);
        appendEventToOutput(completed);
        captureEvent(completed);

        const saved = await saveTestExecutionReport({
          workspaceRoot: localWorkspaceRoot,
          generationLabel: options.generationLabel,
          targetPaths: options.targetPaths,
          model: options.model,
          reportDir: settings.testExecutionReportDir,
          timestamp,
          result: { ...fallbackResult, extensionLog: testExecutionLogLines.join('\n') },
        });
        appendEventToOutput(
          emitLogEvent(testTaskId, 'info', t('testExecution.reportSaved', saved.relativePath ?? saved.absolutePath)),
        );
        // 進捗TreeView完了イベント
        handleTestGenEventForProgressView({ type: 'completed', taskId: options.generationTaskId, exitCode: fallbackResult.exitCode, timestampMs: nowMs() });
        return;
      }

      const completed: TestGenEvent = { type: 'completed', taskId: testTaskId, exitCode: result.exitCode, timestampMs: nowMs() };
      handleTestGenEventForStatusBar(completed);
      appendEventToOutput(completed);
      captureEvent(completed);

      const saved = await saveTestExecutionReport({
        workspaceRoot: localWorkspaceRoot,
        generationLabel: options.generationLabel,
        targetPaths: options.targetPaths,
        model: options.model,
        reportDir: settings.testExecutionReportDir,
        timestamp,
        result: { ...result, extensionLog: testExecutionLogLines.join('\n') },
      });
      appendEventToOutput(emitLogEvent(testTaskId, 'info', t('testExecution.reportSaved', saved.relativePath ?? saved.absolutePath)));
      // 進捗TreeView完了イベント
      handleTestGenEventForProgressView({ type: 'completed', taskId: options.generationTaskId, exitCode: result.exitCode, timestampMs: nowMs() });
      return;
    }

    const started: TestGenEvent = {
      type: 'started',
      taskId: testTaskId,
      label: 'test-command',
      detail: `cmd=${settings.testCommand}`,
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(started);
    appendEventToOutput(started);
    captureEvent(started);

    const result = await runTestCommand({ command: settings.testCommand, cwd: runWorkspaceRoot });

    appendEventToOutput(
      emitLogEvent(
        testTaskId,
        result.exitCode === 0 ? 'info' : 'error',
        `テスト実行が完了しました: exit=${result.exitCode ?? 'null'} durationMs=${result.durationMs}`,
      ),
    );
    captureEvent(
      emitLogEvent(
        testTaskId,
        result.exitCode === 0 ? 'info' : 'error',
        `テスト実行が完了しました: exit=${result.exitCode ?? 'null'} durationMs=${result.durationMs}`,
      ),
    );

    const completed: TestGenEvent = { type: 'completed', taskId: testTaskId, exitCode: result.exitCode, timestampMs: nowMs() };
    handleTestGenEventForStatusBar(completed);
    appendEventToOutput(completed);
    captureEvent(completed);

    const saved = await saveTestExecutionReport({
      workspaceRoot: localWorkspaceRoot,
      generationLabel: options.generationLabel,
      targetPaths: options.targetPaths,
      model: options.model,
      reportDir: settings.testExecutionReportDir,
      timestamp,
      result: { ...result, extensionLog: testExecutionLogLines.join('\n') },
    });

    appendEventToOutput(emitLogEvent(testTaskId, 'info', t('testExecution.reportSaved', saved.relativePath ?? saved.absolutePath)));
    // 進捗TreeView完了イベント
    handleTestGenEventForProgressView({ type: 'completed', taskId: options.generationTaskId, exitCode: result.exitCode, timestampMs: nowMs() });
  } finally {
    // worktree モードの場合、最後に必ず一時worktreeを削除する（残留防止）
    if (worktreeDir) {
      try {
        await removeTemporaryWorktree(localWorkspaceRoot, worktreeDir);
        appendEventToOutput(emitLogEvent(options.generationTaskId, 'info', t('worktree.deleted')));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        appendEventToOutput(emitLogEvent(options.generationTaskId, 'warn', t('worktree.deleteFailed', message)));
      }
    }

    // タスク完了時に必ずタスクマネージャーから解除
    taskManager.unregister(options.generationTaskId);
  }
}


/**
 * テスト生成プロンプトに観点表を追加する。
 * 生成されたテストが観点表に記載されたすべてのケースを網羅するよう指示を含める。
 */
function appendPerspectiveToPrompt(basePrompt: string, perspectiveMarkdown: string): string {
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
