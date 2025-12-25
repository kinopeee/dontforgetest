import * as assert from 'assert';
import { extractBetweenMarkers, coerceLegacyPerspectiveMarkdownTable, truncateText } from '../../../../commands/runWithArtifacts/utils';

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
    const markdown = '| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |\n| Some | Table |';

    // When: coerceLegacyPerspectiveMarkdownTable is called
    const result = coerceLegacyPerspectiveMarkdownTable(markdown);

    // Then: Returns undefined
    assert.strictEqual(result, undefined, 'Should return undefined when separator is missing');
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
