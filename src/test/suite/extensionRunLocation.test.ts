import * as assert from 'assert';
import * as vscode from 'vscode';
import * as generateFromCommitModule from '../../commands/generateFromCommit';
import * as generateFromCommitRangeModule from '../../commands/generateFromCommitRange';

suite('src/extension.ts normalizeRunLocation (command args)', () => {
  // Test Perspectives Table
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-EXT-RL-N-01 | args.runLocation="worktree" | Equivalence – normal | Command calls generator with options.runLocation="worktree" | Covers normalizeRunLocation worktree branch |
  // | TC-EXT-RL-B-01 | args.runLocation=undefined | Boundary – undefined | Command calls generator with options.runLocation="local" | Covers normalizeRunLocation default |
  // | TC-EXT-RL-E-01 | args.runLocation="invalid" | Error – invalid input | Command calls generator with options.runLocation="local" | Invalid is normalized to local |

  let originalGenerateFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
  let originalGenerateFromCommitRange: typeof generateFromCommitRangeModule.generateTestFromCommitRange;

  let latestCommitCalls: Array<{ runLocation?: unknown }> = [];
  let commitRangeCalls: Array<{ runLocation?: unknown }> = [];

  const ensureExtensionActive = async (): Promise<void> => {
    const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
    assert.ok(ext, 'Extension not found');
    if (!ext.isActive) {
      await ext.activate();
    }
  };

  setup(() => {
    latestCommitCalls = [];
    commitRangeCalls = [];

    originalGenerateFromLatestCommit = generateFromCommitModule.generateTestFromLatestCommit;
    originalGenerateFromCommitRange = generateFromCommitRangeModule.generateTestFromCommitRange;

    (generateFromCommitModule as unknown as { generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit })
      .generateTestFromLatestCommit = async (_provider, _modelOverride, options) => {
      latestCommitCalls.push({ runLocation: options?.runLocation });
    };
    (generateFromCommitRangeModule as unknown as { generateTestFromCommitRange: typeof generateFromCommitRangeModule.generateTestFromCommitRange })
      .generateTestFromCommitRange = async (_provider, _modelOverride, options) => {
      commitRangeCalls.push({ runLocation: options?.runLocation });
    };
  });

  teardown(() => {
    (generateFromCommitModule as unknown as { generateTestFromLatestCommit: typeof originalGenerateFromLatestCommit }).generateTestFromLatestCommit =
      originalGenerateFromLatestCommit;
    (generateFromCommitRangeModule as unknown as { generateTestFromCommitRange: typeof originalGenerateFromCommitRange }).generateTestFromCommitRange =
      originalGenerateFromCommitRange;
  });

  test('TC-EXT-RL-N-01: generateTestFromCommit passes worktree when args.runLocation=worktree', async () => {
    // Given: 拡張機能が有効化されている
    await ensureExtensionActive();

    // When: コマンドを args.runLocation="worktree" で実行する
    await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', { runLocation: 'worktree' });

    // Then: generator に worktree が渡る
    assert.strictEqual(latestCommitCalls.length, 1);
    assert.strictEqual(latestCommitCalls[0]?.runLocation, 'worktree');
  });

  test('TC-EXT-RL-B-01: generateTestFromCommit passes local when args is undefined', async () => {
    // Given: 拡張機能が有効化されている
    await ensureExtensionActive();

    // When: コマンドを引数なしで実行する
    await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit');

    // Then: generator に local が渡る（デフォルト）
    assert.strictEqual(latestCommitCalls.length, 1);
    assert.strictEqual(latestCommitCalls[0]?.runLocation, 'local');
  });

  test('TC-EXT-RL-E-01: generateTestFromCommitRange passes local when args.runLocation is invalid', async () => {
    // Given: 拡張機能が有効化されている
    await ensureExtensionActive();

    // When: commitRange コマンドを runLocation="invalid" で実行する（不正値）
    await vscode.commands.executeCommand('dontforgetest.generateTestFromCommitRange', { runLocation: 'invalid' as unknown as 'local' });

    // Then: generator に local が渡る（不正値は local 扱い）
    assert.strictEqual(commitRangeCalls.length, 1);
    assert.strictEqual(commitRangeCalls[0]?.runLocation, 'local');
  });
});

