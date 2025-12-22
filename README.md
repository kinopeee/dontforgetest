# テスト生成エージェント（TestGen Agent）

Cursor CLI（`cursor-agent`）をヘッドレスで呼び出し、コミット差分や選択範囲からテストコードを自動生成する VS Code / Cursor 拡張機能です。

## 主な機能

- **QuickPick UI**でソース/モデルを選択して実行
- **最新コミット差分 / コミット範囲差分 / 未コミット差分（staged/unstaged）**から生成
- 実行ログを **Output Channel** に集約
- **直近実行の差分プレビュー / ロールバック**（スナップショットベース）
- **ステータスバー**に実行中タスク数を表示（クリックでログ表示）

> **注意（重要）**: `cursor-agent` は **`--force` で実行**されるため、生成結果は実ファイルへ書き込まれます。  
> ブランチを切る／コミットする等の退避手段を用意してから実行してください。

## ドキュメント

- 操作手順: `docs/usage.md`
- テスト戦略: `docs/test-strategy.md`

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

### 拡張機能の実行（デバッグ）

1. VS Code / Cursor でこのリポジトリを開く
2. F5（Run Extension）
3. Extension Development Host のコマンドパレットで `TestGen:` を実行

## ライセンス

ISC
