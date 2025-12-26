import * as assert from 'assert';
import { parseMochaOutput } from '../../../core/testResultParser';

suite('core/testResultParser.ts', () => {
  // TC-TRP-01: Mocha形式出力のパース（成功/失敗）
  test('TC-TRP-01: Mocha形式の出力からテストケースごとの成否が抽出できる', () => {
    // Given: Mocha 風の出力（スイート/成功/失敗を含む）
    const stdout = [
      '  Suite A',
      '      ✔ TC-A-01: pass case',
      '      1) TC-A-02: fail case',
      '  Suite B',
      '      ✔ name with | pipe',
      '',
    ].join('\n');

    // When: parseMochaOutput を呼び出す
    const result = parseMochaOutput(stdout);

    // Then: パースに成功し、件数と明細が期待通りであること
    assert.strictEqual(result.parsed, true, 'parsed=true であるべき');
    assert.strictEqual(result.passed, 2, '成功件数が一致すること');
    assert.strictEqual(result.failed, 1, '失敗件数が一致すること');
    assert.strictEqual(result.cases.length, 3, 'ケース数が一致すること');

    assert.strictEqual(result.cases[0]?.suite, 'Suite A', 'スイート名が抽出できること');
    assert.strictEqual(result.cases[0]?.passed, true, '成功が抽出できること');
    assert.strictEqual(result.cases[0]?.name, 'TC-A-01: pass case', 'テスト名が抽出できること');

    assert.strictEqual(result.cases[1]?.suite, 'Suite A', '同一スイートのまま抽出できること');
    assert.strictEqual(result.cases[1]?.passed, false, '失敗が抽出できること');
    assert.strictEqual(result.cases[1]?.name, 'TC-A-02: fail case', '失敗テスト名が抽出できること');

    assert.strictEqual(result.cases[2]?.suite, 'Suite B', 'スイートが切り替わること');
    assert.strictEqual(result.cases[2]?.passed, true, '成功が抽出できること');
    assert.strictEqual(result.cases[2]?.name, 'name with | pipe', '記号を含むテスト名も抽出できること');
  });

  // TC-TRP-02: Mocha形式でない場合はパース失敗扱い
  test('TC-TRP-02: Mocha形式の記号がない出力は parsed=false になる', () => {
    // Given: テスト結果の記号（✔/✓/✖/番号）が含まれない出力
    const stdout = [
      'some logs',
      '[dontforgetest] VS Code tests launcher: open ...',
      'Exit code: 0',
      '',
    ].join('\n');

    // When: parseMochaOutput を呼び出す
    const result = parseMochaOutput(stdout);

    // Then: パースできず、件数は0であること
    assert.strictEqual(result.parsed, false, 'parsed=false であるべき');
    assert.strictEqual(result.passed, 0, '成功件数は0であるべき');
    assert.strictEqual(result.failed, 0, '失敗件数は0であるべき');
    assert.strictEqual(result.cases.length, 0, 'ケースは空であるべき');
  });
});


