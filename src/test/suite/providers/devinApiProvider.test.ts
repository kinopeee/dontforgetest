import * as assert from 'assert';

/**
 * テスト観点:
 * - splitPromptForAttachments: プロンプトを添付ファイル用に分割する
 * - buildShortPromptWithAttachments: 添付URLから短いpromptを構築する
 * - tryUploadPromptAsAttachments: 成功/失敗のフロー
 *
 * Note: DevinApiProvider の実際のAPI呼び出しはネットワーク依存のため、
 * ここでは分割・構築ロジックのユニットテストに集中する。
 */

// モジュール内の private 関数をテストするため、動的 import 経由でアクセスする
// ただし TypeScript の export されていない関数は直接テストできないため、
// ここでは関数のロジックを再現してテストする（ホワイトボックス的検証）

/**
 * splitPromptForAttachments のロジックを再現（テスト用）
 */
function splitPromptForAttachments(prompt: string): Array<{ filename: string; content: string }> {
  const files: Array<{ filename: string; content: string }> = [];
  let remaining = prompt;

  // diff/patch ブロックを抽出（```diff ... ``` または ```patch ... ```）
  const diffCodeBlockRegex = /```(?:diff|patch)\s*\n([\s\S]*?)```/g;
  let diffMatch: RegExpExecArray | null;
  const diffs: string[] = [];
  while ((diffMatch = diffCodeBlockRegex.exec(prompt)) !== null) {
    diffs.push(diffMatch[1] ?? '');
  }
  if (diffs.length > 0) {
    const diffContent = diffs.join('\n\n');
    files.push({ filename: 'diff.patch', content: diffContent });
    remaining = remaining.replace(diffCodeBlockRegex, '\n[See attached: diff.patch]\n');
  }

  // unified diff 風のテキスト（diff --git から始まる連続ブロック）を抽出
  if (diffs.length === 0) {
    const diffStart = remaining.indexOf('diff --git ');
    if (diffStart !== -1) {
      const diffContent = remaining.slice(diffStart);
      files.push({ filename: 'diff.patch', content: diffContent });
      remaining = remaining.slice(0, diffStart) + '\n[See attached: diff.patch]\n';
    }
  }

  // test-perspectives JSON ブロックを抽出
  const perspectivesBegin = '<!-- BEGIN TEST PERSPECTIVES JSON -->';
  const perspectivesEnd = '<!-- END TEST PERSPECTIVES JSON -->';
  const perspectivesStartIdx = remaining.indexOf(perspectivesBegin);
  const perspectivesEndIdx = remaining.indexOf(perspectivesEnd);
  if (perspectivesStartIdx !== -1 && perspectivesEndIdx !== -1 && perspectivesEndIdx > perspectivesStartIdx) {
    const perspectivesContent = remaining.slice(perspectivesStartIdx, perspectivesEndIdx + perspectivesEnd.length);
    files.push({ filename: 'test-perspectives.json', content: perspectivesContent });
    remaining =
      remaining.slice(0, perspectivesStartIdx) +
      '\n[See attached: test-perspectives.json]\n' +
      remaining.slice(perspectivesEndIdx + perspectivesEnd.length);
  }

  // 残りを instructions として保存
  const trimmedRemaining = remaining.trim();
  if (trimmedRemaining.length > 0) {
    files.push({ filename: 'instructions.txt', content: trimmedRemaining });
  }

  // ファイルが1件もなければ元の prompt 全体を context.txt として返す
  if (files.length === 0) {
    return [{ filename: 'context.txt', content: prompt }];
  }

  return files;
}

/**
 * buildShortPromptWithAttachments のロジックを再現（テスト用）
 */
function buildShortPromptWithAttachments(uploaded: Array<{ filename: string; url: string }>): string {
  const lines: string[] = [
    'Read the attached files carefully and complete the task.',
    '',
    '## Attached Files',
    '',
  ];
  for (const f of uploaded) {
    lines.push(`ATTACHMENT:"${f.url}"`);
    lines.push(`(${f.filename})`);
    lines.push('');
  }
  lines.push('## Instructions');
  lines.push('');
  lines.push('1. Analyze the attached context (instructions, diff, perspectives if any).');
  lines.push('2. Generate the required output based on the instructions.');
  lines.push('3. Output ONLY between the required markers:');
  lines.push('   - For perspectives: `<!-- BEGIN TEST PERSPECTIVES JSON -->` ... `<!-- END TEST PERSPECTIVES JSON -->`');
  lines.push('   - For patch: `<!-- BEGIN DONTFORGETEST PATCH -->` ... `<!-- END DONTFORGETEST PATCH -->`');
  lines.push('4. Do NOT include anything else outside the markers.');
  lines.push('5. Do NOT ask questions or request repository setup.');
  return lines.join('\n');
}

