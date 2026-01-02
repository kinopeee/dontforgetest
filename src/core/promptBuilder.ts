import * as path from 'path';
import * as vscode from 'vscode';
import { DEFAULT_TEST_STRATEGY, DEFAULT_LANGUAGE_CONFIG } from './defaultTestStrategy';
import { getArtifactLocale } from './l10n';

export interface TestGenLanguageConfig {
  answerLanguage: string;
  commentLanguage: string;
  perspectiveTableLanguage: string;
}

export interface BuildPromptOptions {
  workspaceRoot: string;
  /** 対象の説明（例: 最新コミット差分、コミット範囲差分） */
  targetLabel: string;
  /** エージェントに読ませたい対象ファイル（ワークスペース相対でも可） */
  targetPaths: string[];
  /** テスト戦略ルールファイル（既定: docs/test-strategy.md） */
  testStrategyPath: string;
  /** 生成後の型チェック/Lintを有効化（デフォルト: true） */
  enablePreTestCheck?: boolean;
  /** 型チェック/Lintコマンド（例: npm run compile） */
  preTestCheckCommand?: string;
}

export interface BuildPerspectivePromptOptions extends BuildPromptOptions {
  /** 差分など参考情報（任意） */
  referenceText?: string;
}

/**
 * テスト生成用のプロンプトを構築する。
 * - docs/test-strategy.md を読み取り、ルールをプロンプトへ注入する
 * - 先頭の dontforgetest-config コメントから出力言語を解決する
 */
