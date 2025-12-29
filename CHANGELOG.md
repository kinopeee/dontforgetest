# Changelog

## 0.0.110

### Added

- Control Panel: added **output selection** to choose between:
  - **Perspective table + Generate tests** (default)
  - **Generate perspective table only** (perspective-only mode)
- QuickPick: added **run mode selection** (full / perspective-only).

### Changed

- Control Panel UI: refactored into **three dropdowns** (Output / Target / Location) + a single **Run** button.
- Location behavior: **Worktree is locked** to Local when using **uncommitted diffs** or **perspective-only** mode (with an inline hint).

---

## 0.0.110（日本語）

### 追加

- 操作パネル: **生成物**を選べるようにしました
  - **観点表+テスト生成（既定）**
  - **テスト観点表のみ生成（観点表のみで終了）**
- QuickPick: **実行モード（full / perspectiveOnly）** を追加しました。

### 変更

- 操作パネルUIを **3つのプルダウン（生成物/生成対象/生成先）＋ 実行ボタン** に整理しました。
- 生成先の挙動を明確化し、**未コミット差分**および**観点表のみ生成**では **Local固定**（理由を1行表示）にしました。

