import * as assert from 'assert';
import { extractBetweenMarkers, coerceLegacyPerspectiveMarkdownTable, truncateText } from '../../../../commands/runWithArtifacts/utils';
import { parsePerspectiveJsonV1, parseTestExecutionJsonV1, PERSPECTIVE_TABLE_HEADER, PERSPECTIVE_TABLE_SEPARATOR } from '../../../../core/artifacts';

suite('commands/runWithArtifacts/utils.ts', () => {
  // TC-UTIL-EXT-01: Text contains single pair of markers
  test('TC-UTIL-EXT-01: extractBetweenMarkers returns content when text contains single pair of markers', () => {
    // Given: Text with one valid marker pair
    const text = 'prefix<BEGIN>content<END>suffix';
    const begin = '<BEGIN>';
    const end = '<END>';

    // When: extractBetweenMarkers is called
    const result = extractBetweenMarkers(text, begin, end);

    // Then: Returns the content between markers
    assert.strictEqual(result, 'content');
  });

  // TC-UTIL-EXT-02: Text contains multiple BEGIN markers before END
  test('TC-UTIL-EXT-02: extractBetweenMarkers returns content after the LAST begin marker when multiple BEGINs exist', () => {
    // Given: Text with multiple BEGIN markers before one END marker
    // This simulates hallucinated or nested markers where we want the innermost/latest one
    const text = 'prefix<BEGIN>fake<BEGIN>real content<END>suffix';
    const begin = '<BEGIN>';
    const end = '<END>';

    // When: extractBetweenMarkers is called
    const result = extractBetweenMarkers(text, begin, end);

    // Then: Returns content after the last BEGIN marker
    assert.strictEqual(result, 'real content');
  });

  // TC-UTIL-EXT-03: Text contains BEGIN but no END
  test('TC-UTIL-EXT-03: extractBetweenMarkers returns undefined when END marker is missing', () => {
    // Given: Text with BEGIN but no END
    const text = 'prefix<BEGIN>content';
    const begin = '<BEGIN>';
    const end = '<END>';

    // When: extractBetweenMarkers is called
    const result = extractBetweenMarkers(text, begin, end);

    // Then: Returns undefined
    assert.strictEqual(result, undefined);
  });

  // TC-UTIL-EXT-04: Text contains END but no BEGIN
  test('TC-UTIL-EXT-04: extractBetweenMarkers returns undefined when BEGIN marker is missing', () => {
    // Given: Text with END but no BEGIN
    const text = 'content<END>suffix';
    const begin = '<BEGIN>';
    const end = '<END>';

    // When: extractBetweenMarkers is called
    const result = extractBetweenMarkers(text, begin, end);

    // Then: Returns undefined
    assert.strictEqual(result, undefined);
  });

  // TC-JSON-PER-01: Input is valid raw JSON starting with '{' (no markdown fences)
  test('TC-JSON-PER-01: parsePerspectiveJsonV1 parses valid raw JSON starting with "{" (direct parse)', () => {
    // Given: Raw JSON string without markdown markers
    const json = JSON.stringify({
      version: 1,
      cases: [{ caseId: 'TC-01', perspective: 'Direct JSON' }]
    });

    // When: parsePerspectiveJsonV1 is called
    const result = parsePerspectiveJsonV1(json);

    // Then: Parses successfully
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.cases[0].perspective, 'Direct JSON');
    }
  });

  // TC-JSON-PER-02: Input is valid JSON inside markdown code blocks
  test('TC-JSON-PER-02: parsePerspectiveJsonV1 parses valid JSON inside markdown code blocks (extraction fallback)', () => {
    // Given: JSON inside markdown fences (legacy format)
    const jsonContent = JSON.stringify({
      version: 1,
      cases: [{ caseId: 'TC-02', perspective: 'Fenced JSON' }]
    });
    const input = `\`\`\`json\n${jsonContent}\n\`\`\``;

    // When: parsePerspectiveJsonV1 is called
    const result = parsePerspectiveJsonV1(input);

    // Then: Parses successfully via extraction
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.cases[0].perspective, 'Fenced JSON');
    }
  });

  // TC-JSON-PER-03: Input starts with '{' but is invalid JSON
  test('TC-JSON-PER-03: parsePerspectiveJsonV1 returns invalid-json error when input starts with "{" but is invalid', () => {
    // Given: Invalid JSON starting with '{'
    const input = '{ "version": 1, "cases": [ '; // Missing closing brackets

    // When: parsePerspectiveJsonV1 is called
    const result = parsePerspectiveJsonV1(input);

    // Then: Returns invalid-json error (direct parse attempt)
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes('invalid-json'), `Expected invalid-json error, got: ${result.error}`);
    }
  });

  // TC-JSON-PER-04: Input is valid JSON but has wrong version/schema
  test('TC-JSON-PER-04: parsePerspectiveJsonV1 returns error when JSON schema/version is invalid', () => {
    // Given: Valid JSON but wrong version
    const input = JSON.stringify({ version: 2, cases: [] });

    // When: parsePerspectiveJsonV1 is called
    const result = parsePerspectiveJsonV1(input);

    // Then: Returns error (not ok)
    assert.strictEqual(result.ok, false);
  });

  // TC-JSON-EXEC-01: Input is valid raw JSON starting with '{'
  test('TC-JSON-EXEC-01: parseTestExecutionJsonV1 parses valid raw JSON starting with "{" (direct parse)', () => {
    // Given: Raw JSON string for execution result
    const json = JSON.stringify({
      version: 1,
      exitCode: 0,
      stdout: 'Direct Execution JSON'
    });

    // When: parseTestExecutionJsonV1 is called
    const result = parseTestExecutionJsonV1(json);

    // Then: Parses successfully
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.stdout, 'Direct Execution JSON');
    }
  });

  // TC-N-01
  test('TC-N-01: extractBetweenMarkers returns content from the last begin/end pair', () => {
    // Given: Text containing multiple begin/end pairs
    const text = 'A<BEGIN>first<END>B<BEGIN>last<END>';
    const begin = '<BEGIN>';
    const end = '<END>';

    // When: extractBetweenMarkers is called
    const result = extractBetweenMarkers(text, begin, end);

    // Then: Returns the content from the last pair
    assert.strictEqual(result, 'last');
  });

  // TC-N-02
  test('TC-N-02: parsePerspectiveJsonV1 succeeds with valid JSON containing "{ }" in strings', () => {
    // Given: Valid Perspective JSON where a string contains JSON-like braces
    const json = JSON.stringify({
      version: 1,
      cases: [{
        caseId: 'TC-01',
        perspective: 'Contains { braces } in string',
      }]
    });

    // When: parsePerspectiveJsonV1 is called
    const result = parsePerspectiveJsonV1(json);

    // Then: parse succeeds and returns ok: true
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.cases[0].perspective, 'Contains { braces } in string');
    }
  });

  // TC-E-01
  test('TC-E-01: extractBetweenMarkers returns undefined when begin marker is missing', () => {
    // Given: Text missing the begin marker
    const text = 'Some content\n<!-- END TEST PERSPECTIVES JSON -->';
    const begin = '<!-- BEGIN TEST PERSPECTIVES JSON -->';
    const end = '<!-- END TEST PERSPECTIVES JSON -->';

    // When: extractBetweenMarkers is called
    const result = extractBetweenMarkers(text, begin, end);

    // Then: Returns undefined
    assert.strictEqual(result, undefined);
  });

  // TC-E-02
  test('TC-E-02: extractBetweenMarkers returns undefined when end marker is missing after the last begin', () => {
    // Given: Text containing begin marker but no end marker after it
    const text = '<!-- BEGIN TEST PERSPECTIVES JSON -->\nSome content';
    const begin = '<!-- BEGIN TEST PERSPECTIVES JSON -->';
    const end = '<!-- END TEST PERSPECTIVES JSON -->';

    // When: extractBetweenMarkers is called
    const result = extractBetweenMarkers(text, begin, end);

    // Then: Returns undefined
    assert.strictEqual(result, undefined);
  });

  // TC-E-03
  test('TC-E-03: parsePerspectiveJsonV1 returns error for malformed JSON', () => {
    // Given: Malformed JSON (missing closing brace)
    const json = '{"version":1, "cases": [';

    // When: parsePerspectiveJsonV1 is called
    const result = parsePerspectiveJsonV1(json);

    // Then: returns ok: false and error starts with "invalid-json:"
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.startsWith('invalid-json:'), `Error should start with "invalid-json:", got: ${result.error}`);
    }
  });

  // TC-E-04
  test('TC-E-04: parsePerspectiveJsonV1 returns error for JSON array', () => {
    // Given: Valid JSON but it is an array instead of an object
    const json = '[]';

    // When: parsePerspectiveJsonV1 is called
    const result = parsePerspectiveJsonV1(json);

    // Then: returns ok: false and error is "json-not-object"
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error, 'json-not-object');
    }
  });

  // TC-E-05
  test('TC-E-05: parsePerspectiveJsonV1 returns error for JSON null', () => {
    // Given: Valid JSON but it is null
    const json = 'null';

    // When: parsePerspectiveJsonV1 is called
    const result = parsePerspectiveJsonV1(json);

    // Then: returns ok: false and error is "json-not-object"
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error, 'json-not-object');
    }
  });

  // TC-E-06
  test('TC-E-06: parsePerspectiveJsonV1 returns error for unsupported version', () => {
    // Given: Valid JSON object but version is not 1
    const json = JSON.stringify({ version: 2, cases: [] });

    // When: parsePerspectiveJsonV1 is called
    const result = parsePerspectiveJsonV1(json);

    // Then: returns ok: false
    assert.strictEqual(result.ok, false);
  });

  // TC-E-08
  test('TC-E-08: parseTestExecutionJsonV1 returns error for JSON syntax error', () => {
    // Given: Malformed Execution JSON
    const json = '{ "exitCode": 0, ';

    // When: parseTestExecutionJsonV1 is called
    const result = parseTestExecutionJsonV1(json);

    // Then: returns ok: false and error includes "invalid-json"
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.error.includes('invalid-json'), `Error should include "invalid-json", got: ${result.error}`);
    }
  });

  // TC-B-01
  test('TC-B-01: extractBetweenMarkers returns empty string when content between markers is empty', () => {
    // Given: Text with markers but no content between them
    const text = 'prefix<BEGIN><END>suffix';
    const begin = '<BEGIN>';
    const end = '<END>';

    // When: extractBetweenMarkers is called
    const result = extractBetweenMarkers(text, begin, end);

    // Then: Returns empty string
    assert.strictEqual(result, '');
  });

  // TC-E-03
  test('TC-E-03: extractBetweenMarkers returns undefined when end marker only appears before the last begin', () => {
    // Given: Text with an end marker only before the last begin marker
    const text = '<END>early end<BEGIN>later begin with no end';
    const begin = '<BEGIN>';
    const end = '<END>';

    // When: extractBetweenMarkers is called
    const result = extractBetweenMarkers(text, begin, end);

    // Then: Returns undefined because no end exists after the last begin
    assert.strictEqual(result, undefined);
  });

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

  // TC-N-35: extractBetweenMarkers called with multiple marker pairs returns the last complete pair
  test('TC-N-35: extractBetweenMarkers returns content from the last complete marker pair when multiple pairs exist', () => {
    // Given: Text containing multiple marker pairs (e.g., prompt instructions and actual output)
    const text = [
      'Some prompt text',
      '- <!-- BEGIN TEST PERSPECTIVES JSON -->',
      'This is not JSON',
      '- <!-- END TEST PERSPECTIVES JSON -->',
      'More text',
      '<!-- BEGIN TEST PERSPECTIVES JSON -->',
      '{"version":1,"cases":[]}',
      '<!-- END TEST PERSPECTIVES JSON -->',
    ].join('\n');
    const begin = '<!-- BEGIN TEST PERSPECTIVES JSON -->';
    const end = '<!-- END TEST PERSPECTIVES JSON -->';

    // When: extractBetweenMarkers is called
    const result = extractBetweenMarkers(text, begin, end);

    // Then: Returns content from the last complete pair (actual JSON output)
    assert.strictEqual(result, '{"version":1,"cases":[]}', 'Should return content from the last complete marker pair');
  });

  // TC-N-36: extractBetweenMarkers handles multiple pairs where only the last has a matching end
  test('TC-N-36: extractBetweenMarkers returns content from the last begin when earlier pairs are incomplete', () => {
    // Given: Text with incomplete early pairs and a complete last pair
    const text = [
      '- <!-- BEGIN TEST PERSPECTIVES JSON -->',
      'Incomplete content',
      'More text',
      '<!-- BEGIN TEST PERSPECTIVES JSON -->',
      '{"version":1,"cases":[{"caseId":"TC-1"}]}',
      '<!-- END TEST PERSPECTIVES JSON -->',
    ].join('\n');
    const begin = '<!-- BEGIN TEST PERSPECTIVES JSON -->';
    const end = '<!-- END TEST PERSPECTIVES JSON -->';

    // When: extractBetweenMarkers is called
    const result = extractBetweenMarkers(text, begin, end);

    // Then: Returns content from the last complete pair
    assert.strictEqual(result, '{"version":1,"cases":[{"caseId":"TC-1"}]}', 'Should return content from the last complete pair');
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
