import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { emitLogEvent } from '../../core/artifacts';
import { t } from '../../core/l10n';
import { buildMergeAssistanceInstructionMarkdown, buildMergeAssistancePromptText } from '../../core/mergeAssistancePrompt';
import { filterTestLikePaths } from '../../core/testPathClassifier';
import { execGitResult } from '../../git/gitExec';
import { appendEventToOutput } from '../../ui/outputChannel';

export type DevinPatchApplyResult = {
  applied: boolean;
  /** パッチに含まれるテストファイル（ワークスペース相対、/ 区切り） */
  testPaths: string[];
  /** パッチが保存されたパス（永続化された場合のみ） */
  persistedPatchPath?: string;
  /** 手動マージ用の指示ファイル（生成された場合のみ） */
  persistedInstructionPath?: string;
  reason:
    | 'applied'
    | 'empty-patch'
    | 'no-diff-paths'
    | 'no-test-paths'
    | 'apply-failed'
    | 'exception';
};

const PATCH_MARKER_BEGIN = '<!-- BEGIN DONTFORGETEST PATCH -->';
const PATCH_MARKER_END = '<!-- END DONTFORGETEST PATCH -->';

/**
 * Devin のログ出力からパッチ（unified diff）を抽出する。
 */
export function extractDevinPatchFromLogs(rawLogs: string): string | undefined {
  const start = rawLogs.indexOf(PATCH_MARKER_BEGIN);
  if (start === -1) {
    return undefined;
  }
  const afterStart = start + PATCH_MARKER_BEGIN.length;
  const end = rawLogs.indexOf(PATCH_MARKER_END, afterStart);
  if (end === -1) {
    return undefined;
  }
  return rawLogs.slice(afterStart, end).trim();
}

/**
 * unified diff から `diff --git a/... b/...` のパスを抽出する。
 */
