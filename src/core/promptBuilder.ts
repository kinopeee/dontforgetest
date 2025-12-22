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

/**
 * テスト生成用のプロンプトを構築する。
 * - docs/test-strategy.md を読み取り、ルールをプロンプトへ注入する
 * - 先頭の testgen-agent-config コメントから出力言語を解決する
 */
export async function buildTestGenPrompt(options: BuildPromptOptions): Promise<{ prompt: string; languages: TestGenLanguageConfig }> {
  const strategyAbsolutePath = toAbsolutePath(options.workspaceRoot, options.testStrategyPath);
  const strategyText = await readTextFile(strategyAbsolutePath);
  const languages = parseLanguageConfig(strategyText) ?? {
    answerLanguage: 'ja',
    commentLanguage: 'ja',
    perspectiveTableLanguage: 'ja',
  };

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
    `## 出力言語（必須）`,
    `- 説明文（テーブル以外）: ${languages.answerLanguage}`,
    `- テストコード内コメント: ${languages.commentLanguage}`,
    `- テスト観点表（Markdown）: ${languages.perspectiveTableLanguage}`,
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

function toAbsolutePath(workspaceRoot: string, maybeRelativePath: string): string {
  return path.isAbsolute(maybeRelativePath) ? maybeRelativePath : path.join(workspaceRoot, maybeRelativePath);
}

async function readTextFile(absolutePath: string): Promise<string> {
  const data = await vscode.workspace.fs.readFile(vscode.Uri.file(absolutePath));
  return Buffer.from(data).toString('utf8');
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

