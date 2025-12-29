import * as assert from 'assert';
import * as vscode from 'vscode';
import { generateTestWithQuickPick } from '../../../ui/quickPick';
import * as generateFromCommitModule from '../../../commands/generateFromCommit';
import * as generateFromCommitRangeModule from '../../../commands/generateFromCommitRange';
import * as generateFromWorkingTreeModule from '../../../commands/generateFromWorkingTree';
import * as modelSettingsModule from '../../../core/modelSettings';
import * as preflightModule from '../../../core/preflight';
import { t } from '../../../core/l10n';
import { type AgentProvider } from '../../../providers/provider';
import { createMockExtensionContext } from '../testUtils/vscodeMocks';

// QuickPick item shape for testing
interface MockQuickPickItem extends vscode.QuickPickItem {
  source?: string;
  mode?: string;
  modelValue?: string;
  runLocation?: string;
  runMode?: string;
}

// QuickPick call history
interface QuickPickCall {
  items: MockQuickPickItem[];
  options: vscode.QuickPickOptions;
}

/**
 * QuickPick UI tests.
 *
 * Note:
 * VS Code API mocking can be restricted in Extension Host tests.
 * This suite focuses on verifying observable call flows and arguments via stubs.
 */
suite('src/ui/quickPick.ts', () => {
  let originalShowQuickPick: typeof vscode.window.showQuickPick;
  let originalShowInputBox: typeof vscode.window.showInputBox;
  let originalShowErrorMessage: typeof vscode.window.showErrorMessage;
  
  let showQuickPickStub: (items: MockQuickPickItem[], options: vscode.QuickPickOptions) => Promise<MockQuickPickItem | undefined>;
  let showInputBoxStub: (options: vscode.InputBoxOptions) => Promise<string | undefined>;
  let showErrorMessageStub: (message: string, ...items: string[]) => Promise<string | undefined>;
  
  // Call history
  let quickPickCalls: QuickPickCall[] = [];
  let errorMessages: string[] = [];
  let inputBoxCalls: vscode.InputBoxOptions[] = [];
  
  // Whether the vscode.window mocks are applied successfully
  let mockApplied = false;

  setup(() => {
    // Given: Save originals
    originalShowQuickPick = vscode.window.showQuickPick;
    originalShowInputBox = vscode.window.showInputBox;
    originalShowErrorMessage = vscode.window.showErrorMessage;

    quickPickCalls = [];
    errorMessages = [];
    inputBoxCalls = [];
    mockApplied = false;

    // Given: Default stub implementations
    showQuickPickStub = async () => undefined;
    showInputBoxStub = async () => undefined;
    showErrorMessageStub = async () => undefined;

    // Given: Mock vscode.window only (do not touch workspace.fs)
    try {
      // @ts-expect-error Test-only override
      vscode.window.showQuickPick = async (items: MockQuickPickItem[], options: vscode.QuickPickOptions) => {
        quickPickCalls.push({ items, options });
        return showQuickPickStub(items, options);
      };
      // @ts-expect-error Test-only override
      vscode.window.showInputBox = async (options: vscode.InputBoxOptions) => {
        inputBoxCalls.push(options);
        return showInputBoxStub(options);
      };
      // @ts-expect-error Test-only override
      vscode.window.showErrorMessage = async (message: string, ...items: string[]) => {
        errorMessages.push(message);
        return showErrorMessageStub(message, ...items);
      };
      mockApplied = true;
    } catch (e) {
      console.warn('Failed to mock vscode API. Skipping tests in this environment.', e);
    }
  });

  teardown(() => {
    // Restore originals
    if (mockApplied) {
      try {
        vscode.window.showQuickPick = originalShowQuickPick;
        vscode.window.showInputBox = originalShowInputBox;
        vscode.window.showErrorMessage = originalShowErrorMessage;
      } catch {
        // Ignore
      }
    }
  });

  // TC-UI-01: Mock Setup: valid items
  test('TC-UI-01: Mock Setup: showQuickPick with valid items executes safely', async () => {
    // Given: The mock is applied
    if (!mockApplied) {
      console.log('Skipping because mocks are not applied');
      return;
    }
    // Given: Valid MockQuickPickItem[]
    const items: MockQuickPickItem[] = [{ label: 'item1' }, { label: 'item2' }];
    // When: showQuickPick is called
    await vscode.window.showQuickPick(items, {});
    // Then: Calls are recorded
    assert.strictEqual(quickPickCalls.length, 1, 'Expected showQuickPick to be called once');
    assert.strictEqual(quickPickCalls[0].items.length, 2, 'Expected 2 items');
  });

  // TC-UI-02: Mock Setup: showQuickPick returns selected item
  test('TC-UI-02: Mock Setup: showQuickPick returns the selected item', async () => {
    // Given: The mock is applied
    if (!mockApplied) {
      console.log('Skipping because mocks are not applied');
      return;
    }
    // Given: A stub returning a specific item
    const items: MockQuickPickItem[] = [
      { label: 'option1', source: 'workingTree' },
      { label: 'option2', source: 'latestCommit' },
    ];
    showQuickPickStub = async (itms: MockQuickPickItem[]) => {
      return itms.find(i => i.source === 'latestCommit');
    };
    
    // When: showQuickPick is called
    const result = await vscode.window.showQuickPick(items, { title: 'Test' });
    
    // Then: It returns the expected item
    assert.strictEqual(result?.label, 'option2');
    assert.strictEqual(result?.source, 'latestCommit');
  });

  // TC-UI-03: Mock Setup: showQuickPick returns undefined on cancel
  test('TC-UI-03: Mock Setup: showQuickPick returns undefined on cancel', async () => {
    // Given: The mock is applied
    if (!mockApplied) {
      console.log('Skipping because mocks are not applied');
      return;
    }
    // Given: A stub that simulates cancel (undefined)
    showQuickPickStub = async () => undefined;
    
    // When: showQuickPick is called
    const items: MockQuickPickItem[] = [{ label: 'item1' }];
    const result = await vscode.window.showQuickPick(items, {});
    
    // Then: It returns undefined
    assert.strictEqual(result, undefined, 'Expected undefined on cancel');
  });

  // TC-UI-04: Mock Setup: showInputBox records input
  test('TC-UI-04: Mock Setup: showInputBox returns user input', async () => {
    // Given: The mock is applied
    if (!mockApplied) {
      console.log('Skipping because mocks are not applied');
      return;
    }
    // Given: A stub that returns user input
    showInputBoxStub = async () => 'user-input-value';
    
    // When: showInputBox is called
    const result = await vscode.window.showInputBox({ prompt: 'Enter value' });
    
    // Then: It returns the input value
    assert.strictEqual(result, 'user-input-value');
  });

  // TC-UI-05: Mock Setup: showErrorMessage records errors
  test('TC-UI-05: Mock Setup: showErrorMessage records error messages', async () => {
    // Given: The mock is applied
    if (!mockApplied) {
      console.log('Skipping because mocks are not applied');
      return;
    }
    // When: showErrorMessage is called
    await vscode.window.showErrorMessage('Test error message');
    
    // Then: It records the error message
    assert.strictEqual(errorMessages.length, 1);
    assert.strictEqual(errorMessages[0], 'Test error message');
  });

  // TC-UI-06: Mock Setup: multiple QuickPick calls are tracked
  test('TC-UI-06: Mock Setup: multiple QuickPick calls are tracked', async () => {
    // Given: The mock is applied
    if (!mockApplied) {
      console.log('Skipping because mocks are not applied');
      return;
    }
    // When: showQuickPick is called multiple times
    await vscode.window.showQuickPick([{ label: 'first' }], { title: 'First Pick' });
    await vscode.window.showQuickPick([{ label: 'second' }], { title: 'Second Pick' });
    
    // Then: Both calls are recorded
    assert.strictEqual(quickPickCalls.length, 2, 'Expected two calls');
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

    let workingTreeCalls: Array<{
      provider: AgentProvider;
      modelOverride: string | undefined;
      options: generateFromWorkingTreeModule.GenerateFromWorkingTreeOptions | undefined;
    }> = [];
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
        .generateTestFromWorkingTree = async (callProvider, modelOverride, options) => {
          workingTreeCalls.push({ provider: callProvider, modelOverride, options });
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
      // Case ID: QP-E-01
      // Given: ensurePreflight returns undefined
      if (!mockApplied) {
        console.log('Skipping because mocks are not applied');
        return;
      }
      preflightResult = undefined;

      // When: Calling generateTestWithQuickPick
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: No QuickPick call; no command invoked
      assert.strictEqual(quickPickCalls.length, 0);
      assert.strictEqual(workingTreeCalls.length, 0);
      assert.strictEqual(latestCommitCalls.length, 0);
      assert.strictEqual(commitRangeCalls.length, 0);
    });

    test('TC-QP-E-02: source pick canceled returns early', async () => {
      // Case ID: QP-B-NULL-01
      // Given: Source selection is canceled (picked is undefined)
      if (!mockApplied) {
        console.log('Skipping because mocks are not applied');
        return;
      }
      setQuickPickQueue([() => undefined]);

      // When: Calling generateTestWithQuickPick
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: Only source QuickPick is shown; no further UI; no command invoked
      assert.strictEqual(quickPickCalls.length, 1);
      assert.strictEqual(workingTreeCalls.length, 0);
      assert.strictEqual(latestCommitCalls.length, 0);
      assert.strictEqual(commitRangeCalls.length, 0);
      assert.strictEqual(inputBoxCalls.length, 0);
    });

    test('TC-QP-B-NULL-02: runMode pick canceled returns early', async () => {
      // Case ID: QP-B-NULL-02
      // Given: Source is selected, but runMode selection is canceled
      if (!mockApplied) {
        console.log('Skipping because mocks are not applied');
        return;
      }
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'latestCommit'),
        () => undefined,
      ]);

      // When: Calling generateTestWithQuickPick
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: QuickPick is called twice (source, runMode); no command invoked
      assert.strictEqual(quickPickCalls.length, 2);
      assert.strictEqual(workingTreeCalls.length, 0);
      assert.strictEqual(latestCommitCalls.length, 0);
      assert.strictEqual(commitRangeCalls.length, 0);
      assert.strictEqual(inputBoxCalls.length, 0);
    });

    test('TC-QP-E-03: runLocation pick canceled for latestCommit', async () => {
      // Case ID: QP-B-NULL-03
      // Given: Source=latestCommit, runMode=full, runLocation selection is canceled
      if (!mockApplied) {
        console.log('Skipping because mocks are not applied');
        return;
      }
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'latestCommit'),
        (items) => items.find((item) => item.runMode === 'full'),
        () => undefined,
      ]);

      // When: Calling generateTestWithQuickPick
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: QuickPick called 3 times (source, runMode, runLocation); no command invoked
      assert.strictEqual(quickPickCalls.length, 3);
      assert.strictEqual(workingTreeCalls.length, 0);
      assert.strictEqual(latestCommitCalls.length, 0);
      assert.strictEqual(commitRangeCalls.length, 0);
    });

    test('TC-QP-E-04: model pick canceled for commitRange', async () => {
      // Case ID: QP-B-NULL-04
      // Given: Source=commitRange, runMode=full, runLocation is selected, but model selection is canceled
      if (!mockApplied) {
        console.log('Skipping because mocks are not applied');
        return;
      }
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'commitRange'),
        (items) => items.find((item) => item.runMode === 'full'),
        (items) => items.find((item) => item.runLocation === 'worktree'),
        () => undefined,
      ]);

      // When: Calling generateTestWithQuickPick
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: QuickPick called 4 times; no command invoked
      assert.strictEqual(quickPickCalls.length, 4);
      assert.strictEqual(workingTreeCalls.length, 0);
      assert.strictEqual(latestCommitCalls.length, 0);
      assert.strictEqual(commitRangeCalls.length, 0);
    });

    test('TC-QP-E-05: model separator item returns early', async () => {
      // Case ID: QP-E-SEP-01
      // Given: A separator item is selected (unexpected, defensive branch)
      if (!mockApplied) {
        console.log('Skipping because mocks are not applied');
        return;
      }
      modelSettingsValue = { defaultModel: undefined, customModels: ['model-alpha'] };
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'workingTree'),
        (items) => items.find((item) => item.runMode === 'full'),
        (items) => items.find((item) => item.mode === 'separator'),
      ]);

      // When: Calling generateTestWithQuickPick
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: No command invoked (modelOverride treated as null)
      assert.strictEqual(workingTreeCalls.length, 0);
      assert.strictEqual(latestCommitCalls.length, 0);
      assert.strictEqual(commitRangeCalls.length, 0);
    });

    test('TC-QP-B-NULL-05: model input canceled returns early', async () => {
      // Case ID: QP-B-NULL-05
      // Given: Source=commitRange, runMode=full, runLocation selected, model=input, but input box is canceled
      if (!mockApplied) {
        console.log('Skipping because mocks are not applied');
        return;
      }
      showInputBoxStub = async () => undefined;
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'commitRange'),
        (items) => items.find((item) => item.runMode === 'full'),
        (items) => items.find((item) => item.runLocation === 'worktree'),
        (items) => items.find((item) => item.mode === 'input'),
      ]);

      // When: Calling generateTestWithQuickPick
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: InputBox is shown once, but no command is invoked
      assert.strictEqual(inputBoxCalls.length, 1);
      assert.strictEqual(commitRangeCalls.length, 0);
      assert.strictEqual(latestCommitCalls.length, 0);
      assert.strictEqual(workingTreeCalls.length, 0);
    });

    test('TC-QP-B-EMPTY-01: model input validateInput returns message for empty string', async () => {
      // Case ID: QP-B-EMPTY-01
      // Given: We reach the model input box and capture validateInput
      if (!mockApplied) {
        console.log('Skipping because mocks are not applied');
        return;
      }
      showInputBoxStub = async () => undefined; // stop after capturing options
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'commitRange'),
        (items) => items.find((item) => item.runMode === 'full'),
        (items) => items.find((item) => item.runLocation === 'local'),
        (items) => items.find((item) => item.mode === 'input'),
      ]);

      // When: Calling generateTestWithQuickPick
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: validateInput('') returns the localized validation message
      assert.strictEqual(inputBoxCalls.length, 1);
      const validate = inputBoxCalls[0]?.validateInput;
      assert.ok(validate, 'Expected validateInput to be provided');
      if (validate) {
        const msg = await Promise.resolve(validate(''));
        assert.strictEqual(msg, t('quickPick.inputModelValidation'));
      }
      assert.strictEqual(commitRangeCalls.length, 0);
    });

    test('TC-QP-B-WS-01: model input validateInput returns message for whitespace-only string', async () => {
      // Case ID: QP-B-WS-01
      // Given: We reach the model input box and capture validateInput
      if (!mockApplied) {
        console.log('Skipping because mocks are not applied');
        return;
      }
      showInputBoxStub = async () => undefined; // stop after capturing options
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'commitRange'),
        (items) => items.find((item) => item.runMode === 'full'),
        (items) => items.find((item) => item.runLocation === 'local'),
        (items) => items.find((item) => item.mode === 'input'),
      ]);

      // When: Calling generateTestWithQuickPick
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: validateInput(' ') returns the localized validation message
      assert.strictEqual(inputBoxCalls.length, 1);
      const validate = inputBoxCalls[0]?.validateInput;
      assert.ok(validate, 'Expected validateInput to be provided');
      if (validate) {
        const msg = await Promise.resolve(validate(' '));
        assert.strictEqual(msg, t('quickPick.inputModelValidation'));
      }
      assert.strictEqual(commitRangeCalls.length, 0);
    });

    test('TC-QP-N-LOCK-01: latestCommit + perspectiveOnly locks runLocation to local and skips runLocation QuickPick', async () => {
      // Case ID: QP-N-LOCK-01
      // Given: Source=latestCommit, runMode=perspectiveOnly
      if (!mockApplied) {
        console.log('Skipping because mocks are not applied');
        return;
      }
      modelSettingsValue = { defaultModel: 'model-config', customModels: [] };
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'latestCommit'),
        (items) => items.find((item) => item.runMode === 'perspectiveOnly'),
        (items) => items.find((item) => item.mode === 'useConfig'),
      ]);

      // When: Calling generateTestWithQuickPick
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: runLocation picker is not shown; generateTestFromLatestCommit gets runLocation='local'
      assert.strictEqual(latestCommitCalls.length, 1);
      assert.strictEqual(latestCommitCalls[0]?.options?.runLocation, 'local');
      assert.strictEqual(latestCommitCalls[0]?.options?.runMode, 'perspectiveOnly');
      assert.strictEqual(quickPickCalls.length, 3, 'Expected QuickPick calls: source, runMode, model');
    });

    test('TC-QP-N-LOCK-02: workingTree + full locks runLocation to local and skips runLocation QuickPick', async () => {
      // Case ID: QP-N-LOCK-02
      // Given: Source=workingTree, runMode=full
      if (!mockApplied) {
        console.log('Skipping because mocks are not applied');
        return;
      }
      modelSettingsValue = { defaultModel: undefined, customModels: ['model-alpha'] };
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'workingTree'),
        (items) => items.find((item) => item.runMode === 'full'),
        (items) => items.find((item) => item.mode === 'useCandidate'),
      ]);

      // When: Calling generateTestWithQuickPick
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: runLocation picker is not shown; generateTestFromWorkingTree is called with runMode='full'
      assert.strictEqual(workingTreeCalls.length, 1);
      assert.strictEqual(workingTreeCalls[0]?.options?.runMode, 'full');
      assert.strictEqual(quickPickCalls.length, 3, 'Expected QuickPick calls: source, runMode, model');
    });

    test('TC-QP-N-01: workingTree triggers generateTestFromWorkingTree with model override', async () => {
      // Case ID: QP-N-01
      // Given: Source=workingTree, runMode=full, model=candidate
      if (!mockApplied) {
        console.log('Skipping because mocks are not applied');
        return;
      }
      modelSettingsValue = { defaultModel: undefined, customModels: ['model-alpha'] };
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'workingTree'),
        (items) => items.find((item) => item.runMode === 'full'),
        (items) => items.find((item) => item.mode === 'useCandidate'),
      ]);

      // When: Calling generateTestWithQuickPick
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: generateTestFromWorkingTree is called with model override and runMode
      assert.strictEqual(workingTreeCalls.length, 1);
      assert.strictEqual(workingTreeCalls[0]?.modelOverride, 'model-alpha');
      assert.strictEqual(workingTreeCalls[0]?.options?.runMode, 'full');
      assert.strictEqual(latestCommitCalls.length, 0);
      assert.strictEqual(commitRangeCalls.length, 0);
    });

    test('TC-QP-N-02: latestCommit uses config model and passes runLocation', async () => {
      // Case ID: QP-N-02
      // Given: Source=latestCommit, runMode=full, runLocation=local, model=useConfig
      if (!mockApplied) {
        console.log('Skipping because mocks are not applied');
        return;
      }
      modelSettingsValue = { defaultModel: 'model-config', customModels: [] };
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'latestCommit'),
        (items) => items.find((item) => item.runMode === 'full'),
        (items) => items.find((item) => item.runLocation === 'local'),
        (items) => items.find((item) => item.mode === 'useConfig'),
      ]);

      // When: Calling generateTestWithQuickPick
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: generateTestFromLatestCommit is called with undefined model override
      assert.strictEqual(latestCommitCalls.length, 1);
      assert.strictEqual(latestCommitCalls[0]?.modelOverride, undefined);
      assert.ok(latestCommitCalls[0]?.options);
      assert.strictEqual(latestCommitCalls[0]?.options?.runLocation, 'local');
      assert.strictEqual(latestCommitCalls[0]?.options?.runMode, 'full');
      assert.strictEqual(latestCommitCalls[0]?.options?.extensionContext, extensionContext);
      assert.strictEqual(workingTreeCalls.length, 0);
      assert.strictEqual(commitRangeCalls.length, 0);
    });

    test('TC-QP-N-03: commitRange uses input model and trims value', async () => {
      // Case ID: QP-N-03
      // Given: Source=commitRange, runMode=full, runLocation=worktree, model=input with surrounding whitespace
      if (!mockApplied) {
        console.log('Skipping because mocks are not applied');
        return;
      }
      showInputBoxStub = async () => '  model-input  ';
      setQuickPickQueue([
        (items) => items.find((item) => item.source === 'commitRange'),
        (items) => items.find((item) => item.runMode === 'full'),
        (items) => items.find((item) => item.runLocation === 'worktree'),
        (items) => items.find((item) => item.mode === 'input'),
      ]);

      // When: Calling generateTestWithQuickPick
      await generateTestWithQuickPick(provider, extensionContext);

      // Then: generateTestFromCommitRange is called with trimmed model override
      assert.strictEqual(commitRangeCalls.length, 1);
      assert.strictEqual(commitRangeCalls[0]?.modelOverride, 'model-input');
      assert.ok(commitRangeCalls[0]?.options);
      assert.strictEqual(commitRangeCalls[0]?.options?.runLocation, 'worktree');
      assert.strictEqual(commitRangeCalls[0]?.options?.runMode, 'full');
      assert.strictEqual(commitRangeCalls[0]?.options?.extensionContext, extensionContext);
      assert.strictEqual(inputBoxCalls.length, 1);
      assert.strictEqual(workingTreeCalls.length, 0);
      assert.strictEqual(latestCommitCalls.length, 0);
    });
  });
});
