# VSIXビルド（実装後）

## 概要

実装後に、拡張機能を配布可能な `.vsix` としてビルドするための手順です。

- バージョンを上げる（`package.json` / `package-lock.json` を同期）
- コンパイル・テストを実行
- `vsce` で `.vsix` を生成

## 前提条件

- Node.js / npm が利用できること
- 依存関係がインストール済みであること（未実行なら `npm install`）
- `.vsix` は `.gitignore` で無視される（成果物はGit管理しない）

## ⚠️ Cursor 実行中のテスト実行について

**注意**: macOS + Cursor 環境では、`@vscode/test-electron` が起動するテスト用 VS Code プロセスが `code=15`（SIGTERM相当）で終了する場合があります。

本リポジトリでは `src/test/runTest.ts` で以下の回避策を実装し、Cursor 実行中でも `npm test` が完走しやすいようにしています：

- VS Code（テスト用）のダウンロード/cache、`user-data-dir`、`extensions-dir`、ワークスペースを **OSの一時ディレクトリ配下に隔離**
- macOS では VS Code を **`open -n -W` 経由で起動**（親子関係を切って kill に巻き込まれにくくする）
- 拡張機能本体を **一時ディレクトリへ退避（staging）**して起動（Cursor の検知条件から外すため）。依存解決のため `node_modules` はシンボリックリンクで参照

それでも不安定な場合は、起動方式を環境変数で切り替えできます：

- `DONTFORGETEST_VSCODE_TEST_LAUNCHER=open`：`open` 起動を強制
- `DONTFORGETEST_VSCODE_TEST_LAUNCHER=direct`：従来の `spawn` 起動を強制

### 対策1: 起動方式を切り替えてテスト

```bash
DONTFORGETEST_VSCODE_TEST_LAUNCHER=open npm test
# または
DONTFORGETEST_VSCODE_TEST_LAUNCHER=direct npm test
```

### 対策2: Cursor を終了してからテスト

```bash
pkill -f Cursor && sleep 2 && npm test
```

### 対策3: テストをスキップしてビルド

テストは CI 環境（GitHub Actions 等）で実行し、ローカルでは手順 C) を使用。

### 対策4: CI/CD でテスト

GitHub Actions 等では問題なく全テストが完走します。

## 実行手順

### スラッシュコマンド用（CLI）：ビルド→VSIX生成→インストール（最短）

```bash
cd "$(git rev-parse --show-toplevel)" && npm run vsix:build
```

次にインストール：

```bash
cd "$(git rev-parse --show-toplevel)" && npm run vsix:install
```

> **注意**: インストール後、拡張機能を有効にするには IDE のリロード（`Developer: Reload Window`）が必要な場合があります。

### A) パッチバージョンを上げて VSIX を生成（推奨）

#### ワンライナー（最短）

```bash
npm version patch --no-git-tag-version && npm run compile && npm test && npm run vsix:build && echo "✅ 生成完了: dontforgetest-$(node -p \"require('./package.json').version\").vsix"
```

> **注意**: `npm test` が VS Code を起動する場合（`@vscode/test-electron` 使用時）、テストは長時間かかるかスキップされる可能性があります。VSIX 生成自体には影響しません。

#### ステップ実行（読みやすさ重視）

```bash
# 1) バージョンを上げる（git tag は付けない）
npm version patch --no-git-tag-version

# 2) ビルド＆テスト
npm run compile
npm test

# 3) VSIX を生成
npm run vsix:build

# 4) 生成確認
echo "✅ 生成完了: dontforgetest-$VERSION.vsix"
```

### B) バージョンを上げずに VSIX を生成（ローカル検証用）

```bash
npm run compile && npm test && npm run vsix:build && echo "✅ 生成完了: dontforgetest-$(node -p \"require('./package.json').version\").vsix"
```

### C) テストをスキップして VSIX を生成（高速化）

テストが VS Code 起動を必要とする場合や、ビルドのみ確認したい場合：

```bash
npm version patch --no-git-tag-version && npm run compile && npm run vsix:build && echo "✅ 生成完了: dontforgetest-$(node -p \"require('./package.json').version\").vsix"
```

## バージョン更新のコミット

VSIX 生成後、`package.json` / `package-lock.json` の変更をコミットします。

```bash
git add package.json package-lock.json
git commit -m "chore: バージョンを$(node -p \"require('./package.json').version\")に更新"
```

または `.claude/commands/commit-only.md` を参照してください。

## インストール方法

### GUI からインストール

VS Code の拡張機能ビューで `...` → **Install from VSIX...** を選び、生成された `.vsix` を指定します。

### CLI からインストール（自動化）

コマンドラインから直接インストールできます。`--force` で既存バージョンを上書きします。

```bash
cd "$(git rev-parse --show-toplevel)" && npm run vsix:install
```

> **備考**: Cursor 環境では `code` コマンドも `cursor` コマンドも Cursor を指します。どちらを使っても同じです。

### ビルド＆インストール（分割推奨）

CLI 実行では **ビルドとインストールを分けた方が失敗時に再試行しやすく、結果も確認しやすい**です。

```bash
cd "$(git rev-parse --show-toplevel)" && npm run vsix:build
cd "$(git rev-parse --show-toplevel)" && npm run vsix:install
```

バージョンも上げる場合：

```bash
cd "$(git rev-parse --show-toplevel)" && npm run vsix:build:bump
cd "$(git rev-parse --show-toplevel)" && npm run vsix:install
```

## ⚠️ Cursor サンドボックス権限について

`npm run vsix:build` を使用する場合、`@vscode/vsce` は `devDependencies` に含まれているため、**ネットワークアクセスは不要**です（`npm install` 時のみネットワークが必要）。

手動で `npm exec -- vsce` を使用する場合も同様に、ローカルの `node_modules` から実行されるため、ネットワーク権限プロンプトは表示されません。

## ノート

- `vsce package` は内部で `npm run vscode:prepublish`（= compile）を実行します。手順で先に `npm run compile` を実行しているため **compile は2回走ります**が、テストを先に回すための意図的な構成です。
- `package.json` に `repository` が無い場合、`vsce` は警告するため `--allow-missing-repository` を付与しています。
- `--no-rewrite-relative-links` は README.md 内の相対リンク（例: `[LICENSE](LICENSE)`）の書き換えをスキップします。リポジトリURLが検出できない場合のエラーを回避するために必要です。
- `npm test` が `@vscode/test-electron` を使用する場合、VS Code を別プロセスで起動するため、テスト実行は長時間かかるかスキップされる可能性があります。VSIX 生成自体には影響しません。
- `LICENSE` が無い場合も `vsce` が警告します（パッケージ生成は可能）。配布を想定するなら `LICENSE` / `LICENSE.md` / `LICENSE.txt` を追加してください。
- `*.vsix` がエクスプローラーに見えない場合は、VS Code の設定 `Explorer: Exclude Git Ignore` を確認してください。
- 生成物はリポジトリのルートに出力されます（例: `dontforgetest-0.0.15.vsix`）。
