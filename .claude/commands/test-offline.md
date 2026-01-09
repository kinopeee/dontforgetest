# テスト実行（オフライン・ネットワーク不要）

## 概要

ネットワークアクセスを**一切使用せず**に `npm test` を実行します。

`DONTFORGETEST_VSCODE_EXECUTABLE_PATH` 環境変数で既存の VS Code/Cursor 実行ファイルを指定することで、VS Code のダウンロードをスキップし、ネットワーク権限プロンプトを回避します。

## 前提条件

- `DONTFORGETEST_VSCODE_EXECUTABLE_PATH` 環境変数が設定済みであること
- 指定されたパスに VS Code/Cursor の実行ファイルが存在すること
- Node.js / npm が利用できること
- 依存関係がインストール済みであること（未実行なら `npm install`）

## ⚠️ Cursor サンドボックス権限について

このコマンドは**ネットワークアクセスを一切使用しません**。Cursor のサンドボックス実行時にネットワーク権限プロンプトは表示されません。

## VS Code 実行ファイルパスの設定例

事前にシェルの設定ファイル（`.zshrc` / `.bashrc` 等）に追加しておくことを推奨します。

### macOS

```bash
# VS Code の場合
export DONTFORGETEST_VSCODE_EXECUTABLE_PATH="/Applications/Visual Studio Code.app/Contents/MacOS/Electron"

# Cursor の場合
export DONTFORGETEST_VSCODE_EXECUTABLE_PATH="/Applications/Cursor.app/Contents/MacOS/Electron"
```

### Windows（PowerShell プロファイル）

```powershell
# VS Code の場合
$env:DONTFORGETEST_VSCODE_EXECUTABLE_PATH="C:\Program Files\Microsoft VS Code\Code.exe"

# Cursor の場合
$env:DONTFORGETEST_VSCODE_EXECUTABLE_PATH="C:\Users\<ユーザー名>\AppData\Local\Programs\cursor\Cursor.exe"
```

### Linux

```bash
# VS Code の場合
export DONTFORGETEST_VSCODE_EXECUTABLE_PATH="/usr/bin/code"

# Cursor の場合
export DONTFORGETEST_VSCODE_EXECUTABLE_PATH="/usr/bin/cursor"
```

## 実行手順

### スラッシュコマンド用（CLI）

環境変数が設定済みであることを前提に、以下を実行します。

```bash
cd "$(git rev-parse --show-toplevel)" && npm test
```

> **注意**: `DONTFORGETEST_VSCODE_EXECUTABLE_PATH` が未設定の場合、VS Code のダウンロードが発生し、ネットワーク権限が必要になります。

### 環境変数の確認方法

```bash
echo "$DONTFORGETEST_VSCODE_EXECUTABLE_PATH"
```

設定されていない場合は空文字が表示されます。上記の設定例を参考に環境変数を設定してください。

## 参照

- VS Code ダウンロードを許容する版: `.claude/commands/test-download.md`
- テスト実行の詳細: `src/test/runTest.ts` の `resolveVscodeExecutablePath()`
