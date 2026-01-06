import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { applyDevinPatchToRepo, extractDevinPatchFromLogs, extractPathsFromUnifiedDiff, normalizeUnifiedDiffHunkCounts } from '../../../../commands/runWithArtifacts/devinPatchApplyStep';
import * as gitExecModule from '../../../../git/gitExec';
import { createMockExtensionContext } from '../../testUtils/vscodeMocks';

suite('commands/runWithArtifacts/devinPatchApplyStep.ts', () => {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  suite('extractDevinPatchFromLogs', () => {
    test('TC-DPA-EXTRACT-N-01: マーカーに挟まれたパッチを抽出できる', () => {
      const raw = [
        'some log',
        '<!-- BEGIN DONTFORGETEST PATCH -->',
        'diff --git a/tests/a.test.ts b/tests/a.test.ts',
        '--- a/tests/a.test.ts',
        '+++ b/tests/a.test.ts',
        '<!-- END DONTFORGETEST PATCH -->',
        'tail',
      ].join('\n');
      const patch = extractDevinPatchFromLogs(raw);
      assert.ok(patch);
      assert.ok(patch?.includes('diff --git'), 'diff ヘッダが含まれる');
    });

    test('TC-DPA-EXTRACT-E-01: マーカーが無い場合は undefined', () => {
      const patch = extractDevinPatchFromLogs('no markers');
      assert.strictEqual(patch, undefined);
    });
  });

  suite('extractPathsFromUnifiedDiff', () => {
    test('TC-DPA-PATH-N-01: diff --git から b 側のパスを抽出する', () => {
      const patch = [
        'diff --git a/tests/a.test.ts b/tests/a.test.ts',
        'index 000..111 100644',
        '--- a/tests/a.test.ts',
        '+++ b/tests/a.test.ts',
        '@@',
      ].join('\n');
      const paths = extractPathsFromUnifiedDiff(patch);
      assert.deepStrictEqual(paths, ['tests/a.test.ts']);
    });

    test('TC-DPA-PATH-N-02: +++ からもパスを抽出できる（diff --git が無い場合の保険）', () => {
      const patch = [
        '--- a/tests/a.test.ts',
        '+++ b/tests/a.test.ts',
      ].join('\n');
      const paths = extractPathsFromUnifiedDiff(patch);
      assert.deepStrictEqual(paths, ['tests/a.test.ts']);
    });
  });

  suite('normalizeUnifiedDiffHunkCounts', () => {
    test('TC-DPA-NORM-N-01: hunk行数が不整合でも、内容から再計算して補正できる', () => {
      const raw = [
        'diff --git a/tests/a.test.ts b/tests/a.test.ts',
        '--- a/tests/a.test.ts',
        '+++ b/tests/a.test.ts',
        '@@ -1,999 +1,999 @@',
        ' line1',
        '+line2',
        '-line3',
      ].join('\n');
      const res = normalizeUnifiedDiffHunkCounts(raw);
      assert.strictEqual(res.changed, true);
      // old: ' ' + '-' = 2, new: ' ' + '+' = 2
      assert.ok(res.normalized.includes('@@ -1,2 +1,2 @@'), 'hunkヘッダが補正される');
    });

    test('TC-DPA-NORM-N-02: 新規ファイル追加hunk（old=0）を壊さない', () => {
      // Given: 新規ファイル追加パッチ（old 側行数は 0 が正しい）
      const raw = [
        'diff --git a/tests/new.test.ts b/tests/new.test.ts',
        'new file mode 100644',
        'index 0000000..1111111',
        '--- /dev/null',
        '+++ b/tests/new.test.ts',
        '@@ -0,0 +1,3 @@',
        '+line1',
        '+line2',
        '+line3',
      ].join('\n');
      // When: 補正を適用
      const res = normalizeUnifiedDiffHunkCounts(raw);
      // Then: old=0 はそのまま、new=3 も正しく維持される（壊れない）
      assert.strictEqual(res.changed, false, 'hunkヘッダが元々正しいので changed=false');
      assert.ok(res.normalized.includes('@@ -0,0 +1,3 @@'), 'hunkヘッダが壊れていない');
    });

    test('TC-DPA-NORM-N-03: 新規ファイル追加でhunk行数が不正な場合でも正しく補正される', () => {
      // Given: Devinが生成した新規ファイル追加パッチで行数がずれている
      const raw = [
        'diff --git a/tests/new.test.ts b/tests/new.test.ts',
        'new file mode 100644',
        'index 0000000..1111111',
        '--- /dev/null',
        '+++ b/tests/new.test.ts',
        '@@ -0,0 +1,999 @@',  // 999 は誤り、実際は 3 行
        '+line1',
        '+line2',
        '+line3',
      ].join('\n');
      // When: 補正を適用
      const res = normalizeUnifiedDiffHunkCounts(raw);
      // Then: old=0 は維持、new=3 に補正される
      assert.strictEqual(res.changed, true, '行数が補正されたので changed=true');
      assert.ok(res.normalized.includes('@@ -0,0 +1,3 @@'), 'hunkヘッダが正しく補正される');
    });
  });

  suite('applyDevinPatchToRepo deterministic coverage', () => {
    let originalExecGitResult: typeof gitExecModule.execGitResult;
    let originalShowWarningMessage: typeof vscode.window.showWarningMessage;

    let execResults: Record<string, gitExecModule.ExecGitResult> = {};
    let warningMessages: string[] = [];

    setup(() => {
      warningMessages = [];
      execResults = {};
      originalExecGitResult = gitExecModule.execGitResult;
      originalShowWarningMessage = vscode.window.showWarningMessage;

      (gitExecModule as unknown as { execGitResult: typeof gitExecModule.execGitResult }).execGitResult = async (_cwd, args) => {
        const key = args.join(' ');
        return execResults[key] ?? { ok: true, stdout: '', stderr: '' };
      };
      (vscode.window as unknown as { showWarningMessage: typeof vscode.window.showWarningMessage }).showWarningMessage =
        ((message: string, ..._rest: unknown[]) => {
          warningMessages.push(message);
          return Promise.resolve(undefined);
        }) as unknown as typeof vscode.window.showWarningMessage;
    });

    teardown(() => {
      (gitExecModule as unknown as { execGitResult: typeof originalExecGitResult }).execGitResult = originalExecGitResult;
      (vscode.window as unknown as { showWarningMessage: typeof originalShowWarningMessage }).showWarningMessage = originalShowWarningMessage;
    });

    test('TC-DPA-E-01: 空パッチは empty-patch', async () => {
      const ctx = createMockExtensionContext({ workspaceRoot });
      const res = await applyDevinPatchToRepo({
        generationTaskId: `devin-empty-${Date.now()}`,
        patchText: '   ',
        runWorkspaceRoot: workspaceRoot,
        extensionContext: ctx,
      });
      assert.strictEqual(res.applied, false);
      assert.strictEqual(res.reason, 'empty-patch');
    });

    test('TC-DPA-E-02: パス抽出できないパッチは no-diff-paths でパッチが保存される', async () => {
      const ctx = createMockExtensionContext({ workspaceRoot });
      const taskId = `devin-nopath-${Date.now()}`;
      const res = await applyDevinPatchToRepo({
        generationTaskId: taskId,
        patchText: 'not a diff',
        runWorkspaceRoot: workspaceRoot,
        extensionContext: ctx,
      });
      assert.strictEqual(res.applied, false);
      assert.strictEqual(res.reason, 'no-diff-paths');
      assert.ok(res.persistedPatchPath && fs.existsSync(res.persistedPatchPath), 'パッチが保存される');
      // 後片付け
      if (res.persistedPatchPath) {
        try {
          await fs.promises.rm(path.dirname(res.persistedPatchPath), { recursive: true, force: true });
        } catch {
          // noop
        }
      }
    });

    test('TC-DPA-E-03: テストパスが無いパッチは no-test-paths', async () => {
      const ctx = createMockExtensionContext({ workspaceRoot });
      const taskId = `devin-nontest-${Date.now()}`;
      const patch = [
        'diff --git a/src/app.ts b/src/app.ts',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@',
      ].join('\n');
      const res = await applyDevinPatchToRepo({
        generationTaskId: taskId,
        patchText: patch,
        runWorkspaceRoot: workspaceRoot,
        extensionContext: ctx,
      });
      assert.strictEqual(res.applied, false);
      assert.strictEqual(res.reason, 'no-test-paths');
      assert.ok(res.persistedPatchPath && fs.existsSync(res.persistedPatchPath), 'パッチが保存される');
      if (res.persistedPatchPath) {
        try {
          await fs.promises.rm(path.dirname(res.persistedPatchPath), { recursive: true, force: true });
        } catch {
          // noop
        }
      }
    });

    test('TC-DPA-N-01: テストパスのみのパッチは apply 成功で applied', async () => {
      const ctx = createMockExtensionContext({ workspaceRoot });
      const taskId = `devin-apply-ok-${Date.now()}`;
      const patch = [
        'diff --git a/tests/a.test.ts b/tests/a.test.ts',
        '--- a/tests/a.test.ts',
        '+++ b/tests/a.test.ts',
        '@@',
      ].join('\n');
      // default ok で apply が通ることを確認する
      const res = await applyDevinPatchToRepo({
        generationTaskId: taskId,
        patchText: patch,
        runWorkspaceRoot: workspaceRoot,
        extensionContext: ctx,
      });
      assert.strictEqual(res.applied, true);
      assert.strictEqual(res.reason, 'applied');
      assert.deepStrictEqual(res.testPaths, ['tests/a.test.ts']);
    });

    test('TC-DPA-E-04: apply --check 失敗は apply-failed でパッチが永続化される', async () => {
      const ctx = createMockExtensionContext({ workspaceRoot });
      const taskId = `devin-apply-fail-${Date.now()}`;
      const patch = [
        'diff --git a/tests/a.test.ts b/tests/a.test.ts',
        '--- a/tests/a.test.ts',
        '+++ b/tests/a.test.ts',
        '@@',
      ].join('\n');
      const tmpPatchPath = path.join(ctx.globalStorageUri.fsPath, 'tmp', `${taskId}.patch`);
      // 全フォールバックを含めて失敗させる
      execResults[`apply --check --whitespace=nowarn ${tmpPatchPath}`] = { ok: false, output: 'check failed' };
      execResults[`apply --whitespace=nowarn ${tmpPatchPath}`] = { ok: false, output: 'apply failed' };
      execResults[`apply --check --ignore-whitespace --whitespace=nowarn ${tmpPatchPath}`] = { ok: false, output: 'check(ignore) failed' };
      execResults[`apply --ignore-whitespace --whitespace=nowarn ${tmpPatchPath}`] = { ok: false, output: 'apply(ignore) failed' };
      // reverse check が既定okだと成功扱いになってしまうため、明示的に失敗させる
      execResults[`apply --reverse --check --ignore-whitespace --whitespace=nowarn ${tmpPatchPath}`] = { ok: false, output: 'reverse check failed' };
      const res = await applyDevinPatchToRepo({
        generationTaskId: taskId,
        patchText: patch,
        runWorkspaceRoot: workspaceRoot,
        extensionContext: ctx,
      });
      assert.strictEqual(res.applied, false);
      assert.strictEqual(res.reason, 'apply-failed');
      assert.ok(res.persistedPatchPath && fs.existsSync(res.persistedPatchPath), 'パッチが永続化される');
      assert.ok(res.persistedInstructionPath, '手動マージ手順（persistedInstructionPath）が生成される');
      assert.ok(
        res.persistedInstructionPath && fs.existsSync(res.persistedInstructionPath),
        '手動マージ手順ファイルが保存される',
      );
      assert.strictEqual(warningMessages.length, 1, '警告メッセージが表示される');
      // 後片付け
      try {
        await fs.promises.rm(ctx.globalStorageUri.fsPath, { recursive: true, force: true });
      } catch {
        // noop
      }
    });

    test('TC-DPA-N-04: apply が失敗しても reverse check が通れば成功扱いになる', async () => {
      // Given: パッチは適用済み（git apply は失敗するが、git apply --reverse --check は成功）
      const ctx = createMockExtensionContext({ workspaceRoot });
      const taskId = `devin-reverse-applied-${Date.now()}`;
      const patch = [
        'diff --git a/tests/a.test.ts b/tests/a.test.ts',
        '--- a/tests/a.test.ts',
        '+++ b/tests/a.test.ts',
        '@@',
      ].join('\n');
      const tmpPatchPath = path.join(ctx.globalStorageUri.fsPath, 'tmp', `${taskId}.patch`);
      execResults[`apply --check --whitespace=nowarn ${tmpPatchPath}`] = { ok: false, output: 'patch does not apply' };
      execResults[`apply --whitespace=nowarn ${tmpPatchPath}`] = { ok: false, output: 'patch does not apply' };
      execResults[`apply --check --ignore-whitespace --whitespace=nowarn ${tmpPatchPath}`] = { ok: false, output: 'patch does not apply' };
      execResults[`apply --ignore-whitespace --whitespace=nowarn ${tmpPatchPath}`] = { ok: false, output: 'patch does not apply' };
      execResults[`apply --reverse --check --ignore-whitespace --whitespace=nowarn ${tmpPatchPath}`] = { ok: true, stdout: '', stderr: '' };

      // When
      const res = await applyDevinPatchToRepo({
        generationTaskId: taskId,
        patchText: patch,
        runWorkspaceRoot: workspaceRoot,
        extensionContext: ctx,
      });

      // Then
      assert.strictEqual(res.applied, true);
      assert.strictEqual(res.reason, 'applied');
      assert.strictEqual(warningMessages.length, 0, 'reverse check 成功の場合は手動マージ警告を出さない');
    });

    test('TC-DPA-N-03: applyが失敗しても Case ID が既に含まれていれば成功扱いになる', async () => {
      const ctx = createMockExtensionContext({ workspaceRoot });
      const taskId = `devin-already-${Date.now()}`;
      const tmpPatchPath = path.join(ctx.globalStorageUri.fsPath, 'tmp', `${taskId}.patch`);

      // Given: 既に Case ID を含むテストファイルが存在する
      const testFile = path.join(workspaceRoot, 'tests', `a-${taskId}.test.ts`);
      await fs.promises.mkdir(path.dirname(testFile), { recursive: true });
      await fs.promises.writeFile(testFile, `// TC-FOO-N-01\n`, 'utf8');

      // Given: パッチは同じ Case ID を含むが、git apply は失敗する
      const patch = [
        `diff --git a/tests/a-${taskId}.test.ts b/tests/a-${taskId}.test.ts`,
        `--- a/tests/a-${taskId}.test.ts`,
        `+++ b/tests/a-${taskId}.test.ts`,
        '@@ -1,1 +1,2 @@',
        ' // TC-FOO-N-01',
        '+// TC-FOO-N-01',
      ].join('\n');

      execResults[`apply --check --whitespace=nowarn ${tmpPatchPath}`] = { ok: false, output: 'patch does not apply' };
      execResults[`apply --whitespace=nowarn ${tmpPatchPath}`] = { ok: false, output: 'patch does not apply' };
      execResults[`apply --check --ignore-whitespace --whitespace=nowarn ${tmpPatchPath}`] = { ok: false, output: 'patch does not apply' };
      execResults[`apply --ignore-whitespace --whitespace=nowarn ${tmpPatchPath}`] = { ok: false, output: 'patch does not apply' };
      // reverse check で既適用扱いにすると Case ID 分岐を通らないため、失敗させる
      execResults[`apply --reverse --check --ignore-whitespace --whitespace=nowarn ${tmpPatchPath}`] = { ok: false, output: 'reverse check failed' };

      // When
      const res = await applyDevinPatchToRepo({
        generationTaskId: taskId,
        patchText: patch,
        runWorkspaceRoot: workspaceRoot,
        extensionContext: ctx,
      });

      // Then
      assert.strictEqual(res.applied, true);
      assert.strictEqual(res.reason, 'applied');
      assert.deepStrictEqual(res.testPaths, [`tests/a-${taskId}.test.ts`]);
    });

    test('TC-DPA-N-02: テスト以外の差分が混在しても、テスト差分だけは適用される', async () => {
      const ctx = createMockExtensionContext({ workspaceRoot });
      const taskId = `devin-mixed-${Date.now()}`;
      const patch = [
        'diff --git a/.gitignore b/.gitignore',
        '--- a/.gitignore',
        '+++ b/.gitignore',
        '@@',
        'diff --git a/tests/a.test.ts b/tests/a.test.ts',
        '--- a/tests/a.test.ts',
        '+++ b/tests/a.test.ts',
        '@@',
      ].join('\n');

      // apply は成功扱い（default ok）
      const res = await applyDevinPatchToRepo({
        generationTaskId: taskId,
        patchText: patch,
        runWorkspaceRoot: workspaceRoot,
        extensionContext: ctx,
      });
      assert.strictEqual(res.applied, true);
      assert.strictEqual(res.reason, 'applied');
      assert.deepStrictEqual(res.testPaths, ['tests/a.test.ts']);
      // 非テスト差分がある場合、保存パッチへの案内が警告として出る
      assert.ok(warningMessages.length >= 1);
    });
  });
});

