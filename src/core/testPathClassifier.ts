import { tsjsProfile, type ProjectProfile } from './projectProfile';

/**
 * 「テストファイルっぽいパス」を判定するための軽量ヒューリスティクス。
 *
 * 目的:
 * - worktreeで生成された変更のうち、ローカルへ適用してよい範囲（テストのみ）を絞る
 * - LLMの誤編集（実装コードを書き換える等）が混ざった場合の被害を最小化する
 * 
 * 後方互換のためエクスポート維持、実装はプロファイルへ委譲
 */
export function isTestLikePath(relativePath: string): boolean {
  return tsjsProfile.testLikePathPredicate(relativePath);
}

export function filterTestLikePaths(paths: string[], profile?: ProjectProfile): string[] {
  const effectiveProfile = profile ?? tsjsProfile;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of paths) {
    const normalized = normalizePath(p);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    if (effectiveProfile.testLikePathPredicate(normalized)) {
      out.push(normalized);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
}

