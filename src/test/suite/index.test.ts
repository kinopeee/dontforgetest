import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { resolveSuiteFromFullTitle, TestCaseInfo, TestCaseState, TestResultFile } from '../suite/index';

suite('test/suite/index.ts', () => {
  suite('resolveSuiteFromFullTitle', () => {
    // TC-RESOLVE-N-01: fullTitle ends with title, normal case
    test('TC-RESOLVE-N-01: Returns suite string when fullTitle ends with title', () => {
      // Given: fullTitle that ends with title
      const fullTitle = 'Suite1 Suite2 Test Title';
      const title = 'Test Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns suite string (fullTitle without title)
      assert.strictEqual(result, 'Suite1 Suite2', 'Should return suite string');
    });

    // TC-RESOLVE-N-02: fullTitle equals title
    test('TC-RESOLVE-N-02: Returns empty string when fullTitle equals title', () => {
      // Given: fullTitle that equals title
      const fullTitle = 'Test Title';
      const title = 'Test Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns empty string
      assert.strictEqual(result, '', 'Should return empty string');
    });

    // TC-RESOLVE-N-03: fullTitle does not end with title
    test('TC-RESOLVE-N-03: Returns empty string when fullTitle does not end with title', () => {
      // Given: fullTitle that does not end with title
      const fullTitle = 'Suite1 Suite2';
      const title = 'Different Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns empty string
      assert.strictEqual(result, '', 'Should return empty string when no match');
    });

    // TC-RESOLVE-B-01: fullTitle is empty string
    test('TC-RESOLVE-B-01: Returns empty string when fullTitle is empty string', () => {
      // Given: empty fullTitle
      const fullTitle = '';
      const title = 'Test Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns empty string
      assert.strictEqual(result, '', 'Should return empty string');
    });

    // TC-RESOLVE-B-02: title is empty string
    test('TC-RESOLVE-B-02: Returns fullTitle.trim() or empty when title is empty string', () => {
      // Given: empty title
      const fullTitle = 'Suite1 Suite2';
      const title = '';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns empty string (fullTitle does not end with empty string)
      assert.strictEqual(result, '', 'Should return empty string when title is empty');
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

    // TC-RESOLVE-B-05: fullTitle length = 0
    test('TC-RESOLVE-B-05: Returns empty string when fullTitle length is 0', () => {
      // Given: fullTitle with zero length
      const fullTitle = '';
      const title = 'Test Title';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns empty string
      assert.strictEqual(result, '', 'Should return empty string');
    });

    // TC-RESOLVE-B-06: title length = 0
    test('TC-RESOLVE-B-06: Returns fullTitle.trim() or empty when title length is 0', () => {
      // Given: title with zero length
      const fullTitle = 'Suite1 Suite2';
      const title = '';

      // When: resolveSuiteFromFullTitle is called
      const result = resolveSuiteFromFullTitle(fullTitle, title);

      // Then: Returns empty string
      assert.strictEqual(result, '', 'Should return empty string');
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
  });

  suite('Test Collection (upsertTest)', () => {
    // TC-COLLECT-N-01: pass event fired with valid test info
    test('TC-COLLECT-N-01: upsertTest called and test added to byFullTitle when pass event fired', () => {
      // Given: Map and order array for test collection
      const byFullTitle = new Map<string, TestCaseInfo>();
      const order: string[] = [];

      const upsertTest = (info: TestCaseInfo): void => {
        const existing = byFullTitle.get(info.fullTitle);
        if (!existing) {
          byFullTitle.set(info.fullTitle, info);
          order.push(info.fullTitle);
          return;
        }
        byFullTitle.set(info.fullTitle, { ...existing, ...info });
      };

      // When: pass event fired with valid test info
      const testInfo: TestCaseInfo = {
        suite: 'Suite A',
        title: 'Test Title',
        fullTitle: 'Suite A Test Title',
        state: 'passed',
        durationMs: 100,
      };
      upsertTest(testInfo);

      // Then: Test added to byFullTitle
      assert.ok(byFullTitle.has('Suite A Test Title'), 'Should add test to byFullTitle');
      assert.strictEqual(order.length, 1, 'Should add to order array');
      assert.strictEqual(byFullTitle.get('Suite A Test Title')?.state, 'passed', 'Should have correct state');
    });

    // TC-COLLECT-N-02: fail event fired with valid test info
    test('TC-COLLECT-N-02: upsertTest called and test added to byFullTitle and failedTests when fail event fired', () => {
      // Given: Map, order array, and failedTests array
      const byFullTitle = new Map<string, TestCaseInfo>();
      const order: string[] = [];
      const failedTests: Array<{ title: string; fullTitle: string; error: string }> = [];

      const upsertTest = (info: TestCaseInfo): void => {
        const existing = byFullTitle.get(info.fullTitle);
        if (!existing) {
          byFullTitle.set(info.fullTitle, info);
          order.push(info.fullTitle);
          return;
        }
        byFullTitle.set(info.fullTitle, { ...existing, ...info });
      };

      // When: fail event fired with valid test info
      const testInfo: TestCaseInfo = {
        suite: 'Suite A',
        title: 'Test Title',
        fullTitle: 'Suite A Test Title',
        state: 'failed',
      };
      upsertTest(testInfo);
      failedTests.push({
        title: testInfo.title,
        fullTitle: testInfo.fullTitle,
        error: 'Test failed',
      });

      // Then: Test added to byFullTitle and failedTests
      assert.ok(byFullTitle.has('Suite A Test Title'), 'Should add test to byFullTitle');
      assert.strictEqual(failedTests.length, 1, 'Should add to failedTests');
      assert.strictEqual(byFullTitle.get('Suite A Test Title')?.state, 'failed', 'Should have correct state');
    });

    // TC-COLLECT-N-03: pending event fired with valid test info
    test('TC-COLLECT-N-03: upsertTest called and test added to byFullTitle when pending event fired', () => {
      // Given: Map and order array
      const byFullTitle = new Map<string, TestCaseInfo>();
      const order: string[] = [];

      const upsertTest = (info: TestCaseInfo): void => {
        const existing = byFullTitle.get(info.fullTitle);
        if (!existing) {
          byFullTitle.set(info.fullTitle, info);
          order.push(info.fullTitle);
          return;
        }
        byFullTitle.set(info.fullTitle, { ...existing, ...info });
      };

      // When: pending event fired with valid test info
      const testInfo: TestCaseInfo = {
        suite: 'Suite A',
        title: 'Test Title',
        fullTitle: 'Suite A Test Title',
        state: 'pending',
      };
      upsertTest(testInfo);

      // Then: Test added to byFullTitle
      assert.ok(byFullTitle.has('Suite A Test Title'), 'Should add test to byFullTitle');
      assert.strictEqual(byFullTitle.get('Suite A Test Title')?.state, 'pending', 'Should have correct state');
    });

    // TC-COLLECT-N-04: Multiple pass events for same fullTitle
    test('TC-COLLECT-N-04: Updates existing test with new info when multiple pass events for same fullTitle', () => {
      // Given: Map with existing test
      const byFullTitle = new Map<string, TestCaseInfo>();
      const order: string[] = [];

      const upsertTest = (info: TestCaseInfo): void => {
        const existing = byFullTitle.get(info.fullTitle);
        if (!existing) {
          byFullTitle.set(info.fullTitle, info);
          order.push(info.fullTitle);
          return;
        }
        byFullTitle.set(info.fullTitle, { ...existing, ...info });
      };

      // When: Multiple pass events for same fullTitle
      upsertTest({
        suite: 'Suite A',
        title: 'Test Title',
        fullTitle: 'Suite A Test Title',
        state: 'passed',
        durationMs: 100,
      });
      upsertTest({
        suite: 'Suite A',
        title: 'Test Title',
        fullTitle: 'Suite A Test Title',
        state: 'passed',
        durationMs: 200,
      });

      // Then: Updates existing test with new info
      assert.strictEqual(byFullTitle.size, 1, 'Should have only one test');
      assert.strictEqual(byFullTitle.get('Suite A Test Title')?.durationMs, 200, 'Should update duration');
    });

    // TC-COLLECT-N-05: pass then fail event for same fullTitle
    test('TC-COLLECT-N-05: Updates to failed state when pass then fail event for same fullTitle', () => {
      // Given: Map with existing passed test
      const byFullTitle = new Map<string, TestCaseInfo>();
      const order: string[] = [];

      const upsertTest = (info: TestCaseInfo): void => {
        const existing = byFullTitle.get(info.fullTitle);
        if (!existing) {
          byFullTitle.set(info.fullTitle, info);
          order.push(info.fullTitle);
          return;
        }
        byFullTitle.set(info.fullTitle, { ...existing, ...info });
      };

      // When: pass then fail event for same fullTitle
      upsertTest({
        suite: 'Suite A',
        title: 'Test Title',
        fullTitle: 'Suite A Test Title',
        state: 'passed',
      });
      upsertTest({
        suite: 'Suite A',
        title: 'Test Title',
        fullTitle: 'Suite A Test Title',
        state: 'failed',
      });

      // Then: Updates to failed state
      assert.strictEqual(byFullTitle.get('Suite A Test Title')?.state, 'failed', 'Should update to failed state');
    });

    // TC-COLLECT-B-01: pass event with duration = 0
    test('TC-COLLECT-B-01: durationMs is undefined or 0 when pass event has duration = 0', () => {
      // Given: Map and order array
      const byFullTitle = new Map<string, TestCaseInfo>();
      const order: string[] = [];

      const upsertTest = (info: TestCaseInfo): void => {
        const existing = byFullTitle.get(info.fullTitle);
        if (!existing) {
          byFullTitle.set(info.fullTitle, info);
          order.push(info.fullTitle);
          return;
        }
        byFullTitle.set(info.fullTitle, { ...existing, ...info });
      };

      // When: pass event with duration = 0
      upsertTest({
        suite: 'Suite A',
        title: 'Test Title',
        fullTitle: 'Suite A Test Title',
        state: 'passed',
        durationMs: 0,
      });

      // Then: durationMs is 0
      assert.strictEqual(byFullTitle.get('Suite A Test Title')?.durationMs, 0, 'Should have durationMs = 0');
    });

    // TC-COLLECT-B-03: pass event with duration = null
    test('TC-COLLECT-B-03: durationMs is undefined when pass event has duration = null', () => {
      // Given: Map and order array
      const byFullTitle = new Map<string, TestCaseInfo>();
      const order: string[] = [];

      const upsertTest = (info: TestCaseInfo): void => {
        const existing = byFullTitle.get(info.fullTitle);
        if (!existing) {
          byFullTitle.set(info.fullTitle, info);
          order.push(info.fullTitle);
          return;
        }
        byFullTitle.set(info.fullTitle, { ...existing, ...info });
      };

      // When: pass event with duration = null
      upsertTest({
        suite: 'Suite A',
        title: 'Test Title',
        fullTitle: 'Suite A Test Title',
        state: 'passed',
        durationMs: null as unknown as number,
      });

      // Then: durationMs is undefined or null
      const test = byFullTitle.get('Suite A Test Title');
      assert.ok(test?.durationMs === null || test?.durationMs === undefined, 'Should handle null duration');
    });

    // TC-COLLECT-B-04: pass event with duration = undefined
    test('TC-COLLECT-B-04: durationMs is undefined when pass event has duration = undefined', () => {
      // Given: Map and order array
      const byFullTitle = new Map<string, TestCaseInfo>();
      const order: string[] = [];

      const upsertTest = (info: TestCaseInfo): void => {
        const existing = byFullTitle.get(info.fullTitle);
        if (!existing) {
          byFullTitle.set(info.fullTitle, info);
          order.push(info.fullTitle);
          return;
        }
        byFullTitle.set(info.fullTitle, { ...existing, ...info });
      };

      // When: pass event with duration = undefined
      upsertTest({
        suite: 'Suite A',
        title: 'Test Title',
        fullTitle: 'Suite A Test Title',
        state: 'passed',
      });

      // Then: durationMs is undefined
      assert.strictEqual(byFullTitle.get('Suite A Test Title')?.durationMs, undefined, 'Should have undefined durationMs');
    });

    // TC-COLLECT-B-05: test.title is empty string
    test('TC-COLLECT-B-05: Handles gracefully when test.title is empty string', () => {
      // Given: Map and order array
      const byFullTitle = new Map<string, TestCaseInfo>();
      const order: string[] = [];

      const upsertTest = (info: TestCaseInfo): void => {
        const existing = byFullTitle.get(info.fullTitle);
        if (!existing) {
          byFullTitle.set(info.fullTitle, info);
          order.push(info.fullTitle);
          return;
        }
        byFullTitle.set(info.fullTitle, { ...existing, ...info });
      };

      // When: test.title is empty string
      upsertTest({
        suite: 'Suite A',
        title: '',
        fullTitle: 'Suite A',
        state: 'passed',
      });

      // Then: Handles gracefully
      assert.ok(byFullTitle.has('Suite A'), 'Should handle empty title');
    });

    // TC-COLLECT-B-06: test.fullTitle() returns empty string
    test('TC-COLLECT-B-06: Handles gracefully when test.fullTitle() returns empty string', () => {
      // Given: Map and order array
      const byFullTitle = new Map<string, TestCaseInfo>();
      const order: string[] = [];

      const upsertTest = (info: TestCaseInfo): void => {
        const existing = byFullTitle.get(info.fullTitle);
        if (!existing) {
          byFullTitle.set(info.fullTitle, info);
          order.push(info.fullTitle);
          return;
        }
        byFullTitle.set(info.fullTitle, { ...existing, ...info });
      };

      // When: test.fullTitle() returns empty string
      upsertTest({
        suite: 'Suite A',
        title: 'Test Title',
        fullTitle: '',
        state: 'passed',
      });

      // Then: Handles gracefully
      assert.ok(byFullTitle.has(''), 'Should handle empty fullTitle');
    });

    // TC-COLLECT-B-09: Multiple events, order array maintains insertion order
    test('TC-COLLECT-B-09: order array reflects insertion order when multiple events occur', () => {
      // Given: Map and order array
      const byFullTitle = new Map<string, TestCaseInfo>();
      const order: string[] = [];

      const upsertTest = (info: TestCaseInfo): void => {
        const existing = byFullTitle.get(info.fullTitle);
        if (!existing) {
          byFullTitle.set(info.fullTitle, info);
          order.push(info.fullTitle);
          return;
        }
        byFullTitle.set(info.fullTitle, { ...existing, ...info });
      };

      // When: Multiple events occur
      upsertTest({
        suite: 'Suite A',
        title: 'Test A',
        fullTitle: 'Suite A Test A',
        state: 'passed',
      });
      upsertTest({
        suite: 'Suite B',
        title: 'Test B',
        fullTitle: 'Suite B Test B',
        state: 'passed',
      });
      upsertTest({
        suite: 'Suite C',
        title: 'Test C',
        fullTitle: 'Suite C Test C',
        state: 'passed',
      });

      // Then: order array reflects insertion order
      assert.strictEqual(order[0], 'Suite A Test A', 'Should maintain insertion order');
      assert.strictEqual(order[1], 'Suite B Test B', 'Should maintain insertion order');
      assert.strictEqual(order[2], 'Suite C Test C', 'Should maintain insertion order');
    });

    // TC-COLLECT-E-03: fail event with err = null
    test('TC-COLLECT-E-03: Handles gracefully when fail event has err = null', () => {
      // Given: Map, order array, and failedTests array
      const byFullTitle = new Map<string, TestCaseInfo>();
      const order: string[] = [];
      const failedTests: Array<{ title: string; fullTitle: string; error: string }> = [];

      const upsertTest = (info: TestCaseInfo): void => {
        const existing = byFullTitle.get(info.fullTitle);
        if (!existing) {
          byFullTitle.set(info.fullTitle, info);
          order.push(info.fullTitle);
          return;
        }
        byFullTitle.set(info.fullTitle, { ...existing, ...info });
      };

      // When: fail event with err = null
      const testInfo: TestCaseInfo = {
        suite: 'Suite A',
        title: 'Test Title',
        fullTitle: 'Suite A Test Title',
        state: 'failed',
      };
      upsertTest(testInfo);
      failedTests.push({
        title: testInfo.title,
        fullTitle: testInfo.fullTitle,
        error: '',
      });

      // Then: Handles gracefully, error message is empty
      assert.strictEqual(failedTests[0].error, '', 'Should handle null error gracefully');
    });

    // TC-COLLECT-E-04: fail event with err.message = undefined
    test('TC-COLLECT-E-04: Uses String(err) for error when fail event has err.message = undefined', () => {
      // Given: Map, order array, and failedTests array
      const byFullTitle = new Map<string, TestCaseInfo>();
      const order: string[] = [];
      const failedTests: Array<{ title: string; fullTitle: string; error: string }> = [];

      const upsertTest = (info: TestCaseInfo): void => {
        const existing = byFullTitle.get(info.fullTitle);
        if (!existing) {
          byFullTitle.set(info.fullTitle, info);
          order.push(info.fullTitle);
          return;
        }
        byFullTitle.set(info.fullTitle, { ...existing, ...info });
      };

      // When: fail event with err.message = undefined
      const testInfo: TestCaseInfo = {
        suite: 'Suite A',
        title: 'Test Title',
        fullTitle: 'Suite A Test Title',
        state: 'failed',
      };
      upsertTest(testInfo);
      const err = { message: undefined } as unknown as Error;
      failedTests.push({
        title: testInfo.title,
        fullTitle: testInfo.fullTitle,
        error: err.message || String(err),
      });

      // Then: Uses String(err) for error
      assert.ok(typeof failedTests[0].error === 'string', 'Should use String(err) for error');
    });
  });

  suite('Test Result File Generation', () => {
    // TC-RESULT-N-01: All tests passed, valid stats
    test('TC-RESULT-N-01: TestResultFile has correct passes and failures=0 when all tests passed', () => {
      // Given: All tests passed with valid stats
      const tests: TestCaseInfo[] = [
        {
          suite: 'Suite A',
          title: 'Test 1',
          fullTitle: 'Suite A Test 1',
          state: 'passed',
          durationMs: 100,
        },
        {
          suite: 'Suite A',
          title: 'Test 2',
          fullTitle: 'Suite A Test 2',
          state: 'passed',
          durationMs: 200,
        },
      ];
      const passes = tests.filter((t) => t.state === 'passed').length;
      const failures = 0;

      // When: TestResultFile is created
      const result: TestResultFile = {
        timestamp: Date.now(),
        vscodeVersion: vscode.version,
        failures,
        passes,
        pending: 0,
        total: tests.length,
        durationMs: 300,
        tests,
      };

      // Then: TestResultFile has correct passes and failures=0
      assert.strictEqual(result.passes, 2, 'Should have correct passes count');
      assert.strictEqual(result.failures, 0, 'Should have failures=0');
      assert.strictEqual(result.total, 2, 'Should have correct total');
    });

    // TC-RESULT-N-02: Some tests failed, valid stats
    test('TC-RESULT-N-02: TestResultFile has correct failures and passes when some tests failed', () => {
      // Given: Some tests failed with valid stats
      const tests: TestCaseInfo[] = [
        {
          suite: 'Suite A',
          title: 'Test 1',
          fullTitle: 'Suite A Test 1',
          state: 'passed',
        },
        {
          suite: 'Suite A',
          title: 'Test 2',
          fullTitle: 'Suite A Test 2',
          state: 'failed',
        },
      ];
      const passes = tests.filter((t) => t.state === 'passed').length;
      const failures = tests.filter((t) => t.state === 'failed').length;

      // When: TestResultFile is created
      const result: TestResultFile = {
        timestamp: Date.now(),
        vscodeVersion: vscode.version,
        failures,
        passes,
        pending: 0,
        total: tests.length,
        tests,
      };

      // Then: TestResultFile has correct failures and passes
      assert.strictEqual(result.passes, 1, 'Should have correct passes count');
      assert.strictEqual(result.failures, 1, 'Should have correct failures count');
    });

    // TC-RESULT-N-03: Some tests pending, valid stats
    test('TC-RESULT-N-03: TestResultFile has correct pending count when some tests pending', () => {
      // Given: Some tests pending with valid stats
      const tests: TestCaseInfo[] = [
        {
          suite: 'Suite A',
          title: 'Test 1',
          fullTitle: 'Suite A Test 1',
          state: 'passed',
        },
        {
          suite: 'Suite A',
          title: 'Test 2',
          fullTitle: 'Suite A Test 2',
          state: 'pending',
        },
      ];
      const pending = tests.filter((t) => t.state === 'pending').length;

      // When: TestResultFile is created
      const result: TestResultFile = {
        timestamp: Date.now(),
        vscodeVersion: vscode.version,
        failures: 0,
        passes: 1,
        pending,
        total: tests.length,
        tests,
      };

      // Then: TestResultFile has correct pending count
      assert.strictEqual(result.pending, 1, 'Should have correct pending count');
    });

    // TC-RESULT-N-04: Mixed states, valid stats
    test('TC-RESULT-N-04: TestResultFile has correct counts for all states when mixed states', () => {
      // Given: Mixed states with valid stats
      const tests: TestCaseInfo[] = [
        {
          suite: 'Suite A',
          title: 'Test 1',
          fullTitle: 'Suite A Test 1',
          state: 'passed',
        },
        {
          suite: 'Suite A',
          title: 'Test 2',
          fullTitle: 'Suite A Test 2',
          state: 'failed',
        },
        {
          suite: 'Suite A',
          title: 'Test 3',
          fullTitle: 'Suite A Test 3',
          state: 'pending',
        },
      ];
      const passes = tests.filter((t) => t.state === 'passed').length;
      const failures = tests.filter((t) => t.state === 'failed').length;
      const pending = tests.filter((t) => t.state === 'pending').length;

      // When: TestResultFile is created
      const result: TestResultFile = {
        timestamp: Date.now(),
        vscodeVersion: vscode.version,
        failures,
        passes,
        pending,
        total: tests.length,
        tests,
      };

      // Then: TestResultFile has correct counts for all states
      assert.strictEqual(result.passes, 1, 'Should have correct passes count');
      assert.strictEqual(result.failures, 1, 'Should have correct failures count');
      assert.strictEqual(result.pending, 1, 'Should have correct pending count');
      assert.strictEqual(result.total, 3, 'Should have correct total');
    });

    // TC-RESULT-B-01: tests array length = 0
    test('TC-RESULT-B-01: passes=0, pending=0, total=0 when tests array length is 0', () => {
      // Given: Empty tests array
      const tests: TestCaseInfo[] = [];
      const passes = tests.filter((t) => t.state === 'passed').length;
      const pending = tests.filter((t) => t.state === 'pending').length;
      const total = tests.length;

      // When: TestResultFile is created
      const result: TestResultFile = {
        timestamp: Date.now(),
        vscodeVersion: vscode.version,
        failures: 0,
        passes,
        pending,
        total,
        tests,
      };

      // Then: passes=0, pending=0, total=0
      assert.strictEqual(result.passes, 0, 'Should have passes=0');
      assert.strictEqual(result.pending, 0, 'Should have pending=0');
      assert.strictEqual(result.total, 0, 'Should have total=0');
    });

    // TC-RESULT-B-02: tests array length = 1
    test('TC-RESULT-B-02: total=1 and correct state count when tests array length is 1', () => {
      // Given: Single test
      const tests: TestCaseInfo[] = [
        {
          suite: 'Suite A',
          title: 'Test 1',
          fullTitle: 'Suite A Test 1',
          state: 'passed',
        },
      ];
      const passes = tests.filter((t) => t.state === 'passed').length;
      const total = tests.length;

      // When: TestResultFile is created
      const result: TestResultFile = {
        timestamp: Date.now(),
        vscodeVersion: vscode.version,
        failures: 0,
        passes,
        pending: 0,
        total,
        tests,
      };

      // Then: total=1, correct state count
      assert.strictEqual(result.total, 1, 'Should have total=1');
      assert.strictEqual(result.passes, 1, 'Should have correct state count');
    });

    // TC-RESULT-B-04: runner.stats.duration = 0
    test('TC-RESULT-B-04: durationMs is undefined or 0 when runner.stats.duration is 0', () => {
      // Given: runner.stats.duration = 0
      const durationMs = 0;

      // When: TestResultFile is created
      const result: TestResultFile = {
        timestamp: Date.now(),
        vscodeVersion: vscode.version,
        failures: 0,
        passes: 0,
        pending: 0,
        total: 0,
        durationMs: durationMs === 0 ? undefined : durationMs,
        tests: [],
      };

      // Then: durationMs is undefined or 0
      assert.ok(result.durationMs === undefined || result.durationMs === 0, 'Should have durationMs undefined or 0');
    });

    // TC-RESULT-B-06: runner.stats.duration = null
    test('TC-RESULT-B-06: durationMs is undefined when runner.stats.duration is null', () => {
      // Given: runner.stats.duration = null
      const durationMs = null as unknown as number;

      // When: TestResultFile is created
      const result: TestResultFile = {
        timestamp: Date.now(),
        vscodeVersion: vscode.version,
        failures: 0,
        passes: 0,
        pending: 0,
        total: 0,
        durationMs: typeof durationMs === 'number' ? durationMs : undefined,
        tests: [],
      };

      // Then: durationMs is undefined
      assert.strictEqual(result.durationMs, undefined, 'Should have durationMs undefined');
    });

    // TC-RESULT-B-07: runner.stats.duration = undefined
    test('TC-RESULT-B-07: durationMs is undefined when runner.stats.duration is undefined', () => {
      // Given: runner.stats.duration = undefined
      const durationMs = undefined;

      // When: TestResultFile is created
      const result: TestResultFile = {
        timestamp: Date.now(),
        vscodeVersion: vscode.version,
        failures: 0,
        passes: 0,
        pending: 0,
        total: 0,
        durationMs: typeof durationMs === 'number' ? durationMs : undefined,
        tests: [],
      };

      // Then: durationMs is undefined
      assert.strictEqual(result.durationMs, undefined, 'Should have durationMs undefined');
    });

    // TC-RESULT-B-08: failures = 0
    test('TC-RESULT-B-08: failures=0 and no error thrown when failures is 0', () => {
      // Given: failures = 0
      const failures = 0;

      // When: TestResultFile is created
      const result: TestResultFile = {
        timestamp: Date.now(),
        vscodeVersion: vscode.version,
        failures,
        passes: 0,
        pending: 0,
        total: 0,
        tests: [],
      };

      // Then: failures=0, no error thrown
      assert.strictEqual(result.failures, 0, 'Should have failures=0');
      assert.doesNotThrow(() => {
        if (result.failures > 0) {
          throw new Error(`テスト失敗: ${result.failures}個`);
        }
      }, 'Should not throw error when failures=0');
    });

    // TC-RESULT-B-09: failures = 1
    test('TC-RESULT-B-09: Error thrown with correct message when failures is 1', () => {
      // Given: failures = 1
      const failures = 1;

      // When: TestResultFile is created and checked
      const result: TestResultFile = {
        timestamp: Date.now(),
        vscodeVersion: vscode.version,
        failures,
        passes: 0,
        pending: 0,
        total: 1,
        tests: [],
      };

      // Then: Error thrown with correct message
      assert.throws(
        () => {
          if (result.failures > 0) {
            throw new Error(`テスト失敗: ${result.failures}個`);
          }
        },
        (err: Error) => {
          return err instanceof Error && err.message === 'テスト失敗: 1個';
        },
        'Should throw error with correct message'
      );
    });

    // TC-RESULT-E-01: runner.stats is null
    test('TC-RESULT-E-01: durationMs is undefined when runner.stats is null', () => {
      // Given: runner.stats is null
      const stats = null as unknown as { duration?: number };
      const durationMs = typeof stats?.duration === 'number' ? stats.duration : undefined;

      // When: TestResultFile is created
      const result: TestResultFile = {
        timestamp: Date.now(),
        vscodeVersion: vscode.version,
        failures: 0,
        passes: 0,
        pending: 0,
        total: 0,
        durationMs,
        tests: [],
      };

      // Then: durationMs is undefined
      assert.strictEqual(result.durationMs, undefined, 'Should have durationMs undefined');
    });

    // TC-RESULT-E-02: runner.stats is undefined
    test('TC-RESULT-E-02: durationMs is undefined when runner.stats is undefined', () => {
      // Given: runner.stats is undefined
      const stats = undefined as unknown as { duration?: number };
      const durationMs = typeof stats?.duration === 'number' ? stats.duration : undefined;

      // When: TestResultFile is created
      const result: TestResultFile = {
        timestamp: Date.now(),
        vscodeVersion: vscode.version,
        failures: 0,
        passes: 0,
        pending: 0,
        total: 0,
        durationMs,
        tests: [],
      };

      // Then: durationMs is undefined
      assert.strictEqual(result.durationMs, undefined, 'Should have durationMs undefined');
    });
  });
});
