import * as assert from 'assert';
import { sanitizeAgentLogMessage } from '../../../core/agentLogSanitizer';

suite('core/agentLogSanitizer.ts', () => {
  // TC-N-07: sanitizeAgentLogMessage called with normal log message containing system_reminder blocks
  test('TC-N-07: sanitizeAgentLogMessage removes system_reminder blocks and normalizes formatting', () => {
    // Given: A log message containing system_reminder blocks, event markers, and formatting issues
    const input = `event:tool_call
<system_reminder>
This is a system reminder
</system_reminder>
system:init
Some actual log message
  with trailing whitespace  

Another line

Final line`;

    // When: sanitizeAgentLogMessage is called
    const result = sanitizeAgentLogMessage(input);

    // Then: system_reminder blocks removed, event markers removed, trailing whitespace trimmed, blank lines collapsed
    assert.ok(!result.includes('<system_reminder>'), 'system_reminder blocks should be removed');
    assert.ok(!result.includes('event:tool_call'), 'event markers should be removed');
    assert.ok(!result.includes('system:init'), 'system:init markers should be removed');
    assert.ok(result.includes('Some actual log message'), 'Actual log content should be preserved');
    assert.ok(result.includes('with trailing whitespace'), 'Content should be preserved');
    // 末尾空白がトリムされていること（行末に空白がないことを確認）
    const lines = result.split('\n');
    for (const line of lines) {
      assert.strictEqual(line, line.replace(/\s+$/, ''), 'Trailing whitespace should be trimmed for each line');
    }
    // 連続した空行が1つに畳まれていること（\n\n\n が \n\n になる）
    // 非連続の空行は維持されるので、空行の総数ではなく連続する空行がないことを確認
    assert.ok(!result.includes('\n\n\n'), 'Consecutive blank lines should be collapsed to 1');
  });

  // TC-B-03: sanitizeAgentLogMessage called with empty string
  test('TC-B-03: sanitizeAgentLogMessage returns empty string for empty input', () => {
    // Given: An empty string input
    const input = '';

    // When: sanitizeAgentLogMessage is called
    const result = sanitizeAgentLogMessage(input);

    // Then: Empty string returned
    assert.strictEqual(result, '', 'Empty input should return empty string');
  });

  // TC-B-04: sanitizeAgentLogMessage called with string containing only whitespace
  test('TC-B-04: sanitizeAgentLogMessage returns empty string for whitespace-only input', () => {
    // Given: A string containing only whitespace
    const input = '   \n\t  \r\n  ';

    // When: sanitizeAgentLogMessage is called
    const result = sanitizeAgentLogMessage(input);

    // Then: Empty string returned after trimming
    assert.strictEqual(result, '', 'Whitespace-only input should return empty string after trimming');
  });
});
