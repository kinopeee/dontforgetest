# 操作手順（TestGen Agent）

このドキュメントは、VS Code / Cursor 上で「テスト生成エージェント」拡張機能を使うための操作手順です。

## 前提条件

- **ワークスペースをフォルダとして開いている**（単一ファイルだけ開いている状態は不可）
- **`cursor-agent` が実行できる**（PATHに入っている、または設定でパス指定）
- **テスト戦略ファイルが存在する**（既定: `docs/test-strategy.md`）
- コミット差分系を使う場合は **Gitリポジトリである** こと

> **注意（重要）**: 本拡張は `cursor-agent` を **`--force` で実行**するため、生成結果は**実ファイルに書き込まれます**。  
> 実行前にブランチを切る／コミットするなど、必ず退避手段を用意してください。

## インストール

### VSIX からインストール（配布/手動）

1. VS Code / Cursor を開く
2. コマンドパレットを開く（macOS: Cmd+Shift+P）
3. **`Extensions: Install from VSIX...`** を実行
4. `.vsix` ファイルを選択
5. 必要に応じて再読み込み（Reload）

### 開発版として試す（このリポジトリを開発する場合）

1. 依存関係をインストール: `npm install`
2. ビルド: `npm run compile`
3. VS Codeでこのリポジトリを開き **F5**（Run Extension）
4. Extension Development Host でコマンドを実行して動作確認

## 設定

VS Code / Cursor の設定（Settings）で `testgen-agent.*` を検索します。

- **`testgen-agent.cursorAgentPath`**: `cursor-agent` の実行パス（未指定なら PATH から解決）
- **`testgen-agent.defaultModel`**: `cursor-agent --model` に渡すモデル（空なら自動）
- **`testgen-agent.testStrategyPath`**: テスト戦略ファイルのパス（既定: `docs/test-strategy.md`）

## 基本操作（QuickPick推奨）

### 1) 生成を開始

1. コマンドパレット → **`TestGen: テスト生成（QuickPick）`**
2. **実行ソース**を選択
   - **現在のファイル**
   - **最新コミット差分**
   - **コミット範囲差分**
   - **未コミット差分**
3. **モデル**を選択
   - 設定の `defaultModel` を使用
   - モデル名を入力して上書き
4. 実行開始
   - **Output Channel** に進捗ログが出ます
   - **ステータスバー**に「実行中」が表示されます（クリックでログ表示）

### 2) 結果確認（差分プレビュー）

1. コマンドパレット → **`TestGen: 直近実行の差分を表示`**
2. 対象ファイルを選ぶと **Diffエディタ**で差分が開きます  
   （左=開始時スナップショット、右=現在の内容）

### 3) ロールバック（必要な場合）

1. コマンドパレット → **`TestGen: 直近実行をロールバック`**
2. 確認ダイアログで **「ロールバックする」** を選択

> **補足**: ロールバックは「開始時スナップショット」に基づいて復元します。  
> 実行後に手編集した内容も、スナップショットとの差分としてはロールバック対象になり得るため、運用はブランチ/コミットと併用してください。

## 個別コマンドの使い分け

- **`TestGen: 現在のファイルからテスト生成`**
  - アクティブエディタのファイルを対象に生成
- **`TestGen: 最新コミット差分からテスト生成`**
  - `HEAD` の差分を対象に生成
  - まだコミットが無い場合はエラー
- **`TestGen: コミット範囲差分からテスト生成`**
  - 入力例: `main..HEAD`, `HEAD~3..HEAD`
- **`TestGen: 未コミット差分からテスト生成`**
  - `staged` / `unstaged` / `両方` を選択
- **`TestGen: 出力ログを表示`**
  - Output Channel を開く

## トラブルシュート

### `cursor-agent が見つかりません`

- `cursor-agent` をインストール/セットアップする
- `testgen-agent.cursorAgentPath` にフルパスを設定する

### `テスト戦略ファイルが見つかりません`

- `testgen-agent.testStrategyPath` を正しいパスに設定する
- 既定の `docs/test-strategy.md` がワークスペースに存在するか確認

### `Git の HEAD が解決できません`

- リポジトリにコミットが存在するか確認（初回コミット前は不可）

### 差分が大きい

- プロンプトに埋め込む差分は一定サイズで **切り詰め**ます（truncated表示あり）

## 参考

- テスト戦略: `docs/test-strategy.md`

