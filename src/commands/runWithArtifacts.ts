import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { recordTouchedPathFromEventPath, startLastRun } from '../apply/patchApplier';
import { type TestGenEvent, nowMs } from '../core/event';
import {
  emitLogEvent,
  formatTimestamp,
  getArtifactSettings,
  saveTestExecutionReport,
  saveTestPerspectiveTable,
  type SavedArtifact,
  type ArtifactSettings,
  type TestExecutionResult,
} from '../core/artifacts';
import { buildTestPerspectivePrompt } from '../core/promptBuilder';
import { runTestCommand } from '../core/testRunner';
import { type AgentProvider } from '../providers/provider';
import { appendEventToOutput, showTestGenOutput } from '../ui/outputChannel';
import { handleTestGenEventForStatusBar } from '../ui/statusBar';

/**
 * `testCommand` が VS Code（Electron）を起動するタイプのテストである可能性が高い場合に true を返す。
 *
 * 例:
 * - VS Code拡張機能の統合テスト（@vscode/test-electron）: `npm test` が VS Code を別プロセスで起動する
 *
 * Cursor/VS Code 上の拡張機能からさらに VS Code を起動すると不安定になり得るため、
 * そのようなケースは自動テスト実行をスキップし、ユーザーに手動実行を促す。
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
  // テスト実行レポートに載せるのは「テスト実行（またはスキップ）」に関するログだけに限定する。
  // 生成（cursor-agent）の長文ログまで混ぜると、テスト実行レポートとして読みにくくなるため。
  const testExecutionLogLines: string[] = [];

  /**
   * cursor-agent の出力には、実行環境向けのメタ情報（system_reminder 等）が混ざることがある。
   * レポートにはユーザー向けの内容だけ残すため、保存前に最低限の正規化を行う。
   */
  const sanitizeLogMessageForReport = (message: string): string => {
    let text = message.replace(/\r\n/g, '\n');

    // <system_reminder> ... </system_reminder> ブロックはユーザー向けでないため除去
    text = text.replace(/<system_reminder>[\s\S]*?<\/system_reminder>/g, '');

    // 行単位でノイズを除去
    const rawLines = text.split('\n').map((l) => l.replace(/\s+$/g, '')); // 末尾空白を落とす
    const filtered: string[] = [];
    for (const line of rawLines) {
      const trimmed = line.trim();
      // 空行は後段で畳むため一旦残す
      if (trimmed === 'event:tool_call') {
        continue;
      }
      if (trimmed === 'system:init') {
        continue;
      }
      filtered.push(line);
    }

    // 空行を最大1つに畳む
    const collapsed: string[] = [];
    let prevBlank = false;
    for (const line of filtered) {
      const isBlank = line.trim().length === 0;
      if (isBlank) {
        if (prevBlank) {
          continue;
        }
        prevBlank = true;
        collapsed.push('');
        continue;
      }
      prevBlank = false;
      collapsed.push(line);
    }

    return collapsed.join('\n').trim();
  };

  const captureEvent = (event: TestGenEvent): void => {
    const tsIso = new Date(event.timestampMs).toISOString();
    switch (event.type) {
      case 'started':
        testExecutionLogLines.push(`[${tsIso}] [${event.taskId}] START ${event.label}${event.detail ? ` (${event.detail})` : ''}`);
        break;
      case 'log':
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
      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _exhaustive: never = event;
        break;
      }
    }
  };

  try {
    showTestGenOutput(true);

    // 1) 生成前: 観点表を生成して保存し、テスト生成プロンプトに注入
    let finalPrompt = options.generationPrompt;
    if (settings.includeTestPerspectiveTable) {
      const perspectiveResult = await runPerspectiveTableStep({
        provider: options.provider,
        workspaceRoot: options.workspaceRoot,
        cursorAgentCommand: options.cursorAgentCommand,
        testStrategyPath: options.testStrategyPath,
        generationLabel: options.generationLabel,
        targetPaths: options.targetPaths,
        referenceText: options.perspectiveReferenceText,
        model: options.model,
        reportDir: settings.perspectiveReportDir,
        timestamp,
        baseTaskId: options.generationTaskId,
      });

      // 観点表が正常に抽出できた場合のみ、テスト生成プロンプトに注入する
      if (perspectiveResult?.extracted) {
        finalPrompt = appendPerspectiveToPrompt(options.generationPrompt, perspectiveResult.markdown);
      }
    }

    // 2) 生成（本体）
    await startLastRun(options.generationTaskId, options.generationLabel, options.workspaceRoot, options.targetPaths);
    void vscode.window.showInformationMessage(`テスト生成を開始しました: ${options.generationLabel}`);

    const genExit = await runProviderToCompletion({
      provider: options.provider,
      run: {
        taskId: options.generationTaskId,
        workspaceRoot: options.workspaceRoot,
        agentCommand: options.cursorAgentCommand,
        prompt: finalPrompt,
        model: options.model,
        outputFormat: 'stream-json',
        allowWrite: true,
      },
      onEvent: (event) => {
        handleTestGenEventForStatusBar(event);
        appendEventToOutput(event);
        if (event.type === 'fileWrite') {
          recordTouchedPathFromEventPath(options.workspaceRoot, event.path);
        }
      },
    });

    const genMsg =
      genExit === 0
        ? `テスト生成が完了しました: ${options.generationLabel}`
        : `テスト生成に失敗しました: ${options.generationLabel} (exit=${genExit ?? 'null'})`;
    if (genExit === 0) {
      void vscode.window.showInformationMessage(genMsg);
    } else {
      void vscode.window.showErrorMessage(genMsg);
    }

    // 3) 生成後: テスト実行 + レポート保存
    if (settings.testCommand.trim().length === 0) {
      const msg = 'testgen-agent.testCommand が空のため、テスト実行はスキップします。';
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
        cwd: options.workspaceRoot,
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
        workspaceRoot: options.workspaceRoot,
        generationLabel: options.generationLabel,
        targetPaths: options.targetPaths,
        model: options.model,
        reportDir: settings.testExecutionReportDir,
        timestamp,
        result: skippedResult,
      });
      appendEventToOutput(emitLogEvent(ev.taskId, 'info', `テスト実行レポートを保存しました: ${saved.relativePath ?? saved.absolutePath}`));
      return;
    }

    const testTaskId = `${options.generationTaskId}-test`;

    // VS Code を起動しそうなテストコマンドは、拡張機能（extension runner）での自動実行を避ける。
    // ただし runner=cursorAgent の場合は「cursor-agent に実行させて結果だけ回収」するため、ここではスキップしない。
    const willLaunchVsCode = await looksLikeVsCodeLaunchingTestCommand(options.workspaceRoot, settings.testCommand);
    if (willLaunchVsCode && settings.testExecutionRunner === 'extension' && !settings.allowUnsafeTestCommand) {
      const msg =
        'このプロジェクトの testCommand は VS Code を別プロセスで起動する可能性があるため、拡張機能内の自動テスト実行をスキップします（必要ならターミナルで手動実行してください）。';
      const ev = emitLogEvent(testTaskId, 'warn', msg);
      handleTestGenEventForStatusBar({ type: 'started', taskId: ev.taskId, label: 'test-command', detail: 'skipped (would launch VS Code)', timestampMs: nowMs() });
      captureEvent({ type: 'started', taskId: ev.taskId, label: 'test-command', detail: 'skipped (would launch VS Code)', timestampMs: nowMs() });
      appendEventToOutput(ev);
      captureEvent(ev);
      handleTestGenEventForStatusBar({ type: 'completed', taskId: ev.taskId, exitCode: null, timestampMs: nowMs() });
      const completedEv: TestGenEvent = { type: 'completed', taskId: ev.taskId, exitCode: null, timestampMs: nowMs() };
      appendEventToOutput(completedEv);
      captureEvent(completedEv);
      const skippedResult: TestExecutionResult = {
        command: settings.testCommand,
        cwd: options.workspaceRoot,
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
        workspaceRoot: options.workspaceRoot,
        generationLabel: options.generationLabel,
        targetPaths: options.targetPaths,
        model: options.model,
        reportDir: settings.testExecutionReportDir,
        timestamp,
        result: skippedResult,
      });
      appendEventToOutput(emitLogEvent(testTaskId, 'info', `テスト実行レポートを保存しました: ${saved.relativePath ?? saved.absolutePath}`));
      return;
    }

    // runner に応じて実行
    if (settings.testExecutionRunner === 'cursorAgent') {
      // VS Code 起動の可能性がある場合は注意ログを残して実行する（runner=cursorAgent ではスキップしない）
      if (willLaunchVsCode) {
        const warn = emitLogEvent(
          testTaskId,
          'warn',
          'testCommand は VS Code（拡張機能テスト用の Extension Host）を別プロセスで起動する可能性があります。runner=cursorAgent のため結果取得を優先して実行します（重複起動で不安定になる場合があります）。',
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
        workspaceRoot: options.workspaceRoot,
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

      // cursor-agent 側でコマンド実行が拒否された場合、結果が空になってしまう。
      // ユーザーが許可している場合のみ、拡張機能側（extension runner）でフォールバック実行して結果を保存する。
      if (toolExecutionRejected) {
        const canFallback = !willLaunchVsCode || settings.allowUnsafeTestCommand;
        const warnMessage = canFallback
          ? 'cursor-agent によるコマンド実行が拒否されたため、拡張機能側でフォールバック実行します。'
          : 'cursor-agent によるコマンド実行が拒否されました。VS Code 起動の可能性があるため、拡張機能側への自動フォールバックも行いません（allowUnsafeTestCommand を有効化するとフォールバックできます）。';
        const warn = emitLogEvent(testTaskId, 'warn', warnMessage);
        appendEventToOutput(warn);
        captureEvent(warn);

        if (!canFallback) {
          const completed: TestGenEvent = { type: 'completed', taskId: testTaskId, exitCode: null, timestampMs: nowMs() };
          handleTestGenEventForStatusBar(completed);
          appendEventToOutput(completed);
          captureEvent(completed);

          const saved = await saveTestExecutionReport({
            workspaceRoot: options.workspaceRoot,
            generationLabel: options.generationLabel,
            targetPaths: options.targetPaths,
            model: options.model,
            reportDir: settings.testExecutionReportDir,
            timestamp,
            result: { ...result, exitCode: null, skipped: true, skipReason: warnMessage, extensionLog: testExecutionLogLines.join('\n') },
          });
          appendEventToOutput(emitLogEvent(testTaskId, 'info', `テスト実行レポートを保存しました: ${saved.relativePath ?? saved.absolutePath}`));
          return;
        }

        // フォールバック（extension runner）
        const fallbackResult = await runTestCommand({ command: settings.testCommand, cwd: options.workspaceRoot });
        const completed: TestGenEvent = { type: 'completed', taskId: testTaskId, exitCode: fallbackResult.exitCode, timestampMs: nowMs() };
        handleTestGenEventForStatusBar(completed);
        appendEventToOutput(completed);
        captureEvent(completed);

        const saved = await saveTestExecutionReport({
          workspaceRoot: options.workspaceRoot,
          generationLabel: options.generationLabel,
          targetPaths: options.targetPaths,
          model: options.model,
          reportDir: settings.testExecutionReportDir,
          timestamp,
          result: { ...fallbackResult, extensionLog: testExecutionLogLines.join('\n') },
        });
        appendEventToOutput(emitLogEvent(testTaskId, 'info', `テスト実行レポートを保存しました: ${saved.relativePath ?? saved.absolutePath}`));
        return;
      }

      const completed: TestGenEvent = { type: 'completed', taskId: testTaskId, exitCode: result.exitCode, timestampMs: nowMs() };
      handleTestGenEventForStatusBar(completed);
      appendEventToOutput(completed);
      captureEvent(completed);

      const saved = await saveTestExecutionReport({
        workspaceRoot: options.workspaceRoot,
        generationLabel: options.generationLabel,
        targetPaths: options.targetPaths,
        model: options.model,
        reportDir: settings.testExecutionReportDir,
        timestamp,
        result: { ...result, extensionLog: testExecutionLogLines.join('\n') },
      });
      appendEventToOutput(emitLogEvent(testTaskId, 'info', `テスト実行レポートを保存しました: ${saved.relativePath ?? saved.absolutePath}`));
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

    const result = await runTestCommand({ command: settings.testCommand, cwd: options.workspaceRoot });

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
      workspaceRoot: options.workspaceRoot,
      generationLabel: options.generationLabel,
      targetPaths: options.targetPaths,
      model: options.model,
      reportDir: settings.testExecutionReportDir,
      timestamp,
      result: { ...result, extensionLog: testExecutionLogLines.join('\n') },
    });

    appendEventToOutput(emitLogEvent(testTaskId, 'info', `テスト実行レポートを保存しました: ${saved.relativePath ?? saved.absolutePath}`));
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw err;
  }
}

