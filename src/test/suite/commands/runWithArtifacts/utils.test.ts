import * as assert from 'assert';
import { extractBetweenMarkers, coerceLegacyPerspectiveMarkdownTable, truncateText } from '../../../../commands/runWithArtifacts/utils';
import { PERSPECTIVE_TABLE_HEADER, PERSPECTIVE_TABLE_SEPARATOR } from '../../../../core/artifacts';

suite('commands/runWithArtifacts/utils.ts', () => {
  // TC-B-26: extractBetweenMarkers called with text containing begin marker but no end marker
  test('TC-B-26: extractBetweenMarkers returns undefined when end marker is missing', () => {
    // Given: Text containing begin marker but no end marker
    const text = '<!-- BEGIN TEST PERSPECTIVES JSON -->\nSome content';
    const begin = '<!-- BEGIN TEST PERSPECTIVES JSON -->';
    const end = '<!-- END TEST PERSPECTIVES JSON -->';

    // When: extractBetweenMarkers is called
    const result = extractBetweenMarkers(text, begin, end);

    // Then: Returns undefined
    assert.strictEqual(result, undefined, 'Should return undefined when end marker is missing');
  });

  // TC-B-27: extractBetweenMarkers called with text containing end marker but no begin marker
  test('TC-B-27: extractBetweenMarkers returns undefined when begin marker is missing', () => {
    // Given: Text containing end marker but no begin marker
    const text = 'Some content\n<!-- END TEST PERSPECTIVES JSON -->';
    const begin = '<!-- BEGIN TEST PERSPECTIVES JSON -->';
    const end = '<!-- END TEST PERSPECTIVES JSON -->';

    // When: extractBetweenMarkers is called
    const result = extractBetweenMarkers(text, begin, end);

    // Then: Returns undefined
    assert.strictEqual(result, undefined, 'Should return undefined when begin marker is missing');
  });

  // TC-B-28: coerceLegacyPerspectiveMarkdownTable called with markdown missing header
  test('TC-B-28: coerceLegacyPerspectiveMarkdownTable returns undefined when header is missing', () => {
    // Given: Markdown missing header
    const markdown = '| Some | Table |\n|------|-------|';

    // When: coerceLegacyPerspectiveMarkdownTable is called
    const result = coerceLegacyPerspectiveMarkdownTable(markdown);

    // Then: Returns undefined
    assert.strictEqual(result, undefined, 'Should return undefined when header is missing');
  });

  // TC-B-29: coerceLegacyPerspectiveMarkdownTable called with markdown having header but no separator
  test('TC-B-29: coerceLegacyPerspectiveMarkdownTable returns undefined when separator is missing', () => {
    // Given: Markdown having header but no separator
    const markdown = `${PERSPECTIVE_TABLE_HEADER}\n| Some | Table |`;

    // When: coerceLegacyPerspectiveMarkdownTable is called
    const result = coerceLegacyPerspectiveMarkdownTable(markdown);

    // Then: Returns undefined
    assert.strictEqual(result, undefined, 'Should return undefined when separator is missing');
  });

  // TC-B-32: 本体行の列数が不正なMarkdownでcoerceLegacyPerspectiveMarkdownTableを呼び出す
  test('TC-B-32: 本体行の列数が不正な場合、coerceLegacyPerspectiveMarkdownTableはundefinedを返す', () => {
    // Given: 有効なヘッダー/区切り行を持つが、本体行が6列（正しくは5列）のMarkdown
    const markdown = [
      PERSPECTIVE_TABLE_HEADER,
      PERSPECTIVE_TABLE_SEPARATOR,
      '| TC-01 | Input | Perspective | Expected | Notes | Priority |', // 6列（7個のパイプ）
    ].join('\n');

    // When: coerceLegacyPerspectiveMarkdownTableを呼び出す
    const result = coerceLegacyPerspectiveMarkdownTable(markdown);

    // Then: undefinedを返す（列数不一致の不正なテーブルを拒否）
    assert.strictEqual(result, undefined, 'Should return undefined when body rows have incorrect column count');
  });

  // TC-N-33: 行末パイプが無い本体行（5列）でもcoerceLegacyPerspectiveMarkdownTableが受理する
  test('TC-N-33: 行末パイプが無い本体行でも、列数が正しければ受理される', () => {
    // Given: 有効なヘッダー/区切り行を持ち、本体行が5列だが行末のパイプが無いMarkdown
    const bodyRow = '| TC-01 | Input | Perspective | Expected | Notes'; // 5列、行末パイプなし
    const markdown = [
      PERSPECTIVE_TABLE_HEADER,
      PERSPECTIVE_TABLE_SEPARATOR,
      bodyRow,
    ].join('\n');

    // When: coerceLegacyPerspectiveMarkdownTableを呼び出す
    const result = coerceLegacyPerspectiveMarkdownTable(markdown);

    // Then: 受理され、行末パイプなしの本体行がそのまま保持される
    assert.ok(typeof result === 'string' && result.length > 0, 'Should return normalized table string');
    assert.ok(result.includes(bodyRow), 'Body row should be included as-is');
  });

  // TC-B-33: 行末パイプが無くても、6列の本体行はcoerceLegacyPerspectiveMarkdownTableが拒否する
  test('TC-B-33: 行末パイプが無い場合でも、本体行が6列なら拒否される', () => {
    // Given: 有効なヘッダー/区切り行を持つが、本体行が6列（正しくは5列）で行末パイプが無いMarkdown
    const markdown = [
      PERSPECTIVE_TABLE_HEADER,
      PERSPECTIVE_TABLE_SEPARATOR,
      '| TC-01 | Input | Perspective | Expected | Notes | Priority', // 6列、行末パイプなし
    ].join('\n');

    // When: coerceLegacyPerspectiveMarkdownTableを呼び出す
    const result = coerceLegacyPerspectiveMarkdownTable(markdown);

    // Then: undefinedを返す（列数不一致の不正なテーブルを拒否）
    assert.strictEqual(result, undefined, 'Should return undefined when body rows have extra columns without trailing pipe');
  });

  // TC-N-34: セル内にエスケープされたパイプ（\\|）が含まれていてもcoerceLegacyPerspectiveMarkdownTableが受理する
  test('TC-N-34: セル内のエスケープされたパイプを含む本体行でも受理される', () => {
    // Given: 有効なヘッダー/区切り行を持ち、セル内にエスケープされたパイプ（\\|）を含むMarkdown
    const bodyRow = '| TC-01 | Input \\| More | Perspective | Expected | Notes |';
    const markdown = [
      PERSPECTIVE_TABLE_HEADER,
      PERSPECTIVE_TABLE_SEPARATOR,
      bodyRow,
    ].join('\n');

    // When: coerceLegacyPerspectiveMarkdownTableを呼び出す
    const result = coerceLegacyPerspectiveMarkdownTable(markdown);

    // Then: 受理され、エスケープされたパイプを含む本体行がそのまま保持される
    assert.ok(typeof result === 'string' && result.length > 0, 'Should return normalized table string');
    assert.ok(result.includes(bodyRow), 'Body row with escaped pipe should be included as-is');
  });

  // TC-B-30: truncateText called with text length exactly equal to maxChars
  test('TC-B-30: truncateText returns original text when length equals maxChars', () => {
    // Given: Text length exactly equal to maxChars
    const text = 'a'.repeat(100);
    const maxChars = 100;

    // When: truncateText is called
    const result = truncateText(text, maxChars);

    // Then: Original text returned without truncation
    assert.strictEqual(result, text, 'Text at boundary should not be truncated');
  });

  // TC-B-31: truncateText called with text length = maxChars + 1
  test('TC-B-31: truncateText truncates text when length exceeds maxChars', () => {
    // Given: Text length = maxChars + 1
    const text = 'a'.repeat(101);
    const maxChars = 100;

    // When: truncateText is called
    const result = truncateText(text, maxChars);

    // Then: Text truncated to maxChars with truncation message appended
    assert.ok(result.length > maxChars, 'Result should include truncation message');
    assert.ok(result.includes('truncated'), 'Result should include truncation message');
    assert.ok(result.startsWith('a'.repeat(100)), 'Result should start with truncated text');
  });
});
