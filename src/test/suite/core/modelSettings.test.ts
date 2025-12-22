import * as assert from 'assert';
import { getModelCandidates, normalizeModelList, type ModelSettings } from '../../../core/modelSettings';

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
});

