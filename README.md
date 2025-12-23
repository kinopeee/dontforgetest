# テスト生成エージェント（Chottotest）

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
3. Extension Development Host のコマンドパレットで `Chottotest:` を実行

## ライセンス

このプロジェクトは **CC BY-NC-SA 4.0**（Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International）ライセンスの下で公開されています。

### 許可される利用

- ✅ **非商用利用**: 個人利用、教育、研究目的での使用
- ✅ **改変**: ソースコードの改変・カスタマイズ
- ✅ **再配布**: 改変版の再配布（同じライセンスで）

### 制限事項

- ❌ **商用利用禁止**: 営利目的での使用は許可されません
- ⚠️ **著作権表示義務**: 利用時は必ず著作権表示とライセンスへのリンクを含めてください
- ⚠️ **継承義務（ShareAlike）**: 派生物も同じCC BY-NC-SA 4.0ライセンスで公開する必要があります

### 商用利用について

商用利用を希望される場合は、別途ライセンス契約が必要です。お問い合わせください。

詳細は [LICENSE](LICENSE) ファイルをご確認ください。

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
