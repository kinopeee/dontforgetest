import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

type ValidationError = { kind: string; field: string };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const raw = readJsonText(filePath);
  const parsed = JSON.parse(raw) as unknown;
  assert.ok(isPlainRecord(parsed), `Expected JSON object at ${filePath}`);
  return parsed;
}

function readPackageJson(workspaceRoot: string): Record<string, unknown> {
  return readJsonObject(path.join(workspaceRoot, 'package.json'));
}

function readPackageLockJson(workspaceRoot: string): Record<string, unknown> {
  return readJsonObject(path.join(workspaceRoot, 'package-lock.json'));
}

function parseSemverParts(version: string): { major: string; minor: string; patch: string } | null {
  // NOTE: Keep this strict (MAJOR.MINOR.PATCH) for this test suite.
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!m) {
    return null;
  }
  return { major: m[1], minor: m[2], patch: m[3] };
}

function parsePatch(version: string): number {
  const parts = parseSemverParts(version);
  if (!parts) {
    throw new Error(`InvalidSemver: ${version}`);
  }
  const patchBig = BigInt(parts.patch);
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  if (patchBig > maxSafe) {
    throw new RangeError(`UnsafeInteger: patch=${parts.patch}`);
  }
  return Number(patchBig);
}

function validateVersion(version: string): { ok: true } | { ok: false; errors: ValidationError[] } {
  const parts = parseSemverParts(version);
  if (!parts) {
    return { ok: false, errors: [{ kind: 'InvalidSemver', field: 'version' }] };
  }
  const patchBig = BigInt(parts.patch);
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  if (patchBig > maxSafe) {
    return { ok: false, errors: [{ kind: 'UnsafeInteger', field: 'version' }] };
  }
  return { ok: true };
}

function validateManifest(pkg: Record<string, unknown>): { ok: true } | { ok: false; errors: ValidationError[] } {
  const version = pkg.version;
  const field = 'package.json:version';
  if (version === undefined) {
    return { ok: false, errors: [{ kind: 'MissingVersion', field }] };
  }
  if (version === null) {
    return { ok: false, errors: [{ kind: 'NullVersion', field }] };
  }
  if (typeof version !== 'string') {
    return { ok: false, errors: [{ kind: 'InvalidType', field }] };
  }
  if (version === '') {
    return { ok: false, errors: [{ kind: 'Empty', field }] };
  }
  if (version.trim() === '') {
    return { ok: false, errors: [{ kind: 'Whitespace', field }] };
  }
  const v = validateVersion(version);
  if (!v.ok) {
    return { ok: false, errors: v.errors.map((e) => ({ ...e, field })) };
  }
  return { ok: true };
}

