/**
 * TypeScript/JavaScript プロジェクト検出用のシグナル判定ロジック
 * 
 * 将来の多言語プロファイル追加を見据えて、誤検出を減らすための純関数を提供する。
 */

/**
 * TypeScript/JavaScript プロジェクトを示す依存パッケージ名のリスト
 */
export const TSJS_DEP_PKGS = [
  'typescript',
  '@types/node',
  'jest',
  'vitest',
  'mocha',
  'tsx',
  'ts-node',
  'vite',
  'next',
];

/**
 * TypeScript/JavaScript プロジェクトを示す scripts 内のトークンリスト
 * （単語境界でマッチするため、prejest のような誤検出を防ぐ）
 */
export const TSJS_SCRIPT_TOKENS = [
  'tsc',
  'jest',
  'vitest',
  'mocha',
  'vite',
  'next',
];

/**
 * scripts 内のトークンマッチ用の正規表現（事前コンパイル）
 *
 * NOTE: トークンは定数リストで、英数字のみを想定している。
 * 将来の拡張時に正規表現メタ文字を含める場合はエスケープを検討すること。
 */
const TSJS_SCRIPT_TOKEN_RE = new RegExp(
  `\\b(${TSJS_SCRIPT_TOKENS.join('|')})\\b`,
  'i',
);

/**
 * package.json の内容から TypeScript/JavaScript プロジェクトのシグナルを判定する
 * 
 * @param pkg - package.json のパース済みオブジェクト（unknown 型で受け取る）
 * @returns package.json に TS/JS シグナルが含まれている場合 true
 * 
 * 判定条件（いずれかに該当すれば true）:
 * - types または typings フィールドが存在する
 * - dependencies/devDependencies/peerDependencies に TS/JS 関連パッケージが含まれる
 * - scripts に TS/JS 関連のコマンドが含まれる（単語境界でマッチ）
 */
export function isTsjsPackageJsonSignal(pkg: unknown): boolean {
  if (!pkg || typeof pkg !== 'object') {
    return false;
  }
  const obj = pkg as Record<string, unknown>;

  // types または typings フィールドの存在チェック
  const hasTypesField =
    typeof obj.types === 'string' || typeof obj.typings === 'string';

  // dependencies 系のチェック（小文字化して厳密一致）
  const hasDeps = (deps?: Record<string, unknown>): boolean => {
    if (!deps || typeof deps !== 'object') {
      return false;
    }
    return Object.keys(deps).some((depName) =>
      TSJS_DEP_PKGS.includes(depName.toLowerCase())
    );
  };

  // scripts のチェック（単語境界でマッチ）
  const scripts = obj.scripts;
  let hasScript = false;
  if (scripts && typeof scripts === 'object') {
    hasScript = Object.values(scripts).some((scriptValue) =>
      TSJS_SCRIPT_TOKEN_RE.test(String(scriptValue))
    );
  }

  return (
    hasTypesField ||
    hasDeps(obj.dependencies as Record<string, unknown> | undefined) ||
    hasDeps(obj.devDependencies as Record<string, unknown> | undefined) ||
    hasDeps(obj.peerDependencies as Record<string, unknown> | undefined) ||
    hasScript
  );
}

export const __test__ = {
  isTsjsPackageJsonSignal,
};
