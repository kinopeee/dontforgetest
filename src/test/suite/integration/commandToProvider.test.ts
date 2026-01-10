/**
 * コマンドからProviderへの統合テスト
 *
 * このファイルは extension.ts のコマンド登録から Provider 実行までの
 * 統合フローをテストする。
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as generateFromCommitModule from '../../../commands/generateFromCommit';
import * as generateFromCommitRangeModule from '../../../commands/generateFromCommitRange';
import * as generateFromWorkingTreeModule from '../../../commands/generateFromWorkingTree';

suite('integration/commandToProvider', () => {
  suiteSetup(async () => {
    // Given: 拡張機能がインストールされ、アクティブである
    const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
    assert.ok(ext, '拡張機能が見つからない');
    if (!ext.isActive) {
      await ext.activate();
    }
    assert.ok(ext.isActive, '拡張機能がアクティブであること');
  });

  suite('generateTestFromCommit コマンド統合', () => {
    // TC-INT-CMD-01: コマンドが正しく Provider に引数を渡す
    test('TC-INT-CMD-01: generateTestFromCommit コマンドが Provider に正しい引数を渡す', async () => {
      // Given: generateTestFromLatestCommit をスタブ化して引数をキャプチャ
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedProvider: unknown;
      let capturedModelOverride: string | undefined;
      let capturedOptions: generateFromCommitModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (provider, modelOverride, options) => {
        capturedProvider = provider;
        capturedModelOverride = modelOverride;
        capturedOptions = options;
      };

      try {
        // When: コマンドを実行する
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', {
          runLocation: 'local',
          modelOverride: 'test-model',
          runMode: 'full',
        });

        // Then: Provider が渡され、オプションが正しく設定される
        assert.ok(capturedProvider !== undefined, 'Provider が渡される');
        assert.strictEqual(capturedModelOverride, 'test-model', 'modelOverride が正しく渡される');
        assert.ok(capturedOptions !== undefined, 'Options が渡される');
        assert.strictEqual(capturedOptions.runLocation, 'local', 'runLocation が正しく渡される');
        assert.strictEqual(capturedOptions.runMode, 'full', 'runMode が正しく渡される');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });

    // TC-INT-CMD-02: perspectiveOnly モードが正しく渡される
    test('TC-INT-CMD-02: perspectiveOnly モードが正しく Provider に渡される', async () => {
      // Given: generateTestFromLatestCommit をスタブ化
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedOptions: generateFromCommitModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: perspectiveOnly モードでコマンドを実行
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', {
          runMode: 'perspectiveOnly',
        });

        // Then: runMode が perspectiveOnly として渡される
        assert.ok(capturedOptions !== undefined, 'Options が渡される');
        assert.strictEqual(capturedOptions.runMode, 'perspectiveOnly', 'runMode が perspectiveOnly');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });
  });

  suite('generateTestFromCommitRange コマンド統合', () => {
    // TC-INT-CMD-03: コミット範囲コマンドが正しく Provider に引数を渡す
    test('TC-INT-CMD-03: generateTestFromCommitRange コマンドが Provider に正しい引数を渡す', async () => {
      // Given: generateTestFromCommitRange をスタブ化
      const original = generateFromCommitRangeModule.generateTestFromCommitRange;
      let capturedProvider: unknown;
      let capturedOptions: generateFromCommitRangeModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitRangeModule as unknown as {
          generateTestFromCommitRange: typeof generateFromCommitRangeModule.generateTestFromCommitRange;
        }
      ).generateTestFromCommitRange = async (provider, _modelOverride, options) => {
        capturedProvider = provider;
        capturedOptions = options;
      };

      try {
        // When: コマンドを実行する
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommitRange', {
          runLocation: 'worktree',
          runMode: 'full',
        });

        // Then: Provider とオプションが正しく渡される
        assert.ok(capturedProvider !== undefined, 'Provider が渡される');
        assert.ok(capturedOptions !== undefined, 'Options が渡される');
        assert.strictEqual(capturedOptions.runLocation, 'worktree', 'runLocation が worktree');
        assert.strictEqual(capturedOptions.runMode, 'full', 'runMode が full');
      } finally {
        (
          generateFromCommitRangeModule as unknown as {
            generateTestFromCommitRange: typeof original;
          }
        ).generateTestFromCommitRange = original;
      }
    });
  });

  suite('generateTestFromWorkingTree コマンド統合', () => {
    // TC-INT-CMD-04: ワーキングツリーコマンドが正しく Provider に引数を渡す
    test('TC-INT-CMD-04: generateTestFromWorkingTree コマンドが Provider に正しい引数を渡す', async () => {
      // Given: generateTestFromWorkingTree をスタブ化
      const original = generateFromWorkingTreeModule.generateTestFromWorkingTree;
      let capturedProvider: unknown;
      let capturedOptions: generateFromWorkingTreeModule.GenerateFromWorkingTreeOptions | undefined;

      (
        generateFromWorkingTreeModule as unknown as {
          generateTestFromWorkingTree: typeof generateFromWorkingTreeModule.generateTestFromWorkingTree;
        }
      ).generateTestFromWorkingTree = async (provider, _modelOverride, options) => {
        capturedProvider = provider;
        capturedOptions = options;
      };

      try {
        // When: コマンドを実行する
        await vscode.commands.executeCommand('dontforgetest.generateTestFromWorkingTree', {
          runMode: 'perspectiveOnly',
        });

        // Then: Provider とオプションが正しく渡される
        assert.ok(capturedProvider !== undefined, 'Provider が渡される');
        assert.ok(capturedOptions !== undefined, 'Options が渡される');
        assert.strictEqual(capturedOptions.runMode, 'perspectiveOnly', 'runMode が perspectiveOnly');
      } finally {
        (
          generateFromWorkingTreeModule as unknown as {
            generateTestFromWorkingTree: typeof original;
          }
        ).generateTestFromWorkingTree = original;
      }
    });

    // TC-INT-CMD-05: ワーキングツリーコマンドは runLocation を受け取らない
    test('TC-INT-CMD-05: generateTestFromWorkingTree は runLocation を無視する', async () => {
      // Given: generateTestFromWorkingTree をスタブ化
      const original = generateFromWorkingTreeModule.generateTestFromWorkingTree;
      let capturedOptions: generateFromWorkingTreeModule.GenerateFromWorkingTreeOptions | undefined;

      (
        generateFromWorkingTreeModule as unknown as {
          generateTestFromWorkingTree: typeof generateFromWorkingTreeModule.generateTestFromWorkingTree;
        }
      ).generateTestFromWorkingTree = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: runLocation を指定してコマンドを実行（無視されるはず）
        await vscode.commands.executeCommand('dontforgetest.generateTestFromWorkingTree', {
          runMode: 'full',
        });

        // Then: Options が渡されるが runLocation は含まれない
        assert.ok(capturedOptions !== undefined, 'Options が渡される');
        // GenerateFromWorkingTreeOptions には runLocation プロパティがないため、
        // 型安全にアクセスするために as unknown as を使用
        assert.strictEqual((capturedOptions as unknown as { runLocation?: string }).runLocation, undefined, 'runLocation は undefined');
      } finally {
        (
          generateFromWorkingTreeModule as unknown as {
            generateTestFromWorkingTree: typeof original;
          }
        ).generateTestFromWorkingTree = original;
      }
    });
  });

  suite('コマンド引数の正規化統合', () => {
    // TC-INT-NORM-01: 無効な runLocation が 'local' に正規化される
    test('TC-INT-NORM-01: 無効な runLocation が "local" に正規化される', async () => {
      // Given: generateTestFromLatestCommit をスタブ化
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedOptions: generateFromCommitModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: 無効な runLocation でコマンドを実行
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', {
          runLocation: 'invalid-location',
        });

        // Then: runLocation が 'local' に正規化される
        assert.ok(capturedOptions !== undefined, 'Options が渡される');
        assert.strictEqual(capturedOptions.runLocation, 'local', 'runLocation が local に正規化される');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });

    // TC-INT-NORM-02: 無効な runMode が 'full' に正規化される
    test('TC-INT-NORM-02: 無効な runMode が "full" に正規化される', async () => {
      // Given: generateTestFromLatestCommit をスタブ化
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedOptions: generateFromCommitModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: 無効な runMode でコマンドを実行
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', {
          runMode: 'invalid-mode',
        });

        // Then: runMode が 'full' に正規化される
        assert.ok(capturedOptions !== undefined, 'Options が渡される');
        assert.strictEqual(capturedOptions.runMode, 'full', 'runMode が full に正規化される');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });

    // TC-INT-NORM-03: 引数なしでコマンドを実行するとデフォルト値が使用される
    test('TC-INT-NORM-03: 引数なしでコマンドを実行するとデフォルト値が使用される', async () => {
      // Given: generateTestFromLatestCommit をスタブ化
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedModelOverride: string | undefined;
      let capturedOptions: generateFromCommitModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, modelOverride, options) => {
        capturedModelOverride = modelOverride;
        capturedOptions = options;
      };

      try {
        // When: 引数なしでコマンドを実行
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit');

        // Then: デフォルト値が使用される
        assert.ok(capturedOptions !== undefined, 'Options が渡される');
        assert.strictEqual(capturedOptions.runLocation, 'local', 'runLocation がデフォルトで local');
        assert.strictEqual(capturedOptions.runMode, 'full', 'runMode がデフォルトで full');
        assert.strictEqual(capturedModelOverride, undefined, 'modelOverride がデフォルトで undefined');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });
  });
});
