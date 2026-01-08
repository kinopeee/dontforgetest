# Dontforgetest

**Don't forget test!** — コミット差分から、ワンクリックでテストを自動生成。

[Open VSX Version](https://open-vsx.org/extension/kinopeee/dontforgetest)
[Open VSX Downloads](https://open-vsx.org/extension/kinopeee/dontforgetest)

CLI エージェント（対応: Cursor CLI / Claude Code / Gemini CLI / Codex CLI）をヘッドレスで呼び出し、コミット差分や選択範囲からテストコードを自動生成する VS Code 互換拡張機能です。

- English docs: [README.md](https://github.com/kinopeee/dontforgetest/blob/main/README.md), [docs/usage.md](https://github.com/kinopeee/dontforgetest/blob/main/docs/usage.md)

## Requirements

- **VS Code 1.105+** 互換（Cursor / VS Code / Windsurf / Antigravity）
- CLI エージェント（例: `cursor-agent`、`claude`、`gemini`、`codex`）が実行可能であること

## 主な機能

- **QuickPick UI / 操作パネル**でソース/モデルを選択して実行
- **最新コミット差分 / コミット範囲差分 / 未コミット差分（staged / unstaged / both）**から生成
- **生成物**を選択
  - **観点表+テスト生成（既定）** / **テスト観点表のみ生成**
- **実行先（Local / Worktree）**を選択（コミット差分系）
  - **Local**: 現在のワークスペースを直接編集
  - **Worktree**: 一時 worktree で生成し、**テスト差分だけ**をローカルへ適用（`git apply --check` が通る場合のみ自動適用）
    - 自動適用できない場合は **パッチ/スナップショット/AI 向け指示** を保存して手動マージへ誘導
- 実行ログを **Output Channel** に集約
- 観点表/実行レポート（Markdown）を保存（保存先は設定で変更可能）
- **ステータスバー**に実行中タスク数を表示（クリックでログ表示）
- **操作パネル**: 直近のテストレポートサマリー（✅/❌ + exitCode）を表示し、レポートを開かずに成功・失敗を即座に確認可能
- **テスト分析機能**: 既存テストファイルを分析して改善点を提案
  - Given/When/Then コメント不足を検出
  - 境界値テスト不足を検出
  - 例外メッセージ未検証を検出
- **戦略準拠チェック（生成後）**: 生成されたテストコードが戦略に準拠しているかをチェックし、必要に応じて自動修正（生成の再実行）します
  - Given/When/Then、境界値、例外メッセージ検証をチェック
  - 観点表を生成している場合は **Case ID 網羅** もチェック（観点表の全 Case ID がテスト内に出現すること）
  - 自動修正後も問題が残る場合は、実行レポート保存先ディレクトリに準拠チェックレポートを保存
- **テスト失敗は自動修正しない**: 失敗はリグレッションを開発者に知らせるシグナルです。戦略準拠の自動修正（生成再実行）は生成品質向上のための機能であり、回帰を隠すものではありません。

## スクリーンショット

> 画像は `docs/images/` に配置します（詳細は `docs/images/README.md`）。  
> 表示幅は `width` で調整できます（※ **実ファイルサイズは減りません**）。

### テスト実行レポート

テスト実行レポート

### テスト観点表

テスト観点表

> **注意（重要）**: CLI エージェント（例: `cursor-agent` / `claude` / `gemini` / `codex`）は **`--force` で実行**される場合があります。  
> **Local** は実ファイル（現在のワークスペース）へ書き込みます。  
> **Worktree** は一時 worktree へ書き込み、`git apply --check` が通る場合のみ **テスト差分だけ** をローカルへ適用します（失敗時はパッチ/スナップショット/AI 向け指示を保存）。  
> 必要に応じてブランチを切る／コミットする等の退避手段を用意してから実行してください。

## ドキュメント

- **DeepWiki**: [deepwiki.com/kinopeee/dontforgetest](https://deepwiki.com/kinopeee/dontforgetest) — AI 生成のドキュメント（概要・アーキテクチャ・コンポーネント詳細）
- 目次: [docs/README.ja.md](https://github.com/kinopeee/dontforgetest/blob/main/docs/README.ja.md)
- 操作手順: [docs/usage.ja.md](https://github.com/kinopeee/dontforgetest/blob/main/docs/usage.ja.md)
- 内蔵デフォルト戦略: [src/core/defaultTestStrategy.ts](https://github.com/kinopeee/dontforgetest/blob/main/src/core/defaultTestStrategy.ts)（設定が空の場合に使用）

## 開発（このリポジトリを開発する場合）

### セットアップ

```bash
npm install
```

### ビルド

```bash
npm run compile
```

### ウォッチモード

```bash
npm run watch
```

### テスト

```bash
npm test
```

ローカルにインストール済みの VS Code 互換エディタ（例: VS Code / Cursor / Windsurf / Antigravity）を使って実行する場合は、実行ファイルのパスを指定します（環境変数名は互換性のため VSCODE のままです）。

```bash
DONTFORGETEST_VSCODE_EXECUTABLE_PATH="<エディタ実行ファイルのパス>" npm test
```

### 拡張機能の実行（デバッグ）

1. エディタ（Cursor / VS Code / Windsurf / Antigravity）でこのリポジトリを開く
2. F5（Run Extension）
3. Extension Development Host のコマンドパレットで `Dontforgetest:` を実行

## ライセンス

このプロジェクトは **GPL-3.0**（GNU General Public License v3.0）ライセンスの下で公開されています。

詳細は [LICENSE](https://github.com/kinopeee/dontforgetest/blob/main/LICENSE) ファイルをご確認ください。

[License: GPL-3.0](https://www.gnu.org/licenses/gpl-3.0)