async function runTestCommandViaCursorAgent(params: {
  provider: AgentProvider;
  taskId: string;
  workspaceRoot: string;
  cursorAgentCommand: string;
  model: string | undefined;
  testCommand: string;
  allowForce: boolean;
  onEvent: (event: TestGenEvent) => void;
}): Promise<TestExecutionResult> {
  const startedAt = nowMs();

  const markerBegin = '<!-- BEGIN TEST EXECUTION RESULT -->';
  const markerEnd = '<!-- END TEST EXECUTION RESULT -->';
  const stdoutBegin = '<!-- BEGIN STDOUT -->';
  const stdoutEnd = '<!-- END STDOUT -->';
  const stderrBegin = '<!-- BEGIN STDERR -->';
  const stderrEnd = '<!-- END STDERR -->';

  const prompt = [
    'あなたはテスト実行担当です。',
    '目的は「指定されたテストコマンドを実行し、その結果（stdout/stderr/exitCode）を機械的に抽出できる形式で返す」ことです。',
    '',
    '## 制約（必須）',
    '- **ファイルの編集・作成は禁止**（読み取りのみ）',
    '- **デバッグ開始・ウォッチ開始・対話的セッション開始は禁止**',
    '- テストコマンドは **1回だけ** 実行する（同じコマンドを繰り返さない）',
    '- 可能なら余計なコマンドを実行しない（cd など最低限は可）',
    '- VS Code / Cursor を手動で起動するコマンドは禁止（ただし、テストコマンド自体が起動する場合はそのまま実行してよい）',
    '',
    '## 実行するコマンド（必須）',
    '以下をそのまま実行し、終了コードを取得してください。',
    '',
    '```bash',
    params.testCommand,
    '```',
    '',
    '## 出力フォーマット（必須）',
    `- 出力は次のマーカーで囲むこと: ${markerBegin} ... ${markerEnd}`,
    '- マーカー外には何も出力しない（説明文は禁止）',
    '',
    markerBegin,
    'exitCode: <number|null>',
    'signal: <string|null>',
    'durationMs: <number>',
    stdoutBegin,
    '(stdout をそのまま貼り付け)',
    stdoutEnd,
    stderrBegin,
    '(stderr をそのまま貼り付け)',
    stderrEnd,
    markerEnd,
    '',
  ].join('\n');

  const logs: string[] = [];
  let sawFileWrite = false;
  const exit = await runProviderToCompletion({
    provider: params.provider,
    run: {
      taskId: params.taskId,
      workspaceRoot: params.workspaceRoot,
      agentCommand: params.cursorAgentCommand,
      prompt,
      model: params.model,
      outputFormat: 'stream-json',
      allowWrite: params.allowForce,
    },
    onEvent: (event) => {
      params.onEvent(event);
      if (event.type === 'fileWrite') {
        sawFileWrite = true;
      }
      if (event.type === 'log') {
        logs.push(event.message);
      }
    },
  });

  const raw = logs.join('\n');
  const extracted = extractBetweenMarkers(raw, markerBegin, markerEnd);
  const durationMs = Math.max(0, nowMs() - startedAt);

  if (!extracted) {
    return {
      command: params.testCommand,
      cwd: params.workspaceRoot,
      exitCode: exit,
      signal: null,
      durationMs,
      stdout: '',
      stderr: raw,
      errorMessage: 'cursor-agent の出力からテスト結果を抽出できませんでした（マーカーが見つかりません）。',
    };
  }

  const exitMatch = extracted.match(/^\s*exitCode:\s*(.+)\s*$/m);
  const signalMatch = extracted.match(/^\s*signal:\s*(.+)\s*$/m);
  const durMatch = extracted.match(/^\s*durationMs:\s*(\d+)\s*$/m);
  const stdout = extractBetweenMarkers(extracted, stdoutBegin, stdoutEnd) ?? '';
  const stderr = extractBetweenMarkers(extracted, stderrBegin, stderrEnd) ?? '';

  const exitCodeRaw = exitMatch?.[1]?.trim();
  const exitCode =
    !exitCodeRaw || exitCodeRaw === 'null' ? null : Number.isFinite(Number(exitCodeRaw)) ? Number(exitCodeRaw) : exit ?? null;
  const signalRaw = signalMatch?.[1]?.trim();
  const signal = !signalRaw || signalRaw === 'null' ? null : (signalRaw as NodeJS.Signals);
  const parsedDurationMs = durMatch?.[1] ? Number(durMatch[1]) : durationMs;

  return {
    command: params.testCommand,
    cwd: params.workspaceRoot,
    exitCode,
    signal,
    durationMs: Number.isFinite(parsedDurationMs) ? parsedDurationMs : durationMs,
    stdout,
    stderr,
  };
}

