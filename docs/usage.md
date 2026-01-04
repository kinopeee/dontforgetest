# Usage (Dontforgetest)

This document explains how to use the **Test Generation Agent** extension in VS Code-compatible editors (Cursor / VS Code / Windsurf).

- Japanese docs: `usage.ja.md`

## Prerequisites

- You opened a workspace as a **folder** (single-file window is not supported)
- **VS Code 1.105+** compatible (Cursor / VS Code / Windsurf)
- CLI agent executable (e.g., `cursor-agent` or `claude`; available in PATH, or configured via settings)
- For diff-based sources, your workspace must be a **Git repository**
- **Currently verified only on macOS** (Windows/Linux are not verified yet)

> **Important**: CLI agents (e.g., `cursor-agent`) may run with **`--force`**, and generated output may be written to real files.  
> Before running, prepare a rollback strategy (create a branch / commit / stash).  
> For diff-based sources, you can choose **Worktree (isolated)** which generates in a temporary worktree and applies only test diffs back to local when safe.

## Installation

### Install from VSIX (manual / distribution)

1. Open your editor (Cursor / VS Code / Windsurf)
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
3. Open this repository in your editor (Cursor / VS Code / Windsurf) and press **F5** (Run Extension)
4. Verify behavior in the Extension Development Host

## Settings

Search `dontforgetest.*` in your editor Settings (Cursor / VS Code / Windsurf).

- **`dontforgetest.agentProvider`**: Agent provider for test generation (Default: `cursorAgent`)
  - `cursorAgent`: Use Cursor Agent CLI (`cursor-agent`)
  - `claudeCode`: Use Claude Code CLI (`claude`)
- **`dontforgetest.cursorAgentPath`**: Path to `cursor-agent` (if empty, resolves from PATH)
- **`dontforgetest.claudePath`**: Path to `claude` command for Claude Code CLI (if empty, resolves from PATH)
- **`dontforgetest.defaultModel`**: Model passed to the agent `--model` option (if empty, auto)

- **`dontforgetest.testStrategyPath`**: Test strategy file path (if empty, uses the built-in default)
- **`dontforgetest.includeTestPerspectiveTable`**: Whether to generate and save a test perspective table before test generation (Default: true)
- **`dontforgetest.perspectiveReportDir`**: Output directory for generated perspective tables (Default: `docs/test-perspectives`)
- **`dontforgetest.testCommand`**: Test command to run after generation (Default: `npm test`, empty to skip)
- **`dontforgetest.testExecutionReportDir`**: Output directory for test execution reports (Default: `docs/test-execution-reports`)
- **`dontforgetest.testExecutionRunner`**: Who runs the tests (Default: `extension`)
  - `extension`: the extension runs `testCommand` locally and collects stdout/stderr/exitCode into a report
  - `cursorAgent`: `cursor-agent` runs tests and the extension extracts stdout/stderr/exitCode from the marked output
  - If `cursorAgent` refuses to run or returns an empty result, the extension performs an **automatic fallback** and runs the tests itself (a warning is logged)

- **`dontforgetest.analysisReportDir`**: Output directory for test analysis reports (Default: `docs/test-analysis-reports`)
- **`dontforgetest.analysisTestFilePattern`**: Glob pattern for test files to analyze (Default: `src/test/**/*.test.ts`)
- **`dontforgetest.enableStrategyComplianceCheck`**: Check generated test code for strategy compliance after generation (Default: true)
  - Checks Given/When/Then, boundary values, exception message verification
  - If a perspective table was generated: checks Case ID coverage (all Case IDs must appear in test files)
- **`dontforgetest.strategyComplianceAutoFixMaxRetries`**: Maximum number of automatic fix attempts when strategy compliance issues are found (Default: 1)
  - `0`: no automatic fix (report only)
  - `1..5`: re-runs generation to fix issues (up to the given number of attempts)
  - When issues remain after attempts: saves `compliance-report_YYYYMMDD_HHmmss.md` under `dontforgetest.testExecutionReportDir`

> **Note (model names)**: The model name for `dontforgetest.defaultModel` must be one of the names listed by Cursor Agent CLI (`cursor-agent`) via **`/model`**.
>
> Example (as of 2025-12-25):
>
> ```
> composer-1
> auto
> sonnet-4.5
> sonnet-4.5-thinking
> opus-4.5
> opus-4.5-thinking
> gemini-3-pro
> gemini-3-flash
> gpt-5.2
> gpt-5.1
> gpt-5.2-high
> gpt-5.1-high
> gpt-5.1-codex
> gpt-5.1-codex-high
> gpt-5.1-codex-max
> gpt-5.1-codex-max-high
> opus-4.1
> grok
> ```

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

