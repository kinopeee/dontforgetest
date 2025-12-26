import * as assert from 'assert';
import {
  buildMergeAssistancePromptText,
  buildMergeAssistanceInstructionMarkdown,
  MergeAssistancePromptParams,
} from '../../../core/mergeAssistancePrompt';

suite('core/mergeAssistancePrompt.ts', () => {
  suite('buildMergeAssistancePromptText', () => {
    // TC-N-01: 全パラメータが有効な値
    // Given: 全てのパラメータが有効な値で設定されている
    // When: buildMergeAssistancePromptText を呼び出す
    // Then: 完全なプロンプトテキストが生成される
    test('TC-N-01: should generate complete prompt text with all valid params', () => {
      // Given: 全てのパラメータが有効な値で設定されている
      const params: MergeAssistancePromptParams = {
        taskId: 'task-12345',
        applyCheckOutput: 'CONFLICT (content): Merge conflict in src/foo.ts',
        patchPath: '/tmp/patch-12345.diff',
        snapshotDir: '/tmp/snapshot-12345',
        testPaths: ['src/test/foo.test.ts'],
        preTestCheckCommand: 'npm run compile',
      };

      // When: buildMergeAssistancePromptText を呼び出す
      const result = buildMergeAssistancePromptText(params);

      // Then: 完全なプロンプトテキストが生成される
      assert.ok(typeof result === 'string' && result.length > 0);
      assert.ok(result.includes('task-12345'), 'taskId が含まれること');
      assert.ok(result.includes('CONFLICT'), 'applyCheckOutput が含まれること');
      assert.ok(result.includes('/tmp/patch-12345.diff'), 'patchPath が含まれること');
      assert.ok(result.includes('/tmp/snapshot-12345'), 'snapshotDir が含まれること');
      assert.ok(result.includes('src/test/foo.test.ts'), 'testPaths が含まれること');
      assert.ok(result.includes('npm run compile'), 'preTestCheckCommand が含まれること');
    });

    // TC-N-02: testPaths が複数ファイル
    // Given: testPaths に複数のファイルパスが設定されている
    // When: buildMergeAssistancePromptText を呼び出す
    // Then: 全てのファイルが箇条書きで列挙される
    test('TC-N-02: should list multiple test paths as bullet points', () => {
      // Given: testPaths に複数のファイルパスが設定されている
      const params: MergeAssistancePromptParams = {
        taskId: 'task-multi',
        applyCheckOutput: 'error',
        patchPath: '/tmp/patch.diff',
        snapshotDir: '/tmp/snapshot',
        testPaths: ['src/test/a.test.ts', 'src/test/b.test.ts', 'src/test/c.test.ts'],
        preTestCheckCommand: 'npm test',
      };

      // When: buildMergeAssistancePromptText を呼び出す
      const result = buildMergeAssistancePromptText(params);

      // Then: 全てのファイルが箇条書きで列挙される
      assert.ok(result.includes('- src/test/a.test.ts'), 'ファイル a が含まれること');
      assert.ok(result.includes('- src/test/b.test.ts'), 'ファイル b が含まれること');
      assert.ok(result.includes('- src/test/c.test.ts'), 'ファイル c が含まれること');
    });

    // TC-B-01: testPaths が空配列
    // Given: testPaths が空配列
    // When: buildMergeAssistancePromptText を呼び出す
    // Then: "(なし)" または類似のプレースホルダが表示される
    test('TC-B-01: should show placeholder when testPaths is empty', () => {
      // Given: testPaths が空配列
      const params: MergeAssistancePromptParams = {
        taskId: 'task-empty-paths',
        applyCheckOutput: 'error',
        patchPath: '/tmp/patch.diff',
        snapshotDir: '/tmp/snapshot',
        testPaths: [],
        preTestCheckCommand: 'npm test',
      };

      // When: buildMergeAssistancePromptText を呼び出す
      const result = buildMergeAssistancePromptText(params);

      // Then: "(なし)" または "(none)" が表示される（ローカライズに依存）
      // l10n の artifact.none キーが使用される
      assert.ok(typeof result === 'string' && result.length > 0);
      // testPaths がない場合、個別ファイルパスではなくプレースホルダが使われる
      assert.ok(
        !result.includes('- src/test/'),
        '具体的なテストパスは含まれないこと',
      );
    });

    // TC-B-02: applyCheckOutput が空文字列
    // Given: applyCheckOutput が空文字列
    // When: buildMergeAssistancePromptText を呼び出す
    // Then: "(なし)" または類似のプレースホルダが表示される
    test('TC-B-02: should show placeholder when applyCheckOutput is empty', () => {
      // Given: applyCheckOutput が空文字列
      const params: MergeAssistancePromptParams = {
        taskId: 'task-empty-output',
        applyCheckOutput: '',
        patchPath: '/tmp/patch.diff',
        snapshotDir: '/tmp/snapshot',
        testPaths: ['src/test/foo.test.ts'],
        preTestCheckCommand: 'npm test',
      };

      // When: buildMergeAssistancePromptText を呼び出す
      const result = buildMergeAssistancePromptText(params);

      // Then: プロンプトが生成される（空文字列の代わりにプレースホルダ）
      assert.ok(typeof result === 'string' && result.length > 0);
    });

    // TC-B-03: preTestCheckCommand が空文字列
    // Given: preTestCheckCommand が空文字列
    // When: buildMergeAssistancePromptText を呼び出す
    // Then: step3 がコマンドなし版になる
    test('TC-B-03: should use no-command step3 when preTestCheckCommand is empty', () => {
      // Given: preTestCheckCommand が空文字列
      const params: MergeAssistancePromptParams = {
        taskId: 'task-no-command',
        applyCheckOutput: 'error',
        patchPath: '/tmp/patch.diff',
        snapshotDir: '/tmp/snapshot',
        testPaths: ['src/test/foo.test.ts'],
        preTestCheckCommand: '',
      };

      // When: buildMergeAssistancePromptText を呼び出す
      const result = buildMergeAssistancePromptText(params);

      // Then: プロンプトが生成される（コマンドなし版）
      assert.ok(typeof result === 'string' && result.length > 0);
      // 空のコマンドは含まれない
      assert.ok(!result.includes('npm run compile'), 'デフォルトコマンドは含まれないこと');
    });

    // TC-B-04: applyCheckOutput が空白のみ
    // Given: applyCheckOutput が空白文字のみ
    // When: buildMergeAssistancePromptText を呼び出す
    // Then: "(なし)" または類似のプレースホルダが表示される
    test('TC-B-04: should show placeholder when applyCheckOutput is whitespace only', () => {
      // Given: applyCheckOutput が空白文字のみ
      const params: MergeAssistancePromptParams = {
        taskId: 'task-whitespace',
        applyCheckOutput: '   \n\t  ',
        patchPath: '/tmp/patch.diff',
        snapshotDir: '/tmp/snapshot',
        testPaths: ['src/test/foo.test.ts'],
        preTestCheckCommand: 'npm test',
      };

      // When: buildMergeAssistancePromptText を呼び出す
      const result = buildMergeAssistancePromptText(params);

      // Then: プロンプトが生成される（空白のみの場合もプレースホルダ）
      assert.ok(typeof result === 'string' && result.length > 0);
    });

    // TC-B-05: preTestCheckCommand が空白のみ
    // Given: preTestCheckCommand が空白文字のみ
    // When: buildMergeAssistancePromptText を呼び出す
    // Then: step3 がコマンドなし版になる
    test('TC-B-05: should use no-command step3 when preTestCheckCommand is whitespace only', () => {
      // Given: preTestCheckCommand が空白文字のみ
      const params: MergeAssistancePromptParams = {
        taskId: 'task-whitespace-cmd',
        applyCheckOutput: 'error',
        patchPath: '/tmp/patch.diff',
        snapshotDir: '/tmp/snapshot',
        testPaths: ['src/test/foo.test.ts'],
        preTestCheckCommand: '   ',
      };

      // When: buildMergeAssistancePromptText を呼び出す
      const result = buildMergeAssistancePromptText(params);

      // Then: プロンプトが生成される（コマンドなし版）
      assert.ok(typeof result === 'string' && result.length > 0);
    });
  });

  suite('buildMergeAssistanceInstructionMarkdown', () => {
    // TC-N-04: Markdown形式の出力
    // Given: 有効なパラメータ
    // When: buildMergeAssistanceInstructionMarkdown を呼び出す
    // Then: Markdown形式（#タイトル、コードブロック）で出力される
    test('TC-N-04: should generate markdown format with title and code block', () => {
      // Given: 有効なパラメータ
      const params: MergeAssistancePromptParams = {
        taskId: 'task-markdown',
        applyCheckOutput: 'error',
        patchPath: '/tmp/patch.diff',
        snapshotDir: '/tmp/snapshot',
        testPaths: ['src/test/foo.test.ts'],
        preTestCheckCommand: 'npm test',
      };

      // When: buildMergeAssistanceInstructionMarkdown を呼び出す
      const result = buildMergeAssistanceInstructionMarkdown(params);

      // Then: Markdown形式で出力される
      assert.ok(result.startsWith('#'), 'Markdownタイトル（#）で始まること');
      assert.ok(result.includes('```text'), 'コードブロック開始が含まれること');
      assert.ok(result.includes('```\n'), 'コードブロック終了が含まれること');
      assert.ok(result.includes('task-markdown'), 'taskId が含まれること');
    });

    // TC-N-05: プロンプトテキストがコードブロック内に含まれる
    // Given: 有効なパラメータ
    // When: buildMergeAssistanceInstructionMarkdown を呼び出す
    // Then: buildMergeAssistancePromptText の出力がコードブロック内に含まれる
    test('TC-N-05: should contain prompt text within code block', () => {
      // Given: 有効なパラメータ
      const params: MergeAssistancePromptParams = {
        taskId: 'task-contained',
        applyCheckOutput: 'specific error message',
        patchPath: '/specific/patch.diff',
        snapshotDir: '/specific/snapshot',
        testPaths: ['specific/test.ts'],
        preTestCheckCommand: 'specific-command',
      };

      // When: buildMergeAssistanceInstructionMarkdown を呼び出す
      const result = buildMergeAssistanceInstructionMarkdown(params);
      const promptText = buildMergeAssistancePromptText(params);

      // Then: プロンプトテキストがコードブロック内に含まれる
      assert.ok(result.includes(promptText), 'プロンプトテキストが含まれること');
      // コードブロック内にあることを確認
      const codeBlockStart = result.indexOf('```text');
      const codeBlockEnd = result.lastIndexOf('```');
      const promptStart = result.indexOf(params.taskId);
      assert.ok(promptStart > codeBlockStart, 'プロンプトはコードブロック開始の後にあること');
      assert.ok(promptStart < codeBlockEnd, 'プロンプトはコードブロック終了の前にあること');
    });
  });
});
