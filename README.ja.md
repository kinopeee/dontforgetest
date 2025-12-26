# テスト生成エージェント（Dontforgetest）

**Don't forget test!** — コミット差分から、ワンクリックでテストを自動生成。

Cursor CLI（`cursor-agent`）をヘッドレスで呼び出し、コミット差分や選択範囲からテストコードを自動生成する Cursor 拡張機能です。

- English docs: `README.md`, `docs/usage.md`

## Requirements

- Cursor **2.2** 以降
- Cursor CLI（`cursor-agent`）

## 主な機能

- **QuickPick UI / 操作パネル**でソース/モデルを選択して実行
- **現在のファイル / 最新コミット差分 / コミット範囲差分 / 未コミット差分（staged/unstaged）**から生成
- **実行先（Local / Worktree）**を選択（コミット差分系）
  - **Local**: 現在のワークスペースを直接編集
  - **Worktree**: 一時worktreeで生成し、**テスト差分だけ**をローカルへ適用（`git apply --check` が通る場合のみ自動適用）
    - 自動適用できない場合は **パッチ/スナップショット/AI向け指示** を保存して手動マージへ誘導
- 実行ログを **Output Channel** に集約
- 観点表/実行レポート（Markdown）を保存（保存先は設定で変更可能）
- **ステータスバー**に実行中タスク数を表示（クリックでログ表示）

> **注意（重要）**: `cursor-agent` は **`--force` で実行**されます。  
> **Local** は実ファイル（現在のワークスペース）へ書き込みます。  
> **Worktree** は一時worktreeへ書き込み、`git apply --check` が通る場合のみ **テスト差分だけ** をローカルへ適用します（失敗時はパッチ/スナップショット/AI向け指示を保存）。  
> 必要に応じてブランチを切る／コミットする等の退避手段を用意してから実行してください。

## ドキュメント

- 目次: `docs/README.ja.md`
- 操作手順: `docs/usage.ja.md`
- 内蔵デフォルト戦略: `src/core/defaultTestStrategy.ts`（設定が空の場合に使用）

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

ローカルにインストール済みの Cursor を使って実行する場合は、実行ファイルのパスを指定します。

```bash
DONTFORGETEST_VSCODE_EXECUTABLE_PATH="<Cursor 実行ファイルのパス>" npm test
```

### 拡張機能の実行（デバッグ）

1. Cursor でこのリポジトリを開く
2. F5（Run Extension）
3. Extension Development Host のコマンドパレットで `Dontforgetest:` を実行

## ライセンス

このプロジェクトは **GPL-3.0**（GNU General Public License v3.0）ライセンスの下で公開されています。

詳細は [LICENSE](LICENSE) ファイルをご確認ください。

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
