# Usage (Dontforgetest)

This document explains how to use the **Test Generation Agent** extension in VS Code / Cursor.

- Japanese docs: `usage.ja.md`

## Prerequisites

- You opened a workspace as a **folder** (single-file window is not supported)
- Cursor **2.2+** / VS Code **1.105+**
- `cursor-agent` is executable (available in PATH, or configured via settings)
- For diff-based sources, your workspace must be a **Git repository**

> **Important**: this extension runs `cursor-agent` with **`--force`**, and generated output may be written to real files.  
> Before running, prepare a rollback strategy (create a branch / commit / stash).  
> For diff-based sources, you can choose **Worktree (isolated)** which generates in a temporary worktree and applies only test diffs back to local when safe.

## Installation

### Install from VSIX (manual / distribution)

1. Open VS Code / Cursor
2. Open the command palette (macOS: Cmd+Shift+P)
3. Run **`Extensions: Install from VSIX...`**
4. Select the `.vsix` file
5. Reload if necessary

#### Alternative (from Explorer)

You can also install directly from the file tree without using the command palette:

1. Locate the `.vsix` file in the Explorer
2. Right-click the `.vsix` file
3. Select **`Install Extension VSIX`** (Japanese UI: **`拡張機能の VSIX のインストール`**)
4. Reload if necessary

### Try as a development build (when developing this repo)

1. Install dependencies: `npm install`
2. Build: `npm run compile`
3. Open this repository in VS Code and press **F5** (Run Extension)
4. Verify behavior in the Extension Development Host

## Settings

Search `dontforgetest.*` in VS Code / Cursor Settings.

- **`dontforgetest.cursorAgentPath`**: Path to `cursor-agent` (if empty, resolves from PATH)
- **`dontforgetest.defaultModel`**: Model passed to `cursor-agent --model` (if empty, auto)
- **`dontforgetest.testStrategyPath`**: Test strategy file path (if empty, uses the built-in default)
- **`dontforgetest.includeTestPerspectiveTable`**: Whether to generate and save a test perspective table before test generation (Default: true)
- **`dontforgetest.perspectiveReportDir`**: Output directory for generated perspective tables (Default: `docs/test-perspectives`)
- **`dontforgetest.testCommand`**: Test command to run after generation (Default: `npm test`, empty to skip)
- **`dontforgetest.testExecutionReportDir`**: Output directory for test execution reports (Default: `docs/test-execution-reports`)
- **`dontforgetest.testExecutionRunner`**: Who runs the tests (Default: `extension`)
  - `extension`: the extension runs `testCommand` locally and collects stdout/stderr/exitCode into a report
  - `cursorAgent`: `cursor-agent` runs tests and the extension extracts stdout/stderr/exitCode from the marked output
  - If `cursorAgent` refuses to run or returns an empty result, the extension performs an **automatic fallback** and runs the tests itself (a warning is logged)

## About the test strategy file

The test strategy file defines the rules for generation (e.g., perspective table format, requiring Given/When/Then comments).

- If the setting is empty: the extension uses the built-in default strategy automatically
- To customize: create any `.md` file and set its path in `dontforgetest.testStrategyPath`

### Example of a custom strategy file

To output in Japanese, add a config comment at the top:

```markdown
<!-- dontforgetest-config: {"answerLanguage":"ja","commentLanguage":"ja","perspectiveTableLanguage":"ja"} -->

## Test strategy rules

(Write your rules here)
```

## Basic usage (QuickPick recommended)

### 1) Start generation

1. Command palette → **`Dontforgetest: Generate Tests (QuickPick)`**
2. Select a **source**
   - Current file
   - Latest commit diff
   - Commit range diff
   - Uncommitted diff
3. (For latest commit diff / commit range diff) select an **execution target**
   - **Local**: edits your current workspace directly
   - **Worktree**: generates in a temporary worktree and applies only test diffs back to local (manual merge if auto-apply is not possible)
4. Select a **model**
   - Use `defaultModel` setting
   - Override by entering a model name
5. Start
   - Progress is shown in the **Output Channel**
   - The status bar shows running tasks (click to open logs)

### 2) Review outputs (perspective table / execution report)

- Perspective table: Command palette → **`Dontforgetest: Open Latest Perspective Table`**
- Execution report: Command palette → **`Dontforgetest: Open Latest Execution Report`**
- Manual merge assistance (when auto-apply fails): Command palette → **`Dontforgetest: Open Manual Merge Assistance (Latest)`**

## When to use which command

- **`Dontforgetest: Generate Tests (QuickPick)`**
  - Select source / target (if needed) / model and run (recommended)
- **`Dontforgetest: Open Panel`**
  - Opens the side panel (often easiest to choose Local / Worktree)
- **`Dontforgetest: Generate from Latest Commit Diff`**
  - Generates for the diff of `HEAD`
  - Errors if there is no commit yet
- **`Dontforgetest: Generate from Commit Range Diff`**
  - Examples: `main..HEAD`, `HEAD~3..HEAD`
- **`Dontforgetest: Generate from Uncommitted Diff`**
  - Select `staged` / `unstaged` / `both`
- **`Dontforgetest: Show Output Logs`**
  - Opens the Output Channel

## Troubleshooting

### `cursor-agent not found`

- Install / set up `cursor-agent`
- Set `dontforgetest.cursorAgentPath` to the full path

### Test strategy file cannot be loaded

- If the specified file does not exist, the built-in default strategy is used automatically
- If you want to use a custom strategy, ensure `dontforgetest.testStrategyPath` is correct

### `Cannot resolve Git HEAD`

- Ensure the repository has at least one commit

### Diff is too large

- The diff embedded into prompts is **truncated** beyond a certain size (a "truncated" marker is shown)

## Reference

- Built-in default strategy: `src/core/defaultTestStrategy.ts`

