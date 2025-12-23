import * as assert from 'assert';
import { runTestCommand } from '../../../core/testRunner';

suite('core/testRunner.ts', () => {
  const cwd = process.cwd();

  // TC-RUN-01: 正常なコマンド実行
  test('TC-RUN-01: 正常なコマンドが実行され、標準出力が取得できる', async () => {
    // Given: echo コマンド（OSに応じてクオートを調整）
    const command = process.platform === 'win32' ? 'echo hello world' : 'echo "hello world"';

    // When: runTestCommand を呼び出す
    const result = await runTestCommand({ command, cwd });

    // Then: 正常終了し、標準出力に "hello world" が含まれること
    assert.strictEqual(result.exitCode, 0, 'Exit code は 0 であるべき');
    assert.ok(result.stdout.includes('hello world'), 'Stdout に出力が含まれていること');
    assert.strictEqual(result.stderr.trim(), '', 'Stderr は空であるべき');
  });

  // TC-RUN-02: 無効なコマンド実行
  test('TC-RUN-02: 存在しないコマンド実行時にエラーまたは非0終了コードとなる', async () => {
    // Given: 存在しないコマンド
    const command = 'invalid_command_that_does_not_exist_12345';

    // When: runTestCommand を呼び出す
    const result = await runTestCommand({ command, cwd });

    // Then: 終了コードが非0、またはエラーメッセージが設定されること
    assert.ok(result.exitCode !== 0 || result.errorMessage !== undefined, '失敗するかエラーメッセージが返されるべき');
  });

  // TC-RUN-03: 失敗するコマンド実行 (exit code != 0)
  test('TC-RUN-03: コマンドが失敗した場合、終了コード 1 が返される', async () => {
    // Given: exit 1 を返すコマンド
    const command = process.platform === 'win32' ? 'cmd /c exit 1' : 'exit 1';

    // When: runTestCommand を呼び出す
    const result = await runTestCommand({ command, cwd });

    // Then: exitCode が 1 であること
    assert.strictEqual(result.exitCode, 1, 'Exit code は 1 であるべき');
  });

  // TC-RUN-04: 大量出力の切り詰め
  test('TC-RUN-04: 大量出力時に出力が切り詰められる', async function() {
    this.timeout(10000); 
    // Given: 大量出力を生成するコマンド (5MB制限を超える6MB)
    const largeSize = 6 * 1024 * 1024;
    const command = `node -e "console.log('a'.repeat(${largeSize}))"`;

    // When: runTestCommand を呼び出す
    const result = await runTestCommand({ command, cwd });

    // Then: 出力が切り詰められていること
    assert.ok(result.stdout.includes('truncated'), '出力に truncated メッセージが含まれること');
    assert.ok(result.stdout.length < largeSize, '出力サイズが元のサイズより小さいこと（制限されていること）');
    assert.ok(result.stdout.length > 0, '出力が空でないこと');
  });
});
