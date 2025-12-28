import * as assert from 'assert';
import * as vscode from 'vscode';
import { generateTestWithQuickPick } from '../../../ui/quickPick';
import * as generateFromCommitModule from '../../../commands/generateFromCommit';
import * as generateFromCommitRangeModule from '../../../commands/generateFromCommitRange';
import * as generateFromWorkingTreeModule from '../../../commands/generateFromWorkingTree';
import * as modelSettingsModule from '../../../core/modelSettings';
import * as preflightModule from '../../../core/preflight';
import { type AgentProvider } from '../../../providers/provider';
import { createMockExtensionContext } from '../testUtils/vscodeMocks';

// QuickPick アイテムの型定義
interface MockQuickPickItem extends vscode.QuickPickItem {
  source?: string;
  mode?: string;
  modelValue?: string;
  runLocation?: string;
}

// QuickPick 呼び出し履歴の型
interface QuickPickCall {
  items: MockQuickPickItem[];
  options: vscode.QuickPickOptions;
}

/**
 * QuickPick UI テスト
 * 
 * 注意: VS Code Extension Host環境でのvscode APIモック化は制限があるため、
 * generateTestWithQuickPick のエンドツーエンドテストは行わず、
 * QuickPick APIの基本動作のみを検証する。
 * 
 * 詳細な統合テストは手動テストまたはE2Eテストフレームワークで実施する。
 */
