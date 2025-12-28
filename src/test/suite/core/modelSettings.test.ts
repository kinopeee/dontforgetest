import * as assert from 'assert';
import * as vscode from 'vscode';
import { getModelCandidates, normalizeModelList, getModelSettings, setDefaultModel, type ModelSettings } from '../../../core/modelSettings';

suite('core/modelSettings.ts', () => {
  suite('normalizeModelList', () => {
    // Given: undefined
    // When: normalizeModelListを呼び出す
    // Then: 空配列が返る
    test('TC-A-01: undefinedは空配列に正規化される', () => {
      const result = normalizeModelList(undefined);
      assert.deepStrictEqual(result, []);
    });

    // Given: string配列だが空文字/空白/重複/非stringが混在
    // When: normalizeModelListを呼び出す
    // Then: trimされ、空要素と重複と非stringが除外される（順序は先勝ち）
    test('TC-N-02: 値の正規化（trim/空除外/重複除去）', () => {
      const input: unknown = [' o3 ', '', '  ', 'o3', 123, null, 'claude-4-opus-thinking', 'claude-4-opus-thinking'];
      const result = normalizeModelList(input);
      assert.deepStrictEqual(result, ['o3', 'claude-4-opus-thinking']);
    });
  });

  suite('getModelCandidates', () => {
    // Given: defaultModelとcustomModelsが設定済み（重複あり）
    // When: getModelCandidatesを呼び出す
    // Then: defaultModelが先頭、customModelsとマージ、重複除去される
    test('TC-N-01: 候補モデルの生成（default優先、重複除去）', () => {
      const settings: ModelSettings = {
        defaultModel: 'claude-3.5-sonnet',
        customModels: ['o3', ' claude-3.5-sonnet ', 'claude-4-opus-thinking'],
      };
      const result = getModelCandidates(settings);
      assert.deepStrictEqual(result, ['claude-3.5-sonnet', 'o3', 'claude-4-opus-thinking']);
    });

    // Given: defaultModel未設定、customModelsのみ
    // When: getModelCandidatesを呼び出す
    // Then: customModelsの正規化結果が返る
    test('TC-N-02: defaultModel未設定の場合', () => {
      const settings: ModelSettings = {
        defaultModel: undefined,
        customModels: [' o3 ', 'o3', ''],
      };
      const result = getModelCandidates(settings);
      assert.deepStrictEqual(result, ['o3']);
    });
  });

  suite('getModelSettings (Integration)', () => {
    // TC-N-02: User settings define dontforgetest.defaultModel
    test('TC-N-02: User settings define dontforgetest.defaultModel', async () => {
      // Given
      const config = vscode.workspace.getConfiguration('dontforgetest');
      await config.update('defaultModel', 'test-model-n02', vscode.ConfigurationTarget.Global);

      try {
        // When
        const settings = getModelSettings();
        // Then
        assert.strictEqual(settings.defaultModel, 'test-model-n02');
      } finally {
        await config.update('defaultModel', undefined, vscode.ConfigurationTarget.Global);
      }
    });

    // TC-B-02: User settings define ONLY old testgen-agent keys (Verify Isolation)
    test('TC-B-02: User settings define ONLY old testgen-agent keys (Verify Isolation)', async () => {
      const config = vscode.workspace.getConfiguration('dontforgetest');
      // Ensure defaultModel is clear
      await config.update('defaultModel', undefined, vscode.ConfigurationTarget.Global);
      
      const settings = getModelSettings();
      // dontforgetest.defaultModel should be undefined (default)
      assert.strictEqual(settings.defaultModel, undefined);
    });
  });

  suite('setDefaultModel (Deterministic)', () => {
    // Test Perspectives Table
    // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
    // |---------|----------------------|--------------------------------------|-----------------|-------|
    // | TC-SDMSET-N-01 | model="  o3  " | Equivalence – normal | Calls config.update("defaultModel","o3",target) | target depends on workspaceFolders |
    // | TC-SDMSET-B-01 | model=undefined | Boundary – null | Calls config.update("defaultModel","",target) | Clears model |
    // | TC-SDMSET-E-01 | config.update throws | Error – exception | setDefaultModel rejects with same error | Verify message |
    // | TC-SDMSET-E-02 | getConfiguration throws | Error – exception | setDefaultModel rejects | Verify message |

    let originalGetConfiguration: typeof vscode.workspace.getConfiguration;
    let getConfigurationShouldThrow = false;
    let updateShouldThrow = false;
    let updateCalls: Array<{ section: string; value: unknown; target: vscode.ConfigurationTarget | boolean | undefined }> = [];

    setup(() => {
      getConfigurationShouldThrow = false;
      updateShouldThrow = false;
      updateCalls = [];

      originalGetConfiguration = vscode.workspace.getConfiguration;
      (vscode.workspace as unknown as { getConfiguration: typeof vscode.workspace.getConfiguration }).getConfiguration = (_section?: string) => {
        if (getConfigurationShouldThrow) {
          throw new Error('getConfiguration failed');
        }
        return {
          update: async (
            section: string,
            value: unknown,
            target?: vscode.ConfigurationTarget | boolean,
            _overrideInLanguage?: boolean,
          ) => {
            if (updateShouldThrow) {
              throw new Error('update failed');
            }
            updateCalls.push({ section, value, target });
          },
        } as unknown as vscode.WorkspaceConfiguration;
      };
    });

    teardown(() => {
      (vscode.workspace as unknown as { getConfiguration: typeof originalGetConfiguration }).getConfiguration = originalGetConfiguration;
    });

    test('TC-SDMSET-N-01: setDefaultModel trims value and updates config', async () => {
      // Given: model が前後に空白を含む
      const expectedTarget =
        vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
          ? vscode.ConfigurationTarget.Workspace
          : vscode.ConfigurationTarget.Global;

      // When: setDefaultModel を呼び出す
      await setDefaultModel('  o3  ');

      // Then: trimされた値で update が呼ばれる
      assert.strictEqual(updateCalls.length, 1);
      assert.strictEqual(updateCalls[0]?.section, 'defaultModel');
      assert.strictEqual(updateCalls[0]?.value, 'o3');
      assert.strictEqual(updateCalls[0]?.target, expectedTarget);
    });

    test('TC-SDMSET-B-01: setDefaultModel clears model when model is undefined', async () => {
      // Given: model が undefined（クリア）
      const expectedTarget =
        vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
          ? vscode.ConfigurationTarget.Workspace
          : vscode.ConfigurationTarget.Global;

      // When: setDefaultModel を呼び出す
      await setDefaultModel(undefined);

      // Then: 空文字で update が呼ばれる（未設定扱い）
      assert.strictEqual(updateCalls.length, 1);
      assert.strictEqual(updateCalls[0]?.section, 'defaultModel');
      assert.strictEqual(updateCalls[0]?.value, '');
      assert.strictEqual(updateCalls[0]?.target, expectedTarget);
    });

    test('TC-SDMSET-E-01: setDefaultModel rejects when config.update throws', async () => {
      // Given: update が例外を投げる
      updateShouldThrow = true;

      // When/Then: 例外が伝播する
      await assert.rejects(
        setDefaultModel('o3'),
        (e: unknown) => e instanceof Error && e.message === 'update failed',
      );
    });

    test('TC-SDMSET-E-02: setDefaultModel rejects when getConfiguration throws', async () => {
      // Given: getConfiguration が例外を投げる
      getConfigurationShouldThrow = true;

      // When/Then: 例外が伝播する
      await assert.rejects(
        setDefaultModel('o3'),
        (e: unknown) => e instanceof Error && e.message === 'getConfiguration failed',
      );
    });
  });
});