/**
 * テスト観点表生成ステップの結果。
 * 保存した成果物情報と、テスト生成に注入できる観点表のマークダウンを含む。
 */
interface PerspectiveStepResult {
  saved: SavedArtifact;
  /** 抽出された観点表のマークダウン（抽出成功時のみテスト生成に使用可能） */
  markdown: string;
  /** マーカーから正常に抽出できたかどうか */
  extracted: boolean;
}

async function runPerspectiveTableStep(params: {
  provider: AgentProvider;
  workspaceRoot: string;
  cursorAgentCommand: string;
  testStrategyPath: string;
  generationLabel: string;
  targetPaths: string[];
  referenceText?: string;
  model: string | undefined;
  reportDir: string;
  timestamp: string;
  baseTaskId: string;
}): Promise<PerspectiveStepResult | undefined> {
  const taskId = `${params.baseTaskId}-perspectives`;

  const { prompt } = await buildTestPerspectivePrompt({
    workspaceRoot: params.workspaceRoot,
    targetLabel: params.generationLabel,
    targetPaths: params.targetPaths,
    testStrategyPath: params.testStrategyPath,
    referenceText: params.referenceText,
  });

  const logs: string[] = [];
  const exitCode = await runProviderToCompletion({
    provider: params.provider,
    run: {
      taskId,
      workspaceRoot: params.workspaceRoot,
      agentCommand: params.cursorAgentCommand,
      prompt,
      model: params.model,
      outputFormat: 'stream-json',
      allowWrite: false,
    },
    onEvent: (event) => {
      handleTestGenEventForStatusBar(event);
      appendEventToOutput(event);
      if (event.type === 'log') {
        logs.push(event.message);
      }
    },
  });

  const raw = logs.join('\n');
  const extracted = extractBetweenMarkers(raw, '<!-- BEGIN TEST PERSPECTIVES -->', '<!-- END TEST PERSPECTIVES -->');
  const wasExtracted = Boolean(extracted?.trim().length);
  const perspectiveMarkdown = wasExtracted
    ? extracted!.trim()
    : [
      '> 観点表の抽出に失敗したため、取得できたログをそのまま保存します。',
      `> provider exit=${exitCode ?? 'null'}`,
      '',
      raw.trim().length > 0 ? raw.trim() : '(ログが空でした)',
    ].join('\n');

  const saved = await saveTestPerspectiveTable({
    workspaceRoot: params.workspaceRoot,
    targetLabel: params.generationLabel,
    targetPaths: params.targetPaths,
    perspectiveMarkdown,
    reportDir: params.reportDir,
    timestamp: params.timestamp,
  });

  appendEventToOutput(emitLogEvent(taskId, 'info', `テスト観点表を保存しました: ${saved.relativePath ?? saved.absolutePath}`));
  return { saved, markdown: perspectiveMarkdown, extracted: wasExtracted };
}

