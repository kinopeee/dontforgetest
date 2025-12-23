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

  try {
    showTestGenOutput(true);

    // 1) 生成前: 観点表を生成して保存
    if (settings.includeTestPerspectiveTable) {
      await runPerspectiveTableStep({
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
        prompt: options.generationPrompt,
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
      appendEventToOutput(ev);
      handleTestGenEventForStatusBar({ type: 'completed', taskId: ev.taskId, exitCode: null, timestampMs: nowMs() });
      appendEventToOutput({ type: 'completed', taskId: ev.taskId, exitCode: null, timestampMs: nowMs() });
      return;
    }

    const testTaskId = `${options.generationTaskId}-test`;

    // VS Code を起動しそうなテストコマンドは、拡張機能内の自動実行を避ける
    const willLaunchVsCode = await looksLikeVsCodeLaunchingTestCommand(options.workspaceRoot, settings.testCommand);
    if (willLaunchVsCode) {
      const msg =
        'このプロジェクトの testCommand は VS Code を別プロセスで起動する可能性があるため、拡張機能内の自動テスト実行をスキップします（必要ならターミナルで手動実行してください）。';
      const ev = emitLogEvent(testTaskId, 'warn', msg);
      handleTestGenEventForStatusBar({ type: 'started', taskId: ev.taskId, label: 'test-command', detail: 'skipped (would launch VS Code)', timestampMs: nowMs() });
      appendEventToOutput(ev);
      handleTestGenEventForStatusBar({ type: 'completed', taskId: ev.taskId, exitCode: null, timestampMs: nowMs() });
      appendEventToOutput({ type: 'completed', taskId: ev.taskId, exitCode: null, timestampMs: nowMs() });
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

    const result = await runTestCommand({ command: settings.testCommand, cwd: options.workspaceRoot });

    appendEventToOutput(
      emitLogEvent(
        testTaskId,
        result.exitCode === 0 ? 'info' : 'error',
        `テスト実行が完了しました: exit=${result.exitCode ?? 'null'} durationMs=${result.durationMs}`,
      ),
    );

    const completed: TestGenEvent = { type: 'completed', taskId: testTaskId, exitCode: result.exitCode, timestampMs: nowMs() };
    handleTestGenEventForStatusBar(completed);
    appendEventToOutput(completed);

    const saved = await saveTestExecutionReport({
      workspaceRoot: options.workspaceRoot,
      generationLabel: options.generationLabel,
      targetPaths: options.targetPaths,
      model: options.model,
      reportDir: settings.testExecutionReportDir,
      timestamp,
      result,
    });

    appendEventToOutput(emitLogEvent(testTaskId, 'info', `テスト実行レポートを保存しました: ${saved.relativePath ?? saved.absolutePath}`));
  } catch (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw err;
  }
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
}): Promise<SavedArtifact | undefined> {
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
  const perspectiveMarkdown =
    extracted?.trim().length
      ? extracted.trim()
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
  return saved;
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

