import * as assert from 'assert';
import * as vscode from 'vscode';

import { normalizeRunMode } from '../../../extension';

suite('src/extension.ts normalizeRunMode', () => {
  suiteSetup(async () => {
    // Given: The extension is installed and active
    const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
    assert.ok(ext, 'Extension not found');
    if (!ext.isActive) {
      await ext.activate();
    }
    assert.ok(ext.isActive, 'Extension should be active');
  });

  suite('normalizeRunMode unit tests', () => {
    test('EXT-B-NULL-01: normalizeRunMode(null) returns "full"', () => {
      // Given: value is null
      const value = null;

      // When: normalizeRunMode is called
      const result = normalizeRunMode(value);

      // Then: It normalizes to "full"
      assert.strictEqual(result, 'full');
    });

    test('EXT-B-UNDEF-01: normalizeRunMode(undefined) returns "full"', () => {
      // Given: value is undefined
      const value = undefined;

      // When: normalizeRunMode is called
      const result = normalizeRunMode(value);

      // Then: It normalizes to "full"
      assert.strictEqual(result, 'full');
    });

    test('EXT-N-PO-01: normalizeRunMode("perspectiveOnly") returns "perspectiveOnly"', () => {
      // Given: value is "perspectiveOnly"
      const value = 'perspectiveOnly';

      // When: normalizeRunMode is called
      const result = normalizeRunMode(value);

      // Then: It returns "perspectiveOnly"
      assert.strictEqual(result, 'perspectiveOnly');
    });

    test('EXT-N-FULL-01: normalizeRunMode("full") returns "full"', () => {
      // Given: value is "full" (already the default)
      const value = 'full';

      // When: normalizeRunMode is called
      const result = normalizeRunMode(value);

      // Then: It returns "full"
      assert.strictEqual(result, 'full');
    });

    test('EXT-B-OTHER-01: normalizeRunMode("FULL") returns "full" (case-sensitive)', () => {
      // Given: value is an unexpected string
      const value = 'FULL';

      // When: normalizeRunMode is called
      const result = normalizeRunMode(value);

      // Then: It normalizes to "full"
      assert.strictEqual(result, 'full');
    });
  });
});

