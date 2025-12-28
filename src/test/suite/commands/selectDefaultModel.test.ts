import * as assert from 'assert';
import * as vscode from 'vscode';
import * as selectDefaultModelModule from '../../../commands/selectDefaultModel';
import * as modelSettingsModule from '../../../core/modelSettings';

type DefaultModelPickItem = vscode.QuickPickItem & { mode?: string; modelValue?: string };

suite('commands/selectDefaultModel.ts', () => {
  // TC-N-01: selectDefaultModel 関数がエクスポートされている
  test('TC-N-01: selectDefaultModel function should be exported', () => {
    // Given: selectDefaultModel モジュール
    // When: モジュールをインポート
    // Then: selectDefaultModel 関数が存在する
    assert.ok(
      typeof selectDefaultModelModule.selectDefaultModel === 'function',
      'selectDefaultModel should be a function',
    );
  });

  // TC-N-02: selectDefaultModel 関数は Promise を返す（async関数）
  test('TC-N-02: selectDefaultModel should return a Promise', () => {
    // Given: selectDefaultModel 関数
    const fn = selectDefaultModelModule.selectDefaultModel;

    // When: 関数を呼び出す
    const result = fn();

    // Then: Promise を返す
    assert.ok(result instanceof Promise, 'selectDefaultModel should return a Promise');

    // クリーンアップ: Promise を適切に処理
    result.catch(() => {
      // VS Code API が利用不可のためエラーは無視
    });
  });

  // TC-A-01: selectDefaultModel は null や undefined ではない
  test('TC-A-01: selectDefaultModel should not be null or undefined', () => {
    // Given: selectDefaultModel モジュール
    // When: selectDefaultModel プロパティをチェック
    // Then: null や undefined ではない
    assert.notStrictEqual(
      selectDefaultModelModule.selectDefaultModel,
      null,
      'selectDefaultModel should not be null',
    );
    assert.notStrictEqual(
      selectDefaultModelModule.selectDefaultModel,
      undefined,
      'selectDefaultModel should not be undefined',
    );
  });

  // NOTE: VS Code の window.showQuickPick / showInputBox への依存が強く、
  // sinon 等のモックライブラリなしでは詳細なテストが困難。
  // 統合テストとして実際の UI 操作を伴うテストは手動で行うか、
  // e2e テストフレームワークを使用する必要がある。

  // Test Perspectives Table for selectDefaultModel
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-SDM-E-01 | QuickPick canceled | Boundary – null | setDefaultModel not called; no input box; no info message | min/max/0 not applicable |
  // | TC-SDM-N-01 | Pick unset item | Equivalence – normal | setDefaultModel(undefined) called once; info message shown | - |
  // | TC-SDM-N-02 | Pick custom model candidate with non-empty value | Equivalence – normal | setDefaultModel called with trimmed model; info message shown | - |
  // | TC-SDM-E-02 | Pick custom model candidate with empty/whitespace value | Boundary – empty | setDefaultModel not called | Uses whitespace modelValue |
  // | TC-SDM-N-03 | Pick input and provide value | Equivalence – normal | setDefaultModel called with trimmed input; input box called | - |
  // | TC-SDM-E-03 | Pick input and cancel input box | Boundary – null | setDefaultModel not called; info message not shown | - |
  suite('selectDefaultModel behavior', () => {
    let originalShowQuickPick: typeof vscode.window.showQuickPick;
    let originalShowInputBox: typeof vscode.window.showInputBox;
    let originalShowInformationMessage: typeof vscode.window.showInformationMessage;
    let originalGetModelSettings: typeof modelSettingsModule.getModelSettings;
    let originalSetDefaultModel: typeof modelSettingsModule.setDefaultModel;

    let quickPickCalls: Array<{ items: DefaultModelPickItem[]; options: vscode.QuickPickOptions }> = [];
    let inputBoxCalls: vscode.InputBoxOptions[] = [];
    let infoMessages: string[] = [];
    let setDefaultModelCalls: Array<string | undefined> = [];

    let modelSettingsValue: modelSettingsModule.ModelSettings;
    let quickPickSelector: ((items: DefaultModelPickItem[]) => DefaultModelPickItem | undefined) | undefined;
    let inputBoxResult: string | undefined;

    setup(() => {
      quickPickCalls = [];
      inputBoxCalls = [];
      infoMessages = [];
      setDefaultModelCalls = [];
      quickPickSelector = undefined;
      inputBoxResult = undefined;
      modelSettingsValue = { defaultModel: undefined, customModels: [] };

      originalShowQuickPick = vscode.window.showQuickPick;
      originalShowInputBox = vscode.window.showInputBox;
      originalShowInformationMessage = vscode.window.showInformationMessage;
      originalGetModelSettings = modelSettingsModule.getModelSettings;
      originalSetDefaultModel = modelSettingsModule.setDefaultModel;

      const showQuickPickMock = (async (
        items: readonly DefaultModelPickItem[] | Thenable<readonly DefaultModelPickItem[]>,
        options?: vscode.QuickPickOptions,
      ): Promise<DefaultModelPickItem | undefined> => {
        const resolvedItems = (await Promise.resolve(items)) as readonly DefaultModelPickItem[];
        const itemsArray = [...resolvedItems];
        const normalizedOptions: vscode.QuickPickOptions = options ?? {};
        quickPickCalls.push({ items: itemsArray, options: normalizedOptions });
        return quickPickSelector ? quickPickSelector(itemsArray) : undefined;
      }) as unknown as typeof vscode.window.showQuickPick;
      (vscode.window as unknown as { showQuickPick: typeof vscode.window.showQuickPick }).showQuickPick = showQuickPickMock;

      const showInputBoxMock = (async (options?: vscode.InputBoxOptions): Promise<string | undefined> => {
        const normalizedOptions: vscode.InputBoxOptions = options ?? {};
        inputBoxCalls.push(normalizedOptions);
        return inputBoxResult;
      }) as unknown as typeof vscode.window.showInputBox;
      (vscode.window as unknown as { showInputBox: typeof vscode.window.showInputBox }).showInputBox = showInputBoxMock;

      const showInformationMessageMock = (async (message: string): Promise<string | undefined> => {
        infoMessages.push(message);
        return undefined;
      }) as unknown as typeof vscode.window.showInformationMessage;
      (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage =
        showInformationMessageMock;

      (modelSettingsModule as unknown as { getModelSettings: typeof modelSettingsModule.getModelSettings }).getModelSettings = () =>
        modelSettingsValue;
      (modelSettingsModule as unknown as { setDefaultModel: typeof modelSettingsModule.setDefaultModel }).setDefaultModel = async (model) => {
        setDefaultModelCalls.push(model);
      };
    });

    teardown(() => {
      (vscode.window as unknown as { showQuickPick: typeof originalShowQuickPick }).showQuickPick = originalShowQuickPick;
      (vscode.window as unknown as { showInputBox: typeof originalShowInputBox }).showInputBox = originalShowInputBox;
      (vscode.window as unknown as { showInformationMessage: typeof originalShowInformationMessage }).showInformationMessage =
        originalShowInformationMessage;
      (modelSettingsModule as unknown as { getModelSettings: typeof originalGetModelSettings }).getModelSettings = originalGetModelSettings;
      (modelSettingsModule as unknown as { setDefaultModel: typeof originalSetDefaultModel }).setDefaultModel = originalSetDefaultModel;
    });

    test('TC-SDM-E-01: QuickPick canceled returns early', async () => {
      // Given: QuickPick が undefined を返す
      quickPickSelector = () => undefined;

      // When: selectDefaultModel を呼び出す
      await selectDefaultModelModule.selectDefaultModel();

      // Then: setDefaultModel は呼ばれず、入力ボックスも表示されない
      assert.strictEqual(quickPickCalls.length, 1);
      assert.strictEqual(setDefaultModelCalls.length, 0);
      assert.strictEqual(inputBoxCalls.length, 0);
      assert.strictEqual(infoMessages.length, 0);
    });

    test('TC-SDM-N-01: Unset selection clears default model', async () => {
      // Given: unset を選択する
      quickPickSelector = (items) => items.find((item) => item.mode === 'unset');

      // When: selectDefaultModel を呼び出す
      await selectDefaultModelModule.selectDefaultModel();

      // Then: setDefaultModel(undefined) が呼ばれ、情報メッセージが表示される
      assert.strictEqual(setDefaultModelCalls.length, 1);
      assert.strictEqual(setDefaultModelCalls[0], undefined);
      assert.strictEqual(infoMessages.length, 1);
      assert.ok(infoMessages[0].length > 0, '情報メッセージは空でない');
      assert.strictEqual(inputBoxCalls.length, 0);
    });

    test('TC-SDM-N-02: Candidate model selection sets trimmed value', async () => {
      // Given: customModels に候補がある
      modelSettingsValue = { defaultModel: undefined, customModels: ['model-alpha'] };
      quickPickSelector = (items) => items.find((item) => item.mode === 'useCandidate');

      // When: selectDefaultModel を呼び出す
      await selectDefaultModelModule.selectDefaultModel();

      // Then: setDefaultModel が候補モデルで呼ばれる
      assert.strictEqual(setDefaultModelCalls.length, 1);
      assert.strictEqual(setDefaultModelCalls[0], 'model-alpha');
      assert.strictEqual(infoMessages.length, 1);
      assert.strictEqual(inputBoxCalls.length, 0);
    });

    test('TC-SDM-E-02: Empty candidate value does not update model', async () => {
      // Given: customModels の候補が空白のみ
      modelSettingsValue = { defaultModel: undefined, customModels: ['   '] };
      quickPickSelector = (items) => items.find((item) => item.mode === 'useCandidate');

      // When: selectDefaultModel を呼び出す
      await selectDefaultModelModule.selectDefaultModel();

      // Then: setDefaultModel は呼ばれない
      assert.strictEqual(setDefaultModelCalls.length, 0);
      assert.strictEqual(infoMessages.length, 0);
      assert.strictEqual(inputBoxCalls.length, 0);
    });

    test('TC-SDM-N-03: Input model selection trims input value', async () => {
      // Given: 入力モデルを選択し、入力値が返る
      quickPickSelector = (items) => items.find((item) => item.mode === 'input');
      inputBoxResult = '  model-input  ';

      // When: selectDefaultModel を呼び出す
      await selectDefaultModelModule.selectDefaultModel();

      // Then: setDefaultModel がトリム済み入力で呼ばれる
      assert.strictEqual(inputBoxCalls.length, 1);
      assert.ok(typeof inputBoxCalls[0].validateInput === 'function');
      assert.strictEqual(setDefaultModelCalls.length, 1);
      assert.strictEqual(setDefaultModelCalls[0], 'model-input');
      assert.strictEqual(infoMessages.length, 1);
    });

    test('TC-SDM-E-03: Input canceled does not update model', async () => {
      // Given: 入力モデルを選択し、入力ボックスがキャンセルされる
      quickPickSelector = (items) => items.find((item) => item.mode === 'input');
      inputBoxResult = undefined;

      // When: selectDefaultModel を呼び出す
      await selectDefaultModelModule.selectDefaultModel();

      // Then: setDefaultModel は呼ばれない
      assert.strictEqual(inputBoxCalls.length, 1);
      assert.strictEqual(setDefaultModelCalls.length, 0);
      assert.strictEqual(infoMessages.length, 0);
    });
  });
});