## Basic usage

### 1) Run from the panel (GUI)

Run from the side panel (**`Dontforgetest: Open Panel`**).

1. Select **Output**
   - **Perspective + test (default)**: generates a perspective table → generates tests → (depending on settings) runs tests
   - **Perspective only**: generates only the perspective table (skips test generation/execution)
2. Select **Target**
   - **Uncommitted diff / Latest commit diff / Commit range diff**
3. Select **Location**
   - You can select **Local / Worktree** (Local may be locked depending on conditions)
   - For **uncommitted diffs**, Location is locked to **Local**
   - For **perspective-only output**, Location is locked to **Local**
4. Click **Generate**
   - You can track progress in **Progress**
   - After test execution completes, the result summary (✅/❌ + exitCode) is displayed directly on the panel
5. After completion, open outputs from **Output**
   - Click **Perspective** / **Test report** to open the latest one
   - If applying back to **Local** failed in Worktree, you can open the **instruction prompt file** via **Manual merge**

> **Note**: Dontforgetest generates and executes tests, but does **not** automatically fix failing tests.
> Failures are surfaced so regressions are visible to developers.
> If you see ❌ on the panel, check the test report for details.

### 2) Run via QuickPick (Command Palette)

1. Command palette → **`Dontforgetest: Generate Tests (QuickPick)`**
2. Select a **source**
   - Latest commit diff
   - Commit range diff
   - Uncommitted diff
3. Select an **output**
   - Perspective + test
   - Perspective only
4. (For latest commit diff / commit range diff AND full output) select a **location**
   - **Local**: edits your current workspace directly
   - **Worktree**: generates in a temporary worktree and applies only test diffs back to local (manual merge if auto-apply is not possible)
5. Select a **model**
   - Use `defaultModel` setting
   - Override by entering a model name
6. Start
   - Progress is shown in the **Output Channel**
   - The status bar shows running tasks (click to open logs)

### 3) Review outputs (perspective / test report / analysis report)

- Perspective: Command palette → **`Dontforgetest: Open Latest Perspective`**
- Test Report: Command palette → **`Dontforgetest: Open Latest Test Report`**
- Analysis Report: Command palette → **`Dontforgetest: Open Latest Analysis Report`**
- Manual merge assistance (when auto-apply fails): Command palette → **`Dontforgetest: Open Manual Merge Assistance (Latest)`**

### 4) Test Analysis (Suggest improvements for existing tests)

You can analyze existing test files from the **Analyze** tab in the Control Panel.

1. Select the **Analyze** tab in the Control Panel
2. Select **Analysis Target**
   - **All test files**: All files matching `analysisTestFilePattern` setting
   - **Current file**: Only the file open in the editor
3. Click **Analyze**
4. After completion, the report opens automatically

#### Detection items

- **Missing Given/When/Then comments**: No structured comments in test functions
- **Missing boundary value tests**: No tests for null, undefined, 0, empty string, empty array (only counts actual code usage; ignores mentions in strings/comments)
- **Unverified exception messages**: `assert.throws()` without message verification (including type-only), or `.toThrow()` without an argument

## When to use which command

- **`Dontforgetest: Generate Tests (QuickPick)`**
  - Select source / target (if needed) / model and run
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
- **`Dontforgetest: Analyze Tests`**
  - Analyzes existing test files and suggests improvements
- **`Dontforgetest: Open Latest Analysis Report`**
  - Opens the latest analysis report

## Troubleshooting

### `cursor-agent not found` / `claude command not found`

- Install / set up the corresponding CLI tool
- For Cursor Agent (`cursor-agent`): Set `dontforgetest.cursorAgentPath` to the full path
- For Claude Code: Set `dontforgetest.claudePath` to the full path

### Test strategy file cannot be loaded

- If the specified file does not exist, the built-in default strategy is used automatically
- If you want to use a custom strategy, ensure `dontforgetest.testStrategyPath` is correct

### `Cannot resolve Git HEAD`

- Ensure the repository has at least one commit

### Diff is too large

- The diff embedded into prompts is **truncated** beyond a certain size (a "truncated" marker is shown)

## Reference

- Built-in default strategy: `src/core/defaultTestStrategy.ts`

