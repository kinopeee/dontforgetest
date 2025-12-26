import * as assert from 'assert';
import * as vscode from 'vscode';
import { generateTestFromWorkingTree, type GenerateFromWorkingTreeDeps } from '../../../commands/generateFromWorkingTree';
import { type AgentProvider } from '../../../providers/provider';
import { t } from '../../../core/l10n';

class MockGenerateProvider implements AgentProvider {
  readonly id = 'mock-generate';
  readonly displayName = 'Mock Generate';
  run() {
    return { taskId: 'mock', dispose: () => {} };
  }
}

suite('commands/generateFromWorkingTree.ts', () => {
  type WorkingTreePick = {
    label: string;
    description: string;
    mode: 'staged' | 'unstaged' | 'both';
  };

  function setShowQuickPickMock(mock: () => Promise<unknown>): () => void {
    const original = vscode.window.showQuickPick;
    (vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick }).showQuickPick =
      ((..._args: Parameters<typeof vscode.window.showQuickPick>) =>
        mock() as ReturnType<typeof vscode.window.showQuickPick>) as typeof vscode.window.showQuickPick;
    return () => {
      (vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick }).showQuickPick = original;
    };
  }

  function setShowMessageMocks(params: {
    showErrorMessage?: typeof vscode.window.showErrorMessage;
    showInformationMessage?: typeof vscode.window.showInformationMessage;
  }): () => void {
    const originalError = vscode.window.showErrorMessage;
    const originalInfo = vscode.window.showInformationMessage;
    if (params.showErrorMessage) {
      (vscode.window as unknown as { showErrorMessage: typeof vscode.window.showErrorMessage }).showErrorMessage =
        params.showErrorMessage;
    }
    if (params.showInformationMessage) {
      (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage =
        params.showInformationMessage;
    }
    return () => {
      (vscode.window as unknown as { showErrorMessage: typeof vscode.window.showErrorMessage }).showErrorMessage =
        originalError;
      (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage =
        originalInfo;
    };
  }

  const baseDeps: GenerateFromWorkingTreeDeps = {
    ensurePreflight: async () => ({
      workspaceRoot: '/workspace',
      defaultModel: 'mock-model',
      testStrategyPath: '',
      cursorAgentCommand: 'cursor-agent',
    }),
    buildTestGenPrompt: async () => ({
      prompt: 'Base Prompt',
      languages: {
        answerLanguage: 'en',
        commentLanguage: 'en',
        perspectiveTableLanguage: 'en',
      },
    }),
  };

  // TC-WT-E-01: preflight 失敗時は早期リターン
  test('TC-WT-E-01: preflight が失敗した場合は早期リターンする', async () => {
    // Given: preflight が undefined を返す
    const provider = new MockGenerateProvider();
    let quickPickCalled = false;
    const restoreQuickPick = setShowQuickPickMock(async () => {
      quickPickCalled = true;
      return undefined;
    });
    const deps: GenerateFromWorkingTreeDeps = {
      ...baseDeps,
      ensurePreflight: async () => undefined,
    };

    try {
      // When: generateTestFromWorkingTree を呼び出す
      await generateTestFromWorkingTree(provider, undefined, deps);

      // Then: QuickPick が呼ばれず終了する
      assert.strictEqual(quickPickCalled, false, 'preflight 失敗時は QuickPick を呼ばないこと');
    } finally {
      restoreQuickPick();
    }
  });

  // TC-WT-B-01: QuickPick がキャンセルされた場合は何もしない
  test('TC-WT-B-01: QuickPick がキャンセルされた場合は何もしない', async () => {
    // Given: QuickPick が undefined を返す
    const provider = new MockGenerateProvider();
    let diffCalled = false;
    const restoreQuickPick = setShowQuickPickMock(async () => undefined);
    const deps: GenerateFromWorkingTreeDeps = {
      ...baseDeps,
      getWorkingTreeDiff: async () => {
        diffCalled = true;
        return '';
      },
    };

    try {
      // When: generateTestFromWorkingTree を呼び出す
      await generateTestFromWorkingTree(provider, undefined, deps);

      // Then: diff 取得が呼ばれない
      assert.strictEqual(diffCalled, false, 'キャンセル時は diff 取得が呼ばれないこと');
    } finally {
      restoreQuickPick();
    }
  });

  // TC-WT-E-02: diff 取得で例外が発生した場合はエラー通知して終了する
  test('TC-WT-E-02: diff 取得で例外が発生した場合はエラー通知して終了する', async () => {
    // Given: QuickPick は選択され、diff 取得が例外を投げる
    const provider = new MockGenerateProvider();
    const restoreQuickPick = setShowQuickPickMock(async () => ({
      label: 'staged',
      description: 'git diff --cached',
      mode: 'staged',
    } satisfies WorkingTreePick));
    let errorMessage: string | undefined;
    const restoreMessages = setShowMessageMocks({
      showErrorMessage: async (message: string) => {
        errorMessage = message;
        return undefined;
      },
    });
    const deps: GenerateFromWorkingTreeDeps = {
      ...baseDeps,
      getWorkingTreeDiff: async () => {
        throw new Error('boom');
      },
    };

    try {
      // When: generateTestFromWorkingTree を呼び出す
      await generateTestFromWorkingTree(provider, undefined, deps);

      // Then: エラーメッセージが通知される
      assert.ok(
        errorMessage?.includes(t('git.diff.fetchFailed', 'boom')),
        'diff 取得失敗メッセージが表示されること',
      );
    } finally {
      restoreQuickPick();
      restoreMessages();
    }
  });

  // TC-WT-B-02: diff が空のときは情報通知して終了する
  test('TC-WT-B-02: diff が空のときは情報通知して終了する', async () => {
    // Given: QuickPick は選択され、diff が空文字
    const provider = new MockGenerateProvider();
    const restoreQuickPick = setShowQuickPickMock(async () => ({
      label: 'staged',
      description: 'git diff --cached',
      mode: 'staged',
    } satisfies WorkingTreePick));
    let infoMessage: string | undefined;
    const restoreMessages = setShowMessageMocks({
      showInformationMessage: async (message: string) => {
        infoMessage = message;
        return undefined;
      },
    });
    const deps: GenerateFromWorkingTreeDeps = {
      ...baseDeps,
      getWorkingTreeDiff: async () => '',
    };

    try {
      // When: generateTestFromWorkingTree を呼び出す
      await generateTestFromWorkingTree(provider, undefined, deps);

      // Then: 変更なしの情報メッセージが表示される
      assert.ok(
        infoMessage?.includes(t('git.workingTree.noChanges', 'staged')),
        '変更なしメッセージが表示されること',
      );
    } finally {
      restoreQuickPick();
      restoreMessages();
    }
  });

  // TC-WT-N-01: diff がある場合は runWithArtifacts が呼ばれる
  test('TC-WT-N-01: diff がある場合は runWithArtifacts が呼ばれる', async () => {
    // Given: QuickPick は選択され、diff が存在する
    const provider = new MockGenerateProvider();
    const restoreQuickPick = setShowQuickPickMock(async () => ({
      label: 'staged',
      description: 'git diff --cached',
      mode: 'staged',
    } satisfies WorkingTreePick));
    const diffText = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      'index 0000000..1111111 100644',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -0,0 +1 @@',
      '+console.log(\"hi\");',
    ].join('\n');
    let runCalled = false;
    let receivedPrompt = '';
    let receivedTargets: string[] = [];
    const deps: GenerateFromWorkingTreeDeps = {
      ...baseDeps,
      getWorkingTreeDiff: async () => diffText,
      runWithArtifacts: async (options) => {
        runCalled = true;
        receivedPrompt = options.generationPrompt;
        receivedTargets = options.targetPaths;
      },
      now: () => 12345,
    };

    try {
      // When: generateTestFromWorkingTree を呼び出す
      await generateTestFromWorkingTree(provider, undefined, deps);

      // Then: runWithArtifacts が呼ばれ、プロンプトに diff が含まれる
      assert.strictEqual(runCalled, true, 'runWithArtifacts が呼ばれること');
      assert.ok(receivedPrompt.includes('Base Prompt'), 'ベースプロンプトが含まれること');
      assert.ok(receivedPrompt.includes(diffText), 'diff がプロンプトに含まれること');
      assert.deepStrictEqual(receivedTargets, ['src/foo.ts'], '変更ファイルが抽出されること');
    } finally {
      restoreQuickPick();
    }
  });
});
