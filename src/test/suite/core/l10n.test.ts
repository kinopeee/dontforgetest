/**
 * l10n key consistency tests.
 *
 * Verifies:
 * - Keys used by t('key') exist in bundles
 * - Key sets match between bundle.l10n.json and bundle.l10n.ja.json
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { t } from '../../../core/l10n';

suite('l10n key consistency', () => {
  // Read bundle files for tests
  const projectRoot = path.resolve(__dirname, '../../../../');
  const bundleEnPath = path.join(projectRoot, 'l10n/bundle.l10n.json');
  const bundleJaPath = path.join(projectRoot, 'l10n/bundle.l10n.ja.json');

  function assertNonEmptyL10nValue(bundle: Record<string, unknown>, key: string): void {
    const value = bundle[key];
    assert.ok(typeof value === 'string' && value.trim().length > 0, `Expected non-empty value for ${key}`);
  }

  test('TC-L10N-N-01: bundle.l10n.json defines artifact.executionReport.envSource with non-empty value', () => {
    // Given: The English bundle file
    const bundleEn = JSON.parse(fs.readFileSync(bundleEnPath, 'utf8')) as Record<string, unknown>;

    // When: Looking up the key
    // Then: The value exists and is not empty/whitespace
    assertNonEmptyL10nValue(bundleEn, 'artifact.executionReport.envSource');
  });

  test('TC-L10N-N-02: bundle.l10n.json defines artifact.executionReport.envSource.execution with non-empty value', () => {
    // Given: The English bundle file
    const bundleEn = JSON.parse(fs.readFileSync(bundleEnPath, 'utf8')) as Record<string, unknown>;

    // When: Looking up the key
    // Then: The value exists and is not empty/whitespace
    assertNonEmptyL10nValue(bundleEn, 'artifact.executionReport.envSource.execution');
  });

  test('TC-L10N-N-03: bundle.l10n.json defines artifact.executionReport.envSource.local with non-empty value', () => {
    // Given: The English bundle file
    const bundleEn = JSON.parse(fs.readFileSync(bundleEnPath, 'utf8')) as Record<string, unknown>;

    // When: Looking up the key
    // Then: The value exists and is not empty/whitespace
    assertNonEmptyL10nValue(bundleEn, 'artifact.executionReport.envSource.local');
  });

  test('TC-L10N-N-04: bundle.l10n.json defines artifact.executionReport.envSource.unknown with non-empty value', () => {
    // Given: The English bundle file
    const bundleEn = JSON.parse(fs.readFileSync(bundleEnPath, 'utf8')) as Record<string, unknown>;

    // When: Looking up the key
    // Then: The value exists and is not empty/whitespace
    assertNonEmptyL10nValue(bundleEn, 'artifact.executionReport.envSource.unknown');
  });

  test('TC-L10N-N-05: bundle.l10n.json defines artifact.executionReport.unknown with non-empty value', () => {
    // Given: The English bundle file
    const bundleEn = JSON.parse(fs.readFileSync(bundleEnPath, 'utf8')) as Record<string, unknown>;

    // When: Looking up the key
    // Then: The value exists and is not empty/whitespace
    assertNonEmptyL10nValue(bundleEn, 'artifact.executionReport.unknown');
  });

  test('TC-L10N-N-06: bundle.l10n.ja.json defines artifact.executionReport.envSource with non-empty value', () => {
    // Given: The Japanese bundle file
    const bundleJa = JSON.parse(fs.readFileSync(bundleJaPath, 'utf8')) as Record<string, unknown>;

    // When: Looking up the key
    // Then: The value exists and is not empty/whitespace
    assertNonEmptyL10nValue(bundleJa, 'artifact.executionReport.envSource');
  });

  test('TC-L10N-N-07: bundle.l10n.ja.json defines artifact.executionReport.envSource.execution with non-empty value', () => {
    // Given: The Japanese bundle file
    const bundleJa = JSON.parse(fs.readFileSync(bundleJaPath, 'utf8')) as Record<string, unknown>;

    // When: Looking up the key
    // Then: The value exists and is not empty/whitespace
    assertNonEmptyL10nValue(bundleJa, 'artifact.executionReport.envSource.execution');
  });

  test('TC-L10N-N-08: bundle.l10n.ja.json defines artifact.executionReport.envSource.local with non-empty value', () => {
    // Given: The Japanese bundle file
    const bundleJa = JSON.parse(fs.readFileSync(bundleJaPath, 'utf8')) as Record<string, unknown>;

    // When: Looking up the key
    // Then: The value exists and is not empty/whitespace
    assertNonEmptyL10nValue(bundleJa, 'artifact.executionReport.envSource.local');
  });

  test('TC-L10N-N-09: bundle.l10n.ja.json defines artifact.executionReport.envSource.unknown with non-empty value', () => {
    // Given: The Japanese bundle file
    const bundleJa = JSON.parse(fs.readFileSync(bundleJaPath, 'utf8')) as Record<string, unknown>;

    // When: Looking up the key
    // Then: The value exists and is not empty/whitespace
    assertNonEmptyL10nValue(bundleJa, 'artifact.executionReport.envSource.unknown');
  });

  test('TC-L10N-N-10: bundle.l10n.ja.json defines artifact.executionReport.unknown with non-empty value', () => {
    // Given: The Japanese bundle file
    const bundleJa = JSON.parse(fs.readFileSync(bundleJaPath, 'utf8')) as Record<string, unknown>;

    // When: Looking up the key
    // Then: The value exists and is not empty/whitespace
    assertNonEmptyL10nValue(bundleJa, 'artifact.executionReport.unknown');
  });

  test('TC-L10N-N-11: bundle.l10n.json defines execution report runner/truncation keys with non-empty values', () => {
    // Given: The English bundle file
    const bundleEn = JSON.parse(fs.readFileSync(bundleEnPath, 'utf8')) as Record<string, unknown>;

    // When: Validating added keys
    const keys = [
      'artifact.executionReport.executionRunner',
      'artifact.executionReport.executionRunner.extension',
      'artifact.executionReport.executionRunner.cursorAgent',
      'artifact.executionReport.extensionVersion',
      'artifact.executionReport.testResultPath',
      'artifact.executionReport.truncation.stdout',
      'artifact.executionReport.truncation.stderr',
      'artifact.executionReport.truncation.capture',
      'artifact.executionReport.truncation.report',
      'artifact.executionReport.truncation.truncated',
      'artifact.executionReport.truncation.notTruncated',
    ];

    // Then: All values are non-empty
    for (const key of keys) {
      assertNonEmptyL10nValue(bundleEn, key);
    }
  });

  test('TC-L10N-N-12: bundle.l10n.ja.json defines execution report runner/truncation keys with non-empty values', () => {
    // Given: The Japanese bundle file
    const bundleJa = JSON.parse(fs.readFileSync(bundleJaPath, 'utf8')) as Record<string, unknown>;

    // When: Validating added keys
    const keys = [
      'artifact.executionReport.executionRunner',
      'artifact.executionReport.executionRunner.extension',
      'artifact.executionReport.executionRunner.cursorAgent',
      'artifact.executionReport.extensionVersion',
      'artifact.executionReport.testResultPath',
      'artifact.executionReport.truncation.stdout',
      'artifact.executionReport.truncation.stderr',
      'artifact.executionReport.truncation.capture',
      'artifact.executionReport.truncation.report',
      'artifact.executionReport.truncation.truncated',
      'artifact.executionReport.truncation.notTruncated',
    ];

    // Then: All values are non-empty
    for (const key of keys) {
      assertNonEmptyL10nValue(bundleJa, key);
    }
  });

  test('TC-L10N-EXEC-NEWKEYS-N-01: t("artifact.executionReport.executionRunner") returns a non-empty label and is not the raw key', () => {
    // Given: Added l10n key and both bundles on disk
    const key = 'artifact.executionReport.executionRunner';
    const bundleEn = JSON.parse(fs.readFileSync(bundleEnPath, 'utf8')) as Record<string, unknown>;
    const bundleJa = JSON.parse(fs.readFileSync(bundleJaPath, 'utf8')) as Record<string, unknown>;
    assertNonEmptyL10nValue(bundleEn, key);
    assertNonEmptyL10nValue(bundleJa, key);

    // When: Resolving the key via t()
    const actual = t(key);

    // Then: It is non-empty and not a raw-key fallback, and does not leak unresolved placeholders
    assert.ok(actual.trim().length > 0, 'Expected a non-empty localized label');
    assert.notStrictEqual(actual, key, 'Expected a localized label instead of raw key');
    assert.ok(actual === bundleEn[key] || actual === bundleJa[key], 'Expected t(key) to resolve to either en or ja bundle value');
    assert.ok(!actual.includes('{0}'), 'Expected no unresolved {0} placeholder');
    assert.ok(!actual.includes('${'), 'Expected no unresolved ${...} placeholder');
  });

  test('TC-L10N-EXEC-NEWKEYS-N-02: both en/ja bundles define a non-empty label for artifact.executionReport.executionRunner (no raw-key fallback)', () => {
    // Given: Added l10n key and both bundles on disk
    const key = 'artifact.executionReport.executionRunner';
    const bundleEn = JSON.parse(fs.readFileSync(bundleEnPath, 'utf8')) as Record<string, unknown>;
    const bundleJa = JSON.parse(fs.readFileSync(bundleJaPath, 'utf8')) as Record<string, unknown>;

    // When: Reading the bundle values directly
    const enValue = bundleEn[key];
    const jaValue = bundleJa[key];

    // Then: Both are non-empty and not equal to the raw key
    assert.ok(typeof enValue === 'string' && enValue.trim().length > 0, 'Expected non-empty en label');
    assert.ok(typeof jaValue === 'string' && jaValue.trim().length > 0, 'Expected non-empty ja label');
    assert.notStrictEqual(enValue, key, 'Expected en label to not equal the raw key');
    assert.notStrictEqual(jaValue, key, 'Expected ja label to not equal the raw key');
  });

  test('TC-L10N-EXEC-NEWKEYS-E-01: t(missing key) falls back to returning the key and differs from the new key label', () => {
    // Given: A missing key under the same namespace and the new key
    const missingKey = 'artifact.executionReport.executionRunner.__missing__';
    const existingKey = 'artifact.executionReport.executionRunner';

    // When: Resolving both
    const missingValue = t(missingKey);
    const existingValue = t(existingKey);

    // Then: Missing key falls back to the key itself, and it is distinguishable from the existing key value
    assert.strictEqual(missingValue, missingKey);
    assert.ok(existingValue.trim().length > 0);
    assert.notStrictEqual(existingValue, existingKey);
    assert.notStrictEqual(existingValue, missingValue);
  });

  test('TC-L10N-E-01: bundle.l10n.json and bundle.l10n.ja.json have identical key sets', () => {
    // Given: Both English and Japanese bundles exist
    const bundleEnContent = fs.readFileSync(bundleEnPath, 'utf8');
    const bundleJaContent = fs.readFileSync(bundleJaPath, 'utf8');
    const bundleEn = JSON.parse(bundleEnContent) as Record<string, string>;
    const bundleJa = JSON.parse(bundleJaContent) as Record<string, string>;

    // When: Comparing key sets
    const keysEn = new Set(Object.keys(bundleEn));
    const keysJa = new Set(Object.keys(bundleJa));

    const onlyInEn: string[] = [];
    const onlyInJa: string[] = [];

    for (const key of keysEn) {
      if (!keysJa.has(key)) {
        onlyInEn.push(key);
      }
    }

    for (const key of keysJa) {
      if (!keysEn.has(key)) {
        onlyInJa.push(key);
      }
    }

    // Then: Key sets match exactly
    const errors: string[] = [];
    if (onlyInEn.length > 0) {
      errors.push(`Keys only in bundle.l10n.json (missing in ja): ${onlyInEn.join(', ')}`);
    }
    if (onlyInJa.length > 0) {
      errors.push(`Keys only in bundle.l10n.ja.json (missing in en): ${onlyInJa.join(', ')}`);
    }

    assert.strictEqual(errors.length, 0, errors.join('\n'));
  });

  test('TC-L10N-E-02: t("artifact.executionReport.envSource.local") does not fall back to returning the key itself', () => {
    // Given: A required l10n key
    const key = 'artifact.executionReport.envSource.local';

    // When: Resolving it via t()
    const actual = t(key);

    // Then: It must not fall back to the raw key string (this would happen if the key was missing/typoed)
    assert.notStrictEqual(actual, key, 'Expected a localized value instead of raw key fallback');
    assert.ok(actual.trim().length > 0, 'Expected a non-empty localized label');
  });

  // TC-L10N-02
  test('TC-L10N-02: no empty values in bundles', () => {
    // Given: English and Japanese bundles
    const bundleEnContent = fs.readFileSync(bundleEnPath, 'utf8');
    const bundleJaContent = fs.readFileSync(bundleJaPath, 'utf8');
    const bundleEn = JSON.parse(bundleEnContent) as Record<string, string>;
    const bundleJa = JSON.parse(bundleJaContent) as Record<string, string>;

    // When: Validating each key's value
    const emptyInEn: string[] = [];
    const emptyInJa: string[] = [];

    for (const [key, value] of Object.entries(bundleEn)) {
      if (value.trim() === '') {
        emptyInEn.push(key);
      }
    }

    for (const [key, value] of Object.entries(bundleJa)) {
      if (value.trim() === '') {
        emptyInJa.push(key);
      }
    }

    // Then: No empty string values exist
    const errors: string[] = [];
    if (emptyInEn.length > 0) {
      errors.push(`Empty values in bundle.l10n.json: ${emptyInEn.join(', ')}`);
    }
    if (emptyInJa.length > 0) {
      errors.push(`Empty values in bundle.l10n.ja.json: ${emptyInJa.join(', ')}`);
    }

    assert.strictEqual(errors.length, 0, errors.join('\n'));
  });

  // TC-L10N-03
  test('TC-L10N-03: package.nls keys match between en and ja', () => {
    // Given: English and Japanese package.nls files exist
    const nlsEnPath = path.join(projectRoot, 'package.nls.json');
    const nlsJaPath = path.join(projectRoot, 'package.nls.ja.json');
    const nlsEnContent = fs.readFileSync(nlsEnPath, 'utf8');
    const nlsJaContent = fs.readFileSync(nlsJaPath, 'utf8');
    const nlsEn = JSON.parse(nlsEnContent) as Record<string, string>;
    const nlsJa = JSON.parse(nlsJaContent) as Record<string, string>;

    // When: Comparing key sets
    const keysEn = new Set(Object.keys(nlsEn));
    const keysJa = new Set(Object.keys(nlsJa));

    const onlyInEn: string[] = [];
    const onlyInJa: string[] = [];

    for (const key of keysEn) {
      if (!keysJa.has(key)) {
        onlyInEn.push(key);
      }
    }

    for (const key of keysJa) {
      if (!keysEn.has(key)) {
        onlyInJa.push(key);
      }
    }

    // Then: Key sets match exactly
    const errors: string[] = [];
    if (onlyInEn.length > 0) {
      errors.push(`Keys only in package.nls.json (missing in ja): ${onlyInEn.join(', ')}`);
    }
    if (onlyInJa.length > 0) {
      errors.push(`Keys only in package.nls.ja.json (missing in en): ${onlyInJa.join(', ')}`);
    }

    assert.strictEqual(errors.length, 0, errors.join('\n'));
  });

  // TC-L10N-04
  test('TC-L10N-04: t() returns expected localized string (with en fallback for default language)', () => {
    // Given: English and Japanese bundles
    const bundleEnContent = fs.readFileSync(bundleEnPath, 'utf8');
    const bundleJaContent = fs.readFileSync(bundleJaPath, 'utf8');
    const bundleEn = JSON.parse(bundleEnContent) as Record<string, string>;
    const bundleJa = JSON.parse(bundleJaContent) as Record<string, string>;

    const key = 'controlPanel.generateTests';
    const expected = (vscode.env.language ?? '').startsWith('ja') ? bundleJa[key] : bundleEn[key];
    assert.ok(typeof expected === 'string' && expected.trim() !== '', 'expected localized string exists in bundles');

    // When: Resolving a known key
    const actual = t(key);

    // Then: It matches the expected localized string
    assert.strictEqual(actual, expected);
  });

  // TC-L10N-05
  test('TC-L10N-05: t() returns key string for non-existent key', () => {
    // Given: A key that does not exist
    const key = 'nonexistent.key.that.does.not.exist';

    // When: Resolving a non-existent key
    const actual = t(key);

    // Then: The key is returned as-is
    assert.strictEqual(actual, key);
  });

  // TC-L10N-06
  test('TC-L10N-06: t() returns empty string for empty key', () => {
    // Given: An empty key (boundary)
    const key = '';

    // When: Resolving an empty key
    const actual = t(key);

    // Then: Empty string is returned
    assert.strictEqual(actual, '');
  });

  // TC-L10N-07
  test('TC-L10N-07: t() replaces placeholders with positional args', () => {
    // Given: English and Japanese bundles
    const bundleEnContent = fs.readFileSync(bundleEnPath, 'utf8');
    const bundleJaContent = fs.readFileSync(bundleJaPath, 'utf8');
    const bundleEn = JSON.parse(bundleEnContent) as Record<string, string>;
    const bundleJa = JSON.parse(bundleJaContent) as Record<string, string>;

    const key = 'testStrategy.fileNotFound';
    const arg0 = 'dummy-strategy.ts';
    const template = (vscode.env.language ?? '').startsWith('ja') ? bundleJa[key] : bundleEn[key];
    assert.ok(typeof template === 'string' && template.includes('{0}'), 'expected template string with {0} exists in bundles');
    const expected = vscode.l10n.t(template, arg0);

    // When: Resolving with positional args
    const actual = t(key, arg0);

    // Then: Placeholders are replaced
    assert.strictEqual(actual, expected);
  });
});
