import * as path from 'path';
import * as vscode from 'vscode';

export interface TestGenLanguageConfig {
  answerLanguage: string;
  commentLanguage: string;
  perspectiveTableLanguage: string;
}

export interface BuildPromptOptions {
  workspaceRoot: string;
  /** 対象の説明（例: 現在のファイル、最新コミット差分） */
  targetLabel: string;
  /** エージェントに読ませたい対象ファイル（ワークスペース相対でも可） */
  targetPaths: string[];
  /** テスト戦略ルールファイル（既定: docs/test-strategy.md） */
  testStrategyPath: string;
}

export interface BuildPerspectivePromptOptions extends BuildPromptOptions {
  /** 差分など参考情報（任意） */
  referenceText?: string;
}

/**
 * テスト生成用のプロンプトを構築する。
 * - docs/test-strategy.md を読み取り、ルールをプロンプトへ注入する
 * - 先頭の testgen-agent-config コメントから出力言語を解決する
 */
export async function buildTestGenPrompt(options: BuildPromptOptions): Promise<{ prompt: string; languages: TestGenLanguageConfig }> {
  const { strategyText, languages } = await readStrategyAndLanguages(options.workspaceRoot, options.testStrategyPath);

  const targetsText = options.targetPaths
    .map((p) => `- ${p}`)
    .join('\n');

  // cursor-agent はプロンプト中にファイルパスが含まれると、必要に応じて読み取り/編集を行える。
  const prompt = [
    `あなたはソフトウェアエンジニアです。以下の対象に対して、ユニットテストを追加/更新してください。`,
    ``,
    `## 対象`,
    `- 実行種別: ${options.targetLabel}`,
    `- 対象ファイル:`,
    targetsText,
    ``,
    `## 実行フロー（必須）`,
    `この拡張機能の所定フローは **「テスト生成 →（拡張機能がオーケストレーションして）テスト実行（testCommand）→ レポート保存」** です。`,
    `※ テスト実行は拡張機能側が担当し、設定により「拡張機能プロセスで実行」または「cursor-agent 経由で実行」します。`,
    `あなた（cursor-agent）は次を厳守してください。`,
    `- **あなた自身でテストを実行しない**（shellツールは使わない / \`npm test\` 等を走らせない）`,
    `- **デバッグ開始・ウォッチ開始・対話的セッション開始をしない**（テスト実行後にデバッグへ移行しない）`,
    `- **修正（プロダクションコードの変更）は行わない**（テストコードの追加/更新のみ行う）`,
    `- 必要なら「追加したテストの概要」と「注意点（既知の制約/未対応）」を短く文章で報告して終了する`,
    ``,
    `## 出力言語（必須）`,
    `- 説明文（テーブル以外）: ${languages.answerLanguage}`,
    `- テストコード内コメント: ${languages.commentLanguage}`,
    `- テスト観点表（Markdown）: ${languages.perspectiveTableLanguage}`,
    ``,
    `## 変更範囲の制約（必須）`,
    `- 変更してよいのは **テストコード（例: \`src/test/**\`, \`**/*.test.ts\`）のみ**`,
    `- アプリ本体/拡張機能本体の実装（\`src/**\` のうちテスト以外）を「直す」ための編集は禁止`,
    `- もしテストを成立させるために実装側の修正が必要だと判断した場合は、**修正せず**に、その旨と理由を報告して終了する`,
    ``,
    `## ツール使用制約（必須）`,
    `- **shell（コマンド実行）ツールは使用禁止**（\`git diff\` / \`npm test\` 等を実行しない）`,
    `- **VS Code / Cursor 等のGUIアプリを起動する操作は禁止**（別プロセス起動の回避）`,
    `- 必要な情報は、対象ファイルの読み取り（read）と、こちらから提示する差分/対象パスから判断すること`,
    ``,
    `## テスト戦略ルール（必須）`,
    `以下のルールを必ず遵守してください（原文を貼り付けます）。`,
    ``,
    strategyText.trim(),
    ``,
    `## 実装上の注意`,
    `- 既存のテストフレームワーク/テスト配置規約があればそれに従うこと`,
    `- テストは実行可能な状態で追加すること（必要な import / setup を含める）`,
    `- 既存テストの軽微な修正だけで済む場合でも、ルールに反しないこと`,
  ].join('\n');

  return { prompt, languages };
}

/**
 * テスト観点表「だけ」を生成させるプロンプトを構築する。
 *
 * 方針:
 * - 観点表（Markdown）以外の文章やコードは出力させない
 * - マーカーで囲わせ、保存側が抽出できるようにする
 */
