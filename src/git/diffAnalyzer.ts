import { execGitStdout } from './gitExec';

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
  const stdout = await execGitStdout(workspaceRoot, ['diff', '--no-color', range], 20 * 1024 * 1024);
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
    return (await execGitStdout(workspaceRoot, ['diff', '--cached', '--no-color'], 20 * 1024 * 1024)).trimEnd();
  }
  if (mode === 'unstaged') {
    return (await execGitStdout(workspaceRoot, ['diff', '--no-color'], 20 * 1024 * 1024)).trimEnd();
  }
  const staged = (await execGitStdout(workspaceRoot, ['diff', '--cached', '--no-color'], 20 * 1024 * 1024)).trimEnd();
  const unstaged = (await execGitStdout(workspaceRoot, ['diff', '--no-color'], 20 * 1024 * 1024)).trimEnd();
  return [staged, unstaged].filter((s) => s.length > 0).join('\n\n');
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

    if (input[i] === '"') {
      i += 1;
      const bytes: number[] = [];
      while (i < input.length) {
        const ch = input[i];
        if (ch === '"') {
          i += 1;
          break;
        }

        if (ch === '\\' && i + 1 < input.length) {
          const next = input[i + 1] ?? '';

          // \343 のような「最大3桁の8進数エスケープ」をデコードする（gitのquotepath）
          if (next >= '0' && next <= '7') {
            let oct = '';
            let j = i + 1;
            while (j < input.length && oct.length < 3) {
              const c = input[j] ?? '';
              if (c < '0' || c > '7') {
                break;
              }
              oct += c;
              j += 1;
            }
            if (oct.length > 0) {
              bytes.push(parseInt(oct, 8));
              i = i + 1 + oct.length;
              continue;
            }
          }

          // 代表的なエスケープ
          switch (next) {
            case 'n':
              bytes.push(0x0a);
              i += 2;
              continue;
            case 'r':
              bytes.push(0x0d);
              i += 2;
              continue;
            case 't':
              bytes.push(0x09);
              i += 2;
              continue;
            case 'b':
              bytes.push(0x08);
              i += 2;
              continue;
            case 'f':
              bytes.push(0x0c);
              i += 2;
              continue;
            case 'v':
              bytes.push(0x0b);
              i += 2;
              continue;
            case '\\':
              bytes.push(0x5c);
              i += 2;
              continue;
            case '"':
              bytes.push(0x22);
              i += 2;
              continue;
            default: {
              // 不明なエスケープは「次の1文字」をそのまま扱う
              for (const b of Buffer.from(next, 'utf8')) {
                bytes.push(b);
              }
              i += 2;
              continue;
            }
          }
        }

        // 通常文字はUTF-8バイト列として積む（quotepath=falseでも安全）
        for (const b of Buffer.from(ch, 'utf8')) {
          bytes.push(b);
        }
        i += 1;
      }
      tokens.push(Buffer.from(bytes).toString('utf8'));
      continue;
    }

    let token = '';
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

