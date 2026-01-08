# Changelog

## 0.0.125

### Fixed

- **extractBetweenMarkers**: Fixed infinite loop bug when `begin` marker is at index 0 and no corresponding `end` marker is found (caused by `String#lastIndexOf` treating negative `fromIndex` as 0)
- **runProviderToCompletion**: Enhanced exception handling to prevent event handler exceptions from blocking completion events and timeout processing

### Added

- **Settings**: Added `dontforgetest.testExecutionTimeoutMs` configuration option to control timeout for test execution via cursor-agent (default: 600000ms, 0 or less disables timeout)

### Changed

- **Test environment**: Increased test result file wait timeout from 3s to 120s to accommodate macOS `open -W` behavior
- **Test suite**: Added timeout configuration (2000ms) for test environment to prevent hanging when cursor-agent doesn't return completion events

---

## 0.0.125（日本語）

### 修正

- **extractBetweenMarkers**: `begin` マーカーがインデックス 0 にあり、対応する `end` マーカーが見つからない場合の無限ループバグを修正（`String#lastIndexOf` が負の `fromIndex` を 0 として扱うことが原因）
- **runProviderToCompletion**: イベントハンドラーの例外が completion イベントやタイムアウト処理を妨げないよう、例外処理を強化

### 追加

- **設定**: cursor-agent によるテスト実行のタイムアウトを制御する `dontforgetest.testExecutionTimeoutMs` 設定を追加（既定: 600000ms、0 以下でタイムアウト無効）

### 変更

- **テスト環境**: macOS の `open -W` の挙動に対応するため、テスト結果ファイルの待機タイムアウトを 3 秒から 120 秒に延長
- **テストスイート**: cursor-agent が completion イベントを返さない場合のスタックを防ぐため、テスト環境でのタイムアウト設定（2000ms）を追加

---

## 0.0.123

### Added

- Agent providers: Added support for **Gemini CLI** and **Codex CLI** as test generation backends
- Settings: Extended `dontforgetest.agentProvider` with `geminiCli` / `codexCli`, and added Codex-specific options (`dontforgetest.codexPromptCommand`, `dontforgetest.codexReasoningEffort`)
- UI: Settings panel now supports switching agent providers and choosing model candidates per provider

### Changed

- Preflight: Added command availability checks and guidance for Gemini/Codex CLI
- Model selection: Added provider-aware model candidate hints and default model validation

---

## 0.0.123（日本語）

### 追加

- エージェント: **Gemini CLI** / **Codex CLI** に対応し、テスト生成の実行バックエンドとして選択できるようになりました
- 設定: `dontforgetest.agentProvider` に `geminiCli` / `codexCli` を追加し、Codex 用の設定（`dontforgetest.codexPromptCommand` / `dontforgetest.codexReasoningEffort`）を追加しました
- UI: 設定パネルでエージェント切替と、プロバイダー別のモデル候補選択に対応しました

### 変更

- 事前チェック: Gemini/Codex CLI のコマンド存在確認と案内（設定/ドキュメント導線）を追加しました
- モデル選択: プロバイダー別のモデル候補（ヒント）と defaultModel の整合チェックを追加しました

---

## 0.0.121

### Changed

- Documentation: Added Open VSX badges (version, downloads) to improve registry listing visibility
- Marketplace metadata: Expanded keywords to improve discoverability on registries such as Open VSX

---

## 0.0.121（日本語）

### 変更

- ドキュメント: Open VSX のバッジ（バージョン/ダウンロード）を追加し、レジストリ上の表示を改善しました
- メタデータ: キーワードを拡充し、Open VSX 等で見つけやすくしました

---

## 0.0.120

### Changed

- Documentation: Unified editor compatibility to **VS Code 1.105+** (Cursor / VS Code / Windsurf / Antigravity) and generalized CLI agent wording (current: Cursor Agent / Claude Code; planned: Codex CLI)

