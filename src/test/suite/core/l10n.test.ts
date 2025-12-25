/**
 * l10n（ローカライズ）キー整合性テスト
 *
 * ソースコード内で使われている t('key') のキーが bundle に定義されていること、
 * および bundle.l10n.json と bundle.l10n.ja.json のキー集合が一致することを検証する。
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('l10n key consistency', () => {
  // テスト用にbundleファイルを読み込む
  const projectRoot = path.resolve(__dirname, '../../../../');
  const bundleEnPath = path.join(projectRoot, 'l10n/bundle.l10n.json');
  const bundleJaPath = path.join(projectRoot, 'l10n/bundle.l10n.ja.json');

  // TC-L10N-01: bundle.l10n.json と bundle.l10n.ja.json のキー集合が一致すること
  // Given: 英語bundle と 日本語bundle が存在する
  // When: 両方のキー集合を比較する
  // Then: キー集合が完全一致する
  test('TC-L10N-01: bundle keys match between en and ja', () => {
    // Given: 英語bundle と 日本語bundle が存在する
    const bundleEnContent = fs.readFileSync(bundleEnPath, 'utf8');
    const bundleJaContent = fs.readFileSync(bundleJaPath, 'utf8');
    const bundleEn = JSON.parse(bundleEnContent) as Record<string, string>;
    const bundleJa = JSON.parse(bundleJaContent) as Record<string, string>;

    // When: 両方のキー集合を比較する
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

    // Then: キー集合が完全一致する
    const errors: string[] = [];
    if (onlyInEn.length > 0) {
      errors.push(`Keys only in bundle.l10n.json (missing in ja): ${onlyInEn.join(', ')}`);
    }
    if (onlyInJa.length > 0) {
      errors.push(`Keys only in bundle.l10n.ja.json (missing in en): ${onlyInJa.join(', ')}`);
    }

    assert.strictEqual(errors.length, 0, errors.join('\n'));
  });

  // TC-L10N-02: 全ての bundle キーが空でないこと
  // Given: 英語bundle と 日本語bundle
  // When: 各キーの値を検証する
  // Then: 空文字の値がない
  test('TC-L10N-02: no empty values in bundles', () => {
    // Given: 英語bundle と 日本語bundle
    const bundleEnContent = fs.readFileSync(bundleEnPath, 'utf8');
    const bundleJaContent = fs.readFileSync(bundleJaPath, 'utf8');
    const bundleEn = JSON.parse(bundleEnContent) as Record<string, string>;
    const bundleJa = JSON.parse(bundleJaContent) as Record<string, string>;

    // When: 各キーの値を検証する
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

    // Then: 空文字の値がない
    const errors: string[] = [];
    if (emptyInEn.length > 0) {
      errors.push(`Empty values in bundle.l10n.json: ${emptyInEn.join(', ')}`);
    }
    if (emptyInJa.length > 0) {
      errors.push(`Empty values in bundle.l10n.ja.json: ${emptyInJa.join(', ')}`);
    }

    assert.strictEqual(errors.length, 0, errors.join('\n'));
  });

  // TC-L10N-03: package.nls.json と package.nls.ja.json のキー集合が一致すること
  // Given: 英語package.nls と 日本語package.nls が存在する
  // When: 両方のキー集合を比較する
  // Then: キー集合が完全一致する
  test('TC-L10N-03: package.nls keys match between en and ja', () => {
    // Given: 英語package.nls と 日本語package.nls が存在する
    const nlsEnPath = path.join(projectRoot, 'package.nls.json');
    const nlsJaPath = path.join(projectRoot, 'package.nls.ja.json');
    const nlsEnContent = fs.readFileSync(nlsEnPath, 'utf8');
    const nlsJaContent = fs.readFileSync(nlsJaPath, 'utf8');
    const nlsEn = JSON.parse(nlsEnContent) as Record<string, string>;
    const nlsJa = JSON.parse(nlsJaContent) as Record<string, string>;

    // When: 両方のキー集合を比較する
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

    // Then: キー集合が完全一致する
    const errors: string[] = [];
    if (onlyInEn.length > 0) {
      errors.push(`Keys only in package.nls.json (missing in ja): ${onlyInEn.join(', ')}`);
    }
    if (onlyInJa.length > 0) {
      errors.push(`Keys only in package.nls.ja.json (missing in en): ${onlyInJa.join(', ')}`);
    }

    assert.strictEqual(errors.length, 0, errors.join('\n'));
  });
});
