# テスト生成エージェント 開発ガイド

## プロジェクト概要

CLI エージェント（現在対応: Cursor CLI / Claude Code / Gemini CLI / Codex CLI）をヘッドレスで非同期呼び出しし、コミット差分や選択範囲からテストコードを自動生成する VS Code 互換拡張機能「Dontforgetest」。TypeScript で記述され、VS Code Extension API を使用。

### 本拡張機能の狙い（回帰・実装漏れの発見）

本拡張機能は、コミット差分（または選択範囲）から **テスト観点表** と **テストコード** を生成し、必要に応じてテスト実行まで行うことで、リグレッションや実装漏れを早期に発見するためのツールである。

- **重要**: テストが失敗した場合でも、その原因が CLI エージェント側（生成内容の誤り/不足、プロンプト追従ミス等）に起因するなら、本拡張機能の不具合とは限らない（＝直ちに修正対象ではない）。
- 一方で、失敗や不整合の原因が本拡張機能側（差分抽出、成果物管理、実行制御、設定解釈、レポート生成など）の責務に起因する場合は、本拡張機能の修正対象である。

## 技術スタック

- **言語**: TypeScript 5.7+
- **ランタイム**: Node.js
- **ターゲット**: VS Code 1.105+ 互換（Cursor / VS Code / Windsurf）
- **ビルド**: tsc (TypeScript Compiler)
- **テスト/カバレッジ**: c8
- **出力先**: `out/` ディレクトリ

## プロジェクト構造

```
src/
├── extension.ts    # 拡張機能のエントリーポイント（activate/deactivate）
├── commands/       # コマンド実装（コミット差分/作業ツリー/成果物付き実行など）
├── core/           # 生成戦略・プロンプト・成果物管理・事前チェック等の中核ロジック
├── providers/      # CLI エージェント実行や実行制御（Run-to-completion）関連
                    # 現在対応: Cursor CLI / Claude Code / Gemini CLI / Codex CLI
├── git/            # git差分解析・worktree管理
├── ui/             # WebView/TreeView/QuickPick/StatusBar 等のUI層
└── test/           # VS Code拡張機能テスト（@vscode/test-electron + mocha）

out/                # コンパイル済みJS（gitignore対象）
docs/               # 自動生成レポート等（例: docs/test-perspectives, docs/test-execution-reports）
package.json        # 拡張機能マニフェスト（commands, activationEvents等）
tsconfig.json       # TypeScript設定
```

## コーディング規約

### 言語

- コメントとドキュメントは**日本語**で記述
  - 例外: モデルへのプロンプトは指示追従性を重視して**英語**で記述
  - 生成物（観点表/レポート）は VS Code の表示言語（ja/en）に追従
- 変数名・関数名は英語（キャメルケース）

### TypeScript

- `strict: true` を維持
- 型は明示的に定義（any 禁止）
- モジュールの読み込みには `import` 構文を使用（ESLint により `require()` は原則禁止。テスト等で必要な場合は理由付きで例外可）
- 環境・実行時に変わり得る情報（例: ポート番号、外部コマンドのパス、API エンドポイント、タイムアウト値など）のハードコードは原則禁止。設定ファイル・環境変数・定数定義に集約し参照する（固定候補リスト等、変更頻度が低い定数はソース内に持ってよい）

### VS Code 拡張機能パターン

- コマンドは `context.subscriptions.push()` で登録
- リソースは `Disposable` パターンで管理
- コマンド ID は `dontforgetest.commandName` 形式

## 開発コマンド

```bash
# ビルド（TypeScriptコンパイル）
npm run compile

# ウォッチモード（開発時推奨）
npm run watch

# リント
npm run lint

# テスト（事前に compile が走る: pretest）
npm test

# テスト（ロケール指定）
npm run test:ja
npm run test:en

# カバレッジ
npm run coverage

# テスト（mocha 直実行: デバッグ/切り分け用）
npm run test:runTest

# カバレッジ（mocha 直実行: デバッグ/切り分け用）
npm run coverage:runTest

# VSIX生成（ローカルで配布/動作確認したい場合）
npm run vsix:build

# VSIXインストール（直近に生成された dontforgetest-*.vsix を強制インストール）
npm run vsix:install

# ビルド→インストール（一括）
npm run vsix:build-install

# バージョン上げ→ビルド→インストール（一括）
npm run vsix:build-install:bump

# バージョン上げ→VSIX生成（インストールしない）
npm run vsix:build:bump
```

