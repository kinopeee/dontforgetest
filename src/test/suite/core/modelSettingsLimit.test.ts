import * as assert from 'assert';
import {
  getModelCandidates,
  normalizeModelList,
  type ModelSettings,
} from '../../../core/modelSettings';

suite('core/modelSettingsLimit.ts', () => {
  suite('Large number of custom models', () => {
    test('TC-LIMIT-01: Can handle 1000 custom models', () => {
      // Given: 1000 unique model names
      const manyModels: string[] = [];
      for (let i = 0; i < 1000; i++) {
        manyModels.push(`custom-model-${i}`);
      }

      const settings: ModelSettings = {
        defaultModel: undefined,
        customModels: manyModels,
      };

      // When: getModelCandidates is called
      const startTime = performance.now();
      const result = getModelCandidates(settings);
      const endTime = performance.now();

      // Then: All models are preserved and processing is reasonably fast
      assert.strictEqual(result.length, 1000);
      assert.strictEqual(result[0], 'custom-model-0');
      assert.strictEqual(result[999], 'custom-model-999');
      
      // 簡易的なパフォーマンスチェック (100ms以内)
      assert.ok((endTime - startTime) < 100, `Processing took ${endTime - startTime}ms`);
    });

    test('TC-LIMIT-02: Deduplication with large input', () => {
      // Given: 2000 items where 1000 are duplicates
      const inputModels: string[] = [];
      for (let i = 0; i < 1000; i++) {
        inputModels.push(`model-${i}`);
        inputModels.push(`model-${i}`); // Duplicate
      }

      // When: normalizeModelList is called
      const startTime = performance.now();
      const result = normalizeModelList(inputModels);
      const endTime = performance.now();

      // Then: Only unique models remain
      assert.strictEqual(result.length, 1000);
      
      // Check performance
      assert.ok((endTime - startTime) < 100, `Deduplication took ${endTime - startTime}ms`);
    });
  });
});
