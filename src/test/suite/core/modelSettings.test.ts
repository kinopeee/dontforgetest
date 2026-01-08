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
    test('TC-A-01: undefinedは空配列に正規化される', () => {
      // Given: input is undefined
      // When: normalizeModelList is called
      const result = normalizeModelList(undefined);
      // Then: Returns an empty array
      assert.deepStrictEqual(result, []);
    });

    test('TC-N-02: 値の正規化（trim/空除外/重複除去）', () => {
      // Given: string array with mixed whitespace, empty strings, duplicates, and non-string values
      const input: unknown = [' o3 ', '', '  ', 'o3', 123, null, 'claude-4-opus-thinking', 'claude-4-opus-thinking'];
      // When: normalizeModelList is called
      const result = normalizeModelList(input);
      // Then: Whitespace is trimmed, empty elements, non-strings, and duplicates are removed
      assert.deepStrictEqual(result, ['o3', 'claude-4-opus-thinking']);
    });

    test('TC-B-01: Empty array input', () => {
      // Given: input is an empty array
      // When: normalizeModelList is called
      const result = normalizeModelList([]);
      // Then: Returns an empty array
      assert.deepStrictEqual(result, []);
    });
  });

  suite('getModelCandidates', () => {
    test('TC-N-01: 候補モデルの生成（default優先、重複除去）', () => {
      // Given: defaultModel and customModels are set with duplicates
      const settings: ModelSettings = {
        defaultModel: 'claude-3.5-sonnet',
        customModels: ['o3', ' claude-3.5-sonnet ', 'claude-4-opus-thinking'],
      };
      // When: getModelCandidates is called
      const result = getModelCandidates(settings);
      // Then: defaultModel is first, followed by unique customModels
      assert.deepStrictEqual(result, ['claude-3.5-sonnet', 'o3', 'claude-4-opus-thinking']);
    });

    test('TC-N-02: defaultModel未設定の場合', () => {
      // Given: defaultModel is undefined, customModels has values
      const settings: ModelSettings = {
        defaultModel: undefined,
        customModels: [' o3 ', 'o3', ''],
      };
      // When: getModelCandidates is called
      const result = getModelCandidates(settings);
      // Then: Returns normalized customModels
      assert.deepStrictEqual(result, ['o3']);
    });
  });

  suite('getModelSettings (Integration)', () => {
    test('TC-N-02: User settings define dontforgetest.defaultModel', async () => {
      // Given: dontforgetest.defaultModel is configured in settings
      const config = vscode.workspace.getConfiguration('dontforgetest');
      await config.update('defaultModel', 'test-model-n02', vscode.ConfigurationTarget.Global);

      try {
        // When: getModelSettings is called
        const settings = getModelSettings();
        // Then: The configured value is returned
        assert.strictEqual(settings.defaultModel, 'test-model-n02');
      } finally {
        await config.update('defaultModel', undefined, vscode.ConfigurationTarget.Global);
      }
    });

    test('TC-B-02: User settings define ONLY old testgen-agent keys (Verify Isolation)', async () => {
      // Given: dontforgetest.defaultModel is unset
      const config = vscode.workspace.getConfiguration('dontforgetest');
      await config.update('defaultModel', undefined, vscode.ConfigurationTarget.Global);

      // When: getModelSettings is called
      const settings = getModelSettings();

      // Then: defaultModel remains undefined (ignoring legacy keys if any)
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
      // Given: A mocked configuration.update and an input with whitespace
      originalGetConfiguration = vscode.workspace.getConfiguration;
      const calls: Array<{ section: string; value: unknown; target: unknown }> = [];
      const configStub = {
        update: async (section: string, value: unknown, target: unknown) => {
          calls.push({ section, value, target });
        },
      } as unknown as vscode.WorkspaceConfiguration;

      vscode.workspace.getConfiguration = () => configStub;

      // When: setDefaultModel is called with a value containing whitespace
      await setDefaultModel('  model-a  ');

      // Then: update is called once with trimmed value
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0]?.section, 'defaultModel');
      assert.strictEqual(calls[0]?.value, 'model-a');
      assert.ok(
        calls[0]?.target === vscode.ConfigurationTarget.Workspace || calls[0]?.target === vscode.ConfigurationTarget.Global,
        'target should be Workspace or Global',
      );
    });

    test('TC-MODEL-SET-B-01: undefined clears defaultModel as empty string', async () => {
      // Given: A mocked configuration.update
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

      // Then: update is called with an empty string to clear the setting
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
      // Then: It should rethrow the error with the same message
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
      // Then: It should rethrow the TypeError with the same message
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
    test('TC-CLAUDE-N-01: Claude Code 用のモデル候補を返す', () => {
      // Given: No special setup needed
      // When: getClaudeCodeModelCandidates is called
      const result = getClaudeCodeModelCandidates();

      // Then: Returns the list of standard Claude models
      assert.ok(Array.isArray(result), 'Should return an array');
      assert.ok(result.includes('opus-4.5'), 'Should include opus-4.5');
      assert.ok(result.includes('sonnet-4.5'), 'Should include sonnet-4.5');
      assert.ok(result.includes('haiku-4.5'), 'Should include haiku-4.5');
      assert.strictEqual(result.length, 3, 'Should have exactly 3 candidates');
    });
  });

  suite('getCursorAgentModelCandidates', () => {
    test('TC-CURSOR-N-01: ビルトインモデルが含まれる', () => {
      // Given: customModels is empty
      const settings: ModelSettings = {
        defaultModel: undefined,
        customModels: [],
      };

      // When: getCursorAgentModelCandidates is called
      const result = getCursorAgentModelCandidates(settings);

      // Then: Includes builtin models like 'auto'
      assert.ok(result.includes('composer-1'), 'Should include composer-1');
      assert.ok(result.includes('auto'), 'Should include auto');
      assert.ok(result.includes('sonnet-4.5'), 'Should include sonnet-4.5');
      assert.ok(result.includes('gpt-5.2'), 'Should include gpt-5.2');
      assert.strictEqual(result[0], 'composer-1', 'composer-1 should be first');
    });

    test('TC-CURSOR-N-02: customModels が auto を含む場合は重複しない', () => {
      // Given: customModels already includes 'auto'
      const settings: ModelSettings = {
        defaultModel: undefined,
        customModels: ['auto', 'model-a'],
      };

      // When: getCursorAgentModelCandidates is called
      const result = getCursorAgentModelCandidates(settings);

      // Then: 'auto' only appears once
      const autoCount = result.filter((m) => m === 'auto').length;
      assert.strictEqual(autoCount, 1, 'auto should appear exactly once');
      assert.ok(result.includes('model-a'), 'Should include model-a');
    });

    test('TC-CURSOR-N-03: defaultModel がビルトインに無い場合は追加される', () => {
      // Given: defaultModel is not a builtin
      const settings: ModelSettings = {
        defaultModel: 'custom-model-x',
        customModels: [],
      };

      // When: getCursorAgentModelCandidates is called
      const result = getCursorAgentModelCandidates(settings);

      // Then: The custom defaultModel is added to candidates
      assert.ok(result.includes('custom-model-x'), 'Should include custom-model-x');
    });
  });

  suite('getModelCandidatesForProvider', () => {
    test('TC-PROVIDER-N-01: cursorAgent の場合は Cursor 用候補を返す', () => {
      // Given: provider is 'cursorAgent'
      const settings: ModelSettings = {
        defaultModel: 'model-x',
        customModels: ['model-y'],
      };

      // When: getModelCandidatesForProvider is called
      const result = getModelCandidatesForProvider('cursorAgent', settings);

      // Then: Includes both builtin and custom models
      assert.ok(result.includes('auto'), 'Should include auto');
      assert.ok(result.includes('model-x'), 'Should include model-x');
      assert.ok(result.includes('model-y'), 'Should include model-y');
    });

    test('TC-PROVIDER-N-02: claudeCode の場合は Claude 用候補を返す', () => {
      // Given: provider is 'claudeCode'
      const settings: ModelSettings = {
        defaultModel: 'model-x',
        customModels: ['model-y'],
      };

      // When: getModelCandidatesForProvider is called
      const result = getModelCandidatesForProvider('claudeCode', settings);

      // Then: Returns Claude models (ignoring custom models in settings for this provider)
      assert.ok(result.includes('opus-4.5'), 'Should include opus-4.5');
      assert.ok(result.includes('sonnet-4.5'), 'Should include sonnet-4.5');
      assert.ok(result.includes('haiku-4.5'), 'Should include haiku-4.5');
      assert.ok(!result.includes('model-x'), 'Should not include model-x');
    });

    test('TC-PROVIDER-N-03: codexCli の場合は Codex 用候補を返す', () => {
      // Given: provider is 'codexCli'
      const settings: ModelSettings = {
        defaultModel: 'gpt-5.2-codex',
        customModels: ['custom-codex'],
      };

      // When: getModelCandidatesForProvider is called
      const result = getModelCandidatesForProvider('codexCli', settings);

      // Then: Returns models suitable for Codex CLI
      assert.ok(result.includes('gpt-5.2-codex'), 'Should include gpt-5.2-codex');
      assert.ok(result.includes('custom-codex'), 'Should include custom-codex');
    });

    test('MS-N-10: geminiCli の場合は Gemini 用候補を返す', () => {
      // Given: provider is 'geminiCli'
      const settings: ModelSettings = {
        defaultModel: 'gemini-3-flash-preview',
        customModels: ['custom-gemini'],
      };

      // When: getModelCandidatesForProvider is called
      const result = getModelCandidatesForProvider('geminiCli', settings);

      // Then: Returns models suitable for Gemini CLI
      assert.ok(result.includes('gemini-3-flash-preview'), 'Should include gemini-3-flash-preview');
      assert.ok(result.includes('custom-gemini'), 'Should include custom-gemini');
    });

    test('TC-N-10: getModelCandidatesForProvider(claudeCode) returns Claude model candidates', () => {
      // Given: provider is 'claudeCode' with empty settings
      const settings: ModelSettings = {
        defaultModel: undefined,
        customModels: [],
      };

      // When: getModelCandidatesForProvider is called
      const result = getModelCandidatesForProvider('claudeCode', settings);

      // Then: Returns exact list of Claude models
      assert.deepStrictEqual(result, ['opus-4.5', 'sonnet-4.5', 'haiku-4.5']);
    });

    test('TC-N-11: getModelCandidatesForProvider(cursorAgent) returns Cursor model candidates with builtins', () => {
      // Given: provider is 'cursorAgent' with empty settings
      const settings: ModelSettings = {
        defaultModel: undefined,
        customModels: [],
      };

      // When: getModelCandidatesForProvider is called
      const result = getModelCandidatesForProvider('cursorAgent', settings);

      // Then: Includes builtin models like 'auto'
      assert.ok(result.includes('auto'), 'Should include auto');
    });
  });

  suite('getEffectiveDefaultModel', () => {
    test('TC-N-12: claudeCode with defaultModel in candidates returns that model', () => {
      // Given: defaultModel is 'opus-4.5' which is a Claude candidate
      const settings: ModelSettings = {
        defaultModel: 'opus-4.5',
        customModels: [],
      };

      // When: getEffectiveDefaultModel is called
      const result = getEffectiveDefaultModel('claudeCode', settings);

      // Then: Returns 'opus-4.5'
      assert.strictEqual(result, 'opus-4.5');
    });

    test('TC-N-13: claudeCode with defaultModel NOT in candidates returns undefined', () => {
      // Given: defaultModel is 'gpt-5.2' which is NOT a Claude candidate
      const settings: ModelSettings = {
        defaultModel: 'gpt-5.2',
        customModels: [],
      };

      // When: getEffectiveDefaultModel is called
      const result = getEffectiveDefaultModel('claudeCode', settings);

      // Then: Returns undefined
      assert.strictEqual(result, undefined);
    });

    test('TC-N-15: codexCli with defaultModel in candidates returns that model', () => {
      // Given: defaultModel is 'gpt-5.2-codex' which is a Codex candidate
      const settings: ModelSettings = {
        defaultModel: 'gpt-5.2-codex',
        customModels: [],
      };

      // When: getEffectiveDefaultModel is called
      const result = getEffectiveDefaultModel('codexCli', settings);

      // Then: Returns 'gpt-5.2-codex'
      assert.strictEqual(result, 'gpt-5.2-codex');
    });

    test('TC-B-05: defaultModel=undefined returns undefined', () => {
      // Given: defaultModel is undefined
      const settings: ModelSettings = {
        defaultModel: undefined,
        customModels: [],
      };

      // When: getEffectiveDefaultModel is called
      const result = getEffectiveDefaultModel('claudeCode', settings);

      // Then: Returns undefined
      assert.strictEqual(result, undefined);
    });

    test('TC-B-06: defaultModel empty string returns undefined', () => {
      // Given: defaultModel is an empty string
      const settings: ModelSettings = {
        defaultModel: '',
        customModels: [],
      };

      // When: getEffectiveDefaultModel is called
      const result = getEffectiveDefaultModel('claudeCode', settings);

      // Then: Returns undefined
      assert.strictEqual(result, undefined);
    });

    test('TC-N-31: getCursorAgentModelCandidates with custom defaultModel includes it', () => {
      // Given: cursorAgent with a custom defaultModel
      const settings: ModelSettings = {
        defaultModel: 'custom-model',
        customModels: [],
      };

      // When: getCursorAgentModelCandidates is called
      const result = getCursorAgentModelCandidates(settings);

      // Then: Includes the custom model
      assert.ok(result.includes('custom-model'), 'Should include custom-model');
    });

    test('TC-B-07: defaultModel whitespace-only returns undefined', () => {
      // Given: defaultModel is whitespace only
      const settings: ModelSettings = {
        defaultModel: '   ',
        customModels: [],
      };

      // When: getEffectiveDefaultModel is called
      const result = getEffectiveDefaultModel('claudeCode', settings);

      // Then: Returns undefined
      assert.strictEqual(result, undefined);
    });

    test('TC-N-14: cursorAgent with customModels model as defaultModel returns that model', () => {
      // Given: defaultModel is one of the customModels
      const settings: ModelSettings = {
        defaultModel: 'my-custom-model',
        customModels: ['my-custom-model'],
      };

      // When: getEffectiveDefaultModel is called
      const result = getEffectiveDefaultModel('cursorAgent', settings);

      // Then: Returns the custom model
      assert.strictEqual(result, 'my-custom-model');
    });

    test('TC-N-16: geminiCli with defaultModel in candidates returns that model', () => {
      // Given: defaultModel is 'gemini-3-flash-preview' which is a Gemini candidate
      const settings: ModelSettings = {
        defaultModel: 'gemini-3-flash-preview',
        customModels: [],
      };

      // When: getEffectiveDefaultModel is called
      const result = getEffectiveDefaultModel('geminiCli', settings);

      // Then: Returns 'gemini-3-flash-preview'
      assert.strictEqual(result, 'gemini-3-flash-preview');
    });
  });

  suite('getGeminiCliModelCandidates', () => {
    test('MS-N-11: Gemini CLI 用のビルトインモデルが含まれる', () => {
      // Given: customModels is empty
      const settings: ModelSettings = {
        defaultModel: undefined,
        customModels: [],
      };

      // When: getModelCandidatesForProvider('geminiCli', settings) is called
      const result = getModelCandidatesForProvider('geminiCli', settings);
      // Then: Includes Gemini builtin models
      assert.ok(result.includes('gemini-3-pro-preview'), 'Should include gemini-3-pro-preview');
      assert.ok(result.includes('gemini-3-flash-preview'), 'Should include gemini-3-flash-preview');
    });

    test('MS-N-13: defaultModel がビルトインに無い場合は追加される', () => {
      // Given: defaultModel is not a Gemini builtin
      const settings: ModelSettings = {
        defaultModel: 'custom-gemini-x',
        customModels: [],
      };

      // When: getModelCandidatesForProvider('geminiCli', settings) is called
      const result = getModelCandidatesForProvider('geminiCli', settings);
      // Then: Includes the custom defaultModel
      assert.ok(result.includes('custom-gemini-x'), 'Should include custom-gemini-x');
    });
  });

  suite('getCodexCliModelCandidates', () => {
    test('MS-N-12: Codex CLI 用のビルトインモデルが含まれる', () => {
      // Given: customModels is empty
      const settings: ModelSettings = {
        defaultModel: undefined,
        customModels: [],
      };

      // When: getModelCandidatesForProvider('codexCli', settings) is called
      const result = getModelCandidatesForProvider('codexCli', settings);
      // Then: Includes Codex builtin models
      assert.ok(result.includes('gpt-5.2-codex'), 'Should include gpt-5.2-codex');
      assert.ok(result.includes('gpt-5.1-codex-max'), 'Should include gpt-5.1-codex-max');
    });

    test('MS-N-14: defaultModel がビルトインに無い場合は追加される', () => {
      // Given: defaultModel is not a Codex builtin
      const settings: ModelSettings = {
        defaultModel: 'custom-codex-x',
        customModels: [],
      };

      // When: getModelCandidatesForProvider('codexCli', settings) is called
      const result = getModelCandidatesForProvider('codexCli', settings);
      // Then: Includes the custom defaultModel
      assert.ok(result.includes('custom-codex-x'), 'Should include custom-codex-x');
    });
  });
});
