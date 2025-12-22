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

## 実行手順（対話なし）

### A) パッチバージョンを上げて VSIX を生成（推奨）

```bash
# 1) バージョンを上げる（git tag は付けない）
npm version patch --no-git-tag-version

# 2) ビルド＆テスト
npm run compile
npm test

# 3) VSIX を生成（package.json の version をファイル名に反映）
VERSION=$(node -p "require('./package.json').version")
npx --yes @vscode/vsce package --out "testgen-agent-$VERSION.vsix"
```

### B) バージョンを上げずに VSIX を生成（ローカル検証用）

```bash
npm run compile
npm test

VERSION=$(node -p "require('./package.json').version")
npx --yes @vscode/vsce package --out "testgen-agent-$VERSION.vsix"
```

## インストール方法

VS Code の拡張機能ビューで `...` → **Install from VSIX...** を選び、生成された `.vsix` を指定します。

## ノート

- `vsce package` は `npm run vscode:prepublish` を自動で実行します（= compile が走ります）。
- `*.vsix` がエクスプローラーに見えない場合は、VS Code の設定 `Explorer: Exclude Git Ignore` を確認してください。
- 生成物はリポジトリのルートに出す運用を想定しています（例: `testgen-agent-0.0.8.vsix`）。