export async function buildTestGenPrompt(options: BuildPromptOptions): Promise<{ prompt: string; languages: TestGenLanguageConfig }> {
  const { strategyText, languages } = await readStrategyAndLanguages(options.workspaceRoot, options.testStrategyPath);
  // 観点表だけは「実行時の表示言語」に合わせて出力させたい（観点表ファイルの表示言語と一致させるため）
  languages.perspectiveTableLanguage = getArtifactLocale();

  const targetsText = options.targetPaths
    .map((p) => `- ${p}`)
    .join('\n');

  // 型チェック/Lintの設定（オプション引数 > 設定 > デフォルト）
  const config = vscode.workspace.getConfiguration('dontforgetest');
  const enablePreTestCheck = options.enablePreTestCheck ?? config.get<boolean>('enablePreTestCheck', true);
  const preTestCheckCommand = options.preTestCheckCommand?.trim() ?? (config.get<string>('preTestCheckCommand', 'npm run compile') ?? 'npm run compile').trim();

  // cursor-agent はプロンプト中にファイルパスが含まれると、必要に応じて読み取り/編集を行える。
  const promptParts: string[] = [
    `あなたはソフトウェアエンジニアです。以下の対象に対して、ユニットテストを追加/更新してください。`,
    ``,
    `## 対象`,
    `- 実行種別: ${options.targetLabel}`,
    `- 対象ファイル:`,
    targetsText,
    ``,
  ];

  // 実行フローセクション（preTestCheck の有無で内容が変わる）
  if (enablePreTestCheck && preTestCheckCommand.length > 0) {
    promptParts.push(
      `## 実行フロー（必須）`,
      `この拡張機能の所定フローは **「テスト生成 → 型チェック/Lint → テスト実行（testCommand）→ レポート保存」** です。`,
      `あなた（cursor-agent）の担当は **テスト生成** と **型チェック/Lintによるエラー修正** です。`,
      ``,
      `### あなたのタスク`,
      `1. テストコードを追加/更新する`,
      `2. 以下のコマンドを実行して、型エラー/Lintエラーがないか確認する:`,
      `   \`\`\`bash`,
      `   ${preTestCheckCommand}`,
      `   \`\`\``,
      `3. エラーがあれば **テストコードを修正** して再度チェックする（最大3回まで）`,
      `4. エラーが解消したら、またはリトライ上限に達したら終了する`,
      ``,
      `### 制約`,
      `- **テスト実行（\`npm test\` 等）は行わない**（拡張機能が後で担当する）`,
      `- **デバッグ開始・ウォッチ開始・対話的セッション開始をしない**`,
      `- **プロダクションコードの変更は行わない**（テストコードの追加/更新のみ）`,
      `- 必要なら「追加したテストの概要」と「注意点（既知の制約/未対応）」を短く文章で報告して終了する`,
      ``,
    );
  } else {
    promptParts.push(
      `## 実行フロー（必須）`,
      `この拡張機能の所定フローは **「テスト生成 →（拡張機能がオーケストレーションして）テスト実行（testCommand）→ レポート保存」** です。`,
      `※ テスト実行は拡張機能側が担当し、設定により「拡張機能プロセスで実行」または「cursor-agent 経由で実行」します。`,
      `あなた（cursor-agent）は次を厳守してください。`,
      `- **あなた自身でテストを実行しない**（shellツールは使わない / \`npm test\` 等を走らせない）`,
      `- **デバッグ開始・ウォッチ開始・対話的セッション開始をしない**（テスト実行後にデバッグへ移行しない）`,
      `- **修正（プロダクションコードの変更）は行わない**（テストコードの追加/更新のみ行う）`,
      `- 必要なら「追加したテストの概要」と「注意点（既知の制約/未対応）」を短く文章で報告して終了する`,
      ``,
    );
  }

  promptParts.push(
    `## 出力言語（必須）`,
    `- 説明文（テーブル以外）: ${languages.answerLanguage}`,
    `- テストコード内コメント: ${languages.commentLanguage}`,
    `- テスト観点表（Markdown）: ${languages.perspectiveTableLanguage}`,
    ``,
    `## 変更範囲の制約（必須）`,
    `- 変更してよいのは **テストコード（例: \`src/test/**\`, \`**/*.test.ts\`）のみ**`,
    `- アプリ本体/拡張機能本体の実装（\`src/**\` のうちテスト以外）を「直す」ための編集は禁止`,
    `- **ドキュメント類（例: \`docs/**\`, \`README.md\` など）や Markdown（\`*.md\`）の新規作成/編集は禁止**`,
    `- **ワークスペース直下（ルート）への新規ファイル作成は禁止**（例: \`test_perspectives.md\` のような補助ファイルを作らない）`,
    `- 観点表は拡張機能が所定のフローで保存するため、**観点表を別ファイルに保存しない**（既存の観点表ファイルへ追記もしない）`,
    `- もしテストを成立させるために実装側の修正が必要だと判断した場合は、**修正せず**に、その旨と理由を報告して終了する`,
    ``,
  );

  // ツール使用制約セクション（preTestCheck の有無で内容が変わる）
  if (enablePreTestCheck && preTestCheckCommand.length > 0) {
    promptParts.push(
      `## ツール使用制約（必須）`,
      `- **許可されたコマンドのみ実行可能**: \`${preTestCheckCommand}\``,
      `- **テスト実行コマンド（\`npm test\` / \`pnpm test\` / \`pytest\` 等）は禁止**`,
      `- **Cursor 等のGUIアプリを起動する操作は禁止**（別プロセス起動の回避）`,
      `- 必要な情報は、対象ファイルの読み取り（read）と、こちらから提示する差分/対象パスから判断すること`,
      ``,
    );
  } else {
    promptParts.push(
      `## ツール使用制約（必須）`,
      `- **shell（コマンド実行）ツールは使用禁止**（\`git diff\` / \`npm test\` 等を実行しない）`,
      `- **Cursor 等のGUIアプリを起動する操作は禁止**（別プロセス起動の回避）`,
      `- 必要な情報は、対象ファイルの読み取り（read）と、こちらから提示する差分/対象パスから判断すること`,
      ``,
    );
  }

  promptParts.push(
    `## テスト戦略ルール（必須）`,
    `以下のルールを必ず遵守してください（原文を貼り付けます）。`,
    ``,
    strategyText.trim(),
    ``,
    `## 実装上の注意`,
    `- 既存のテストフレームワーク/テスト配置規約があればそれに従うこと`,
    `- テストは実行可能な状態で追加すること（必要な import / setup を含める）`,
    `- 既存テストの軽微な修正だけで済む場合でも、ルールに反しないこと`,
  );

  const prompt = promptParts.join('\n');

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
  // 観点表だけは「実行時の表示言語」に合わせて出力させたい（観点表ファイルの表示言語と一致させるため）
  languages.perspectiveTableLanguage = getArtifactLocale();

  // 観点表は「表（Markdown）」として最終保存されるが、cursor-agent からは揺れを避けるため JSON を返させる。
  // 保存時に拡張機能側で列固定の Markdown 表へ整形する。
  const markerBegin = '<!-- BEGIN TEST PERSPECTIVES JSON -->';
  const markerEnd = '<!-- END TEST PERSPECTIVES JSON -->';

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
  parts.push('- 返答は **JSON だけ** にする（Markdownテーブルは出力しない）');
  parts.push('- 次のマーカーで出力全体を囲むこと（マーカー行も必ず含める）');
  parts.push(`  - ${markerBegin}`);
  parts.push(`  - ${markerEnd}`);
  parts.push('- JSON は次のスキーマに従うこと（キー名は厳密に一致させる）:');
  parts.push('  - ルート: `{ "version": 1, "cases": PerspectiveCase[] }`');
  parts.push('  - `PerspectiveCase`: `{ "caseId": string, "inputPrecondition": string, "perspective": string, "expectedResult": string, "notes": string }`');
  parts.push('- 各フィールドはできるだけ1行で書く（改行を含めない）');
  parts.push('- 最終的に拡張機能側で次の列の Markdown 表へ変換される前提で内容を埋める: `Case ID`, `Input / Precondition`, `Perspective (Equivalence / Boundary)`, `Expected Result`, `Notes`');
  parts.push('- 正常系・異常系・境界値を網羅し、境界値は最低でも `0 / 最小値 / 最大値 / ±1 / 空 / null / undefined` を含める');
  parts.push('- **失敗系（異常系/エラー系）のケースを、成功系と同数以上含めること**（テスト品質の基本原則）');
  parts.push('');
  parts.push('## Critical Quality Rules (MUST)');
  parts.push('- 1 case = 1 branch. Do not bundle multiple input conditions in a single case.');
  parts.push('- Split null vs empty vs whitespace into separate cases when outcomes differ.');
  parts.push('- Expected Results must be concrete and observable (exact labels/values/lines). Avoid vague wording like "as expected" or "A or B".');
  parts.push('- Only include boundary values relevant to this diff; if omitted, explain why in Notes.');
  parts.push('- For report artifacts, Expected Results must name the exact section/label/value to assert.');
  parts.push('');
  parts.push('## ツール使用制約（必須）');
  parts.push('- **shell（コマンド実行）ツールは使用禁止**（`git diff` / `npm test` 等を実行しない）');
  parts.push('- **Cursor 等のGUIアプリを起動する操作は禁止**（別プロセス起動の回避）');
  parts.push('- ファイルの編集/追加は不要（実施しない）');
  parts.push('');
  parts.push('## Test Strategy Rules (MUST)');
  parts.push('The following rules are mandatory. Follow them exactly.');
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
  parts.push('{');
  parts.push('  "version": 1,');
  parts.push('  "cases": [');
  parts.push('    {');
  parts.push('      "caseId": "TC-N-01",');
  parts.push('      "inputPrecondition": "...",');
  parts.push('      "perspective": "Equivalence – normal",');
  parts.push('      "expectedResult": "...",');
  parts.push('      "notes": "-"');
  parts.push('    }');
  parts.push('  ]');
  parts.push('}');
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

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(absolutePath));
    return true;
  } catch {
    return false;
  }
}

