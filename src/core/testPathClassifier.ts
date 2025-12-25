/**
 * 「テストファイルっぽいパス」を判定するための軽量ヒューリスティクス。
 *
 * 目的:
 * - worktreeで生成された変更のうち、ローカルへ適用してよい範囲（テストのみ）を絞る
 * - LLMの誤編集（実装コードを書き換える等）が混ざった場合の被害を最小化する
 */

export function isTestLikePath(relativePath: string): boolean {
  const normalized = normalizePath(relativePath);
  const lower = normalized.toLowerCase();

  // 明確に除外したい領域
  if (lower.startsWith('node_modules/') || lower.includes('/node_modules/')) {
    return false;
  }
  if (lower.startsWith('docs/') || lower.includes('/docs/')) {
    return false;
  }
  // テスト配下に紛れ込みやすい「実行生成物/キャッシュ」は除外する（パッチ適用失敗や汚染を防ぐ）
  // - 例: tests/__pycache__/*.pyc
  if (/(^|\/)__pycache__(\/|$)/.test(lower)) {
    return false;
  }
  if (/\.(pyc|pyo)$/.test(lower)) {
    return false;
  }

  // ファイル名末尾（*.test.* / *.spec.*）
  // - 例: foo.test.ts, foo.spec.ts, foo.test.js
  const base = lower.split('/').pop() ?? lower;
  if (/\.(test|spec)\.[a-z0-9]+$/.test(base)) {
    return true;
  }

  // ディレクトリ規約（tests/test/spec/__tests__）
  // - 例: tests/foo.ts, src/test/foo.ts, __tests__/foo.ts
  if (/(^|\/)(__tests__|tests?|spec)(\/|$)/.test(lower)) {
    return true;
  }

  return false;
}

export function filterTestLikePaths(paths: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of paths) {
    const normalized = normalizePath(p);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    if (isTestLikePath(normalized)) {
      out.push(normalized);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
}

