import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildTestGenPrompt, buildTestPerspectivePrompt, parseLanguageConfig } from '../../../core/promptBuilder';

suite('core/promptBuilder.ts', () => {
  suite('parseLanguageConfig', () => {
    // Given: 正常なtestgen-agent-configを含むテキスト
    // When: parseLanguageConfigを呼び出す
    // Then: 言語設定が正しく抽出される
    test('TC-N-01: 正常な設定ファイル（testgen-agent-configあり）', () => {
      const text = '<!-- testgen-agent-config: {"answerLanguage":"ja","commentLanguage":"ja","perspectiveTableLanguage":"ja"} -->\n\n## テスト戦略ルール';
      const result = parseLanguageConfig(text);

      assert.ok(result !== undefined, '結果が定義されている');
      assert.strictEqual(result?.answerLanguage, 'ja');
      assert.strictEqual(result?.commentLanguage, 'ja');
      assert.strictEqual(result?.perspectiveTableLanguage, 'ja');
    });

    // Given: testgen-agent-configを含まないテキスト
    // When: parseLanguageConfigを呼び出す
    // Then: undefinedが返される
    test('TC-N-02: 設定ファイルなし（testgen-agent-configなし）', () => {
      const text = '## テスト戦略ルール\n\nルール1: ...';
      const result = parseLanguageConfig(text);

      assert.strictEqual(result, undefined);
    });

    // Given: 不正なJSON形式のtestgen-agent-config
    // When: parseLanguageConfigを呼び出す
    // Then: undefinedが返される
    test('TC-A-02: 不正なJSON形式のtestgen-agent-config', () => {
      const text = '<!-- testgen-agent-config: {invalid json} -->';
      const result = parseLanguageConfig(text);

      assert.strictEqual(result, undefined);
    });

    // Given: testgen-agent-configに必須フィールドが欠如
    // When: parseLanguageConfigを呼び出す
    // Then: undefinedが返される
    test('TC-A-03: testgen-agent-configに必須フィールドが欠如', () => {
      const text1 = '<!-- testgen-agent-config: {"answerLanguage":"ja"} -->';
      const result1 = parseLanguageConfig(text1);
      assert.strictEqual(result1, undefined, 'commentLanguageが欠如');

      const text2 = '<!-- testgen-agent-config: {"answerLanguage":"ja","commentLanguage":"ja"} -->';
      const result2 = parseLanguageConfig(text2);
      assert.strictEqual(result2, undefined, 'perspectiveTableLanguageが欠如');

      const text3 = '<!-- testgen-agent-config: {} -->';
      const result3 = parseLanguageConfig(text3);
      assert.strictEqual(result3, undefined, 'すべてのフィールドが欠如');
    });

    // Given: 空の文字列
    // When: parseLanguageConfigを呼び出す
    // Then: undefinedが返される
    test('TC-A-02: 空の文字列', () => {
      const result = parseLanguageConfig('');
      assert.strictEqual(result, undefined);
    });
  });

  suite('buildTestGenPrompt', () => {
    // Given: 正常なワークスペースと設定ファイル
    // When: buildTestGenPromptを呼び出す
    // Then: プロンプトが正しく構築される
    test('TC-N-01: 正常な設定ファイル（testgen-agent-configあり）', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        assert.fail('ワークスペースが開かれていません');
        return;
      }

      const testStrategyPath = path.join(workspaceRoot, 'docs', 'test-strategy.md');
      const options = {
        workspaceRoot,
        targetLabel: 'テスト対象',
        targetPaths: ['src/test.ts'],
        testStrategyPath,
      };

      try {
        const result = await buildTestGenPrompt(options);

        assert.ok(result.prompt.length > 0, 'プロンプトが生成されている');
        assert.ok(result.prompt.includes('テスト対象'), 'targetLabelが含まれている');
        assert.ok(result.prompt.includes('src/test.ts'), 'targetPathsが含まれている');
        assert.ok(result.prompt.includes('テスト戦略ルール'), 'テスト戦略ルールが含まれている');
        // デフォルトでenablePreTestCheck=trueのため、型チェック/Lintを含むフローが出力される
        assert.ok(result.prompt.includes('テスト生成 → 型チェック/Lint → テスト実行（testCommand）→ レポート保存'), '実行フローが含まれている');
        // デフォルトでenablePreTestCheck=trueのため、PreTestCheck版の制約が出力される
        assert.ok(result.prompt.includes('プロダクションコードの変更は行わない'), '修正禁止が明記されている');
        assert.ok(result.prompt.includes('デバッグ開始・ウォッチ開始・対話的セッション開始をしない'), 'デバッグ禁止が明記されている');
        assert.ok(result.prompt.includes('## 変更範囲の制約（必須）'), '変更範囲の制約セクションが含まれている');
        assert.ok(result.prompt.includes('## ツール使用制約（必須）'), 'ツール使用制約セクションが含まれている');
        assert.strictEqual(result.languages.answerLanguage, 'ja');
        assert.strictEqual(result.languages.commentLanguage, 'ja');
        assert.strictEqual(result.languages.perspectiveTableLanguage, 'ja');
      } catch (err) {
        // ファイルが存在しない場合はスキップ
        if (err instanceof Error && err.message.includes('ENOENT')) {
          return;
        }
        throw err;
      }
    });

    // Given: 複数のtargetPaths
    // When: buildTestGenPromptを呼び出す
    // Then: すべてのパスがプロンプトに含まれる
    test('TC-N-05: 複数のtargetPaths', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        assert.fail('ワークスペースが開かれていません');
        return;
      }

      const testStrategyPath = path.join(workspaceRoot, 'docs', 'test-strategy.md');
      const options = {
        workspaceRoot,
        targetLabel: 'テスト対象',
        targetPaths: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'],
        testStrategyPath,
      };

      try {
        const result = await buildTestGenPrompt(options);

        assert.ok(result.prompt.includes('src/file1.ts'), 'file1が含まれている');
        assert.ok(result.prompt.includes('src/file2.ts'), 'file2が含まれている');
        assert.ok(result.prompt.includes('src/file3.ts'), 'file3が含まれている');
      } catch (err) {
        if (err instanceof Error && err.message.includes('ENOENT')) {
          return;
        }
        throw err;
      }
    });

    // Given: 空のtargetPaths配列
    // When: buildTestGenPromptを呼び出す
    // Then: プロンプトは生成されるが、対象ファイルリストは空
    test('TC-N-06: 空のtargetPaths配列', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        assert.fail('ワークスペースが開かれていません');
        return;
      }

      const testStrategyPath = path.join(workspaceRoot, 'docs', 'test-strategy.md');
      const options = {
        workspaceRoot,
        targetLabel: 'テスト対象',
        targetPaths: [],
        testStrategyPath,
      };

      try {
        const result = await buildTestGenPrompt(options);

        assert.ok(result.prompt.length > 0, 'プロンプトが生成されている');
        // 対象ファイルリストは空だが、プロンプト自体は生成される
        assert.ok(result.prompt.includes('対象ファイル:'), '対象ファイルセクションが含まれている');
      } catch (err) {
        if (err instanceof Error && err.message.includes('ENOENT')) {
          return;
        }
        throw err;
      }
    });

    // TC-PB-01: enablePreTestCheck=true (Options)
    test('TC-PB-01: enablePreTestCheck=true かつコマンドありの場合、プロンプトにPreTestCheckフローが含まれる', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) { assert.fail('No workspace'); return; }
      const testStrategyPath = path.join(workspaceRoot, 'docs', 'test-strategy.md');
      
      // Options enablePreTestCheck: true
      const options = {
        workspaceRoot,
        targetLabel: 'Target',
        targetPaths: ['src/t.ts'],
        testStrategyPath,
        enablePreTestCheck: true,
        preTestCheckCommand: 'npm run lint'
      };

      try {
        const result = await buildTestGenPrompt(options);
        assert.ok(result.prompt.includes('型チェック/Lint'), '型チェックフローへの言及が含まれる');
        assert.ok(result.prompt.includes('npm run lint'), 'コマンドが含まれる');
        assert.ok(result.prompt.includes('許可されたコマンドのみ実行可能'), 'ツール制約が含まれる');
      } catch (err) {
         if (err instanceof Error && err.message.includes('ENOENT')) return;
         throw err;
      }
    });

    // TC-PB-02: enablePreTestCheck=false (Options)
    test('TC-PB-02: enablePreTestCheck=false の場合、標準フローになる', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) { assert.fail('No workspace'); return; }
      const testStrategyPath = path.join(workspaceRoot, 'docs', 'test-strategy.md');
      
      const options = {
        workspaceRoot,
        targetLabel: 'Target',
        targetPaths: ['src/t.ts'],
        testStrategyPath,
        enablePreTestCheck: false
      };

      try {
        const result = await buildTestGenPrompt(options);
        assert.ok(!result.prompt.includes('型チェック/Lint'), '型チェックフローは含まれない');
        assert.ok(result.prompt.includes('shell（コマンド実行）ツールは使用禁止'), '標準のツール制約が含まれる');
      } catch (err) {
         if (err instanceof Error && err.message.includes('ENOENT')) return;
         throw err;
      }
    });

    // TC-PB-03: Options Priority (True > Config False)
    test('TC-PB-03: Optionsでtrueを指定すればConfigがfalseでも有効になる', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;
        const testStrategyPath = path.join(workspaceRoot, 'docs', 'test-strategy.md');

        // Configをfalseに設定
        const config = vscode.workspace.getConfiguration('testgen-agent');
        await config.update('enablePreTestCheck', false, vscode.ConfigurationTarget.Global);

        try {
            const options = {
                workspaceRoot,
                targetLabel: 'Target',
                targetPaths: ['src/t.ts'],
                testStrategyPath,
                enablePreTestCheck: true, // Force Enable
                preTestCheckCommand: 'npm run check'
            };
            const result = await buildTestGenPrompt(options);
            assert.ok(result.prompt.includes('型チェック/Lint'), 'Optionsが優先され有効になる');
            assert.ok(result.prompt.includes('npm run check'), 'コマンドが含まれる');
        } catch (err) {
             if (err instanceof Error && err.message.includes('ENOENT')) return;
             throw err;
        } finally {
            await config.update('enablePreTestCheck', undefined, vscode.ConfigurationTarget.Global);
        }
    });

    // TC-PB-04: Options Priority (False > Config True)
    test('TC-PB-04: Optionsでfalseを指定すればConfigがtrueでも無効になる', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;
        const testStrategyPath = path.join(workspaceRoot, 'docs', 'test-strategy.md');

        // Configをtrueに設定
        const config = vscode.workspace.getConfiguration('testgen-agent');
        await config.update('enablePreTestCheck', true, vscode.ConfigurationTarget.Global);

        try {
            const options = {
                workspaceRoot,
                targetLabel: 'Target',
                targetPaths: ['src/t.ts'],
                testStrategyPath,
                enablePreTestCheck: false // Force Disable
            };
            const result = await buildTestGenPrompt(options);
            assert.ok(!result.prompt.includes('型チェック/Lint'), 'Optionsが優先され無効になる');
        } catch (err) {
             if (err instanceof Error && err.message.includes('ENOENT')) return;
             throw err;
        } finally {
            await config.update('enablePreTestCheck', undefined, vscode.ConfigurationTarget.Global);
        }
    });

    // TC-PB-05: Empty Command -> Disable
    test('TC-PB-05: コマンドが空文字の場合、flag=trueでも無効になる', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;
        const testStrategyPath = path.join(workspaceRoot, 'docs', 'test-strategy.md');

        const options = {
            workspaceRoot,
            targetLabel: 'Target',
            targetPaths: ['src/t.ts'],
            testStrategyPath,
            enablePreTestCheck: true,
            preTestCheckCommand: '' // Empty
        };

        try {
            const result = await buildTestGenPrompt(options);
            assert.ok(!result.prompt.includes('型チェック/Lint'), 'コマンドが空なら無効になる');
        } catch (err) {
             if (err instanceof Error && err.message.includes('ENOENT')) return;
             throw err;
        }
    });

    // TC-PB-06: Whitespace Command -> Disable
    test('TC-PB-06: コマンドが空白のみの場合、無効になる', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;
        const testStrategyPath = path.join(workspaceRoot, 'docs', 'test-strategy.md');

        const options = {
            workspaceRoot,
            targetLabel: 'Target',
            targetPaths: ['src/t.ts'],
            testStrategyPath,
            enablePreTestCheck: true,
            preTestCheckCommand: '   ' // Whitespace
        };

        try {
            const result = await buildTestGenPrompt(options);
            assert.ok(!result.prompt.includes('型チェック/Lint'), 'コマンドが空白なら無効になる');
        } catch (err) {
             if (err instanceof Error && err.message.includes('ENOENT')) return;
             throw err;
        }
    });

    // TC-PB-07: Option undefined -> Use Config
    test('TC-PB-07: Optionsで未指定(undefined)の場合、Configの値が使用される', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;
        const testStrategyPath = path.join(workspaceRoot, 'docs', 'test-strategy.md');

        // Config setup
        const config = vscode.workspace.getConfiguration('testgen-agent');
        await config.update('enablePreTestCheck', true, vscode.ConfigurationTarget.Global);
        await config.update('preTestCheckCommand', 'npm run config-cmd', vscode.ConfigurationTarget.Global);

        try {
            const options = {
                workspaceRoot,
                targetLabel: 'Target',
                targetPaths: ['src/t.ts'],
                testStrategyPath,
                enablePreTestCheck: undefined, // Undefined
                preTestCheckCommand: undefined // Undefined
            };
            const result = await buildTestGenPrompt(options);
            assert.ok(result.prompt.includes('型チェック/Lint'), 'Configの値(true)が使われる');
            assert.ok(result.prompt.includes('npm run config-cmd'), 'Configのコマンドが使われる');
        } catch (err) {
             if (err instanceof Error && err.message.includes('ENOENT')) return;
             throw err;
        } finally {
            await config.update('enablePreTestCheck', undefined, vscode.ConfigurationTarget.Global);
            await config.update('preTestCheckCommand', undefined, vscode.ConfigurationTarget.Global);
        }
    });

    // Given: 存在しないtestStrategyPath
    // When: buildTestGenPromptを呼び出す
    // Then: エラーが投げられる
    test('TC-A-01: 存在しないtestStrategyPath', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        assert.fail('ワークスペースが開かれていません');
        return;
      }

      const options = {
        workspaceRoot,
        targetLabel: 'テスト対象',
        targetPaths: ['src/test.ts'],
        testStrategyPath: path.join(workspaceRoot, 'non-existent-file.md'),
      };

      try {
        await buildTestGenPrompt(options);
        assert.fail('エラーが投げられるべき');
      } catch (err) {
        assert.ok(err instanceof Error, 'エラーが投げられている');
        // vscode.workspace.fs.readFileはFileSystemErrorを投げる
      }
    });

    // Given: 相対パスのtestStrategyPath
    // When: buildTestGenPromptを呼び出す
    // Then: ワークスペースルートと結合されて絶対パスになる
    test('TC-N-03: 相対パスのtestStrategyPath', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        assert.fail('ワークスペースが開かれていません');
        return;
      }

      const options = {
        workspaceRoot,
        targetLabel: 'テスト対象',
        targetPaths: ['src/test.ts'],
        testStrategyPath: 'docs/test-strategy.md',
      };

      try {
        await buildTestGenPrompt(options);
        // エラーが投げられなければ成功（パスが正しく解決された）
      } catch (err) {
        if (err instanceof Error && err.message.includes('ENOENT')) {
          return;
        }
        throw err;
      }
    });

    // Given: 絶対パスのtestStrategyPath
    // When: buildTestGenPromptを呼び出す
    // Then: そのまま使用される
    test('TC-N-04: 絶対パスのtestStrategyPath', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        assert.fail('ワークスペースが開かれていません');
        return;
      }

      const absolutePath = path.join(workspaceRoot, 'docs', 'test-strategy.md');
      const options = {
        workspaceRoot,
        targetLabel: 'テスト対象',
        targetPaths: ['src/test.ts'],
        testStrategyPath: absolutePath,
      };

      try {
        await buildTestGenPrompt(options);
        // エラーが投げられなければ成功（絶対パスが正しく使用された）
      } catch (err) {
        if (err instanceof Error && err.message.includes('ENOENT')) {
          return;
        }
        throw err;
      }
    });
  });

  suite('buildTestPerspectivePrompt', () => {
    // Given: 正常なワークスペースと設定ファイル
    // When: buildTestPerspectivePromptを呼び出す
    // Then: マーカー付きの観点表プロンプトが生成される
    test('TC-N-07: 観点表プロンプト（マーカー付き）', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        assert.fail('ワークスペースが開かれていません');
        return;
      }

      const testStrategyPath = path.join(workspaceRoot, 'docs', 'test-strategy.md');
      try {
        const result = await buildTestPerspectivePrompt({
          workspaceRoot,
          targetLabel: 'テスト対象',
          targetPaths: ['src/test.ts'],
          testStrategyPath,
          referenceText: 'diff snippet',
        });

        assert.ok(result.prompt.includes('<!-- BEGIN TEST PERSPECTIVES -->'));
        assert.ok(result.prompt.includes('<!-- END TEST PERSPECTIVES -->'));
        assert.ok(result.prompt.includes('| Case ID |'), 'テーブルヘッダが含まれる');
      } catch (err) {
        if (err instanceof Error && err.message.includes('ENOENT')) {
          return;
        }
        throw err;
      }
    });
  });
});
