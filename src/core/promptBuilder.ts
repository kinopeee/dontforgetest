import * as path from 'path';
import * as vscode from 'vscode';
import { DEFAULT_TEST_STRATEGY, DEFAULT_LANGUAGE_CONFIG } from './defaultTestStrategy';
import { getArtifactLocale } from './l10n';
import { resolveProjectProfile } from './projectProfile';

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

  // プロファイルを解決
  const resolvedProfile = await resolveProjectProfile(options.workspaceRoot);
  const profile = resolvedProfile.profile;

  const targetsText = options.targetPaths
    .map((p) => `- ${p}`)
    .join('\n');

  // 型チェック/Lintの設定（オプション引数 > 設定 > デフォルト）
  const config = vscode.workspace.getConfiguration('dontforgetest');
  const enablePreTestCheck = options.enablePreTestCheck ?? config.get<boolean>('enablePreTestCheck', true);
  const preTestCheckCommand = options.preTestCheckCommand?.trim() ?? (config.get<string>('preTestCheckCommand', 'npm run compile') ?? 'npm run compile').trim();

  // エージェント（cursor-agent / claude）はプロンプト中にファイルパスが含まれると、必要に応じて読み取り/編集を行える。
  const promptParts: string[] = [
    `You are a software engineer. Add or update unit tests for the target below.`,
    ``,
    `## Target`,
    `- Run type: ${options.targetLabel}`,
    `- Target files:`,
    targetsText,
    ``,
  ];

  // 実行フローセクション（preTestCheck の有無で内容が変わる）
  if (enablePreTestCheck && preTestCheckCommand.length > 0) {
    promptParts.push(
      `## Required execution flow`,
      `The required flow of this extension is: **"Generate tests → Typecheck/Lint → Run tests (testCommand) → Save reports"**.`,
      `You (the CLI agent) are responsible for **test generation** and **fixing typecheck/lint errors**.`,
      ``,
      `### Your tasks`,
      `1. Add or update test code`,
      `2. Run the following command to verify there are no typecheck/lint errors:`,
      `   \`\`\`bash`,
      `   ${preTestCheckCommand}`,
      `   \`\`\``,
      `3. If there are errors, **fix the test code** and re-run the check (up to 3 times)`,
      `4. Stop when errors are resolved or when retries are exhausted`,
      ``,
      `### Constraints`,
      `- **Do NOT run tests** (e.g., \`npm test\`). The extension will run tests later.`,
      `- **Do NOT start debugging, watch mode, or any interactive session**`,
      `- **Do NOT modify production code** (only add/update test code)`,
      `- If needed, finish with a short summary of added tests and any caveats/known limitations`,
      ``,
    );
  } else {
    promptParts.push(
      `## Required execution flow`,
      `The required flow of this extension is: **"Generate tests → (the extension orchestrates) Run tests (testCommand) → Save reports"**.`,
      `Note: Test execution is handled by the extension. Depending on settings, it may run in the extension process or via the CLI agent.`,
      `You (the CLI agent) MUST follow these rules:`,
      `- **Do NOT run tests yourself** (do not use shell tools; do not run \`npm test\`, etc.)`,
      `- **Do NOT start debugging, watch mode, or any interactive session**`,
      `- **Do NOT modify production code** (only add/update test code)`,
      `- If needed, finish with a short summary of added tests and any caveats/known limitations`,
      ``,
    );
  }

  promptParts.push(
    `## Output language (required)`,
    `- Explanations (non-table text): ${languages.answerLanguage}`,
    `- Comments inside test code: ${languages.commentLanguage}`,
    `- Test perspective table (Markdown): ${languages.perspectiveTableLanguage}`,
    ``,
    `## Allowed change scope (required)`,
    ...profile.allowedChangeScopeLines,
    `- Do NOT edit production/extension implementation files (non-test files under \`src/**\`)`,
    `- Do NOT create or edit documentation/Markdown files (e.g., \`docs/**\`, \`README.md\`, \`*.md\`)`,
    `- Do NOT create new files at the workspace root (e.g., do not create helper files like \`test_perspectives.md\`)`,
    `- The extension will save the perspective table; do NOT save it to any file (and do not append to existing perspective files)`,
    `- If you believe production changes are required to make tests pass, do NOT modify production code; instead, report the reason and stop`,
    ``,
  );

  // ツール使用制約セクション（preTestCheck の有無で内容が変わる）
  if (enablePreTestCheck && preTestCheckCommand.length > 0) {
    promptParts.push(
      `## Tooling constraints (required)`,
      `- **You may only run this command**: \`${preTestCheckCommand}\``,
      `- **Do NOT run test commands** (e.g., \`npm test\` / \`pnpm test\` / \`pytest\`)`,
      `- Do NOT launch GUI apps (avoid spawning external processes)`,
      `- Use only file reads and the provided diffs/paths to make decisions`,
      ``,
    );
  } else {
    promptParts.push(
      `## Tooling constraints (required)`,
      `- Do NOT use shell/command execution tools (do not run \`git diff\`, \`npm test\`, etc.)`,
      `- Do NOT launch GUI apps (avoid spawning external processes)`,
      `- Use only file reads and the provided diffs/paths to make decisions`,
      ``,
    );
  }

  promptParts.push(
    `## Test strategy rules (required)`,
    `Follow the rules below exactly (verbatim text follows).`,
    ``,
    strategyText.trim(),
    ``,
    `## Implementation notes`,
    `- Follow any existing test framework and file placement conventions`,
    `- Ensure tests are runnable (include necessary imports/setup)`,
    `- Even if only minor tweaks are needed, do not violate the rules above`,
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
  parts.push('You are a software engineer.');
  parts.push('Create **only** a test perspective table (Markdown) for the target below.');
  parts.push('Do NOT generate test code, do NOT edit files, and do NOT output any additional explanation.');
  parts.push('');
  parts.push('## Target');
  parts.push(`- Run type: ${options.targetLabel}`);
  parts.push('- Target files:');
  parts.push(targetsText.length > 0 ? targetsText : '- (none)');
  parts.push('');
  parts.push('## Output language (required)');
  parts.push(`- Test perspective table (Markdown): ${languages.perspectiveTableLanguage}`);
  parts.push('');
  parts.push('## Output requirements (required)');
  parts.push('- Output **JSON only** (do NOT output a Markdown table)');
  parts.push('- Wrap the entire output with the following markers (marker lines must be included):');
  parts.push(`  - ${markerBegin}`);
  parts.push(`  - ${markerEnd}`);
  parts.push('- JSON must follow this schema (keys must match exactly):');
  parts.push('  - Root: `{ "version": 1, "cases": PerspectiveCase[] }`');
  parts.push('  - `PerspectiveCase`: `{ "caseId": string, "inputPrecondition": string, "perspective": string, "expectedResult": string, "notes": string }`');
  parts.push('- Keep each field single-line where possible (avoid newlines inside field values)');
  parts.push('- The extension will convert this into a Markdown table with columns: `Case ID`, `Input / Precondition`, `Perspective (Equivalence / Boundary)`, `Expected Result`, `Notes`');
  parts.push('- Cover normal cases, error cases, and boundary cases. Include at least: `0 / min / max / ±1 / empty / null / undefined`');
  parts.push('- **Include at least as many failure cases as success cases**');
  parts.push('');
  parts.push('## Critical Quality Rules (MUST)');
  parts.push('- 1 case = 1 branch. Do not bundle multiple input conditions in a single case.');
  parts.push('- Split null vs empty vs whitespace into separate cases when outcomes differ.');
  parts.push('- Expected Results must be concrete and observable (exact labels/values/lines). Avoid vague wording like "as expected" or "A or B".');
  parts.push('- Only include boundary values relevant to this diff; if omitted, explain why in Notes.');
  parts.push('- For report artifacts, Expected Results must name the exact section/label/value to assert.');
  parts.push('');
  parts.push('## Tooling constraints (required)');
  parts.push('- Do NOT use shell/command execution tools (do not run `git diff`, `npm test`, etc.)');
  parts.push('- Do NOT launch GUI apps (avoid spawning external processes)');
  parts.push('- Do NOT edit or add files');
  parts.push('');
  parts.push('## Test Strategy Rules (MUST)');
  parts.push('The following rules are mandatory. Follow them exactly.');
  parts.push(strategyText.trim());

  if (options.referenceText && options.referenceText.trim().length > 0) {
    parts.push('');
    parts.push('## Reference (diff / additional context)');
    parts.push('Use this only if needed.');
    parts.push('');
    parts.push(options.referenceText.trim());
  }

  parts.push('');
  parts.push('## Output format (required)');
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
