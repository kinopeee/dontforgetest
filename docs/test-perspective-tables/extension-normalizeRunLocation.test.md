# Test Perspectives Table: extension.ts - normalizeRunLocation

## Overview

This document defines test perspectives for the `normalizeRunLocation` function in `src/extension.ts`.
The function normalizes the `runLocation` option to either `'local'` or `'worktree'`.

## Function Under Test

```typescript
type RunLocation = 'local' | 'worktree';

function normalizeRunLocation(value: unknown): RunLocation {
  return value === 'worktree' ? 'worktree' : 'local';
}
```

## Test Perspectives Table

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---------|----------------------|--------------------------------------|-----------------|-------|
| TC-N-01 | value = 'worktree' | Equivalence – valid worktree | Returns 'worktree' exactly | Primary use case |
| TC-N-02 | value = 'local' | Equivalence – valid local | Returns 'local' exactly | Primary use case |
| TC-E-01 | value = undefined | Boundary – undefined | Returns 'local' (default fallback) | Common scenario: args not provided |
| TC-E-02 | value = null | Boundary – null | Returns 'local' (default fallback) | Handles null gracefully |
| TC-E-03 | value = '' (empty string) | Boundary – empty | Returns 'local' (not 'worktree') | Empty string is not 'worktree' |
| TC-E-04 | value = 'WORKTREE' (uppercase) | Equivalence – case sensitivity | Returns 'local' (strict equality fails) | Case-sensitive comparison |
| TC-E-05 | value = 'worktree ' (trailing space) | Boundary – whitespace | Returns 'local' (strict equality fails) | No trimming applied |
| TC-E-06 | value = 0 (number) | Boundary – non-string type | Returns 'local' (not 'worktree') | Type mismatch |
| TC-E-07 | value = {} (object) | Boundary – object type | Returns 'local' (not 'worktree') | Object is not 'worktree' |
| TC-E-08 | value = 'invalid' | Equivalence – invalid string | Returns 'local' (default fallback) | Unknown string defaults to local |

## Command Integration Tests

These tests verify that the `normalizeRunLocation` function is correctly used within command handlers.

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---------|----------------------|--------------------------------------|-----------------|-------|
| TC-CMD-N-01 | generateTestFromCommit with { runLocation: 'worktree' } | Equivalence – worktree via command args | generateTestFromLatestCommit called with runLocation='worktree' | Verify args passthrough |
| TC-CMD-N-02 | generateTestFromCommit with { runLocation: 'local' } | Equivalence – local via command args | generateTestFromLatestCommit called with runLocation='local' | Verify args passthrough |
| TC-CMD-E-01 | generateTestFromCommit with no args | Boundary – undefined args | generateTestFromLatestCommit called with runLocation='local' (default) | Default behavior |
| TC-CMD-E-02 | generateTestFromCommit with { runLocation: undefined } | Boundary – explicit undefined | generateTestFromLatestCommit called with runLocation='local' | Explicit undefined normalized |
| TC-CMD-E-03 | generateTestFromCommit with { modelOverride: 'gpt-4' } | Equivalence – modelOverride provided | generateTestFromLatestCommit called with modelOverride='gpt-4' | Verify modelOverride passthrough |
| TC-CMD-E-04 | generateTestFromCommit with { modelOverride: 123 } | Boundary – non-string modelOverride | generateTestFromLatestCommit called with modelOverride=undefined | Non-string ignored |

## Test Execution Command

```bash
npm test
```

## Coverage Target

- Function coverage: 100% for `normalizeRunLocation`
- Branch coverage: 100% for the ternary expression in `normalizeRunLocation`
