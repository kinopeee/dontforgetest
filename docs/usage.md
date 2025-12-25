# 操作手順（Dontforgetest）

このドキュメントは、VS Code / Cursor 上で「テスト生成エージェント」拡張機能を使うための操作手順です。

## 前提条件

- **ワークスペースをフォルダとして開いている**（単一ファイルだけ開いている状態は不可）
- **`cursor-agent` が実行できる**（PATHに入っている、または設定でパス指定）
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

VS Code / Cursor の設定（Settings）で `dontforgetest.*` を検索します。

- **`dontforgetest.cursorAgentPath`**: `cursor-agent` の実行パス（未指定なら PATH から解決）
- **`dontforgetest.defaultModel`**: `cursor-agent --model` に渡すモデル（空なら自動）
- **`dontforgetest.testStrategyPath`**: テスト戦略ファイルのパス（空なら内蔵デフォルトを使用）
- **`dontforgetest.includeTestPerspectiveTable`**: テスト生成前にテスト観点表を生成して保存するか（既定: true）
- **`dontforgetest.perspectiveReportDir`**: 観点表（自動生成）の保存先（既定: `docs/test-perspectives`）
- **`dontforgetest.testCommand`**: 生成後に実行するテストコマンド（既定: `npm test`、空ならスキップ）
- **`dontforgetest.testExecutionReportDir`**: テスト実行レポート（自動生成）の保存先（既定: `docs/test-execution-reports`）
- **`dontforgetest.testExecutionRunner`**: テスト実行の担当者（既定: `extension`）
  - `extension`: 拡張機能がローカルで `testCommand` を実行し、stdout/stderr/exitCode を収集してレポート化
  - `cursorAgent`: `cursor-agent` に実行させ、マーカー付きの結果から stdout/stderr/exitCode を抽出してレポート化
  - `cursorAgent` が実行拒否/空結果になる場合は、拡張機能側で **自動フォールバック**して実行します（警告ログが出ます）

### テスト戦略ファイルについて

テスト戦略ファイルは、テスト生成時のルール（観点表の形式、Given/When/Thenコメントの必須化など）を定義します。

- **設定が空の場合**: 拡張機能に内蔵されたデフォルト戦略（英語版）が自動的に使用されます
- **カスタマイズしたい場合**: 任意の `.md` ファイルを作成し、`dontforgetest.testStrategyPath` にパスを指定してください

#### 内蔵デフォルト戦略の特徴

- 言語: 英語（`answerLanguage`, `commentLanguage`, `perspectiveTableLanguage` すべて英語）
- ソースコード: `src/core/defaultTestStrategy.ts` に定義

#### カスタム戦略ファイルの例

日本語で出力したい場合は、ファイル先頭に以下のような設定コメントを記述します：

```markdown
<!-- dontforgetest-config: {"answerLanguage":"ja","commentLanguage":"ja","perspectiveTableLanguage":"ja"} -->

## テスト戦略ルール

（ここに独自のルールを記述）
```

## 基本操作（QuickPick推奨）

### 1) 生成を開始

1. コマンドパレット → **`Dontforgetest: テスト生成（QuickPick）`**
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

1. コマンドパレット → **`Dontforgetest: 直近実行の差分を表示`**
2. 対象ファイルを選ぶと **Diffエディタ**で差分が開きます  
   （左=開始時スナップショット、右=現在の内容）

### 3) 元に戻す（Undo）（必要な場合）

1. コマンドパレット → **`Dontforgetest: 直近実行を元に戻す(Undo)`**
2. 確認ダイアログで **「元に戻す」** を選択

> **補足**: Undoは「開始時スナップショット」に基づいて復元します。  
> 実行後に手編集した内容も、スナップショットとの差分としてはUndo対象になり得るため、運用はブランチ/コミットと併用してください。

## 個別コマンドの使い分け

- **`Dontforgetest: 現在のファイルからテスト生成`**
  - アクティブエディタのファイルを対象に生成
- **`Dontforgetest: 最新コミット差分からテスト生成`**
  - `HEAD` の差分を対象に生成
  - まだコミットが無い場合はエラー
- **`Dontforgetest: コミット範囲差分からテスト生成`**
  - 入力例: `main..HEAD`, `HEAD~3..HEAD`
- **`Dontforgetest: 未コミット差分からテスト生成`**
  - `staged` / `unstaged` / `両方` を選択
- **`Dontforgetest: 出力ログを表示`**
  - Output Channel を開く

## トラブルシュート

### `cursor-agent が見つかりません`

- `cursor-agent` をインストール/セットアップする
- `dontforgetest.cursorAgentPath` にフルパスを設定する

### テスト戦略ファイルが読み込めない

- 指定したファイルが存在しない場合、内蔵デフォルト戦略が自動的に使用されます
- カスタム戦略を使いたい場合は、`dontforgetest.testStrategyPath` に正しいパスを設定してください

### `Git の HEAD が解決できません`

- リポジトリにコミットが存在するか確認（初回コミット前は不可）

### 差分が大きい

- プロンプトに埋め込む差分は一定サイズで **切り詰め**ます（truncated表示あり）

## 参考

- 内蔵デフォルト戦略: `src/core/defaultTestStrategy.ts`

