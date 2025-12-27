# Test Perspective Table: `src/test/suite/docs/documentation.test.ts`

This table documents the test design (perspectives) for `documentation.test.ts`.

| Test Case ID | Category | Perspective (What to verify) | Expected Result |
|---|---|---|---|
| TC-N-01 | Normal | No references to the deleted path exist under `src/` | `referenced.length === 0` |
| TC-E-01 | Error | `resolveRepoRootFromHere` fails to find a repo root in a non-repo directory | Throws `Error` with message containing `Failed to resolve repo root` and the startDir |
| TC-B-01 | Boundary | `walkTsFiles` on an empty directory | Collects 0 `.ts` files without error |
| TC-B-02 | Boundary | `walkTsFiles` excludes `node_modules` and `out`, and collects only `.ts` files | Includes expected `.ts`; excludes `.ts` under excluded dirs and non-`.ts` files |
| TC-E-02 | Error | `walkTsFiles` on a missing directory | Throws `Error` with an ENOENT-like message |
| TC-E-03 | Error | A reference to the deleted path is detected when present | `referenced.length >= 1` and includes the file containing the reference |

