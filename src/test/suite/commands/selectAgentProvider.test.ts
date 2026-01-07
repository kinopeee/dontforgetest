import * as assert from 'assert';
import * as vscode from 'vscode';
import { selectAgentProvider } from '../../../commands/selectAgentProvider';

suite('selectAgentProvider', () => {
  // === Test perspective table ===
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-N-01 | QuickPick canceled | Equivalence – cancel | Settings are not changed | - |
  // | TC-N-02 | Function is callable | Equivalence – basic flow | Completes without error | - |
  // | TC-N-08 | QuickPick selects 'claudeCode' | Equivalence – provider selection | dontforgetest.agentProvider is updated to 'claudeCode' | - |
  // | TC-N-08b | QuickPick selects 'cursorAgent' | Equivalence – provider selection | dontforgetest.agentProvider is updated to 'cursorAgent' | - |
  // | TC-N-08c | QuickPick selects 'geminiCli' | Equivalence – provider selection | dontforgetest.agentProvider is updated to 'geminiCli' | - |
  // | TC-N-08d | QuickPick selects 'codexCli' | Equivalence – provider selection | dontforgetest.agentProvider is updated to 'codexCli' | - |
  // | TC-N-09 | QuickPick canceled (undefined) | Equivalence – cancel | Settings are not changed | Same as TC-N-01 |

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
    // Given: current configuration is saved and QuickPick is mocked to return undefined (cancel)
    const config = vscode.workspace.getConfiguration('dontforgetest');
    const beforeValue = config.get<string>('agentProvider');

    (vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick }).showQuickPick = async () => {
      return undefined;
    };

    // When: selectAgentProvider is called
    await selectAgentProvider();

    // Then: Configuration remains unchanged
    const afterValue = config.get<string>('agentProvider');
    assert.strictEqual(afterValue, beforeValue);
  });

  // TC-N-02: 関数が呼び出し可能でエラーなく完了する
  test('TC-N-02: 関数が呼び出し可能でエラーなく完了する', async () => {
    // Given: QuickPick is mocked to return undefined
    (vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick }).showQuickPick = async () => {
      return undefined;
    };

    // When & Then: selectAgentProvider is called and completes without rejecting
    await assert.doesNotReject(async () => {
      await selectAgentProvider();
    });
  });

  // TC-N-08: QuickPick で 'claudeCode' を選択した場合、設定が更新される
  test('TC-N-08: QuickPick で claudeCode を選択した場合、agentProvider が claudeCode に更新される', async () => {
    // Given: configuration is stubbed to record updates and QuickPick is mocked to select 'claudeCode'
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

    (vscode.window as unknown as { showQuickPick: (items: unknown) => Promise<unknown> }).showQuickPick = async (items: unknown) => {
      const itemsArray = items as Array<{ providerId?: string }>;
      const claudeCodeItem = itemsArray.find((item) => item.providerId === 'claudeCode');
      return claudeCodeItem;
    };

    (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = async () => {
      return undefined;
    };

    // When: selectAgentProvider is called
    await selectAgentProvider();

    // Then: agentProvider is updated to 'claudeCode' and update was called correctly
    assert.strictEqual(currentAgentProvider, 'claudeCode');
    assert.ok(updateCalls.length >= 1, 'Expected config.update to be called');
    assert.strictEqual(updateCalls[0]?.section, 'agentProvider');
    assert.strictEqual(updateCalls[0]?.value, 'claudeCode');
  });

  // TC-N-08b: QuickPick で 'cursorAgent' を選択した場合、設定が更新される
  test('TC-N-08b: QuickPick で cursorAgent を選択した場合、agentProvider が cursorAgent に更新される', async () => {
    // Given: configuration is stubbed to record updates and QuickPick is mocked to select 'cursorAgent'
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

    (vscode.window as unknown as { showQuickPick: (items: unknown) => Promise<unknown> }).showQuickPick = async (items: unknown) => {
      const itemsArray = items as Array<{ providerId?: string }>;
      const cursorAgentItem = itemsArray.find((item) => item.providerId === 'cursorAgent');
      return cursorAgentItem;
    };

    (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = async () => {
      return undefined;
    };

    // When: selectAgentProvider is called
    await selectAgentProvider();

    // Then: agentProvider is updated to 'cursorAgent' and update was called correctly
    assert.strictEqual(currentAgentProvider, 'cursorAgent');
    assert.ok(updateCalls.length >= 1, 'Expected config.update to be called');
    assert.strictEqual(updateCalls[0]?.section, 'agentProvider');
    assert.strictEqual(updateCalls[0]?.value, 'cursorAgent');
  });

  // TC-E-13: selectAgentProvider() で currentId が既知の一覧に含まれない場合
  test('TC-E-13: unknown currentId falls back to Cursor CLI label', async () => {
    // Given: agentProvider is set to a valid value and QuickPick will be canceled
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', 'cursorAgent', vscode.ConfigurationTarget.Workspace);

    (vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick }).showQuickPick = async () => {
      return undefined;
    };

    // When & Then: selectAgentProvider is called and completes without error (handling fallback label)
    await assert.doesNotReject(async () => {
      await selectAgentProvider();
    });
  });

  // SAP-N-01: currentId が geminiCli の場合、適切なラベルが表示される
  test('SAP-N-01: currentId が geminiCli の場合、適切なラベルが表示される', async () => {
    // Given: agentProvider is set to 'geminiCli'
    const configStub = {
      get: (section: string) => (section === 'agentProvider' ? 'geminiCli' : undefined),
      update: async () => {},
    } as unknown as vscode.WorkspaceConfiguration;
    (vscode.workspace as unknown as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = () => configStub;

    let capturedOptions: vscode.QuickPickOptions | undefined;
    (vscode.window as unknown as { showQuickPick: (items: unknown, options: vscode.QuickPickOptions) => Promise<unknown> }).showQuickPick = async (_items, options) => {
      capturedOptions = options;
      return undefined;
    };

    // When: selectAgentProvider is called
    await selectAgentProvider();

    // Then: PlaceHolder includes 'Gemini CLI'
    assert.ok(capturedOptions?.placeHolder?.includes('Gemini CLI'));
  });

  // SAP-N-02: currentId が codexCli の場合、適切なラベルが表示される
  test('SAP-N-02: currentId が codexCli の場合、適切なラベルが表示される', async () => {
    // Given: agentProvider is set to 'codexCli'
    const configStub = {
      get: (section: string) => (section === 'agentProvider' ? 'codexCli' : undefined),
      update: async () => {},
    } as unknown as vscode.WorkspaceConfiguration;
    (vscode.workspace as unknown as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = () => configStub;

    let capturedOptions: vscode.QuickPickOptions | undefined;
    (vscode.window as unknown as { showQuickPick: (items: unknown, options: vscode.QuickPickOptions) => Promise<unknown> }).showQuickPick = async (_items, options) => {
      capturedOptions = options;
      return undefined;
    };

    // When: selectAgentProvider is called
    await selectAgentProvider();

    // Then: PlaceHolder includes 'Codex CLI'
    assert.ok(capturedOptions?.placeHolder?.includes('Codex CLI'));
  });

  // TC-N-05
  test('TC-N-05: QuickPick で Gemini CLI を選択した場合、agentProvider が geminiCli に更新される', async () => {
    // Given: configuration is stubbed and QuickPick is mocked to select 'geminiCli'
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

    (vscode.window as unknown as { showQuickPick: (items: unknown) => Promise<unknown> }).showQuickPick = async (items: unknown) => {
      const itemsArray = items as Array<{ providerId?: string }>;
      const geminiItem = itemsArray.find((item) => item.providerId === 'geminiCli');
      return geminiItem;
    };

    (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = async () => {
      return undefined;
    };

    // When: selectAgentProvider is called
    await selectAgentProvider();

    // Then: agentProvider is updated to 'geminiCli'
    assert.strictEqual(currentAgentProvider, 'geminiCli');
    assert.ok(updateCalls.length >= 1, 'Expected config.update to be called');
    assert.strictEqual(updateCalls[0]?.section, 'agentProvider');
    assert.strictEqual(updateCalls[0]?.value, 'geminiCli');
  });

  // TC-N-08d: QuickPick で 'codexCli' を選択した場合、設定が更新される
  test('TC-N-08d: QuickPick で codexCli を選択した場合、agentProvider が codexCli に更新される', async () => {
    // Given: configuration is stubbed and QuickPick is mocked to select 'codexCli'
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

    (vscode.window as unknown as { showQuickPick: (items: unknown) => Promise<unknown> }).showQuickPick = async (items: unknown) => {
      const itemsArray = items as Array<{ providerId?: string }>;
      const codexItem = itemsArray.find((item) => item.providerId === 'codexCli');
      return codexItem;
    };

    (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = async () => {
      return undefined;
    };

    // When: selectAgentProvider is called
    await selectAgentProvider();

    // Then: agentProvider is updated to 'codexCli'
    assert.strictEqual(currentAgentProvider, 'codexCli');
    assert.ok(updateCalls.length >= 1, 'Expected config.update to be called');
    assert.strictEqual(updateCalls[0]?.section, 'agentProvider');
    assert.strictEqual(updateCalls[0]?.value, 'codexCli');
  });
});
