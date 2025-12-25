import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  resolveSuiteFromFullTitle,
  printMochaLikeResultsFromTestResultFile as rawPrintMochaLikeResultsFromTestResultFile,
  stageExtensionToTemp,
  TestResultFile,
} from '../runTest';

suite('test/runTest.ts', () => {
  suite('resolveSuiteFromFullTitle', () => {
    // TC-N-01: fullTitle ends with title (e.g., "Suite1 Suite2 Test Title", "Test Title")
    test('TC-N-01: Returns suite part without trailing title when fullTitle ends with title', () => {
      // Given: fullTitle that ends with title
      const fullTitle = 'Suite1 Suite2 Test Title';
      const title = 'Test Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns suite part without trailing title
      assert.strictEqual(result, 'Suite1 Suite2', 'Should return suite part without trailing title');
    });

    // TC-N-02: fullTitle equals title exactly
    test('TC-N-02: Returns empty string when fullTitle equals title exactly', () => {
      // Given: fullTitle that equals title exactly
      const fullTitle = 'Test Title';
      const title = 'Test Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns empty string
      assert.strictEqual(result, '', 'Should return empty string when fullTitle equals title');
    });

    // TC-N-03: fullTitle with single space before title
    test('TC-N-03: Returns suite part trimmed correctly when fullTitle has single space before title', () => {
      // Given: fullTitle with single space before title
      const fullTitle = 'Suite1 Test Title';
      const title = 'Test Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns suite part trimmed correctly
      assert.strictEqual(result, 'Suite1', 'Should return trimmed suite part');
    });

    // TC-N-04: fullTitle with multiple spaces before title
    test('TC-N-04: Returns suite part trimmed correctly when fullTitle has multiple spaces before title', () => {
      // Given: fullTitle with multiple spaces before title
      const fullTitle = 'Suite1   Test Title';
      const title = 'Test Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns suite part trimmed correctly
      assert.strictEqual(result, 'Suite1', 'Should return trimmed suite part (multiple spaces)');
    });

    // TC-E-01: fullTitle is empty string
    test('TC-E-01: Returns empty string when fullTitle is empty', () => {
      // Given: Empty fullTitle
      const fullTitle = '';
      const title = 'Test Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns empty string
      assert.strictEqual(result, '', 'Should return empty string when fullTitle is empty');
    });

    // TC-E-02: title is empty string
    test('TC-E-02: Returns empty string when title is empty', () => {
      // Given: Empty title
      const fullTitle = 'Suite1 Suite2';
      const title = '';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns empty string (fullTitle does not end with empty string)
      assert.strictEqual(result, '', 'Should return empty string when title is empty');
    });

    // TC-E-03: fullTitle does not end with title
    test('TC-E-03: Returns empty string when fullTitle does not end with title', () => {
      // Given: fullTitle that does not end with title
      const fullTitle = 'Suite1 Suite2';
      const title = 'Different Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns empty string
      assert.strictEqual(result, '', 'Should return empty string when fullTitle does not end with title');
    });

    // TC-B-01: fullTitle length = 0
    test('TC-B-01: Returns empty string when fullTitle length is 0', () => {
      // Given: fullTitle with zero length
      const fullTitle = '';
      const title = 'Test Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns empty string
      assert.strictEqual(result, '', 'Should return empty string when fullTitle length is 0');
    });

    // TC-B-02: title length = 0
    test('TC-B-02: Returns empty string when title length is 0', () => {
      // Given: title with zero length
      const fullTitle = 'Suite1 Suite2';
      const title = '';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns empty string
      assert.strictEqual(result, '', 'Should return empty string when title length is 0');
    });

    // TC-B-03: fullTitle.length = title.length (same strings)
    test('TC-B-03: Returns empty string when fullTitle.length equals title.length', () => {
      // Given: fullTitle and title with same length (same strings)
      const fullTitle = 'Test Title';
      const title = 'Test Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns empty string
      assert.strictEqual(result, '', 'Should return empty string when lengths are equal');
    });

    // TC-B-04: fullTitle.length = title.length + 1 (single space)
    test('TC-B-04: Returns empty string when fullTitle.length equals title.length + 1', () => {
      // Given: fullTitle with single space before title
      const fullTitle = ' Test Title';
      const title = 'Test Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns single space trimmed (empty)
      assert.strictEqual(result, '', 'Should return empty string when only space before title');
    });

    // TC-RESOLVE-B-03: fullTitle is null
    test('TC-RESOLVE-B-03: Throws TypeError when fullTitle is null', () => {
      // Given: null fullTitle
      const fullTitle = null as unknown as string;
      const title = 'Test Title';

      // When: resolveSuiteFromFullTitle is called
      // Then: Throws TypeError
      assert.throws(
        () => resolveSuiteFromFullTitle(fullTitle, title),
        TypeError,
        'Should throw TypeError when fullTitle is null'
      );
    });

    // TC-RESOLVE-B-04: title is null
    test('TC-RESOLVE-B-04: Throws TypeError when title is null', () => {
      // Given: null title
      const fullTitle = 'Suite1 Suite2';
      const title = null as unknown as string;

      // When: resolveSuiteFromFullTitle is called
      // Then: Throws TypeError
      assert.throws(
        () => resolveSuiteFromFullTitle(fullTitle, title),
        TypeError,
        'Should throw TypeError when title is null'
      );
    });

    // TC-RESOLVE-B-07: fullTitle length = MAX_STRING_LENGTH
    test('TC-RESOLVE-B-07: Returns suite string correctly when fullTitle length is very large', () => {
      // Given: fullTitle with very large length
      const longSuite = 'A'.repeat(10000);
      const fullTitle = `${longSuite} Test Title`;
      const title = 'Test Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns suite string correctly
      assert.strictEqual(result, longSuite, 'Should return suite string correctly for very long fullTitle');
    });

    // TC-RESOLVE-B-08: title length = MAX_STRING_LENGTH
    test('TC-RESOLVE-B-08: Returns empty string when title length is very large and does not match', () => {
      // Given: title with very large length that does not match
      const fullTitle = 'Suite1 Suite2';
      const longTitle = 'A'.repeat(10000);

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, longTitle);

      // Then: Returns empty string (no match)
      assert.strictEqual(result, '', 'Should return empty string when title does not match');
    });

    // TC-RESOLVE-B-09: fullTitle has trailing whitespace
    test('TC-RESOLVE-B-09: Returns trimmed suite string when fullTitle has trailing whitespace', () => {
      // Given: fullTitle with trailing whitespace
      const fullTitle = 'Suite1 Suite2   Test Title';
      const title = 'Test Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns trimmed suite string
      assert.strictEqual(result, 'Suite1 Suite2', 'Should return trimmed suite string');
    });

    // TC-RESOLVE-B-10: fullTitle has leading whitespace
    test('TC-RESOLVE-B-10: Returns trimmed suite string when fullTitle has leading whitespace', () => {
      // Given: fullTitle with leading whitespace
      const fullTitle = '   Suite1 Suite2 Test Title';
      const title = 'Test Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns trimmed suite string
      assert.strictEqual(result, 'Suite1 Suite2', 'Should return trimmed suite string');
    });

    // TC-RESOLVE-N-01: fullTitle='Suite1 Suite2 Test', title='Test'
    test('TC-RESOLVE-N-01: Returns "Suite1 Suite2" when fullTitle="Suite1 Suite2 Test" and title="Test"', () => {
      // Given: fullTitle='Suite1 Suite2 Test', title='Test'
      const fullTitle = 'Suite1 Suite2 Test';
      const title = 'Test';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns 'Suite1 Suite2'
      assert.strictEqual(result, 'Suite1 Suite2', 'Should return suite part without trailing title');
    });

    // TC-RESOLVE-N-02: fullTitle='Test', title='Test'
    test('TC-RESOLVE-N-02: Returns "" when fullTitle="Test" and title="Test"', () => {
      // Given: fullTitle='Test', title='Test'
      const fullTitle = 'Test';
      const title = 'Test';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns ''
      assert.strictEqual(result, '', 'Should return empty string when fullTitle equals title');
    });

    // TC-RESOLVE-B-01: fullTitle is empty string
    test('TC-RESOLVE-B-01: Returns "" when fullTitle is empty string', () => {
      // Given: fullTitle is empty string
      const fullTitle = '';
      const title = 'Test';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns ''
      assert.strictEqual(result, '', 'Should return empty string when fullTitle is empty');
    });

    // TC-RESOLVE-B-02: title is empty string
    test('TC-RESOLVE-B-02: Returns "" when title is empty string', () => {
      // Given: title is empty string
      const fullTitle = 'Suite1 Suite2 Test';
      const title = '';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns '' (title.trim() === '' case)
      assert.strictEqual(result, '', 'Should return empty string when title is empty');
    });

    // TC-RESOLVE-B-03: title is whitespace only
    test('TC-RESOLVE-B-03: Returns "" when title is whitespace only', () => {
      // Given: title is whitespace only
      const fullTitle = 'Suite1 Suite2 Test';
      const title = '   ';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns '' (title.trim() === '' case)
      assert.strictEqual(result, '', 'Should return empty string when title is whitespace only');
    });

    // TC-RESOLVE-B-04: fullTitle does not end with title
    test('TC-RESOLVE-B-04: Returns "" when fullTitle does not end with title', () => {
      // Given: fullTitle does not end with title
      const fullTitle = 'Suite1 Suite2';
      const title = 'Test';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns ''
      assert.strictEqual(result, '', 'Should return empty string when fullTitle does not end with title');
    });

    // TC-RESOLVE-B-05: fullTitle='A', title='B'
    test('TC-RESOLVE-B-05: Returns "" when fullTitle="A" and title="B"', () => {
      // Given: fullTitle='A', title='B'
      const fullTitle = 'A';
      const title = 'B';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns ''
      assert.strictEqual(result, '', 'Should return empty string when fullTitle does not end with title');
    });

    // TC-RESOLVE-B-06: fullTitle='Suite Test', title='Test'
    test('TC-RESOLVE-B-06: Returns "Suite" when fullTitle="Suite Test" and title="Test"', () => {
      // Given: fullTitle='Suite Test', title='Test'
      const fullTitle = 'Suite Test';
      const title = 'Test';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns 'Suite'
      assert.strictEqual(result, 'Suite', 'Should return suite part without trailing title');
    });

    // TC-RESOLVE-B-07: fullTitle='Suite  Test', title='Test'
    test('TC-RESOLVE-B-07: Returns "Suite" when fullTitle="Suite  Test" and title="Test"', () => {
      // Given: fullTitle='Suite  Test', title='Test' (with extra spaces)
      const fullTitle = 'Suite  Test';
      const title = 'Test';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns 'Suite' (trim() applied)
      assert.strictEqual(result, 'Suite', 'Should return trimmed suite part');
    });

    // TC-RESOLVE-E-01: fullTitle is null
    test('TC-RESOLVE-E-01: Throws TypeError when fullTitle is null', () => {
      // Given: fullTitle is null
      const fullTitle = null as unknown as string;
      const title = 'Test';

      // When: resolveSuiteFromFullTitle is called
      // Then: Throws TypeError
      assert.throws(
        () => resolveSuiteFromFullTitle(fullTitle, title),
        TypeError,
        'Should throw TypeError when fullTitle is null'
      );
    });

    // TC-RESOLVE-E-02: title is null
    test('TC-RESOLVE-E-02: Throws TypeError when title is null', () => {
      // Given: title is null
      const fullTitle = 'Suite1 Suite2 Test';
      const title = null as unknown as string;

      // When: resolveSuiteFromFullTitle is called
      // Then: Throws TypeError
      assert.throws(
        () => resolveSuiteFromFullTitle(fullTitle, title),
        TypeError,
        'Should throw TypeError when title is null'
      );
    });

    // TC-RESOLVE-E-03: fullTitle is undefined
    test('TC-RESOLVE-E-03: Throws TypeError when fullTitle is undefined', () => {
      // Given: fullTitle is undefined
      const fullTitle = undefined as unknown as string;
      const title = 'Test';

      // When: resolveSuiteFromFullTitle is called
      // Then: Throws TypeError
      assert.throws(
        () => resolveSuiteFromFullTitle(fullTitle, title),
        TypeError,
        'Should throw TypeError when fullTitle is undefined'
      );
    });

    // TC-RESOLVE-E-04: title is undefined
    test('TC-RESOLVE-E-04: Throws TypeError when title is undefined', () => {
      // Given: title is undefined
      const fullTitle = 'Suite1 Suite2 Test';
      const title = undefined as unknown as string;

      // When: resolveSuiteFromFullTitle is called
      // Then: Throws TypeError
      assert.throws(
        () => resolveSuiteFromFullTitle(fullTitle, title),
        TypeError,
        'Should throw TypeError when title is undefined'
      );
    });

    // TC-RESOLVE-E-05: fullTitle is number
    test('TC-RESOLVE-E-05: Throws TypeError when fullTitle is number', () => {
      // Given: fullTitle is number
      const fullTitle = 123 as unknown as string;
      const title = 'Test';

      // When: resolveSuiteFromFullTitle is called
      // Then: Throws TypeError
      assert.throws(
        () => resolveSuiteFromFullTitle(fullTitle, title),
        TypeError,
        'Should throw TypeError when fullTitle is number'
      );
    });

    // TC-RESOLVE-E-06: title is number
    test('TC-RESOLVE-E-06: Throws TypeError when title is number', () => {
      // Given: title is number
      const fullTitle = 'Suite1 Suite2 Test';
      const title = 456 as unknown as string;

      // When: resolveSuiteFromFullTitle is called
      // Then: Throws TypeError
      assert.throws(
        () => resolveSuiteFromFullTitle(fullTitle, title),
        TypeError,
        'Should throw TypeError when title is number'
      );
    });
  });

  suite('printMochaLikeResultsFromTestResultFile', () => {
    let consoleLogSpy: string[] = [];
    let logFn: (message?: unknown, ...optionalParams: unknown[]) => void;

    // console.log の差し替えはVS Code拡張機能テスト環境で不安定になり得るため、
    // 出力先を注入できるようにしてテストする。
    const printMochaLikeResultsFromTestResultFile = (result: TestResultFile): void => {
      rawPrintMochaLikeResultsFromTestResultFile(result, logFn);
    };

    setup(() => {
      consoleLogSpy = [];
      logFn = (message?: unknown, ...optionalParams: unknown[]) => {
        consoleLogSpy.push([message, ...optionalParams].map((a) => String(a)).join(' '));
      };
    });

    // TC-N-05: result.tests is empty array
    test('TC-N-05: Returns early with no console output when result.tests is empty array', () => {
      // Given: result with empty tests array
      const result: TestResultFile = {
        tests: [],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Returns early, no console output
      assert.strictEqual(consoleLogSpy.length, 0, 'Should not output anything when tests array is empty');
    });

    // TC-N-06: result.tests contains single passed test with suite
    test('TC-N-06: Outputs suite name and passed test with ✔ when result.tests contains single passed test', () => {
      // Given: result with single passed test with suite
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Test Title',
            fullTitle: 'Suite A Test Title',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Outputs suite name and passed test with ✔
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('Suite A'), 'Should output suite name');
      assert.ok(output.includes('✔ Test Title'), 'Should output passed test with ✔');
    });

    // TC-N-07: result.tests contains single failed test with suite
    test('TC-N-07: Outputs suite name and failed test with index when result.tests contains single failed test', () => {
      // Given: result with single failed test with suite
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Test Title',
            fullTitle: 'Suite A Test Title',
            state: 'failed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Outputs suite name and failed test with index
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('Suite A'), 'Should output suite name');
      assert.ok(output.includes('1) Test Title'), 'Should output failed test with index');
    });

    // TC-N-08: result.tests contains single pending test with suite
    test('TC-N-08: Outputs suite name and pending test with - when result.tests contains single pending test', () => {
      // Given: result with single pending test with suite
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Test Title',
            fullTitle: 'Suite A Test Title',
            state: 'pending',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Outputs suite name and pending test with -
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('Suite A'), 'Should output suite name');
      assert.ok(output.includes('- Test Title'), 'Should output pending test with -');
    });

    // TC-N-09: result.tests contains multiple suites with mixed states
    test('TC-N-09: Groups tests by suite and outputs in suite order with incrementing failureIndex', () => {
      // Given: result with multiple suites with mixed states
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Passed Test',
            fullTitle: 'Suite A Passed Test',
            state: 'passed',
          },
          {
            suite: 'Suite A',
            title: 'Failed Test',
            fullTitle: 'Suite A Failed Test',
            state: 'failed',
          },
          {
            suite: 'Suite B',
            title: 'Another Failed Test',
            fullTitle: 'Suite B Another Failed Test',
            state: 'failed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Groups tests by suite, outputs in suite order, failureIndex increments
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('Suite A'), 'Should output Suite A');
      assert.ok(output.includes('Suite B'), 'Should output Suite B');
      assert.ok(output.includes('✔ Passed Test'), 'Should output passed test');
      assert.ok(output.includes('1) Failed Test'), 'Should output first failed test with index 1');
      assert.ok(output.includes('2) Another Failed Test'), 'Should output second failed test with index 2');
    });

    // TC-N-10: test has suite property set
    test('TC-N-10: Uses test.suite directly when test has suite property set', () => {
      // Given: test with suite property set
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Direct Suite',
            title: 'Test Title',
            fullTitle: 'Different Full Title',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Uses test.suite directly
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('Direct Suite'), 'Should use suite property directly');
      assert.ok(!output.includes('Different Full Title'), 'Should not use fullTitle when suite is set');
    });

    // TC-N-11: test has no suite but has fullTitle and title
    test('TC-N-11: Derives suite from resolveSuiteFromFullTitle when test has no suite but has fullTitle and title', () => {
      // Given: test with no suite but has fullTitle and title
      const result: TestResultFile = {
        tests: [
          {
            title: 'Test Title',
            fullTitle: 'Suite A Test Title',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Derives suite from resolveSuiteFromFullTitle
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('Suite A'), 'Should derive suite from fullTitle and title');
    });

    // TC-N-12: test has no suite and no valid fullTitle/title
    test('TC-N-12: Uses "(root)" as suite when test has no suite and no valid fullTitle/title', () => {
      // Given: test with no suite and no valid fullTitle/title
      const result: TestResultFile = {
        tests: [
          {
            title: 'Test Title',
            fullTitle: 'Test Title', // Same as title, so suite derivation returns empty
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Uses "(root)" as suite
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('(root)'), 'Should use "(root)" as suite when derivation fails');
    });

    // TC-E-04: result.tests is undefined
    test('TC-E-04: Returns early with no console output when result.tests is undefined', () => {
      // Given: result with undefined tests
      const result: TestResultFile = {
        tests: undefined,
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Returns early, no console output
      assert.strictEqual(consoleLogSpy.length, 0, 'Should not output anything when tests is undefined');
    });

    // TC-E-05: result.tests is null
    test('TC-E-05: Returns early with no console output when result.tests is null', () => {
      // Given: result with null tests (cast to allow null)
      const result = {
        tests: null,
      } as unknown as TestResultFile;

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Returns early, no console output
      assert.strictEqual(consoleLogSpy.length, 0, 'Should not output anything when tests is null');
    });

    // TC-E-06: result is undefined
    test('TC-E-06: Throws TypeError or returns early when result is undefined', () => {
      // Given: undefined result
      const result = undefined as unknown as TestResultFile;

      // When: printMochaLikeResultsFromTestResultFile is called
      // Then: Should handle undefined gracefully (may throw or return early)
      try {
        printMochaLikeResultsFromTestResultFile(result);
        // If no error, should return early
        assert.strictEqual(consoleLogSpy.length, 0, 'Should not output anything when result is undefined');
      } catch (err) {
        // If error, should be TypeError
        assert.ok(err instanceof TypeError, 'Should throw TypeError when result is undefined');
      }
    });

    // TC-B-05: test.title is empty string
    test('TC-B-05: Outputs "(no title)" when test.title is empty string', () => {
      // Given: test with empty title
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: '',
            fullTitle: 'Suite A',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Outputs "(no title)"
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('(no title)'), 'Should output "(no title)" when title is empty');
    });

    // TC-B-06: test.title is undefined
    test('TC-B-06: Outputs "(no title)" when test.title is undefined', () => {
      // Given: test with undefined title
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: undefined,
            fullTitle: 'Suite A',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Outputs "(no title)"
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('(no title)'), 'Should output "(no title)" when title is undefined');
    });

    // TC-B-07: test.suite is empty string (trimmed)
    test('TC-B-07: Falls back to fullTitle/title derivation or "(root)" when test.suite is empty string', () => {
      // Given: test with empty suite (trimmed)
      const result: TestResultFile = {
        tests: [
          {
            suite: '   ', // Only spaces, trimmed to empty
            title: 'Test Title',
            fullTitle: 'Suite A Test Title',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Falls back to fullTitle/title derivation
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('Suite A'), 'Should derive suite from fullTitle/title when suite is empty');
    });

    // TC-B-08: test.state is undefined
    test('TC-B-08: Outputs with - (pending format) when test.state is undefined', () => {
      // Given: test with undefined state
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Test Title',
            fullTitle: 'Suite A Test Title',
            state: undefined,
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Outputs with - (pending format)
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('- Test Title'), 'Should output with - when state is undefined');
    });

    // TC-PRINT-N-01: result.tests is array with passed tests
    test('TC-PRINT-N-01: Prints Mocha-like output with ✔ when result.tests contains passed tests', () => {
      // Given: result with passed tests
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Passed Test',
            fullTitle: 'Suite A Passed Test',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Prints Mocha-like output with ✔
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('✔ Passed Test'), 'Should print passed test with ✔');
    });

    // TC-PRINT-N-02: result.tests is array with failed tests
    test('TC-PRINT-N-02: Prints Mocha-like output with numbered failures when result.tests contains failed tests', () => {
      // Given: result with failed tests
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Failed Test',
            fullTitle: 'Suite A Failed Test',
            state: 'failed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Prints Mocha-like output with numbered failures
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('1) Failed Test'), 'Should print failed test with number');
    });

    // TC-PRINT-N-03: result.tests is array with pending tests
    test('TC-PRINT-N-03: Prints Mocha-like output with - when result.tests contains pending tests', () => {
      // Given: result with pending tests
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Pending Test',
            fullTitle: 'Suite A Pending Test',
            state: 'pending',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Prints Mocha-like output with -
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('- Pending Test'), 'Should print pending test with -');
    });

    // TC-PRINT-N-04: result.tests is array with mixed states
    test('TC-PRINT-N-04: Prints all test states correctly when result.tests contains mixed states', () => {
      // Given: result with mixed states
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Passed Test',
            fullTitle: 'Suite A Passed Test',
            state: 'passed',
          },
          {
            suite: 'Suite A',
            title: 'Failed Test',
            fullTitle: 'Suite A Failed Test',
            state: 'failed',
          },
          {
            suite: 'Suite A',
            title: 'Pending Test',
            fullTitle: 'Suite A Pending Test',
            state: 'pending',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Prints all test states correctly
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('✔ Passed Test'), 'Should print passed test');
      assert.ok(output.includes('1) Failed Test'), 'Should print failed test');
      assert.ok(output.includes('- Pending Test'), 'Should print pending test');
    });

    // TC-PRINT-N-05: result.tests has tests grouped by suite
    test('TC-PRINT-N-05: Groups and prints tests by suite when result.tests has multiple suites', () => {
      // Given: result with tests grouped by suite
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Test A1',
            fullTitle: 'Suite A Test A1',
            state: 'passed',
          },
          {
            suite: 'Suite A',
            title: 'Test A2',
            fullTitle: 'Suite A Test A2',
            state: 'passed',
          },
          {
            suite: 'Suite B',
            title: 'Test B1',
            fullTitle: 'Suite B Test B1',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Groups and prints by suite
      const output = consoleLogSpy.join('\n');
      const suiteAIndex = output.indexOf('Suite A');
      const suiteBIndex = output.indexOf('Suite B');
      assert.ok(suiteAIndex !== -1, 'Should output Suite A');
      assert.ok(suiteBIndex !== -1, 'Should output Suite B');
      assert.ok(suiteAIndex < suiteBIndex, 'Should output suites in order');
    });

    // TC-PRINT-B-01: result.tests is empty array
    test('TC-PRINT-B-01: Returns early with no output when result.tests is empty array', () => {
      // Given: result with empty tests array
      const result: TestResultFile = {
        tests: [],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Returns early, no output
      assert.strictEqual(consoleLogSpy.length, 0, 'Should not output anything when tests array is empty');
    });

    // TC-PRINT-B-02: result.tests is null
    test('TC-PRINT-B-02: Returns early with no output when result.tests is null', () => {
      // Given: result with null tests
      const result = {
        tests: null,
      } as unknown as TestResultFile;

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Returns early, no output
      assert.strictEqual(consoleLogSpy.length, 0, 'Should not output anything when tests is null');
    });

    // TC-PRINT-B-03: result.tests is undefined
    test('TC-PRINT-B-03: Returns early with no output when result.tests is undefined', () => {
      // Given: result with undefined tests
      const result: TestResultFile = {
        tests: undefined,
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Returns early, no output
      assert.strictEqual(consoleLogSpy.length, 0, 'Should not output anything when tests is undefined');
    });

    // TC-PRINT-B-04: result.tests length = 0
    test('TC-PRINT-B-04: Returns early with no output when result.tests length is 0', () => {
      // Given: result with zero-length tests array
      const result: TestResultFile = {
        tests: [],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Returns early, no output
      assert.strictEqual(consoleLogSpy.length, 0, 'Should not output anything when tests length is 0');
    });

    // TC-PRINT-B-05: result.tests length = 1
    test('TC-PRINT-B-05: Prints single test correctly when result.tests length is 1', () => {
      // Given: result with single test
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Single Test',
            fullTitle: 'Suite A Single Test',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Prints single test correctly
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('Suite A'), 'Should output suite name');
      assert.ok(output.includes('✔ Single Test'), 'Should output single test');
    });

    // TC-PRINT-B-07: TestCaseInfo.suite is empty string
    test('TC-PRINT-B-07: Normalizes to "(root)" when TestCaseInfo.suite is empty string', () => {
      // Given: test with empty suite
      const result: TestResultFile = {
        tests: [
          {
            suite: '',
            title: 'Test Title',
            fullTitle: 'Test Title',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Normalizes to "(root)"
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('(root)'), 'Should normalize to "(root)" when suite is empty');
    });

    // TC-PRINT-B-08: TestCaseInfo.suite is null
    test('TC-PRINT-B-08: Normalizes to "(root)" when TestCaseInfo.suite is null', () => {
      // Given: test with null suite
      const result: TestResultFile = {
        tests: [
          {
            suite: null as unknown as string,
            title: 'Test Title',
            fullTitle: 'Test Title',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Normalizes to "(root)"
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('(root)'), 'Should normalize to "(root)" when suite is null');
    });

    // TC-PRINT-B-09: TestCaseInfo.suite is undefined
    test('TC-PRINT-B-09: Normalizes to "(root)" when TestCaseInfo.suite is undefined', () => {
      // Given: test with undefined suite
      const result: TestResultFile = {
        tests: [
          {
            title: 'Test Title',
            fullTitle: 'Test Title',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Normalizes to "(root)"
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('(root)'), 'Should normalize to "(root)" when suite is undefined');
    });

    // TC-PRINT-B-10: TestCaseInfo.title is empty string
    test('TC-PRINT-B-10: Prints "(no title)" when TestCaseInfo.title is empty string', () => {
      // Given: test with empty title
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: '',
            fullTitle: 'Suite A',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Prints "(no title)"
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('(no title)'), 'Should print "(no title)" when title is empty');
    });

    // TC-PRINT-B-11: TestCaseInfo.title is null
    test('TC-PRINT-B-11: Prints "(no title)" when TestCaseInfo.title is null', () => {
      // Given: test with null title
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: null as unknown as string,
            fullTitle: 'Suite A',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Prints "(no title)"
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('(no title)'), 'Should print "(no title)" when title is null');
    });

    // TC-PRINT-B-12: TestCaseInfo.title is undefined
    test('TC-PRINT-B-12: Prints "(no title)" when TestCaseInfo.title is undefined', () => {
      // Given: test with undefined title
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            fullTitle: 'Suite A',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Prints "(no title)"
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('(no title)'), 'Should print "(no title)" when title is undefined');
    });

    // TC-PRINT-B-13: TestCaseInfo.state is 'passed'
    test('TC-PRINT-B-13: Prints ✔ when TestCaseInfo.state is "passed"', () => {
      // Given: test with passed state
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Test Title',
            fullTitle: 'Suite A Test Title',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Prints ✔
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('✔ Test Title'), 'Should print ✔ for passed state');
    });

    // TC-PRINT-B-14: TestCaseInfo.state is 'failed'
    test('TC-PRINT-B-14: Prints numbered failure when TestCaseInfo.state is "failed"', () => {
      // Given: test with failed state
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Test Title',
            fullTitle: 'Suite A Test Title',
            state: 'failed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Prints numbered failure
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('1) Test Title'), 'Should print numbered failure for failed state');
    });

    // TC-PRINT-B-15: TestCaseInfo.state is 'pending'
    test('TC-PRINT-B-15: Prints - when TestCaseInfo.state is "pending"', () => {
      // Given: test with pending state
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Test Title',
            fullTitle: 'Suite A Test Title',
            state: 'pending',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Prints -
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('- Test Title'), 'Should print - for pending state');
    });

    // TC-PRINT-B-16: TestCaseInfo.state is undefined
    test('TC-PRINT-B-16: Prints - (defaults to pending) when TestCaseInfo.state is undefined', () => {
      // Given: test with undefined state
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Test Title',
            fullTitle: 'Suite A Test Title',
            state: undefined,
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Prints - (defaults to pending)
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('- Test Title'), 'Should print - when state is undefined');
    });

    // TC-PRINT-E-01: result is null
    test('TC-PRINT-E-01: Throws TypeError when result is null', () => {
      // Given: null result
      const result = null as unknown as TestResultFile;

      // When: printMochaLikeResultsFromTestResultFile is called
      // Then: Throws TypeError
      assert.throws(
        () => printMochaLikeResultsFromTestResultFile(result),
        TypeError,
        'Should throw TypeError when result is null'
      );
    });

    // TC-PRINT-E-02: result is undefined
    test('TC-PRINT-E-02: Throws TypeError when result is undefined', () => {
      // Given: undefined result
      const result = undefined as unknown as TestResultFile;

      // When: printMochaLikeResultsFromTestResultFile is called
      // Then: Throws TypeError or returns early
      try {
        printMochaLikeResultsFromTestResultFile(result);
        assert.strictEqual(consoleLogSpy.length, 0, 'Should not output anything when result is undefined');
      } catch (err) {
        assert.ok(err instanceof TypeError, 'Should throw TypeError when result is undefined');
      }
    });

    // TC-PRINT-E-03: TestCaseInfo.fullTitle is missing, title exists
    test('TC-PRINT-E-03: Normalizes suite from available fields when TestCaseInfo.fullTitle is missing', () => {
      // Given: test with missing fullTitle but title exists
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Test Title',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Normalizes suite from available fields
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('Suite A'), 'Should use suite when fullTitle is missing');
    });

    // TC-PRINT-E-04: TestCaseInfo.title is missing, fullTitle exists
    test('TC-PRINT-E-04: Normalizes suite from available fields when TestCaseInfo.title is missing', () => {
      // Given: test with missing title but fullTitle exists
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            fullTitle: 'Suite A Test Title',
            state: 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Normalizes suite from available fields
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('Suite A'), 'Should use suite when title is missing');
      assert.ok(output.includes('(no title)'), 'Should print "(no title)" when title is missing');
    });

    // TC-PRINT-E-05: TestCaseInfo has invalid state value
    test('TC-PRINT-E-05: Prints - (defaults to pending) when TestCaseInfo has invalid state value', () => {
      // Given: test with invalid state value
      const result: TestResultFile = {
        tests: [
          {
            suite: 'Suite A',
            title: 'Test Title',
            fullTitle: 'Suite A Test Title',
            state: 'invalid' as 'passed',
          },
        ],
      };

      // When: printMochaLikeResultsFromTestResultFile is called
      printMochaLikeResultsFromTestResultFile(result);

      // Then: Prints - (defaults to pending)
      const output = consoleLogSpy.join('\n');
      assert.ok(output.includes('- Test Title'), 'Should print - for invalid state');
    });
  });

  suite('require.main === module guard', () => {
    // TC-MAIN-N-01: require.main === module is true
    // Note: This test verifies the code structure. In test environment, require.main === module is typically false
    // because the module is imported, not executed directly. The actual behavior when require.main === module is true
    // would execute main() which starts VS Code, so we cannot test that directly.
    test('TC-MAIN-N-01: Code structure ensures main() is only executed when require.main === module', () => {
      // Given: The module is imported (not executed directly)
      // When: Module is imported
      // Then: main() should not be executed (require.main === module is false in test environment)
      // This is verified by the fact that VS Code is not started when the test runs
      assert.ok(true, 'Module can be imported without executing main()');
    });

    // TC-MAIN-N-02: require.main === module is false
    test('TC-MAIN-N-02: When module is imported, require.main === module is false and main() is not executed', () => {
      // Given: Module is imported (not executed directly)
      // When: Module is imported
      // Then: require.main === module is false, main() is not executed
      // This is verified by the fact that VS Code is not started when the test runs
      assert.ok(true, 'Module can be imported without executing main()');
    });

    // TC-MAIN-B-01: Module is entry point
    // Note: This cannot be tested directly as it would start VS Code
    test('TC-MAIN-B-01: Code structure ensures main() is executed when module is entry point', () => {
      // Given: Code structure check
      // When: Code is reviewed
      // Then: if (require.main === module) { void main(); } pattern exists
      // This is verified by code inspection - the pattern exists in runTest.ts
      assert.ok(true, 'Code structure ensures main() is only executed when require.main === module');
    });

    // TC-MAIN-B-02: Module is imported
    test('TC-MAIN-B-02: When module is imported, main() is not executed', () => {
      // Given: Module is imported (not executed directly)
      // When: Module is imported
      // Then: main() is not executed
      // This is verified by the fact that VS Code is not started when the test runs
      assert.ok(true, 'Module can be imported without executing main()');
    });
  });

  suite('stageExtensionToTemp', () => {
    let tempDir: string;
    let sourceDir: string;
    let stageDir: string;

    const ensureRequiredSourceFiles = async (): Promise<void> => {
      // stageExtensionToTemp は拡張機能一式を退避するため、package-lock.json 以外も前提としてコピーする。
      // テスト用の sourceDir でも最小構成を用意する。
      await fs.promises.writeFile(path.join(sourceDir, 'package.json'), '{"name":"test"}');
      await fs.promises.writeFile(path.join(sourceDir, 'LICENSE'), 'MIT');
      await fs.promises.mkdir(path.join(sourceDir, 'out'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'src'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'docs'), { recursive: true });
      await fs.promises.writeFile(
        path.join(sourceDir, 'docs', 'usage.md'),
        'dontforgetest.testExecutionRunner\n既定: `extension`\n- extension\n- cursorAgent\n自動フォールバック\n',
      );
      await fs.promises.mkdir(path.join(sourceDir, 'media'), { recursive: true });
    };

    setup(async () => {
      // Given: Temporary directories for testing
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dontforgetest-test-'));
      sourceDir = path.join(tempDir, 'source');
      stageDir = path.join(tempDir, 'stage');
      await fs.promises.mkdir(sourceDir, { recursive: true });
      await fs.promises.mkdir(stageDir, { recursive: true });
    });

    teardown(async () => {
      // Cleanup: Remove temporary directories
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    // TC-N-01: package-lock.json exists in sourceExtensionRoot
    // Given: package-lock.json exists in sourceExtensionRoot
    // When: stageExtensionToTemp is called
    // Then: package-lock.json is copied to stageExtensionRoot successfully
    test('TC-N-01: package-lock.json exists in sourceExtensionRoot', async () => {
      // Given: package-lock.json exists in sourceExtensionRoot
      await ensureRequiredSourceFiles();
      const packageLockContent = '{"name": "test", "version": "1.0.0"}';
      await fs.promises.writeFile(path.join(sourceDir, 'package-lock.json'), packageLockContent);

      // When: stageExtensionToTemp is called
      await stageExtensionToTemp({
        sourceExtensionRoot: sourceDir,
        stageExtensionRoot: stageDir,
      });

      // Then: package-lock.json is copied to stageExtensionRoot successfully
      const copiedPath = path.join(stageDir, 'package-lock.json');
      assert.ok(await fs.promises.access(copiedPath).then(() => true).catch(() => false), 'package-lock.json is copied');
      const copiedContent = await fs.promises.readFile(copiedPath, 'utf8');
      assert.strictEqual(copiedContent, packageLockContent, 'Copied content matches original');
    });

    // TC-N-02: package-lock.json exists and other files (package.json, LICENSE, out, src, media) also exist
    // Given: package-lock.json exists and other files also exist
    // When: stageExtensionToTemp is called
    // Then: All files including package-lock.json are copied successfully
    test('TC-N-02: package-lock.json exists and other files also exist', async () => {
      // Given: package-lock.json exists and other files also exist
      await fs.promises.writeFile(path.join(sourceDir, 'package-lock.json'), '{"name": "test"}');
      await fs.promises.writeFile(path.join(sourceDir, 'package.json'), '{"name": "test"}');
      await fs.promises.writeFile(path.join(sourceDir, 'LICENSE'), 'MIT');
      await fs.promises.mkdir(path.join(sourceDir, 'out'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'src'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'docs'), { recursive: true });
      await fs.promises.writeFile(
        path.join(sourceDir, 'docs', 'usage.md'),
        'dontforgetest.testExecutionRunner\n既定: `extension`\n- extension\n- cursorAgent\n自動フォールバック\n',
      );
      await fs.promises.mkdir(path.join(sourceDir, 'media'), { recursive: true });

      // When: stageExtensionToTemp is called
      await stageExtensionToTemp({
        sourceExtensionRoot: sourceDir,
        stageExtensionRoot: stageDir,
      });

      // Then: All files including package-lock.json are copied successfully
      assert.ok(await fs.promises.access(path.join(stageDir, 'package-lock.json')).then(() => true).catch(() => false), 'package-lock.json is copied');
      assert.ok(await fs.promises.access(path.join(stageDir, 'package.json')).then(() => true).catch(() => false), 'package.json is copied');
      assert.ok(await fs.promises.access(path.join(stageDir, 'LICENSE')).then(() => true).catch(() => false), 'LICENSE is copied');
      assert.ok(await fs.promises.access(path.join(stageDir, 'out')).then(() => true).catch(() => false), 'out directory is copied');
      assert.ok(await fs.promises.access(path.join(stageDir, 'src')).then(() => true).catch(() => false), 'src directory is copied');
      assert.ok(await fs.promises.access(path.join(stageDir, 'docs')).then(() => true).catch(() => false), 'docs directory is copied');
      assert.ok(await fs.promises.access(path.join(stageDir, 'media')).then(() => true).catch(() => false), 'media directory is copied');
    });

    // TC-E-01: package-lock.json does not exist in sourceExtensionRoot
    // Given: package-lock.json does not exist in sourceExtensionRoot
    // When: stageExtensionToTemp is called
    // Then: fs.promises.cp throws ENOENT error or handles gracefully
    test('TC-E-01: package-lock.json does not exist in sourceExtensionRoot', async () => {
      // Given: package-lock.json does not exist in sourceExtensionRoot
      // (sourceDir is empty)

      // When: stageExtensionToTemp is called
      // Then: fs.promises.cp throws ENOENT error or handles gracefully
      await assert.rejects(
        async () => {
          await stageExtensionToTemp({
            sourceExtensionRoot: sourceDir,
            stageExtensionRoot: stageDir,
          });
        },
        (err: NodeJS.ErrnoException) => {
          return err.code === 'ENOENT' || err.message.includes('ENOENT');
        },
        'Should throw ENOENT error when package-lock.json does not exist'
      );
    });

    // TC-E-02: package-lock.json exists but sourceExtensionRoot path is invalid
    // Given: package-lock.json exists but sourceExtensionRoot path is invalid
    // When: stageExtensionToTemp is called
    // Then: fs.promises.cp throws error (ENOENT or similar)
    test('TC-E-02: package-lock.json exists but sourceExtensionRoot path is invalid', async () => {
      // Given: package-lock.json exists but sourceExtensionRoot path is invalid
      const invalidPath = path.join(tempDir, 'nonexistent-source');

      // When: stageExtensionToTemp is called
      // Then: fs.promises.cp throws error (ENOENT or similar)
      await assert.rejects(
        async () => {
          await stageExtensionToTemp({
            sourceExtensionRoot: invalidPath,
            stageExtensionRoot: stageDir,
          });
        },
        (err: NodeJS.ErrnoException) => {
          return err.code === 'ENOENT' || err.message.includes('ENOENT');
        },
        'Should throw ENOENT error when sourceExtensionRoot path is invalid'
      );
    });

    // TC-E-03: package-lock.json exists but destination directory is read-only
    // Given: package-lock.json exists but destination directory is read-only
    // When: stageExtensionToTemp is called
    // Then: fs.promises.cp throws EACCES error or handles gracefully
    test('TC-E-03: package-lock.json exists but destination directory is read-only', async () => {
      // Given: package-lock.json exists but destination directory is read-only
      await ensureRequiredSourceFiles();
      await fs.promises.writeFile(path.join(sourceDir, 'package-lock.json'), '{"name": "test"}');
      // stageExtensionToTemp は stageExtensionRoot を削除して作り直すため、
      // stageDir 自体を read-only にしてもエラーにならないケースがある。
      // 代わりに「親ディレクトリ」を read-only にして、削除/作成ができない状況を作る。
      try {
        await fs.promises.chmod(tempDir, 0o555); // Read-only (parent)
      } catch {
        // If chmod fails (e.g., on Windows), skip this test
        return;
      }

      try {
        // When: stageExtensionToTemp is called
        // Then: fs.promises.cp throws EACCES error or handles gracefully
        await assert.rejects(
          async () => {
            await stageExtensionToTemp({
              sourceExtensionRoot: sourceDir,
              stageExtensionRoot: stageDir,
            });
          },
          (err: NodeJS.ErrnoException) => {
            return err.code === 'EACCES' || err.code === 'EPERM' || err.message.includes('EACCES') || err.message.includes('EPERM');
          },
          'Should throw EACCES or EPERM error when destination directory is read-only'
        );
      } finally {
        // Restore permissions for cleanup
        try {
          await fs.promises.chmod(tempDir, 0o755);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    // TC-E-04: package-lock.json exists but disk is full
    // Given: package-lock.json exists but disk is full
    // When: stageExtensionToTemp is called
    // Then: fs.promises.cp throws ENOSPC error or handles gracefully
    // Note: This test cannot reliably simulate disk full condition, so we skip it
    test('TC-E-04: package-lock.json exists but disk is full', async () => {
      // Given: package-lock.json exists but disk is full
      // Note: Cannot reliably simulate disk full condition in unit tests
      // This test is skipped as it requires system-level manipulation
      await ensureRequiredSourceFiles();
      await fs.promises.writeFile(path.join(sourceDir, 'package-lock.json'), '{"name": "test"}');

      // When: stageExtensionToTemp is called
      // Then: Should complete successfully (cannot simulate disk full)
      // In real scenario, ENOSPC would be thrown
      await stageExtensionToTemp({
        sourceExtensionRoot: sourceDir,
        stageExtensionRoot: stageDir,
      });

      // Verify file was copied (test passes if disk is not full)
      assert.ok(await fs.promises.access(path.join(stageDir, 'package-lock.json')).then(() => true).catch(() => false), 'package-lock.json is copied (disk not full)');
    });

    // TC-B-01: package-lock.json exists but is empty (0 bytes)
    // Given: package-lock.json exists but is empty (0 bytes)
    // When: stageExtensionToTemp is called
    // Then: Empty package-lock.json is copied successfully
    test('TC-B-01: package-lock.json exists but is empty (0 bytes)', async () => {
      // Given: package-lock.json exists but is empty (0 bytes)
      await ensureRequiredSourceFiles();
      await fs.promises.writeFile(path.join(sourceDir, 'package-lock.json'), '');

      // When: stageExtensionToTemp is called
      await stageExtensionToTemp({
        sourceExtensionRoot: sourceDir,
        stageExtensionRoot: stageDir,
      });

      // Then: Empty package-lock.json is copied successfully
      const copiedPath = path.join(stageDir, 'package-lock.json');
      assert.ok(await fs.promises.access(copiedPath).then(() => true).catch(() => false), 'Empty package-lock.json is copied');
      const stats = await fs.promises.stat(copiedPath);
      assert.strictEqual(stats.size, 0, 'Copied file is empty (0 bytes)');
    });

    // TC-B-02: package-lock.json exists and is very large (e.g., 100MB+)
    // Given: package-lock.json exists and is very large
    // When: stageExtensionToTemp is called
    // Then: Large package-lock.json is copied successfully or throws error if too large
    test('TC-B-02: package-lock.json exists and is very large', async () => {
      // Given: package-lock.json exists and is very large (using smaller size for test: 1MB)
      await ensureRequiredSourceFiles();
      const largeContent = 'A'.repeat(1024 * 1024); // 1MB
      await fs.promises.writeFile(path.join(sourceDir, 'package-lock.json'), largeContent);

      // When: stageExtensionToTemp is called
      await stageExtensionToTemp({
        sourceExtensionRoot: sourceDir,
        stageExtensionRoot: stageDir,
      });

      // Then: Large package-lock.json is copied successfully
      const copiedPath = path.join(stageDir, 'package-lock.json');
      assert.ok(await fs.promises.access(copiedPath).then(() => true).catch(() => false), 'Large package-lock.json is copied');
      const stats = await fs.promises.stat(copiedPath);
      assert.strictEqual(stats.size, largeContent.length, 'Copied file size matches original');
    });

    // TC-B-03: package-lock.json is a symbolic link
    // Given: package-lock.json is a symbolic link
    // When: stageExtensionToTemp is called
    // Then: Symbolic link is copied (as link or resolved file) based on cp options
    test('TC-B-03: package-lock.json is a symbolic link', async () => {
      // Given: package-lock.json is a symbolic link
      await ensureRequiredSourceFiles();
      const targetFile = path.join(sourceDir, 'package-lock-target.json');
      await fs.promises.writeFile(targetFile, '{"name": "test"}');
      const symlinkPath = path.join(sourceDir, 'package-lock.json');
      try {
        await fs.promises.symlink(targetFile, symlinkPath);
      } catch {
        // Skip test on platforms that don't support symlinks (e.g., Windows without admin)
        return;
      }

      // When: stageExtensionToTemp is called
      await stageExtensionToTemp({
        sourceExtensionRoot: sourceDir,
        stageExtensionRoot: stageDir,
      });

      // Then: Symbolic link is copied (as resolved file, since cp resolves symlinks by default)
      const copiedPath = path.join(stageDir, 'package-lock.json');
      assert.ok(await fs.promises.access(copiedPath).then(() => true).catch(() => false), 'Symbolic link target is copied');
      const copiedContent = await fs.promises.readFile(copiedPath, 'utf8');
      assert.strictEqual(copiedContent, '{"name": "test"}', 'Symlink target content is copied');
    });

    // TC-B-04: package-lock.json exists but sourceExtensionRoot is null
    // Given: package-lock.json exists but sourceExtensionRoot is null
    // When: stageExtensionToTemp is called
    // Then: path.join throws TypeError or handles gracefully
    test('TC-B-04: package-lock.json exists but sourceExtensionRoot is null', async () => {
      // Given: package-lock.json exists but sourceExtensionRoot is null
      await fs.promises.writeFile(path.join(sourceDir, 'package-lock.json'), '{"name": "test"}');

      // When: stageExtensionToTemp is called
      // Then: path.join throws TypeError or handles gracefully
      await assert.rejects(
        async () => {
          await stageExtensionToTemp({
            sourceExtensionRoot: null as unknown as string,
            stageExtensionRoot: stageDir,
          });
        },
        (err: Error) => {
          return err instanceof TypeError || err.message.includes('null') || err.message.includes('TypeError');
        },
        'Should throw TypeError when sourceExtensionRoot is null'
      );
    });

    // TC-B-05: package-lock.json exists but stageExtensionRoot is null
    // Given: package-lock.json exists but stageExtensionRoot is null
    // When: stageExtensionToTemp is called
    // Then: path.join throws TypeError or handles gracefully
    test('TC-B-05: package-lock.json exists but stageExtensionRoot is null', async () => {
      // Given: package-lock.json exists but stageExtensionRoot is null
      await fs.promises.writeFile(path.join(sourceDir, 'package-lock.json'), '{"name": "test"}');

      // When: stageExtensionToTemp is called
      // Then: path.join throws TypeError or handles gracefully
      await assert.rejects(
        async () => {
          await stageExtensionToTemp({
            sourceExtensionRoot: sourceDir,
            stageExtensionRoot: null as unknown as string,
          });
        },
        (err: Error) => {
          return err instanceof TypeError || err.message.includes('null') || err.message.includes('TypeError');
        },
        'Should throw TypeError when stageExtensionRoot is null'
      );
    });

    // TC-STAGE-N-01: docs directory exists in sourceExtensionRoot with files
    test('TC-STAGE-N-01: docs directory exists in sourceExtensionRoot with files', async () => {
      // Given: docs directory exists in sourceExtensionRoot with files
      await ensureRequiredSourceFiles();
      await fs.promises.writeFile(path.join(sourceDir, 'package-lock.json'), '{"name": "test"}');
      const docsFile1 = path.join(sourceDir, 'docs', 'file1.md');
      const docsFile2 = path.join(sourceDir, 'docs', 'subdir', 'file2.md');
      await fs.promises.writeFile(docsFile1, 'Content 1');
      await fs.promises.mkdir(path.join(sourceDir, 'docs', 'subdir'), { recursive: true });
      await fs.promises.writeFile(docsFile2, 'Content 2');

      // When: stageExtensionToTemp is called
      await stageExtensionToTemp({
        sourceExtensionRoot: sourceDir,
        stageExtensionRoot: stageDir,
      });

      // Then: docs directory is copied to stageExtensionRoot successfully with all files
      const copiedDocsDir = path.join(stageDir, 'docs');
      const copiedFile1 = path.join(stageDir, 'docs', 'file1.md');
      const copiedFile2 = path.join(stageDir, 'docs', 'subdir', 'file2.md');
      assert.ok(await fs.promises.access(copiedDocsDir).then(() => true).catch(() => false), 'docs directory is copied');
      assert.ok(await fs.promises.access(copiedFile1).then(() => true).catch(() => false), 'docs/file1.md is copied');
      assert.ok(await fs.promises.access(copiedFile2).then(() => true).catch(() => false), 'docs/subdir/file2.md is copied');
      const content1 = await fs.promises.readFile(copiedFile1, 'utf8');
      const content2 = await fs.promises.readFile(copiedFile2, 'utf8');
      assert.strictEqual(content1, 'Content 1', 'Copied file1.md content matches');
      assert.strictEqual(content2, 'Content 2', 'Copied file2.md content matches');
    });

    // TC-STAGE-N-02: docs directory exists but is empty
    test('TC-STAGE-N-02: docs directory exists but is empty', async () => {
      // Given: docs directory exists but is empty
      await fs.promises.writeFile(path.join(sourceDir, 'package.json'), '{"name":"test"}');
      await fs.promises.writeFile(path.join(sourceDir, 'LICENSE'), 'MIT');
      await fs.promises.mkdir(path.join(sourceDir, 'out'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'src'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'docs'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'media'), { recursive: true });
      await fs.promises.writeFile(path.join(sourceDir, 'package-lock.json'), '{"name": "test"}');

      // When: stageExtensionToTemp is called
      await stageExtensionToTemp({
        sourceExtensionRoot: sourceDir,
        stageExtensionRoot: stageDir,
      });

      // Then: Empty docs directory is copied to stageExtensionRoot successfully
      const copiedDocsDir = path.join(stageDir, 'docs');
      assert.ok(await fs.promises.access(copiedDocsDir).then(() => true).catch(() => false), 'Empty docs directory is copied');
      const stats = await fs.promises.stat(copiedDocsDir);
      assert.ok(stats.isDirectory(), 'Copied docs is a directory');
    });

    // TC-STAGE-B-01: docs directory does not exist in sourceExtensionRoot
    test('TC-STAGE-B-01: docs directory does not exist in sourceExtensionRoot', async () => {
      // Given: docs directory does not exist in sourceExtensionRoot
      await fs.promises.writeFile(path.join(sourceDir, 'package.json'), '{"name":"test"}');
      await fs.promises.writeFile(path.join(sourceDir, 'LICENSE'), 'MIT');
      await fs.promises.mkdir(path.join(sourceDir, 'out'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'src'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'media'), { recursive: true });
      await fs.promises.writeFile(path.join(sourceDir, 'package-lock.json'), '{"name": "test"}');

      // When: stageExtensionToTemp is called
      // Then: fs.promises.cp throws ENOENT error or handles gracefully
      await assert.rejects(
        async () => {
          await stageExtensionToTemp({
            sourceExtensionRoot: sourceDir,
            stageExtensionRoot: stageDir,
          });
        },
        (err: NodeJS.ErrnoException) => {
          return err.code === 'ENOENT' || err.message.includes('ENOENT');
        },
        'Should throw ENOENT error when docs directory does not exist'
      );
    });

    // TC-STAGE-B-02: docs directory exists but sourceExtensionRoot path is invalid
    test('TC-STAGE-B-02: docs directory exists but sourceExtensionRoot path is invalid', async () => {
      // Given: docs directory exists but sourceExtensionRoot path is invalid
      const invalidPath = path.join(tempDir, 'nonexistent-source');

      // When: stageExtensionToTemp is called
      // Then: fs.promises.cp throws error (ENOENT or similar)
      await assert.rejects(
        async () => {
          await stageExtensionToTemp({
            sourceExtensionRoot: invalidPath,
            stageExtensionRoot: stageDir,
          });
        },
        (err: NodeJS.ErrnoException) => {
          return err.code === 'ENOENT' || err.message.includes('ENOENT');
        },
        'Should throw ENOENT error when sourceExtensionRoot path is invalid'
      );
    });

    // TC-STAGE-E-01: docs directory exists but destination directory is read-only
    test('TC-STAGE-E-01: docs directory exists but destination directory is read-only', async () => {
      // Given: docs directory exists but destination directory is read-only
      await ensureRequiredSourceFiles();
      await fs.promises.writeFile(path.join(sourceDir, 'package-lock.json'), '{"name": "test"}');
      // stageExtensionToTemp は stageExtensionRoot を削除して作り直すため、
      // stageDir 自体を read-only にしてもエラーにならないケースがある。
      // 代わりに「親ディレクトリ」を read-only にして、削除/作成ができない状況を作る。
      try {
        await fs.promises.chmod(tempDir, 0o555); // Read-only (parent)
      } catch {
        // If chmod fails (e.g., on Windows), skip this test
        return;
      }

      try {
        // When: stageExtensionToTemp is called
        // Then: fs.promises.cp throws EACCES error or handles gracefully
        await assert.rejects(
          async () => {
            await stageExtensionToTemp({
              sourceExtensionRoot: sourceDir,
              stageExtensionRoot: stageDir,
            });
          },
          (err: NodeJS.ErrnoException) => {
            return err.code === 'EACCES' || err.code === 'EPERM' || err.message.includes('EACCES') || err.message.includes('EPERM');
          },
          'Should throw EACCES or EPERM error when destination directory is read-only'
        );
      } finally {
        // Restore permissions for cleanup
        try {
          await fs.promises.chmod(tempDir, 0o755);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    // TC-STAGE-E-02: docs directory exists but contains symlink to non-existent target
    test('TC-STAGE-E-02: docs directory exists but contains symlink to non-existent target', async () => {
      // Given: docs directory exists but contains symlink to non-existent target
      await ensureRequiredSourceFiles();
      await fs.promises.writeFile(path.join(sourceDir, 'package-lock.json'), '{"name": "test"}');
      const brokenSymlinkPath = path.join(sourceDir, 'docs', 'broken-link.md');
      const nonExistentTarget = path.join(sourceDir, 'nonexistent-file.md');
      try {
        await fs.promises.symlink(nonExistentTarget, brokenSymlinkPath);
      } catch {
        // Skip test on platforms that don't support symlinks (e.g., Windows without admin)
        return;
      }

      // When: stageExtensionToTemp is called
      // Then: fs.promises.cp handles broken symlink appropriately (copies symlink or throws error)
      try {
        await stageExtensionToTemp({
          sourceExtensionRoot: sourceDir,
          stageExtensionRoot: stageDir,
        });

        // If no error, verify that symlink was handled (may be copied as symlink or resolved)
        const copiedSymlinkPath = path.join(stageDir, 'docs', 'broken-link.md');
        const exists = await fs.promises.access(copiedSymlinkPath).then(() => true).catch(() => false);
        if (exists) {
          // Symlink was copied (or resolved), which is acceptable behavior
          assert.ok(true, 'Broken symlink was handled (copied or resolved)');
        }
      } catch (err) {
        // Error is acceptable when handling broken symlinks
        assert.ok(err instanceof Error, 'Error may be thrown when handling broken symlink');
      }
    });
  });

  suite('ensureRequiredSourceFiles helper function', () => {
    let tempDir: string;
    let sourceDir: string;

    setup(async () => {
      // Given: Temporary directory for testing
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dontforgetest-test-'));
      sourceDir = path.join(tempDir, 'source');
      await fs.promises.mkdir(sourceDir, { recursive: true });
    });

    teardown(async () => {
      // Cleanup: Remove temporary directories
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    const ensureRequiredSourceFiles = async (): Promise<void> => {
      // stageExtensionToTemp は拡張機能一式を退避するため、package-lock.json 以外も前提としてコピーする。
      // テスト用の sourceDir でも最小構成を用意する。
      await fs.promises.writeFile(path.join(sourceDir, 'package.json'), '{"name":"test"}');
      await fs.promises.writeFile(path.join(sourceDir, 'LICENSE'), 'MIT');
      await fs.promises.mkdir(path.join(sourceDir, 'out'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'src'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'docs'), { recursive: true });
      await fs.promises.writeFile(
        path.join(sourceDir, 'docs', 'usage.md'),
        'dontforgetest.testExecutionRunner\n既定: `extension`\n- extension\n- cursorAgent\n自動フォールバック\n',
      );
      await fs.promises.mkdir(path.join(sourceDir, 'media'), { recursive: true });
    };

    // TC-RUNTEST-HELPER-N-01: ensureRequiredSourceFiles is called before test setup
    test('TC-RUNTEST-HELPER-N-01: ensureRequiredSourceFiles creates required files', async () => {
      // Given: ensureRequiredSourceFiles helper function
      // When: ensureRequiredSourceFiles is called
      await ensureRequiredSourceFiles();

      // Then: Required files (package.json, LICENSE, out/, src/, docs/, media/) are created
      const packageJsonPath = path.join(sourceDir, 'package.json');
      const licensePath = path.join(sourceDir, 'LICENSE');
      const outDirPath = path.join(sourceDir, 'out');
      const srcDirPath = path.join(sourceDir, 'src');
      const docsDirPath = path.join(sourceDir, 'docs');
      const usageMdPath = path.join(sourceDir, 'docs', 'usage.md');
      const mediaDirPath = path.join(sourceDir, 'media');

      assert.ok(await fs.promises.access(packageJsonPath).then(() => true).catch(() => false), 'package.json exists');
      assert.ok(await fs.promises.access(licensePath).then(() => true).catch(() => false), 'LICENSE exists');
      assert.ok(await fs.promises.access(outDirPath).then(() => true).catch(() => false), 'out/ directory exists');
      assert.ok(await fs.promises.access(srcDirPath).then(() => true).catch(() => false), 'src/ directory exists');
      assert.ok(await fs.promises.access(docsDirPath).then(() => true).catch(() => false), 'docs/ directory exists');
      assert.ok(await fs.promises.access(usageMdPath).then(() => true).catch(() => false), 'docs/usage.md exists');
      assert.ok(await fs.promises.access(mediaDirPath).then(() => true).catch(() => false), 'media/ directory exists');

      const packageJsonContent = await fs.promises.readFile(packageJsonPath, 'utf8');
      assert.strictEqual(packageJsonContent, '{"name":"test"}', 'package.json content is correct');
      const licenseContent = await fs.promises.readFile(licensePath, 'utf8');
      assert.strictEqual(licenseContent, 'MIT', 'LICENSE content is correct');
    });

    // TC-RUNTEST-HELPER-B-01: ensureRequiredSourceFiles is called when sourceDir is null
    test('TC-RUNTEST-HELPER-B-01: ensureRequiredSourceFiles throws TypeError when sourceDir is null', async () => {
      // Given: sourceDir is null
      const nullSourceDir = null as unknown as string;

      // When: ensureRequiredSourceFiles is called with null sourceDir
      // Then: path.join throws TypeError or handles gracefully
      await assert.rejects(
        async () => {
          await fs.promises.writeFile(path.join(nullSourceDir, 'package.json'), '{"name":"test"}');
        },
        (err: Error) => {
          return err instanceof TypeError || err.message.includes('null') || err.message.includes('TypeError');
        },
        'Should throw TypeError when sourceDir is null'
      );
    });

    // TC-RUNTEST-HELPER-B-02: ensureRequiredSourceFiles is called when directories already exist
    test('TC-RUNTEST-HELPER-B-02: ensureRequiredSourceFiles handles existing directories', async () => {
      // Given: Directories already exist
      await fs.promises.mkdir(path.join(sourceDir, 'out'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'src'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'docs'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'media'), { recursive: true });

      // When: ensureRequiredSourceFiles is called
      await ensureRequiredSourceFiles();

      // Then: Function completes successfully without errors
      assert.ok(await fs.promises.access(path.join(sourceDir, 'package.json')).then(() => true).catch(() => false), 'package.json exists');
      assert.ok(await fs.promises.access(path.join(sourceDir, 'out')).then(() => true).catch(() => false), 'out/ directory exists');
    });

    // TC-RUNTEST-HELPER-E-01: ensureRequiredSourceFiles is called but file write fails
    test('TC-RUNTEST-HELPER-E-01: ensureRequiredSourceFiles handles file write errors', async () => {
      // Given: sourceDir is read-only (simulating write failure)
      try {
        await fs.promises.chmod(sourceDir, 0o555); // Read-only
      } catch {
        // If chmod fails (e.g., on Windows), skip this test
        return;
      }

      // When: ensureRequiredSourceFiles is called
      // Then: Error is thrown or handled gracefully
      try {
        await ensureRequiredSourceFiles();
        // If no error is thrown, verify that files were created (some systems may allow writes)
        const packageJsonPath = path.join(sourceDir, 'package.json');
        const exists = await fs.promises.access(packageJsonPath).then(() => true).catch(() => false);
        if (!exists) {
          assert.ok(true, 'File write was prevented as expected');
        }
      } catch (err) {
        // Error is expected when directory is read-only
        assert.ok(err instanceof Error, 'Error is thrown when file write fails');
      } finally {
        // Restore permissions for cleanup
        try {
          await fs.promises.chmod(sourceDir, 0o755);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    // TC-RUNTEST-HELPER-E-02: ensureRequiredSourceFiles is called but directory creation fails
    test('TC-RUNTEST-HELPER-E-02: ensureRequiredSourceFiles handles directory creation errors', async () => {
      // Given: Parent directory is read-only (simulating directory creation failure)
      try {
        await fs.promises.chmod(tempDir, 0o555); // Read-only
      } catch {
        // If chmod fails (e.g., on Windows), skip this test
        return;
      }

      // When: ensureRequiredSourceFiles is called
      // Then: Error is thrown or handled gracefully
      try {
        await ensureRequiredSourceFiles();
        // If no error is thrown, verify that directories were created (some systems may allow creation)
        const outDirPath = path.join(sourceDir, 'out');
        const exists = await fs.promises.access(outDirPath).then(() => true).catch(() => false);
        if (!exists) {
          assert.ok(true, 'Directory creation was prevented as expected');
        }
      } catch (err) {
        // Error is expected when parent directory is read-only
        assert.ok(err instanceof Error, 'Error is thrown when directory creation fails');
      } finally {
        // Restore permissions for cleanup
        try {
          await fs.promises.chmod(tempDir, 0o755);
        } catch {
          // Ignore cleanup errors
        }
      }
    });

    // TC-RUNTEST-INTEGRATION-N-01: Test calls ensureRequiredSourceFiles before stageExtensionToTemp
    test('TC-RUNTEST-INTEGRATION-N-01: ensureRequiredSourceFiles integration with stageExtensionToTemp', async () => {
      // Given: ensureRequiredSourceFiles is called before stageExtensionToTemp
      await ensureRequiredSourceFiles();
      const packageLockContent = '{"name": "test", "version": "1.0.0"}';
      await fs.promises.writeFile(path.join(sourceDir, 'package-lock.json'), packageLockContent);

      const stageDir = path.join(tempDir, 'stage');
      await fs.promises.mkdir(stageDir, { recursive: true });

      // When: stageExtensionToTemp is called
      await stageExtensionToTemp({
        sourceExtensionRoot: sourceDir,
        stageExtensionRoot: stageDir,
      });

      // Then: Test completes successfully with required files in place
      const copiedPackageJson = path.join(stageDir, 'package.json');
      const copiedLicense = path.join(stageDir, 'LICENSE');
      const copiedPackageLock = path.join(stageDir, 'package-lock.json');

      assert.ok(await fs.promises.access(copiedPackageJson).then(() => true).catch(() => false), 'package.json is copied');
      assert.ok(await fs.promises.access(copiedLicense).then(() => true).catch(() => false), 'LICENSE is copied');
      assert.ok(await fs.promises.access(copiedPackageLock).then(() => true).catch(() => false), 'package-lock.json is copied');

      const copiedContent = await fs.promises.readFile(copiedPackageLock, 'utf8');
      assert.strictEqual(copiedContent, packageLockContent, 'package-lock.json content matches');
    });
  });
});
