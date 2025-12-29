<!-- dontforgetest-config: {"answerLanguage":"en","commentLanguage":"en","perspectiveTableLanguage":"en"} -->

## Scope

- `src/git/gitExec.ts`
- `src/git/worktreeManager.ts`

## Test Perspectives Table

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---------|----------------------|--------------------------------------|-----------------|-------|
| TC-N-01 | `execGitStdout(cwd=repoRoot, args=['--version'], maxBufferBytes=1MB)` and `child_process.execFile` returns `stdout` as string | Equivalence – normal | Returns a string including `git version`; `execFile` called with args prefixed by `-c core.quotepath=false` | Existing coverage baseline |
| TC-N-02 | `execGitStdout(...)` and `child_process.execFile` returns `stdout` as Buffer-like (non-string) | Equivalence – normal (type conversion) | Returns `String(stdout)` (string) without throwing | Cover `typeof stdout !== 'string'` branch |
| TC-N-03 | `execGitResult(...)` and `child_process.execFile` resolves with `stdout/stderr` as Buffer-like (non-string) | Equivalence – normal (type conversion) | Returns `{ ok:true, stdout:string, stderr:string }` and both strings equal `String(...)` | Cover `typeof stdout/stderr !== 'string'` branches |
| TC-E-01 | `execGitResult(...)` and `child_process.execFile` rejects with `Error` containing `stdout/stderr/message` strings with whitespace | Equivalence – error | Returns `{ ok:false }` and `output` is trimmed, non-empty, and contains `stderr`, `stdout`, and `message` lines in order | Verify observable output format |
| TC-E-02 | `execGitResult(...)` and `child_process.execFile` rejects with non-Error object having `stdout/stderr/message` as non-string truthy values | Equivalence – error (type conversion) | Returns `{ ok:false }` and `output` contains `String(stderr)`, `String(stdout)`, `String(message)` | Cover `message` conversion branch |
| TC-E-03 | `execGitResult(...)` and `child_process.execFile` rejects with empty/blank `stdout/stderr/message` | Boundary – empty | Returns `{ ok:false, output:'(詳細不明)' }` | Cover fallback output branch |
| TC-B-01 | `createTemporaryWorktree({ ref: undefined })` | Boundary – null/undefined | Calls `git worktree add ... HEAD` (ref defaults to `HEAD`) | Verify args passed to `execGitStdout` |
| TC-B-02 | `createTemporaryWorktree({ ref: '   ' })` | Boundary – empty/whitespace | Calls `git worktree add ... HEAD` (blank ref falls back to `HEAD`) | Verify args passed to `execGitStdout` |
| TC-B-03 | `createTemporaryWorktree({ taskId: '   ' })` | Boundary – empty/whitespace | Creates directory under `baseDir/worktrees/task` | Cover `trim().length > 0` false path |
| TC-E-04 | `removeTemporaryWorktree(...)` when `execGitStdout` throws for `worktree remove` and `worktree prune`, but `fs.rm` succeeds | Equivalence – error (graceful) | Does not throw; calls `fs.promises.rm` with `{ recursive:true, force:true }` | Verify “best effort cleanup” path |

