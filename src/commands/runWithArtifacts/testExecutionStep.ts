import { nowMs, type TestGenEvent } from '../../core/event';
import { parseTestExecutionJsonV1, type TestExecutionResult } from '../../core/artifacts';
import { t } from '../../core/l10n';
import { type AgentProvider } from '../../providers/provider';
import { runProviderToCompletion } from '../../providers/runToCompletion';
import { extractBetweenMarkers } from './utils';

export async function runTestCommandViaCursorAgent(params: {
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

  const jsonMarkerBegin = '<!-- BEGIN TEST EXECUTION JSON -->';
  const jsonMarkerEnd = '<!-- END TEST EXECUTION JSON -->';
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
    '- Cursor を手動で起動するコマンドは禁止（ただし、テストコマンド自体が起動する場合はそのまま実行してよい）',
    '',
    '## 実行するコマンド（必須）',
    '以下をそのまま実行し、終了コードを取得してください。',
    '',
    '```bash',
    params.testCommand,
    '```',
    '',
    '## 出力フォーマット（必須）',
    `- 返答は **JSON（コードフェンスなし）だけ** にする`,
    `- 出力は次のマーカーで囲むこと: ${jsonMarkerBegin} ... ${jsonMarkerEnd}`,
    '- マーカー外には何も出力しない（説明文は禁止）',
    '- JSONスキーマ v1:',
    '- `{ "version": 1, "exitCode": number|null, "signal": string|null, "durationMs": number, "stdout": string, "stderr": string }`',
    '- stdout/stderr は **文字列** とし、改行は `\\n` を含む形で表現する（生の改行は入れない）',
    '',
    jsonMarkerBegin,
    '{',
    '  "version": 1,',
    '  "exitCode": 0,',
    '  "signal": null,',
    '  "durationMs": 1234,',
    '  "stdout": "line1\\\\nline2",',
    '  "stderr": ""',
    '}',
    jsonMarkerEnd,
    '',
  ].join('\n');

  const logs: string[] = [];
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
      if (event.type === 'log') {
        logs.push(event.message);
      }
    },
  });

  const raw = logs.join('\n');
  const durationMs = Math.max(0, nowMs() - startedAt);

  // 1) JSON（新形式）を優先
  const extractedJson = extractBetweenMarkers(raw, jsonMarkerBegin, jsonMarkerEnd);
  if (extractedJson) {
    try {
      const parsed = parseTestExecutionJsonV1(extractedJson);
      if (parsed.ok) {
        const d = parsed.value.durationMs;
        const durationMsFinal = typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : durationMs;
        return {
          command: params.testCommand,
          cwd: params.workspaceRoot,
          exitCode: parsed.value.exitCode,
          signal: parsed.value.signal ? (parsed.value.signal as NodeJS.Signals) : null,
          durationMs: durationMsFinal,
          stdout: parsed.value.stdout,
          stderr: parsed.value.stderr,
        };
      }
      // JSON抽出はできたがパースできない場合は、旧形式へのフォールバックも試す
    } catch {
      // ignore -> fallback
    }
  }

  // 2) 旧形式（テキスト）へフォールバック
  const extracted = extractBetweenMarkers(raw, markerBegin, markerEnd);
  if (!extracted) {
    const prefix = extractedJson ? t('testExecution.extractFailed.jsonParsePrefix') : '';
    return {
      command: params.testCommand,
      cwd: params.workspaceRoot,
      exitCode: exit,
      signal: null,
      durationMs,
      stdout: '',
      stderr: raw,
      errorMessage: `${prefix}${t('testExecution.extractFailed.noMarkers')}`.trim(),
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

