import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type GitChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

export interface GitChangedFile {
  /** 変更後のパス（deletedの場合は削除前パス） */
  path: string;
  changeType: GitChangeType;
  /** rename の場合の変更前パス */
  oldPath?: string;
}

export interface GitDiffAnalysis {
  files: GitChangedFile[];
}

export type WorkingTreeDiffMode = 'staged' | 'unstaged' | 'both';

/**
 * git の unified diff（`git diff` / `git show`）から、変更ファイル一覧（rename含む）を抽出する。
 */
export function analyzeGitUnifiedDiff(diffText: string): GitDiffAnalysis {
  const lines = diffText.split('\n');
  const files: GitChangedFile[] = [];

  let current:
    | {
        aPath: string;
        bPath: string;
        changeType: GitChangeType;
        oldPath?: string;
      }
    | undefined;

  const pushCurrent = () => {
    if (!current) {
      return;
    }
    const path = current.changeType === 'deleted' ? current.aPath : current.bPath;
    files.push({
      path,
      changeType: current.changeType,
      oldPath: current.oldPath,
    });
    current = undefined;
  };

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      pushCurrent();
      const rest = line.slice('diff --git '.length);
      const paths = parseDiffGitPaths(rest);
      if (!paths) {
        continue;
      }
      current = {
        aPath: paths.aPath,
        bPath: paths.bPath,
        changeType: 'modified',
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('new file mode ')) {
      current.changeType = 'added';
      continue;
    }
    if (line.startsWith('deleted file mode ')) {
      current.changeType = 'deleted';
      continue;
    }
    if (line.startsWith('rename from ')) {
      current.changeType = 'renamed';
      current.oldPath = line.slice('rename from '.length).trim();
      continue;
    }
    if (line.startsWith('rename to ')) {
      // 変更後パスは diff --git の bPath を優先する
      current.changeType = 'renamed';
      continue;
    }
  }

  pushCurrent();

  // 同一パスが複数回出るケース（連結diff等）を除外して安定化
  const deduped = new Map<string, GitChangedFile>();
  for (const f of files) {
    const existing = deduped.get(f.path);
    if (!existing) {
      deduped.set(f.path, f);
      continue;
    }
    // rename情報が後から得られた場合だけ上書き
    if (existing.changeType !== 'renamed' && f.changeType === 'renamed') {
      deduped.set(f.path, f);
    }
  }

  return { files: Array.from(deduped.values()) };
}

export function extractChangedPaths(analysis: GitDiffAnalysis): string[] {
  return analysis.files.map((f) => f.path);
}

/**
 * コミット範囲の差分を取得する（例: `main..HEAD`, `HEAD~3..HEAD`）。
 */
export async function getCommitRangeDiff(workspaceRoot: string, range: string): Promise<string> {
  const stdout = await execGit(workspaceRoot, ['diff', '--no-color', range], 20 * 1024 * 1024);
  return stdout.trimEnd();
}

/**
 * 作業ツリー差分を取得する。
 * - staged: `git diff --cached`
 * - unstaged: `git diff`
 * - both: 両方を連結
 */
export async function getWorkingTreeDiff(workspaceRoot: string, mode: WorkingTreeDiffMode): Promise<string> {
  if (mode === 'staged') {
    return (await execGit(workspaceRoot, ['diff', '--cached', '--no-color'], 20 * 1024 * 1024)).trimEnd();
  }
  if (mode === 'unstaged') {
    return (await execGit(workspaceRoot, ['diff', '--no-color'], 20 * 1024 * 1024)).trimEnd();
  }
  const staged = (await execGit(workspaceRoot, ['diff', '--cached', '--no-color'], 20 * 1024 * 1024)).trimEnd();
  const unstaged = (await execGit(workspaceRoot, ['diff', '--no-color'], 20 * 1024 * 1024)).trimEnd();
  return [staged, unstaged].filter((s) => s.length > 0).join('\n\n');
}

async function execGit(workspaceRoot: string, args: string[], maxBufferBytes: number): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    maxBuffer: maxBufferBytes,
  });
  return stdout;
}

function parseDiffGitPaths(rest: string): { aPath: string; bPath: string } | undefined {
  const tokens = splitGitTokens(rest);
  if (tokens.length < 2) {
    return undefined;
  }
  const aToken = tokens[0];
  const bToken = tokens[1];
  if (!aToken.startsWith('a/') || !bToken.startsWith('b/')) {
    return undefined;
  }
  return { aPath: aToken.slice(2), bPath: bToken.slice(2) };
}

/**
 * `diff --git` 行のパス部分をトークン分割する。
 * git はスペース等を含むパスを `"..."` でクォートするため、最低限それに対応する。
 */
function splitGitTokens(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  const skipSpaces = () => {
    while (i < input.length && input[i] === ' ') {
      i += 1;
    }
  };

  while (i < input.length) {
    skipSpaces();
    if (i >= input.length) {
      break;
    }

    let token = '';
    if (input[i] === '"') {
      i += 1;
      while (i < input.length) {
        const ch = input[i];
        if (ch === '\\' && i + 1 < input.length) {
          // \" や \\ を最低限解釈
          token += input[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"') {
          i += 1;
          break;
        }
        token += ch;
        i += 1;
      }
      tokens.push(token);
      continue;
    }

    while (i < input.length && input[i] !== ' ') {
      token += input[i];
      i += 1;
    }
    if (token.length > 0) {
      tokens.push(token);
    }
  }

  return tokens;
}

