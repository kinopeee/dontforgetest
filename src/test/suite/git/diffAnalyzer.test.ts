import * as assert from 'assert';
import * as gitExecModule from '../../../git/gitExec';
import {
  analyzeGitUnifiedDiff,
  extractChangedPaths,
  getCommitRangeDiff,
  getWorkingTreeDiff,
  GitDiffAnalysis,
} from '../../../git/diffAnalyzer';

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

    // TC-GD-PARSE-B-01
    test('TC-GD-PARSE-B-01: should decode \\n escape in quoted paths', () => {
      // Given: A diff line with a quoted path that contains \\n escape
      const diffText = 'diff --git "a/src/line\\nfeed.ts" "b/src/line\\nfeed.ts"';

      // When: analyzeGitUnifiedDiff is called
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: The parsed path contains an actual LF character
      assert.strictEqual(result.files.length, 1);
      assert.ok(result.files[0]?.path.includes('\n'), 'Expected parsed path to include an actual newline character');
    });

    // TC-GD-PARSE-B-02
    test('TC-GD-PARSE-B-02: should treat unknown escape sequences as literal characters', () => {
      // Given: A diff line with an unknown escape (\\q)
      const diffText = 'diff --git "a/src/unk\\qhere.ts" "b/src/unk\\qhere.ts"';

      // When: analyzeGitUnifiedDiff is called
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: The escape is decoded as the literal next character (q)
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0]?.path, 'src/unkqhere.ts');
    });

    test('TC-GD-ADD-N-01: should parse diff --git line with trailing spaces after tokens', () => {
      // Given: A diff line with trailing spaces after the second token
      const diffText = 'diff --git a/src/trailing.ts b/src/trailing.ts   ';

      // When: analyzeGitUnifiedDiff is called
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: Parsing succeeds and returns a single changed file
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0]?.path, 'src/trailing.ts');
      assert.strictEqual(result.files[0]?.changeType, 'modified');
    });

    test('TC-GD-ADD-N-02: should decode \\r, \\b, \\f, \\v escapes in quoted paths', () => {
      // Given: A diff line with quoted paths that contain escape sequences
      const diffText = 'diff --git "a/src/a\\r\\b\\f\\v.ts" "b/src/a\\r\\b\\f\\v.ts"';

      // When: analyzeGitUnifiedDiff is called
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: Escapes are decoded to control characters
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0]?.path, 'src/a\r\b\f\v.ts');
    });

    test('TC-GD-ADD-B-01: should decode short octal escape and continue after non-octal char', () => {
      // Given: A diff line with a short octal escape followed by a non-octal char (\\12x)
      const diffText = 'diff --git "a/src/oct\\12x.ts" "b/src/oct\\12x.ts"';

      // When: analyzeGitUnifiedDiff is called
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: Octal part is decoded and parsing continues
      assert.strictEqual(result.files.length, 1);
      assert.strictEqual(result.files[0]?.path, 'src/oct\nx.ts');
    });

    test('TC-GD-ADD-E-01: should skip quoted diff --git line with only one token (missing second path)', () => {
      // Given: A quoted diff line that has only one token
      const diffText = 'diff --git "a/src/only-one.ts"';

      // When: analyzeGitUnifiedDiff is called
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: The invalid line is skipped
      assert.strictEqual(result.files.length, 0);
    });

    test('TC-GD-ADD-E-02: should skip quoted diff --git line when tokens do not start with a/ and b/', () => {
      // Given: Quoted tokens that do not start with a/ and b/
      const diffText = 'diff --git "src/no-prefix.ts" "src/no-prefix.ts"';

      // When: analyzeGitUnifiedDiff is called
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: The invalid line is skipped
      assert.strictEqual(result.files.length, 0);
    });

    test('TC-GD-ADD-E-03: should skip diff --git line with only spaces after the keyword', () => {
      // Given: A diff line with only spaces after diff --git
      const diffText = 'diff --git     ';

      // When: analyzeGitUnifiedDiff is called
      const result = analyzeGitUnifiedDiff(diffText);

      // Then: The line is skipped
      assert.strictEqual(result.files.length, 0);
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

  suite('getCommitRangeDiff', () => {
    let originalExecGitStdout: typeof gitExecModule.execGitStdout;
    const calls: Array<{ cwd: string; args: string[]; maxBufferBytes: number }> = [];

    setup(() => {
      originalExecGitStdout = gitExecModule.execGitStdout;
      calls.length = 0;
    });

    teardown(() => {
      (gitExecModule as unknown as { execGitStdout: typeof originalExecGitStdout }).execGitStdout = originalExecGitStdout;
    });

    // TC-GD-CR-N-01
    test('TC-GD-CR-N-01: should return trimEnd()-ed diff and call execGitStdout with expected args', async () => {
      // Given: execGitStdout is stubbed to return a diff with trailing newlines
      (gitExecModule as unknown as { execGitStdout: typeof gitExecModule.execGitStdout }).execGitStdout = async (
        cwd: string,
        args: string[],
        maxBufferBytes: number,
      ) => {
        calls.push({ cwd, args, maxBufferBytes });
        return 'diff --git a/a.ts b/a.ts\n+new\n\n';
      };

      // When: getCommitRangeDiff is called
      const workspaceRoot = '/tmp/repo';
      const range = 'main..HEAD';
      const result = await getCommitRangeDiff(workspaceRoot, range);

      // Then: Output is trimEnd()-ed and execGitStdout is called with expected args
      assert.strictEqual(result.endsWith('\n'), false, 'Expected trimEnd() to remove trailing newline');
      assert.strictEqual(calls.length, 1);
      assert.strictEqual(calls[0]?.cwd, workspaceRoot);
      assert.deepStrictEqual(calls[0]?.args, ['diff', '--no-color', range]);
      assert.strictEqual(calls[0]?.maxBufferBytes, 20 * 1024 * 1024);
    });

    // TC-GD-CR-E-01
    test('TC-GD-CR-E-01: should reject when execGitStdout throws', async () => {
      // Given: execGitStdout throws
      (gitExecModule as unknown as { execGitStdout: typeof gitExecModule.execGitStdout }).execGitStdout = async () => {
        throw new Error('git failed');
      };

      // When/Then: getCommitRangeDiff rejects with the same error
      await assert.rejects(async () => await getCommitRangeDiff('/tmp/repo', 'HEAD~1..HEAD'), /git failed/);
    });
  });

  suite('getWorkingTreeDiff', () => {
    let originalExecGitStdout: typeof gitExecModule.execGitStdout;
    const calls: Array<{ cwd: string; args: string[]; maxBufferBytes: number }> = [];

    setup(() => {
      originalExecGitStdout = gitExecModule.execGitStdout;
      calls.length = 0;
    });

    teardown(() => {
      (gitExecModule as unknown as { execGitStdout: typeof originalExecGitStdout }).execGitStdout = originalExecGitStdout;
    });

    // TC-GD-WT-N-01
    test('TC-GD-WT-N-01: staged mode calls git diff --cached and returns trimmed output', async () => {
      // Given: execGitStdout returns staged diff with trailing newline
      (gitExecModule as unknown as { execGitStdout: typeof gitExecModule.execGitStdout }).execGitStdout = async (
        cwd: string,
        args: string[],
        maxBufferBytes: number,
      ) => {
        calls.push({ cwd, args, maxBufferBytes });
        return 'staged\n\n';
      };

      // When: getWorkingTreeDiff is called
      const result = await getWorkingTreeDiff('/tmp/repo', 'staged');

      // Then: trimEnd() applied and args match
      assert.strictEqual(result, 'staged');
      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0]?.args, ['diff', '--cached', '--no-color']);
      assert.strictEqual(calls[0]?.maxBufferBytes, 20 * 1024 * 1024);
    });

    // TC-GD-WT-N-02
    test('TC-GD-WT-N-02: unstaged mode calls git diff and returns trimmed output', async () => {
      // Given: execGitStdout returns unstaged diff with trailing newline
      (gitExecModule as unknown as { execGitStdout: typeof gitExecModule.execGitStdout }).execGitStdout = async (
        cwd: string,
        args: string[],
        maxBufferBytes: number,
      ) => {
        calls.push({ cwd, args, maxBufferBytes });
        return 'unstaged\n';
      };

      // When: getWorkingTreeDiff is called
      const result = await getWorkingTreeDiff('/tmp/repo', 'unstaged');

      // Then: trimEnd() applied and args match
      assert.strictEqual(result, 'unstaged');
      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0]?.args, ['diff', '--no-color']);
      assert.strictEqual(calls[0]?.maxBufferBytes, 20 * 1024 * 1024);
    });

    // TC-GD-WT-B-01
    test('TC-GD-WT-B-01: both mode returns unstaged only when staged is empty', async () => {
      // Given: execGitStdout returns empty staged and non-empty unstaged
      let callIndex = 0;
      (gitExecModule as unknown as { execGitStdout: typeof gitExecModule.execGitStdout }).execGitStdout = async (
        cwd: string,
        args: string[],
        maxBufferBytes: number,
      ) => {
        calls.push({ cwd, args, maxBufferBytes });
        callIndex += 1;
        return callIndex === 1 ? '' : 'unstaged\n';
      };

      // When: getWorkingTreeDiff is called
      const result = await getWorkingTreeDiff('/tmp/repo', 'both');

      // Then: It returns only unstaged with no extra blank lines
      assert.strictEqual(result, 'unstaged');
      assert.strictEqual(calls.length, 2);
      assert.deepStrictEqual(calls[0]?.args, ['diff', '--cached', '--no-color']);
      assert.deepStrictEqual(calls[1]?.args, ['diff', '--no-color']);
    });

    // TC-GD-WT-B-02
    test('TC-GD-WT-B-02: both mode concatenates staged and unstaged with a blank line', async () => {
      // Given: execGitStdout returns non-empty staged and unstaged
      let callIndex = 0;
      (gitExecModule as unknown as { execGitStdout: typeof gitExecModule.execGitStdout }).execGitStdout = async () => {
        callIndex += 1;
        return callIndex === 1 ? 'staged\n' : 'unstaged\n';
      };

      // When: getWorkingTreeDiff is called
      const result = await getWorkingTreeDiff('/tmp/repo', 'both');

      // Then: It concatenates both diffs with a blank line
      assert.strictEqual(result, 'staged\n\nunstaged');
    });

    // TC-GD-WT-E-01
    test('TC-GD-WT-E-01: should reject when execGitStdout throws', async () => {
      // Given: execGitStdout throws
      (gitExecModule as unknown as { execGitStdout: typeof gitExecModule.execGitStdout }).execGitStdout = async () => {
        throw new Error('git diff failed');
      };

      // When/Then: getWorkingTreeDiff rejects with the same error
      await assert.rejects(async () => await getWorkingTreeDiff('/tmp/repo', 'staged'), /git diff failed/);
    });
  });
});
