# AGENTS.md - テスト生成エージェント 開発ガイド

## プロジェクト概要

Cursor CLI（cursor-agent）をヘッドレスモードで非同期呼び出しし、コミット差分や選択範囲からテストコードを自動生成するVS Code拡張機能。TypeScriptで記述され、VS Code Extension APIを使用。

## 技術スタック

- **言語**: TypeScript 5.7+
- **ランタイム**: Node.js
- **ターゲット**: VS Code 1.85.0+
- **ビルド**: tsc (TypeScript Compiler)
- **出力先**: `out/` ディレクトリ

## プロジェクト構造

```
src/
└── extension.ts    # 拡張機能のエントリーポイント（activate/deactivate）

out/                # コンパイル済みJS（gitignore対象）
package.json        # 拡張機能マニフェスト（commands, activationEvents等）
tsconfig.json       # TypeScript設定
```

## コーディング規約

### 言語
- コメントとドキュメントは**日本語**で記述
- 変数名・関数名は英語（キャメルケース）

### TypeScript
- `strict: true` を維持
- 型は明示的に定義（any禁止）
- `vscode` APIはimportで使用: `import * as vscode from 'vscode'`
- バージョン番号に限らず、環境・実行時に変わり得る情報（例: ポート番号、外部コマンド/実行ファイルのパス、ファイル/ディレクトリパス、APIエンドポイント、モデル名、タイムアウト値など）のハードコードは**厳禁**（必要な場合は設定ファイル・環境変数・定数定義に集約し、参照する）

### VS Code拡張機能パターン
- コマンドは `context.subscriptions.push()` で登録
- リソースは `Disposable` パターンで管理
- コマンドIDは `dontforgetest.commandName` 形式

## 開発コマンド

```bash
# ビルド
npm run compile

# ウォッチモード（開発時推奨）
npm run watch

# リント
npm run lint
```

## デバッグ方法

1. F5キーで「Run Extension」を実行
2. Extension Development Hostウィンドウが起動
3. コマンドパレット（Cmd+Shift+P）でコマンドをテスト

## 新機能追加時の手順

1. **コマンド追加**: `package.json` の `contributes.commands` に定義
2. **実装**: `src/extension.ts` の `activate()` 内で `registerCommand`
3. **ビルド**: `npm run compile`
4. **テスト**: F5でデバッグ実行

## テスト作成ガイドライン

テストコードを生成・作成・更新する際は、内蔵デフォルト戦略（[`src/core/defaultTestStrategy.ts`](src/core/defaultTestStrategy.ts)）に従うこと。

### 主要なルール

1. **テスト観点表の作成**: テスト作業前にMarkdown形式の観点表を作成
2. **Given / When / Then コメント**: 各テストケースに必ず付与
3. **正常系・異常系の網羅**: 正常系と同数以上の失敗系を含める
4. **境界値テスト**: 0 / 最小値 / 最大値 / ±1 / 空 / NULL を考慮
5. **例外・エラー検証**: 例外の型とメッセージを明示的に検証

詳細は `src/core/defaultTestStrategy.ts` を確認すること。

## 重要な注意点

- `package.json` の `main` フィールドは `./out/extension.js` を指す
- `activationEvents` は空配列（必要に応じて追加）
- 拡張機能のライフサイクル: `activate()` → 使用中 → `deactivate()`
- `out/` ディレクトリは生成物のため編集しない

## エラー対処

- **型エラー**: `@types/vscode` のバージョンを確認
- **ランタイムエラー**: Extension Development HostのDevToolsでデバッグ
- **コマンドが見つからない**: `package.json` のコマンドIDと実装を照合

## コミットメッセージ規約

Conventional Commits準拠。日本語で記述。

### フォーマット

```
<prefix>: <サマリ（50文字以内）>

- 変更内容1
- 変更内容2
```

### Prefix

| prefix | 用途 |
|--------|------|
| feat | 新機能 |
| fix | バグ修正 |
| refactor | リファクタリング |
| docs | ドキュメント |
| test | テスト |
| chore | 雑務・設定 |

### ルール

- サマリは日本語で簡潔に（末尾句点なし）
- 本文は箇条書きで変更内容を列挙
- 差分を確認してから書く（推測で書かない）
- 曖昧な表現禁止（"update", "fix bug" 等）

## PRメッセージ規約

コミットメッセージ規約と整合。日本語で記述。

### タイトル

```
<prefix>: <サマリ（50文字以内）>
```

### 本文テンプレート

```markdown
## 概要
このPRで実装・修正した内容の要約

## 変更内容
- 変更点1
- 変更点2

## テスト内容
- 実施したテスト・確認内容

Closes #123
```

### ルール

- 「概要」「変更内容」は必須
- 差分とコミット履歴を確認してから書く
- 曖昧なタイトル禁止（"update", "fix issue" 等）
