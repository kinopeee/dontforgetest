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

## 実行手順

### A) パッチバージョンを上げて VSIX を生成（推奨）

#### ワンライナー（コピペ用）

```bash
npm version patch --no-git-tag-version && npm run compile && npm test && VERSION=$(node -p "require('./package.json').version") && npx --yes @vscode/vsce package --out "testgenie-$VERSION.vsix" && echo "✅ 生成完了: testgenie-$VERSION.vsix"
```

#### ステップ実行（読みやすさ重視）

```bash
# 1) バージョンを上げる（git tag は付けない）
npm version patch --no-git-tag-version

# 2) ビルド＆テスト
npm run compile
npm test

# 3) VSIX を生成
VERSION=$(node -p "require('./package.json').version")
npx --yes @vscode/vsce package --out "testgenie-$VERSION.vsix"

# 4) 生成確認
echo "✅ 生成完了: testgenie-$VERSION.vsix"
```

### B) バージョンを上げずに VSIX を生成（ローカル検証用）

```bash
npm run compile && npm test && VERSION=$(node -p "require('./package.json').version") && npx --yes @vscode/vsce package --out "testgenie-$VERSION.vsix" && echo "✅ 生成完了: testgenie-$VERSION.vsix"
```

## バージョン更新のコミット

VSIX 生成後、`package.json` / `package-lock.json` の変更をコミットします。

```bash
git add package.json package-lock.json
git commit -m "chore: バージョンを$(node -p \"require('./package.json').version\")に更新"
```

または `/commit-only` スラッシュコマンドを使用してください。

## インストール方法

VS Code の拡張機能ビューで `...` → **Install from VSIX...** を選び、生成された `.vsix` を指定します。

## ノート

- `vsce package` は内部で `npm run vscode:prepublish`（= compile）を実行します。手順で先に `npm run compile` を実行しているため **compile は2回走ります**が、テストを先に回すための意図的な構成です。
- `*.vsix` がエクスプローラーに見えない場合は、VS Code の設定 `Explorer: Exclude Git Ignore` を確認してください。
- 生成物はリポジトリのルートに出力されます（例: `testgenie-0.0.11.vsix`）。
