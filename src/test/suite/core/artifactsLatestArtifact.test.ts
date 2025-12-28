import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findLatestArtifact } from '../../../core/artifacts';

suite('core/artifacts.ts findLatestArtifact', () => {
  // Test Perspectives Table
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-ART-LATEST-N-01 | dir has multiple valid timestamped files | Equivalence – normal | Returns latest file path (descending by timestamp) | Covers extractTimestamp (valid) |
  // | TC-ART-LATEST-N-02 | dir is absolute path | Equivalence – normal | Returns latest file path in absolute dir | Covers resolveDirAbsolute absolute |
  // | TC-ART-LATEST-E-01 | dir does not exist | Error – exception | Returns undefined | readDirectory throws -> catch |
  // | TC-ART-LATEST-E-02 | files exist but timestamps are invalid | Error – format | Returns undefined | Covers extractTimestamp invalid length/pattern |

  const createTempWorkspaceRoot = async (): Promise<string> => {
    return fs.promises.mkdtemp(path.join(os.tmpdir(), 'dontforgetest-artifacts-'));
  };

  const touchFile = async (absolutePath: string): Promise<void> => {
    await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, '', 'utf8');
  };

  test('TC-ART-LATEST-N-01: returns latest artifact by timestamp', async () => {
    // Given: 一時workspaceRoot配下に、prefix一致の.mdファイルが複数存在する
    const workspaceRoot = await createTempWorkspaceRoot();
    const dir = 'reports';
    const prefix = 'test-perspectives_';
    const absDir = path.join(workspaceRoot, dir);

    const older = `${prefix}20250101_000000.md`;
    const newer = `${prefix}20251231_235959.md`;

    try {
      await touchFile(path.join(absDir, older));
      await touchFile(path.join(absDir, newer));

      // invalid timestamp (length mismatch)
      await touchFile(path.join(absDir, `${prefix}20251231_2359.md`));
      // invalid timestamp (pattern mismatch)
      await touchFile(path.join(absDir, `${prefix}20251231-235959.md`));
      // non-matching prefix / ext (filtered out before timestamp parse)
      await touchFile(path.join(absDir, `other_20251231_235959.md`));
      await touchFile(path.join(absDir, `${prefix}20251231_235959.txt`));
      // directory entry that looks like a .md file (should be ignored because it's not FileType.File)
      await fs.promises.mkdir(path.join(absDir, `${prefix}20240101_000000.md`), { recursive: true });

      // When: findLatestArtifact を呼び出す
      const result = await findLatestArtifact(workspaceRoot, dir, prefix);

      // Then: 最新ファイル（newer）が返る
      assert.strictEqual(result, path.join(absDir, newer));
    } finally {
      await fs.promises.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('TC-ART-LATEST-N-02: supports absolute dir path', async () => {
    // Given: dir に絶対パスを指定する
    const workspaceRoot = await createTempWorkspaceRoot();
    const prefix = 'test-execution_';
    const absDir = path.join(workspaceRoot, 'abs-reports');
    const newer = `${prefix}20251231_235959.md`;

    try {
      await touchFile(path.join(absDir, newer));

      // When: findLatestArtifact を呼び出す（dirは絶対パス）
      const result = await findLatestArtifact(workspaceRoot, absDir, prefix);

      // Then: 絶対パス配下のファイルが返る
      assert.strictEqual(result, path.join(absDir, newer));
    } finally {
      await fs.promises.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('TC-ART-LATEST-E-01: returns undefined when directory does not exist', async () => {
    // Given: 存在しないディレクトリ
    const workspaceRoot = await createTempWorkspaceRoot();
    const missingDir = 'missing-dir';

    try {
      // When: findLatestArtifact を呼び出す
      const result = await findLatestArtifact(workspaceRoot, missingDir, 'test-perspectives_');

      // Then: undefined が返る（readDirectory失敗は握りつぶす）
      assert.strictEqual(result, undefined);
    } finally {
      await fs.promises.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('TC-ART-LATEST-E-02: returns undefined when only invalid timestamp files exist', async () => {
    // Given: prefix一致の.mdはあるが、タイムスタンプ形式が不正
    const workspaceRoot = await createTempWorkspaceRoot();
    const dir = 'reports';
    const prefix = 'test-perspectives_';
    const absDir = path.join(workspaceRoot, dir);

    try {
      await touchFile(path.join(absDir, `${prefix}20251231_2359.md`)); // length mismatch
      await touchFile(path.join(absDir, `${prefix}20251231-235959.md`)); // pattern mismatch

      // When: findLatestArtifact を呼び出す
      const result = await findLatestArtifact(workspaceRoot, dir, prefix);

      // Then: 有効なtimestampが無いので undefined
      assert.strictEqual(result, undefined);
    } finally {
      await fs.promises.rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

