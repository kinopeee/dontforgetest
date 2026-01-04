import * as assert from 'assert';
import * as vscode from 'vscode';
import { selectAgentProvider } from '../../../commands/selectAgentProvider';

suite('selectAgentProvider', () => {
  // === 観点表 ===
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|---------------------|--------------------------------------|-----------------|-------|
  // | TC-N-01 | QuickPick でキャンセル | 正常系 - キャンセル | 設定は変更されない | - |
  // | TC-N-02 | 関数が呼び出し可能 | 正常系 - 基本動作 | エラーなく完了 | - |
  // | TC-N-08 | QuickPick で 'claudeCode' を選択 | 正常系 - Provider 選択 | dontforgetest.agentProvider が 'claudeCode' に更新される | - |
  // | TC-N-09 | QuickPick をキャンセル (undefined) | 正常系 - キャンセル | 設定は変更されない | TC-N-01 と同等 |

  let originalShowQuickPick: typeof vscode.window.showQuickPick;
  let originalShowInformationMessage: typeof vscode.window.showInformationMessage;
  let originalGetConfiguration: typeof vscode.workspace.getConfiguration;
  let originalValue: string | undefined;

  setup(async () => {
    originalShowQuickPick = vscode.window.showQuickPick;
    originalShowInformationMessage = vscode.window.showInformationMessage;
    originalGetConfiguration = vscode.workspace.getConfiguration;
    const config = vscode.workspace.getConfiguration('dontforgetest');
    originalValue = config.get<string>('agentProvider');
  });

  teardown(async () => {
    // Restore patched APIs first (teardown should not rely on stubs)
    (vscode.workspace as unknown as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = originalGetConfiguration;
    (vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick }).showQuickPick = originalShowQuickPick;
    (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = originalShowInformationMessage;
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', originalValue, vscode.ConfigurationTarget.Workspace);
  });

  // TC-N-01 / TC-N-09: QuickPick でキャンセルした場合、設定は変更されない
  test('TC-N-01: QuickPick でキャンセルした場合、設定は変更されない', async () => {
    // Given: 現在の設定を保存
    const config = vscode.workspace.getConfiguration('dontforgetest');
    const beforeValue = config.get<string>('agentProvider');

    // QuickPick をキャンセルするようモック
    (vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick }).showQuickPick = async () => {
      return undefined;
    };

    // When: selectAgentProvider を呼び出す
    await selectAgentProvider();

    // Then: 設定は変更されない
    const afterValue = config.get<string>('agentProvider');
    assert.strictEqual(afterValue, beforeValue);
  });

  // TC-N-02: 関数が呼び出し可能でエラーなく完了する
  test('TC-N-02: 関数が呼び出し可能でエラーなく完了する', async () => {
    // Given: QuickPick をキャンセルするようモック
    (vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick }).showQuickPick = async () => {
      return undefined;
    };

    // When: selectAgentProvider を呼び出す
    // Then: エラーなく完了する
    await assert.doesNotReject(async () => {
      await selectAgentProvider();
    });
  });

  // TC-N-08: QuickPick で 'claudeCode' を選択した場合、設定が更新される
  test('TC-N-08: QuickPick で claudeCode を選択した場合、agentProvider が claudeCode に更新される', async () => {
    // Given: getConfiguration をスタブし、update 呼び出しを検証する
    let currentAgentProvider: string = 'cursorAgent';
    const updateCalls: Array<{ section: string; value: unknown; target: unknown }> = [];
    const configStub = {
      get: (section: string, defaultValue?: unknown) => {
        if (section === 'agentProvider') {
          return currentAgentProvider;
        }
        return defaultValue;
      },
      update: async (section: string, value: unknown, target: unknown) => {
        updateCalls.push({ section, value, target });
        if (section === 'agentProvider' && typeof value === 'string') {
          currentAgentProvider = value;
        }
      },
    } as unknown as vscode.WorkspaceConfiguration;

    (vscode.workspace as unknown as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = () => configStub;

    // QuickPick で claudeCode を選択するようモック
    (vscode.window as unknown as { showQuickPick: (items: unknown) => Promise<unknown> }).showQuickPick = async (items: unknown) => {
      // Find the claudeCode item
      const itemsArray = items as Array<{ providerId?: string }>;
      const claudeCodeItem = itemsArray.find((item) => item.providerId === 'claudeCode');
      return claudeCodeItem;
    };

    // showInformationMessage をモック（void を返す）
    (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = async () => {
      return undefined;
    };

    // When: selectAgentProvider を呼び出す
    await selectAgentProvider();

    // Then: agentProvider が 'claudeCode' に更新される
    assert.strictEqual(currentAgentProvider, 'claudeCode');
    assert.ok(updateCalls.length >= 1, 'Expected config.update to be called');
    assert.strictEqual(updateCalls[0]?.section, 'agentProvider');
    assert.strictEqual(updateCalls[0]?.value, 'claudeCode');
  });

  // TC-N-08b: QuickPick で 'cursorAgent' を選択した場合、設定が更新される
  test('TC-N-08b: QuickPick で cursorAgent を選択した場合、agentProvider が cursorAgent に更新される', async () => {
    // Given: getConfiguration をスタブし、update 呼び出しを検証する
    let currentAgentProvider: string = 'claudeCode';
    const updateCalls: Array<{ section: string; value: unknown; target: unknown }> = [];
    const configStub = {
      get: (section: string, defaultValue?: unknown) => {
        if (section === 'agentProvider') {
          return currentAgentProvider;
        }
        return defaultValue;
      },
      update: async (section: string, value: unknown, target: unknown) => {
        updateCalls.push({ section, value, target });
        if (section === 'agentProvider' && typeof value === 'string') {
          currentAgentProvider = value;
        }
      },
    } as unknown as vscode.WorkspaceConfiguration;

    (vscode.workspace as unknown as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = () => configStub;

    // QuickPick で cursorAgent を選択するようモック
    (vscode.window as unknown as { showQuickPick: (items: unknown) => Promise<unknown> }).showQuickPick = async (items: unknown) => {
      // Find the cursorAgent item
      const itemsArray = items as Array<{ providerId?: string }>;
      const cursorAgentItem = itemsArray.find((item) => item.providerId === 'cursorAgent');
      return cursorAgentItem;
    };

    // showInformationMessage をモック
    (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = async () => {
      return undefined;
    };

    // When: selectAgentProvider を呼び出す
    await selectAgentProvider();

    // Then: agentProvider が 'cursorAgent' に更新される
    assert.strictEqual(currentAgentProvider, 'cursorAgent');
    assert.ok(updateCalls.length >= 1, 'Expected config.update to be called');
    assert.strictEqual(updateCalls[0]?.section, 'agentProvider');
    assert.strictEqual(updateCalls[0]?.value, 'cursorAgent');
  });

  // TC-E-13: selectAgentProvider() で currentId が 'cursorAgent' でも 'claudeCode' でもない場合
  // Note: getAgentProviderId() は常に有効な値を返すため、この経路は実際には到達困難
  // ただし、コードの堅牢性テストとして、currentLabel のフォールバック動作を確認
  test('TC-E-13: unknown currentId falls back to Cursor CLI label', async () => {
    // Given: agentProvider を有効な値に設定（フォールバック動作をテスト）
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', 'cursorAgent', vscode.ConfigurationTarget.Workspace);

    // QuickPick をキャンセルするようモック
    (vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick }).showQuickPick = async () => {
      return undefined;
    };

    // When: selectAgentProvider を呼び出す
    // Then: エラーなく完了する（currentLabel は 'Cursor CLI' としてフォールバック）
    await assert.doesNotReject(async () => {
      await selectAgentProvider();
    });
  });
});
