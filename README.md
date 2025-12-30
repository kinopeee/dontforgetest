# Dontforgetest

**Don't forget test!** — One-click, commit-based test generation for Cursor.

Powered by Cursor CLI (`cursor-agent`), this extension automatically generates test code from commit diffs and selections.

- Japanese docs: [README.ja.md](https://github.com/kinopeee/dontforgetest/blob/main/README.ja.md), [docs/usage.ja.md](https://github.com/kinopeee/dontforgetest/blob/main/docs/usage.ja.md)

## Key features

- Run via **QuickPick UI / Control Panel** (choose source + model)
- Generate from:
  - Latest commit diff
  - Commit range diff
  - Uncommitted diff (staged / unstaged / both)
- Select output:
  - **Perspective table + Generate tests (default)** / **Generate perspective table only**
- Choose execution target (diff-based sources):
  - **Local**: writes directly into your current workspace
  - **Worktree**: generates in a temporary worktree and applies **only test diffs** back to local *only when* `git apply --check` passes
    - If auto-apply fails, it saves **patch / snapshot / AI instructions** to help manual merging
- Consolidates logs in an **Output Channel**
- Saves **test perspective tables** and **test execution reports** (Markdown; output directories are configurable)
- Shows running task count in the **Status Bar** (click to open logs)

## Screenshots

> Place screenshots under `docs/images/` (see `docs/images/README.md`).  
> Use `width` to limit display size (note: **this does not reduce the actual file size**).

### Test execution report

![Test execution report](https://raw.githubusercontent.com/kinopeee/dontforgetest/main/docs/images/fig1.png)

### Test perspective table

![Test perspective table](https://raw.githubusercontent.com/kinopeee/dontforgetest/main/docs/images/fig2.png)

> **Important**: `cursor-agent` is executed with **`--force`**.  
> **Local** modifies real files in your workspace.  
> **Worktree** writes to a temporary worktree and applies only test diffs when safe; otherwise it exports merge artifacts.  
> Before running, prepare a rollback strategy (create a branch / commit / stash).

## Documentation

- Docs index: [docs/README.md](https://github.com/kinopeee/dontforgetest/blob/main/docs/README.md)
- Usage: [docs/usage.md](https://github.com/kinopeee/dontforgetest/blob/main/docs/usage.md)
- Built-in default strategy: [src/core/defaultTestStrategy.ts](https://github.com/kinopeee/dontforgetest/blob/main/src/core/defaultTestStrategy.ts) (used when the setting is empty)

## Requirements

- Cursor **2.2+**
- Cursor CLI (`cursor-agent`)

## Development (for contributors)

### Setup

```bash
npm install
```

### Build

```bash
npm run compile
```

### Watch mode

```bash
npm run watch
```

### Test

```bash
npm test
```

To use a locally installed Cursor, set the executable path (keep the env var name for compatibility).

```bash
DONTFORGETEST_VSCODE_EXECUTABLE_PATH="<path to Cursor executable>" npm test
```

### Run extension (debug)

1. Open this repository in Cursor
2. Press F5 (Run Extension)
3. In the Extension Development Host, run commands starting with `Dontforgetest:` from the command palette

## License

This project is licensed under **GPL-3.0** (GNU General Public License v3.0).

See [LICENSE](https://github.com/kinopeee/dontforgetest/blob/main/LICENSE) for details.

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
