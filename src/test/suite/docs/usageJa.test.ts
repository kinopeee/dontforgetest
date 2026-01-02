import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

type SettingEntry = { key: string; description: string; rawLine: string; lineIndex0: number };

function resolveRepoRootFromHere(startDir: string): string {
  // Given: This test runs from a compiled output directory (e.g., out/test/suite/**)
  // When: Walking up directories to locate the repo root
  // Then: Finds a directory containing package.json and docs/
  let dir = startDir;
  for (let i = 0; i < 12; i += 1) {
    const hasPackageJson = fs.existsSync(path.join(dir, 'package.json'));
    const hasDocsDir = fs.existsSync(path.join(dir, 'docs'));
    if (hasPackageJson && hasDocsDir) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(`Failed to resolve repo root from __dirname="${startDir}"`);
}

function readUtf8(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function splitLines(input: string): string[] {
  return input.replace(/\r\n/g, '\n').split('\n');
}

function extractSectionLines(params: { markdown: string; h2Title: string }): { lines: string[]; startLineIndex0: number } {
  const lines = splitLines(params.markdown);
  const headerLine = `## ${params.h2Title}`;
  const start = lines.findIndex((l) => l.trim() === headerLine);
  if (start < 0) {
    throw new Error(`Section header not found: "${headerLine}"`);
  }

  // Find next H2 (## ...) after the header.
  const end = (() => {
    for (let i = start + 1; i < lines.length; i += 1) {
      if (lines[i].startsWith('## ')) {
        return i;
      }
    }
    return lines.length;
  })();

  return { lines: lines.slice(start, end), startLineIndex0: start };
}

function extractSettingsBulletBlock(sectionLines: string[]): { lines: string[]; startIndexInSection0: number } {
  // Find first list item line in the section and return the contiguous list block (including blank lines and indented sub-items).
  const start = sectionLines.findIndex((l) => l.startsWith('- **`dontforgetest.'));
  if (start < 0) {
    throw new Error('Settings bullet list start not found (expected "- **`dontforgetest.")');
  }

  const block: string[] = [];
  for (let i = start; i < sectionLines.length; i += 1) {
    const line = sectionLines[i];
    const isListOrContinuation =
      line.trim() === '' || line.startsWith('- ') || line.startsWith('  - ') || line.startsWith('    - ') || line.startsWith('  ');
    if (!isListOrContinuation) {
      break;
    }
    block.push(line);
  }

  if (block.length === 0) {
    throw new Error('Settings bullet list block is empty');
  }
  return { lines: block, startIndexInSection0: start };
}

function parseTopLevelSettingEntries(blockLines: string[]): SettingEntry[] {
  const entries: SettingEntry[] = [];
  const re = /^- \*\*`(dontforgetest\.[^`]+)`\*\*:\s*(.+)$/;
  for (let i = 0; i < blockLines.length; i += 1) {
    const line = blockLines[i];
    if (!line.startsWith('- **`dontforgetest.')) {
      continue;
    }
    const m = re.exec(line);
    if (!m) {
      throw new Error(`Invalid setting bullet format at block line ${i + 1}: "${line}"`);
    }
    entries.push({ key: m[1], description: m[2], rawLine: line, lineIndex0: i });
  }
  if (entries.length === 0) {
    throw new Error('No setting entries found in bullet block');
  }
  return entries;
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') {
    throw new Error('needle must be non-empty');
  }
  let count = 0;
  let idx = 0;
  while (true) {
    const next = haystack.indexOf(needle, idx);
    if (next < 0) {
      return count;
    }
    count += 1;
    idx = next + needle.length;
  }
}

function assertNoTrailingWhitespace(lines: string[], label: string): void {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const hasTrailing = /[ \t]+$/.test(line);
    assert.strictEqual(hasTrailing, false, `${label}: trailing whitespace detected at line ${i + 1}: "${line}"`);
  }
}

function normalizeForPasteSimulation(input: string): string {
  // A conservative "copy/paste" normalization: CRLF -> LF, strip trailing spaces, and collapse 2+ blank lines.
  const lines = splitLines(input).map((l) => l.replace(/[ \t]+$/g, ''));
  const out: string[] = [];
  let blankRun = 0;
  for (const line of lines) {
    if (line.trim() === '') {
      blankRun += 1;
      if (blankRun <= 1) {
        out.push('');
      }
      continue;
    }
    blankRun = 0;
    out.push(line);
  }
  return out.join('\n');
}