async function runProviderToCompletion(params: {
  provider: AgentProvider;
  run: {
    taskId: string;
    workspaceRoot: string;
    agentCommand: string;
    prompt: string;
    model: string | undefined;
    outputFormat: 'stream-json';
    allowWrite: boolean;
  };
  onEvent: (event: TestGenEvent) => void;
}): Promise<number | null> {
  return await new Promise<number | null>((resolve) => {
    let resolved = false;
    const finish = (exitCode: number | null) => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve(exitCode);
    };

    params.provider.run({
      taskId: params.run.taskId,
      workspaceRoot: params.run.workspaceRoot,
      agentCommand: params.run.agentCommand,
      prompt: params.run.prompt,
      model: params.run.model,
      outputFormat: params.run.outputFormat,
      allowWrite: params.run.allowWrite,
      onEvent: (event) => {
        params.onEvent(event);
        if (event.type === 'completed') {
          finish(event.exitCode);
        }
      },
    });
  });
}

function extractBetweenMarkers(text: string, begin: string, end: string): string | undefined {
  const start = text.indexOf(begin);
  if (start === -1) {
    return undefined;
  }
  const afterStart = start + begin.length;
  const stop = text.indexOf(end, afterStart);
  if (stop === -1) {
    return undefined;
  }
  return text.slice(afterStart, stop).trim();
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
    perspectiveMarkdown,
  ].join('\n');
}