## デバッグ方法

1. F5 キーで「Run Extension」を実行
2. Extension Development Host ウィンドウが起動
3. コマンドパレット（Cmd+Shift+P）でコマンドをテスト

## 新機能追加時の手順

1. **コマンド追加**: `package.json` の `contributes.commands` に定義
2. **実装**: `src/extension.ts` の `activate()` 内で `registerCommand`
3. **ビルド**: `npm run compile`
4. **テスト**: F5 でデバッグ実行

## テスト作成ガイドライン

テストコードを生成・作成・更新する際は、内蔵デフォルト戦略（[`src/core/defaultTestStrategy.ts`](src/core/defaultTestStrategy.ts)）に従うこと。

### 主要なルール

1. **テスト観点表の作成**: テスト作業前に Markdown 形式の観点表を作成
2. **Given / When / Then コメント**: 各テストケースに必ず付与
3. **正常系・異常系の網羅**: 正常系と同数以上の失敗系を含める
4. **境界値テスト**: 0 / 最小値 / 最大値 / ±1 / 空 / NULL を考慮
5. **例外・エラー検証**: 例外の型とメッセージを明示的に検証

詳細は `src/core/defaultTestStrategy.ts` を確認すること。

## 重要な注意点

- **テスト失敗時の責務分界**: 失敗原因が CLI エージェント側なら拡張機能の不具合とは限らない。本拡張機能側（差分抽出・成果物管理・実行制御等）の責務に起因する場合のみ修正対象とする。
- `package.json` の `main` フィールドは `./out/extension.js` を指す
- `activationEvents` は空配列（必要に応じて追加）
- 拡張機能のライフサイクル: `activate()` → 使用中 → `deactivate()`
- `out/` ディレクトリは生成物のため編集しない

## エラー対処

- **型エラー**: `@types/vscode` のバージョンを確認
- **ランタイムエラー**: Extension Development Host の DevTools でデバッグ
- **コマンドが見つからない**: `package.json` のコマンド ID と実装を照合

## ブランチ運用規約

### ルール

- **デフォルトブランチ（例: main/master）での直接作業禁止**: デフォルトブランチにいる場合は、必ず更新用ブランチを切ってから作業を開始する
- **ブランチ名は更新内容に合わせる**: 作業内容が明確にわかる命名にする

### ブランチ命名規則

```
<prefix>/<簡潔な説明>
```

| prefix   | 用途             |
| -------- | ---------------- |
| feat     | 新機能           |
| fix      | バグ修正         |
| refactor | リファクタリング |
| docs     | ドキュメント     |
| test     | テスト           |
| chore    | 雑務・設定       |

### 例

```bash
# 新機能追加
feat/add-commit-range-command

# バグ修正
fix/git-diff-parsing-error

# ドキュメント更新
docs/update-usage-guide
```

## コミットメッセージ規約

Conventional Commits 準拠。日本語で記述。

### フォーマット

```
<prefix>: <サマリ（50文字以内）>

- 変更内容1
- 変更内容2
```

### Prefix

| prefix   | 用途             |
| -------- | ---------------- |
| feat     | 新機能           |
| fix      | バグ修正         |
| refactor | リファクタリング |
| docs     | ドキュメント     |
| test     | テスト           |
| chore    | 雑務・設定       |

### ルール

- サマリは日本語で簡潔に（末尾句点なし）
- 本文は箇条書きで変更内容を列挙
- 差分を確認してから書く（推測で書かない）
- 曖昧な表現禁止（"update", "fix bug" 等）

## PR メッセージ規約

コミットメッセージ規約と整合。日本語で記述。

### タイトル

```
<prefix>: <サマリ（50文字以内）>
```

### 本文テンプレート

```markdown
## 概要

この PR で実装・修正した内容の要約

## 変更内容

- 変更点 1
- 変更点 2

## テスト内容

- 実施したテスト・確認内容

Closes #123
```

### ルール

- 「概要」「変更内容」は必須
- 差分とコミット履歴を確認してから書く
- 曖昧なタイトル禁止（"update", "fix issue" 等）
