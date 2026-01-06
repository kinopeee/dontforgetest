/**
 * コンフリクト等で自動適用できなかった場合に、「ユーザーがAIへ依頼して手動統合する」ための指示文を生成する。
 *
 * 方針:
 * - ローカル作業ツリーは壊さない（自動マージしない）
 * - 必要な入力（patch / snapshot / 失敗ログ）を揃えて提示する
 */

import { t } from './l10n';

export interface MergeAssistancePromptParams {
  taskId: string;
  applyCheckOutput: string;
  patchPath: string;
  /**
   * 生成結果のスナップショット保存先。
   * - Worktree経路では必ず作成される
   * - Devinパッチ経路など、スナップショットが無い場合は undefined を許容する
   */
  snapshotDir?: string;
  testPaths: string[];
  preTestCheckCommand: string;
}

export function buildMergeAssistancePromptText(params: MergeAssistancePromptParams): string {
  const targets = params.testPaths.length > 0 ? params.testPaths.map((p) => `- ${p}`).join('\n') : `- ${t('artifact.none')}`;
  const applyLog = (params.applyCheckOutput ?? '').trim().length > 0 ? params.applyCheckOutput.trim() : t('artifact.none');
  const preCheck = params.preTestCheckCommand.trim();
  const step3 =
    preCheck.length > 0
      ? t('mergeAssistance.steps.step3.withCommand', preCheck)
      : t('mergeAssistance.steps.step3.withoutCommand');
  const snapshotDirLabel = params.snapshotDir && params.snapshotDir.trim().length > 0 ? params.snapshotDir.trim() : t('artifact.none');

  return [
    t('mergeAssistance.prompt.intro1'),
    t('mergeAssistance.prompt.intro2'),
    '',
    t('mergeAssistance.prompt.notesTitle'),
    t('mergeAssistance.prompt.notesBody'),
    '',
    t('mergeAssistance.prompt.backgroundTitle'),
    `- taskId: ${params.taskId}`,
    '',
    t('mergeAssistance.prompt.failureLogTitle'),
    applyLog,
    '',
    t('mergeAssistance.prompt.inputsTitle'),
    t('mergeAssistance.prompt.inputs.patchFile', params.patchPath),
    t('mergeAssistance.prompt.inputs.snapshotDir', snapshotDirLabel),
    t('mergeAssistance.prompt.inputs.targetsTitle'),
    targets,
    '',
    t('mergeAssistance.prompt.constraintsTitle'),
    t('mergeAssistance.prompt.constraints.testsOnly'),
    t('mergeAssistance.prompt.constraints.noDocs'),
    t('mergeAssistance.prompt.constraints.noProduction'),
    t('mergeAssistance.prompt.constraints.noConfig'),
    '',
    t('mergeAssistance.prompt.stepsTitle'),
    t('mergeAssistance.steps.step1'),
    t('mergeAssistance.steps.step2'),
    step3,
    t('mergeAssistance.steps.step4'),
  ].join('\n');
}

export function buildMergeAssistanceInstructionMarkdown(params: MergeAssistancePromptParams): string {
  const prompt = buildMergeAssistancePromptText(params);
  return [
    `# ${t('mergeAssistance.instruction.title')}`,
    '',
    t('mergeAssistance.instruction.body'),
    '',
    '```text',
    prompt,
    '```',
    '',
  ].join('\n');
}

