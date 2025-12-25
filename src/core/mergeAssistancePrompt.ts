/**
 * コンフリクト等で自動適用できなかった場合に、「ユーザーがAIへ依頼して手動統合する」ための指示文を生成する。
 *
 * 方針:
 * - ローカル作業ツリーは壊さない（自動マージしない）
 * - 必要な入力（patch / snapshot / 失敗ログ）を揃えて提示する
 */

export interface MergeAssistancePromptParams {
  taskId: string;
  applyCheckOutput: string;
  patchPath: string;
  snapshotDir: string;
  testPaths: string[];
  preTestCheckCommand: string;
}

export function buildMergeAssistancePromptText(params: MergeAssistancePromptParams): string {
  const targets = params.testPaths.length > 0 ? params.testPaths.map((p) => `- ${p}`).join('\n') : '- (なし)';
  const applyLog = (params.applyCheckOutput ?? '').trim().length > 0 ? params.applyCheckOutput.trim() : '(なし)';
  const preCheck = params.preTestCheckCommand.trim();
  const step3 =
    preCheck.length > 0
      ? `3. 型チェック/Lint を実行し、エラーがあれば **テストコードのみ** 修正する（最大3回）: ${preCheck}`
      : '3. 型チェック/Lint を実行し、エラーがあれば **テストコードのみ** 修正する（最大3回）';

  return [
    'worktreeで生成されたテスト変更を、現在のワークスペース（ローカル作業ツリー）に手動でマージしてください。',
    '自動適用（git apply --check）が失敗しているため、競合を解決して統合する必要があります。',
    '',
    '## 注意',
    '一時worktreeは既に削除されている可能性があります。worktreeがなくても、以下のパッチ/スナップショットだけでマージできます。',
    '',
    '## 背景',
    `- taskId: ${params.taskId}`,
    '',
    '## 失敗ログ（git apply --check）',
    applyLog,
    '',
    '## 入力（必須）',
    `- パッチファイル: ${params.patchPath}`,
    `- 生成テストのスナップショット（完成形）: ${params.snapshotDir}`,
    '- 変更対象（テストファイルのみ）:',
    targets,
    '',
    '## 制約（必須）',
    '- 変更してよいのは **テストコードのみ**（例: **/*.test.ts, **/tests/**, **/__tests__/**）',
    '- docs/** や *.md の編集/作成は禁止',
    '- プロダクションコード（実装側）の編集は禁止',
    '- 設定ファイル（package.json/tsconfig 等）の編集は禁止',
    '',
    '## 手順の期待値',
    '1. パッチの意図（worktree側の変更）を読み取る',
    '2. ローカルの現状と突き合わせ、競合箇所を解決してテストへ反映する',
    step3,
    '4. 変更点の要約（どのテストをどう追加/更新したか）を短く報告する',
  ].join('\n');
}

export function buildMergeAssistanceInstructionMarkdown(params: MergeAssistancePromptParams): string {
  const prompt = buildMergeAssistancePromptText(params);
  return [
    '# 手動マージ支援（AI向けプロンプト）',
    '',
    '自動適用に失敗したため、以下のプロンプトを AI へ貼り付けて統合を依頼してください。',
    '',
    '```text',
    prompt,
    '```',
    '',
  ].join('\n');
}

