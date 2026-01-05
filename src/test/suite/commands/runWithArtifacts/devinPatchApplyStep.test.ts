import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { applyDevinPatchToRepo, extractDevinPatchFromLogs, extractPathsFromUnifiedDiff } from '../../../../commands/runWithArtifacts/devinPatchApplyStep';
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
        // args[0] = apply, args[1] = --check or patch path
        const key = args.slice(0, 2).join(' ');
        return execResults[key] ?? { ok: true, stdout: '', stderr: '' };
      };
      (vscode.window as unknown as { showWarningMessage: typeof vscode.window.showWarningMessage }).showWarningMessage = async (message: string) => {
        warningMessages.push(message);
        return undefined;
      };
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
      execResults['apply --check'] = { ok: true, stdout: '', stderr: '' };
      execResults['apply tmp'] = { ok: true, stdout: '', stderr: '' };

      // key 生成が単純なため、apply 側も default ok を使う
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
      execResults['apply --check'] = { ok: false, output: 'check failed' };
      const res = await applyDevinPatchToRepo({
        generationTaskId: taskId,
        patchText: patch,
        runWorkspaceRoot: workspaceRoot,
        extensionContext: ctx,
      });
      assert.strictEqual(res.applied, false);
      assert.strictEqual(res.reason, 'apply-failed');
      assert.ok(res.persistedPatchPath && fs.existsSync(res.persistedPatchPath), 'パッチが永続化される');
      assert.strictEqual(warningMessages.length, 1, '警告メッセージが表示される');
      // 後片付け
      if (res.persistedPatchPath) {
        try {
          await fs.promises.rm(path.dirname(res.persistedPatchPath), { recursive: true, force: true });
        } catch {
          // noop
        }
      }
    });
  });
});

