# Changelog

## 0.0.113 / 0.0.114

### Added

- Control Panel: show **generation phase** during execution.

### Changed

- TaskManager: track phase labels and notify the UI.
- Control Panel: switch the run button label depending on the current phase.
- l10n: add labels per generation phase.
- Tests: expanded test coverage and strengthened assertions (e.g., exact l10n literals and TaskManager notification payloads, plus edge cases such as missing taskId).
- ESLint: added indentation rules.
- Extension category (marketplace metadata):
  - Added: **Testing**, **Machine Learning**
  - Removed: **Other**

### Fixed

- Documentation: fixed broken links in `README.md` (Japanese docs links, docs index/usage links, and image links).
- Documentation: changed Japanese doc/image links to GitHub absolute URLs to fix broken links on Open VSX.

---

## 0.0.113 / 0.0.114（日本語）

### 追加

- 操作パネル: 実行中に **生成フェーズ** を表示するようにしました。

### 変更

- TaskManager: フェーズラベルを追跡し、UIへ通知するようにしました。
- 操作パネル: 現在のフェーズに応じて実行ボタンの表示（ラベル）を切り替えるようにしました。
- l10n: フェーズ別ラベルを追加しました。
- テスト: テストケースを拡充し、アサーションも強化しました（例: l10nの文言を完全一致で検証、TaskManagerの通知ペイロードを完全一致で検証、missing taskId の no-op など境界条件の追加）。
- ESLint: インデントルールを追加しました。
- 拡張機能カテゴリ（マーケットプレイス向けメタデータ）:
  - 追加: **Testing**, **Machine Learning**
  - 削除: **Other**

### 修正

- ドキュメント: `README.md` のリンク切れを修正しました（日本語ドキュメント、docs index/usage、画像リンクなど）。
- ドキュメント: Open VSX上で切れていた日本語ドキュメント/画像リンクをGitHub絶対URLへ変更しました。

---

## 0.0.112

### Changed

- UI labels: unified and simplified labels across the extension:
  - Output view: **Perspective Table** → **Perspective**, **Execution Report** → **Test report**, **Manual Merge** → **Manual merge** (Sentence case)
  - Control Panel button: **Run** → **Generate**
  - Output selection: **Perspective + tests** → **Perspective + test** (singular form)
  - Command names: **Open Latest Perspective Table** → **Open Latest Perspective**, **Open Latest Execution Report** → **Open Latest Test Report**
- Documentation: updated usage documentation to reflect the new UI labels.

---

## 0.0.112（日本語）

### 変更

- UIラベル: 拡張機能全体でラベルを統一・簡略化しました：
  - 出力ビュー: **観点表**（維持）、**実行レポート** → **テストレポート**、**手動マージ**（維持）
  - 操作パネルボタン: **実行** → **生成**
  - 出力選択肢: **観点表+テスト生成** → **観点表+テスト**
  - コマンド名: **最新の実行レポートを開く** → **最新のテストレポートを開く**
- ドキュメント: 新しいUIラベルに合わせて使用ドキュメントを更新しました。

---

## 0.0.111

### Added

- Control Panel: added **output selection** to choose between:
  - **Perspective table + Generate tests** (default)
  - **Generate perspective table only** (perspective-only mode)
- QuickPick: added **run mode selection** (full / perspective-only).

### Changed

- Control Panel UI: refactored into **three dropdowns** (Output / Target / Location) + a single **Run** button.
- Location behavior: **Worktree is locked** to Local when using **uncommitted diffs** or **perspective-only** mode (with an inline hint).

---

## 0.0.111（日本語）

### 追加

- 操作パネル: **生成物**を選べるようにしました
  - **観点表+テスト生成（既定）**
  - **テスト観点表のみ生成（観点表のみで終了）**
- QuickPick: **実行モード（full / perspectiveOnly）** を追加しました。

### 変更

- 操作パネルUIを **3つのプルダウン（生成物/生成対象/生成先）＋ 実行ボタン** に整理しました。
- 生成先の挙動を明確化し、**未コミット差分**および**観点表のみ生成**では **Local固定**（理由を1行表示）にしました。