suite('docs/usage.ja.md Settings section (markdown structure)', () => {
  const repoRoot = resolveRepoRootFromHere(__dirname);
  const usageJaPath = path.join(repoRoot, 'docs', 'usage.ja.md');
  const usageEnPath = path.join(repoRoot, 'docs', 'usage.md');

  const usageJa = readUtf8(usageJaPath);
  const usageEn = readUtf8(usageEnPath);

  const jaSection = extractSectionLines({ markdown: usageJa, h2Title: '設定' });
  const enSection = extractSectionLines({ markdown: usageEn, h2Title: 'Settings' });

  const jaBlock = extractSettingsBulletBlock(jaSection.lines);
  const enBlock = extractSettingsBulletBlock(enSection.lines);

  const jaEntries = parseTopLevelSettingEntries(jaBlock.lines);
  const enEntries = parseTopLevelSettingEntries(enBlock.lines);

  // TC-N-01
  test('TC-N-01: Settings list remains coherent despite a blank line', () => {
    // Given: The Settings bullet block in docs/usage.ja.md
    const blockLines = jaBlock.lines;

    // When: Inspecting the placement of the blank line between defaultModel and testStrategyPath
    const defaultModelIndex = blockLines.findIndex((l) => l.includes('`dontforgetest.defaultModel`'));
    const testStrategyIndex = blockLines.findIndex((l) => l.includes('`dontforgetest.testStrategyPath`'));

    // Then: Both entries exist and there is exactly one empty line between them
    assert.ok(defaultModelIndex >= 0, 'Expected `dontforgetest.defaultModel` bullet to exist');
    assert.ok(testStrategyIndex >= 0, 'Expected `dontforgetest.testStrategyPath` bullet to exist');
    assert.ok(defaultModelIndex < testStrategyIndex, 'Expected defaultModel to appear before testStrategyPath');
    assert.strictEqual(
      blockLines[defaultModelIndex + 1]?.trim(),
      '',
      'Expected a single blank line immediately after defaultModel bullet'
    );
    assert.strictEqual(
      blockLines[defaultModelIndex + 2]?.startsWith('- **`dontforgetest.testStrategyPath`**:'),
      true,
      'Expected testStrategyPath bullet to follow after one blank line'
    );
  });

  // TC-N-02
  test('TC-N-02: Setting bullets keep consistent formatting (bold + code span + colon)', () => {
    // Given: Parsed top-level setting entries
    const entries = jaEntries;

    // When: Checking each raw line formatting
    // Then: Each entry matches the expected bullet format and contains the exact key once
    for (const e of entries) {
      assert.ok(e.rawLine.startsWith(`- **\`${e.key}\`**:`), `Expected consistent prefix for ${e.key}`);
      assert.strictEqual(countOccurrences(e.rawLine, `\`${e.key}\``), 1, `Expected exactly one code span for ${e.key}`);
    }
  });

  // TC-N-03
  test('TC-N-03: No new style issues in Settings bullets (basic lint heuristics)', () => {
    // Given: The Settings bullet block
    const blockLines = jaBlock.lines;

    // When: Checking basic lint heuristics without external markdownlint dependency
    // Then: No trailing whitespace and no 2+ consecutive blank lines
    assertNoTrailingWhitespace(blockLines, 'docs/usage.ja.md Settings bullet block');

    let blankRun = 0;
    for (let i = 0; i < blockLines.length; i += 1) {
      const isBlank = blockLines[i].trim() === '';
      blankRun = isBlank ? blankRun + 1 : 0;
      assert.ok(blankRun <= 1, `Expected no 2+ consecutive blank lines in list block (found at block line ${i + 1})`);
    }
  });

  // TC-N-04
  test('TC-N-04: Settings keys remain in parity between JA and EN docs', () => {
    // Given: Parsed setting keys in both documents
    const jaKeys = jaEntries.map((e) => e.key);
    const enKeys = enEntries.map((e) => e.key);

    // When: Comparing the key lists
    // Then: Keys match exactly (same set and order)
    assert.deepStrictEqual(
      jaKeys,
      enKeys,
      `Expected Settings keys to match between locales.\nJA=${JSON.stringify(jaKeys)}\nEN=${JSON.stringify(enKeys)}`
    );
  });

  // TC-E-01
  test('TC-E-01: Sanitizer/strict rendering normalization still preserves the Settings list', () => {
    // Given: The Settings section that includes a blank line inside the list
    const original = jaSection.lines.join('\n');

    // When: Applying a conservative "sanitizer" normalization (common in strict renderers)
    const normalized = normalizeForPasteSimulation(original);
    const normalizedSection = extractSectionLines({ markdown: normalized, h2Title: '設定' });
    const normalizedBlock = extractSettingsBulletBlock(normalizedSection.lines);
    const normalizedEntries = parseTopLevelSettingEntries(normalizedBlock.lines);

    // Then: The same top-level keys are still discoverable and in the same order
    assert.deepStrictEqual(
      normalizedEntries.map((e) => e.key),
      jaEntries.map((e) => e.key),
      'Expected sanitizer normalization to keep the same Settings keys'
    );

    // Then: Malformed bullets are rejected with explicit error type and message
    assert.throws(
      () => {
        parseTopLevelSettingEntries(['- **`dontforgetest.testStrategyPath`** テスト戦略ファイルのパス（空なら内蔵デフォルトを使用）']);
      },
      (err: unknown) => {
        return err instanceof Error && err.message.startsWith('Invalid setting bullet format');
      },
      'Expected an Error with a stable message prefix for malformed setting bullets'
    );
  });

  // TC-E-02
  test('TC-E-02: Copy/paste-like reflow does not merge or split Settings entries unexpectedly', () => {
    // Given: The extracted Settings bullet block
    const originalBlock = jaBlock.lines.join('\n');

    // When: Simulating copy/paste normalization
    const pasted = normalizeForPasteSimulation(originalBlock);
    const pastedLines = splitLines(pasted);
    const pastedEntries = parseTopLevelSettingEntries(pastedLines);

    // Then: Same number of entries, same keys, and each key line remains a single line entry
    assert.strictEqual(pastedEntries.length, jaEntries.length, 'Expected the same number of setting entries after paste');
    assert.deepStrictEqual(
      pastedEntries.map((e) => e.key),
      jaEntries.map((e) => e.key),
      'Expected the same Settings keys after paste simulation'
    );

    // Then: Malformed bullets are rejected with explicit error type and message
    assert.throws(
      () => {
        parseTopLevelSettingEntries(['- **`dontforgetest.defaultModel`** Model passed to cursor-agent --model (if empty, auto)']);
      },
      (err: unknown) => {
        return err instanceof Error && err.message.startsWith('Invalid setting bullet format');
      },
      'Expected an Error with a stable message prefix for malformed setting bullets'
    );
  });

  // TC-B-01
  test('TC-B-01: cursorAgentPath empty/unset semantics are clearly described', () => {
    // Given: Both JA and EN Settings entries for cursorAgentPath
    const ja = jaEntries.find((e) => e.key === 'dontforgetest.cursorAgentPath');
    const en = enEntries.find((e) => e.key === 'dontforgetest.cursorAgentPath');

    // When: Inspecting the wording for empty/unset behavior
    // Then: Both mention PATH fallback explicitly
    assert.ok(ja, 'Expected JA cursorAgentPath entry to exist');
    assert.ok(en, 'Expected EN cursorAgentPath entry to exist');
    assert.ok(ja.description.includes('未指定なら PATH から解決'), 'Expected JA to state PATH fallback when unspecified');
    assert.ok(en.description.includes('if empty, resolves from PATH'), 'Expected EN to state PATH fallback when empty');
  });

  // TC-B-02
  test('TC-B-02: defaultModel empty semantics are clearly described', () => {
    // Given: Both JA and EN Settings entries for defaultModel
    const ja = jaEntries.find((e) => e.key === 'dontforgetest.defaultModel');
    const en = enEntries.find((e) => e.key === 'dontforgetest.defaultModel');

    // When: Inspecting the wording for empty model value
    // Then: Both describe auto/automatic selection
    assert.ok(ja, 'Expected JA defaultModel entry to exist');
    assert.ok(en, 'Expected EN defaultModel entry to exist');
    assert.ok(ja.description.includes('空なら自動'), 'Expected JA to state "empty => auto"');
    assert.ok(en.description.includes('if empty, auto'), 'Expected EN to state "empty => auto"');
  });

  // TC-B-03
  test('TC-B-03: testStrategyPath empty semantics are clearly described', () => {
    // Given: Both JA and EN Settings entries for testStrategyPath
    const ja = jaEntries.find((e) => e.key === 'dontforgetest.testStrategyPath');
    const en = enEntries.find((e) => e.key === 'dontforgetest.testStrategyPath');

    // When: Inspecting the wording for empty path fallback
    // Then: Both describe using the built-in default strategy
    assert.ok(ja, 'Expected JA testStrategyPath entry to exist');
    assert.ok(en, 'Expected EN testStrategyPath entry to exist');
    assert.ok(ja.description.includes('空なら内蔵デフォルトを使用'), 'Expected JA to state built-in default is used when empty');
    assert.ok(en.description.includes('if empty, uses the built-in default'), 'Expected EN to state built-in default is used when empty');
  });

  // TC-B-04
  test('TC-B-04: Docs avoid ambiguity between "unset" and "empty" and do not claim null settings', () => {
    // Given: The JA Settings bullet block as plain text
    const jaText = jaBlock.lines.join('\n');
    const enText = enBlock.lines.join('\n');

    // When: Checking for the presence of both concepts and the absence of "null" claims
    // Then: Both "unset/unspecified" and "empty" concepts exist, and "null" is not asserted as a value
    assert.ok(jaText.includes('未指定なら'), 'Expected JA to mention "unset/unspecified" semantics');
    assert.ok(jaText.includes('空なら'), 'Expected JA to mention "empty" semantics');
    assert.strictEqual(jaText.toLowerCase().includes('null'), false, 'Expected JA not to mention "null" as a settings value');

    assert.ok(enText.includes('if empty'), 'Expected EN to mention "empty" semantics');
    assert.strictEqual(enText.toLowerCase().includes('null'), false, 'Expected EN not to mention "null" as a settings value');
  });

  // TC-B-05
  test('TC-B-05: perspectiveReportDir does not imply invalid min-length constraints; default formatting stays intact', () => {
    // Given: perspectiveReportDir entry
    const ja = jaEntries.find((e) => e.key === 'dontforgetest.perspectiveReportDir');
    const en = enEntries.find((e) => e.key === 'dontforgetest.perspectiveReportDir');

    // When: Inspecting text for constraints and default formatting
    // Then: No min-length constraints are stated; default path is code-formatted
    assert.ok(ja, 'Expected JA perspectiveReportDir entry to exist');
    assert.ok(en, 'Expected EN perspectiveReportDir entry to exist');
    assert.ok(ja.description.includes('`docs/test-perspectives`'), 'Expected JA to include the default dir in backticks');
    assert.ok(en.description.includes('`docs/test-perspectives`'), 'Expected EN to include the default dir in backticks');
    assert.strictEqual(/最小|min/i.test(ja.description), false, 'Expected no min-length claim in JA');
    assert.strictEqual(/min length|minimum/i.test(en.description), false, 'Expected no min-length claim in EN');
  });

  // TC-B-06
  test('TC-B-06: perspectiveReportDir does not hardcode environment-specific max limits', () => {
    // Given: Only the top-level setting bullets (not sub-lists or code blocks)
    // This test checks for environment-specific max limits like PATH_MAX, not configuration parameters
    const jaTopLevelLines = jaBlock.lines.filter((l) => l.startsWith('- **`dontforgetest.'));
    const enTopLevelLines = enBlock.lines.filter((l) => l.startsWith('- **`dontforgetest.'));
    const jaText = jaTopLevelLines.join('\n');
    const enText = enTopLevelLines.join('\n');

    // When: Checking for max-limit wording that would be environment-dependent
    // Exclude setting keys containing "Max" (e.g., MaxRetries) and retry-related descriptions
    // as they are configuration parameters, not environment-specific limits like PATH_MAX
    const jaTextWithoutSettingKeysAndRetryDescriptions = jaText
      .replace(/dontforgetest\.\w+/g, '')
      .replace(/最大試行回数/g, ''); // "maximum retry count" is a parameter description
    const enTextWithoutSettingKeysAndRetryDescriptions = enText
      .replace(/dontforgetest\.\w+/g, '')
      .replace(/max(imum)?\s*(number\s+of\s+)?(automatic\s+)?(fix\s+)?(retries|retry|attempts?)/gi, ''); // Exclude retry/attempts descriptions

    // Then: No hardcoded max limit claims exist in top-level setting descriptions
    assert.strictEqual(/最大|max|PATH_MAX/i.test(jaTextWithoutSettingKeysAndRetryDescriptions), false, 'Expected JA to avoid hardcoded max-limit claims');
    assert.strictEqual(/max|PATH_MAX/i.test(enTextWithoutSettingKeysAndRetryDescriptions), false, 'Expected EN to avoid hardcoded max-limit claims');
  });

  // TC-B-07
  test('TC-B-07: Blank-line count (0, 1, 2+) between list items does not break key discovery', () => {
    // Given: The original bullet block lines, including a blank line after defaultModel
    const originalLines = jaBlock.lines.slice();
    const defaultModelIndex = originalLines.findIndex((l) => l.includes('`dontforgetest.defaultModel`'));
    assert.ok(defaultModelIndex >= 0, 'Expected defaultModel bullet to exist');

    // When: Creating variants of the block with 0 / 1 / 2+ blank lines
    const variant0 = (() => {
      const v = originalLines.slice();
      if (v[defaultModelIndex + 1]?.trim() === '') {
        v.splice(defaultModelIndex + 1, 1);
      }
      return v;
    })();
    const variant1 = originalLines;
    const variant2 = (() => {
      const v = originalLines.slice();
      if (v[defaultModelIndex + 1]?.trim() === '') {
        v.splice(defaultModelIndex + 1, 0, '');
      } else {
        v.splice(defaultModelIndex + 1, 0, '', '');
      }
      return v;
    })();

    const expectedKeys = jaEntries.map((e) => e.key);

    // Then: All variants preserve the same key discovery and ordering
    assert.deepStrictEqual(parseTopLevelSettingEntries(variant0).map((e) => e.key), expectedKeys, 'Expected keys with 0 blank lines');
    assert.deepStrictEqual(parseTopLevelSettingEntries(variant1).map((e) => e.key), expectedKeys, 'Expected keys with 1 blank line');
    assert.deepStrictEqual(parseTopLevelSettingEntries(variant2).map((e) => e.key), expectedKeys, 'Expected keys with 2+ blank lines');
  });

  // TC-E-03
  test('TC-E-03: Regex-based extraction finds all keys even with a blank line in the list', () => {
    // Given: The JA Settings bullet block (top-level lines only for uniqueness check)
    const blockText = jaBlock.lines.join('\n');
    const topLevelBlockText = jaBlock.lines.filter((l) => l.startsWith('- **`dontforgetest.')).join('\n');
    const keys = jaEntries.map((e) => e.key);

    // When: Extracting keys using a regex search over the whole block
    const matches: string[] = blockText.match(/dontforgetest\.[a-zA-Z0-9]+/g) ?? [];

    // Then: Each expected key appears at least once in the full block
    for (const k of keys) {
      assert.ok(matches.includes(k), `Expected to find key token "${k}" in block text`);
    }

    // Then: Each key appears exactly once in the top-level setting bullets (not in sub-lists)
    for (const k of keys) {
      assert.strictEqual(countOccurrences(topLevelBlockText, `\`${k}\``), 1, `Expected exactly one backticked occurrence for "${k}" in top-level bullets`);
    }

    // Then: Malformed bullets are rejected with explicit error type and message
    assert.throws(
      () => {
        parseTopLevelSettingEntries(['- **`dontforgetest.cursorAgentPath`** Path to cursor-agent (if empty, resolves from PATH)']);
      },
      (err: unknown) => {
        return err instanceof Error && err.message.startsWith('Invalid setting bullet format');
      },
      'Expected an Error with a stable message prefix for malformed setting bullets'
    );
  });

  // TC-E-04
  test('TC-E-04: Setting keys remain searchable and appear once in the Settings block', () => {
    // Given: The Settings block text
    const blockText = jaBlock.lines.join('\n');

    // When: Counting occurrences for a key adjacent to the diff area
    const key = 'dontforgetest.defaultModel';

    // Then: The key appears exactly once (search-friendly) and is not fragmented
    assert.strictEqual(countOccurrences(blockText, key), 1, `Expected exactly one occurrence of ${key} in the Settings block`);
    assert.strictEqual(countOccurrences(blockText, `\`${key}\``), 1, `Expected exactly one backticked occurrence of ${key} in the Settings block`);

    // Then: Malformed bullets are rejected with explicit error type and message
    assert.throws(
      () => {
        parseTopLevelSettingEntries(['- **`dontforgetest.includeTestPerspectiveTable`** Whether to generate ...']);
      },
      (err: unknown) => {
        return err instanceof Error && err.message.startsWith('Invalid setting bullet format');
      },
      'Expected an Error with a stable message prefix for malformed setting bullets'
    );
  });
});