export function extractPathsFromUnifiedDiff(patchText: string): string[] {
  const lines = patchText.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (p: string) => {
    const normalized = p.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
    if (normalized.length === 0 || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    out.push(normalized);
  };

  for (const line of lines) {
    // diff --git a/foo b/foo
    if (line.startsWith('diff --git ')) {
      // diff --git a/<path> b/<path>
      const m = /^diff --git a\/(.+?) b\/(.+?)\s*$/.exec(line);
      if (m?.[2]) {
        push(m[2]);
      } else if (m?.[1]) {
        push(m[1]);
      }
      continue;
    }
    // 念のため: diff --git が無い形式でも +++ b/<path> から拾う
    if (line.startsWith('+++ ')) {
      const m = /^\+\+\+\s+(?:b\/)?(.+?)\s*$/.exec(line);
      const p = m?.[1];
      if (p && p !== '/dev/null') {
        push(p);
      }
    }
  }

  return out;
}

/**
 * Devin が返した unified diff パッチを、指定リポジトリへ `git apply` で適用する。
 *
 * 重要:
 * - 事故防止のため「テストファイルっぽいパス」だけが含まれる場合に限り適用する。
 * - それ以外（実装コード/ドキュメント等）が含まれる場合は適用せず、パッチを保存して案内する。
 */
export async function applyDevinPatchToRepo(params: {
  /** Task ID（ログ/保存ファイル名に使用） */
  generationTaskId: string;
  /** パッチ本文（マーカー除去済み） */
  patchText: string;
  /** `git apply` を実行する cwd（repo root を想定） */
  runWorkspaceRoot: string;
  /** パッチ保存先（globalStorage があればそれを優先）。未指定の場合は OS tmp に保存する。 */
  extensionContext?: vscode.ExtensionContext;
}): Promise<DevinPatchApplyResult> {
  try {
    const patchTextTrimmed = params.patchText.trim();
    if (patchTextTrimmed.length === 0) {
      appendEventToOutput(emitLogEvent(params.generationTaskId, 'warn', 'Devin パッチが空のため、適用をスキップしました。'));
      return { applied: false, testPaths: [], reason: 'empty-patch' };
    }
    const patchTextFinal = patchTextTrimmed.endsWith('\n') ? patchTextTrimmed : `${patchTextTrimmed}\n`;

    const allPaths = extractPathsFromUnifiedDiff(patchTextFinal);
    if (allPaths.length === 0) {
      appendEventToOutput(emitLogEvent(params.generationTaskId, 'warn', 'Devin パッチから変更ファイルパスを抽出できませんでした。'));
      const persistedPatchPath = await persistPatch(params.generationTaskId, patchTextFinal, params.extensionContext);
      return { applied: false, testPaths: [], persistedPatchPath, reason: 'no-diff-paths' };
    }

    const testPaths = filterTestLikePaths(allPaths);
    if (testPaths.length === 0) {
      appendEventToOutput(
        emitLogEvent(params.generationTaskId, 'warn', 'Devin パッチにテストファイルが含まれないため、適用をスキップしました。'),
      );
      const persistedPatchPath = await persistPatch(params.generationTaskId, patchTextFinal, params.extensionContext);
      return { applied: false, testPaths: [], persistedPatchPath, reason: 'no-test-paths' };
    }

    // テスト以外の変更が混ざっていても、テスト差分だけは自動適用を試みる。
    // - テスト以外の差分は安全のため自動適用しない（パッチは保存し手動マージへ誘導）
    const split = splitUnifiedDiffByFile(patchTextFinal);
    const testSet = new Set(testPaths);
    const nonTestPaths = allPaths.filter((p) => !testSet.has(p));
    const testPatchTextRaw = buildFilteredPatchText(split, (p) => testSet.has(p));
    const nonTestPatchText = buildFilteredPatchText(split, (p) => !testSet.has(p));
    // NOTE:
    // Devin 由来の unified diff は、hunk ヘッダ（@@ -a,b +c,d @@）の行数が不整合になり
    // `corrupt patch at line ...` で失敗することがある。
    // 安全のため、hunk 行数を実際の内容から再計算して補正する。
    const { normalized: testPatchText } = normalizeUnifiedDiffHunkCounts(testPatchTextRaw);
    if (testPatchText.trim().length === 0) {
      appendEventToOutput(
        emitLogEvent(params.generationTaskId, 'warn', 'Devin パッチからテスト差分を抽出できなかったため、適用をスキップしました。'),
      );
      const persistedPatchPath = await persistPatch(params.generationTaskId, patchTextFinal, params.extensionContext);
      return { applied: false, testPaths: [], persistedPatchPath, reason: 'no-test-paths' };
    }

    const { tmpPatchPath, patchesDir, baseDir } = await preparePatchPaths(params.generationTaskId, params.extensionContext);
    await fs.promises.mkdir(path.dirname(tmpPatchPath), { recursive: true });
    // 適用対象は「テスト差分のみ」
    await fs.promises.writeFile(tmpPatchPath, testPatchText, 'utf8');

    const applyAttempt = await tryApplyPatchWithFallback({
      cwd: params.runWorkspaceRoot,
      patchPath: tmpPatchPath,
    });
    if (!applyAttempt.ok) {
      // まず「既に適用済みか」を git apply --reverse --check で判定する
      const reverseCheck = await execGitResult(
        params.runWorkspaceRoot,
        ['apply', '--reverse', '--check', '--ignore-whitespace', '--whitespace=nowarn', tmpPatchPath],
        20 * 1024 * 1024,
      );
      if (reverseCheck.ok) {
        appendEventToOutput(
          emitLogEvent(
            params.generationTaskId,
            'warn',
            'Devin パッチは既に適用済みと判定されたため、成功扱いにします（git apply --reverse --check が成功）。',
          ),
        );
        return { applied: true, testPaths, reason: 'applied' };
      }
      // `patch does not apply` の場合でも、既にテストファイル側へ変更が反映済みなら成功扱いにする。
      // 例: 同一差分で再実行した結果、LLM が微妙に異なるパッチを返し `git apply` が失敗するケース。
      // テスト生成の目的（観点表の Case ID 実装）が達成されているなら、ここで失敗扱いにしない。
      if (await looksAlreadyAppliedByCaseIds({ runWorkspaceRoot: params.runWorkspaceRoot, testPaths, testPatchText })) {
        appendEventToOutput(
          emitLogEvent(
            params.generationTaskId,
            'warn',
            'Devin パッチの自動適用に失敗しましたが、Case ID が既に反映されているため成功扱いにします。',
          ),
        );
        return { applied: true, testPaths, reason: 'applied' };
      }
      // 失敗: 「フルパッチ」と「テストのみパッチ」を両方保存して、手動マージを案内する
      // NOTE: フルパッチも正規化してから保存する（corrupt patch 対策）
      const { normalized: normalizedFullPatch } = normalizeUnifiedDiffHunkCounts(patchTextFinal);
      const { normalized: normalizedNonTestPatch } = normalizeUnifiedDiffHunkCounts(nonTestPatchText);
      const persistedPatchPath = await persistFullAndTestPatches({
        tmpTestPatchPath: tmpPatchPath,
        patchesDir,
        generationTaskId: params.generationTaskId,
        fullPatchText: normalizedFullPatch,
        nonTestPatchText: normalizedNonTestPatch,
      });
      const persistedInstructionPath = await persistMergeInstruction({
        generationTaskId: params.generationTaskId,
        baseDir,
        patchPath: persistedPatchPath,
        testPaths,
        applyCheckOutput: applyAttempt.output,
      });
      showDevinManualMergeWarning({
        generationTaskId: params.generationTaskId,
        persistedPatchPath,
        persistedInstructionPath,
        testPaths,
        applyCheckOutput: applyAttempt.output,
      });
      appendEventToOutput(emitLogEvent(params.generationTaskId, 'warn', `git apply failed:\n${applyAttempt.output}`));
      return { applied: false, testPaths, persistedPatchPath, persistedInstructionPath, reason: 'apply-failed' };
    }

    // 成功: 一時パッチを削除（失敗しても致命ではない）
    try {
      await fs.promises.rm(tmpPatchPath, { force: true });
    } catch {
      // noop
    }

    appendEventToOutput(emitLogEvent(params.generationTaskId, 'info', `Devin パッチ（テスト差分）を適用しました（${testPaths.length}件）`));
    if (nonTestPaths.length > 0) {
      // NOTE: 保存するパッチも正規化する（corrupt patch 対策）
      const { normalized: normalizedFullForPersist } = normalizeUnifiedDiffHunkCounts(patchTextFinal);
      const persistedPatchPath = await persistPatch(params.generationTaskId, normalizedFullForPersist, params.extensionContext);
      appendEventToOutput(
        emitLogEvent(
          params.generationTaskId,
          'warn',
          `Devin パッチにテスト以外の変更が含まれていたため、自動適用しませんでした: ${nonTestPaths.join(', ')} (patch saved: ${persistedPatchPath})`,
        ),
      );
      void vscode.window.showWarningMessage(
        `Devin パッチにテスト以外の変更が含まれていたため、自動適用しませんでした。保存したパッチ: ${persistedPatchPath}`,
      );
    }
    return { applied: true, testPaths, reason: 'applied' };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    appendEventToOutput(emitLogEvent(params.generationTaskId, 'warn', `Devin パッチ適用で例外が発生しました: ${message}`));
    return { applied: false, testPaths: [], reason: 'exception' };
  }
}

/**
 * unified diff の hunk ヘッダ（@@ -a,b +c,d @@）に含まれる行数を、実際の hunk 内容から再計算して補正する。
 * Devin 等のLLMが生成したパッチで `corrupt patch at line ...` が出るケースを救済する目的。
 */
export function normalizeUnifiedDiffHunkCounts(patchText: string): { normalized: string; changed: boolean } {
  const lines = patchText.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let changed = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const m = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/.exec(line);
    if (!m) {
      out.push(line);
      continue;
    }

    const oldStart = m[1] ?? '0';
    const newStart = m[3] ?? '0';
    const suffix = m[5] ?? '';

    let oldCount = 0;
    let newCount = 0;

    // hunk 本体を数える: 次の @@ / diff --git / --- / +++ まで
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const body = lines[j] ?? '';
      if (body.startsWith('@@ ') || body.startsWith('diff --git ') || body.startsWith('--- ') || body.startsWith('+++ ')) {
        break;
      }
      if (body.startsWith('\\')) {
        // "\ No newline at end of file" は行数に含めない
        continue;
      }
      const ch = body[0];
      if (ch === ' ' || ch === '-') {
        oldCount += 1;
      }
      if (ch === ' ' || ch === '+') {
        newCount += 1;
      }
    }

    // diff 仕様: 行数が省略されている場合（`@@ -a +b @@`）はデフォルト 1。
    // 新規ファイル追加（`@@ -0,0 +1,N @@`）では oldCount=0 が正しいのでそのまま使う。
    // 行数が明示的に 0 と書かれていた場合（`@@ -0,0 +1,N @@` 等）もそのまま使う。
    // 「省略されていたか」を判定するには m[2] / m[4] の有無を見る。
    // ただし、ここでは実測値を信頼し、元のヘッダと差分があれば補正する方針を取る。
    const fixedOld = oldCount;
    const fixedNew = newCount;
    const rewritten = `@@ -${oldStart},${fixedOld} +${newStart},${fixedNew} @@${suffix}`;
    if (rewritten !== line) {
      changed = true;
    }
    out.push(rewritten);
  }

  const normalized = out.join('\n');
  return { normalized: normalized.endsWith('\n') ? normalized : `${normalized}\n`, changed };
}