### Fixed

- Settings: Fixed a potential TypeError when `dontforgetest.agentProvider` is configured with a non-string value by safely falling back to the default provider

---

## 0.0.120（日本語）

### 変更

- ドキュメント: 対応エディタ表記を **VS Code 1.105+** 互換（Cursor / VS Code / Windsurf / Antigravity）に統一し、CLI エージェント記載を汎用化しました（現在: Cursor Agent / Claude Code ｜対応予定: Codex CLI）

### 修正

- 設定: `dontforgetest.agentProvider` に文字列以外の値が設定された場合でも TypeError で落ちないようにし、デフォルトのプロバイダーへ安全にフォールバックするよう修正しました

---

## 0.0.119

### Added

- **Control Panel**: Show last test report summary (✅/❌, exitCode) directly on the panel so you can see success/failure at a glance without opening the full report
- **Documentation**: Clarified that Dontforgetest does **not** auto-fix failing tests; failures are surfaced so regressions are visible to developers. Strategy-compliance auto-correction (re-running generation) is a separate feature for improving generated test quality, not for hiding regressions.

---

## 0.0.119（日本語）

### 追加

- **操作パネル**: 最終テストレポートのサマリー（✅/❌、exitCode）をパネル上に表示し、レポートを開かずに成功・失敗を即座に確認できるようになりました
- **ドキュメント**: Dontforgetest は**テスト失敗を自動修正しない**方針を明確化しました。失敗はリグレッションを開発者に知らせるシグナルです。戦略準拠の自動修正（生成再実行）は生成品質向上のための機能であり、回帰を隠すものではありません。

---

## 0.0.118

### Added

- Strategy compliance check after generation (Given/When/Then, boundary values, exception message verification, and Case ID coverage when a perspective table is generated)
- Automatic fix attempts by re-running generation when strategy compliance issues are found (configurable)
- Compliance report saved when issues remain after automatic fix attempts

---

## 0.0.118（日本語）

### 追加

- 生成後の戦略準拠チェック（Given/When/Then、境界値、例外メッセージ検証、観点表生成時の Case ID 網羅）
- 戦略準拠の問題が見つかった場合に、生成の再実行で自動修正を試みる機能（試行回数は設定可能）
- 自動修正後も問題が残る場合に、準拠チェックレポートを保存する機能

---

## 0.0.117

### Changed

- Control Panel: Improved tab UI contrast by adopting a segmented-control style (clearer active/inactive state, better hover feedback)

### Fixed

- Test analyzer: Improved Given/When/Then detection (now also checks leading comments right before `test`/`it`, and supports combined comments such as `// When/Then:`)

---

## 0.0.117（日本語）

### 変更

- 操作パネル: タブ UI をセグメントコントロール形式に改善し、アクティブ/非アクティブのコントラストとホバー時フィードバックを向上

### 修正

- テスト分析: Given/When/Then 検知を改善（`test`/`it` 直前コメントも判定対象に追加、`// When/Then:` のような複合コメントも検知）

---

## 0.0.116

### Fixed

- Test analyzer: Fixed false negatives for empty-string boundary tests — empty string literals (`''`/`""`/` `` `) are now correctly detected from the original source code (previously invisible in `codeOnlyContent`)
- Test analyzer: Fixed potential argument boundary mis-detection in `assert.throws(...)` when a string/template literal is immediately followed by `/` (division) — prevents misclassifying division as a regex start

---

## 0.0.116（日本語）

### 修正

- テスト分析: 空文字リテラル（`''`/`""`/` `` `）が境界値テストとして検出されず誤って不足扱いになる問題を修正（元ソースから字句解析で検出するよう変更）
- テスト分析: 文字列/テンプレートリテラル直後の `/`（除算）が正規表現開始として誤判定され、`assert.throws(...)` の引数境界が崩れる可能性がある問題を修正（クォート終了時に `lastNonWsChar` を更新）