async function readStrategyAndLanguages(
  workspaceRoot: string,
  testStrategyPath: string,
): Promise<{ strategyText: string; languages: TestGenLanguageConfig }> {
  // 1. testStrategyPath が空の場合は内蔵デフォルトを使用
  if (!testStrategyPath || testStrategyPath.trim().length === 0) {
    return {
      strategyText: DEFAULT_TEST_STRATEGY,
      languages: { ...DEFAULT_LANGUAGE_CONFIG },
    };
  }

  // 2. ファイルが存在するか確認
  const strategyAbsolutePath = toAbsolutePath(workspaceRoot, testStrategyPath);
  const exists = await fileExists(strategyAbsolutePath);

  if (!exists) {
    // ファイルが見つからない場合は内蔵デフォルトにフォールバック
    return {
      strategyText: DEFAULT_TEST_STRATEGY,
      languages: { ...DEFAULT_LANGUAGE_CONFIG },
    };
  }

  // 3. 外部ファイルを読み込む
  const strategyText = await readTextFile(strategyAbsolutePath);
  const languages = parseLanguageConfig(strategyText) ?? { ...DEFAULT_LANGUAGE_CONFIG };
  return { strategyText, languages };
}

/**
 * docs/test-strategy.md の先頭コメントから出力言語を抽出する。
 *
 * 例:
 * <!-- dontforgetest-config: {"answerLanguage":"ja","commentLanguage":"ja","perspectiveTableLanguage":"ja"} -->
 */
export function parseLanguageConfig(strategyText: string): TestGenLanguageConfig | undefined {
  const firstLine = strategyText.split('\n')[0] ?? '';
  const match = firstLine.match(/<!--\s*dontforgetest-config:\s*(\{[\s\S]*\})\s*-->/);
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
