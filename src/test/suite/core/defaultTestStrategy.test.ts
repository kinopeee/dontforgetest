import * as assert from 'assert';
import { DEFAULT_TEST_STRATEGY } from '../../../core/defaultTestStrategy';

class StrategyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrategyValidationError';
  }
}

const SECTION_HEADER = '### Localization Assertions (t(...))';
const RULE_AVOID_STRICT_EQUALITY =
  'Avoid strict string equality for localized output unless the literal is intentionally fixed.';
const RULE_PREFER_NON_EMPTY_AND_NOT_RAW_KEY =
  'Prefer checks that the localized value is non-empty and does not equal the raw key.';
const RULE_PLACEHOLDERS_RESOLVED =
  'Ensure placeholders are resolved (e.g., no "{0}" or "${...}" remains).';
const CHECKLIST_LOCALIZED_STRINGS =
  '- [ ] Localized strings avoid strict matching unless required; no raw key/placeholder leaks';

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let idx = 0;
  while (true) {
    const found = haystack.indexOf(needle, idx);
    if (found === -1) {
      return count;
    }
    count += 1;
    idx = found + needle.length;
  }
}

function extractLocalizationAssertionsSectionText(strategyText: string): string {
  const headerIndex = strategyText.indexOf(SECTION_HEADER);
  if (headerIndex === -1) {
    return '';
  }
  const afterHeader = strategyText.slice(headerIndex + SECTION_HEADER.length);
  // The section is followed by a horizontal rule '---' in the strategy text.
  const sectionEnd = afterHeader.indexOf('\n---');
  if (sectionEnd === -1) {
    return afterHeader;
  }
  return afterHeader.slice(0, sectionEnd);
}

function validateLocalizationAssertionsSection(strategyText: string): void {
  const headerCount = countOccurrences(strategyText, SECTION_HEADER);
  if (headerCount === 0) {
    throw new StrategyValidationError('missing Localization Assertions section');
  }
  if (headerCount > 1) {
    throw new StrategyValidationError('duplicate Localization Assertions section');
  }

  const requiredLines = [
    RULE_AVOID_STRICT_EQUALITY,
    RULE_PREFER_NON_EMPTY_AND_NOT_RAW_KEY,
    RULE_PLACEHOLDERS_RESOLVED,
    CHECKLIST_LOCALIZED_STRINGS,
  ];

  for (const line of requiredLines) {
    if (!strategyText.includes(line)) {
      throw new StrategyValidationError(`missing required line: ${line}`);
    }
  }

  // Ensure the section actually mentions "non-empty" (boundary value: empty)
  const sectionText = extractLocalizationAssertionsSectionText(strategyText);
  if (!sectionText.includes('non-empty')) {
    throw new StrategyValidationError('expected token non-empty');
  }
}

