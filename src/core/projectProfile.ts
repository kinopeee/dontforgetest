import * as vscode from 'vscode';
import * as path from 'path';
import type { ProjectProfile as IProjectProfile } from './types';
import { testLogger } from './logger';
import { analyzeFileContent, type AnalysisIssue } from './testAnalyzer';
import { isTsjsPackageJsonSignal } from './detectSignals';

/**
 * vscode.workspace.fs はテスト環境によっては差し替えが困難なため、
 * 本モジュール内で参照先を切り替えられるようにする（テスト専用）。
 */
type WorkspaceFsLike = Pick<vscode.FileSystem, 'stat' | 'readFile'>;

let workspaceFsOverrideForTest: WorkspaceFsLike | undefined;

function getWorkspaceFs(): WorkspaceFsLike {
  return workspaceFsOverrideForTest ?? vscode.workspace.fs;
}

/**
 * プロジェクトプロファイル
 */
export type ProjectProfile = IProjectProfile;

export interface ResolvedProfile {
  profile: ProjectProfile;
  source: 'config' | 'detected' | 'fallback';
}

/**
 * TypeScript/JavaScript プロファイル
 * 
 * 既存の仕様を維持:
 * - テストファイル: .test.ts, .spec.ts, .test.tsx, .spec.tsx, .js, .jsx
 * - パス判定: src/test/ 配下, test/ で始まる, /test/ を含む
 * - 解析: testAnalyzer.analyzeFileContent を使用
 */
export const tsjsProfile: ProjectProfile = {
  id: 'tsjs',
  displayName: 'TypeScript/JavaScript',
  description: 'TypeScript/JavaScript プロジェクト用のデフォルトプロファイル',

  async detect(workspaceRoot: string): Promise<boolean> {
    // TypeScript/JavaScript プロジェクトの自動検出ロジック
    const hasTsConfig = await fileExists(path.join(workspaceRoot, 'tsconfig.json'));
    const hasJsConfig = await fileExists(path.join(workspaceRoot, 'jsconfig.json'));
    const hasDenoJson = await fileExists(path.join(workspaceRoot, 'deno.json'));
    const hasDenoJsonc = await fileExists(path.join(workspaceRoot, 'deno.jsonc'));

    if (hasTsConfig || hasJsConfig || hasDenoJson || hasDenoJsonc) {
      return true;
    }

    // package.json の存在もチェック
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    if (await fileExists(packageJsonPath)) {
      try {
        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(packageJsonPath));
        const pkg = JSON.parse(content.toString());
        // TypeScript が devDependencies に含まれる場合
        if (pkg.devDependencies?.typescript) {
          return true;
        }
      } catch {
        // パース失敗は無視
      }
    }

    return false;
  },

  allowedChangeScopeLines: [
    '- You may change **ONLY test code** (e.g., `src/test/**`, `**/*.test.ts`)',
  ],

  testFilePredicate(relativePath: string): boolean {
    // src/core/strategyComplianceCheck.ts の isTestFilePath ロジックを移植
    const normalized = relativePath.replace(/\\/g, '/');
    // .test.ts, .spec.ts, .test.tsx, .spec.tsx, .test.js, .spec.js, .test.jsx, .spec.jsx などにマッチ
    // 元の実装: /\.(test|spec)\.(ts|tsx|js|jsx)$/
    if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(normalized)) {
      return true;
    }
    // src/test/ 配下、または test/ で始まる、またはパス内に /test/ を含む
    if (normalized.startsWith('src/test/') || normalized.startsWith('test/') || normalized.includes('/test/')) {
      return true;
    }
    return false;
  },

  testLikePathPredicate(relativePath: string): boolean {
    // src/core/testPathClassifier.ts の isTestLikePath ロジックを移植
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
    const lower = normalized.toLowerCase();

    // 明確に除外したい領域
    if (lower.startsWith('node_modules/') || lower.includes('/node_modules/')) {
      return false;
    }
    if (lower.startsWith('docs/') || lower.includes('/docs/')) {
      return false;
    }
    // テスト配下に紛れ込みやすい「実行生成物/キャッシュ」は除外
    if (/(^|\/)__pycache__(\/|$)/.test(lower)) {
      return false;
    }
    if (/\.(pyc|pyo)$/.test(lower)) {
      return false;
    }

    // ファイル名末尾（*.test.* / *.spec.*）
    const base = lower.split('/').pop() ?? lower;
    if (/\.(test|spec)\.[a-z0-9]+$/.test(base)) {
      return true;
    }

    // ディレクトリ規約（tests/test/spec/__tests__）
    if (/(^|\/)(__tests__|tests?|spec)(\/|$)/.test(lower)) {
      return true;
    }

    return false;
  },

  analyzeFileContent(relativePath: string, content: string): any {
    // testAnalyzer の analyzeFileContent を呼び出す
    return analyzeFileContent(content, relativePath);
  },
};

/**
 * 利用可能なプロファイル一覧（優先度順）
 */
const AVAILABLE_PROFILES: ProjectProfile[] = [
  tsjsProfile,
  // 将来ここに pythonProfile 等を追加
];

async function fileExists(absolutePath: string): Promise<boolean> {
  try {
    await getWorkspaceFs().stat(vscode.Uri.file(absolutePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * テスト専用の露出
 */
export const __test__ = {
  /**
   * vscode.workspace.fs の参照先をテスト用に差し替える
   * - undefined を渡すと元に戻る
   */
  setWorkspaceFsOverrideForTest: (fs: WorkspaceFsLike | undefined): void => {
    workspaceFsOverrideForTest = fs;
  },
};

/**
 * ワークスペース設定と自動検出に基づいてプロファイルを解決する
 */
export async function resolveProjectProfile(workspaceRoot: string): Promise<ResolvedProfile> {
  const config = vscode.workspace.getConfiguration('dontforgetest');
  const configId = config.get<string>('projectProfile', 'auto');

  // 1. 設定で明示されている場合
  if (configId !== 'auto') {
    const found = AVAILABLE_PROFILES.find((p) => p.id === configId);
    if (found) {
      return { profile: found, source: 'config' };
    }
    // 設定されたプロファイルが見つからない場合は警告を出してフォールバック
    testLogger.warn(`Project profile "${configId}" not found. Falling back to default.`);
    // フォールバック: tsjs
    return { profile: tsjsProfile, source: 'fallback' };
  }

  // 2. 自動検出
  for (const p of AVAILABLE_PROFILES) {
    if (await p.detect(workspaceRoot)) {
      return { profile: p, source: 'detected' };
    }
  }

  // 3. 検出できなかった場合（フォールバック）
  // TS/JS が最も汎用的であるため、これをデフォルトとする
  return { profile: tsjsProfile, source: 'fallback' };
}