---

## 0.0.115

### Added

- **Test Analysis Feature (Phase 1)**: Analyze existing test files and suggest improvements
  - Detects missing Given/When/Then comments
  - Detects missing boundary value tests (null, undefined, 0, empty string, empty array)
  - Detects unverified exception messages (assert.throws / toThrow without message verification)
  - Generates Markdown analysis reports
- Control Panel: Added **tab UI** to switch between "Generate" and "Analyze"
- New command: **`Dontforgetest: Analyze Tests`**
- New command: **`Dontforgetest: Open Latest Analysis Report`**
- New settings:
  - `dontforgetest.analysisReportDir`: Output directory for analysis reports (Default: `docs/test-analysis-reports`)
  - `dontforgetest.analysisTestFilePattern`: Glob pattern for test files to analyze (Default: `src/test/**/*.test.ts`)

### Fixed

- Test analyzer: Fixed false positives for multi-line `assert.throws()` calls where the second argument is on a subsequent line

---

## 0.0.115（日本語）

### 追加

- **テスト分析機能（Phase 1）**: 既存テストファイルを分析し、改善点を提案
  - Given/When/Then コメント不足を検出
  - 境界値テスト不足を検出（null, undefined, 0, 空文字列, 空配列）
  - 例外メッセージ未検証を検出（assert.throws / toThrow でメッセージ検証なし）
  - Markdown 形式の分析レポートを生成
- 操作パネル: **タブ UI**を追加（「生成」と「分析」を切り替え）
- 新コマンド: **`Dontforgetest: テストを分析`**
- 新コマンド: **`Dontforgetest: 最新の分析レポートを開く`**
- 新設定:
  - `dontforgetest.analysisReportDir`: 分析レポートの保存先（既定: `docs/test-analysis-reports`）
  - `dontforgetest.analysisTestFilePattern`: 分析対象テストファイルのパターン（既定: `src/test/**/*.test.ts`）

### 修正

- テスト分析: 複数行にまたがる `assert.throws()` 呼び出しで第 2 引数が次行にある場合の誤検知を修正

---

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

- TaskManager: フェーズラベルを追跡し、UI へ通知するようにしました。
- 操作パネル: 現在のフェーズに応じて実行ボタンの表示（ラベル）を切り替えるようにしました。
- l10n: フェーズ別ラベルを追加しました。
- テスト: テストケースを拡充し、アサーションも強化しました（例: l10n の文言を完全一致で検証、TaskManager の通知ペイロードを完全一致で検証、missing taskId の no-op など境界条件の追加）。
- ESLint: インデントルールを追加しました。
- 拡張機能カテゴリ（マーケットプレイス向けメタデータ）:
  - 追加: **Testing**, **Machine Learning**
  - 削除: **Other**

### 修正

- ドキュメント: `README.md` のリンク切れを修正しました（日本語ドキュメント、docs index/usage、画像リンクなど）。
- ドキュメント: Open VSX 上で切れていた日本語ドキュメント/画像リンクを GitHub 絶対 URL へ変更しました。

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

- UI ラベル: 拡張機能全体でラベルを統一・簡略化しました：
  - 出力ビュー: **観点表**（維持）、**実行レポート** → **テストレポート**、**手動マージ**（維持）
  - 操作パネルボタン: **実行** → **生成**
  - 出力選択肢: **観点表+テスト生成** → **観点表+テスト**
  - コマンド名: **最新の実行レポートを開く** → **最新のテストレポートを開く**
- ドキュメント: 新しい UI ラベルに合わせて使用ドキュメントを更新しました。

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

- 操作パネル UI を **3 つのプルダウン（生成物/生成対象/生成先）＋ 実行ボタン** に整理しました。
- 生成先の挙動を明確化し、**未コミット差分**および**観点表のみ生成**では **Local 固定**（理由を 1 行表示）にしました。
