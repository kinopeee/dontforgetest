import * as assert from 'assert';
import * as vscode from 'vscode';

type L10nModule = typeof import('../../../core/l10n');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeRequire = require as (id: string) => unknown;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeRequireResolve = require.resolve as (id: string) => string;

const realFs = nodeRequire('fs') as typeof import('fs');
const realVscode = nodeRequire('vscode') as typeof import('vscode');

function isEnglishBundlePath(filePath: unknown): boolean {
  const raw = typeof filePath === 'string' ? filePath : String(filePath);
  const normalized = raw.replace(/\\/g, '/');
  // パス表現差（stage/実行環境）で末尾一致がずれるケースもあるため、部分一致も許容する
  return normalized.endsWith('/l10n/bundle.l10n.json') || normalized.includes('/l10n/bundle.l10n.json') || normalized.endsWith('bundle.l10n.json');
}

function loadFreshL10nModule(): L10nModule {
  const id = '../../../core/l10n';
  const resolved = nodeRequireResolve(id);
  // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
  delete require.cache[resolved];
  return nodeRequire(id) as L10nModule;
}

suite('core/l10n.ts fallback (deterministic branch coverage)', () => {
  const originalFsExistsSync = realFs.existsSync;
  const originalFsReadFileSync = realFs.readFileSync;
  const originalVscodeL10nT = realVscode.l10n.t;
  const originalConsoleWarn = console.warn;

  teardown(() => {
    (realFs as unknown as { existsSync: unknown }).existsSync = originalFsExistsSync as unknown;
    (realFs as unknown as { readFileSync: unknown }).readFileSync = originalFsReadFileSync as unknown;
    (realVscode.l10n as unknown as { t: unknown }).t = originalVscodeL10nT as unknown;
    console.warn = originalConsoleWarn;
  });

  test('TC-L10NF-N-01: translated != key returns translated and skips fallback loading', () => {
    // Given: vscode.l10n.t returns a translated string (not the raw key)
    const key = 'dummy.key';
    const translated = 'TRANSLATED';
    (realVscode.l10n as unknown as { t: unknown }).t = ((message: string) => {
      // ローカルテストの意図が崩れていないことだけ確認する（スタブ漏れ時に他テストを巻き込まないよう厳密一致は避ける）
      assert.ok(typeof message === 'string' && message.length > 0);
      return translated;
    }) as unknown;

    const mod = loadFreshL10nModule();

    // When: Calling t(key)
    const actual = mod.t(key);

    // Then: It returns the translated string
    assert.strictEqual(actual, translated);
  });

  test('TC-L10NF-N-02: missing translation uses EN fallback bundle value (no args)', () => {
    // Given: vscode.l10n.t returns the key (simulating missing translation)
    const key = 'fallback.key';
    const fallbackValue = 'Hello';
    (realVscode.l10n as unknown as { t: unknown }).t = ((message: string) => message) as unknown;

    // And: EN bundle exists and contains the key (only intercept the bundle path; delegate for other reads)
    (realFs as unknown as { existsSync: unknown }).existsSync = ((filePath: unknown) => {
      if (isEnglishBundlePath(filePath)) {
        return true;
      }
      return originalFsExistsSync(filePath as never);
    }) as unknown;
    (realFs as unknown as { readFileSync: unknown }).readFileSync = ((filePath: unknown, ...rest: unknown[]) => {
      if (isEnglishBundlePath(filePath)) {
        return JSON.stringify({ [key]: fallbackValue });
      }
      return (originalFsReadFileSync as unknown as (p: unknown, ...args: unknown[]) => unknown)(filePath, ...rest);
    }) as unknown;

    const mod = loadFreshL10nModule();

    // When: Calling t(key) with no args
    const actual = mod.t(key);

    // Then: It returns the EN fallback value
    assert.strictEqual(actual, fallbackValue);
  });

  test('TC-L10NF-B-01: empty named args returns fallback string without extra placeholder resolution call', () => {
    // Given: Missing translation (translated==key) and an EN fallback template
    const key = 'named.empty.key';
    const fallbackTemplate = 'Hello {name}';

    const calls: Array<{ message: string; args: unknown[] }> = [];
    (realVscode.l10n as unknown as { t: unknown }).t = ((message: string, ...args: unknown[]) => {
      calls.push({ message, args });
      return message; // return raw key/fallback unchanged
    }) as unknown;

    (realFs as unknown as { existsSync: unknown }).existsSync = ((filePath: unknown) => {
      if (isEnglishBundlePath(filePath)) {
        return true;
      }
      return originalFsExistsSync(filePath as never);
    }) as unknown;
    (realFs as unknown as { readFileSync: unknown }).readFileSync = ((filePath: unknown, ...rest: unknown[]) => {
      if (isEnglishBundlePath(filePath)) {
        return JSON.stringify({ [key]: fallbackTemplate });
      }
      return (originalFsReadFileSync as unknown as (p: unknown, ...args: unknown[]) => unknown)(filePath, ...rest);
    }) as unknown;

    const mod = loadFreshL10nModule();

    // When: Calling t(key, {}) (named args empty)
    const actual = mod.t(key, {});

    // Then: It returns the fallback template as-is and does not call vscode.l10n.t twice
    assert.strictEqual(actual, fallbackTemplate);
    assert.strictEqual(calls.length, 1, 'Expected only the initial translation call (no placeholder resolution when named args is empty)');
    assert.strictEqual(calls[0]?.message, key);
  });

  test('TC-L10NF-N-03: non-empty named args triggers placeholder resolution via vscode.l10n.t(fallback, named)', () => {
    // Given: Missing translation and an EN fallback template with placeholder
    const key = 'named.key';
    const fallbackTemplate = 'Hello {name}';
    const named = { name: 'Alice' };

    const calls: Array<{ message: string; args: unknown[] }> = [];
    (realVscode.l10n as unknown as { t: unknown }).t = ((message: string, ...args: unknown[]) => {
      calls.push({ message, args });
      if (message === key) {
        return key; // simulate missing translation
      }
      // simulate placeholder resolution for the fallback template
      const n = args[0] as { name?: unknown };
      return message.replace('{name}', String(n?.name ?? ''));
    }) as unknown;

    (realFs as unknown as { existsSync: unknown }).existsSync = ((filePath: unknown) => {
      if (isEnglishBundlePath(filePath)) {
        return true;
      }
      return originalFsExistsSync(filePath as never);
    }) as unknown;
    (realFs as unknown as { readFileSync: unknown }).readFileSync = ((filePath: unknown, ...rest: unknown[]) => {
      if (isEnglishBundlePath(filePath)) {
        return JSON.stringify({ [key]: fallbackTemplate });
      }
      return (originalFsReadFileSync as unknown as (p: unknown, ...args: unknown[]) => unknown)(filePath, ...rest);
    }) as unknown;

    const mod = loadFreshL10nModule();

    // When: Calling t(key, {name:"Alice"})
    const actual = mod.t(key, named);

    // Then: It resolves the placeholder via the second vscode.l10n.t call
    assert.strictEqual(actual, 'Hello Alice');
    assert.strictEqual(calls.length, 2, 'Expected translation call + fallback placeholder resolution call');
    assert.strictEqual(calls[0]?.message, key);
    assert.strictEqual(calls[1]?.message, fallbackTemplate);
  });

  test('TC-L10NF-E-01: EN fallback bundle read failure is caught and t() returns the key (no throw)', () => {
    // Given: Missing translation (translated==key)
    const key = 'read.error.key';
    (realVscode.l10n as unknown as { t: unknown }).t = ((message: string) => message) as unknown;

    // And: EN bundle exists but read fails (only for the bundle path)
    (realFs as unknown as { existsSync: unknown }).existsSync = ((filePath: unknown) => {
      if (isEnglishBundlePath(filePath)) {
        return true;
      }
      return originalFsExistsSync(filePath as never);
    }) as unknown;
    let bundleReadHit = 0;
    let bundleReadPath: string | undefined;
    (realFs as unknown as { readFileSync: unknown }).readFileSync = ((filePath: unknown, ...rest: unknown[]) => {
      if (isEnglishBundlePath(filePath)) {
        bundleReadHit += 1;
        bundleReadPath = typeof filePath === 'string' ? filePath : String(filePath);
        throw new Error('read failed');
      }
      return (originalFsReadFileSync as unknown as (p: unknown, ...args: unknown[]) => unknown)(filePath, ...rest);
    }) as unknown;

    const mod = loadFreshL10nModule();

    // When: Calling t(key)
    const actual = mod.t(key);

    // Then: It returns key and logs a warning
    assert.strictEqual(actual, key);
    assert.strictEqual(bundleReadHit, 1, `Expected bundle read to be attempted exactly once (path=${bundleReadPath ?? 'unknown'})`);
  });

  test('TC-L10NF-E-02: EN bundle missing (existsSync=false) returns key and does not crash', () => {
    // Given: Missing translation
    const key = 'missing.bundle.key';
    (realVscode.l10n as unknown as { t: unknown }).t = ((message: string) => message) as unknown;

    // And: EN bundle does not exist (only for the bundle path)
    (realFs as unknown as { existsSync: unknown }).existsSync = ((filePath: unknown) => {
      if (isEnglishBundlePath(filePath)) {
        return false;
      }
      return originalFsExistsSync(filePath as never);
    }) as unknown;
    (realFs as unknown as { readFileSync: unknown }).readFileSync = ((filePath: unknown, ...rest: unknown[]) => {
      if (isEnglishBundlePath(filePath)) {
        throw new Error('readFileSync should not be called when bundle does not exist');
      }
      return (originalFsReadFileSync as unknown as (p: unknown, ...args: unknown[]) => unknown)(filePath, ...rest);
    }) as unknown;

    const mod = loadFreshL10nModule();

    // When: Calling t(key)
    const actual = mod.t(key);

    // Then: It returns the key (raw fallback)
    assert.strictEqual(actual, key);
  });

  test('TC-L10NF-B-02: non-object bundle JSON (array) is treated as empty bundle and returns key', () => {
    // Given: Missing translation and bundle content that parses to an array (invalid structure)
    const key = 'array.bundle.key';
    (realVscode.l10n as unknown as { t: unknown }).t = ((message: string) => message) as unknown;
    (realFs as unknown as { existsSync: unknown }).existsSync = ((filePath: unknown) => {
      if (isEnglishBundlePath(filePath)) {
        return true;
      }
      return originalFsExistsSync(filePath as never);
    }) as unknown;
    (realFs as unknown as { readFileSync: unknown }).readFileSync = ((filePath: unknown, ...rest: unknown[]) => {
      if (isEnglishBundlePath(filePath)) {
        return JSON.stringify([{ k: 'v' }]);
      }
      return (originalFsReadFileSync as unknown as (p: unknown, ...args: unknown[]) => unknown)(filePath, ...rest);
    }) as unknown;

    const mod = loadFreshL10nModule();

    // When: Calling t(key)
    const actual = mod.t(key);

    // Then: It falls back to returning the key
    assert.strictEqual(actual, key);
  });

  test('TC-L10NF-LOC-01: getArtifactLocale matches runtime vscode.env.language', () => {
    // Given: runtime language (not overridden; avoid brittle mutation of vscode.env)
    const lang = vscode.env.language ?? '';
    const expected = lang.startsWith('ja') ? 'ja' : 'en';
    const mod = loadFreshL10nModule();

    // When: Calling getArtifactLocale()
    const actual = mod.getArtifactLocale();

    // Then: It returns the expected locale label
    assert.strictEqual(actual, expected);
  });
});

