import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import { buildTestGenPrompt, buildTestPerspectivePrompt, parseLanguageConfig } from '../../../core/promptBuilder';

/**
 * テスト用の一時戦略ファイルを作成するヘルパー
 */
function createTempStrategyFile(content: string): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testgen-test-'));
  const tempFile = path.join(tempDir, 'test-strategy.md');
  fs.writeFileSync(tempFile, content, 'utf-8');
  return tempFile;
}

/**
 * 一時ファイルとディレクトリを削除するヘルパー
 */
function cleanupTempFile(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
    fs.rmdirSync(path.dirname(filePath));
  } catch {
    // クリーンアップ失敗は無視
  }
}

/** 日本語テスト戦略ファイルの内容 */
const JAPANESE_STRATEGY_CONTENT = `<!-- dontforgetest-config: {"answerLanguage":"ja","commentLanguage":"ja","perspectiveTableLanguage":"ja"} -->

## テスト戦略ルール

これはテスト用の日本語戦略ファイルです。
`;

suite('core/promptBuilder.ts', () => {
  suite('parseLanguageConfig', () => {
    // Given: 正常なdontforgetest-configを含むテキスト
    // When: parseLanguageConfigを呼び出す
    // Then: 言語設定が正しく抽出される
    test('TC-N-01: 正常な設定ファイル（dontforgetest-configあり）', () => {
      const text = '<!-- dontforgetest-config: {"answerLanguage":"ja","commentLanguage":"ja","perspectiveTableLanguage":"ja"} -->\n\n## テスト戦略ルール';
      const result = parseLanguageConfig(text);

      assert.ok(result !== undefined, '結果が定義されている');
      assert.strictEqual(result?.answerLanguage, 'ja');
      assert.strictEqual(result?.commentLanguage, 'ja');
      assert.strictEqual(result?.perspectiveTableLanguage, 'ja');
    });

    // Given: dontforgetest-configを含まないテキスト
    // When: parseLanguageConfigを呼び出す
    // Then: undefinedが返される
    test('TC-N-02: 設定ファイルなし（dontforgetest-configなし）', () => {
      const text = '## テスト戦略ルール\n\nルール1: ...';
      const result = parseLanguageConfig(text);

      assert.strictEqual(result, undefined);
    });

    // Given: 不正なJSON形式のdontforgetest-config
    // When: parseLanguageConfigを呼び出す
    // Then: undefinedが返される
    test('TC-A-02: 不正なJSON形式のdontforgetest-config', () => {
      const text = '<!-- dontforgetest-config: {invalid json} -->';
      const result = parseLanguageConfig(text);

      assert.strictEqual(result, undefined);
    });

    // Given: dontforgetest-configに必須フィールドが欠如
    // When: parseLanguageConfigを呼び出す
    // Then: undefinedが返される
    test('TC-A-03: dontforgetest-configに必須フィールドが欠如', () => {
      const text1 = '<!-- dontforgetest-config: {"answerLanguage":"ja"} -->';
      const result1 = parseLanguageConfig(text1);
      assert.strictEqual(result1, undefined, 'commentLanguageが欠如');

      const text2 = '<!-- dontforgetest-config: {"answerLanguage":"ja","commentLanguage":"ja"} -->';
      const result2 = parseLanguageConfig(text2);
      assert.strictEqual(result2, undefined, 'perspectiveTableLanguageが欠如');

      const text3 = '<!-- dontforgetest-config: {} -->';
      const result3 = parseLanguageConfig(text3);
      assert.strictEqual(result3, undefined, 'すべてのフィールドが欠如');
    });

    // TC-B-03: Target file contains ONLY old `<!-- testgen-agent-config: ... -->`
    test('TC-B-03: 旧形式の testgen-agent-config は無視される', () => {
      const text = '<!-- testgen-agent-config: {"answerLanguage":"ja","commentLanguage":"ja","perspectiveTableLanguage":"ja"} -->';
      const result = parseLanguageConfig(text);
      assert.strictEqual(result, undefined, '旧形式のタグは無視され、undefinedが返るべき');
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
    test('TC-N-01: 正常な設定ファイル（dontforgetest-configあり）', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        assert.fail('ワークスペースが開かれていません');
        return;
      }

      // 一時ファイルを作成
      const testStrategyPath = createTempStrategyFile(JAPANESE_STRATEGY_CONTENT);

      try {
        const options = {
          workspaceRoot,
          targetLabel: 'テスト対象',
          targetPaths: ['src/test.ts'],
          testStrategyPath,
        };

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
      } finally {
        cleanupTempFile(testStrategyPath);
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

      // 内蔵デフォルト戦略を使用（空文字）
      const options = {
        workspaceRoot,
        targetLabel: 'テスト対象',
        targetPaths: ['src/file1.ts', 'src/file2.ts', 'src/file3.ts'],
        testStrategyPath: '',
      };

      const result = await buildTestGenPrompt(options);

      assert.ok(result.prompt.includes('src/file1.ts'), 'file1が含まれている');
      assert.ok(result.prompt.includes('src/file2.ts'), 'file2が含まれている');
      assert.ok(result.prompt.includes('src/file3.ts'), 'file3が含まれている');
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

      // 内蔵デフォルト戦略を使用（空文字）
      const options = {
        workspaceRoot,
        targetLabel: 'テスト対象',
        targetPaths: [],
        testStrategyPath: '',
      };

      const result = await buildTestGenPrompt(options);

      assert.ok(result.prompt.length > 0, 'プロンプトが生成されている');
      // 対象ファイルリストは空だが、プロンプト自体は生成される
      assert.ok(result.prompt.includes('対象ファイル:'), '対象ファイルセクションが含まれている');
    });

    // TC-PB-01: enablePreTestCheck=true (Options)
    test('TC-PB-01: enablePreTestCheck=true かつコマンドありの場合、プロンプトにPreTestCheckフローが含まれる', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) { assert.fail('No workspace'); return; }
      
      // 内蔵デフォルト戦略を使用（空文字）
      const options = {
        workspaceRoot,
        targetLabel: 'Target',
        targetPaths: ['src/t.ts'],
        testStrategyPath: '',
        enablePreTestCheck: true,
        preTestCheckCommand: 'npm run lint'
      };

      const result = await buildTestGenPrompt(options);
      assert.ok(result.prompt.includes('型チェック/Lint'), '型チェックフローへの言及が含まれる');
      assert.ok(result.prompt.includes('npm run lint'), 'コマンドが含まれる');
      assert.ok(result.prompt.includes('許可されたコマンドのみ実行可能'), 'ツール制約が含まれる');
    });

    // TC-PB-02: enablePreTestCheck=false (Options)
    test('TC-PB-02: enablePreTestCheck=false の場合、標準フローになる', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) { assert.fail('No workspace'); return; }
      
      // 内蔵デフォルト戦略を使用（空文字）
      const options = {
        workspaceRoot,
        targetLabel: 'Target',
        targetPaths: ['src/t.ts'],
        testStrategyPath: '',
        enablePreTestCheck: false
      };

      const result = await buildTestGenPrompt(options);
      assert.ok(!result.prompt.includes('型チェック/Lint'), '型チェックフローは含まれない');
      assert.ok(result.prompt.includes('shell（コマンド実行）ツールは使用禁止'), '標準のツール制約が含まれる');
    });

    // TC-PB-03: Options Priority (True > Config False)
    test('TC-PB-03: Optionsでtrueを指定すればConfigがfalseでも有効になる', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;

        // Configをfalseに設定
        const config = vscode.workspace.getConfiguration('dontforgetest');
        await config.update('enablePreTestCheck', false, vscode.ConfigurationTarget.Global);

        try {
            // 内蔵デフォルト戦略を使用（空文字）
            const options = {
                workspaceRoot,
                targetLabel: 'Target',
                targetPaths: ['src/t.ts'],
                testStrategyPath: '',
                enablePreTestCheck: true, // Force Enable
                preTestCheckCommand: 'npm run check'
            };
            const result = await buildTestGenPrompt(options);
            assert.ok(result.prompt.includes('型チェック/Lint'), 'Optionsが優先され有効になる');
            assert.ok(result.prompt.includes('npm run check'), 'コマンドが含まれる');
        } finally {
            await config.update('enablePreTestCheck', undefined, vscode.ConfigurationTarget.Global);
        }
    });

    // TC-PB-04: Options Priority (False > Config True)
    test('TC-PB-04: Optionsでfalseを指定すればConfigがtrueでも無効になる', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;

        // Configをtrueに設定
        const config = vscode.workspace.getConfiguration('dontforgetest');
        await config.update('enablePreTestCheck', true, vscode.ConfigurationTarget.Global);

        try {
            // 内蔵デフォルト戦略を使用（空文字）
            const options = {
                workspaceRoot,
                targetLabel: 'Target',
                targetPaths: ['src/t.ts'],
                testStrategyPath: '',
                enablePreTestCheck: false // Force Disable
            };
            const result = await buildTestGenPrompt(options);
            assert.ok(!result.prompt.includes('型チェック/Lint'), 'Optionsが優先され無効になる');
        } finally {
            await config.update('enablePreTestCheck', undefined, vscode.ConfigurationTarget.Global);
        }
    });

    // TC-PB-05: Empty Command -> Disable
    test('TC-PB-05: コマンドが空文字の場合、flag=trueでも無効になる', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;

        // 内蔵デフォルト戦略を使用（空文字）
        const options = {
            workspaceRoot,
            targetLabel: 'Target',
            targetPaths: ['src/t.ts'],
            testStrategyPath: '',
            enablePreTestCheck: true,
            preTestCheckCommand: '' // Empty
        };

        const result = await buildTestGenPrompt(options);
        assert.ok(!result.prompt.includes('型チェック/Lint'), 'コマンドが空なら無効になる');
    });

    // TC-PB-06: Whitespace Command -> Disable
    test('TC-PB-06: コマンドが空白のみの場合、無効になる', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;

        // 内蔵デフォルト戦略を使用（空文字）
        const options = {
            workspaceRoot,
            targetLabel: 'Target',
            targetPaths: ['src/t.ts'],
            testStrategyPath: '',
            enablePreTestCheck: true,
            preTestCheckCommand: '   ' // Whitespace
        };

        const result = await buildTestGenPrompt(options);
        assert.ok(!result.prompt.includes('型チェック/Lint'), 'コマンドが空白なら無効になる');
    });

    // TC-PB-07: Option undefined -> Use Config
    test('TC-PB-07: Optionsで未指定(undefined)の場合、Configの値が使用される', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) return;

        // Config setup
        const config = vscode.workspace.getConfiguration('dontforgetest');
        await config.update('enablePreTestCheck', true, vscode.ConfigurationTarget.Global);
        await config.update('preTestCheckCommand', 'npm run config-cmd', vscode.ConfigurationTarget.Global);

        try {
            // 内蔵デフォルト戦略を使用（空文字）
            const options = {
                workspaceRoot,
                targetLabel: 'Target',
                targetPaths: ['src/t.ts'],
                testStrategyPath: '',
                enablePreTestCheck: undefined, // Undefined
                preTestCheckCommand: undefined // Undefined
            };
            const result = await buildTestGenPrompt(options);
            assert.ok(result.prompt.includes('型チェック/Lint'), 'Configの値(true)が使われる');
            assert.ok(result.prompt.includes('npm run config-cmd'), 'Configのコマンドが使われる');
        } finally {
            await config.update('enablePreTestCheck', undefined, vscode.ConfigurationTarget.Global);
            await config.update('preTestCheckCommand', undefined, vscode.ConfigurationTarget.Global);
        }
    });

    // Given: 存在しないtestStrategyPath
    // When: buildTestGenPromptを呼び出す
    // Then: フォールバックで内蔵デフォルト戦略が使用される
    test('TC-A-01: 存在しないtestStrategyPath（フォールバック動作）', async () => {
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

      // 存在しないファイルの場合はフォールバックで内蔵デフォルトを使用
      const result = await buildTestGenPrompt(options);
      assert.ok(result.prompt.includes('Test Strategy Rules'), '内蔵デフォルト戦略が含まれている');
      assert.strictEqual(result.languages.answerLanguage, 'en', '英語の言語設定が返される');
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

      // 一時ディレクトリに戦略ファイルを作成
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testgen-rel-'));
      const relPath = 'custom/strategy.md';
      const fullPath = path.join(tempDir, relPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, JAPANESE_STRATEGY_CONTENT, 'utf-8');

      try {
        const options = {
          workspaceRoot: tempDir,  // 一時ディレクトリをワークスペースルートとして扱う
          targetLabel: 'テスト対象',
          targetPaths: ['src/test.ts'],
          testStrategyPath: relPath,  // 相対パス
        };

        const result = await buildTestGenPrompt(options);
        // エラーが投げられなければ成功（パスが正しく解決された）
        assert.ok(result.prompt.includes('テスト戦略ルール'), '相対パスが解決され戦略が読み込まれた');
      } finally {
        fs.unlinkSync(fullPath);
        fs.rmdirSync(path.dirname(fullPath));
        fs.rmdirSync(tempDir);
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

      // 一時ファイルを作成（絶対パス）
      const absolutePath = createTempStrategyFile(JAPANESE_STRATEGY_CONTENT);

      try {
        const options = {
          workspaceRoot,
          targetLabel: 'テスト対象',
          targetPaths: ['src/test.ts'],
          testStrategyPath: absolutePath,
        };

        const result = await buildTestGenPrompt(options);
        // エラーが投げられなければ成功（絶対パスが正しく使用された）
        assert.ok(result.prompt.includes('テスト戦略ルール'), '絶対パスで戦略が読み込まれた');
      } finally {
        cleanupTempFile(absolutePath);
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

      // 内蔵デフォルト戦略を使用（空文字）
      const result = await buildTestPerspectivePrompt({
        workspaceRoot,
        targetLabel: 'テスト対象',
        targetPaths: ['src/test.ts'],
        testStrategyPath: '',
        referenceText: 'diff snippet',
      });

      assert.ok(result.prompt.includes('<!-- BEGIN TEST PERSPECTIVES -->'));
      assert.ok(result.prompt.includes('<!-- END TEST PERSPECTIVES -->'));
      assert.ok(result.prompt.includes('| Case ID |'), 'テーブルヘッダが含まれる');
    });
  });

  suite('デフォルト戦略フォールバック', () => {
    // Given: testStrategyPath が空文字
    // When: buildTestGenPrompt を呼び出す
    // Then: 内蔵デフォルト戦略が使用され、英語の言語設定が返される
    test('TC-PB-01: 引数 testStrategyPath が空文字', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        assert.fail('ワークスペースが開かれていません');
        return;
      }

      const options = {
        workspaceRoot,
        targetLabel: 'テスト対象',
        targetPaths: ['src/test.ts'],
        testStrategyPath: '', // 空文字
      };

      const result = await buildTestGenPrompt(options);

      assert.ok(result.prompt.length > 0, 'プロンプトが生成されている');
      assert.ok(result.prompt.includes('Test Strategy Rules'), '内蔵デフォルト戦略が含まれている');
      assert.ok(result.prompt.includes('MANDATORY'), '内蔵デフォルト戦略の内容が含まれている');
      assert.strictEqual(result.languages.answerLanguage, 'en', '英語の言語設定が返される');
      assert.strictEqual(result.languages.commentLanguage, 'en', '英語の言語設定が返される');
      assert.strictEqual(result.languages.perspectiveTableLanguage, 'en', '英語の言語設定が返される');
    });

    // Given: testStrategyPath が空白文字のみ
    // When: buildTestGenPrompt を呼び出す
    // Then: TC-PB-01 と同様にデフォルト値を返す
    test('TC-PB-02: 引数 testStrategyPath が空白文字のみ', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        assert.fail('ワークスペースが開かれていません');
        return;
      }

      const options = {
        workspaceRoot,
        targetLabel: 'テスト対象',
        targetPaths: ['src/test.ts'],
        testStrategyPath: '   ', // 空白
      };

      const result = await buildTestGenPrompt(options);

      assert.ok(result.prompt.includes('Test Strategy Rules'), '内蔵デフォルト戦略が含まれている');
      assert.strictEqual(result.languages.answerLanguage, 'en', '英語の言語設定が返される');
    });

    // Given: 存在しないファイルパス
    // When: buildTestGenPrompt を呼び出す
    // Then: エラーにならず、内蔵デフォルト戦略が使用される
    test('TC-PB-03: 引数 testStrategyPath が存在しないファイルパス', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        assert.fail('ワークスペースが開かれていません');
        return;
      }

      const options = {
        workspaceRoot,
        targetLabel: 'テスト対象',
        targetPaths: ['src/test.ts'],
        testStrategyPath: path.join(workspaceRoot, 'non-existent-strategy.md'),
      };

      const result = await buildTestGenPrompt(options);

      assert.ok(result.prompt.length > 0, 'プロンプトが生成されている');
      assert.ok(result.prompt.includes('Test Strategy Rules'), '内蔵デフォルト戦略が含まれている');
      assert.strictEqual(result.languages.answerLanguage, 'en', '英語の言語設定が返される');
    });

    // Given: 存在する外部ファイル
    // When: buildTestGenPrompt を呼び出す
    // Then: 外部ファイルの内容が使用される
    test('TC-PB-04: 引数 testStrategyPath が存在するファイルパス', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        assert.fail('ワークスペースが開かれていません');
        return;
      }

      // 一時ファイルを作成
      const testStrategyPath = createTempStrategyFile(JAPANESE_STRATEGY_CONTENT);

      try {
        const options = {
          workspaceRoot,
          targetLabel: 'テスト対象',
          targetPaths: ['src/test.ts'],
          testStrategyPath,
        };

        const result = await buildTestGenPrompt(options);

        assert.ok(result.prompt.length > 0, 'プロンプトが生成されている');
        // 外部ファイルが存在する場合は、その内容が使用される
        assert.ok(result.prompt.includes('テスト戦略ルール'), '外部ファイルの戦略ルールが含まれている');
        assert.strictEqual(result.languages.answerLanguage, 'ja', '日本語の言語設定が返される');
      } finally {
        cleanupTempFile(testStrategyPath);
      }
    });

    // Given: 引数 testStrategyPath がNULL (型定義上不可だが)
    // When: buildTestGenPrompt を呼び出す
    // Then: 空文字同様に振る舞うか、安全にデフォルトを返す
    test('TC-PB-05: 引数 testStrategyPath がNULL', async () => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          assert.fail('ワークスペースが開かれていません');
          return;
        }
  
        const options = {
          workspaceRoot,
          targetLabel: 'テスト対象',
          targetPaths: ['src/test.ts'],
          testStrategyPath: null as unknown as string, // Force null
        };
  
        const result = await buildTestGenPrompt(options);
  
        assert.ok(result.prompt.includes('Test Strategy Rules'), '内蔵デフォルト戦略が含まれている');
        assert.strictEqual(result.languages.answerLanguage, 'en', '英語の言語設定が返される');
      });
  });
});
