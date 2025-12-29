import * as child_process from 'child_process';

export type ExecGitResult = { ok: true; stdout: string; stderr: string } | { ok: false; output: string };

/**
 * child_process.execFile を Promise 化する。
 *
 * NOTE:
 * - util.promisify を使うとモジュール初期化時に execFile を束縛してしまい、テストでのモックが困難になる。
 * - ここでは都度 child_process.execFile を呼ぶことで、テスト側での差し替えを可能にする。
 */
async function execFileAsync(
  file: string,
  args: string[],
  options: child_process.ExecFileOptions,
): Promise<{ stdout: unknown; stderr: unknown }> {
  return await new Promise((resolve, reject) => {
    child_process.execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        // Node.js の execFile/promisify と同様に、stdout/stderr を error に載せる（載っていない場合のみ）
        const errObj = error as unknown as { stdout?: unknown; stderr?: unknown };
        if (typeof errObj === 'object' && errObj !== null) {
          if (errObj.stdout === undefined) errObj.stdout = stdout;
          if (errObj.stderr === undefined) errObj.stderr = stderr;
        }
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

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
    const normalizePart = (value: unknown): string => {
      const text = typeof value === 'string' ? value : value ? String(value) : '';
      return text.trim();
    };
    const stdoutText = normalizePart(err.stdout);
    const stderrText = normalizePart(err.stderr);
    const message = normalizePart(err.message);
    const output = [stderrText, stdoutText, message].filter((s) => s.length > 0).join('\n');
    return { ok: false, output: output.length > 0 ? output : '(詳細不明)' };
  }
}