type UnifiedDiffFileBlock = {
  /** diff --git の b 側パス（推定できない場合は undefined） */
  path?: string;
  /** このファイルブロックの全文（末尾改行含む） */
  text: string;
};

function splitUnifiedDiffByFile(patchText: string): UnifiedDiffFileBlock[] {
  const lines = patchText.replace(/\r\n/g, '\n').split('\n');
  const blocks: UnifiedDiffFileBlock[] = [];
  let cur: string[] = [];
  let curPath: string | undefined;

  const flush = () => {
    if (cur.length === 0) return;
    // join すると末尾改行が落ちるため補完
    const text = cur.join('\n') + '\n';
    blocks.push({ path: curPath, text });
    cur = [];
    curPath = undefined;
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      flush();
      const m = /^diff --git a\/(.+?) b\/(.+?)\s*$/.exec(line);
      const p = m?.[2] ?? m?.[1];
      curPath = p ? p.replace(/\\/g, '/').replace(/^\.\/+/, '').trim() : undefined;
    }
    cur.push(line);
  }
  flush();
  return blocks;
}

function buildFilteredPatchText(blocks: UnifiedDiffFileBlock[], include: (path: string) => boolean): string {
  const out: string[] = [];
  for (const b of blocks) {
    const p = b.path;
    if (!p) {
      // パス不明ブロックは安全側で除外（基本的には発生しない想定）
      continue;
    }
    if (include(p)) {
      out.push(b.text);
    }
  }
  const joined = out.join('');
  return joined.endsWith('\n') ? joined : `${joined}\n`;
}