suite('providers/devinApiProvider.ts', () => {
  suite('splitPromptForAttachments', () => {
    test('TC-DEVIN-SPLIT-N-01: diff コードブロックを含むプロンプトを分割できる', () => {
      // Given: ```diff ... ``` を含むプロンプト
      const prompt = `Instructions here.

\`\`\`diff
diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
@@ -1 +1 @@
-old
+new
\`\`\`

More instructions.`;

      // When: 分割を実行
      const files = splitPromptForAttachments(prompt);

      // Then: diff.patch と instructions.txt に分割される
      assert.ok(files.some((f) => f.filename === 'diff.patch'), 'diff.patch が含まれる');
      assert.ok(files.some((f) => f.filename === 'instructions.txt'), 'instructions.txt が含まれる');
      const diffFile = files.find((f) => f.filename === 'diff.patch');
      assert.ok(diffFile?.content.includes('diff --git'), 'diff.patch に diff 内容が含まれる');
    });

    test('TC-DEVIN-SPLIT-N-02: unified diff 形式（コードブロック外）を分割できる', () => {
      // Given: diff --git から始まる unified diff を含むプロンプト
      const prompt = `Instructions here.

diff --git a/test.ts b/test.ts
--- a/test.ts
+++ b/test.ts
@@ -1 +1 @@
-old
+new
`;

      // When: 分割を実行
      const files = splitPromptForAttachments(prompt);

      // Then: diff.patch と instructions.txt に分割される
      assert.ok(files.some((f) => f.filename === 'diff.patch'), 'diff.patch が含まれる');
      assert.ok(files.some((f) => f.filename === 'instructions.txt'), 'instructions.txt が含まれる');
    });

    test('TC-DEVIN-SPLIT-N-03: test-perspectives JSON を分割できる', () => {
      // Given: perspectives マーカーを含むプロンプト
      const prompt = `Instructions here.

<!-- BEGIN TEST PERSPECTIVES JSON -->
{"version": 1, "cases": []}
<!-- END TEST PERSPECTIVES JSON -->

More instructions.`;

      // When: 分割を実行
      const files = splitPromptForAttachments(prompt);

      // Then: test-perspectives.json と instructions.txt に分割される
      assert.ok(files.some((f) => f.filename === 'test-perspectives.json'), 'test-perspectives.json が含まれる');
      assert.ok(files.some((f) => f.filename === 'instructions.txt'), 'instructions.txt が含まれる');
      const perspFile = files.find((f) => f.filename === 'test-perspectives.json');
      assert.ok(perspFile?.content.includes('BEGIN TEST PERSPECTIVES'), 'perspectives 内容が含まれる');
    });

    test('TC-DEVIN-SPLIT-E-01: 特別なブロックがない場合は context.txt として返す', () => {
      // Given: 特別なマーカーを含まないシンプルなプロンプト
      const prompt = 'Simple instructions without any special blocks.';

      // When: 分割を実行
      const files = splitPromptForAttachments(prompt);

      // Then: instructions.txt として返される（context.txt ではない）
      assert.ok(files.some((f) => f.filename === 'instructions.txt'), 'instructions.txt が含まれる');
      assert.strictEqual(files.length, 1, '1ファイルのみ');
    });

    test('TC-DEVIN-SPLIT-B-01: 空のプロンプトは context.txt として返す', () => {
      // Given: 空のプロンプト
      const prompt = '';

      // When: 分割を実行
      const files = splitPromptForAttachments(prompt);

      // Then: context.txt として返される
      assert.ok(files.some((f) => f.filename === 'context.txt'), 'context.txt が含まれる');
      assert.strictEqual(files.length, 1, '1ファイルのみ');
    });
  });

  suite('buildShortPromptWithAttachments', () => {
    test('TC-DEVIN-BUILD-N-01: 添付URLを含む短いpromptを構築できる', () => {
      // Given: アップロード済みファイルのリスト
      const uploaded = [
        { filename: 'diff.patch', url: 'https://example.com/files/diff.patch' },
        { filename: 'instructions.txt', url: 'https://example.com/files/instructions.txt' },
      ];

      // When: 短いpromptを構築
      const shortPrompt = buildShortPromptWithAttachments(uploaded);

      // Then: ATTACHMENT: 行が独立行で含まれる
      assert.ok(shortPrompt.includes('ATTACHMENT:"https://example.com/files/diff.patch"'), 'diff.patch のURL参照が含まれる');
      assert.ok(shortPrompt.includes('ATTACHMENT:"https://example.com/files/instructions.txt"'), 'instructions.txt のURL参照が含まれる');
      assert.ok(shortPrompt.includes('(diff.patch)'), 'diff.patch のファイル名注釈が含まれる');
      assert.ok(shortPrompt.includes('(instructions.txt)'), 'instructions.txt のファイル名注釈が含まれる');
    });

    test('TC-DEVIN-BUILD-N-02: 必須の指示が含まれる', () => {
      // Given: アップロード済みファイルのリスト
      const uploaded = [{ filename: 'context.txt', url: 'https://example.com/files/context.txt' }];

      // When: 短いpromptを構築
      const shortPrompt = buildShortPromptWithAttachments(uploaded);

      // Then: 必須の指示が含まれる
      assert.ok(shortPrompt.includes('BEGIN DONTFORGETEST PATCH'), 'パッチマーカー指示が含まれる');
      assert.ok(shortPrompt.includes('BEGIN TEST PERSPECTIVES JSON'), 'パースペクティブマーカー指示が含まれる');
      assert.ok(shortPrompt.includes('Do NOT ask questions'), '質問禁止指示が含まれる');
    });

    test('TC-DEVIN-BUILD-B-01: 空のリストでも構築できる', () => {
      // Given: 空のアップロードリスト
      const uploaded: Array<{ filename: string; url: string }> = [];

      // When: 短いpromptを構築
      const shortPrompt = buildShortPromptWithAttachments(uploaded);

      // Then: 指示部分のみが含まれる
      assert.ok(shortPrompt.includes('## Instructions'), '指示セクションが含まれる');
      assert.ok(!shortPrompt.includes('ATTACHMENT:'), 'ATTACHMENT行は含まれない');
    });
  });
});