suite('src/ui/quickPick.ts', () => {
  let originalShowQuickPick: typeof vscode.window.showQuickPick;
  let originalShowInputBox: typeof vscode.window.showInputBox;
  let originalShowErrorMessage: typeof vscode.window.showErrorMessage;
  
  let showQuickPickStub: (items: MockQuickPickItem[], options: vscode.QuickPickOptions) => Promise<MockQuickPickItem | undefined>;
  let showInputBoxStub: (options: vscode.InputBoxOptions) => Promise<string | undefined>;
  let showErrorMessageStub: (message: string, ...items: string[]) => Promise<string | undefined>;
  
  // 呼び出し履歴
  let quickPickCalls: QuickPickCall[] = [];
  let errorMessages: string[] = [];
  let inputBoxCalls: vscode.InputBoxOptions[] = [];
  
  // モック適用可否フラグ
  let mockApplied = false;

  setup(() => {
    // オリジナルを保存
    originalShowQuickPick = vscode.window.showQuickPick;
    originalShowInputBox = vscode.window.showInputBox;
    originalShowErrorMessage = vscode.window.showErrorMessage;

    quickPickCalls = [];
    errorMessages = [];
    inputBoxCalls = [];
    mockApplied = false;

    // モックのデフォルト実装
    showQuickPickStub = async () => undefined;
    showInputBoxStub = async () => undefined;
    showErrorMessageStub = async () => undefined;

    // vscode.window のモック化（window APIのみ、workspace.fsは触らない）
    try {
      // @ts-expect-error テスト用にAPIをモック化
      vscode.window.showQuickPick = async (items: MockQuickPickItem[], options: vscode.QuickPickOptions) => {
        quickPickCalls.push({ items, options });
        return showQuickPickStub(items, options);
      };
      // @ts-expect-error テスト用にAPIをモック化
      vscode.window.showInputBox = async (options: vscode.InputBoxOptions) => {
        inputBoxCalls.push(options);
        return showInputBoxStub(options);
      };
      // @ts-expect-error テスト用にAPIをモック化
      vscode.window.showErrorMessage = async (message: string, ...items: string[]) => {
        errorMessages.push(message);
        return showErrorMessageStub(message, ...items);
      };
      mockApplied = true;
    } catch (e) {
      console.warn('vscode APIのモック化に失敗しました。この環境ではテストをスキップします。', e);
    }
  });

  teardown(() => {
    // 復元（保存したオリジナルを使用）
    if (mockApplied) {
      try {
        vscode.window.showQuickPick = originalShowQuickPick;
        vscode.window.showInputBox = originalShowInputBox;
        vscode.window.showErrorMessage = originalShowErrorMessage;
      } catch {
        // 無視
      }
    }
  });

  // TC-UI-01: Mock Setup: valid items
  test('TC-UI-01: Mock Setup: showQuickPick with valid items executes safely', async () => {
    // Given: モックが適用されていること
    if (!mockApplied) {
      console.log('モック未適用のためスキップ');
      return;
    }
    // Given: Valid MockQuickPickItem[]
    const items: MockQuickPickItem[] = [{ label: 'item1' }, { label: 'item2' }];
    // When: showQuickPick is called
    await vscode.window.showQuickPick(items, {});
    // Then: No error throws, and calls are recorded
    assert.strictEqual(quickPickCalls.length, 1, 'QuickPickが1回呼ばれるべき');
    assert.strictEqual(quickPickCalls[0].items.length, 2, 'アイテムが2つあるべき');
  });

  // TC-UI-02: Mock Setup: showQuickPick returns selected item
  test('TC-UI-02: Mock Setup: showQuickPick returns the selected item', async () => {
    // Given: モックが適用されていること
    if (!mockApplied) {
      console.log('モック未適用のためスキップ');
      return;
    }
    // Given: 特定のアイテムを返すモック
    const items: MockQuickPickItem[] = [
      { label: 'option1', source: 'workingTree' },
      { label: 'option2', source: 'latestCommit' },
    ];
    showQuickPickStub = async (itms: MockQuickPickItem[]) => {
      return itms.find(i => i.source === 'latestCommit');
    };
    
    // When: showQuickPick is called
    const result = await vscode.window.showQuickPick(items, { title: 'Test' });
    
    // Then: 正しいアイテムが返される
    assert.strictEqual(result?.label, 'option2');
    assert.strictEqual(result?.source, 'latestCommit');
  });

  // TC-UI-03: Mock Setup: showQuickPick returns undefined on cancel
  test('TC-UI-03: Mock Setup: showQuickPick returns undefined on cancel', async () => {
    // Given: モックが適用されていること
    if (!mockApplied) {
      console.log('モック未適用のためスキップ');
      return;
    }
    // Given: undefinedを返すモック（キャンセル模倣）
    showQuickPickStub = async () => undefined;
    
    // When: showQuickPick is called
    const items: MockQuickPickItem[] = [{ label: 'item1' }];
    const result = await vscode.window.showQuickPick(items, {});
    
    // Then: undefinedが返される
    assert.strictEqual(result, undefined, 'キャンセル時はundefinedが返るべき');
  });

  // TC-UI-04: Mock Setup: showInputBox records input
  test('TC-UI-04: Mock Setup: showInputBox returns user input', async () => {
    // Given: モックが適用されていること
    if (!mockApplied) {
      console.log('モック未適用のためスキップ');
      return;
    }
    // Given: 入力値を返すモック
    showInputBoxStub = async () => 'user-input-value';
    
    // When: showInputBox is called
    const result = await vscode.window.showInputBox({ prompt: 'Enter value' });
    
    // Then: 入力値が返される
    assert.strictEqual(result, 'user-input-value');
  });

  // TC-UI-05: Mock Setup: showErrorMessage records errors
  test('TC-UI-05: Mock Setup: showErrorMessage records error messages', async () => {
    // Given: モックが適用されていること
    if (!mockApplied) {
      console.log('モック未適用のためスキップ');
      return;
    }
    // When: showErrorMessage is called
    await vscode.window.showErrorMessage('Test error message');
    
    // Then: エラーメッセージが記録される
    assert.strictEqual(errorMessages.length, 1);
    assert.strictEqual(errorMessages[0], 'Test error message');
  });

  // TC-UI-06: Mock Setup: multiple QuickPick calls are tracked
  test('TC-UI-06: Mock Setup: multiple QuickPick calls are tracked', async () => {
    // Given: モックが適用されていること
    if (!mockApplied) {
      console.log('モック未適用のためスキップ');
      return;
    }
    // When: showQuickPick is called multiple times
    await vscode.window.showQuickPick([{ label: 'first' }], { title: 'First Pick' });
    await vscode.window.showQuickPick([{ label: 'second' }], { title: 'Second Pick' });
    
    // Then: 両方の呼び出しが記録される
    assert.strictEqual(quickPickCalls.length, 2, '2回の呼び出しが記録されるべき');
    assert.strictEqual(quickPickCalls[0].options.title, 'First Pick');
    assert.strictEqual(quickPickCalls[1].options.title, 'Second Pick');
  });

  // Test Perspectives Table for generateTestWithQuickPick
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-QP-E-01 | ensurePreflight returns undefined | Error – preflight failure | No QuickPick calls; no command invoked | Boundaries (0/min/max) not applicable |
  // | TC-QP-E-02 | Source pick canceled | Boundary – null | Source QuickPick called once; no command invoked | runLocation/model picks not called |
  // | TC-QP-E-03 | Source=latestCommit, runLocation canceled | Boundary – null | Source + runLocation QuickPick called; no command invoked | - |
  // | TC-QP-E-04 | Source=commitRange, model pick canceled | Boundary – null | QuickPick called 3 times; no command invoked | - |
  // | TC-QP-E-05 | Model pick returns separator item | Equivalence – unexpected item | No command invoked; model override treated as null | Covers fallback branch |
  // | TC-QP-N-01 | Source=workingTree, model candidate selected | Equivalence – normal | generateTestFromWorkingTree called with model override | - |
  // | TC-QP-N-02 | Source=latestCommit, useConfig selected | Equivalence – normal | generateTestFromLatestCommit called with undefined model override | - |
  // | TC-QP-N-03 | Source=commitRange, input model provided | Equivalence – normal | generateTestFromCommitRange called with trimmed input model | Empty/whitespace validated by input box |
  suite('generateTestWithQuickPick', () => {
    class MockQuickPickProvider implements AgentProvider {
      readonly id = 'mock-quickpick';
      readonly displayName = 'Mock QuickPick';
      run() {
        return { taskId: 'mock-quickpick', dispose: () => {} };
      }
    }

    type QuickPickSelector = (items: MockQuickPickItem[]) => MockQuickPickItem | undefined;

    let originalEnsurePreflight: typeof preflightModule.ensurePreflight;
    let originalGenerateWorkingTree: typeof generateFromWorkingTreeModule.generateTestFromWorkingTree;
    let originalGenerateLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
    let originalGenerateCommitRange: typeof generateFromCommitRangeModule.generateTestFromCommitRange;
    let originalGetModelSettings: typeof modelSettingsModule.getModelSettings;

    let preflightResult: preflightModule.PreflightOk | undefined;
    let modelSettingsValue: modelSettingsModule.ModelSettings;
    let quickPickSelectors: QuickPickSelector[] = [];

    let workingTreeCalls: Array<{ provider: AgentProvider; modelOverride: string | undefined }> = [];
    let latestCommitCalls: Array<{
      provider: AgentProvider;
      modelOverride: string | undefined;
      options: generateFromCommitModule.GenerateTestCommandOptions | undefined;
    }> = [];
    let commitRangeCalls: Array<{
      provider: AgentProvider;
      modelOverride: string | undefined;
      options: generateFromCommitRangeModule.GenerateTestCommandOptions | undefined;
    }> = [];

    const provider = new MockQuickPickProvider();
    const extensionContext = createMockExtensionContext();

    setup(() => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
      preflightResult = {
        workspaceRoot,
        testStrategyPath: '',
        cursorAgentCommand: 'cursor-agent',
        defaultModel: undefined,
      };
      modelSettingsValue = { defaultModel: undefined, customModels: [] };
      workingTreeCalls = [];
      latestCommitCalls = [];
      commitRangeCalls = [];
      quickPickSelectors = [];

      originalEnsurePreflight = preflightModule.ensurePreflight;
      originalGenerateWorkingTree = generateFromWorkingTreeModule.generateTestFromWorkingTree;
      originalGenerateLatestCommit = generateFromCommitModule.generateTestFromLatestCommit;
      originalGenerateCommitRange = generateFromCommitRangeModule.generateTestFromCommitRange;
      originalGetModelSettings = modelSettingsModule.getModelSettings;

      (preflightModule as unknown as { ensurePreflight: typeof preflightModule.ensurePreflight }).ensurePreflight = async () => preflightResult;
      (generateFromWorkingTreeModule as unknown as { generateTestFromWorkingTree: typeof generateFromWorkingTreeModule.generateTestFromWorkingTree })
        .generateTestFromWorkingTree = async (callProvider, modelOverride) => {
          workingTreeCalls.push({ provider: callProvider, modelOverride });
        };
      (generateFromCommitModule as unknown as { generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit })
        .generateTestFromLatestCommit = async (callProvider, modelOverride, options) => {
          latestCommitCalls.push({ provider: callProvider, modelOverride, options });
        };
      (generateFromCommitRangeModule as unknown as { generateTestFromCommitRange: typeof generateFromCommitRangeModule.generateTestFromCommitRange })
        .generateTestFromCommitRange = async (callProvider, modelOverride, options) => {
          commitRangeCalls.push({ provider: callProvider, modelOverride, options });
        };
      (modelSettingsModule as unknown as { getModelSettings: typeof modelSettingsModule.getModelSettings }).getModelSettings =
        () => modelSettingsValue;
    });

    teardown(() => {
      (preflightModule as unknown as { ensurePreflight: typeof originalEnsurePreflight }).ensurePreflight = originalEnsurePreflight;
      (generateFromWorkingTreeModule as unknown as { generateTestFromWorkingTree: typeof originalGenerateWorkingTree })
        .generateTestFromWorkingTree = originalGenerateWorkingTree;
      (generateFromCommitModule as unknown as { generateTestFromLatestCommit: typeof originalGenerateLatestCommit })
        .generateTestFromLatestCommit = originalGenerateLatestCommit;
      (generateFromCommitRangeModule as unknown as { generateTestFromCommitRange: typeof originalGenerateCommitRange })
        .generateTestFromCommitRange = originalGenerateCommitRange;
      (modelSettingsModule as unknown as { getModelSettings: typeof originalGetModelSettings }).getModelSettings = originalGetModelSettings;
    });

    const setQuickPickQueue = (selectors: QuickPickSelector[]): void => {
      quickPickSelectors = selectors;
      showQuickPickStub = async (items: MockQuickPickItem[]) => {
        const selector = quickPickSelectors.shift();
        if (!selector) {
          return undefined;
        }
        return selector(items);
      };
    };

    test('TC-QP-E-01: preflight failure stops without showing QuickPick', async () => {
      // Given: プリフライトが失敗する
      if (!mockApplied) {
        console.log('モック未適用のためスキップ');
        return;
      }
      preflightResult = undefined;

      // When: generateTestWithQuickPick を呼び出す
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: QuickPick は呼ばれず、コマンドも実行されない
      assert.strictEqual(quickPickCalls.length, 0);
      assert.strictEqual(workingTreeCalls.length, 0);
      assert.strictEqual(latestCommitCalls.length, 0);
      assert.strictEqual(commitRangeCalls.length, 0);
    });

    test('TC-QP-E-02: source pick canceled returns early', async () => {
      // Given: ソース選択の QuickPick がキャンセルされる
      if (!mockApplied) {
        console.log('モック未適用のためスキップ');
        return;
      }
      setQuickPickQueue([() => undefined]);

      // When: generateTestWithQuickPick を呼び出す
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: ソース QuickPick が1回だけ呼ばれ、コマンドは実行されない
      assert.strictEqual(quickPickCalls.length, 1);
      assert.strictEqual(workingTreeCalls.length, 0);
      assert.strictEqual(latestCommitCalls.length, 0);
      assert.strictEqual(commitRangeCalls.length, 0);
      assert.strictEqual(inputBoxCalls.length, 0);
    });

    test('TC-QP-E-03: runLocation pick canceled for latestCommit', async () => {
      // Given: latestCommit を選択し、runLocation でキャンセルされる
      if (!mockApplied) {
        console.log('モック未適用のためスキップ');
        return;
      }
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'latestCommit'),
        () => undefined,
      ]);

      // When: generateTestWithQuickPick を呼び出す
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: QuickPick が2回呼ばれ、コマンドは実行されない
      assert.strictEqual(quickPickCalls.length, 2);
      assert.strictEqual(workingTreeCalls.length, 0);
      assert.strictEqual(latestCommitCalls.length, 0);
      assert.strictEqual(commitRangeCalls.length, 0);
    });

    test('TC-QP-E-04: model pick canceled for commitRange', async () => {
      // Given: commitRange と runLocation は選択され、モデル選択でキャンセルされる
      if (!mockApplied) {
        console.log('モック未適用のためスキップ');
        return;
      }
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'commitRange'),
        (items) => items.find((item) => item.runLocation === 'worktree'),
        () => undefined,
      ]);

      // When: generateTestWithQuickPick を呼び出す
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: QuickPick が3回呼ばれ、コマンドは実行されない
      assert.strictEqual(quickPickCalls.length, 3);
      assert.strictEqual(workingTreeCalls.length, 0);
      assert.strictEqual(latestCommitCalls.length, 0);
      assert.strictEqual(commitRangeCalls.length, 0);
    });

    test('TC-QP-E-05: model separator item returns early', async () => {
      // Given: 作業ツリーのソースを選び、モデルの separator を選択する
      if (!mockApplied) {
        console.log('モック未適用のためスキップ');
        return;
      }
      modelSettingsValue = { defaultModel: undefined, customModels: ['model-alpha'] };
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'workingTree'),
        (items) => items.find((item) => item.mode === 'separator'),
      ]);

      // When: generateTestWithQuickPick を呼び出す
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: コマンドは実行されない
      assert.strictEqual(workingTreeCalls.length, 0);
      assert.strictEqual(latestCommitCalls.length, 0);
      assert.strictEqual(commitRangeCalls.length, 0);
    });

    test('TC-QP-N-01: workingTree triggers generateTestFromWorkingTree with model override', async () => {
      // Given: 作業ツリーと候補モデルを選択する
      if (!mockApplied) {
        console.log('モック未適用のためスキップ');
        return;
      }
      modelSettingsValue = { defaultModel: undefined, customModels: ['model-alpha'] };
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'workingTree'),
        (items) => items.find((item) => item.mode === 'useCandidate'),
      ]);

      // When: generateTestWithQuickPick を呼び出す
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: generateTestFromWorkingTree が選択モデルで呼ばれる
      assert.strictEqual(workingTreeCalls.length, 1);
      assert.strictEqual(workingTreeCalls[0]?.modelOverride, 'model-alpha');
      assert.strictEqual(latestCommitCalls.length, 0);
      assert.strictEqual(commitRangeCalls.length, 0);
    });

    test('TC-QP-N-02: latestCommit uses config model and passes runLocation', async () => {
      // Given: latestCommit を選び、設定モデルを使用する
      if (!mockApplied) {
        console.log('モック未適用のためスキップ');
        return;
      }
      modelSettingsValue = { defaultModel: 'model-config', customModels: [] };
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'latestCommit'),
        (items) => items.find((item) => item.runLocation === 'local'),
        (items) => items.find((item) => item.mode === 'useConfig'),
      ]);

      // When: generateTestWithQuickPick を呼び出す
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: generateTestFromLatestCommit が undefined モデルで呼ばれる
      assert.strictEqual(latestCommitCalls.length, 1);
      assert.strictEqual(latestCommitCalls[0]?.modelOverride, undefined);
      assert.ok(latestCommitCalls[0]?.options);
      assert.strictEqual(latestCommitCalls[0]?.options?.runLocation, 'local');
      assert.strictEqual(latestCommitCalls[0]?.options?.extensionContext, extensionContext);
      assert.strictEqual(workingTreeCalls.length, 0);
      assert.strictEqual(commitRangeCalls.length, 0);
    });

    test('TC-QP-N-03: commitRange uses input model and trims value', async () => {
      // Given: commitRange を選び、入力モデルを指定する
      if (!mockApplied) {
        console.log('モック未適用のためスキップ');
        return;
      }
      showInputBoxStub = async () => '  model-input  ';
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'commitRange'),
        (items) => items.find((item) => item.runLocation === 'worktree'),
        (items) => items.find((item) => item.mode === 'input'),
      ]);

      // When: generateTestWithQuickPick を呼び出す
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: generateTestFromCommitRange がトリム済みモデルで呼ばれる
      assert.strictEqual(commitRangeCalls.length, 1);
      assert.strictEqual(commitRangeCalls[0]?.modelOverride, 'model-input');
      assert.ok(commitRangeCalls[0]?.options);
      assert.strictEqual(commitRangeCalls[0]?.options?.runLocation, 'worktree');
      assert.strictEqual(commitRangeCalls[0]?.options?.extensionContext, extensionContext);
      assert.strictEqual(inputBoxCalls.length, 1);
      assert.strictEqual(workingTreeCalls.length, 0);
      assert.strictEqual(latestCommitCalls.length, 0);
    });
  });
});
