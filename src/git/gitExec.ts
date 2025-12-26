import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type ExecGitResult = { ok: true; stdout: string; stderr: string } | { ok: false; output: string };

/**
 * git コマンドを実行し、stdout を文字列として返す。
 *
 * - `-c core.quotepath=false` を常に付与し、非ASCIIパスが \\343... のようにクォートされるのを抑止する
 */
export async function execGitStdout(cwd: string, args: string[], maxBufferBytes: number): Promise<string> {
  const fullArgs = ['-c', 'core.quotepath=false', ...args];
  const { stdout } = await execFileAsync('git', fullArgs, {
    cwd,
    encoding: 'utf8',
    maxBuffer: maxBufferBytes,
  });
  return typeof stdout === 'string' ? stdout : String(stdout);
}

/**
 * git コマンドを実行し、成功/失敗を扱いやすい形で返す。
 * 失敗時は stderr/stdout/message を連結した `output` を返す。
 */
export async function execGitResult(cwd: string, args: string[], maxBufferBytes: number): Promise<ExecGitResult> {
  const fullArgs = ['-c', 'core.quotepath=false', ...args];
  try {
    const { stdout, stderr } = await execFileAsync('git', fullArgs, {
      cwd,
      encoding: 'utf8',
      maxBuffer: maxBufferBytes,
    });
    return {
      ok: true,
      stdout: typeof stdout === 'string' ? stdout : String(stdout),
      stderr: typeof stderr === 'string' ? stderr : String(stderr),
    };
  } catch (e) {
    const err = e as { stdout?: unknown; stderr?: unknown; message?: unknown };
    const stdoutText = typeof err.stdout === 'string' ? err.stdout : err.stdout ? String(err.stdout) : '';
    const stderrText = typeof err.stderr === 'string' ? err.stderr : err.stderr ? String(err.stderr) : '';
    const message = typeof err.message === 'string' ? err.message : err.message ? String(err.message) : '';
    const output = [stderrText, stdoutText, message].filter((s) => s.trim().length > 0).join('\n').trim();
    return { ok: false, output: output.length > 0 ? output : '(詳細不明)' };
  }
}


