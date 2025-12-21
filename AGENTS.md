# AGENTS.md - IDE Extension 開発ガイド

## プロジェクト概要

VS Code拡張機能の開発プロジェクト。TypeScriptで記述され、VS Code Extension APIを使用。

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

### VS Code拡張機能パターン
- コマンドは `context.subscriptions.push()` で登録
- リソースは `Disposable` パターンで管理
- コマンドIDは `ide-ext.commandName` 形式

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
