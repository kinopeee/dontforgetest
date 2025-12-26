/**
 * 拡張機能に内蔵されるデフォルトのテスト戦略ルール（英語版）
 *
 * ユーザーが dontforgetest.testStrategyPath でファイルを指定しない場合、
 * または指定されたファイルが存在しない場合に使用される。
 */
export const DEFAULT_TEST_STRATEGY = `<!-- dontforgetest-config: {"answerLanguage":"en","commentLanguage":"en","perspectiveTableLanguage":"en"} -->

# Test Strategy Rules

These rules define the mandatory testing process. A test task is NOT complete until ALL steps are satisfied.

---

## 0. Output Language (Extension Metadata)

The \`dontforgetest-config\` comment at the top of this file controls output languages:

- \`answerLanguage\`: Natural language for explanations (outside tables)
- \`commentLanguage\`: Comments in test code (including Given / When / Then)
- \`perspectiveTableLanguage\`: Language for test perspectives table (Markdown)

---

## 1. Test Perspectives Table (Equivalence Partitioning & Boundary Values)

**MANDATORY: Create the table BEFORE writing any test code.**

### Requirements

1. Present a Markdown "Test Perspectives Table" before starting any test implementation.
2. Include these columns: \`Case ID\`, \`Input / Precondition\`, \`Perspective (Equivalence / Boundary)\`, \`Expected Result\`, \`Notes\`.
3. Cover all categories:
   - Normal cases (happy path)
   - Error cases (validation errors, exceptions)
   - Boundary values: \`0\`, \`min\`, \`max\`, \`min-1\`, \`max+1\`, \`empty\`, \`null\`
4. If a boundary value is not applicable, document the reason in \`Notes\` and omit it.
5. If you discover missing cases later, update the table and add the corresponding tests.
6. For minor test fixes (message adjustments, small expected value changes) without new branches, table updates are optional.
7. Expected Results MUST be observable and verifiable (e.g., call counts, saved artifacts, emitted events). Avoid "no crash" only.
8. Expected Results MUST name the observable target (function/event/file/path) and how it is verified (args/counts/existence).
8. Avoid tests with no concrete assertions (e.g., \`assert.ok(true)\`); every case must assert at least one specific outcome.
9. Ensure 1 case = 1 branch + 1 expected result. Do not combine multiple branches into one case.
9. Do not swallow failures in tests (e.g., try/catch that ignores errors). If unavoidable, record the reason and an alternative verification in \`Notes\`.
10. For external dependencies, document mock verification points (call args, counts, output paths) in \`Expected Result\`.
11. Split major branches into separate cases (e.g., worktree/local/skip/cancel/cleanup failure).

### Example (Rule 8)

\`\`\`typescript
// BAD (Rule 8 violation)
assert.ok(true, 'Should work');

// GOOD
assert.strictEqual(callCount, 1);
assert.ok(fs.existsSync(reportPath));
\`\`\`

### Template

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---------|----------------------|--------------------------------------|-----------------|-------|
| TC-N-01 | Valid input A | Equivalence – normal | Returns expected value; saves report file | Verify saved artifact path |
| TC-E-01 | null input | Boundary – null | Throws ValidationError with message | Verify type and message |
| TC-E-02 | empty string | Boundary – empty | Emits validation error event | Verify event payload |
| TC-B-01 | value = 0 | Boundary – zero | Dependency receives value=0 exactly once | Verify call count and args |
| TC-B-02 | value = MAX_INT | Boundary – max | Handles max correctly; no overflow | Verify result and no error |
| TC-B-03 | value = MAX_INT + 1 | Boundary – overflow | Throws RangeError with message | Verify type and message |

---

## 2. Test Implementation Policy

### Coverage Requirements

1. **Implement ALL cases** from the perspectives table as automated tests.
2. **Include at least as many failure cases as success cases** (validation errors, exceptions, external dependency failures).
3. **Target 100% branch coverage.** If not achievable, prioritize:
   - High business-impact branches
   - Primary error paths
   - Document uncovered branches with reasons in \`Notes\` or PR description.

### Test Categories Checklist

- [ ] Normal cases (main scenarios)
- [ ] Error cases (validation errors, exception paths)
- [ ] Boundary values (0, min, max, ±1, empty, null)
- [ ] Invalid type/format inputs
- [ ] External dependency failures (API, DB, messaging) if applicable
- [ ] Exception types AND error messages

---

## 3. Given / When / Then Comments

**MANDATORY: Every test case MUST include these comments.**

\`\`\`text
// Given: <preconditions and setup>
// When: <action being tested>
// Then: <expected outcome and assertions>
\`\`\`

Place comments directly above the test or within test steps so readers can follow the scenario.

### Example

\`\`\`typescript
test('throws ValidationError when input is null', () => {
  // Given: A processor instance with default configuration
  const processor = new Processor();
  
  // When: Processing null input
  // Then: Throws ValidationError with specific message
  expect(() => processor.process(null)).toThrow(ValidationError);
  expect(() => processor.process(null)).toThrow('Input cannot be null');
});
\`\`\`

---

## 4. Exception and Error Verification

### Requirements

1. **Verify exception TYPE and MESSAGE explicitly** for all error cases.
2. For validation errors, also verify error codes and field information if available.
3. For external dependency failures, use stubs/mocks to verify:
   - Expected exceptions are thrown
   - Retry logic is triggered (if applicable)
   - Fallback behavior is invoked (if applicable)

### Example

\`\`\`typescript
// BAD: Only checks that an error is thrown
expect(() => fn()).toThrow();

// GOOD: Verifies type and message
expect(() => fn()).toThrow(ValidationError);
expect(() => fn()).toThrow('Field "email" is required');
\`\`\`

---

## 5. Execution Commands and Coverage

1. Document the **test execution command** and **coverage command** at the end of implementation.
   - Examples: \`npm test\`, \`pnpm vitest run --coverage\`, \`pytest --cov=...\`
2. Review branch and statement coverage. Target 100% branch coverage.
3. Attach coverage report summary or screenshot when possible.

---

## 6. Operational Guidelines

1. **Reject PRs** with tests that do not comply with these rules.
2. **Use mocks for failure cases** even when external dependencies don't exist.
3. **Update both** the perspectives table AND test code when new branches or constraints are added.
4. If automation is difficult:
   - Document the reason
   - Provide manual verification steps including: target functionality, risk, expected results, and how to save logs/screenshots
   - Get reviewer agreement
5. **Every PR with meaningful production code changes** (features, bug fixes, behavior-affecting refactors) MUST include corresponding test additions or updates.
6. If test updates are impractical, document the reason and alternative verification in the PR description.
7. For refactors without intended behavior changes, verify existing tests cover the changed code. Add tests if coverage is insufficient.

---

## Summary Checklist

Before completing a test task, verify:

- [ ] Test perspectives table is created/updated
- [ ] All table cases are implemented as tests
- [ ] Failure cases ≥ success cases
- [ ] Given/When/Then comments on every test
- [ ] Exception types AND messages are verified
- [ ] Boundary values are covered (0, min, max, ±1, empty, null)
- [ ] Test execution command is documented
- [ ] Coverage is reviewed

**Follow these rules and self-check for missing perspectives before finalizing tests.**`;

/**
 * デフォルトの言語設定
 */
// NOTE:
// - `as const` は TypeScript の型推論上の readonly であり、実行時のプロパティ記述子は変更しない。
// - テストでは writable/configurable が false であること（実行時 readonly）も検証するため、freeze する。
export const DEFAULT_LANGUAGE_CONFIG = Object.freeze({
  answerLanguage: 'en',
  commentLanguage: 'en',
  perspectiveTableLanguage: 'en',
} as const);
