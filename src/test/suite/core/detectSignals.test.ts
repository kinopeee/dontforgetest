import * as assert from 'assert';
import { __test__ } from '../../../core/detectSignals';

const { isTsjsPackageJsonSignal } = __test__;

suite('detectSignals Test Suite', () => {
  // Case ID: DS-N-01
  test('isTsjsPackageJsonSignal: devDependencies.typescript -> true', () => {
    // Given: package.json に devDependencies.typescript が含まれている
    const pkg = {
      devDependencies: {
        typescript: '^5.0.0',
      },
    };
    // When: isTsjsPackageJsonSignal を呼び出す
    const result = isTsjsPackageJsonSignal(pkg);
    // Then: true が返される
    assert.strictEqual(result, true);
  });

  // Case ID: DS-N-02
  test('isTsjsPackageJsonSignal: scripts.test="vitest --run" -> true', () => {
    // Given: package.json に scripts.test="vitest --run" が含まれている
    const pkg = {
      scripts: {
        test: 'vitest --run',
      },
    };
    // When: isTsjsPackageJsonSignal を呼び出す
    const result = isTsjsPackageJsonSignal(pkg);
    // Then: true が返される
    assert.strictEqual(result, true);
  });

  // Case ID: DS-N-03
  test('isTsjsPackageJsonSignal: types="index.d.ts" のみ -> true', () => {
    // Given: package.json に types フィールドのみが存在する
    const pkg = {
      types: 'index.d.ts',
    };
    // When: isTsjsPackageJsonSignal を呼び出す
    const result = isTsjsPackageJsonSignal(pkg);
    // Then: true が返される
    assert.strictEqual(result, true);
  });

  // Case ID: DS-N-04
  test('isTsjsPackageJsonSignal: typings フィールドのみ -> true', () => {
    // Given: package.json に typings フィールドのみが存在する
    const pkg = {
      typings: 'index.d.ts',
    };
    // When: isTsjsPackageJsonSignal を呼び出す
    const result = isTsjsPackageJsonSignal(pkg);
    // Then: true が返される
    assert.strictEqual(result, true);
  });

  // Case ID: DS-N-05
  test('isTsjsPackageJsonSignal: dependencies.@types/node -> true', () => {
    // Given: package.json に dependencies.@types/node が含まれている
    const pkg = {
      dependencies: {
        '@types/node': '^20.0.0',
      },
    };
    // When: isTsjsPackageJsonSignal を呼び出す
    const result = isTsjsPackageJsonSignal(pkg);
    // Then: true が返される
    assert.strictEqual(result, true);
  });

  // Case ID: DS-N-06
  test('isTsjsPackageJsonSignal: peerDependencies.vite -> true', () => {
    // Given: package.json に peerDependencies.vite が含まれている
    const pkg = {
      peerDependencies: {
        vite: '^5.0.0',
      },
    };
    // When: isTsjsPackageJsonSignal を呼び出す
    const result = isTsjsPackageJsonSignal(pkg);
    // Then: true が返される
    assert.strictEqual(result, true);
  });

  // Case ID: DS-N-07
  test('isTsjsPackageJsonSignal: scripts に tsc が含まれる -> true', () => {
    // Given: package.json に scripts.build="tsc" が含まれている
    const pkg = {
      scripts: {
        build: 'tsc',
      },
    };
    // When: isTsjsPackageJsonSignal を呼び出す
    const result = isTsjsPackageJsonSignal(pkg);
    // Then: true が返される
    assert.strictEqual(result, true);
  });

  // Case ID: DS-E-01
  test('isTsjsPackageJsonSignal: 依存/スクリプト空 -> false', () => {
    // Given: package.json に TS/JS シグナルが一切含まれていない
    const pkg = {
      name: 'my-package',
      version: '1.0.0',
    };
    // When: isTsjsPackageJsonSignal を呼び出す
    const result = isTsjsPackageJsonSignal(pkg);
    // Then: false が返される
    assert.strictEqual(result, false);
  });

  // Case ID: DS-E-02
  test('isTsjsPackageJsonSignal: scripts が空オブジェクト -> false', () => {
    // Given: package.json に空の scripts のみが存在する
    const pkg = {
      scripts: {},
    };
    // When: isTsjsPackageJsonSignal を呼び出す
    const result = isTsjsPackageJsonSignal(pkg);
    // Then: false が返される
    assert.strictEqual(result, false);
  });

  // Case ID: DS-B-01
  test('isTsjsPackageJsonSignal: JSON が想定外形（null）-> false', () => {
    // Given: null が渡される
    // When: isTsjsPackageJsonSignal を呼び出す
    const result = isTsjsPackageJsonSignal(null);
    // Then: false が返される
    assert.strictEqual(result, false);
  });

  // Case ID: DS-B-02
  test('isTsjsPackageJsonSignal: JSON が想定外形（配列）-> false', () => {
    // Given: 配列が渡される
    // When: isTsjsPackageJsonSignal を呼び出す
    const result = isTsjsPackageJsonSignal([]);
    // Then: false が返される
    assert.strictEqual(result, false);
  });

  // Case ID: DS-B-03
  test('isTsjsPackageJsonSignal: JSON が想定外形（文字列）-> false', () => {
    // Given: 文字列が渡される
    // When: isTsjsPackageJsonSignal を呼び出す
    const result = isTsjsPackageJsonSignal('not an object');
    // Then: false が返される
    assert.strictEqual(result, false);
  });

  // Case ID: DS-B-04
  test('isTsjsPackageJsonSignal: scripts="prejest" -> false（境界判定）', () => {
    // Given: package.json に scripts.test="prejest" が含まれている（jest は単語境界でマッチしない）
    const pkg = {
      scripts: {
        test: 'prejest',
      },
    };
    // When: isTsjsPackageJsonSignal を呼び出す
    const result = isTsjsPackageJsonSignal(pkg);
    // Then: false が返される（単語境界でマッチしないため）
    assert.strictEqual(result, false);
  });

  // Case ID: DS-N-08
  test('isTsjsPackageJsonSignal: scripts に "jest" が単語として含まれる -> true', () => {
    // Given: package.json に scripts.test="jest --coverage" が含まれている
    const pkg = {
      scripts: {
        test: 'jest --coverage',
      },
    };
    // When: isTsjsPackageJsonSignal を呼び出す
    const result = isTsjsPackageJsonSignal(pkg);
    // Then: true が返される
    assert.strictEqual(result, true);
  });

  // Case ID: DS-N-09
  test('isTsjsPackageJsonSignal: dependencies の大文字小文字を正規化 -> true', () => {
    // Given: package.json に dependencies.TypeScript（大文字小文字混在）が含まれている
    const pkg = {
      dependencies: {
        TypeScript: '^5.0.0',
      },
    };
    // When: isTsjsPackageJsonSignal を呼び出す
    const result = isTsjsPackageJsonSignal(pkg);
    // Then: true が返される（小文字化して比較するため）
    assert.strictEqual(result, true);
  });

  // Case ID: DS-N-10
  test('isTsjsPackageJsonSignal: scripts の大文字小文字を無視 -> true', () => {
    // Given: package.json に scripts.test="JEST"（大文字）が含まれている
    const pkg = {
      scripts: {
        test: 'JEST',
      },
    };
    // When: isTsjsPackageJsonSignal を呼び出す
    const result = isTsjsPackageJsonSignal(pkg);
    // Then: true が返される（大文字小文字を無視するため）
    assert.strictEqual(result, true);
  });
});
