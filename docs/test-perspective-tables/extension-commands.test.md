# Test Perspective Table: `src/extension.ts` command handlers / `src/test/suite/extension/commandHandlers.test.ts`

This table documents the test design (perspectives) for the command handler coverage tests in `commandHandlers.test.ts`.

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---|---|---|---|---|
| TC-EXTCMD-N-01 | Extension activated; `generateTestWithQuickPick` is stubbed | Equivalence – normal | Executing `dontforgetest.generateTest` calls `generateTestWithQuickPick(provider, context)` exactly once | Avoids UI hang by stubbing |
| TC-EXTCMD-N-02 | Extension activated; `generateTestFromWorkingTree` is stubbed | Equivalence – normal | Executing `dontforgetest.generateTestFromWorkingTree` calls `generateTestFromWorkingTree(provider)` exactly once | Avoids QuickPick UI by stubbing |
| TC-EXTCMD-N-03 | Extension activated; `showTestGenOutput` is stubbed | Equivalence – normal | Executing `dontforgetest.showTestGeneratorOutput` calls `showTestGenOutput(true)` exactly once | - |
| TC-EXTCMD-N-04 | Extension activated; `vscode.commands.executeCommand` is stubbed for built-ins | Equivalence – normal | Executing `dontforgetest.openPanel` calls `executeCommand('workbench.view.extension.dontforgetest')` | Avoids UI dependency by stubbing built-in command |
| TC-EXTCMD-N-05 | Extension activated; `vscode.commands.executeCommand` is stubbed for built-ins | Equivalence – normal | Executing `dontforgetest.openSettings` calls `executeCommand('workbench.action.openSettings', 'dontforgetest')` | Avoids UI dependency by stubbing built-in command |
| TC-EXTCMD-N-06 | Workspace open; latest perspective file exists under `docs/test-perspectives/` | Equivalence – normal | Executing `dontforgetest.openLatestPerspective` opens the latest matching file (`test-perspectives_*.md`) | Verify opened document path |
| TC-EXTCMD-E-01 | Workspace open; no matching perspective artifact exists | Equivalence – error | Executing `dontforgetest.openLatestPerspective` calls `showInformationMessage(t('artifact.latestPerspective.notFound'))` and does not open a document | Error path, observable via info message |
| TC-EXTCMD-N-07 | Workspace open; latest execution report exists under `docs/test-execution-reports/` | Equivalence – normal | Executing `dontforgetest.openLatestExecutionReport` opens the latest matching file (`test-execution_*.md`) | Verify opened document path |
| TC-EXTCMD-E-02 | Workspace open; no matching execution report artifact exists | Equivalence – error | Executing `dontforgetest.openLatestExecutionReport` calls `showInformationMessage(t('artifact.latestExecutionReport.notFound'))` and does not open a document | - |
| TC-EXTCMD-N-08 | Extension activated; `fs.promises.readdir/stat` and `openTextDocument/showTextDocument` are stubbed | Equivalence – normal | Executing `dontforgetest.openLatestMergeInstruction` opens the `.md` file with the greatest `mtimeMs` in `<globalStorage>/merge-instructions` | Verify `openTextDocument` called with expected path |
| TC-EXTCMD-E-03 | `fs.promises.readdir` throws (missing directory) | Equivalence – error | Executing `dontforgetest.openLatestMergeInstruction` calls `showInformationMessage(t('artifact.mergeInstruction.notFound'))` | Simulates missing directory without relying on real globalStorage path |
| TC-EXTCMD-E-04 | `fs.promises.stat` throws for a candidate `.md` file | Equivalence – error | The failing entry is treated as `mtimeMs=0` and does not prevent selecting the latest valid file | Covers stat-failure branch; verify chosen file |

