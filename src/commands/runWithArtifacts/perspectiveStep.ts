import { sanitizeAgentLogMessage } from '../../core/agentLogSanitizer';
import { emitLogEvent, parsePerspectiveJsonV1, renderPerspectiveMarkdownTable, saveTestPerspectiveTable, type PerspectiveCase, type SavedArtifact } from '../../core/artifacts';
import { type TestGenEvent } from '../../core/event';
import { buildTestPerspectivePrompt } from '../../core/promptBuilder';
import { type AgentProvider, type RunningTask } from '../../providers/provider';
import { runProviderToCompletion } from '../../providers/runToCompletion';
import { appendEventToOutput } from '../../ui/outputChannel';
import { handleTestGenEventForStatusBar } from '../../ui/statusBar';
import { coerceLegacyPerspectiveMarkdownTable, extractBetweenMarkers, truncateText } from './utils';

/**
 * テスト観点表生成ステップの結果。
 * 保存した成果物情報と、テスト生成に注入できる観点表のマークダウンを含む。
 */
export interface PerspectiveStepResult {
  saved: SavedArtifact;
  /** 抽出された観点表のマークダウン（抽出成功時のみテスト生成に使用可能） */
  markdown: string;
  /** マーカーから正常に抽出できたかどうか */
  extracted: boolean;
}

export async function runPerspectiveTableStep(params: {
  provider: AgentProvider;
  /** cursor-agent を実行する cwd（local または worktree） */
  runWorkspaceRoot: string;
  /** 観点表（docs配下）を保存する先（ローカルワークスペース） */
  artifactWorkspaceRoot: string;
  cursorAgentCommand: string;
  testStrategyPath: string;
  generationLabel: string;
  targetPaths: string[];
  referenceText?: string;
  model: string | undefined;
  reportDir: string;
  /** 0以下の場合はタイムアウトしない */
  timeoutMs: number;
  timestamp: string;
  baseTaskId: string;
  /** タスク開始時に呼ばれるコールバック。RunningTaskを受け取って登録等に使用可能。 */
  onRunningTask?: (runningTask: RunningTask) => void;
}): Promise<PerspectiveStepResult | undefined> {
  const taskId = `${params.baseTaskId}-perspectives`;

  const { prompt } = await buildTestPerspectivePrompt({
    workspaceRoot: params.runWorkspaceRoot,
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
      workspaceRoot: params.runWorkspaceRoot,
      agentCommand: params.cursorAgentCommand,
      prompt,
      model: params.model,
      outputFormat: 'stream-json',
      allowWrite: false,
    },
    timeoutMs: params.timeoutMs,
    onEvent: (event: TestGenEvent) => {
      handleTestGenEventForStatusBar(event);
      appendEventToOutput(event);
      if (event.type === 'log') {
        logs.push(event.message);
      }
    },
    onRunningTask: params.onRunningTask,
  });

  const raw = logs.join('\n');
  const extractedJson = extractBetweenMarkers(raw, '<!-- BEGIN TEST PERSPECTIVES JSON -->', '<!-- END TEST PERSPECTIVES JSON -->');
  const extractedMd = extractBetweenMarkers(raw, '<!-- BEGIN TEST PERSPECTIVES -->', '<!-- END TEST PERSPECTIVES -->');

  /**
   * 抽出失敗時でも「表として機械パース可能」な形を維持するため、
   * 失敗は1行のエラーケースとして表に埋め込み、詳細ログは折りたたみで添付する。
   */
  const buildFailureMarkdown = (reason: string): string => {
    const errorCase: PerspectiveCase = {
      caseId: 'TC-E-EXTRACT-01',
      inputPrecondition: '',
      perspective: '',
      expectedResult: '',
      notes: reason,
    };
    const table = renderPerspectiveMarkdownTable([errorCase]);
    const logText = sanitizeAgentLogMessage(raw.trim().length > 0 ? raw.trim() : '(ログが空でした)');
    const truncated = truncateText(logText, 200_000);
    const details = [
      '<details>',
      '<summary>抽出ログ（クリックで展開）</summary>',
      '',
      '```text',
      truncated,
      '```',
      '',
      '</details>',
      '',
    ].join('\n');
    return `${table}\n${details}`.trimEnd();
  };

  let wasExtracted = false;
  let perspectiveMarkdown = '';

  if (extractedJson && extractedJson.trim().length > 0) {
    const parsed = parsePerspectiveJsonV1(extractedJson);
    if (parsed.ok) {
      if (parsed.value.cases.length > 0) {
        perspectiveMarkdown = renderPerspectiveMarkdownTable(parsed.value.cases).trimEnd();
        wasExtracted = true;
      } else {
        perspectiveMarkdown = buildFailureMarkdown('観点表JSONの cases が空でした');
      }
    } else {
      perspectiveMarkdown = buildFailureMarkdown(`観点表JSONのパースに失敗しました: ${parsed.error}`);
    }
  } else if (extractedMd && extractedMd.trim().length > 0) {
    const normalized = coerceLegacyPerspectiveMarkdownTable(extractedMd);
    if (normalized) {
      perspectiveMarkdown = normalized.trimEnd();
      wasExtracted = true;
    } else {
      perspectiveMarkdown = buildFailureMarkdown('旧形式（Markdown）の観点表を抽出できませんでした');
    }
  } else {
    perspectiveMarkdown = buildFailureMarkdown(`観点表の抽出に失敗しました: provider exit=${exitCode ?? 'null'}`);
  }

  const saved = await saveTestPerspectiveTable({
    workspaceRoot: params.artifactWorkspaceRoot,
    targetLabel: params.generationLabel,
    targetPaths: params.targetPaths,
    perspectiveMarkdown,
    reportDir: params.reportDir,
    timestamp: params.timestamp,
  });

  appendEventToOutput(emitLogEvent(taskId, 'info', `テスト観点表を保存しました: ${saved.relativePath ?? saved.absolutePath}`));
  return { saved, markdown: perspectiveMarkdown, extracted: wasExtracted };
}