function validateLockstep(
  pkg: Record<string, unknown>,
  lock: Record<string, unknown>,
): { ok: true } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  const pkgVersion = pkg.version;
  const lockVersion = lock.version;
  if (typeof pkgVersion !== 'string') {
    errors.push({ kind: 'InvalidManifest', field: 'package.json:version' });
  }
  if (typeof lockVersion !== 'string') {
    errors.push({ kind: 'InvalidLockfile', field: 'package-lock.json:version' });
  }
  if (typeof pkgVersion === 'string' && typeof lockVersion === 'string' && pkgVersion !== lockVersion) {
    errors.push({ kind: 'VersionMismatch', field: 'package.json:version' });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function validateLockfile(lock: Record<string, unknown>): { ok: true } | { ok: false; errors: ValidationError[] } {
  const lockVersion = lock.version;
  const packages = isPlainRecord(lock.packages) ? lock.packages : undefined;
  const rootPackage = packages && isPlainRecord(packages['']) ? (packages[''] as Record<string, unknown>) : undefined;
  const rootPackageVersion = rootPackage?.version;

  const errors: ValidationError[] = [];
  if (typeof lockVersion !== 'string') {
    errors.push({ kind: 'InvalidLockfile', field: 'package-lock.json:version' });
  }
  if (typeof rootPackageVersion !== 'string') {
    errors.push({ kind: 'InvalidLockfile', field: 'package-lock.json:packages[""].version' });
  }
  if (typeof lockVersion === 'string' && typeof rootPackageVersion === 'string' && lockVersion !== rootPackageVersion) {
    errors.push({ kind: 'LockfileVersionMismatch', field: 'package-lock.json' });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

suite('package.json / package-lock.json version checks', () => {
  // NOTE:
  // - __dirname points to out/test/suite at runtime (compiled JS is executed).
  // - package.json / package-lock.json live at repo root, so go up 3 levels.
  const workspaceRoot = path.resolve(__dirname, '../../..');

  // TC-N-01
  test("TC-N-01: package.json root.version is '0.0.119'", () => {
    // Given: package.json exists at workspace root
    const pkg = readPackageJson(workspaceRoot);

    // When: Reading root.version
    const version = pkg.version;

    // Then: It equals the expected version string
    assert.strictEqual(version, '0.0.119');
  });

  // TC-N-02
  test("TC-N-02: package-lock.json root.version is '0.0.119'", () => {
    // Given: package-lock.json exists at workspace root
    const lock = readPackageLockJson(workspaceRoot);

    // When: Reading root.version
    const version = lock.version;

    // Then: It equals the expected version string
    assert.strictEqual(version, '0.0.119');
  });

  // TC-N-03
  test("TC-N-03: package-lock.json packages[''].version is '0.0.119'", () => {
    // Given: package-lock.json contains packages[''] entry
    const lock = readPackageLockJson(workspaceRoot);
    const packages = isPlainRecord(lock.packages) ? lock.packages : undefined;
    const rootPkg = packages && isPlainRecord(packages['']) ? (packages[''] as Record<string, unknown>) : undefined;

    // When: Reading packages[''].version
    const version = rootPkg?.version;

    // Then: It equals the expected version string
    assert.strictEqual(version, '0.0.119');
  });

  // TC-N-04
  test('TC-N-04: package.json version / package-lock.json root.version / packages[""].version are identical', () => {
    // Given: Both manifest and lockfile exist
    const pkg = readPackageJson(workspaceRoot);
    const lock = readPackageLockJson(workspaceRoot);
    const packages = isPlainRecord(lock.packages) ? lock.packages : undefined;
    const rootPkg = packages && isPlainRecord(packages['']) ? (packages[''] as Record<string, unknown>) : undefined;

    // When: Reading all three version fields
    const pkgVersion = pkg.version;
    const lockVersion = lock.version;
    const rootPkgVersion = rootPkg?.version;

    // Then: All versions match exactly
    assert.strictEqual(pkgVersion, lockVersion);
    assert.strictEqual(pkgVersion, rootPkgVersion);
  });

  // TC-N-05
  test("TC-N-05: package.json ends with a trailing newline ('\\n')", () => {
    // Given: package.json path at workspace root
    const pkgJsonPath = path.join(workspaceRoot, 'package.json');

    // When: Reading raw file text
    const text = readJsonText(pkgJsonPath);

    // Then: It ends with '\n'
    assert.strictEqual(text.endsWith('\n'), true);
  });

  // TC-B-01
  test("TC-B-01: parsePatch/validateVersion accept '0.0.0' (patch=0)", () => {
    // Given: version with patch=0
    const version = '0.0.0';

    // When: Parsing patch and validating version
    const patch = parsePatch(version);
    const result = validateVersion(version);

    // Then: patch=0 and validation ok
    assert.strictEqual(patch, 0);
    assert.strictEqual(result.ok, true);
  });

  // TC-B-02
  test("TC-B-02: parsePatch/validateVersion accept '0.0.1' (patch=1)", () => {
    // Given: version with patch=1
    const version = '0.0.1';

    // When: Parsing patch and validating version
    const patch = parsePatch(version);
    const result = validateVersion(version);

    // Then: patch=1 and validation ok
    assert.strictEqual(patch, 1);
    assert.strictEqual(result.ok, true);
  });

  // TC-B-03
  test("TC-B-03: parsePatch/validateVersion accept '0.0.9007199254740991' (MAX_SAFE_INTEGER)", () => {
    // Given: version with patch=Number.MAX_SAFE_INTEGER
    const version = '0.0.9007199254740991';

    // When: Parsing patch and validating version
    const patch = parsePatch(version);
    const result = validateVersion(version);

    // Then: patch equals MAX_SAFE_INTEGER and validation ok
    assert.strictEqual(patch, 9007199254740991);
    assert.strictEqual(result.ok, true);
  });

  // TC-E-01
  test('TC-E-01: validateManifest fails when package.json version is undefined (missing)', () => {
    // Given: a manifest object with missing version
    const pkg = readPackageJson(workspaceRoot);
    const testPkg = { ...pkg };
    delete testPkg.version;

    // When: validateManifest is called
    const result = validateManifest(testPkg);

    // Then: ok=false and it reports an error for package.json:version
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.field === 'package.json:version'));
  });

  // TC-E-02
  test('TC-E-02: validateManifest fails when package.json version is null', () => {
    // Given: a manifest object with null version
    const pkg = readPackageJson(workspaceRoot);
    const testPkg = { ...pkg, version: null };

    // When: validateManifest is called
    const result = validateManifest(testPkg);

    // Then: ok=false and it reports an error for package.json:version
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.field === 'package.json:version'));
  });

  // TC-E-03
  test("TC-E-03: validateManifest fails when package.json version is '' (empty)", () => {
    // Given: a manifest object with empty string version
    const pkg = readPackageJson(workspaceRoot);
    const testPkg = { ...pkg, version: '' };

    // When: validateManifest is called
    const result = validateManifest(testPkg);

    // Then: ok=false and it reports an error for package.json:version
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.field === 'package.json:version'));
  });

  // TC-E-04
  test("TC-E-04: validateManifest fails when package.json version is ' ' (whitespace)", () => {
    // Given: a manifest object with whitespace-only version
    const pkg = readPackageJson(workspaceRoot);
    const testPkg = { ...pkg, version: ' ' };

    // When: validateManifest is called
    const result = validateManifest(testPkg);

    // Then: ok=false and it reports an error for package.json:version
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.field === 'package.json:version'));
  });

  // TC-E-05
  test("TC-E-05: validateVersion fails for invalid semver '0.0'", () => {
    // Given: an invalid semver string
    const version = '0.0';

    // When: validateVersion is called
    const result = validateVersion(version);

    // Then: ok=false and it reports InvalidSemver
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.kind === 'InvalidSemver'));
  });

  // TC-E-06
  test("TC-E-06: validateLockstep fails when package.json version and package-lock.json root.version mismatch", () => {
    // Given: a manifest and lockfile that disagree on version
    const pkg = readPackageJson(workspaceRoot);
    const lock = readPackageLockJson(workspaceRoot);
    const testLock = { ...lock, version: '0.0.118' };

    // When: validateLockstep is called
    const result = validateLockstep(pkg, testLock);

    // Then: ok=false and it reports VersionMismatch for package.json:version
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.kind === 'VersionMismatch' && e.field === 'package.json:version'));
  });

  // TC-E-07
  test("TC-E-07: validateLockfile fails when package-lock.json root.version and packages[''].version mismatch", () => {
    // Given: a lockfile whose packages[''].version differs from the root version
    const lock = readPackageLockJson(workspaceRoot);
    const lockVersion = lock.version;
    assert.strictEqual(typeof lockVersion, 'string');

    const packages = isPlainRecord(lock.packages) ? lock.packages : {};
    const rootPkg = (packages[''] as Record<string, unknown> | undefined) ?? {};
    const testLock: Record<string, unknown> = {
      ...lock,
      packages: {
        ...packages,
        '': {
          ...rootPkg,
          version: `${lockVersion}-mismatch`,
        },
      },
    };

    // When: validateLockfile is called
    const result = validateLockfile(testLock);

    // Then: ok=false and it reports LockfileVersionMismatch
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.kind === 'LockfileVersionMismatch'));
  });

  // TC-E-08
  test("TC-E-08: validateVersion fails for '0.0.-1' (min-1)", () => {
    // Given: an invalid semver string with negative patch
    const version = '0.0.-1';

    // When: validateVersion is called
    const result = validateVersion(version);

    // Then: ok=false and it reports InvalidSemver
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.kind === 'InvalidSemver'));
  });

  // TC-E-09
  test("TC-E-09: validateVersion fails for '0.0.9007199254740992' (max+1) with UnsafeInteger", () => {
    // Given: a semver whose patch is MAX_SAFE_INTEGER + 1
    const version = '0.0.9007199254740992';

    // When: validateVersion is called
    const result = validateVersion(version);

    // Then: ok=false and it reports UnsafeInteger
    assert.strictEqual(result.ok, false);
    assert.ok(result.errors.some((e) => e.kind === 'UnsafeInteger'));
  });
});
