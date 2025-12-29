# Test Perspective Table: `src/providers/cursorAgentProvider.ts` (additional coverage) / `src/test/suite/providers/cursorAgentProvider.test.ts`

This table documents additional high-priority test perspectives to increase coverage for:
- multi-run safety (previous process kill + warning)
- `wireOutput` time-based monitoring (heartbeat / silence / ignored-summary) without long sleeps

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---|---|---|---|---|
| TC-CAP-RUN-E-01 | `provider` already has an `activeChild` and `activeTaskId` | Equivalence – error | `run()` attempts to `kill()` the previous child, clears `activeChild/activeTaskId`, and emits a `log(warn)` mentioning the previous task id | Prevents multi-run process leak |
| TC-CAP-RUN-E-02 | Previous `activeChild.kill()` throws | Equivalence – error | `run()` does not throw, still clears state, and still emits the warning log | Covers kill try/catch |
| TC-CAP-WO-N-01 | `wireOutput` is wired with fake timers; no output observed | Equivalence – normal | Heartbeat emits at least one `log(info)` saying there is still no output | Uses stubbed timers; avoids real 10s wait |
| TC-CAP-WO-B-01 | After some output, time advances; output becomes “silent” | Boundary – time (>=10s, >=30s) | `wireOutput` monitor emits `log(info)` about “elapsed” and “since last output” | Uses controlled `Date.now()` to cross thresholds |
| TC-CAP-WO-N-02 | Stream-json includes `thinking`/`user` only; time advances beyond quiet threshold | Equivalence – normal | `wireOutput` monitor emits a summary `log(info)` about ignored events (`ignored(thinking/user)`) | Ensures “appears stuck” mitigation |
| TC-CAP-WO-E-01 | Child emits `'error'` event | Equivalence – error | Emits `log(error)` with `cursor-agent 実行エラー:` and then emits `completed(exitCode=null)` exactly once | Observable: error message + completed |
| TC-CAP-WO-E-02 | After first output, clock advances to `>= 10min` silence | Boundary – time (max) | Monitor emits `log(error)` about auto-stop and calls `child.kill()` once | Covers “stuck -> kill” mitigation |
| TC-CAP-STDERR-E-01 | Child stderr emits a non-empty message | Equivalence – error | Emits `log(error)` with the stderr message (trimmed) | Covers stderr forwarding |
| TC-HSJ-B-01 | `editToolCall started` with absolute path OUTSIDE workspaceRoot | Boundary – out-of-root | Emits `fileWrite` with absolute path (relative is `undefined`) and returns `lastWritePath=absolute` | Covers `toWorkspaceRelative` out-of-root branch |
| TC-HSJ-B-02 | `editToolCall started` with relative path | Boundary – relative | Emits `fileWrite.path` as-is (relative) | Covers `toWorkspaceRelative` relative passthrough |
| TC-HSJ-E-08 | `tool_call` with empty `{ tool_call: {} }` | Equivalence – error | No event emitted; no exception thrown | Covers `findToolCallName` empty-keys branch |

