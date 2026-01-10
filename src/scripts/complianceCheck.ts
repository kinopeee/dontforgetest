/**
 * CLI スクリプト: テスト戦略準拠チェック
 *
 * CI/CD パイプラインで使用するためのコマンドラインツール。
 * 生成されたテストファイルが戦略ルールに準拠しているかをチェックする。
 *
 * 使用方法:
 *   npm run compliance-check -- [options]
 *
 * オプション:
 *   --pattern <glob>  テストファイルのパターン（デフォルト: src/test/**\/*.test.ts）
 *   --perspective <file>  観点表ファイルのパス（オプション）
 *   --help  ヘルプを表示
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import {
  extractCaseIdsFromPerspectiveMarkdown,
  checkCaseIdCoverage,
} from '../core/strategyComplianceCheck';
import { analyzeFileContent } from '../core/testAnalyzer';

interface CliOptions {
  pattern: string;
  perspectivePath?: string;
  help: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    pattern: 'src/test/**/*.test.ts',
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--pattern' && args[i + 1]) {
      options.pattern = args[++i];
    } else if (arg === '--perspective' && args[i + 1]) {
      options.perspectivePath = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
テスト戦略準拠チェック CLI

使用方法:
  npm run compliance-check -- [options]

オプション:
  --pattern <glob>      テストファイルのパターン（デフォルト: src/test/**/*.test.ts）
  --perspective <file>  観点表ファイルのパス（オプション）
  --help, -h            ヘルプを表示

例:
  npm run compliance-check
  npm run compliance-check -- --pattern "tests/**/*.spec.ts"
  npm run compliance-check -- --perspective docs/test-perspectives/latest.md
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const workspaceRoot = process.cwd();
  console.log(`ワークスペース: ${workspaceRoot}`);
  console.log(`パターン: ${options.pattern}`);

  // テストファイルを検索
  const testFiles = await glob(options.pattern, { cwd: workspaceRoot });
  if (testFiles.length === 0) {
    console.log('テストファイルが見つかりませんでした。');
    process.exit(0);
  }

  console.log(`テストファイル数: ${testFiles.length}`);

  // ファイル内容を読み取り
  const testFileContents = new Map<string, string>();
  for (const relativePath of testFiles) {
    const absolutePath = path.join(workspaceRoot, relativePath);
    try {
      const content = fs.readFileSync(absolutePath, 'utf8');
      testFileContents.set(relativePath, content);
    } catch {
      console.warn(`警告: ファイルを読み取れませんでした: ${relativePath}`);
    }
  }

  // 分析を実行
  let totalIssues = 0;
  const issuesByFile = new Map<string, string[]>();

  for (const [relativePath, content] of testFileContents.entries()) {
    const issues = analyzeFileContent(relativePath, content);
    if (issues.length > 0) {
      totalIssues += issues.length;
      const fileIssues = issues.map((i) => {
        const lineInfo = i.line !== undefined ? `:${i.line}` : '';
        return `  [${i.type}]${lineInfo}: ${i.detail}`;
      });
      issuesByFile.set(relativePath, fileIssues);
    }
  }

  // 観点表チェック（指定された場合）
  let missingCaseIds: string[] = [];
  if (options.perspectivePath) {
    try {
      const perspectiveContent = fs.readFileSync(
        path.join(workspaceRoot, options.perspectivePath),
        'utf8',
      );
      const caseIds = extractCaseIdsFromPerspectiveMarkdown(perspectiveContent);
      if (caseIds.length > 0) {
        const missingIssues = checkCaseIdCoverage(testFileContents, caseIds);
        missingCaseIds = missingIssues.map((i) => i.caseId);
        totalIssues += missingIssues.length;
      }
    } catch {
      console.warn(`警告: 観点表ファイルを読み取れませんでした: ${options.perspectivePath}`);
    }
  }

  // 結果を出力
  console.log('\n--- 準拠チェック結果 ---\n');

  if (issuesByFile.size > 0) {
    console.log('## テスト品質の問題\n');
    for (const [file, issues] of issuesByFile.entries()) {
      console.log(`${file}:`);
      for (const issue of issues) {
        console.log(issue);
      }
      console.log('');
    }
  }

  if (missingCaseIds.length > 0) {
    console.log('## 観点表ケースID未実装\n');
    for (const caseId of missingCaseIds) {
      console.log(`  - ${caseId}`);
    }
    console.log('');
  }

  // サマリー
  console.log('--- サマリー ---');
  console.log(`分析ファイル数: ${testFileContents.size}`);
  console.log(`問題数: ${totalIssues}`);

  if (totalIssues > 0) {
    console.log('\n準拠チェックに失敗しました。');
    process.exit(1);
  } else {
    console.log('\n準拠チェックに合格しました。');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('エラーが発生しました:', error);
  process.exit(1);
});