suite('core/defaultTestStrategy.ts', () => {
  suite('DEFAULT_TEST_STRATEGY (Localization Assertions section)', () => {
    // Case ID: DTS-N-01
    // Given: DEFAULT_TEST_STRATEGY is importable
    // When: Checking the section header presence
    // Then: The strategy text contains the Localization Assertions section header
    test('DTS-N-01: contains "### Localization Assertions (t(...))"', () => {
      assert.ok(DEFAULT_TEST_STRATEGY.includes(SECTION_HEADER));
    });

    // Case ID: DTS-N-02
    // Given: DEFAULT_TEST_STRATEGY is importable
    // When: Checking the strict-equality avoidance rule line
    // Then: The strategy text contains the exact rule sentence
    test('DTS-N-02: contains strict string equality avoidance rule', () => {
      assert.ok(DEFAULT_TEST_STRATEGY.includes(RULE_AVOID_STRICT_EQUALITY));
    });

    // Case ID: DTS-N-03
    // Given: DEFAULT_TEST_STRATEGY is importable
    // When: Checking the non-empty + not-raw-key rule line
    // Then: The strategy text contains the exact rule sentence
    test('DTS-N-03: contains non-empty and not-raw-key guidance', () => {
      assert.ok(DEFAULT_TEST_STRATEGY.includes(RULE_PREFER_NON_EMPTY_AND_NOT_RAW_KEY));
    });

    // Case ID: DTS-N-04
    // Given: DEFAULT_TEST_STRATEGY is importable
    // When: Checking the placeholder-resolution rule line
    // Then: The strategy text contains the exact rule sentence (including the literal ${...})
    test('DTS-N-04: contains placeholder-resolution guidance with literal "${...}"', () => {
      assert.ok(DEFAULT_TEST_STRATEGY.includes(RULE_PLACEHOLDERS_RESOLVED));
    });

    // Case ID: DTS-N-05
    // Given: DEFAULT_TEST_STRATEGY is importable
    // When: Checking the Summary Checklist new localized-strings item
    // Then: The strategy text contains the checklist line
    test('DTS-N-05: contains Summary Checklist item for localized strings', () => {
      assert.ok(DEFAULT_TEST_STRATEGY.includes(CHECKLIST_LOCALIZED_STRINGS));
    });

    // Case ID: DTS-B-01
    // Given: haystack is any string and needle is an empty string
    // When: Counting occurrences with an empty needle
    // Then: The function returns 0 (early return branch)
    test("DTS-B-01: countOccurrences returns 0 when needle is ''", () => {
      assert.strictEqual(countOccurrences('anything', ''), 0);
    });

    // Case ID: DTS-B-02
    // Given: haystack is an empty string and needle is a non-empty string
    // When: Counting occurrences in an empty haystack
    // Then: The function returns 0 (found === -1 branch)
    test("DTS-B-02: countOccurrences returns 0 when haystack is '' and needle is non-empty", () => {
      assert.strictEqual(countOccurrences('', 'x'), 0);
    });

    // Case ID: DTS-B-03
    // Given: DEFAULT_TEST_STRATEGY is importable
    // When: Counting occurrences of the Localization Assertions section header
    // Then: The header appears exactly once (min = 1)
    test('DTS-B-03: countOccurrences returns 1 for the section header in DEFAULT_TEST_STRATEGY', () => {
      const count = countOccurrences(DEFAULT_TEST_STRATEGY, SECTION_HEADER);
      assert.strictEqual(count, 1);
    });

    // Case ID: DTS-B-04
    // Given: A strategy text where the section header appears exactly twice
    // When: Counting occurrences of the section header
    // Then: The count is 2 (max+1 = 2)
    test('DTS-B-04: countOccurrences returns 2 when the header is duplicated', () => {
      const duplicatedHeader = `${DEFAULT_TEST_STRATEGY}\n${SECTION_HEADER}\n`;
      const count = countOccurrences(duplicatedHeader, SECTION_HEADER);
      assert.strictEqual(count, 2);
    });

    // Case ID: DTS-B-05
    // Given: headerCount is derived only from countOccurrences return value
    // When: Trying to construct a negative headerCount (min-1)
    // Then: It is unreachable because countOccurrences always returns a number >= 0
    test('DTS-B-05: headerCount min-1 is unreachable (countOccurrences is never negative)', () => {
      const samples: Array<{ haystack: string; needle: string }> = [
        { haystack: '', needle: '' },
        { haystack: '', needle: 'x' },
        { haystack: 'x', needle: '' },
        { haystack: DEFAULT_TEST_STRATEGY, needle: SECTION_HEADER },
        { haystack: `${DEFAULT_TEST_STRATEGY}\n${SECTION_HEADER}\n`, needle: SECTION_HEADER },
      ];

      for (const { haystack, needle } of samples) {
        const count = countOccurrences(haystack, needle);
        assert.ok(Number.isInteger(count));
        assert.ok(count >= 0);
      }
    });

    // Case ID: DTS-E-01
    // Given: A strategy text with the section header removed
    // When: Validating the Localization Assertions section
    // Then: StrategyValidationError is thrown with a fixed observable message
    test('DTS-E-01: throws when the section header is missing (headerCount=0)', () => {
      const withoutHeader = DEFAULT_TEST_STRATEGY.replace(SECTION_HEADER, '');

      assert.throws(
        () => validateLocalizationAssertionsSection(withoutHeader),
        (err: unknown) => {
          assert.ok(err instanceof StrategyValidationError);
          assert.strictEqual(err.name, 'StrategyValidationError');
          assert.ok(String(err.message).includes('missing Localization Assertions section'));
          return true;
        },
      );
    });

    // Case ID: DTS-E-02
    // Given: A strategy text with the section header duplicated
    // When: Validating the Localization Assertions section
    // Then: StrategyValidationError is thrown with a fixed observable message
    test('DTS-E-02: throws when the section header is duplicated (headerCount>=2)', () => {
      const duplicatedHeader = `${DEFAULT_TEST_STRATEGY}\n${SECTION_HEADER}\n`;

      assert.throws(
        () => validateLocalizationAssertionsSection(duplicatedHeader),
        (err: unknown) => {
          assert.ok(err instanceof StrategyValidationError);
          assert.strictEqual(err.name, 'StrategyValidationError');
          assert.ok(String(err.message).includes('duplicate Localization Assertions section'));
          return true;
        },
      );
    });

    // Case ID: DTS-E-03
    // Given: A strategy text missing the Summary Checklist new line
    // When: Validating the Localization Assertions section
    // Then: StrategyValidationError is thrown and the message contains the missing required line prefix + content
    test('DTS-E-03: throws when the Summary Checklist item is missing', () => {
      const missingChecklist = DEFAULT_TEST_STRATEGY.replace(CHECKLIST_LOCALIZED_STRINGS, '');

      assert.throws(
        () => validateLocalizationAssertionsSection(missingChecklist),
        (err: unknown) => {
          assert.ok(err instanceof StrategyValidationError);
          assert.strictEqual(err.name, 'StrategyValidationError');
          assert.ok(String(err.message).includes(`missing required line: ${CHECKLIST_LOCALIZED_STRINGS}`));
          return true;
        },
      );
    });

    // Case ID: DTS-E-04
    // Given: A strategy text missing the strict-equality avoidance rule sentence
    // When: Validating the Localization Assertions section
    // Then: StrategyValidationError is thrown and the message contains the missing required line prefix + content
    test('DTS-E-04: throws when the strict-equality rule sentence is missing', () => {
      const missingRule = DEFAULT_TEST_STRATEGY.replace(RULE_AVOID_STRICT_EQUALITY, '');

      assert.throws(
        () => validateLocalizationAssertionsSection(missingRule),
        (err: unknown) => {
          assert.ok(err instanceof StrategyValidationError);
          assert.strictEqual(err.name, 'StrategyValidationError');
          assert.ok(String(err.message).includes(`missing required line: ${RULE_AVOID_STRICT_EQUALITY}`));
          return true;
        },
      );
    });

    // Case ID: DTS-E-05
    // Given: A strategy text missing the non-empty/raw-key guidance rule sentence
    // When: Validating the Localization Assertions section
    // Then: StrategyValidationError is thrown and the message contains the missing required line prefix + content
    test('DTS-E-05: throws when the non-empty/raw-key rule sentence is missing', () => {
      const missingRule = DEFAULT_TEST_STRATEGY.replace(RULE_PREFER_NON_EMPTY_AND_NOT_RAW_KEY, '');

      assert.throws(
        () => validateLocalizationAssertionsSection(missingRule),
        (err: unknown) => {
          assert.ok(err instanceof StrategyValidationError);
          assert.strictEqual(err.name, 'StrategyValidationError');
          assert.ok(String(err.message).includes(`missing required line: ${RULE_PREFER_NON_EMPTY_AND_NOT_RAW_KEY}`));
          return true;
        },
      );
    });

    // Case ID: DTS-E-06
    // Given: A strategy text missing the placeholders-resolved rule sentence
    // When: Validating the Localization Assertions section
    // Then: StrategyValidationError is thrown and the message contains the missing required line prefix + content
    test('DTS-E-06: throws when the placeholders-resolved rule sentence is missing', () => {
      const missingRule = DEFAULT_TEST_STRATEGY.replace(RULE_PLACEHOLDERS_RESOLVED, '');

      assert.throws(
        () => validateLocalizationAssertionsSection(missingRule),
        (err: unknown) => {
          assert.ok(err instanceof StrategyValidationError);
          assert.strictEqual(err.name, 'StrategyValidationError');
          assert.ok(String(err.message).includes(`missing required line: ${RULE_PLACEHOLDERS_RESOLVED}`));
          return true;
        },
      );
    });

    // Case ID: DTS-E-08
    // Given: A strategy text where the Localization Assertions section does not mention "non-empty"
    // When: Validating the Localization Assertions section
    // Then: StrategyValidationError is thrown with a fixed observable message
    test('DTS-E-08: throws when token "non-empty" is missing from the section', () => {
      const sectionWithoutToken = DEFAULT_TEST_STRATEGY.replace(/non-empty/g, '');
      // Keep the required line somewhere in the document so the "missing required line" branch does not trigger first.
      // This test specifically targets the section-scoped "non-empty" token check.
      const tokenMissingInSectionButRuleRestored = `${sectionWithoutToken}\n\n${RULE_PREFER_NON_EMPTY_AND_NOT_RAW_KEY}\n`;

      assert.throws(
        () => validateLocalizationAssertionsSection(tokenMissingInSectionButRuleRestored),
        (err: unknown) => {
          assert.ok(err instanceof StrategyValidationError);
          assert.strictEqual(err.name, 'StrategyValidationError');
          assert.ok(String(err.message).includes('expected token non-empty'));
          return true;
        },
      );
    });

    // Case ID: DTS-E-09
    // Given: validateLocalizationAssertionsSection expects a string but receives null at runtime
    // When: Calling the function with null via an unsafe cast
    // Then: A TypeError is thrown (message is environment-dependent)
    test('DTS-E-09: throws TypeError when strategyText is null at runtime', () => {
      assert.throws(
        () => validateLocalizationAssertionsSection(null as unknown as string),
        (err: unknown) => {
          assert.ok(err instanceof TypeError);
          return true;
        },
      );
    });
  });
});