async function tryApplyPatchWithFallback(params: { cwd: string; patchPath: string }): Promise<{ ok: true } | { ok: false; output: string }> {
  const attempts: { label: string; args: string[] }[] = [
    { label: 'apply --check', args: ['apply', '--check', '--whitespace=nowarn', params.patchPath] },
    { label: 'apply', args: ['apply', '--whitespace=nowarn', params.patchPath] },
    // whitespace 差異に寛容（AI生成でコンテキストの空白が揺れるケース対策）
    { label: 'apply --check --ignore-whitespace', args: ['apply', '--check', '--ignore-whitespace', '--whitespace=nowarn', params.patchPath] },
    { label: 'apply --ignore-whitespace', args: ['apply', '--ignore-whitespace', '--whitespace=nowarn', params.patchPath] },
  ];

  const logs: string[] = [];
  // まずは check -> apply のペアで成功したら終了したいので、2つずつ評価する
  // ただし上の attempts は順序依存なので、シンプルに順に試し、成功したら ok にする
  for (const a of attempts) {
    const res = await execGitResult(params.cwd, a.args, 20 * 1024 * 1024);
    if (res.ok) {
      logs.push(`[OK] ${a.label}`);
      // --check の次に apply が来るよう並べているため、apply の OK をもって成功とみなす
      if (a.label === 'apply' || a.label === 'apply --ignore-whitespace' || a.label === 'apply --3way') {
        return { ok: true };
      }
      continue;
    }
    logs.push(`[NG] ${a.label}\n${res.output}`);
    // 最初の check が NG なら、次の apply（素の apply）は無駄なのでスキップしたいが、
    // 既存の並びは (check -> apply) の直後に別フォールバックが続くため、このまま継続する。
  }
  return { ok: false, output: logs.join('\n\n') };
}

function extractCaseIdsFromPatchText(patchText: string): string[] {
  // 形式例: TC-FOO-N-01, TC-HELLO-B-01 など
  const re = /\bTC-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g;
  const found = new Set<string>();
  for (const m of patchText.matchAll(re)) {
    const id = m[0];
    if (id) found.add(id);
  }
  return Array.from(found.values()).sort();
}

async function looksAlreadyAppliedByCaseIds(params: {
  runWorkspaceRoot: string;
  testPaths: string[];
  testPatchText: string;
}): Promise<boolean> {
  const caseIds = extractCaseIdsFromPatchText(params.testPatchText);
  if (caseIds.length === 0) {
    return false;
  }
  let allText = '';
  for (const rel of params.testPaths) {
    const abs = path.join(params.runWorkspaceRoot, rel);
    try {
      allText += '\n' + (await fs.promises.readFile(abs, 'utf8'));
    } catch {
      // ファイルが読めない場合は判断できない
      return false;
    }
  }
  return caseIds.every((id) => allText.includes(id));
}

