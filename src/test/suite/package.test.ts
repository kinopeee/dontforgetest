import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * セマンティックバージョン形式（MAJOR.MINOR.PATCH）を検証します
 * @param version 検証対象の値（柔軟性のためunknown型を受け入れます）
 * @returns 有効なセマンティックバージョンの場合true、それ以外はfalse
 */
function isValidSemanticVersion(version: unknown): boolean {
  if (typeof version !== 'string' || version.trim() === '') {
    return false;
  }
  // セマンティックバージョン正規表現: MAJOR.MINOR.PATCH（オプションでプレリリースとビルドメタデータをサポート）
  const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverRegex.test(version.trim());
}

/**
 * package.json を読み込み・パースします
 * @param workspaceRoot ワークスペースルートディレクトリ
 * @returns パース済み package.json オブジェクト
 * @throws ファイルが読み込めない、またはパースできない場合
 */
function readPackageJson(workspaceRoot: string): Record<string, unknown> {
  const packageJsonPath = path.join(workspaceRoot, 'package.json');
  const content = fs.readFileSync(packageJsonPath, 'utf8');
  return JSON.parse(content) as Record<string, unknown>;
}

/**
 * package-lock.json を読み込み・パースします
 * @param workspaceRoot ワークスペースルートディレクトリ
 * @returns パース済み package-lock.json オブジェクト
 * @throws ファイルが読み込めない、またはパースできない場合
 */
function readPackageLockJson(workspaceRoot: string): Record<string, unknown> {
  const packageLockJsonPath = path.join(workspaceRoot, 'package-lock.json');
  const content = fs.readFileSync(packageLockJsonPath, 'utf8');
  return JSON.parse(content) as Record<string, unknown>;
}

