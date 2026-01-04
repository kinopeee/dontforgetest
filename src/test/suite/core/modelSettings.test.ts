import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  getModelCandidates,
  normalizeModelList,
  getModelSettings,
  setDefaultModel,
  getClaudeCodeModelCandidates,
  getCursorAgentModelCandidates,
  getModelCandidatesForProvider,
  getEffectiveDefaultModel,
  type ModelSettings,
} from '../../../core/modelSettings';

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
      // Given: dontforgetest.defaultModel を設定している
      const config = vscode.workspace.getConfiguration('dontforgetest');
      await config.update('defaultModel', 'test-model-n02', vscode.ConfigurationTarget.Global);

      try {
        // When: getModelSettings を呼び出す
        const settings = getModelSettings();
        // Then: 設定値が返る
        assert.strictEqual(settings.defaultModel, 'test-model-n02');
      } finally {
        await config.update('defaultModel', undefined, vscode.ConfigurationTarget.Global);
      }
    });

    // TC-B-02: User settings define ONLY old testgen-agent keys (Verify Isolation)
    test('TC-B-02: User settings define ONLY old testgen-agent keys (Verify Isolation)', async () => {
      // Given: dontforgetest.defaultModel を未設定にし、旧キーのみが存在する状況を想定する
      const config = vscode.workspace.getConfiguration('dontforgetest');
      await config.update('defaultModel', undefined, vscode.ConfigurationTarget.Global);

      // When: getModelSettings を呼び出す
      const settings = getModelSettings();

      // Then: dontforgetest.defaultModel は未設定のまま（default状態を確認）
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

  suite('getClaudeCodeModelCandidates', () => {
    // TC-CLAUDE-N-01: Claude Code 用のモデル候補が正しく返る
    test('TC-CLAUDE-N-01: Claude Code 用のモデル候補を返す', () => {
      // Given: なし
      // When: getClaudeCodeModelCandidates を呼び出す
      const result = getClaudeCodeModelCandidates();

      // Then: Opus, Sonnet, Haiku の3つが含まれる
      assert.ok(Array.isArray(result), 'Should return an array');
      assert.ok(result.includes('opus-4.5'), 'Should include opus-4.5');
      assert.ok(result.includes('sonnet-4.5'), 'Should include sonnet-4.5');
      assert.ok(result.includes('haiku-4.5'), 'Should include haiku-4.5');
      assert.strictEqual(result.length, 3, 'Should have exactly 3 candidates');
    });
  });

  suite('getCursorAgentModelCandidates', () => {
    // TC-CURSOR-N-01: Cursor Agent 用のビルトインモデルが含まれる
    test('TC-CURSOR-N-01: ビルトインモデルが含まれる', () => {
      // Given: customModels が空の設定
      const settings: ModelSettings = {
        defaultModel: undefined,
        customModels: [],
      };

      // When: getCursorAgentModelCandidates を呼び出す
      const result = getCursorAgentModelCandidates(settings);

      // Then: ビルトインモデルが含まれる
      assert.ok(result.includes('composer-1'), 'Should include composer-1');
      assert.ok(result.includes('auto'), 'Should include auto');
      assert.ok(result.includes('sonnet-4.5'), 'Should include sonnet-4.5');
      assert.ok(result.includes('gpt-5.2'), 'Should include gpt-5.2');
      assert.strictEqual(result[0], 'composer-1', 'composer-1 should be first');
    });

    // TC-CURSOR-N-02: customModels が auto を含む場合は重複しない
    test('TC-CURSOR-N-02: customModels が auto を含む場合は重複しない', () => {
      // Given: customModels に auto が含まれる設定
      const settings: ModelSettings = {
        defaultModel: undefined,
        customModels: ['auto', 'model-a'],
      };

      // When: getCursorAgentModelCandidates を呼び出す
      const result = getCursorAgentModelCandidates(settings);

      // Then: auto は1回だけ含まれる
      const autoCount = result.filter((m) => m === 'auto').length;
      assert.strictEqual(autoCount, 1, 'auto should appear exactly once');
      // model-a は追加されている
      assert.ok(result.includes('model-a'), 'Should include model-a');
    });

    // TC-CURSOR-N-03: defaultModel がビルトインに無い場合は追加される
    test('TC-CURSOR-N-03: defaultModel がビルトインに無い場合は追加される', () => {
      // Given: defaultModel にビルトイン外のモデルを設定
      const settings: ModelSettings = {
        defaultModel: 'custom-model-x',
        customModels: [],
      };

      // When: getCursorAgentModelCandidates を呼び出す
      const result = getCursorAgentModelCandidates(settings);

      // Then: custom-model-x が追加されている
      assert.ok(result.includes('custom-model-x'), 'Should include custom-model-x');
    });
  });

  suite('getModelCandidatesForProvider', () => {
    // TC-PROVIDER-N-01: cursorAgent の場合は Cursor 用候補を返す
    test('TC-PROVIDER-N-01: cursorAgent の場合は Cursor 用候補を返す', () => {
      // Given: cursorAgent を指定
      const settings: ModelSettings = {
        defaultModel: 'model-x',
        customModels: ['model-y'],
      };

      // When: getModelCandidatesForProvider を呼び出す
      const result = getModelCandidatesForProvider('cursorAgent', settings);

      // Then: ビルトインモデルと model-x, model-y が含まれる
      assert.ok(result.includes('composer-1'), 'Should include composer-1');
      assert.ok(result.includes('auto'), 'Should include auto');
      assert.ok(result.includes('model-x'), 'Should include model-x');
      assert.ok(result.includes('model-y'), 'Should include model-y');
    });

    // TC-PROVIDER-N-02: claudeCode の場合は Claude 用候補を返す
    test('TC-PROVIDER-N-02: claudeCode の場合は Claude 用候補を返す', () => {
      // Given: claudeCode を指定
      const settings: ModelSettings = {
        defaultModel: 'model-x',
        customModels: ['model-y'],
      };

      // When: getModelCandidatesForProvider を呼び出す
      const result = getModelCandidatesForProvider('claudeCode', settings);

      // Then: Claude 用のモデルが返る（settings は無視される）
      assert.ok(result.includes('opus-4.5'), 'Should include opus-4.5');
      assert.ok(result.includes('sonnet-4.5'), 'Should include sonnet-4.5');
      assert.ok(result.includes('haiku-4.5'), 'Should include haiku-4.5');
      assert.ok(!result.includes('model-x'), 'Should not include model-x');
    });

    // TC-N-10: getModelCandidatesForProvider('claudeCode', settings) returns Claude models
    test('TC-N-10: getModelCandidatesForProvider(claudeCode) returns Claude model candidates', () => {
      // Given: claudeCode provider
      const settings: ModelSettings = {
        defaultModel: undefined,
        customModels: [],
      };

      // When: getModelCandidatesForProvider is called
      const result = getModelCandidatesForProvider('claudeCode', settings);

      // Then: Returns ['opus-4.5', 'sonnet-4.5', 'haiku-4.5']
      assert.deepStrictEqual(result, ['opus-4.5', 'sonnet-4.5', 'haiku-4.5']);
    });

    // TC-N-11: getModelCandidatesForProvider('cursorAgent', settings) returns Cursor Agent models
    test('TC-N-11: getModelCandidatesForProvider(cursorAgent) returns Cursor model candidates with builtins', () => {
      // Given: cursorAgent provider with settings
      const settings: ModelSettings = {
        defaultModel: undefined,
        customModels: [],
      };

      // When: getModelCandidatesForProvider is called
      const result = getModelCandidatesForProvider('cursorAgent', settings);

      // Then: Returns list containing CURSOR_AGENT_BUILTIN_MODELS base
      assert.ok(result.includes('composer-1'), 'Should include composer-1');
      assert.ok(result.includes('auto'), 'Should include auto');
    });
  });

  suite('getEffectiveDefaultModel', () => {
    // TC-N-12: getEffectiveDefaultModel('claudeCode', {defaultModel: 'opus-4.5', ...}) returns 'opus-4.5'
    test('TC-N-12: claudeCode with defaultModel in candidates returns that model', () => {
      // Given: claudeCode provider with defaultModel='opus-4.5' (in candidates)
      const settings: ModelSettings = {
        defaultModel: 'opus-4.5',
        customModels: [],
      };

      // When: getEffectiveDefaultModel is called
      const result = getEffectiveDefaultModel('claudeCode', settings);

      // Then: Returns 'opus-4.5' since it is in candidates
      assert.strictEqual(result, 'opus-4.5');
    });

    // TC-N-13: getEffectiveDefaultModel('claudeCode', {defaultModel: 'gpt-5.2', ...}) returns undefined
    test('TC-N-13: claudeCode with defaultModel NOT in candidates returns undefined', () => {
      // Given: claudeCode provider with defaultModel='gpt-5.2' (not in Claude candidates)
      const settings: ModelSettings = {
        defaultModel: 'gpt-5.2',
        customModels: [],
      };

      // When: getEffectiveDefaultModel is called
      const result = getEffectiveDefaultModel('claudeCode', settings);

      // Then: Returns undefined since 'gpt-5.2' is not in Claude candidates
      assert.strictEqual(result, undefined);
    });

    // TC-B-05: getEffectiveDefaultModel with settings.defaultModel=undefined returns undefined
    test('TC-B-05: defaultModel=undefined returns undefined', () => {
      // Given: claudeCode provider with no defaultModel set
      const settings: ModelSettings = {
        defaultModel: undefined,
        customModels: [],
      };

      // When: getEffectiveDefaultModel is called
      const result = getEffectiveDefaultModel('claudeCode', settings);

      // Then: Returns undefined
      assert.strictEqual(result, undefined);
    });

    // TC-B-06: getEffectiveDefaultModel with settings.defaultModel='' (empty string) returns undefined
    test('TC-B-06: defaultModel empty string returns undefined', () => {
      // Given: claudeCode provider with defaultModel=''
      const settings: ModelSettings = {
        defaultModel: '',
        customModels: [],
      };

      // When: getEffectiveDefaultModel is called
      const result = getEffectiveDefaultModel('claudeCode', settings);

      // Then: Returns undefined since empty string is not in candidates
      assert.strictEqual(result, undefined);
    });

    // TC-N-30: getClaudeCodeModelCandidates returns fixed list
    test('TC-N-30: getClaudeCodeModelCandidates returns fixed list [opus-4.5, sonnet-4.5, haiku-4.5]', () => {
      // Given: nothing
      // When: getClaudeCodeModelCandidates is called
      const result = getClaudeCodeModelCandidates();

      // Then: Returns ['opus-4.5', 'sonnet-4.5', 'haiku-4.5']
      assert.deepStrictEqual(result, ['opus-4.5', 'sonnet-4.5', 'haiku-4.5']);
    });

    // TC-N-31: getCursorAgentModelCandidates with defaultModel='custom-model' includes custom-model
    test('TC-N-31: getCursorAgentModelCandidates with custom defaultModel includes it', () => {
      // Given: cursorAgent provider with defaultModel='custom-model'
      const settings: ModelSettings = {
        defaultModel: 'custom-model',
        customModels: [],
      };

      // When: getCursorAgentModelCandidates is called
      const result = getCursorAgentModelCandidates(settings);

      // Then: 'custom-model' is included in the list
      assert.ok(result.includes('custom-model'), 'Should include custom-model');
    });
  });
});

