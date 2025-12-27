import { spawn } from 'child_process';
import { nowMs } from './event';
import { type TestExecutionResult } from './artifacts';

/**
 * テスト実行時に収集する stdout/stderr の最大バイト数（UTF-8文字列として保持するため、実際のバイト数とは厳密一致しない）。
 * 既定値は 5MB。
 */
export const MAX_CAPTURE_BYTES = 5 * 1024 * 1024;

export interface RunTestCommandOptions {
  command: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

/**
 * 設定されたテストコマンドを実行し、stdout/stderr/終了コードを収集する。
 *
 * - shell=true で実行（npm/pnpm 等のクロスプラットフォーム性を優先）
 * - 出力は上限付きで収集（肥大化によるメモリ圧迫を回避）
 */
export async function runTestCommand(options: RunTestCommandOptions): Promise<TestExecutionResult> {
  const startedAt = nowMs();
  const maxCaptureBytes = MAX_CAPTURE_BYTES;
  const env = options.env ? { ...process.env, ...options.env } : process.env;

  let stdout = '';
  let stderr = '';
  let stdoutTruncated = false;
  let stderrTruncated = false;

  const append = (prev: string, chunk: Buffer, markTruncated: () => void): string => {
    if (prev.length >= maxCaptureBytes) {
      markTruncated();
      return prev;
    }
    const next = prev + chunk.toString('utf8');
    if (next.length > maxCaptureBytes) {
      markTruncated();
      return next.slice(0, maxCaptureBytes);
    }
    return next;
  };

  return await new Promise<TestExecutionResult>((resolve) => {
    let resolved = false;
    const finish = (result: TestExecutionResult) => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve(result);
    };

    const child = spawn(options.command, {
      cwd: options.cwd,
      env,
      shell: true,
      stdio: 'pipe',
    });

    child.stdout.on('data', (data: Buffer) => {
      stdout = append(stdout, data, () => {
        stdoutTruncated = true;
      });
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr = append(stderr, data, () => {
        stderrTruncated = true;
      });
    });

    child.on('error', (err) => {
      const durationMs = Math.max(0, nowMs() - startedAt);
      finish({
        command: options.command,
        cwd: options.cwd,
        exitCode: null,
        signal: null,
        durationMs,
        stdout: stdoutTruncated ? `${stdout}\n... (stdout truncated)` : stdout,
        stderr: stderrTruncated ? `${stderr}\n... (stderr truncated)` : stderr,
        stdoutTruncated,
        stderrTruncated,
        errorMessage: err.message,
        executionRunner: 'extension',
      });
    });

    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      const durationMs = Math.max(0, nowMs() - startedAt);
      finish({
        command: options.command,
        cwd: options.cwd,
        exitCode: code,
        signal,
        durationMs,
        stdout: stdoutTruncated ? `${stdout}\n... (stdout truncated)` : stdout,
        stderr: stderrTruncated ? `${stderr}\n... (stderr truncated)` : stderr,
        stdoutTruncated,
        stderrTruncated,
        executionRunner: 'extension',
      });
    });
  });
}
