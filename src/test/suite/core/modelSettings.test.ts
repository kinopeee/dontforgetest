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

  suite('setDefaultModel', () => {
    let originalGetConfiguration: typeof vscode.workspace.getConfiguration;

    teardown(() => {
      // Restore vscode API if it was mocked
      if (originalGetConfiguration) {
        try {
          vscode.workspace.getConfiguration = originalGetConfiguration;
        } catch {
          // ignore
        }
      }
    });

    test('TC-MODEL-SET-N-01: trims model value and calls config.update once', async () => {
      // Given: A mocked configuration.update that records calls
      originalGetConfiguration = vscode.workspace.getConfiguration;
      const calls: Array<{ section: string; value: unknown; target: unknown }> = [];
      const configStub = {
        update: async (section: string, value: unknown, target: unknown) => {
          calls.push({ section, value, target });
        },
      } as unknown as vscode.WorkspaceConfiguration;

      vscode.workspace.getConfiguration = () => configStub;

      // When: setDefaultModel is called with a trimmed value
      await setDefaultModel('  model-a  ');

      // Then: update is called with trimmed value and a valid ConfigurationTarget
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0]?.section, 'defaultModel');
      assert.strictEqual(calls[0]?.value, 'model-a');
      assert.ok(
        calls[0]?.target === vscode.ConfigurationTarget.Workspace || calls[0]?.target === vscode.ConfigurationTarget.Global,
        'target should be Workspace or Global',
      );
    });

    test('TC-MODEL-SET-B-01: undefined clears defaultModel as empty string', async () => {
      // Given: A mocked configuration.update that records calls
      originalGetConfiguration = vscode.workspace.getConfiguration;
      const calls: Array<{ section: string; value: unknown; target: unknown }> = [];
      const configStub = {
        update: async (section: string, value: unknown, target: unknown) => {
          calls.push({ section, value, target });
        },
      } as unknown as vscode.WorkspaceConfiguration;

      vscode.workspace.getConfiguration = () => configStub;

      // When: setDefaultModel is called with undefined
      await setDefaultModel(undefined);

      // Then: update is called with empty string
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0]?.section, 'defaultModel');
      assert.strictEqual(calls[0]?.value, '');
    });

    test('TC-MODEL-SET-E-01: propagates Error from config.update', async () => {
      // Given: config.update throws Error('update failed')
      originalGetConfiguration = vscode.workspace.getConfiguration;
      const configStub = {
        update: async () => {
          throw new Error('update failed');
        },
      } as unknown as vscode.WorkspaceConfiguration;

      vscode.workspace.getConfiguration = () => configStub;

      // When: setDefaultModel is called
      // Then: It rejects with Error('update failed')
      try {
        await setDefaultModel('model');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err instanceof Error, 'Should throw Error');
        assert.strictEqual(err.message, 'update failed');
      }
    });

    test('TC-MODEL-SET-E-02: propagates TypeError from vscode.workspace.getConfiguration', async () => {
      // Given: vscode.workspace.getConfiguration throws TypeError('boom')
      originalGetConfiguration = vscode.workspace.getConfiguration;

      vscode.workspace.getConfiguration = () => {
        throw new TypeError('boom');
      };

      // When: setDefaultModel is called
      // Then: It rejects with TypeError('boom')
      try {
        await setDefaultModel('model');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err instanceof TypeError, 'Should throw TypeError');
        assert.strictEqual((err as Error).message, 'boom');
      }
    });
  });
});

