# Test Perspective Table: `src/core/l10n.ts` (fallback/branch coverage) / `src/test/suite/core/l10nFallback.test.ts`

This table documents the test design (perspectives) for deterministic branch coverage of `src/core/l10n.ts`.

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---|---|---|---|---|
| TC-L10NF-N-01 | `vscode.l10n.t(key)` returns a translated string (≠ key) | Equivalence – normal | `t(key)` returns the translated string and does not attempt fallback bundle loading | Covers “translated != key” early return |
| TC-L10NF-N-02 | `vscode.l10n.t(key)` returns key; EN bundle contains the key | Equivalence – normal | `t(key)` returns EN fallback value | Covers EN fallback happy path |
| TC-L10NF-N-03 | Named args provided (`{name:"Alice"}`); translation is missing; EN bundle value includes placeholder | Equivalence – normal | `t(key,{name:"Alice"})` returns placeholder-resolved string via `vscode.l10n.t(fallback, named)` | Covers named-args substitution branch |
| TC-L10NF-E-01 | EN bundle read/parse throws | Equivalence – error | `t(key)` does not throw, returns key, and logs a warning | Covers try/catch fallback safety |
| TC-L10NF-E-02 | EN bundle file does not exist (`existsSync=false`) | Boundary – missing file | `t(key)` returns key (no fallback), no crash | Covers file-missing branch |
| TC-L10NF-B-01 | Named args is empty object `{}` | Boundary – empty | Returns fallback string directly (no extra placeholder resolution call) | Covers `Object.keys(named).length===0` branch |
| TC-L10NF-B-02 | Bundle JSON parses to non-object (e.g. `[]`) | Boundary – invalid structure | Falls back to `{}` and returns key | Covers “parsed is not object” branch |
| TC-L10NF-LOC-01 | `vscode.env.language` starts with `ja` or not | Equivalence – locale | `getArtifactLocale()` returns `ja` when startsWith('ja'), otherwise `en` | Branch depends on runtime; test asserts per runtime value |

