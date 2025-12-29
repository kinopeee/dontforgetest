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

  test('TC-RWAU-ADD-N-01: coerceLegacyPerspectiveMarkdownTable tolerates non-table lines before header', () => {
    // Given: Markdown with a non-table line before a valid header+separator+body
    const markdown = [
      '# Title',
      PERSPECTIVE_TABLE_HEADER,
      PERSPECTIVE_TABLE_SEPARATOR,
      '| TC-01 | Input | Perspective | Expected | Notes |',
    ].join('\n');

    // When: coerceLegacyPerspectiveMarkdownTable is called
    const result = coerceLegacyPerspectiveMarkdownTable(markdown);

    // Then: Returns normalized table string and keeps body rows
    assert.ok(typeof result === 'string' && result.length > 0, 'Expected normalized table string');
    assert.ok(result.includes(PERSPECTIVE_TABLE_HEADER), 'Expected normalized header');
    assert.ok(result.includes(PERSPECTIVE_TABLE_SEPARATOR), 'Expected normalized separator');
    assert.ok(result.includes('| TC-01 |'), 'Expected body row to be included');
  });

  test('TC-RWAU-ADD-N-02: coerceLegacyPerspectiveMarkdownTable detects header via keywords (non-legacy header)', () => {
    // Given: A 5-column header that is not the legacy fixed header, but includes header keywords
    const headerVariant = '| Case ID | Input | Perspective | Expected | Notes |';
    const markdown = [
      headerVariant,
      PERSPECTIVE_TABLE_SEPARATOR,
      '| TC-01 | Input | Perspective | Expected | Notes |',
    ].join('\n');

    // When: coerceLegacyPerspectiveMarkdownTable is called
    const result = coerceLegacyPerspectiveMarkdownTable(markdown);

    // Then: Header is detected and output header is normalized to current locale
    assert.ok(typeof result === 'string' && result.length > 0, 'Expected normalized table string');
    assert.ok(result.startsWith(PERSPECTIVE_TABLE_HEADER), 'Expected output header to be normalized');
  });

  test('TC-RWAU-ADD-E-01: coerceLegacyPerspectiveMarkdownTable returns undefined when separator line is missing (header only)', () => {
    // Given: Markdown that contains only a header line (no separator line)
    const markdown = `${PERSPECTIVE_TABLE_HEADER}\n`;

    // When: coerceLegacyPerspectiveMarkdownTable is called
    const result = coerceLegacyPerspectiveMarkdownTable(markdown);

    // Then: Returns undefined
    assert.strictEqual(result, undefined);
  });

  test('TC-RWAU-ADD-B-01: coerceLegacyPerspectiveMarkdownTable stops at first non-table line and ignores rows after it', () => {
    // Given: A table body followed by a non-table line and additional pipe rows
    const markdown = [
      PERSPECTIVE_TABLE_HEADER,
      PERSPECTIVE_TABLE_SEPARATOR,
      '| TC-01 | Input | Perspective | Expected | Notes |',
      'not-a-table-line',
      '| TC-02 | Input | Perspective | Expected | Notes |',
    ].join('\n');

    // When: coerceLegacyPerspectiveMarkdownTable is called
    const result = coerceLegacyPerspectiveMarkdownTable(markdown);

    // Then: Parsing stops at the non-table line (TC-02 is ignored)
    assert.ok(typeof result === 'string' && result.length > 0, 'Expected normalized table string');
    assert.ok(result.includes('| TC-01 |'), 'Expected first body row to be included');
    assert.ok(!result.includes('| TC-02 |'), 'Expected body rows after non-table line to be ignored');
  });

  test('TC-RWAU-ADD-E-02: coerceLegacyPerspectiveMarkdownTable returns undefined when 5-column header contains no known keywords', () => {
    // Given: A 5-column table header that does not contain header keywords
    const headerNoKeywords = '| Col1 | Col2 | Col3 | Col4 | Col5 |';
    const markdown = [
      headerNoKeywords,
      PERSPECTIVE_TABLE_SEPARATOR,
      '| A | B | C | D | E |',
    ].join('\n');

    // When: coerceLegacyPerspectiveMarkdownTable is called
    const result = coerceLegacyPerspectiveMarkdownTable(markdown);

    // Then: Header is not detected and undefined is returned
    assert.strictEqual(result, undefined);
  });
});
