# Test Perspectives Table: `src/git/diffAnalyzer.ts` / `src/test/suite/git/diffAnalyzer.test.ts`

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---|---|---|---|---|
| TC-GD-CR-N-01 | `execGitStdout` returns diff text with trailing newlines | Equivalence – normal | `getCommitRangeDiff()` returns `trimEnd()`-ed text; `execGitStdout(workspaceRoot, ['diff','--no-color',range], 20MB)` called once | High priority: commit range diff retrieval |
| TC-GD-CR-E-01 | `execGitStdout` throws (e.g. git failure) | Equivalence – error | `getCommitRangeDiff()` rejects with the same error type/message | Error path |
| TC-GD-WT-N-01 | `mode='staged'`, `execGitStdout` returns staged diff with trailing newline | Equivalence – normal | `getWorkingTreeDiff()` returns `trimEnd()`-ed staged diff; args include `['diff','--cached','--no-color']` | High priority: staged diff |
| TC-GD-WT-N-02 | `mode='unstaged'`, `execGitStdout` returns unstaged diff with trailing newline | Equivalence – normal | `getWorkingTreeDiff()` returns `trimEnd()`-ed unstaged diff; args include `['diff','--no-color']` | High priority: unstaged diff |
| TC-GD-WT-B-01 | `mode='both'`, staged empty, unstaged non-empty | Boundary – empty | Result equals unstaged only (no leading/trailing extra blank lines) | Join behavior |
| TC-GD-WT-B-02 | `mode='both'`, staged non-empty, unstaged non-empty | Boundary – concatenation | Result equals `staged + '\\n\\n' + unstaged` after each is `trimEnd()` | Join behavior |
| TC-GD-WT-E-01 | `mode='both'`, one of the `execGitStdout` calls throws | Equivalence – error | `getWorkingTreeDiff()` rejects with the same error type/message | Error path |
| TC-GD-PARSE-B-01 | `diff --git` line includes quoted paths with `\\n` escape | Boundary – escape | `analyzeGitUnifiedDiff()` decodes the escape into an actual LF character in the parsed path | Covers quotepath escape branches |
| TC-GD-PARSE-B-02 | Quoted path contains unknown escape like `\\q` | Boundary – unknown escape | `analyzeGitUnifiedDiff()` treats `q` as a literal character (does not throw) | Covers default escape branch |

