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
npm version patch --no-git-tag-version && npm run compile && npm test && VERSION=$(node -p "require('./package.json').version") && npx --yes @vscode/vsce package --out "chottotest-$VERSION.vsix" --allow-missing-repository --no-rewrite-relative-links && echo "✅ 生成完了: chottotest-$VERSION.vsix"
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
VERSION=$(node -p "require('./package.json').version")
npx --yes @vscode/vsce package --out "chottotest-$VERSION.vsix" --allow-missing-repository --no-rewrite-relative-links

# 4) 生成確認
echo "✅ 生成完了: chottotest-$VERSION.vsix"
```

### B) バージョンを上げずに VSIX を生成（ローカル検証用）

```bash
npm run compile && npm test && VERSION=$(node -p "require('./package.json').version") && npx --yes @vscode/vsce package --out "chottotest-$VERSION.vsix" --allow-missing-repository --no-rewrite-relative-links && echo "✅ 生成完了: chottotest-$VERSION.vsix"
```

### C) テストをスキップして VSIX を生成（高速化）

テストが VS Code 起動を必要とする場合や、ビルドのみ確認したい場合：

```bash
npm version patch --no-git-tag-version && npm run compile && VERSION=$(node -p "require('./package.json').version") && npx --yes @vscode/vsce package --out "chottotest-$VERSION.vsix" --allow-missing-repository --no-rewrite-relative-links && echo "✅ 生成完了: chottotest-$VERSION.vsix"
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
- `package.json` に `repository` が無い場合、`vsce` は警告するため `--allow-missing-repository` を付与しています。
- `--no-rewrite-relative-links` は README.md 内の相対リンク（例: `[LICENSE](LICENSE)`）の書き換えをスキップします。リポジトリURLが検出できない場合のエラーを回避するために必要です。
- `npm test` が `@vscode/test-electron` を使用する場合、VS Code を別プロセスで起動するため、テスト実行は長時間かかるかスキップされる可能性があります。VSIX 生成自体には影響しません。
- `LICENSE` が無い場合も `vsce` が警告します（パッケージ生成は可能）。配布を想定するなら `LICENSE` / `LICENSE.md` / `LICENSE.txt` を追加してください。
- `*.vsix` がエクスプローラーに見えない場合は、VS Code の設定 `Explorer: Exclude Git Ignore` を確認してください。
- 生成物はリポジトリのルートに出力されます（例: `chottotest-0.0.15.vsix`）。
