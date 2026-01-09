# テスト実行（ダウンロード許可・ネットワーク使用）

## 概要

`npm test` を実行します。VS Code がキャッシュに存在しない場合、**ネットワーク経由でダウンロード**します。

このコマンドは**ネットワークアクセスを使用する可能性があります**。Cursor のサンドボックス実行時は、ネットワーク権限プロンプトが表示される場合があります。

## 前提条件

- Node.js / npm が利用できること
- 依存関係がインストール済みであること（未実行なら `npm install`）
- ネットワークアクセスが可能であること（初回実行時、またはキャッシュが無い場合）

## ⚠️ Cursor サンドボックス権限について

このコマンドは**ネットワークアクセスを使用する可能性があります**。Cursor のサンドボックス実行時は、ネットワーク権限プロンプトが表示されます。

- 初回実行時、または VS Code キャッシュが無い場合: VS Code のダウンロードでネットワーク権限が必要
- キャッシュが存在する場合: ネットワーク権限は不要（ただし、Cursor の判定によりプロンプトが表示される可能性があります）

## 実行手順

### 標準実行

```bash
cd "$(git rev-parse --show-toplevel)" && npm test
```

### キャッシュパスを固定する場合

キャッシュパスを固定することで、2回目以降の実行でネットワーク権限が不要になる可能性があります。

```bash
cd "$(git rev-parse --show-toplevel)" && DONTFORGETEST_VSCODE_TEST_ROOT="$PWD/.cache/dontforgetest-vscode-test" npm test
```

> **注意**: `.cache/` ディレクトリは `.gitignore` に追加することを推奨します。

## オフライン実行版との使い分け

- **ネットワーク権限を避けたい場合**: `.claude/commands/test-offline.md` を使用
  - `DONTFORGETEST_VSCODE_EXECUTABLE_PATH` を設定して、既存の VS Code/Cursor 実行ファイルを指定
- **初回セットアップ時、またはキャッシュが無い場合**: このコマンド（`test-download`）を使用
  - 初回のみネットワーク権限が必要。以後はキャッシュが使われ、ネットワーク権限が不要になる可能性が高い

## 参照

- オフライン実行版: `.claude/commands/test-offline.md`
- テスト実行の詳細: `src/test/runTest.ts` の `resolveVscodeExecutablePath()`
