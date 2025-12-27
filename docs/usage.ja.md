# 操作手順（Dontforgetest）

このドキュメントは、Cursor 上で「テスト生成エージェント」拡張機能を使うための操作手順です。

- English docs: `../README.md`, `usage.md`

## 前提条件

- **ワークスペースをフォルダとして開いている**（単一ファイルだけ開いている状態は不可）
- Cursor **2.2** 以降
- **`cursor-agent` が実行できる**（PATHに入っている、または設定でパス指定）
- コミット差分系を使う場合は **Gitリポジトリである** こと
- **現時点の動作確認は macOS 環境のみ**（Windows/Linux は未検証）

> **注意（重要）**: 本拡張は `cursor-agent` を **`--force` で実行**するため、生成結果は**実ファイルに書き込まれます**。  
> 実行前にブランチを切る／コミットするなど、必ず退避手段を用意してください。  
> ※コミット差分系は **Worktree（隔離）** を選べます（生成は一時worktree、ローカルへはテスト差分のみ適用）。

## インストール

### VSIX からインストール（配布/手動）

1. Cursor を開く
2. コマンドパレットを開く（macOS: Cmd+Shift+P）
3. **`Extensions: Install from VSIX...`** を実行
4. `.vsix` ファイルを選択
5. 必要に応じて再読み込み（Reload）

#### 別手順（エクスプローラーから）

コマンドパレットを使わず、ファイルツリーから直接インストールすることもできます。

1. Cursor のエクスプローラーで `.vsix` ファイルを表示
2. `.vsix` を右クリック
3. **`拡張機能の VSIX のインストール`**（英語UIの場合は **`Install Extension VSIX`**）を選択
4. 必要に応じて再読み込み（Reload）

### 開発版として試す（このリポジトリを開発する場合）

1. 依存関係をインストール: `npm install`
2. ビルド: `npm run compile`
3. Cursorでこのリポジトリを開き **F5**（Run Extension）
4. Extension Development Host でコマンドを実行して動作確認

## 設定

Cursor の設定（Settings）で `dontforgetest.*` を検索します。

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

> **補足（モデル名）**: `dontforgetest.defaultModel` に指定するモデル名は、Cursor CLI の **`/model`** コマンドでリストされる名前を使用してください。
>
> 例（2025.12.25 時点）:
>
> ```
> composer-1
> auto
> sonnet-4.5
> sonnet-4.5-thinking
> opus-4.5
> opus-4.5-thinking
> gemini-3-pro
> gemini-3-flash
> gpt-5.2
> gpt-5.1
> gpt-5.2-high
> gpt-5.1-high
> gpt-5.1-codex
> gpt-5.1-codex-high
> gpt-5.1-codex-max
> gpt-5.1-codex-max-high
> opus-4.1
> grok
> ```

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

## 基本操作

### 1) パネルから実行（GUI）

サイドバーの操作パネル（**`Dontforgetest: パネルを開く`**）から実行します。

1. **コミット範囲**を選択（コミット範囲差分を使う場合）
2. **生成先**を選択
   - **Local / Worktree** から選べます
   - **未コミット差分の場合は Local のみ**（Worktree は選択できません）
3. **「テスト生成」**ボタンをクリック
   - **「進捗」**で処理の進み具合が確認できます
4. 処理完了後、**「出力」**のリンクから成果物を開く
   - **観点表** / **実行レポート** をクリックすると、最新のものが表示されます
   - Worktree で Local に適用できなかった場合は、**「手動マージ」**ボタンから **指示用プロンプトファイル** を参照できます

### 2) QuickPick から実行（コマンドパレット）

1. コマンドパレット → **`Dontforgetest: テスト生成（QuickPick）`**
2. **実行ソース**を選択
   - **現在のファイル**
   - **最新コミット差分**
   - **コミット範囲差分**
   - **未コミット差分**
3. （最新コミット差分 / コミット範囲差分の場合）**実行先**を選択
   - **Local**: 現在のワークスペースを直接編集
   - **Worktree**: 一時worktreeで生成し、テスト差分だけをローカルへ適用（自動適用不可なら手動マージ）
4. **モデル**を選択
   - 設定の `defaultModel` を使用
   - モデル名を入力して上書き
5. 実行開始
   - **Output Channel** に進捗ログが出ます
   - **ステータスバー**に「実行中」が表示されます（クリックでログ表示）

### 3) 結果確認（観点表/実行レポート）

- 観点表: コマンドパレット → **`Dontforgetest: 最新の観点表を開く`**
- 実行レポート: コマンドパレット → **`Dontforgetest: 最新の実行レポートを開く`**
- 手動マージ支援（自動適用に失敗した場合）: コマンドパレット → **`Dontforgetest: 手動マージ支援を開く（最新）`**

## 個別コマンドの使い分け

- **`Dontforgetest: テスト生成（QuickPick）`**
  - ソース/実行先（必要な場合）/モデルを選んで実行
- **`Dontforgetest: パネルを開く`**
  - サイドバーの操作パネルを開く（Local / Worktree の選択はこちらが分かりやすい）
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

