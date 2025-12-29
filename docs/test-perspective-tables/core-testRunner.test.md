# Test Perspective Table: `src/core/testRunner.ts` / `src/test/suite/core/testRunner.test.ts`

This table documents the test design (perspectives) for the unit tests in `src/test/suite/core/testRunner.test.ts`.

| Test Case ID | Perspective (What to verify) | Expected Result | Notes (Normal/Error/Boundary) |
|---|---|---|---|
| TC-RUN-01 | A successful command captures stdout/stderr and returns exitCode=0 | `exitCode === 0`, `stdout` contains expected text, `stderr` empty | Normal |
| TC-RUN-02 | An invalid command results in failure information being captured | `exitCode !== 0` or `errorMessage` exists; error output contains command name or "not found"-like text | Error |
| TC-RUN-03 | A command that exits with code 1 returns exitCode=1 | `exitCode === 1` | Error (explicit exit code) |
| TC-RUN-04 | Very large stdout is truncated to the capture limit | `stdout` contains truncation marker and is shorter than original output | Boundary (over max) |
| TC-TRUNNER-N-01 | `executionRunner` is set to `extension` on success | `executionRunner === "extension"` | Normal |
| TC-TRUNNER-E-01 | Failure keeps `executionRunner="extension"` and exposes failure text | `exitCode !== 0` or `errorMessage` exists; output indicates command-not-found | Error |
| TC-TRUN-B-00 | Command with no output returns empty stdout/stderr | `stdout.trim().length === 0` and `stderr.trim().length === 0` | Boundary (empty) |
| TC-TRUN-B-MAX | stdout length exactly equals `MAX_CAPTURE_BYTES` is not truncated | `stdout.length === MAX_CAPTURE_BYTES` and no truncation marker | Boundary (max) |
| TC-TRUN-B-MAXP1 | stdout length exceeds `MAX_CAPTURE_BYTES` is truncated | `stdout` contains truncation marker; output is capped | Boundary (max+1) |
| TC-TRUN-ENV-N-01 | `options.env` overrides `process.env` when merging env | spawned process sees overridden value | Normal (env precedence) |
| TC-TRUN-ENV-B-01 | When `options.env` is omitted, `process.env` is passed through | spawned process sees `process.env` value | Boundary (env omitted) |
| TC-TRUN-ERR-01 | Spawn emits `error` and then `close` (double-finish guard) | Promise resolves once; `exitCode === null`; `errorMessage` equals the error message; truncation marker appended when stdout exceeds the cap | Error (spawn error path + idempotent finish) |
| TC-TRUN-TRUNC-SLICE-01 | Stdout arrives in chunks such that `prev < cap` but `prev+chunk > cap` | `stdoutTruncated === true`; `stdout` is sliced to the cap and includes truncation marker in the final result | Boundary (crossing cap in a single append) |