export async function buildTestPerspectivePrompt(
  options: BuildPerspectivePromptOptions,
): Promise<{ prompt: string; languages: TestGenLanguageConfig }> {
  const { strategyText, languages } = await readStrategyAndLanguages(options.workspaceRoot, options.testStrategyPath);

  const markerBegin = '<!-- BEGIN TEST PERSPECTIVES -->';
  const markerEnd = '<!-- END TEST PERSPECTIVES -->';

  const targetsText = options.targetPaths
    .map((p) => `- ${p}`)
    .join('\n');

  const parts: string[] = [];
  parts.push('あなたはソフトウェアエンジニアです。');
  parts.push('以下の対象について、テスト観点表（Markdown）**だけ**を作成してください。');
  parts.push('テストコードの生成、ファイルの編集、追加の説明文の出力は不要です。');
  parts.push('');
  parts.push('## 対象');
  parts.push(`- 実行種別: ${options.targetLabel}`);
  parts.push('- 対象ファイル:');
  parts.push(targetsText.length > 0 ? targetsText : '- (なし)');
  parts.push('');
  parts.push('## 出力言語（必須）');
  parts.push(`- テスト観点表（Markdown）: ${languages.perspectiveTableLanguage}`);
  parts.push('');
  parts.push('## 出力要件（必須）');
  parts.push('- 返答は **Markdown の観点表（テーブル）だけ** にする');
  parts.push('- 次のマーカーで出力全体を囲むこと（マーカー行も必ず含める）');
  parts.push(`  - ${markerBegin}`);
  parts.push(`  - ${markerEnd}`);
  parts.push('- テーブルの列は次を含めること: `Case ID`, `Input / Precondition`, `Perspective (Equivalence / Boundary)`, `Expected Result`, `Notes`');
  parts.push('- 正常系・異常系・境界値を網羅し、境界値は最低でも `0 / 最小値 / 最大値 / ±1 / 空 / NULL` を含める');
  parts.push('');
  parts.push('## ツール使用制約（必須）');
  parts.push('- **shell（コマンド実行）ツールは使用禁止**（`git diff` / `npm test` 等を実行しない）');
  parts.push('- **VS Code / Cursor 等のGUIアプリを起動する操作は禁止**（別プロセス起動の回避）');
  parts.push('- ファイルの編集/追加は不要（実施しない）');
  parts.push('');
  parts.push('## テスト戦略ルール（参考）');
  parts.push(strategyText.trim());

  if (options.referenceText && options.referenceText.trim().length > 0) {
    parts.push('');
    parts.push('## 参考（差分/補足情報）');
    parts.push('必要に応じて参照してください。');
    parts.push('');
    parts.push(options.referenceText.trim());
  }

  parts.push('');
  parts.push('## 出力フォーマット（必須）');
  parts.push(markerBegin);
  parts.push('| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |');
  parts.push('|--------|----------------------|---------------------------------------|-----------------|-------|');
  parts.push('| TC-N-01 | ... | Equivalence – normal | ... | - |');
  parts.push(markerEnd);

  return { prompt: parts.join('\n'), languages };
}

function toAbsolutePath(workspaceRoot: string, maybeRelativePath: string): string {
  return path.isAbsolute(maybeRelativePath) ? maybeRelativePath : path.join(workspaceRoot, maybeRelativePath);
}

async function readTextFile(absolutePath: string): Promise<string> {
  const data = await vscode.workspace.fs.readFile(vscode.Uri.file(absolutePath));
  return Buffer.from(data).toString('utf8');
}

async function readStrategyAndLanguages(
  workspaceRoot: string,
  testStrategyPath: string,
): Promise<{ strategyText: string; languages: TestGenLanguageConfig }> {
  const strategyAbsolutePath = toAbsolutePath(workspaceRoot, testStrategyPath);
  const strategyText = await readTextFile(strategyAbsolutePath);
  const languages = parseLanguageConfig(strategyText) ?? {
    answerLanguage: 'ja',
    commentLanguage: 'ja',
    perspectiveTableLanguage: 'ja',
  };
  return { strategyText, languages };
}

/**
 * docs/test-strategy.md の先頭コメントから出力言語を抽出する。
 *
 * 例:
 * <!-- testgen-agent-config: {"answerLanguage":"ja","commentLanguage":"ja","perspectiveTableLanguage":"ja"} -->
 */
export function parseLanguageConfig(strategyText: string): TestGenLanguageConfig | undefined {
  const firstLine = strategyText.split('\n')[0] ?? '';
  const match = firstLine.match(/<!--\s*testgen-agent-config:\s*(\{[\s\S]*\})\s*-->/);
  if (!match || !match[1]) {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    const rec = parsed as Record<string, unknown>;

    const answerLanguage = typeof rec.answerLanguage === 'string' ? rec.answerLanguage : undefined;
    const commentLanguage = typeof rec.commentLanguage === 'string' ? rec.commentLanguage : undefined;
    const perspectiveTableLanguage = typeof rec.perspectiveTableLanguage === 'string' ? rec.perspectiveTableLanguage : undefined;

    if (!answerLanguage || !commentLanguage || !perspectiveTableLanguage) {
      return undefined;
    }

    return { answerLanguage, commentLanguage, perspectiveTableLanguage };
  } catch {
    return undefined;
  }
}