async function persistFullAndTestPatches(params: {
  tmpTestPatchPath: string;
  patchesDir: string;
  generationTaskId: string;
  fullPatchText: string;
  nonTestPatchText: string;
}): Promise<string> {
  // tmpTestPatchPath は「テストのみ」なので、.tests.patch として保存する
  await fs.promises.mkdir(params.patchesDir, { recursive: true });
  const persistedTests = path.join(params.patchesDir, `${params.generationTaskId}.tests.patch`);
  try {
    await fs.promises.rename(params.tmpTestPatchPath, persistedTests);
  } catch {
    const raw = await fs.promises.readFile(params.tmpTestPatchPath, 'utf8').catch(() => '');
    await fs.promises.writeFile(persistedTests, raw.length > 0 ? raw : '', 'utf8');
    try {
      await fs.promises.rm(params.tmpTestPatchPath, { force: true });
    } catch {
      // noop
    }
  }

  // フルパッチも保存（非テスト差分の手動統合に使う）
  const persistedFull = path.join(params.patchesDir, `${params.generationTaskId}.patch`);
  await fs.promises.writeFile(persistedFull, params.fullPatchText, 'utf8');

  // 参考: 非テスト差分だけも保存（確認用）
  if (params.nonTestPatchText.trim().length > 0) {
    const persistedNonTest = path.join(params.patchesDir, `${params.generationTaskId}.non-test.patch`);
    await fs.promises.writeFile(persistedNonTest, params.nonTestPatchText, 'utf8');
  }

  return persistedFull;
}

async function persistMergeInstruction(params: {
  generationTaskId: string;
  baseDir: string;
  patchPath: string;
  testPaths: string[];
  applyCheckOutput: string;
}): Promise<string | undefined> {
  const instructionsDir = path.join(params.baseDir, 'merge-instructions');
  await fs.promises.mkdir(instructionsDir, { recursive: true });
  const instructionPath = path.join(instructionsDir, `${params.generationTaskId}.md`);
  const md = buildMergeAssistanceInstructionMarkdown({
    taskId: params.generationTaskId,
    applyCheckOutput: params.applyCheckOutput,
    patchPath: params.patchPath,
    snapshotDir: undefined,
    testPaths: params.testPaths,
    // Devin パッチ適用の失敗から復旧する文脈では、実行環境が Node とは限らない。
    // プロジェクト固有のコマンドは指示しない（ユーザー側で適切なコマンドを選んでもらう）。
    preTestCheckCommand: '',
  });
  await fs.promises.writeFile(instructionPath, md, 'utf8');
  return instructionPath;
}

function showDevinManualMergeWarning(params: {
  generationTaskId: string;
  persistedPatchPath: string;
  persistedInstructionPath?: string;
  testPaths: string[];
  applyCheckOutput: string;
}): void {
  const warnMsg = t('devin.apply.manualMergeRequired');
  const actionOpen = t('devin.apply.actionOpenInstructions');
  const actionCopy = t('devin.apply.actionCopyPrompt');
  const items = params.persistedInstructionPath ? [actionOpen, actionCopy] : [actionCopy];
  void vscode.window.showWarningMessage(`${warnMsg} (patch: ${params.persistedPatchPath})`, ...items).then(async (picked) => {
    try {
      if (picked === actionCopy) {
        const promptText = buildMergeAssistancePromptText({
          taskId: params.generationTaskId,
          applyCheckOutput: params.applyCheckOutput,
          patchPath: params.persistedPatchPath,
          snapshotDir: undefined,
          testPaths: params.testPaths,
          preTestCheckCommand: '',
        });
        await vscode.env.clipboard.writeText(promptText);
        void vscode.window.showInformationMessage(t('worktree.apply.promptCopied'));
        return;
      }
      if (picked === actionOpen && params.persistedInstructionPath) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(params.persistedInstructionPath));
        await vscode.window.showTextDocument(doc, { preview: true });
        return;
      }
    } catch {
      // noop
    }
  });
}

async function preparePatchPaths(
  generationTaskId: string,
  extensionContext: vscode.ExtensionContext | undefined,
): Promise<{ baseDir: string; tmpPatchPath: string; patchesDir: string }> {
  const baseDir = extensionContext?.globalStorageUri.fsPath ?? path.join(os.tmpdir(), 'dontforgetest');
  const tmpDir = path.join(baseDir, 'tmp');
  const patchesDir = path.join(baseDir, 'patches');
  return {
    baseDir,
    tmpPatchPath: path.join(tmpDir, `${generationTaskId}.patch`),
    patchesDir,
  };
}

async function persistPatch(
  generationTaskId: string,
  patchText: string,
  extensionContext: vscode.ExtensionContext | undefined,
): Promise<string> {
  const { patchesDir } = await preparePatchPaths(generationTaskId, extensionContext);
  await fs.promises.mkdir(patchesDir, { recursive: true });
  const persisted = path.join(patchesDir, `${generationTaskId}.patch`);
  await fs.promises.writeFile(persisted, patchText, 'utf8');
  return persisted;
}

