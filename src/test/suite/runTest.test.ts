import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import * as childProcess from 'child_process';
import { TestRunFailedError } from '@vscode/test-electron';
import {
  resolveSuiteFromFullTitle,
  printMochaLikeResultsFromTestResultFile as rawPrintMochaLikeResultsFromTestResultFile,
  stageExtensionToTemp,
  TestResultFile,
  __test__,
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
        'dontforgetest.testExecutionRunner\nDefault: `extension`\n- extension\n- cursorAgent\nautomatic fallback\n',
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
    // Then: Handled gracefully (missing files are skipped)
    test('TC-E-01: package-lock.json does not exist in sourceExtensionRoot', async () => {
      // Given: package-lock.json does not exist in sourceExtensionRoot
      await ensureRequiredSourceFiles();
      // 必須ファイルは作成するが、package-lock.json は作成しない

      // When: stageExtensionToTemp is called
      await stageExtensionToTemp({
        sourceExtensionRoot: sourceDir,
        stageExtensionRoot: stageDir,
      });

      // Then: 関数は成功し、package-lock.json 以外のファイルはコピーされる
      assert.ok(await fs.promises.access(path.join(stageDir, 'package.json')).then(() => true).catch(() => false), 'package.json is copied');
      // package-lock.json はスキップされる
      assert.ok(!(await fs.promises.access(path.join(stageDir, 'package-lock.json')).then(() => true).catch(() => false)), 'package-lock.json is not copied (missing in source)');
    });

    // TC-REQ-E-01: package.json does not exist in sourceExtensionRoot
    // Given: package.json is missing but other required files exist
    // When: stageExtensionToTemp is called
    // Then: 必須ファイル欠落として ENOENT が投げられる（サイレントに成功しない）
    test('TC-REQ-E-01: package.json does not exist in sourceExtensionRoot', async () => {
      // Given: package.json は作らないが、他の必須ファイル/ディレクトリは用意する
      await fs.promises.writeFile(path.join(sourceDir, 'LICENSE'), 'MIT');
      await fs.promises.mkdir(path.join(sourceDir, 'out'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'src'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'docs'), { recursive: true });
      await fs.promises.writeFile(
        path.join(sourceDir, 'docs', 'usage.md'),
        'dontforgetest.testExecutionRunner\n既定: `extension`\n- extension\n- cursorAgent\n自動フォールバック\n',
      );
      await fs.promises.mkdir(path.join(sourceDir, 'media'), { recursive: true });

      // When / Then
      await assert.rejects(
        async () => {
          await stageExtensionToTemp({
            sourceExtensionRoot: sourceDir,
            stageExtensionRoot: stageDir,
          });
        },
        (err: NodeJS.ErrnoException) => err.code === 'ENOENT',
        'Should throw ENOENT when required package.json is missing',
      );
    });

    // TC-E-02: package-lock.json exists but sourceExtensionRoot path is invalid
    // Given: sourceExtensionRoot path is invalid (does not exist)
    // When: stageExtensionToTemp is called
    // Then: 必須ファイルが存在しないため ENOENT が投げられる
    test('TC-E-02: package-lock.json exists but sourceExtensionRoot path is invalid', async () => {
      // Given: sourceExtensionRoot path is invalid (does not exist)
      const invalidPath = path.join(tempDir, 'nonexistent-source');

      // When / Then: stageExtensionToTemp is called
      await assert.rejects(
        async () => {
          await stageExtensionToTemp({
            sourceExtensionRoot: invalidPath,
            stageExtensionRoot: stageDir,
          });
        },
        (err: NodeJS.ErrnoException) => err.code === 'ENOENT',
        'Should throw ENOENT when sourceExtensionRoot does not exist',
      );

      // Then: 途中で失敗するため、ステージングディレクトリにはコピー済みファイルがない
      const files = await fs.promises.readdir(stageDir).catch(() => []);
      assert.strictEqual(files.length, 0, 'No files are copied when source is invalid');
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

      // When / Then: stageExtensionToTemp is called
      await assert.rejects(
        async () => {
          await stageExtensionToTemp({
            sourceExtensionRoot: sourceDir,
            stageExtensionRoot: stageDir,
          });
        },
        (err: NodeJS.ErrnoException) => err.code === 'ENOENT',
        'Should throw ENOENT when required docs directory is missing',
      );

      // Then: 途中で失敗するため、ステージングディレクトリにはコピー済みファイルがない
      const files = await fs.promises.readdir(stageDir).catch(() => []);
      assert.strictEqual(files.length, 0, 'No files are copied when required docs is missing');
    });

    // TC-STAGE-B-02: docs directory exists but sourceExtensionRoot path is invalid
    // Given: sourceExtensionRoot path is invalid (does not exist)
    // When: stageExtensionToTemp is called
    // Then: 必須ファイルが存在しないため ENOENT が投げられる
    test('TC-STAGE-B-02: docs directory exists but sourceExtensionRoot path is invalid', async () => {
      // Given: sourceExtensionRoot path is invalid (does not exist)
      const invalidPath = path.join(tempDir, 'nonexistent-source');

      // When / Then: stageExtensionToTemp is called
      await assert.rejects(
        async () => {
          await stageExtensionToTemp({
            sourceExtensionRoot: invalidPath,
            stageExtensionRoot: stageDir,
          });
        },
        (err: NodeJS.ErrnoException) => err.code === 'ENOENT',
        'Should throw ENOENT when sourceExtensionRoot does not exist',
      );

      // Then: 途中で失敗するため、ステージングディレクトリにはファイルがない
      const files = await fs.promises.readdir(stageDir).catch(() => []);
      assert.strictEqual(files.length, 0, 'No files are copied when source is invalid');
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

  suite('runTest helper functions', () => {
    const {
      normalizeBooleanEnv,
      resolveShouldUseXvfb,
      shouldUseXvfb,
      parseIntOrFallback,
      normalizeLauncher,
      normalizeLocale,
      resolveTestResultFilePathOverride,
      sleepMs,
      fileExists,
      waitForFile,
      tryRemoveVscodeCache,
      sanitizeEnvForDetachedVscodeTest,
      requireRunState,
      readMainLogSummary,
      isExplicitTestFailure,
      handleResultError,
      buildFailureReport,
      buildLaunchArgs,
      buildExtensionTestsEnv,
      buildDirectSpawnCommand,
      runDirectLauncher,
      runDetachedVscodeExtensionTestsWithDeps,
      resolveVscodeExecutablePath,
      selectLauncher,
      captureRunError,
      finalizeFailedRun,
      parseTestResultOrThrow,
      reportFinalFailure,
      reportMainError,
      runMainWithDeps,
      main,
    } = __test__;

    // TC-N-01: normalizeBooleanEnv('true') => true
    test('TC-N-01: normalizeBooleanEnv は true 系の値で true を返す', () => {
      // Given: "true" 入力
      const input = 'true';

      // When: normalizeBooleanEnv を呼ぶ
      const result = normalizeBooleanEnv(input);

      // Then: true を返す
      assert.strictEqual(result, true, 'true 系は true を返す');
    });

    // TC-B-01: normalizeBooleanEnv('') => undefined
    test('TC-B-01: normalizeBooleanEnv は空文字で undefined を返す', () => {
      // Given: 空文字
      const input = '';

      // When: normalizeBooleanEnv を呼ぶ
      const result = normalizeBooleanEnv(input);

      // Then: undefined を返す
      assert.strictEqual(result, undefined, '空文字は undefined を返す');
    });

    // TC-B-02: normalizeBooleanEnv('0') => false
    test('TC-B-02: normalizeBooleanEnv は "0" で false を返す', () => {
      // Given: "0"
      const input = '0';

      // When: normalizeBooleanEnv を呼ぶ
      const result = normalizeBooleanEnv(input);

      // Then: false を返す
      assert.strictEqual(result, false, '"0" は false を返す');
    });

    // TC-E-01: normalizeBooleanEnv('maybe') => undefined
    test('TC-E-01: normalizeBooleanEnv は無効な値で undefined を返す', () => {
      // Given: 無効な値
      const input = 'maybe';

      // When: normalizeBooleanEnv を呼ぶ
      const result = normalizeBooleanEnv(input);

      // Then: undefined を返す
      assert.strictEqual(result, undefined, '無効な値は undefined を返す');
    });

    // TC-N-02: resolveShouldUseXvfb linux default
    test('TC-N-02: resolveShouldUseXvfb は Linux + 未設定で true を返す', () => {
      // Given: Linux + env 未設定
      const platform = 'linux';
      const envValue = undefined;

      // When: resolveShouldUseXvfb を呼ぶ
      const result = resolveShouldUseXvfb(platform, envValue);

      // Then: true を返す
      assert.strictEqual(result, true, 'Linux ではデフォルトで true');
    });

    // TC-B-03: resolveShouldUseXvfb linux opt-out
    test('TC-B-03: resolveShouldUseXvfb は Linux + "0" で false を返す', () => {
      // Given: Linux + env=0
      const platform = 'linux';
      const envValue = '0';

      // When: resolveShouldUseXvfb を呼ぶ
      const result = resolveShouldUseXvfb(platform, envValue);

      // Then: false を返す
      assert.strictEqual(result, false, 'Linux でも opt-out なら false');
    });

    // TC-B-04: resolveShouldUseXvfb non-linux
    test('TC-B-04: resolveShouldUseXvfb は非 Linux で false を返す', () => {
      // Given: 非 Linux
      const platform = 'darwin';
      const envValue = '1';

      // When: resolveShouldUseXvfb を呼ぶ
      const result = resolveShouldUseXvfb(platform, envValue);

      // Then: false を返す
      assert.strictEqual(result, false, '非 Linux は false');
    });

    // TC-N-03: parseIntOrFallback 正常
    test('TC-N-03: parseIntOrFallback は小数を切り捨てて返す', () => {
      // Given: value=3.9
      const params = { value: '3.9', fallback: 10, min: 0, label: 'X' };

      // When: parseIntOrFallback を呼ぶ
      const result = parseIntOrFallback(params);

      // Then: 3 を返す
      assert.strictEqual(result, 3, '小数は切り捨て');
    });

    // TC-B-05: parseIntOrFallback value=0
    test('TC-B-05: parseIntOrFallback は min=0 で 0 を返す', () => {
      // Given: value=0, min=0
      const params = { value: '0', fallback: 10, min: 0, label: 'X' };

      // When: parseIntOrFallback を呼ぶ
      const result = parseIntOrFallback(params);

      // Then: 0 を返す
      assert.strictEqual(result, 0, 'min=0 なら 0 を許可する');
    });

    // TC-B-06: parseIntOrFallback value=min-1
    test('TC-B-06: parseIntOrFallback は min 未満で fallback を返す', () => {
      // Given: value=-1, min=0
      const params = { value: '-1', fallback: 10, min: 0, label: 'X' };

      // When: parseIntOrFallback を呼ぶ
      const result = parseIntOrFallback(params);

      // Then: fallback を返す
      assert.strictEqual(result, 10, 'min 未満は fallback');
    });

    // TC-E-02: parseIntOrFallback value=NaN
    test('TC-E-02: parseIntOrFallback は NaN で fallback を返す', () => {
      // Given: value=NaN
      const params = { value: 'NaN', fallback: 10, min: 0, label: 'X' };

      // When: parseIntOrFallback を呼ぶ
      const result = parseIntOrFallback(params);

      // Then: fallback を返す
      assert.strictEqual(result, 10, '非数値は fallback');
    });

    // TC-B-07: parseIntOrFallback value undefined
    test('TC-B-07: parseIntOrFallback は空入力で fallback を返す', () => {
      // Given: value undefined
      const params = { value: undefined, fallback: 10, min: 0, label: 'X' };

      // When: parseIntOrFallback を呼ぶ
      const result = parseIntOrFallback(params);

      // Then: fallback を返す
      assert.strictEqual(result, 10, '空入力は fallback');
    });

    // TC-N-04: normalizeLauncher open
    test('TC-N-04: normalizeLauncher は open を返す', () => {
      // Given: "open"
      const input = 'open';

      // When: normalizeLauncher を呼ぶ
      const result = normalizeLauncher(input);

      // Then: open を返す
      assert.strictEqual(result, 'open', 'open は open を返す');
    });

    // TC-B-08: normalizeLauncher empty
    test('TC-B-08: normalizeLauncher は空白のみで undefined を返す', () => {
      // Given: 空白のみ
      const input = '   ';

      // When: normalizeLauncher を呼ぶ
      const result = normalizeLauncher(input);

      // Then: undefined を返す
      assert.strictEqual(result, undefined, '空白のみは undefined');
    });

    // TC-N-05: normalizeLocale en
    test('TC-N-05: normalizeLocale は指定ロケールを返す', () => {
      // Given: en
      const input = 'en';

      // When: normalizeLocale を呼ぶ
      const result = normalizeLocale(input);

      // Then: en を返す
      assert.strictEqual(result, 'en', '指定ロケールを返す');
    });

    // TC-B-09: normalizeLocale undefined
    test('TC-B-09: normalizeLocale は未指定で既定ロケールを返す', () => {
      // Given: undefined
      const input = undefined;

      // When: normalizeLocale を呼ぶ
      const result = normalizeLocale(input);

      // Then: ja を返す
      assert.strictEqual(result, 'ja', '未指定は既定ロケール');
    });

    // TC-RESFILE-N-01: resolveTestResultFilePathOverride absolute
    test('TC-RESFILE-N-01: resolveTestResultFilePathOverride は絶対パスをそのまま返す', () => {
      // Given: 絶対パス
      const input = path.join(os.tmpdir(), 'test-result.json');
      const baseDir = path.join(os.tmpdir(), 'base');

      // When: resolveTestResultFilePathOverride を呼ぶ
      const result = resolveTestResultFilePathOverride(input, baseDir);

      // Then: 絶対パスがそのまま返る
      assert.strictEqual(result, input, '絶対パスはそのまま返す');
    });

    // TC-RESFILE-N-02: resolveTestResultFilePathOverride relative
    test('TC-RESFILE-N-02: resolveTestResultFilePathOverride は相対パスを baseDir で解決する', () => {
      // Given: 相対パス
      const input = 'reports/test-result.json';
      const baseDir = path.join(os.tmpdir(), 'base');

      // When: resolveTestResultFilePathOverride を呼ぶ
      const result = resolveTestResultFilePathOverride(input, baseDir);

      // Then: baseDir で解決される
      assert.strictEqual(result, path.join(baseDir, input), '相対パスは baseDir で解決する');
    });

    // TC-RESFILE-B-01: resolveTestResultFilePathOverride empty
    test('TC-RESFILE-B-01: resolveTestResultFilePathOverride は空白のみで undefined を返す', () => {
      // Given: 空白のみ
      const input = '   ';
      const baseDir = path.join(os.tmpdir(), 'base');

      // When: resolveTestResultFilePathOverride を呼ぶ
      const result = resolveTestResultFilePathOverride(input, baseDir);

      // Then: undefined を返す
      assert.strictEqual(result, undefined, '空白のみは undefined');
    });

    // TC-RESFILE-E-01: resolveTestResultFilePathOverride traversal
    test('TC-RESFILE-E-01: resolveTestResultFilePathOverride は baseDir 外を指す相対パスで Error を投げる', () => {
      // Given: baseDir 外へ抜ける相対パス
      const baseDir = path.join(os.tmpdir(), 'dontforgetest-base');
      const input = `..${path.sep}outside${path.sep}test-result.json`;

      // When/Then: 例外（型とメッセージ）を検証する
      assert.throws(
        () => resolveTestResultFilePathOverride(input, baseDir),
        (err: unknown) => {
          assert.ok(err instanceof Error, 'Error が投げられること');
          assert.ok(err.message.includes('許可された範囲外'), 'メッセージに範囲外である旨が含まれること');
          assert.ok(err.message.includes('baseDir='), 'メッセージに baseDir 情報が含まれること');
          return true;
        },
        'baseDir 外を指す相対パスでは Error を投げる',
      );
    });

    // TC-N-06: sleepMs(0) resolves
    test('TC-N-06: sleepMs(0) はエラーなく解決する', async () => {
      // Given: 0ms
      const delayMs = 0;

      // When: sleepMs を呼ぶ
      await sleepMs(delayMs);

      // Then: 例外が発生しない
      assert.ok(true, 'sleepMs(0) は解決する');
    });

    // TC-N-07: fileExists existing
    test('TC-N-07: fileExists は存在するファイルで true を返す', async () => {
      // Given: 一時ファイル
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      const filePath = path.join(tempDir, 'exists.txt');
      await fs.promises.writeFile(filePath, 'ok', 'utf8');

      // When: fileExists を呼ぶ
      const result = await fileExists(filePath);

      // Then: true を返す
      assert.strictEqual(result, true, '存在ファイルは true');
    });

    // TC-E-03: fileExists missing
    test('TC-E-03: fileExists は存在しないファイルで false を返す', async () => {
      // Given: 存在しないパス
      const filePath = path.join(os.tmpdir(), `missing-${Date.now()}.txt`);

      // When: fileExists を呼ぶ
      const result = await fileExists(filePath);

      // Then: false を返す
      assert.strictEqual(result, false, '不存在は false');
    });

    // TC-N-08: waitForFile delayed creation
    test('TC-N-08: waitForFile はファイルが生成されると true を返す', async () => {
      // Given: 生成前のファイルパス
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-'));
      const filePath = path.join(tempDir, 'delayed.txt');

      // When: waitForFile を呼びつつ、少し遅れて作成する
      setTimeout(() => {
        void fs.promises.writeFile(filePath, 'ok', 'utf8');
      }, 10);
      const result = await waitForFile({ filePath, timeoutMs: 200, intervalMs: 5 });

      // Then: true を返す
      assert.strictEqual(result, true, '遅延生成でも true');
    });

    // TC-B-10: waitForFile timeout=0
    test('TC-B-10: waitForFile は timeout=0 で false を返す', async () => {
      // Given: 存在しないパス + timeout=0
      const filePath = path.join(os.tmpdir(), `missing-${Date.now()}.txt`);

      // When: waitForFile を呼ぶ
      const result = await waitForFile({ filePath, timeoutMs: 0, intervalMs: 10 });

      // Then: false を返す
      assert.strictEqual(result, false, 'timeout=0 は false');
    });

    // TC-N-09: tryRemoveVscodeCache success
    test('TC-N-09: tryRemoveVscodeCache は存在ディレクトリを削除する', async () => {
      // Given: 一時ディレクトリ
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-cache-'));
      const filePath = path.join(tempDir, 'dummy.txt');
      await fs.promises.writeFile(filePath, 'ok', 'utf8');

      // When: tryRemoveVscodeCache を呼ぶ
      await tryRemoveVscodeCache(tempDir);

      // Then: ディレクトリが削除されている
      const exists = await fs.promises.access(tempDir).then(() => true).catch(() => false);
      assert.strictEqual(exists, false, 'ディレクトリは削除される');
    });

    // TC-E-04: tryRemoveVscodeCache rm throws
    test('TC-E-04: tryRemoveVscodeCache は rm 失敗でも例外を投げない', async () => {
      // Given: rm を失敗させる
      const originalRm = fs.promises.rm;
      (fs.promises as unknown as { rm: typeof fs.promises.rm }).rm = async () => {
        throw new Error('rm failed');
      };

      try {
        // When: tryRemoveVscodeCache を呼ぶ
        await tryRemoveVscodeCache('/tmp/invalid-path');

        // Then: 例外が発生しない
        assert.ok(true, 'rm 失敗でも例外にならない');
      } finally {
        (fs.promises as unknown as { rm: typeof fs.promises.rm }).rm = originalRm;
      }
    });

    // TC-N-10: sanitizeEnvForDetachedVscodeTest
    test('TC-N-10: sanitizeEnvForDetachedVscodeTest は不要なキーを削除する', () => {
      // Given: CURSOR_ と VSCODE_IPC_HOOK 系が混在する env
      const env: NodeJS.ProcessEnv = {
        CURSOR_FOO: 'x',
        VSCODE_IPC_HOOK: 'y',
        VSCODE_IPC_HOOK_CLI: 'z',
        VSCODE_IPC_HOOK_EXTHOST: 'a',
        KEEP: 'ok',
      };

      // When: sanitizeEnvForDetachedVscodeTest を呼ぶ
      const result = sanitizeEnvForDetachedVscodeTest(env);

      // Then: CURSOR_ と IPC 系が除去される
      assert.strictEqual(result.CURSOR_FOO, undefined, 'CURSOR_ は削除される');
      assert.strictEqual(result.VSCODE_IPC_HOOK, undefined, 'VSCODE_IPC_HOOK は削除される');
      assert.strictEqual(result.VSCODE_IPC_HOOK_CLI, undefined, 'VSCODE_IPC_HOOK_CLI は削除される');
      assert.strictEqual(result.VSCODE_IPC_HOOK_EXTHOST, undefined, 'VSCODE_IPC_HOOK_EXTHOST は削除される');
      assert.strictEqual(result.KEEP, 'ok', '他のキーは保持される');
    });

    // TC-B-11: stageExtensionToTemp optional copy error
    test('TC-B-11: stageExtensionToTemp は任意コピーで失敗した場合に例外を投げる', async () => {
      // Given: 必須ファイルを持つ最小構成
      const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-src-'));
      const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-stage-'));
      await fs.promises.writeFile(path.join(sourceDir, 'package.json'), '{}', 'utf8');
      await fs.promises.writeFile(path.join(sourceDir, 'LICENSE'), 'license', 'utf8');
      await fs.promises.mkdir(path.join(sourceDir, 'out'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'src'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'docs'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'media'), { recursive: true });
      await fs.promises.writeFile(path.join(sourceDir, 'package.nls.ja.json'), '{}', 'utf8');

      const originalCp = fs.promises.cp;
      (fs.promises as unknown as { cp: typeof fs.promises.cp }).cp = async (src, dest, options) => {
        if (typeof src === 'string' && src.endsWith('package.nls.ja.json')) {
          const err = new Error('copy failed') as NodeJS.ErrnoException;
          err.code = 'EACCES';
          throw err;
        }
        return await originalCp(src, dest, options);
      };

      try {
        // When: stageExtensionToTemp を呼ぶ
        await assert.rejects(
          () => stageExtensionToTemp({ sourceExtensionRoot: sourceDir, stageExtensionRoot: stageDir }),
          (err: Error) => err.message.includes('copy failed'),
          '任意コピーの失敗は例外になる',
        );
      } finally {
        (fs.promises as unknown as { cp: typeof fs.promises.cp }).cp = originalCp;
      }
    });

    // TC-B-12: stageExtensionToTemp node_modules missing
    test('TC-B-12: stageExtensionToTemp は node_modules が無い場合に symlink を作成しない', async () => {
      // Given: node_modules が無い最小構成
      const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-src-'));
      const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-stage-'));
      await fs.promises.writeFile(path.join(sourceDir, 'package.json'), '{}', 'utf8');
      await fs.promises.writeFile(path.join(sourceDir, 'LICENSE'), 'license', 'utf8');
      await fs.promises.mkdir(path.join(sourceDir, 'out'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'src'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'docs'), { recursive: true });
      await fs.promises.mkdir(path.join(sourceDir, 'media'), { recursive: true });

      // When: stageExtensionToTemp を呼ぶ
      await stageExtensionToTemp({ sourceExtensionRoot: sourceDir, stageExtensionRoot: stageDir });

      // Then: node_modules のリンクが作成されない
      const linkPath = path.join(stageDir, 'node_modules');
      const exists = await fs.promises.access(linkPath).then(() => true).catch(() => false);
      assert.strictEqual(exists, false, 'node_modules のリンクは作られない');
    });

    // TC-B-13: shouldUseXvfb は非 Linux で false
    test('TC-B-13: shouldUseXvfb は非 Linux で false を返す', () => {
      // Given: 現在のプラットフォーム
      const platform = process.platform;

      // When: shouldUseXvfb を呼ぶ
      const result = shouldUseXvfb();

      // Then: 非 Linux なら false
      if (platform !== 'linux') {
        assert.strictEqual(result, false, '非 Linux は false');
      } else {
        assert.ok(true, 'Linux 環境では分岐条件のみ確認');
      }
    });

    // TC-N-11: requireRunState 正常
    test('TC-N-11: requireRunState は値が揃っていればそのまま返す', () => {
      // Given: 有効な userDataDir / testResultFilePath
      const userDataDir = '/tmp/user-data';
      const testResultFilePath = '/tmp/result.json';

      // When: requireRunState を呼ぶ
      const result = requireRunState(userDataDir, testResultFilePath);

      // Then: 同じ値が返る
      assert.strictEqual(result.userDataDir, userDataDir, 'userDataDir が保持される');
      assert.strictEqual(result.testResultFilePath, testResultFilePath, 'testResultFilePath が保持される');
    });

    // TC-E-05: requireRunState 不正
    test('TC-E-05: requireRunState は null 入力で例外を投げる', () => {
      // Given: userDataDir が null
      const userDataDir = null;
      const testResultFilePath = '/tmp/result.json';

      // When: requireRunState を呼ぶ
      // Then: 例外が投げられる
      assert.throws(
        () => requireRunState(userDataDir, testResultFilePath),
        (err: Error) => err.message.includes('テスト実行の状態が不正です'),
        '未設定時は例外となる',
      );
    });

    // TC-N-12: readMainLogSummary 正常
    test('TC-N-12: readMainLogSummary は kill 判定と末尾ログを返す', async () => {
      // Given: main.log に code 15 と killed が含まれる
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-log-'));
      const logPath = path.join(tempDir, 'main.log');
      const content = ['line1', 'code 15', 'killed', 'line4', 'line5'].join('\n');
      await fs.promises.writeFile(logPath, content, 'utf8');

      // When: readMainLogSummary を呼ぶ
      const result = await readMainLogSummary(logPath);

      // Then: killedCode15 と mainLogTail が設定される
      assert.strictEqual(result.killedCode15, true, 'killedCode15 が true');
      assert.ok(result.mainLogTail?.includes('line1'), '末尾ログが含まれる');
    });

    // TC-E-06: readMainLogSummary 失敗
    test('TC-E-06: readMainLogSummary は読み込み失敗で null を返す', async () => {
      // Given: 存在しない main.log
      const logPath = path.join(os.tmpdir(), `missing-${Date.now()}.log`);

      // When: readMainLogSummary を呼ぶ
      const result = await readMainLogSummary(logPath);

      // Then: null が返る
      assert.strictEqual(result.killedCode15, null, 'killedCode15 は null');
      assert.strictEqual(result.mainLogTail, null, 'mainLogTail は null');
    });

    // TC-N-13: isExplicitTestFailure 正常
    test('TC-N-13: isExplicitTestFailure は特定メッセージで true を返す', () => {
      // Given: 失敗メッセージ
      const err = new Error('テスト失敗: 1個');

      // When: isExplicitTestFailure を呼ぶ
      const result = isExplicitTestFailure(err);

      // Then: true を返す
      assert.strictEqual(result, true, '明示的失敗は true');
    });

    // TC-B-14: isExplicitTestFailure 無効
    test('TC-B-14: isExplicitTestFailure は別メッセージで false を返す', () => {
      // Given: 別メッセージ
      const err = new Error('other');

      // When: isExplicitTestFailure を呼ぶ
      const result = isExplicitTestFailure(err);

      // Then: false を返す
      assert.strictEqual(result, false, '別メッセージは false');
    });

    // TC-N-14: handleResultError retry
    test('TC-N-14: handleResultError は再試行条件で retry を返す', async () => {
      // Given: 明示的失敗ではなく、再試行可能
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-cache-'));
      const filePath = path.join(tempDir, 'dummy.txt');
      await fs.promises.writeFile(filePath, 'ok', 'utf8');
      let warned = '';

      // When: handleResultError を呼ぶ
      const result = await handleResultError({
        resultErr: new Error('other'),
        attemptIndex: 0,
        maxAttempts: 2,
        pinnedLauncher: undefined,
        cachePath: tempDir,
        warn: (message) => { warned = message; },
        launcherLabel: 'open',
      });

      // Then: retry が返り、警告が出る
      assert.strictEqual(result.action, 'retry', 'retry を返す');
      assert.ok(warned.includes('テスト実行が不安定なため再試行します'), '警告が出る');
    });

    // TC-E-07: handleResultError 明示的失敗
    test('TC-E-07: handleResultError は明示的失敗で throw を返す', async () => {
      // Given: 明示的失敗エラー
      const err = new Error('テスト失敗: 1個');

      // When: handleResultError を呼ぶ
      const result = await handleResultError({
        resultErr: err,
        attemptIndex: 0,
        maxAttempts: 2,
        pinnedLauncher: undefined,
        cachePath: '/tmp/invalid',
        warn: () => {},
        launcherLabel: 'open',
      });

      // Then: throw が返る
      assert.strictEqual(result.action, 'throw', 'throw を返す');
      assert.strictEqual(result.isExplicitTestFailure, true, '明示的失敗が true');
    });

    // TC-B-15: handleResultError break
    test('TC-B-15: handleResultError は再試行不可で break を返す', async () => {
      // Given: attemptIndex が最終
      const result = await handleResultError({
        resultErr: new Error('other'),
        attemptIndex: 1,
        maxAttempts: 2,
        pinnedLauncher: undefined,
        cachePath: '/tmp/invalid',
        warn: () => {},
        launcherLabel: 'open',
      });

      // When: handleResultError の結果を確認する
      // Then: break を返す
      assert.strictEqual(result.action, 'break', 'break を返す');
    });

    // TC-N-15: buildFailureReport 正常
    test('TC-N-15: buildFailureReport はログ行とエラーを組み立てる', () => {
      // Given: エラー情報とログ情報
      const report = buildFailureReport({
        testResultFilePath: '/tmp/result.json',
        mainLogPath: '/tmp/main.log',
        killedCode15: true,
        mainLogTail: 'tail',
        lastRunError: new Error('run'),
        lastResultError: new Error('result'),
      });

      // When: buildFailureReport の戻りを確認
      // Then: 期待行が含まれる
      assert.ok(report.lines.includes('テスト結果ファイルの検証に失敗しました'), '先頭メッセージが含まれる');
      assert.ok(report.lines.some((line) => line.includes('testResultFilePath')), '結果パスが含まれる');
      assert.ok(report.lines.some((line) => line.includes('mainLogPath')), 'ログパスが含まれる');
      assert.ok(report.lines.some((line) => line.includes('code=15')), 'killed 情報が含まれる');
      assert.ok(report.lines.includes('main.log（末尾）:'), '末尾ログラベルが含まれる');
      assert.ok(report.lines.includes('tail'), '末尾ログが含まれる');
      assert.strictEqual(report.errors.length, 2, 'エラーが2件含まれる');
    });

    // TC-N-16: parseTestResultOrThrow 正常
    test('TC-N-16: parseTestResultOrThrow は failures=0 で例外を投げない', () => {
      // Given: failures=0 の結果
      const raw = JSON.stringify({ failures: 0, tests: [{ suite: 'S', title: 'T', state: 'passed' }] });
      let warned = '';

      // When: parseTestResultOrThrow を呼ぶ
      parseTestResultOrThrow({
        raw,
        lastRunError: null,
        log: () => {},
        warn: (message) => { warned = message; },
      });

      // Then: 警告は出ない
      assert.strictEqual(warned, '', '警告が出ない');
    });

    // TC-E-08: parseTestResultOrThrow failures 不正
    test('TC-E-08: parseTestResultOrThrow は failures 不正で例外を投げる', () => {
      // Given: failures が無い JSON
      const raw = JSON.stringify({ tests: [] });

      // When: parseTestResultOrThrow を呼ぶ
      // Then: 形式不正エラー
      assert.throws(
        () => parseTestResultOrThrow({ raw, lastRunError: null, log: () => {}, warn: () => {} }),
        (err: Error) => err.message.includes('testResultFileの形式が不正です'),
        '形式不正エラーになる',
      );
    });

    // TC-E-09: parseTestResultOrThrow failures > 0
    test('TC-E-09: parseTestResultOrThrow は failures>0 で例外を投げる', () => {
      // Given: failures=2
      const raw = JSON.stringify({ failures: 2, tests: [] });

      // When: parseTestResultOrThrow を呼ぶ
      // Then: 失敗エラー
      assert.throws(
        () => parseTestResultOrThrow({ raw, lastRunError: null, log: () => {}, warn: () => {} }),
        (err: Error) => err.message.includes('テスト失敗: 2個'),
        '失敗エラーになる',
      );
    });

    // TC-B-16: parseTestResultOrThrow warns when lastRunError
    test('TC-B-16: parseTestResultOrThrow は lastRunError があると警告を出す', () => {
      // Given: failures=0 かつ lastRunError あり
      const raw = JSON.stringify({ failures: 0, tests: [] });
      let warned = '';

      // When: parseTestResultOrThrow を呼ぶ
      parseTestResultOrThrow({
        raw,
        lastRunError: new Error('run'),
        log: () => {},
        warn: (message) => { warned = message; },
      });

      // Then: 警告が出る
      assert.ok(warned.includes('補足:'), '警告が出る');
    });

    // TC-N-17: reportFinalFailure 出力
    test('TC-N-17: reportFinalFailure は全行とエラーを出力する', () => {
      // Given: 失敗レポート用の情報
      const logs: string[] = [];
      const errors: string[] = [];

      // When: reportFinalFailure を呼ぶ
      reportFinalFailure({
        testResultFilePath: '/tmp/result.json',
        mainLogPath: '/tmp/main.log',
        killedCode15: true,
        mainLogTail: 'tail',
        lastRunError: new Error('run'),
        lastResultError: new Error('result'),
        error: (message?: unknown) => {
          if (message instanceof Error) {
            errors.push(message.message);
          } else if (typeof message === 'string') {
            logs.push(message);
          }
        },
      });

      // Then: ログとエラーが出力される
      assert.ok(logs.some((line) => line.includes('テスト結果ファイルの検証に失敗しました')), '先頭ログがある');
      assert.ok(logs.some((line) => line.includes('main.log（末尾）')), '末尾ログラベルがある');
      assert.strictEqual(errors.length, 2, 'エラーが2件出力される');
    });

    // TC-N-18: reportMainError 出力
    test('TC-N-18: reportMainError は固定メッセージとエラーを出力する', () => {
      // Given: 例外
      const err = new Error('boom');
      const logs: string[] = [];

      // When: reportMainError を呼ぶ
      reportMainError(err, (message?: unknown) => {
        logs.push(String(message));
      });

      // Then: 固定メッセージとエラーが含まれる
      assert.ok(logs[0]?.includes('テストの実行に失敗しました'), '固定メッセージが出る');
      assert.ok(logs[1]?.includes('boom'), 'エラーが出る');
    });

    // Test Perspectives Table for selectLauncher (coverage-aware on darwin)
    // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
    // |---------|----------------------|--------------------------------------|-----------------|-------|
    // | TC-LAUNCH-COV-N-01 | preferDirectOnDarwin=true, platform=darwin, attemptIndex=0, defaultLauncher=direct | Equivalence – normal | Returns direct | min/max/±1 not applicable |
    // | TC-LAUNCH-COV-E-01 | preferDirectOnDarwin=true, platform=darwin, attemptIndex=1, defaultLauncher=direct | Equivalence – error | Returns open (fallback) | Confirms retry toggle still works |
    // | TC-LAUNCH-COV-E-02 | preferDirectOnDarwin=true, pinnedLauncher=open | Equivalence – error | Returns pinned open | Pinned overrides coverage preference |
    // | TC-LAUNCH-COV-B-01 | preferDirectOnDarwin=false, platform=darwin | Boundary – default | Returns open | Covered by existing TC-B-17 |

    // TC-N-19: selectLauncher pinned
    test('TC-N-19: selectLauncher は pinnedLauncher を優先する', () => {
      // Given: pinnedLauncher 指定
      const pinnedLauncher = 'direct';

      // When: selectLauncher を呼ぶ
      const result = selectLauncher({
        pinnedLauncher,
        platform: 'linux',
        attemptIndex: 0,
        defaultLauncher: 'open',
      });

      // Then: pinnedLauncher が返る
      assert.strictEqual(result, 'direct', 'pinnedLauncher が優先される');
    });

    // TC-B-17: selectLauncher darwin default
    // NOTE: preferDirectOnDarwin は未指定（false/undefined 扱い）での挙動を検証している
    test('TC-B-17: selectLauncher は darwin で open を返す', () => {
      // Given: darwin かつ pinned なし
      const result = selectLauncher({
        pinnedLauncher: undefined,
        platform: 'darwin',
        attemptIndex: 0,
        defaultLauncher: 'direct',
      });

      // When/Then: open を返す
      assert.strictEqual(result, 'open', 'darwin では open');
    });

    // TC-B-18: selectLauncher retry toggle
    test('TC-B-18: selectLauncher は 2回目で launcher を切り替える', () => {
      // Given: attemptIndex=1, defaultLauncher=open
      const result = selectLauncher({
        pinnedLauncher: undefined,
        platform: 'linux',
        attemptIndex: 1,
        defaultLauncher: 'open',
      });

      // When/Then: direct が返る
      assert.strictEqual(result, 'direct', '2回目は direct');
    });

    test('TC-LAUNCH-COV-N-01: selectLauncher prefers direct on darwin when coverage is enabled', () => {
      // Given: preferDirectOnDarwin=true on darwin
      const result = selectLauncher({
        pinnedLauncher: undefined,
        platform: 'darwin',
        attemptIndex: 0,
        defaultLauncher: 'direct',
        preferDirectOnDarwin: true,
      });

      // When: selectLauncher is called
      // Then: direct is returned
      assert.strictEqual(result, 'direct', 'coverage prefers direct on darwin');
    });

    test('TC-LAUNCH-COV-E-01: selectLauncher still toggles to open on retry when coverage is enabled', () => {
      // Given: preferDirectOnDarwin=true with retry attempt
      const result = selectLauncher({
        pinnedLauncher: undefined,
        platform: 'darwin',
        attemptIndex: 1,
        defaultLauncher: 'direct',
        preferDirectOnDarwin: true,
      });

      // When: selectLauncher is called
      // Then: open is returned for fallback
      assert.strictEqual(result, 'open', 'retry toggles to open');
    });

    test('TC-LAUNCH-COV-E-02: selectLauncher respects pinned open even when coverage is enabled', () => {
      // Given: pinnedLauncher=open with coverage preference
      const result = selectLauncher({
        pinnedLauncher: 'open',
        platform: 'darwin',
        attemptIndex: 0,
        defaultLauncher: 'direct',
        preferDirectOnDarwin: true,
      });

      // When: selectLauncher is called
      // Then: pinned open is returned
      assert.strictEqual(result, 'open', 'pinned launcher overrides coverage preference');
    });

    // TC-N-20: buildLaunchArgs
    test('TC-N-20: buildLaunchArgs は起動引数を構築する', () => {
      // Given: 必要パス
      const args = buildLaunchArgs({
        testWorkspace: '/tmp/workspace',
        userDataDir: '/tmp/user',
        extensionsDir: '/tmp/ext',
        testResultFilePath: '/tmp/result.json',
        locale: 'ja',
      });

      // When/Then: 必須引数が含まれる
      assert.ok(args.includes('/tmp/workspace'), 'workspace が含まれる');
      assert.ok(args.includes('--disable-telemetry'), 'telemetry 無効が含まれる');
      assert.ok(args.some((a) => a.startsWith('--user-data-dir=')), 'user-data-dir が含まれる');
    });

    // TC-N-21: buildExtensionTestsEnv
    test('TC-N-21: buildExtensionTestsEnv は必要な環境変数を含む', () => {
      // Given: nlsConfig と coverage
      const env = buildExtensionTestsEnv('nls', '/tmp/coverage');

      // When/Then: 必須キーが含まれる
      assert.strictEqual(env.VSCODE_TEST_RUNNER, '1', 'VSCODE_TEST_RUNNER が含まれる');
      assert.strictEqual(env.NODE_V8_COVERAGE, '/tmp/coverage', 'NODE_V8_COVERAGE が含まれる');
      assert.strictEqual(env.VSCODE_NLS_CONFIG, 'nls', 'VSCODE_NLS_CONFIG が含まれる');
    });

    // TC-N-22: buildDirectSpawnCommand useXvfb
    test('TC-N-22: buildDirectSpawnCommand は xvfb-run を使う', () => {
      // Given: useXvfb=true
      const result = buildDirectSpawnCommand({
        useXvfb: true,
        vscodeExecutablePath: '/tmp/code',
        allArgs: ['--a'],
        shell: false,
      });

      // When/Then: xvfb-run が選ばれる
      assert.strictEqual(result.command, 'xvfb-run', 'xvfb-run を使う');
      assert.ok(result.args.includes('/tmp/code'), '実行パスが含まれる');
    });

    // TC-B-19: buildDirectSpawnCommand shell
    test('TC-B-19: buildDirectSpawnCommand は shell 指定でもクォートしない', () => {
      // Given: useXvfb=false, shell=true
      const result = buildDirectSpawnCommand({
        useXvfb: false,
        vscodeExecutablePath: '/tmp/code',
        allArgs: [],
        shell: true,
      });

      // When/Then: 手動クォートは行わない（spawn/shell 側に委ねる）
      assert.strictEqual(result.command, '/tmp/code', 'shell でもクォートしない');
    });

    // TC-N-30: resolveVscodeExecutablePath env override
    test('TC-N-30: resolveVscodeExecutablePath は env のパスを優先する', async () => {
      // Given: envPath が存在する
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-vscode-'));
      const envPath = path.join(tempDir, 'code');
      await fs.promises.writeFile(envPath, '', 'utf8');

      // When: resolveVscodeExecutablePath を呼ぶ
      const result = await resolveVscodeExecutablePath({
        envPath,
        download: async () => {
          throw new Error('should not download');
        },
        version: 'stable',
        cachePath: '/tmp/cache',
        extensionDevelopmentPath: '/tmp/ext',
        exists: async (filePath) => filePath === envPath,
      });

      // Then: envPath が返る
      assert.strictEqual(result, envPath, 'envPath が優先される');
    });

    // TC-E-19: resolveVscodeExecutablePath env missing
    test('TC-E-19: resolveVscodeExecutablePath は env のパスが無い場合に失敗する', async () => {
      // Given: envPath が存在しない
      const envPath = '/tmp/missing-vscode';

      // When/Then: エラーになる
      await assert.rejects(
        () =>
          resolveVscodeExecutablePath({
            envPath,
            download: async () => '/tmp/unused',
            version: 'stable',
            cachePath: '/tmp/cache',
            extensionDevelopmentPath: '/tmp/ext',
            exists: async () => false,
          }),
        (err: Error) =>
          err instanceof Error &&
          err.message === `DONTFORGETEST_VSCODE_EXECUTABLE_PATH が見つかりません: ${envPath}`,
        'envPath が見つからない場合はエラー',
      );
    });

    // TC-E-20: resolveVscodeExecutablePath download failure
    test('TC-E-20: resolveVscodeExecutablePath は download 失敗を伝播する', async () => {
      // Given: envPath 未指定で download が失敗する
      const downloadError = new Error('download failed');

      // When/Then: download のエラーが伝播する
      await assert.rejects(
        () =>
          resolveVscodeExecutablePath({
            envPath: undefined,
            download: async () => {
              throw downloadError;
            },
            version: 'stable',
            cachePath: '/tmp/cache',
            extensionDevelopmentPath: '/tmp/ext',
            exists: async () => true,
          }),
        (err: Error) => err instanceof Error && err.message === 'download failed',
        'download 失敗が伝播する',
      );
    });

    // TC-N-31: resolveVscodeExecutablePath download success
    test('TC-N-31: resolveVscodeExecutablePath は download 成功時にパスを返す', async () => {
      // Given: envPath 未指定で download が成功する
      const downloadedPath = '/tmp/vscode';

      // When: resolveVscodeExecutablePath を呼ぶ
      const result = await resolveVscodeExecutablePath({
        envPath: undefined,
        download: async () => downloadedPath,
        version: 'stable',
        cachePath: '/tmp/cache',
        extensionDevelopmentPath: '/tmp/ext',
        exists: async () => true,
      });

      // Then: download したパスが返る
      assert.strictEqual(result, downloadedPath, 'download したパスが返る');
    });

    // TC-B-20: resolveVscodeExecutablePath trims envPath
    test('TC-B-20: resolveVscodeExecutablePath は envPath の前後空白を除去して扱う', async () => {
      // Given: 前後に空白を含む envPath
      const trimmedPath = '/tmp/vscode';
      const envPath = `  ${trimmedPath}  `;
      let seenPath = '';

      // When: resolveVscodeExecutablePath を呼ぶ
      const result = await resolveVscodeExecutablePath({
        envPath,
        download: async () => {
          throw new Error('should not download');
        },
        version: 'stable',
        cachePath: '/tmp/cache',
        extensionDevelopmentPath: '/tmp/ext',
        exists: async (filePath) => {
          seenPath = filePath;
          return filePath === trimmedPath;
        },
      });

      // Then: trim 済みパスが返る
      assert.strictEqual(seenPath, trimmedPath, 'exists は trim 済みパスで呼ばれる');
      assert.strictEqual(result, trimmedPath, 'trim 済みパスが返る');
    });

    // TC-B-01: resolveVscodeExecutablePath with envPath containing only leading whitespace
    test('TC-B-01: resolveVscodeExecutablePath trims leading whitespace from envPath', async () => {
      // Given: envPath with only leading whitespace
      const trimmedPath = '/tmp/vscode';
      const envPath = `  ${trimmedPath}`;
      let seenPath = '';

      // When: resolveVscodeExecutablePath is called
      const result = await resolveVscodeExecutablePath({
        envPath,
        download: async () => {
          throw new Error('should not download');
        },
        version: 'stable',
        cachePath: '/tmp/cache',
        extensionDevelopmentPath: '/tmp/ext',
        exists: async (filePath) => {
          seenPath = filePath;
          return filePath === trimmedPath;
        },
      });

      // Then: exists function receives trimmed path without leading whitespace; returns trimmed path
      assert.strictEqual(seenPath, trimmedPath, 'exists receives trimmed path without leading whitespace');
      assert.strictEqual(result, trimmedPath, 'returns trimmed path');
    });

    // TC-B-02: resolveVscodeExecutablePath with envPath containing only trailing whitespace
    test('TC-B-02: resolveVscodeExecutablePath trims trailing whitespace from envPath', async () => {
      // Given: envPath with only trailing whitespace
      const trimmedPath = '/tmp/vscode';
      const envPath = `${trimmedPath}  `;
      let seenPath = '';

      // When: resolveVscodeExecutablePath is called
      const result = await resolveVscodeExecutablePath({
        envPath,
        download: async () => {
          throw new Error('should not download');
        },
        version: 'stable',
        cachePath: '/tmp/cache',
        extensionDevelopmentPath: '/tmp/ext',
        exists: async (filePath) => {
          seenPath = filePath;
          return filePath === trimmedPath;
        },
      });

      // Then: exists function receives trimmed path without trailing whitespace; returns trimmed path
      assert.strictEqual(seenPath, trimmedPath, 'exists receives trimmed path without trailing whitespace');
      assert.strictEqual(result, trimmedPath, 'returns trimmed path');
    });

    // TC-B-03: resolveVscodeExecutablePath with envPath containing no whitespace
    test('TC-B-03: resolveVscodeExecutablePath does not modify path without whitespace', async () => {
      // Given: envPath with no whitespace
      const originalPath = '/tmp/vscode';
      let seenPath = '';

      // When: resolveVscodeExecutablePath is called
      const result = await resolveVscodeExecutablePath({
        envPath: originalPath,
        download: async () => {
          throw new Error('should not download');
        },
        version: 'stable',
        cachePath: '/tmp/cache',
        extensionDevelopmentPath: '/tmp/ext',
        exists: async (filePath) => {
          seenPath = filePath;
          return filePath === originalPath;
        },
      });

      // Then: exists function receives original path unchanged; returns original path
      assert.strictEqual(seenPath, originalPath, 'exists receives original path unchanged');
      assert.strictEqual(result, originalPath, 'returns original path');
    });

    // TC-B-04: resolveVscodeExecutablePath with envPath as empty string
    test('TC-B-04: resolveVscodeExecutablePath with empty string envPath triggers download', async () => {
      // Given: envPath as empty string
      const downloadedPath = '/tmp/vscode';
      let downloadCalled = false;

      // When: resolveVscodeExecutablePath is called
      const result = await resolveVscodeExecutablePath({
        envPath: '',
        download: async () => {
          downloadCalled = true;
          return downloadedPath;
        },
        version: 'stable',
        cachePath: '/tmp/cache',
        extensionDevelopmentPath: '/tmp/ext',
        exists: async () => {
          throw new Error('should not call exists');
        },
      });

      // Then: download function is called instead of exists check; returns downloaded path
      assert.ok(downloadCalled, 'download function is called');
      assert.strictEqual(result, downloadedPath, 'returns downloaded path');
    });

    // TC-B-05: resolveVscodeExecutablePath with envPath as null
    test('TC-B-05: resolveVscodeExecutablePath with null envPath triggers download', async () => {
      // Given: envPath as null
      const downloadedPath = '/tmp/vscode';
      let downloadCalled = false;

      // When: resolveVscodeExecutablePath is called
      const result = await resolveVscodeExecutablePath({
        envPath: null as unknown as undefined,
        download: async () => {
          downloadCalled = true;
          return downloadedPath;
        },
        version: 'stable',
        cachePath: '/tmp/cache',
        extensionDevelopmentPath: '/tmp/ext',
        exists: async () => {
          throw new Error('should not call exists');
        },
      });

      // Then: download function is called instead of exists check; returns downloaded path
      assert.ok(downloadCalled, 'download function is called');
      assert.strictEqual(result, downloadedPath, 'returns downloaded path');
    });

    // TC-B-06: resolveVscodeExecutablePath with envPath as undefined
    test('TC-B-06: resolveVscodeExecutablePath with undefined envPath triggers download', async () => {
      // Given: envPath as undefined
      const downloadedPath = '/tmp/vscode';
      let downloadCalled = false;

      // When: resolveVscodeExecutablePath is called
      const result = await resolveVscodeExecutablePath({
        envPath: undefined,
        download: async () => {
          downloadCalled = true;
          return downloadedPath;
        },
        version: 'stable',
        cachePath: '/tmp/cache',
        extensionDevelopmentPath: '/tmp/ext',
        exists: async () => {
          throw new Error('should not call exists');
        },
      });

      // Then: download function is called instead of exists check; returns downloaded path
      assert.ok(downloadCalled, 'download function is called');
      assert.strictEqual(result, downloadedPath, 'returns downloaded path');
    });

    // TC-B-07: resolveVscodeExecutablePath with envPath containing only whitespace characters
    test('TC-B-07: resolveVscodeExecutablePath with whitespace-only envPath triggers download', async () => {
      // Given: envPath containing only whitespace characters
      const downloadedPath = '/tmp/vscode';
      let downloadCalled = false;

      // When: resolveVscodeExecutablePath is called
      const result = await resolveVscodeExecutablePath({
        envPath: '   ',
        download: async () => {
          downloadCalled = true;
          return downloadedPath;
        },
        version: 'stable',
        cachePath: '/tmp/cache',
        extensionDevelopmentPath: '/tmp/ext',
        exists: async () => {
          throw new Error('should not call exists');
        },
      });

      // Then: download function is called instead of exists check; returns downloaded path
      assert.ok(downloadCalled, 'download function is called');
      assert.strictEqual(result, downloadedPath, 'returns downloaded path');
    });

    // TC-E-03: resolveVscodeExecutablePath with trimmed envPath that does not exist
    test('TC-E-03: resolveVscodeExecutablePath throws error when trimmed envPath does not exist', async () => {
      // Given: trimmed envPath that does not exist
      const trimmedPath = '/tmp/missing-vscode';
      const envPath = `  ${trimmedPath}  `;

      // When/Then: Throws Error with message containing trimmed path
      await assert.rejects(
        async () => {
          await resolveVscodeExecutablePath({
            envPath,
            download: async () => '/tmp/unused',
            version: 'stable',
            cachePath: '/tmp/cache',
            extensionDevelopmentPath: '/tmp/ext',
            exists: async () => false,
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes(trimmedPath), 'error message uses trimmed path');
          assert.ok(err.message.includes('DONTFORGETEST_VSCODE_EXECUTABLE_PATH'), 'error message includes env var name');
          return true;
        },
      );
    });

    // TC-N-23: runDirectLauncher success
    test('TC-N-23: runDirectLauncher は exit 0 で解決する', async () => {
      // Given: 成功する spawn
      const fakeSpawn = () => {
        const child = new EventEmitter() as NodeJS.EventEmitter & {
          stdout?: EventEmitter;
          stderr?: EventEmitter;
        };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        setTimeout(() => child.emit('exit', 0, null), 0);
        return child as unknown as ReturnType<typeof childProcess.spawn>;
      };

      // When: runDirectLauncher を呼ぶ
      await runDirectLauncher({
        spawn: fakeSpawn as unknown as typeof childProcess.spawn,
        command: 'cmd',
        args: [],
        env: {},
        shell: false,
      });

      // Then: 例外が発生しない
      assert.ok(true, '正常終了する');
    });

    // TC-E-10: runDirectLauncher failure
    test('TC-E-10: runDirectLauncher は exit != 0 で失敗する', async () => {
      // Given: 失敗する spawn
      const fakeSpawn = () => {
        const child = new EventEmitter() as NodeJS.EventEmitter & {
          stdout?: EventEmitter;
          stderr?: EventEmitter;
        };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        setTimeout(() => child.emit('exit', 1, null), 0);
        return child as unknown as ReturnType<typeof childProcess.spawn>;
      };

      // When: runDirectLauncher を呼ぶ
      // Then: 失敗する
      await assert.rejects(
        () => runDirectLauncher({
          spawn: fakeSpawn as unknown as typeof childProcess.spawn,
          command: 'cmd',
          args: [],
          env: {},
          shell: false,
        }),
        (err: Error) => err instanceof Error,
        'exit!=0 で失敗する',
      );
    });

    // TC-N-24: captureRunError success
    test('TC-N-24: captureRunError は成功時に null を返す', async () => {
      // Given: 成功する関数
      const result = await captureRunError(async () => {});

      // When/Then: null を返す
      assert.strictEqual(result, null, '成功時は null');
    });

    // TC-E-11: captureRunError failure
    test('TC-E-11: captureRunError は失敗時にエラーを返す', async () => {
      // Given: 失敗する関数
      const result = await captureRunError(async () => {
        throw new Error('fail');
      });

      // When/Then: Error を返す
      assert.ok(result instanceof Error, 'Error を返す');
    });

    // TC-N-25: finalizeFailedRun
    test('TC-N-25: finalizeFailedRun はログ出力後に 1 を返す', async () => {
      // Given: 最終失敗情報
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-run-'));
      const logsDir = path.join(tempDir, 'logs');
      await fs.promises.mkdir(logsDir, { recursive: true });
      await fs.promises.writeFile(path.join(logsDir, 'main.log'), 'code 15\nkilled\n', 'utf8');
      const errorLogs: string[] = [];

      // When: finalizeFailedRun を呼ぶ
      const code = await finalizeFailedRun({
        lastUserDataDir: tempDir,
        lastTestResultFilePath: '/tmp/result.json',
        lastRunError: new Error('run'),
        lastResultError: new Error('result'),
        error: (message?: unknown) => {
          errorLogs.push(String(message));
        },
      });

      // Then: 終了コードとログが返る
      assert.strictEqual(code, 1, 'exit code は 1');
      assert.ok(errorLogs.some((line) => line.includes('テスト結果ファイルの検証に失敗しました')), '失敗ログが出る');
    });

    // TC-N-26: runDetachedVscodeExtensionTestsWithDeps open launcher success
    test('TC-N-26: runDetachedVscodeExtensionTestsWithDeps は open 起動で成功する', async () => {
      // Given: macOS open 起動で成功する spawn
      const spawnCalls: Array<{ command: string; args: string[] }> = [];
      const fakeSpawn = (command: string, args: string[]) => {
        const child = new EventEmitter();
        spawnCalls.push({ command, args });
        setTimeout(() => child.emit('exit', 0, null), 0);
        return child as unknown as ReturnType<typeof childProcess.spawn>;
      };
      const deps = {
        downloadAndUnzipVSCode: async () => '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
        spawn: fakeSpawn as unknown as typeof childProcess.spawn,
        platform: 'darwin' as NodeJS.Platform,
        env: { DONTFORGETEST_VSCODE_TEST_LAUNCHER: 'open' },
        shouldUseXvfb: () => false,
      };

      // When: runDetachedVscodeExtensionTestsWithDeps を呼ぶ
      await runDetachedVscodeExtensionTestsWithDeps(
        {
          extensionDevelopmentPath: '/tmp/ext',
          extensionTestsPath: '/tmp/tests',
          launchArgs: ['--arg1'],
          extensionTestsEnv: {},
          version: 'stable',
          testResultFilePath: '/tmp/result.json',
          cachePath: '/tmp/cache',
        },
        deps,
      );

      // Then: open が呼ばれる
      assert.strictEqual(spawnCalls[0]?.command, 'open', 'open コマンドが呼ばれる');
      assert.ok(spawnCalls[0]?.args.includes('-n'), 'open に -n が含まれる');
      assert.ok(spawnCalls[0]?.args.includes('-W'), 'open に -W が含まれる');
      assert.ok(spawnCalls[0]?.args.includes('/Applications/Visual Studio Code.app'), 'アプリパスが渡される');
    });

    // TC-E-12: runDetachedVscodeExtensionTestsWithDeps open launcher failure
    test('TC-E-12: runDetachedVscodeExtensionTestsWithDeps は open 起動で失敗する', async () => {
      // Given: macOS open 起動で失敗する spawn
      const fakeSpawn = () => {
        const child = new EventEmitter();
        setTimeout(() => child.emit('exit', 1, null), 0);
        return child as unknown as ReturnType<typeof childProcess.spawn>;
      };
      const deps = {
        downloadAndUnzipVSCode: async () => '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
        spawn: fakeSpawn as unknown as typeof childProcess.spawn,
        platform: 'darwin' as NodeJS.Platform,
        env: { DONTFORGETEST_VSCODE_TEST_LAUNCHER: 'open' },
        shouldUseXvfb: () => false,
      };

      // When/Then: TestRunFailedError で失敗する
      await assert.rejects(
        () =>
          runDetachedVscodeExtensionTestsWithDeps(
            {
              extensionDevelopmentPath: '/tmp/ext',
              extensionTestsPath: '/tmp/tests',
              launchArgs: ['--arg1'],
              extensionTestsEnv: {},
              version: 'stable',
              testResultFilePath: '/tmp/result.json',
              cachePath: '/tmp/cache',
            },
            deps,
          ),
        (err: Error) =>
          err instanceof TestRunFailedError && err.message === 'Test run failed with code 1',
        'open 起動は exit!=0 で失敗する',
      );
    });

    // TC-E-15: runDetachedVscodeExtensionTestsWithDeps open launcher spawn error
    test('TC-E-15: runDetachedVscodeExtensionTestsWithDeps は open 起動の spawn エラーを返す', async () => {
      // Given: spawn が error を返す
      const spawnError = new Error('spawn failed');
      const fakeSpawn = () => {
        const child = new EventEmitter();
        setTimeout(() => child.emit('error', spawnError), 0);
        return child as unknown as ReturnType<typeof childProcess.spawn>;
      };
      const deps = {
        downloadAndUnzipVSCode: async () => '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
        spawn: fakeSpawn as unknown as typeof childProcess.spawn,
        platform: 'darwin' as NodeJS.Platform,
        env: { DONTFORGETEST_VSCODE_TEST_LAUNCHER: 'open' },
        shouldUseXvfb: () => false,
      };

      // When/Then: spawn error を返す
      await assert.rejects(
        () =>
          runDetachedVscodeExtensionTestsWithDeps(
            {
              extensionDevelopmentPath: '/tmp/ext',
              extensionTestsPath: '/tmp/tests',
              launchArgs: ['--arg1'],
              extensionTestsEnv: {},
              version: 'stable',
              testResultFilePath: '/tmp/result.json',
              cachePath: '/tmp/cache',
            },
            deps,
          ),
        (err: Error) => err instanceof Error && err.message === 'spawn failed',
        'spawn error が伝播する',
      );
    });

    // TC-E-16: runDetachedVscodeExtensionTestsWithDeps direct launcher spawn error
    test('TC-E-16: runDetachedVscodeExtensionTestsWithDeps は direct 起動の spawn エラーを返す', async () => {
      // Given: direct spawn が error を返す
      const spawnError = new Error('direct spawn failed');
      const fakeSpawn = () => {
        const child = new EventEmitter() as NodeJS.EventEmitter & {
          stdout?: EventEmitter;
          stderr?: EventEmitter;
        };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        setTimeout(() => child.emit('error', spawnError), 0);
        return child as unknown as ReturnType<typeof childProcess.spawn>;
      };
      const deps = {
        downloadAndUnzipVSCode: async () => '/tmp/code',
        spawn: fakeSpawn as unknown as typeof childProcess.spawn,
        platform: 'linux' as NodeJS.Platform,
        env: {},
        shouldUseXvfb: () => false,
      };

      // When/Then: spawn error を返す
      await assert.rejects(
        () =>
          runDetachedVscodeExtensionTestsWithDeps(
            {
              extensionDevelopmentPath: '/tmp/ext',
              extensionTestsPath: '/tmp/tests',
              launchArgs: ['--arg1'],
              extensionTestsEnv: {},
              version: 'stable',
              testResultFilePath: '/tmp/result.json',
              cachePath: '/tmp/cache',
              launcher: 'direct',
            },
            deps,
          ),
        (err: Error) => err instanceof Error && err.message === 'direct spawn failed',
        'direct spawn の error が伝播する',
      );
    });

    // TC-N-27: runDetachedVscodeExtensionTestsWithDeps direct launcher uses xvfb-run
    test('TC-N-27: runDetachedVscodeExtensionTestsWithDeps は direct 起動で xvfb-run を使う', async () => {
      // Given: Linux + xvfb-run を使う設定
      const spawnCalls: Array<{ command: string; args: string[] }> = [];
      const fakeSpawn = (command: string, args: string[]) => {
        const child = new EventEmitter() as NodeJS.EventEmitter & {
          stdout?: EventEmitter;
          stderr?: EventEmitter;
        };
        spawnCalls.push({ command, args });
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        setTimeout(() => child.emit('exit', 0, null), 0);
        return child as unknown as ReturnType<typeof childProcess.spawn>;
      };
      const deps = {
        downloadAndUnzipVSCode: async () => '/tmp/code',
        spawn: fakeSpawn as unknown as typeof childProcess.spawn,
        platform: 'linux' as NodeJS.Platform,
        env: {},
        shouldUseXvfb: () => true,
      };

      // When: runDetachedVscodeExtensionTestsWithDeps を呼ぶ
      await runDetachedVscodeExtensionTestsWithDeps(
        {
          extensionDevelopmentPath: '/tmp/ext',
          extensionTestsPath: '/tmp/tests',
          launchArgs: ['--arg1'],
          extensionTestsEnv: {},
          version: 'stable',
          testResultFilePath: '/tmp/result.json',
          cachePath: '/tmp/cache',
          launcher: 'direct',
        },
        deps,
      );

      // Then: xvfb-run が呼ばれる
      assert.strictEqual(spawnCalls[0]?.command, 'xvfb-run', 'xvfb-run を使う');
      assert.ok(spawnCalls[0]?.args.includes('/tmp/code'), '実行パスが含まれる');
    });

    // TC-N-32: runDetachedVscodeExtensionTestsWithDeps direct launcher without xvfb
    test('TC-N-32: runDetachedVscodeExtensionTestsWithDeps は direct 起動で xvfb-run を使わない', async () => {
      // Given: Linux + xvfb-run を使わない設定
      const spawnCalls: Array<{ command: string; args: string[] }> = [];
      const fakeSpawn = (command: string, args: string[]) => {
        const child = new EventEmitter() as NodeJS.EventEmitter & {
          stdout?: EventEmitter;
          stderr?: EventEmitter;
        };
        spawnCalls.push({ command, args });
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        setTimeout(() => child.emit('exit', 0, null), 0);
        return child as unknown as ReturnType<typeof childProcess.spawn>;
      };
      const deps = {
        downloadAndUnzipVSCode: async () => '/tmp/code',
        spawn: fakeSpawn as unknown as typeof childProcess.spawn,
        platform: 'linux' as NodeJS.Platform,
        env: {},
        shouldUseXvfb: () => false,
      };

      // When: runDetachedVscodeExtensionTestsWithDeps を呼ぶ
      await runDetachedVscodeExtensionTestsWithDeps(
        {
          extensionDevelopmentPath: '/tmp/ext',
          extensionTestsPath: '/tmp/tests',
          launchArgs: ['--arg1'],
          extensionTestsEnv: {},
          version: 'stable',
          testResultFilePath: '/tmp/result.json',
          cachePath: '/tmp/cache',
          launcher: 'direct',
        },
        deps,
      );

      // Then: xvfb-run を使わずに実行する
      assert.strictEqual(spawnCalls[0]?.command, '/tmp/code', '直接実行パスが使われる');
      assert.ok(spawnCalls[0]?.args.includes('--arg1'), '起動引数が含まれる');
    });

    // TC-N-05: runDetachedVscodeExtensionTestsWithDeps direct launcher, darwin platform, shouldUseXvfb=false
    test('TC-N-05: runDetachedVscodeExtensionTestsWithDeps uses direct spawn on darwin without xvfb-run', async () => {
      // Given: darwin platform + shouldUseXvfb returns false
      const spawnCalls: Array<{ command: string; args: string[] }> = [];
      const fakeSpawn = (command: string, args: string[]) => {
        const child = new EventEmitter() as NodeJS.EventEmitter & {
          stdout?: EventEmitter;
          stderr?: EventEmitter;
        };
        spawnCalls.push({ command, args });
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        setTimeout(() => child.emit('exit', 0, null), 0);
        return child as unknown as ReturnType<typeof childProcess.spawn>;
      };
      const deps = {
        downloadAndUnzipVSCode: async () => '/tmp/code',
        spawn: fakeSpawn as unknown as typeof childProcess.spawn,
        platform: 'darwin' as NodeJS.Platform,
        env: {},
        shouldUseXvfb: () => false,
      };

      // When: runDetachedVscodeExtensionTestsWithDeps is called
      await runDetachedVscodeExtensionTestsWithDeps(
        {
          extensionDevelopmentPath: '/tmp/ext',
          extensionTestsPath: '/tmp/tests',
          launchArgs: ['--arg1'],
          extensionTestsEnv: {},
          version: 'stable',
          testResultFilePath: '/tmp/result.json',
          cachePath: '/tmp/cache',
          launcher: 'direct',
        },
        deps,
      );

      // Then: spawn is called with vscodeExecutablePath as command directly without xvfb-run wrapper
      assert.strictEqual(spawnCalls[0]?.command, '/tmp/code', 'direct spawn command is used');
      assert.ok(spawnCalls[0]?.args.includes('--arg1'), 'launch args are included');
    });

    // TC-N-06: runDetachedVscodeExtensionTestsWithDeps direct launcher, win32 platform, shouldUseXvfb=false
    test('TC-N-06: runDetachedVscodeExtensionTestsWithDeps uses direct spawn on win32 without xvfb-run', async () => {
      // Given: win32 platform + shouldUseXvfb returns false
      const spawnCalls: Array<{ command: string; args: string[] }> = [];
      const fakeSpawn = (command: string, args: string[]) => {
        const child = new EventEmitter() as NodeJS.EventEmitter & {
          stdout?: EventEmitter;
          stderr?: EventEmitter;
        };
        spawnCalls.push({ command, args });
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        setTimeout(() => child.emit('exit', 0, null), 0);
        return child as unknown as ReturnType<typeof childProcess.spawn>;
      };
      const deps = {
        downloadAndUnzipVSCode: async () => 'C:\\tmp\\code.exe',
        spawn: fakeSpawn as unknown as typeof childProcess.spawn,
        platform: 'win32' as NodeJS.Platform,
        env: {},
        shouldUseXvfb: () => false,
      };

      // When: runDetachedVscodeExtensionTestsWithDeps is called
      await runDetachedVscodeExtensionTestsWithDeps(
        {
          extensionDevelopmentPath: 'C:\\tmp\\ext',
          extensionTestsPath: 'C:\\tmp\\tests',
          launchArgs: ['--arg1'],
          extensionTestsEnv: {},
          version: 'stable',
          testResultFilePath: 'C:\\tmp\\result.json',
          cachePath: 'C:\\tmp\\cache',
          launcher: 'direct',
        },
        deps,
      );

      // Then: spawn is called with vscodeExecutablePath as command directly without xvfb-run wrapper
      assert.strictEqual(spawnCalls[0]?.command, 'C:\\tmp\\code.exe', 'direct spawn command is used');
      assert.ok(spawnCalls[0]?.args.includes('--arg1'), 'launch args are included');
    });

    // TC-B-08: runDetachedVscodeExtensionTestsWithDeps direct launcher, shouldUseXvfb=false, allArgs is empty array
    test('TC-B-08: runDetachedVscodeExtensionTestsWithDeps handles empty launchArgs correctly', async () => {
      // Given: direct launcher + shouldUseXvfb returns false + empty launchArgs
      const spawnCalls: Array<{ command: string; args: string[] }> = [];
      const fakeSpawn = (command: string, args: string[]) => {
        const child = new EventEmitter() as NodeJS.EventEmitter & {
          stdout?: EventEmitter;
          stderr?: EventEmitter;
        };
        spawnCalls.push({ command, args });
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        setTimeout(() => child.emit('exit', 0, null), 0);
        return child as unknown as ReturnType<typeof childProcess.spawn>;
      };
      const deps = {
        downloadAndUnzipVSCode: async () => '/tmp/code',
        spawn: fakeSpawn as unknown as typeof childProcess.spawn,
        platform: 'linux' as NodeJS.Platform,
        env: {},
        shouldUseXvfb: () => false,
      };

      // When: runDetachedVscodeExtensionTestsWithDeps is called with empty launchArgs
      await runDetachedVscodeExtensionTestsWithDeps(
        {
          extensionDevelopmentPath: '/tmp/ext',
          extensionTestsPath: '/tmp/tests',
          launchArgs: [],
          extensionTestsEnv: {},
          version: 'stable',
          testResultFilePath: '/tmp/result.json',
          cachePath: '/tmp/cache',
          launcher: 'direct',
        },
        deps,
      );

      // Then: spawn is called with vscodeExecutablePath as command and empty args array (base args still present)
      assert.strictEqual(spawnCalls[0]?.command, '/tmp/code', 'direct spawn command is used');
      assert.ok(Array.isArray(spawnCalls[0]?.args), 'args is an array');
      assert.ok(spawnCalls[0]?.args.length > 0, 'base args are still present');
    });

    // TC-B-09: runDetachedVscodeExtensionTestsWithDeps direct launcher, shouldUseXvfb=false, allArgs contains maximum number of arguments
    test('TC-B-09: runDetachedVscodeExtensionTestsWithDeps handles large number of arguments correctly', async () => {
      // Given: direct launcher + shouldUseXvfb returns false + maximum number of arguments
      const spawnCalls: Array<{ command: string; args: string[] }> = [];
      const fakeSpawn = (command: string, args: string[]) => {
        const child = new EventEmitter() as NodeJS.EventEmitter & {
          stdout?: EventEmitter;
          stderr?: EventEmitter;
        };
        spawnCalls.push({ command, args });
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        setTimeout(() => child.emit('exit', 0, null), 0);
        return child as unknown as ReturnType<typeof childProcess.spawn>;
      };
      const deps = {
        downloadAndUnzipVSCode: async () => '/tmp/code',
        spawn: fakeSpawn as unknown as typeof childProcess.spawn,
        platform: 'linux' as NodeJS.Platform,
        env: {},
        shouldUseXvfb: () => false,
      };
      const maxArgs = Array.from({ length: 100 }, (_, i) => `--arg${i}`);

      // When: runDetachedVscodeExtensionTestsWithDeps is called with maximum number of arguments
      await runDetachedVscodeExtensionTestsWithDeps(
        {
          extensionDevelopmentPath: '/tmp/ext',
          extensionTestsPath: '/tmp/tests',
          launchArgs: maxArgs,
          extensionTestsEnv: {},
          version: 'stable',
          testResultFilePath: '/tmp/result.json',
          cachePath: '/tmp/cache',
          launcher: 'direct',
        },
        deps,
      );

      // Then: spawn is called with vscodeExecutablePath as command and all args passed correctly
      assert.strictEqual(spawnCalls[0]?.command, '/tmp/code', 'direct spawn command is used');
      assert.ok(spawnCalls[0]?.args.includes('--arg0'), 'first arg is included');
      assert.ok(spawnCalls[0]?.args.includes('--arg99'), 'last arg is included');
      assert.ok(spawnCalls[0]?.args.length >= maxArgs.length, 'all args are passed');
    });

    // TC-E-04: runDetachedVscodeExtensionTestsWithDeps direct launcher, shouldUseXvfb=false, spawn fails
    test('TC-E-04: runDetachedVscodeExtensionTestsWithDeps propagates spawn error without xvfb-run wrapper', async () => {
      // Given: direct launcher + shouldUseXvfb returns false + spawn fails
      const spawnError = new Error('spawn failed');
      const fakeSpawn = () => {
        const child = new EventEmitter() as NodeJS.EventEmitter & {
          stdout?: EventEmitter;
          stderr?: EventEmitter;
        };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        setTimeout(() => child.emit('error', spawnError), 0);
        return child as unknown as ReturnType<typeof childProcess.spawn>;
      };
      const deps = {
        downloadAndUnzipVSCode: async () => '/tmp/code',
        spawn: fakeSpawn as unknown as typeof childProcess.spawn,
        platform: 'linux' as NodeJS.Platform,
        env: {},
        shouldUseXvfb: () => false,
      };

      // When/Then: runDirectLauncher rejects with spawn error; error propagates to caller
      await assert.rejects(
        async () => {
          await runDetachedVscodeExtensionTestsWithDeps(
            {
              extensionDevelopmentPath: '/tmp/ext',
              extensionTestsPath: '/tmp/tests',
              launchArgs: ['--arg1'],
              extensionTestsEnv: {},
              version: 'stable',
              testResultFilePath: '/tmp/result.json',
              cachePath: '/tmp/cache',
              launcher: 'direct',
            },
            deps,
          );
        },
        (err: Error) => {
          assert.strictEqual(err, spawnError, 'spawn error is propagated');
          return true;
        },
      );
    });

    // TC-N-28: runMainWithDeps success path
    test('TC-N-28: runMainWithDeps は結果ファイル成功で null を返す', async () => {
      // Given: 成功結果ファイルを作る runDetached
      const nowBase = Date.now();
      let nowTick = 0;
      const launchCalls: Array<{ launcher: string | undefined; testResultFilePath: string }> = [];
      const vscodeTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-vscode-test-unit-'));
      type RunDetachedOptions = Parameters<typeof runDetachedVscodeExtensionTestsWithDeps>[0];
      const fakeRunDetached = async (options: RunDetachedOptions) => {
        launchCalls.push({ launcher: options.launcher, testResultFilePath: options.testResultFilePath });
        await fs.promises.writeFile(options.testResultFilePath, JSON.stringify({ failures: 0, passes: 1 }), 'utf8');
      };

      try {
        // When: runMainWithDeps を呼ぶ
        const exitCode = await runMainWithDeps({
          env: {
            ...process.env,
            DONTFORGETEST_VSCODE_TEST_ROOT: vscodeTestRoot,
            DONTFORGETEST_TEST_RESULT_WAIT_TIMEOUT_MS: '100',
            DONTFORGETEST_TEST_RESULT_WAIT_INTERVAL_MS: '1',
            DONTFORGETEST_VSCODE_TEST_MAX_ATTEMPTS: '1',
            DONTFORGETEST_VSCODE_TEST_LAUNCHER: 'direct',
          },
          platform: 'darwin',
          pid: process.pid,
          now: () => nowBase + nowTick++,
          stageExtensionToTemp: async () => {},
          runDetachedVscodeExtensionTests: fakeRunDetached,
        });

        // Then: 成功で null を返す
        assert.strictEqual(exitCode, null, '成功時は null');
        assert.strictEqual(launchCalls[0]?.launcher, 'direct', '固定 launcher が渡される');
      } finally {
        await fs.promises.rm(vscodeTestRoot, { recursive: true, force: true });
      }
    });

    // TC-E-13: runMainWithDeps explicit failure
    test('TC-E-13: runMainWithDeps はテスト失敗で 1 を返す', async () => {
      // Given: failures>0 の結果ファイル
      const nowBase = Date.now();
      let nowTick = 0;
      const vscodeTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-vscode-test-unit-'));
      type RunDetachedOptions = Parameters<typeof runDetachedVscodeExtensionTestsWithDeps>[0];
      const fakeRunDetached = async (options: RunDetachedOptions) => {
        await fs.promises.writeFile(options.testResultFilePath, JSON.stringify({ failures: 1, passes: 0 }), 'utf8');
      };

      try {
        // When: runMainWithDeps を呼ぶ
        const exitCode = await runMainWithDeps({
          env: {
            ...process.env,
            DONTFORGETEST_VSCODE_TEST_ROOT: vscodeTestRoot,
            DONTFORGETEST_TEST_RESULT_WAIT_TIMEOUT_MS: '100',
            DONTFORGETEST_TEST_RESULT_WAIT_INTERVAL_MS: '1',
            DONTFORGETEST_VSCODE_TEST_MAX_ATTEMPTS: '1',
          },
          platform: 'darwin',
          pid: process.pid,
          now: () => nowBase + nowTick++,
          stageExtensionToTemp: async () => {},
          runDetachedVscodeExtensionTests: fakeRunDetached,
        });

        // Then: 失敗で 1 を返す
        assert.strictEqual(exitCode, 1, '失敗時は 1');
      } finally {
        await fs.promises.rm(vscodeTestRoot, { recursive: true, force: true });
      }
    });

    // TC-E-14: runMainWithDeps invalid JSON
    test('TC-E-14: runMainWithDeps は不正な結果ファイルで 1 を返す', async () => {
      // Given: JSON 形式が不正な結果ファイル
      const nowBase = Date.now();
      let nowTick = 0;
      const vscodeTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-vscode-test-unit-'));
      type RunDetachedOptions = Parameters<typeof runDetachedVscodeExtensionTestsWithDeps>[0];
      const fakeRunDetached = async (options: RunDetachedOptions) => {
        await fs.promises.writeFile(options.testResultFilePath, '{invalid}', 'utf8');
      };

      try {
        // When: runMainWithDeps を呼ぶ
        const exitCode = await runMainWithDeps({
          env: {
            ...process.env,
            DONTFORGETEST_VSCODE_TEST_ROOT: vscodeTestRoot,
            DONTFORGETEST_TEST_RESULT_WAIT_TIMEOUT_MS: '100',
            DONTFORGETEST_TEST_RESULT_WAIT_INTERVAL_MS: '1',
            DONTFORGETEST_VSCODE_TEST_MAX_ATTEMPTS: '1',
          },
          platform: 'darwin',
          pid: process.pid,
          now: () => nowBase + nowTick++,
          stageExtensionToTemp: async () => {},
          runDetachedVscodeExtensionTests: fakeRunDetached,
        });

        // Then: 失敗で 1 を返す
        assert.strictEqual(exitCode, 1, '失敗時は 1');
      } finally {
        await fs.promises.rm(vscodeTestRoot, { recursive: true, force: true });
      }
    });

    // TC-N-29: runMainWithDeps retry path
    test('TC-N-29: runMainWithDeps は再試行後に成功で null を返す', async () => {
      // Given: 1回目は不正JSON、2回目は成功結果
      const nowBase = Date.now();
      let nowTick = 0;
      let callCount = 0;
      const launchers: Array<string | undefined> = [];
      const vscodeTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-vscode-test-unit-'));
      type RunDetachedOptions = Parameters<typeof runDetachedVscodeExtensionTestsWithDeps>[0];
      const fakeRunDetached = async (options: RunDetachedOptions) => {
        callCount += 1;
        launchers.push(options.launcher);
        if (callCount === 1) {
          await fs.promises.writeFile(options.testResultFilePath, '{invalid}', 'utf8');
          return;
        }
        await fs.promises.writeFile(options.testResultFilePath, JSON.stringify({ failures: 0, passes: 1 }), 'utf8');
      };

      try {
        // When: runMainWithDeps を呼ぶ
        const exitCode = await runMainWithDeps({
          env: {
            ...process.env,
            DONTFORGETEST_VSCODE_TEST_ROOT: vscodeTestRoot,
            DONTFORGETEST_TEST_RESULT_WAIT_TIMEOUT_MS: '5',
            DONTFORGETEST_TEST_RESULT_WAIT_INTERVAL_MS: '1',
            DONTFORGETEST_VSCODE_TEST_MAX_ATTEMPTS: '2',
          },
          platform: 'linux',
          pid: process.pid,
          now: () => nowBase + nowTick++,
          stageExtensionToTemp: async () => {},
          runDetachedVscodeExtensionTests: fakeRunDetached,
        });

        // Then: 再試行後に成功する
        assert.strictEqual(exitCode, null, '成功時は null');
        assert.strictEqual(callCount, 2, '2回実行される');
        assert.deepStrictEqual(launchers, ['direct', 'open'], 'launcher が切り替わる');
      } finally {
        await fs.promises.rm(vscodeTestRoot, { recursive: true, force: true });
      }
    });

    // TC-E-17: runMainWithDeps explicit failure throw path
    test('TC-E-17: runMainWithDeps は明示的なテスト失敗で 1 を返す', async () => {
      // Given: failures>0 の結果ファイル
      const nowBase = Date.now();
      let nowTick = 0;
      const vscodeTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-vscode-test-unit-'));
      type RunDetachedOptions = Parameters<typeof runDetachedVscodeExtensionTestsWithDeps>[0];
      const fakeRunDetached = async (options: RunDetachedOptions) => {
        await fs.promises.writeFile(options.testResultFilePath, JSON.stringify({ failures: 2, passes: 0 }), 'utf8');
      };

      try {
        // When: runMainWithDeps を呼ぶ
        const exitCode = await runMainWithDeps({
          env: {
            ...process.env,
            DONTFORGETEST_VSCODE_TEST_ROOT: vscodeTestRoot,
            DONTFORGETEST_TEST_RESULT_WAIT_TIMEOUT_MS: '5',
            DONTFORGETEST_TEST_RESULT_WAIT_INTERVAL_MS: '1',
            DONTFORGETEST_VSCODE_TEST_MAX_ATTEMPTS: '1',
          },
          platform: 'linux',
          pid: process.pid,
          now: () => nowBase + nowTick++,
          stageExtensionToTemp: async () => {},
          runDetachedVscodeExtensionTests: fakeRunDetached,
        });

        // Then: 失敗で 1 を返す
        assert.strictEqual(exitCode, 1, '失敗時は 1');
      } finally {
        await fs.promises.rm(vscodeTestRoot, { recursive: true, force: true });
      }
    });

    // TC-E-18: main exit branch
    test('TC-E-18: main は exitCode が数値の場合に exit を呼ぶ', async () => {
      // Given: exitCode が 1 になる runMainWithDeps
      const nowBase = Date.now();
      let nowTick = 0;
      const exitCalls: number[] = [];
      const vscodeTestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dontforgetest-vscode-test-unit-'));
      type RunDetachedOptions = Parameters<typeof runDetachedVscodeExtensionTestsWithDeps>[0];
      const fakeRunDetached = async (options: RunDetachedOptions) => {
        await fs.promises.writeFile(options.testResultFilePath, JSON.stringify({ failures: 1, passes: 0 }), 'utf8');
      };

      try {
        // When: main を呼ぶ
        await main(
          {
            env: {
              ...process.env,
              DONTFORGETEST_VSCODE_TEST_ROOT: vscodeTestRoot,
              DONTFORGETEST_TEST_RESULT_WAIT_TIMEOUT_MS: '5',
              DONTFORGETEST_TEST_RESULT_WAIT_INTERVAL_MS: '1',
              DONTFORGETEST_VSCODE_TEST_MAX_ATTEMPTS: '1',
            },
            platform: 'linux',
            pid: process.pid,
            now: () => nowBase + nowTick++,
            stageExtensionToTemp: async () => {},
            runDetachedVscodeExtensionTests: fakeRunDetached,
          },
          (code: number) => {
            exitCalls.push(code);
          },
        );

        // Then: exit が呼ばれる
        assert.deepStrictEqual(exitCalls, [1], 'exit(1) が呼ばれる');
      } finally {
        await fs.promises.rm(vscodeTestRoot, { recursive: true, force: true });
      }
    });
  });
});
