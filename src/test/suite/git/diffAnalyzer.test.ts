import * as assert from 'assert';
import { analyzeGitUnifiedDiff, extractChangedPaths, getCommitRangeDiff, getWorkingTreeDiff, GitDiffAnalysis } from '../../../git/diffAnalyzer';
import * as gitExecModule from '../../../git/gitExec';

suite('git/diffAnalyzer.ts', () => {
  suite('analyzeGitUnifiedDiff', () => {
    // TC-N-01: 単一ファイルの modified diff
    // Given: 通常の modified diff 出力
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: changeType='modified' のファイルが1つ返される
    test('TC-N-01: should parse single modified file diff', () => {
      // Given: 通常の modified diff 出力
      const diffText = `diff --git a/src/foo.ts b/src/foo.ts
index abc1234..def5678 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 export function foo() {
+  console.log('hello');
   return 1;
 }`;

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: changeType='modified' のファイルが1つ返される
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0].path, 'src/foo.ts');
      assert.strictEqual(result.files[0].changeType, 'modified');
      assert.strictEqual(result.files[0].oldPath, undefined);
    });

    // TC-N-02: 単一ファイルの added diff (new file mode)
    // Given: new file mode を含む diff 出力
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: changeType='added' のファイルが1つ返される
    test('TC-N-02: should parse new file diff as added', () => {
      // Given: new file mode を含む diff 出力
      const diffText = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,3 @@
+export function newFunc() {
+  return 42;
+}`;

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: changeType='added' のファイルが1つ返される
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0].path, 'src/new.ts');
      assert.strictEqual(result.files[0].changeType, 'added');
    });

    // TC-N-03: 単一ファイルの deleted diff
    // Given: deleted file mode を含む diff 出力
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: changeType='deleted' のファイルが1つ返される
    test('TC-N-03: should parse deleted file diff', () => {
      // Given: deleted file mode を含む diff 出力
      const diffText = `diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function oldFunc() {
-  return 0;
-}`;

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: changeType='deleted' のファイルが1つ返される
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0].path, 'src/old.ts');
      assert.strictEqual(result.files[0].changeType, 'deleted');
    });

    // TC-N-04: ファイルリネーム (rename from/to)
    // Given: rename from/to を含む diff 出力
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: changeType='renamed', oldPath が設定される
    test('TC-N-04: should parse renamed file diff with oldPath', () => {
      // Given: rename from/to を含む diff 出力
      const diffText = `diff --git a/src/oldName.ts b/src/newName.ts
similarity index 95%
rename from src/oldName.ts
rename to src/newName.ts
index abc1234..def5678 100644
--- a/src/oldName.ts
+++ b/src/newName.ts
@@ -1,3 +1,3 @@
 export function func() {
-  return 'old';
+  return 'new';
 }`;

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: changeType='renamed', oldPath が設定される
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0].path, 'src/newName.ts');
      assert.strictEqual(result.files[0].changeType, 'renamed');
      assert.strictEqual(result.files[0].oldPath, 'src/oldName.ts');
    });

    // TC-N-05: 複数ファイル変更
    // Given: 複数ファイルの diff 出力
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: 全ファイルが正しく抽出される
    test('TC-N-05: should parse multiple files diff', () => {
      // Given: 複数ファイルの diff 出力
      const diffText = `diff --git a/src/foo.ts b/src/foo.ts
index abc1234..def5678 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1 +1 @@
-old
+new
diff --git a/src/bar.ts b/src/bar.ts
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/bar.ts
@@ -0,0 +1 @@
+export const bar = 1;
diff --git a/src/baz.ts b/src/baz.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/baz.ts
+++ /dev/null
@@ -1 +0,0 @@
-export const baz = 2;`;

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: 全ファイルが正しく抽出される
      assert.strictEqual(result.files.length, 3);

      const foo = result.files.find(f => f.path === 'src/foo.ts');
      assert.ok(foo);
      assert.strictEqual(foo.changeType, 'modified');

      const bar = result.files.find(f => f.path === 'src/bar.ts');
      assert.ok(bar);
      assert.strictEqual(bar.changeType, 'added');

      const baz = result.files.find(f => f.path === 'src/baz.ts');
      assert.ok(baz);
      assert.strictEqual(baz.changeType, 'deleted');
    });

    // TC-B-01: 空文字列
    // Given: 空の diff 出力
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: 空のファイル配列が返される
    test('TC-B-01: should return empty array for empty input', () => {
      // Given: 空の diff 出力
      const diffText = '';

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: 空のファイル配列が返される
      assert.strictEqual(result.files.length, 0);
    });

    // TC-B-02: 空行のみ
    // Given: 空行のみの diff 出力
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: 空のファイル配列が返される
    test('TC-B-02: should return empty array for whitespace only input', () => {
      // Given: 空行のみの diff 出力
      const diffText = '\n\n  \n';

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: 空のファイル配列が返される
      assert.strictEqual(result.files.length, 0);
    });

    // TC-B-03: diff --git 行のみ（本文なし）
    // Given: diff --git 行のみの出力
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: ファイルが1つ抽出される（changeType=modified）
    test('TC-B-03: should parse diff with only header line', () => {
      // Given: diff --git 行のみの出力
      const diffText = 'diff --git a/src/foo.ts b/src/foo.ts';

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: ファイルが1つ抽出される（changeType=modified がデフォルト）
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0].path, 'src/foo.ts');
      assert.strictEqual(result.files[0].changeType, 'modified');
    });

    // TC-B-04: 同一パスが複数回出現（重複除外）
    // Given: 同一パスが複数回出現する diff 出力
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: 重複が除外される（rename が優先）
    test('TC-B-04: should deduplicate files with same path, preferring renamed', () => {
      // Given: 同一パスが複数回出現する diff 出力（rename が後から来る）
      const diffText = `diff --git a/src/foo.ts b/src/foo.ts
index abc1234..def5678 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1 +1 @@
-old
+new
diff --git a/src/bar.ts b/src/foo.ts
similarity index 95%
rename from src/bar.ts
rename to src/foo.ts`;

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: 重複が除外され、renamed が優先される
      const foo = result.files.filter(f => f.path === 'src/foo.ts');
      assert.strictEqual(foo.length, 1);
      assert.strictEqual(foo[0].changeType, 'renamed');
      assert.strictEqual(foo[0].oldPath, 'src/bar.ts');
    });

    // TC-E-01: 不正な diff --git 行（パス不足）
    // Given: パスが不足した不正な diff --git 行
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: その行はスキップされる
    test('TC-E-01: should skip invalid diff --git line with insufficient paths', () => {
      // Given: パスが不足した不正な diff --git 行
      const diffText = `diff --git a/only-one-path.ts
diff --git a/valid.ts b/valid.ts
--- a/valid.ts
+++ b/valid.ts`;

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: 不正な行はスキップされ、有効なファイルのみ抽出
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0].path, 'valid.ts');
    });

    // TC-N-06: スペースを含むパス（クォート形式）
    // Given: スペースを含むパスがクォートされた diff 出力
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: パスが正しくデコードされる
    test('TC-N-06: should parse quoted paths with spaces', () => {
      // Given: スペースを含むパスがクォートされた diff 出力
      const diffText = 'diff --git "a/src/my file.ts" "b/src/my file.ts"';

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: パスが正しくデコードされる
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0].path, 'src/my file.ts');
    });

    // TC-N-07: UTF-8 8進数エスケープ（日本語ファイル名）
    // Given: 日本語ファイル名が8進数エスケープされた diff 出力
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: パスが正しくデコードされる
    test('TC-N-07: should parse octal-escaped UTF-8 paths (Japanese filename)', () => {
      // Given: 日本語ファイル名「あ.ts」が8進数エスケープされた diff 出力
      // 「あ」= UTF-8: E3 81 82 = 8進数: \343\201\202
      const diffText = 'diff --git "a/src/\\343\\201\\202.ts" "b/src/\\343\\201\\202.ts"';

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: パスが正しくデコードされる
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0].path, 'src/あ.ts');
    });

    // TC-N-08: エスケープシーケンス（\n, \t, \\, \"）
    // Given: 各種エスケープシーケンスを含むパス
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: エスケープが正しくデコードされる
    test('TC-N-08: should parse escape sequences in quoted paths', () => {
      // Given: タブとバックスラッシュを含むパス
      const diffText = 'diff --git "a/src/tab\\there.ts" "b/src/tab\\there.ts"';

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: エスケープが正しくデコードされる（\t -> タブ文字）
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0].path, 'src/tab\there.ts');
    });

    // TC-N-09: バックスラッシュエスケープ
    // Given: バックスラッシュを含むパス（\\）
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: バックスラッシュが正しくデコードされる
    test('TC-N-09: should parse escaped backslash in quoted paths', () => {
      // Given: バックスラッシュを含むパス
      const diffText = 'diff --git "a/src/back\\\\slash.ts" "b/src/back\\\\slash.ts"';

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: バックスラッシュが正しくデコードされる
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0].path, 'src/back\\slash.ts');
    });

    // TC-N-10: ダブルクォートエスケープ
    // Given: ダブルクォートを含むパス（\"）
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: ダブルクォートが正しくデコードされる
    test('TC-N-10: should parse escaped double quote in quoted paths', () => {
      // Given: ダブルクォートを含むパス
      const diffText = 'diff --git "a/src/quote\\"here.ts" "b/src/quote\\"here.ts"';

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: ダブルクォートが正しくデコードされる
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0].path, 'src/quote"here.ts');
    });

    // TC-B-05: 8進数エスケープ最大3桁（\377 = 255）
    // Given: 最大値の8進数エスケープ
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: 正しくデコードされる
    test('TC-B-05: should parse maximum 3-digit octal escape', () => {
      // Given: \177 (DEL文字, 127) を含むパス
      const diffText = 'diff --git "a/src/del\\177char.ts" "b/src/del\\177char.ts"';

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: 正しくデコードされる
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0].path, 'src/del\x7Fchar.ts');
    });

    // TC-E-02: パスが a/ または b/ で始まらない
    // Given: 標準形式でないパス
    // When: analyzeGitUnifiedDiff を呼び出す
    // Then: その行はスキップされる
    test('TC-E-02: should skip diff line without a/ or b/ prefix', () => {
      // Given: 標準形式でないパス
      const diffText = `diff --git src/foo.ts src/foo.ts
diff --git a/valid.ts b/valid.ts`;

      // When: analyzeGitUnifiedDiff を呼び出す
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: 不正な行はスキップされ、有効なファイルのみ抽出
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0].path, 'valid.ts');
    });
  });

  suite('extractChangedPaths', () => {
    // TC-N-11: 正常な GitDiffAnalysis から パス配列を抽出
    // Given: 複数ファイルを含む GitDiffAnalysis
    // When: extractChangedPaths を呼び出す
    // Then: パスの配列が返される
    test('TC-N-11: should extract paths from GitDiffAnalysis', () => {
      // Given: 複数ファイルを含む GitDiffAnalysis
      const analysis: GitDiffAnalysis = {
        files: [
          { path: 'src/foo.ts', changeType: 'modified' },
          { path: 'src/bar.ts', changeType: 'added' },
          { path: 'src/baz.ts', changeType: 'deleted' },
        ],
      };

      // When: extractChangedPaths を呼び出す
      const paths = extractChangedPaths(analysis);

      // Then: パスの配列が返される
      assert.deepStrictEqual(paths, ['src/foo.ts', 'src/bar.ts', 'src/baz.ts']);
    });

    // TC-B-06: 空の files 配列
    // Given: files が空の GitDiffAnalysis
    // When: extractChangedPaths を呼び出す
    // Then: 空配列が返される
    test('TC-B-06: should return empty array for empty files', () => {
      // Given: files が空の GitDiffAnalysis
      const analysis: GitDiffAnalysis = { files: [] };

      // When: extractChangedPaths を呼び出す
      const paths = extractChangedPaths(analysis);

      // Then: 空配列が返される
      assert.deepStrictEqual(paths, []);
    });
  });

  suite('getCommitRangeDiff / getWorkingTreeDiff deterministic coverage', () => {
    const workspaceRoot = process.cwd();

    // Test Perspectives Table
    // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
    // |---------|----------------------|--------------------------------------|-----------------|-------|
    // | TC-GITDIFF-N-01 | range diff stdout ends with newline | Equivalence – normal | Returns stdout.trimEnd() and calls git diff --no-color <range> | - |
    // | TC-WTD-N-01 | mode="staged" with trailing newline | Equivalence – normal | Returns trimmed staged diff; calls git diff --cached --no-color | - |
    // | TC-WTD-N-02 | mode="unstaged" with trailing newline | Equivalence – normal | Returns trimmed unstaged diff; calls git diff --no-color | - |
    // | TC-WTD-N-03 | mode="both", both non-empty | Equivalence – normal | Returns "staged\\n\\nunstaged" after trimEnd | - |
    // | TC-WTD-B-01 | mode="both", staged empty | Boundary – empty | Returns unstaged only (no extra blank lines) | - |
    // | TC-WTD-B-02 | mode="both", both empty | Boundary – empty | Returns empty string | - |
    // | TC-WTD-E-01 | execGitStdout throws | Error – exception | getWorkingTreeDiff rejects with the same error | Validate type/message |

    let originalExecGitStdout: typeof gitExecModule.execGitStdout;
    let execCalls: Array<{ cwd: string; args: string[]; maxBufferBytes: number }> = [];
    let stagedOut = '';
    let unstagedOut = '';
    let commitRangeOut = '';
    let shouldThrow = false;

    setup(() => {
      execCalls = [];
      stagedOut = '';
      unstagedOut = '';
      commitRangeOut = '';
      shouldThrow = false;

      originalExecGitStdout = gitExecModule.execGitStdout;
      (gitExecModule as unknown as { execGitStdout: typeof gitExecModule.execGitStdout }).execGitStdout = async (
        cwd,
        args,
        maxBufferBytes,
      ) => {
        execCalls.push({ cwd, args, maxBufferBytes });
        if (shouldThrow) {
          throw new Error('execGitStdout failed');
        }
        if (args[0] === 'diff' && args[1] === '--cached' && args[2] === '--no-color') {
          return stagedOut;
        }
        if (args[0] === 'diff' && args[1] === '--no-color' && args.length === 2) {
          return unstagedOut;
        }
        if (args[0] === 'diff' && args[1] === '--no-color' && args.length === 3) {
          return commitRangeOut;
        }
        throw new Error(`Unexpected git args: ${args.join(' ')}`);
      };
    });

    teardown(() => {
      (gitExecModule as unknown as { execGitStdout: typeof originalExecGitStdout }).execGitStdout = originalExecGitStdout;
    });

    test('TC-GITDIFF-N-01: getCommitRangeDiff returns trimEnd() output and passes correct args', async () => {
      // Given: range diff の stdout が末尾改行を含む
      const range = 'main..HEAD';
      commitRangeOut = 'RANGE_DIFF\n\n';

      // When: getCommitRangeDiff を呼び出す
      const result = await getCommitRangeDiff(workspaceRoot, range);

      // Then: trimEnd され、git diff --no-color <range> が呼ばれる
      assert.strictEqual(result, 'RANGE_DIFF');
      assert.deepStrictEqual(execCalls, [
        { cwd: workspaceRoot, args: ['diff', '--no-color', range], maxBufferBytes: 20 * 1024 * 1024 },
      ]);
    });

    test('TC-WTD-N-01: getWorkingTreeDiff staged returns trimmed staged diff', async () => {
      // Given: staged diff が末尾改行を含む
      stagedOut = 'STAGED\n';

      // When: staged を取得する
      const result = await getWorkingTreeDiff(workspaceRoot, 'staged');

      // Then: trimEnd された内容が返る
      assert.strictEqual(result, 'STAGED');
      assert.deepStrictEqual(execCalls, [
        { cwd: workspaceRoot, args: ['diff', '--cached', '--no-color'], maxBufferBytes: 20 * 1024 * 1024 },
      ]);
    });

    test('TC-WTD-N-02: getWorkingTreeDiff unstaged returns trimmed unstaged diff', async () => {
      // Given: unstaged diff が末尾改行を含む
      unstagedOut = 'UNSTAGED\n';

      // When: unstaged を取得する
      const result = await getWorkingTreeDiff(workspaceRoot, 'unstaged');

      // Then: trimEnd された内容が返る
      assert.strictEqual(result, 'UNSTAGED');
      assert.deepStrictEqual(execCalls, [{ cwd: workspaceRoot, args: ['diff', '--no-color'], maxBufferBytes: 20 * 1024 * 1024 }]);
    });

    test('TC-WTD-N-03: getWorkingTreeDiff both joins non-empty staged+unstaged with blank line', async () => {
      // Given: staged/unstaged が両方とも非空
      stagedOut = 'S\n';
      unstagedOut = 'U\n';

      // When: both を取得する
      const result = await getWorkingTreeDiff(workspaceRoot, 'both');

      // Then: trimEnd 後に空行で連結される
      assert.strictEqual(result, 'S\n\nU');
      assert.deepStrictEqual(execCalls, [
        { cwd: workspaceRoot, args: ['diff', '--cached', '--no-color'], maxBufferBytes: 20 * 1024 * 1024 },
        { cwd: workspaceRoot, args: ['diff', '--no-color'], maxBufferBytes: 20 * 1024 * 1024 },
      ]);
    });

    test('TC-WTD-B-01: getWorkingTreeDiff both omits empty staged and returns unstaged only', async () => {
      // Given: staged が空で、unstaged のみ存在
      stagedOut = '';
      unstagedOut = 'U\n';

      // When: both を取得する
      const result = await getWorkingTreeDiff(workspaceRoot, 'both');

      // Then: 余計な改行なしで unstaged のみが返る
      assert.strictEqual(result, 'U');
    });

    test('TC-WTD-B-02: getWorkingTreeDiff both returns empty string when both empty', async () => {
      // Given: staged/unstaged ともに空
      stagedOut = '';
      unstagedOut = '';

      // When: both を取得する
      const result = await getWorkingTreeDiff(workspaceRoot, 'both');

      // Then: 空文字列が返る
      assert.strictEqual(result, '');
    });

    test('TC-WTD-E-01: getWorkingTreeDiff rejects when execGitStdout throws', async () => {
      // Given: execGitStdout が例外を投げる
      shouldThrow = true;

      // When/Then: 例外が伝播する
      await assert.rejects(
        getWorkingTreeDiff(workspaceRoot, 'staged'),
        (e: unknown) => e instanceof Error && e.message === 'execGitStdout failed',
      );
    });
  });
});
