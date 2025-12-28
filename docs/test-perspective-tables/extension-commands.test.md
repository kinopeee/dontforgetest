# Test Perspective Table: `src/extension.ts` command handlers / `src/test/suite/extension/commandHandlers.test.ts`

This table documents the test design (perspectives) for the command handler coverage tests in `commandHandlers.test.ts`.

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---|---|---|---|---|
| TC-EXTCMD-N-01 | Extension activated; `generateTestWithQuickPick` is stubbed | Equivalence – normal | Executing `dontforgetest.generateTest` calls `generateTestWithQuickPick(provider, context)` exactly once | Avoids UI hang by stubbing |
| TC-EXTCMD-E-01 | Extension activated; `generateTestWithQuickPick` throws | Equivalence – error | Executing `dontforgetest.generateTest` rejects with the error from `generateTestWithQuickPick` | Error propagation |
| TC-EXTCMD-N-02 | Extension activated; `generateTestFromWorkingTree` is stubbed | Equivalence – normal | Executing `dontforgetest.generateTestFromWorkingTree` calls `generateTestFromWorkingTree(provider)` exactly once | Avoids QuickPick UI by stubbing |
| TC-EXTCMD-E-02 | Extension activated; `generateTestFromWorkingTree` throws | Equivalence – error | Executing `dontforgetest.generateTestFromWorkingTree` rejects with the error from `generateTestFromWorkingTree` | Error propagation |
| TC-EXTCMD-N-03 | Extension activated; `showTestGenOutput` is stubbed | Equivalence – normal | Executing `dontforgetest.showTestGeneratorOutput` calls `showTestGenOutput(true)` exactly once | - |
| TC-EXTCMD-E-03 | Extension activated; `showTestGenOutput` throws | Equivalence – error | Executing `dontforgetest.showTestGeneratorOutput` rejects with the error from `showTestGenOutput` | Error propagation |
| TC-EXTCMD-N-04 | Extension activated; `selectDefaultModel` is stubbed | Equivalence – normal | Executing `dontforgetest.selectDefaultModel` calls `selectDefaultModel()` exactly once | Avoids UI hang by stubbing |
| TC-EXTCMD-E-04 | Extension activated; `selectDefaultModel` throws | Equivalence – error | Executing `dontforgetest.selectDefaultModel` rejects with the error from `selectDefaultModel` | Error propagation |
| TC-EXTCMD-N-05 | Extension activated; `vscode.commands.executeCommand` is wrapped for built-ins | Equivalence – normal | Executing `dontforgetest.openPanel` delegates to `executeCommand('workbench.view.extension.dontforgetest')` | Avoids UI dependency by stubbing built-in command |
| TC-EXTCMD-N-06 | Extension activated; `vscode.commands.executeCommand` is wrapped for built-ins | Equivalence – normal | Executing `dontforgetest.openSettings` delegates to `executeCommand('workbench.action.openSettings', 'dontforgetest')` | Avoids UI dependency by stubbing built-in command |
| TC-EXTCMD-E-05 | Built-in `workbench.action.openSettings` throws | Equivalence – error | Executing `dontforgetest.openSettings` propagates the error from the built-in command | Error propagation from VS Code built-in |
| TC-EXTCMD-N-07 | Workspace open; `findLatestArtifact` returns a perspective path | Equivalence – normal | Executing `dontforgetest.openLatestPerspective` opens the returned file path | Verify opened document path |
| TC-EXTCMD-E-06 | Workspace open; `findLatestArtifact` returns `undefined` for perspective | Equivalence – error | Executing `dontforgetest.openLatestPerspective` calls `showInformationMessage(t('artifact.latestPerspective.notFound'))` and does not open a document | User-facing not-found message |
| TC-EXTCMD-N-08 | Workspace open; `findLatestArtifact` returns an execution report path | Equivalence – normal | Executing `dontforgetest.openLatestExecutionReport` opens the returned file path | Verify opened document path |
| TC-EXTCMD-E-07 | Workspace open; `findLatestArtifact` returns `undefined` for execution report | Equivalence – error | Executing `dontforgetest.openLatestExecutionReport` calls `showInformationMessage(t('artifact.latestExecutionReport.notFound'))` and does not open a document | User-facing not-found message |
| TC-EXTCMD-N-09 | Extension activated; `fs.promises.readdir/stat` and `openTextDocument/showTextDocument` are stubbed | Equivalence – normal | Executing `dontforgetest.openLatestMergeInstruction` opens the `.md` file with the greatest `mtimeMs` in `<globalStorage>/merge-instructions` | Verify `openTextDocument` called with expected path |
| TC-EXTCMD-E-08 | `fs.promises.readdir` throws (e.g., ENOENT) | Equivalence – error | Executing `dontforgetest.openLatestMergeInstruction` calls `showInformationMessage(t('artifact.mergeInstruction.notFound'))` | Simulates missing directory without relying on real globalStorage path |
| TC-EXTCMD-E-09 | `readdir` returns only non-`.md` files | Equivalence – error | Executing `dontforgetest.openLatestMergeInstruction` calls `showInformationMessage(t('artifact.mergeInstruction.notFound'))` and does not open a document | No valid merge instruction files |
| TC-EXTCMD-E-10 | `fs.promises.stat` throws for one `.md` file but succeeds for another | Equivalence – error | The command opens the file with valid `mtimeMs`, treating the failed entry as `mtimeMs=0` | Tolerates partial stat failures |