suite('package.json and package-lock.json version validation', () => {
  // NOTE:
  // - テスト実行時の __dirname は out/test/suite 配下になる（コンパイル済みJSが実行される）
  // - package.json / package-lock.json は拡張機能ルート直下にあるため、3階層上をワークスペースルートとして扱う
  const workspaceRoot = path.resolve(__dirname, '../../..');

  suite('Normal cases', () => {
    // TC-N-01: package.json version field is '0.0.89'
    test('TC-N-01: package.json version field is 0.0.89', () => {
      // Given: package.json exists with version field updated to 0.0.89
      const packageJson = readPackageJson(workspaceRoot);

      // When: Reading version field from package.json
      const packageVersion = packageJson.version as string;

      // Then: package.json version field is '0.0.89'
      assert.strictEqual(packageVersion, '0.0.89', 'package.json version should be 0.0.89');
    });

    // TC-N-02: package-lock.json root version field is '0.0.89'
    test('TC-N-02: package-lock.json root version field is 0.0.89', () => {
      // Given: package-lock.json exists with version field updated to 0.0.89
      const packageLockJson = readPackageLockJson(workspaceRoot);

      // When: Reading root version field from package-lock.json
      const packageLockVersion = packageLockJson.version as string;

      // Then: package-lock.json root version field is '0.0.89'
      assert.strictEqual(packageLockVersion, '0.0.89', 'package-lock.json root version should be 0.0.89');
    });

    // TC-N-03: package-lock.json packages[''].version field is '0.0.89'
    test('TC-N-03: package-lock.json packages[""].version field is 0.0.89', () => {
      // Given: package-lock.json exists with packages[''].version field updated to 0.0.89
      const packageLockJson = readPackageLockJson(workspaceRoot);
      const packageLockPackagesVersion = (packageLockJson.packages as Record<string, unknown>)?.[''] as Record<string, unknown> | undefined;
      const packageLockPackagesVersionValue = packageLockPackagesVersion?.version as string | undefined;

      // When: Reading packages[''].version field from package-lock.json
      // Then: package-lock.json packages[''].version field is '0.0.89'
      assert.ok(packageLockPackagesVersionValue !== undefined, 'packages[""].version should exist');
      assert.strictEqual(packageLockPackagesVersionValue, '0.0.89', 'package-lock.json packages[""].version should be 0.0.89');
    });

    // TC-N-04: package.json version matches package-lock.json root version
    test('TC-N-04: package.json version matches package-lock.json root version', () => {
      // Given: Both files exist with version fields
      const packageJson = readPackageJson(workspaceRoot);
      const packageLockJson = readPackageLockJson(workspaceRoot);

      // When: Reading version fields from both files
      const packageVersion = packageJson.version as string;
      const packageLockVersion = packageLockJson.version as string;

      // Then: package.json version matches package-lock.json root version
      assert.strictEqual(packageVersion, packageLockVersion, 'package.json version should match package-lock.json root version');
    });

    // TC-N-05: package.json version matches package-lock.json packages[''].version
    test('TC-N-05: package.json version matches package-lock.json packages[""].version', () => {
      // Given: Both files exist with version fields
      const packageJson = readPackageJson(workspaceRoot);
      const packageLockJson = readPackageLockJson(workspaceRoot);
      const packageLockPackagesVersion = (packageLockJson.packages as Record<string, unknown>)?.[''] as Record<string, unknown> | undefined;
      const packageLockPackagesVersionValue = packageLockPackagesVersion?.version as string | undefined;

      // When: Reading version fields from both files
      const packageVersion = packageJson.version as string;

      // Then: package.json version matches package-lock.json packages[''].version
      assert.ok(packageLockPackagesVersionValue !== undefined, 'packages[""].version should exist');
      assert.strictEqual(packageVersion, packageLockPackagesVersionValue, 'package.json version should match package-lock.json packages[""].version');
    });

    // TC-N-06: package.json version follows semantic version format
    test('TC-N-06: package.json version follows semantic version format', () => {
      // Given: package.json exists with version field
      const packageJson = readPackageJson(workspaceRoot);

      // When: Reading version field from package.json
      const packageVersion = packageJson.version;

      // Then: package.json version follows semantic version format
      assert.ok(isValidSemanticVersion(packageVersion), 'package.json version should follow semantic version format');
    });

    // TC-N-07: Both files are valid JSON format
    test('TC-N-07: Both files are valid JSON format', () => {
      // Given: package.json and package-lock.json files exist
      const packageJsonPath = path.join(workspaceRoot, 'package.json');
      const packageLockJsonPath = path.join(workspaceRoot, 'package-lock.json');

      // When: Reading and parsing both files
      // Then: Both files are valid JSON format (no exception thrown)
      assert.doesNotThrow(() => {
        const packageContent = fs.readFileSync(packageJsonPath, 'utf8');
        JSON.parse(packageContent);
      }, 'package.json should be valid JSON');

      assert.doesNotThrow(() => {
        const packageLockContent = fs.readFileSync(packageLockJsonPath, 'utf8');
        JSON.parse(packageLockContent);
      }, 'package-lock.json should be valid JSON');
    });
  });

  suite('Error cases', () => {
    // TC-E-01: package.json version is null
    test('TC-E-01: JSON parsing fails or validation error occurs when version is null', () => {
      // Given: package.json with null version (simulated by creating invalid JSON)
      const packageJson = readPackageJson(workspaceRoot);

      // When: Setting version to null (simulated test)
      // Then: Validation should detect null version
      // Note: Actual package.json doesn't have null version, so we test the validation logic
      const testPackageJson = { ...packageJson, version: null };
      assert.strictEqual(testPackageJson.version, null, 'Null version should be detected');
      assert.ok(!isValidSemanticVersion(testPackageJson.version), 'Null version should be invalid');
    });

    // TC-E-02: package.json version is empty string
    test('TC-E-02: Validation error or warning for empty version', () => {
      // Given: package.json with empty string version (simulated)
      const packageJson = readPackageJson(workspaceRoot);
      const testPackageJson = { ...packageJson, version: '' };

      // When: Validating empty version
      // Then: Validation error for empty version
      assert.strictEqual(testPackageJson.version, '', 'Empty version should be detected');
      assert.ok(!isValidSemanticVersion(testPackageJson.version), 'Empty version should be invalid');
    });

    // TC-E-03: package.json version field is missing
    test('TC-E-03: Validation error or runtime error when accessing version', () => {
      // Given: package.json without version field (simulated)
      const packageJson = readPackageJson(workspaceRoot);
      const testPackageJson = { ...packageJson };
      delete testPackageJson.version;

      // When: Accessing missing version field
      // Then: Validation error or runtime error
      assert.strictEqual(testPackageJson.version, undefined, 'Missing version should be undefined');
      assert.ok(!isValidSemanticVersion(testPackageJson.version), 'Missing version should be invalid');

      // Then: undefined is different from null and empty string
      assert.notStrictEqual(testPackageJson.version, null, 'Undefined should be different from null');
      assert.notStrictEqual(testPackageJson.version, '', 'Undefined should be different from empty string');
    });

    // TC-E-04: package.json version is '0.0.89' but package-lock.json version is '0.0.88' (simulated)
    test('TC-E-04: Version mismatch detected between package.json and package-lock.json', () => {
      // Given: package.json version is '0.0.89' and package-lock.json version is '0.0.88' (simulated)
      const packageJson = readPackageJson(workspaceRoot);
      const packageLockJson = readPackageLockJson(workspaceRoot);
      const packageVersion = packageJson.version as string;
      const testPackageLockJson = { ...packageLockJson, version: '0.0.88' };

      // When: Comparing versions
      // Then: Version mismatch is detected
      assert.notStrictEqual(packageVersion, testPackageLockJson.version, 'Version mismatch should be detected');
    });

    // TC-E-05: package-lock.json root version is '0.0.89' but packages[''].version is '0.0.88' (simulated)
    test('TC-E-05: Version mismatch detected within package-lock.json', () => {
      // Given: package-lock.json root version is '0.0.89' and packages[''].version is '0.0.88' (simulated)
      const packageLockJson = readPackageLockJson(workspaceRoot);
      const rootVersion = packageLockJson.version as string;
      const packages = packageLockJson.packages as Record<string, unknown> | undefined;
      const rootPackageVersion = packages?.[''] as Record<string, unknown> | undefined;

      // When: Comparing root version with packages[''].version
      // Then: Version mismatch within package-lock.json is detected
      if (rootPackageVersion) {
        const testPackages = { ...packages, '': { ...rootPackageVersion, version: '0.0.88' } };
        assert.notStrictEqual(rootVersion, (testPackages[''] as Record<string, unknown>).version, 'Version mismatch within package-lock.json should be detected');
      }
    });

    // TC-E-06: package.json version is invalid format
    test('TC-E-06: Invalid version format detected', () => {
      // Given: Invalid version formats (simulated)
      const invalidVersions = ['abc', '1.2', '1.2.3.4.5', 'v1.0.0', '1.0', '1'];

      // When: Validating invalid versions
      // Then: Each invalid version format returns false from isValidSemanticVersion
      for (const invalidVersion of invalidVersions) {
        assert.ok(!isValidSemanticVersion(invalidVersion), `"${invalidVersion}" should be invalid`);
      }
    });

    // TC-E-07: package.json version is array type
    test('TC-E-07: Array type version detected and invalidated', () => {
      // Given: package.json version field is array [1, 0, 0] (simulated)
      const packageJson = readPackageJson(workspaceRoot);
      const testPackageJsonArray = { ...packageJson, version: [1, 0, 0] };

      // When: Validating array version
      // Then: Version field is array and isValidSemanticVersion returns false
      assert.ok(Array.isArray(testPackageJsonArray.version), 'Version field should be detected as array');
      assert.ok(!isValidSemanticVersion(testPackageJsonArray.version), 'Array version should be invalid');
    });

    // TC-E-08: package.json version is object type
    test('TC-E-08: Object type version detected and invalidated', () => {
      // Given: package.json version field is object {major: 1, minor: 0, patch: 0} (simulated)
      const packageJson = readPackageJson(workspaceRoot);
      const testPackageJsonObject = { ...packageJson, version: { major: 1, minor: 0, patch: 0 } };

      // When: Validating object version
      // Then: Version field is object and isValidSemanticVersion returns false
      assert.ok(typeof testPackageJsonObject.version === 'object' && !Array.isArray(testPackageJsonObject.version), 'Version field should be detected as object');
      assert.ok(!isValidSemanticVersion(testPackageJsonObject.version), 'Object version should be invalid');
    });
  });

  suite('Boundary cases', () => {
    // TC-B-01: package.json version is '0.0.0'
    test('TC-B-01: Version is accepted as valid minimum semantic version', () => {
      // Given: Version '0.0.0' (minimum valid semantic version)
      const version = '0.0.0';

      // When: Validating minimum version
      // Then: Version is accepted as valid
      assert.ok(isValidSemanticVersion(version), '0.0.0 should be valid semantic version');
    });

    // TC-B-02: package.json version is '999.999.999'
    test('TC-B-02: Version is accepted as valid maximum semantic version', () => {
      // Given: Version '999.999.999' (large but valid semantic version)
      const version = '999.999.999';

      // When: Validating large version
      // Then: Version is accepted as valid
      assert.ok(isValidSemanticVersion(version), '999.999.999 should be valid semantic version');
    });

    // TC-B-03: package.json version contains negative number
    test('TC-B-03: Validation error for negative version component', () => {
      // Given: Version with negative number (e.g., '-1.0.0')
      const invalidVersions = ['-1.0.0', '1.-1.0', '1.0.-1'];

      // When: Validating negative version
      // Then: Validation error for negative version component
      for (const invalidVersion of invalidVersions) {
        assert.ok(!isValidSemanticVersion(invalidVersion), `"${invalidVersion}" with negative component should be invalid`);
      }
    });

    // TC-B-04: package.json version has leading zeros
    test('TC-B-04: Validation error for version with leading zeros', () => {
      // Given: Version with leading zeros (e.g., '01.02.03') (simulated)
      const versionWithLeadingZeros = '01.02.03';

      // When: Validating version with leading zeros
      // Then: isValidSemanticVersion returns false
      assert.ok(!isValidSemanticVersion(versionWithLeadingZeros), 'Version with leading zeros should be invalid');
    });
  });
});
