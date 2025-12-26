import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Validates semantic version format (MAJOR.MINOR.PATCH)
 * @param version Value to validate (accepts unknown type for flexibility)
 * @returns true if valid semantic version, false otherwise
 */
function isValidSemanticVersion(version: unknown): boolean {
  if (typeof version !== 'string' || version.trim() === '') {
    return false;
  }
  // Basic semantic version regex: MAJOR.MINOR.PATCH (with optional pre-release and build metadata)
  const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
  return semverRegex.test(version.trim());
}

/**
 * Reads and parses package.json
 * @param workspaceRoot Workspace root directory
 * @returns Parsed package.json object
 * @throws Error if file cannot be read or parsed
 */
function readPackageJson(workspaceRoot: string): Record<string, unknown> {
  const packageJsonPath = path.join(workspaceRoot, 'package.json');
  const content = fs.readFileSync(packageJsonPath, 'utf8');
  return JSON.parse(content) as Record<string, unknown>;
}

/**
 * Reads and parses package-lock.json
 * @param workspaceRoot Workspace root directory
 * @returns Parsed package-lock.json object
 * @throws Error if file cannot be read or parsed
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
    // TC-N-01: package.json and package-lock.json exist with valid version fields that are synchronized
    test('TC-N-01: Version is valid semantic version and synchronized between both files', () => {
      // Given: package.json and package-lock.json exist with version field
      const packageJson = readPackageJson(workspaceRoot);
      const packageLockJson = readPackageLockJson(workspaceRoot);

      // When: Reading version fields from both files
      const packageVersion = packageJson.version;
      const packageLockVersion = packageLockJson.version;

      // Then: Both versions are valid semantic versions
      assert.ok(
        isValidSemanticVersion(packageVersion),
        `package.json version "${packageVersion}" should be a valid semantic version`
      );
      assert.ok(
        isValidSemanticVersion(packageLockVersion),
        `package-lock.json version "${packageLockVersion}" should be a valid semantic version`
      );

      // Then: Versions are synchronized between both files
      assert.strictEqual(
        packageVersion,
        packageLockVersion,
        'package.json version should match package-lock.json version'
      );
    });

    // TC-N-02: Both files have valid JSON structure
    test('TC-N-02: JSON syntax is valid and parseable', () => {
      // Given: package.json and package-lock.json files exist
      const packageJsonPath = path.join(workspaceRoot, 'package.json');
      const packageLockJsonPath = path.join(workspaceRoot, 'package-lock.json');

      // When: Reading and parsing both files
      // Then: JSON syntax is valid and parseable (no exception thrown)
      assert.doesNotThrow(() => {
        const packageContent = fs.readFileSync(packageJsonPath, 'utf8');
        JSON.parse(packageContent);
      }, 'package.json should be valid JSON');

      assert.doesNotThrow(() => {
        const packageLockContent = fs.readFileSync(packageLockJsonPath, 'utf8');
        JSON.parse(packageLockContent);
      }, 'package-lock.json should be valid JSON');
    });

    // TC-N-03: package.json version field exists
    test('TC-N-03: package.json version matches package-lock.json version', () => {
      // Given: Both files exist with version fields
      const packageJson = readPackageJson(workspaceRoot);
      const packageLockJson = readPackageLockJson(workspaceRoot);

      // When: Reading version fields from both files
      const packageVersion = packageJson.version as string;
      const packageLockVersion = packageLockJson.version as string;
      const packageLockPackagesVersion = (packageLockJson.packages as Record<string, unknown>)?.[''] as Record<string, unknown> | undefined;
      const packageLockPackagesVersionValue = packageLockPackagesVersion?.version as string | undefined;

      // Then: Version synchronization between files
      assert.strictEqual(packageVersion, packageLockVersion, 'package.json version should match package-lock.json root version');
      if (packageLockPackagesVersionValue) {
        assert.strictEqual(packageVersion, packageLockPackagesVersionValue, 'package.json version should match package-lock.json packages[""].version');
      }
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
    });

    // TC-E-04: package.json version differs from package-lock.json version
    test('TC-E-04: Version mismatch detected or warning issued', () => {
      // Given: package.json and package-lock.json with different versions (simulated)
      const packageJson = readPackageJson(workspaceRoot);
      const packageLockJson = readPackageLockJson(workspaceRoot);
      const packageVersion = packageJson.version as string;
      const packageLockVersion = packageLockJson.version as string;

      // When: Comparing versions
      // Then: Version mismatch detected (in actual case, they should match)
      // This test verifies that the comparison logic works correctly
      assert.strictEqual(packageVersion, packageLockVersion, 'Versions should match in actual files');
      
      // Simulate mismatch scenario
      const testPackageLockJson = { ...packageLockJson, version: '0.0.83' };
      assert.notStrictEqual(packageVersion, testPackageLockJson.version, 'Mismatch should be detectable');
    });

    // TC-E-05: package.json version is invalid format (not semantic version)
    test('TC-E-05: Validation error for invalid version format', () => {
      // Given: Invalid version formats
      const invalidVersions = ['abc', '1.2', '1.2.3.4.5', 'v1.0.0', '1.0', '1'];

      // When: Validating invalid versions
      // Then: Validation error for invalid version format
      for (const invalidVersion of invalidVersions) {
        assert.ok(!isValidSemanticVersion(invalidVersion), `"${invalidVersion}" should be invalid`);
      }
    });

    // TC-E-06: package.json version is array or object type
    test('TC-E-06: Type error or validation error when version is array or object', () => {
      // Given: package.json with array or object version (simulated)
      const packageJson = readPackageJson(workspaceRoot);
      const testPackageJsonArray = { ...packageJson, version: [1, 0, 0] };
      const testPackageJsonObject = { ...packageJson, version: { major: 1, minor: 0, patch: 0 } };

      // When: Validating array/object version
      // Then: Type error or validation error
      assert.ok(Array.isArray(testPackageJsonArray.version), 'Array version should be detected');
      assert.ok(!isValidSemanticVersion(testPackageJsonArray.version), 'Array version should be invalid');
      
      assert.ok(typeof testPackageJsonObject.version === 'object' && !Array.isArray(testPackageJsonObject.version), 'Object version should be detected');
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
    test('TC-B-04: Validation error or normalization removes leading zeros', () => {
      // Given: Version with leading zeros (e.g., '01.02.03')
      const versionWithLeadingZeros = '01.02.03';

      // When: Validating version with leading zeros
      // Then: Validation error or normalization removes leading zeros
      // Note: Strict semantic versioning doesn't allow leading zeros, but some parsers normalize them
      // We test that our validator rejects them
      assert.ok(!isValidSemanticVersion(versionWithLeadingZeros), 'Version with leading zeros should be invalid');
    });

    // TC-B-05: package-lock.json root version differs from packages[''].version
    test('TC-B-05: Version mismatch detected within package-lock.json', () => {
      // Given: package-lock.json with version mismatch (simulated)
      const packageLockJson = readPackageLockJson(workspaceRoot);
      const rootVersion = packageLockJson.version as string;
      const packages = packageLockJson.packages as Record<string, unknown> | undefined;
      const rootPackageVersion = packages?.[''] as Record<string, unknown> | undefined;
      const rootPackageVersionValue = rootPackageVersion?.version as string | undefined;

      // When: Comparing root version with packages[''].version
      // Then: Version mismatch detected within package-lock.json (in actual case, they should match)
      if (rootPackageVersionValue) {
        assert.strictEqual(rootVersion, rootPackageVersionValue, 'Root version should match packages[""].version in actual files');
        
        // Simulate mismatch scenario
        const testPackages = { ...packages, '': { ...rootPackageVersion, version: '0.0.83' } };
        assert.notStrictEqual(rootVersion, (testPackages[''] as Record<string, unknown>).version, 'Mismatch should be detectable');
      }
    });

    // TC-B-06: package.json version is undefined (field removed)
    test('TC-B-06: Error accessing undefined version or validation failure', () => {
      // Given: package.json with undefined version (simulated)
      const packageJson = readPackageJson(workspaceRoot);
      const testPackageJson = { ...packageJson };
      delete testPackageJson.version;

      // When: Accessing undefined version
      // Then: Error accessing undefined version or validation failure
      assert.strictEqual(testPackageJson.version, undefined, 'Undefined version should be detected');
      assert.ok(!isValidSemanticVersion(testPackageJson.version), 'Undefined version should be invalid');
      
      // Verify undefined is different from null or empty string
      assert.notStrictEqual(testPackageJson.version, null, 'Undefined should be different from null');
      assert.notStrictEqual(testPackageJson.version, '', 'Undefined should be different from empty string');
    });
  });
});
