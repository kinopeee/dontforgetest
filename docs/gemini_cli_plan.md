# Gemini CLI 対応 実装プラン（Dontforgetest / 参考: 実装済み）

## 目的

Dontforgetest に Gemini CLI のヘッドレス実行（`stream-json`）を追加し、既存の Cursor CLI / Claude Code / Codex CLI と同じ実行フローでテスト生成を行えるようにする。

## スコープ

- Gemini CLI の headless 実行 + `stream-json` の解析
- 既存プロバイダと同一の run-to-completion フローに統合
- `fileWrite` 抽出の最小実装（失敗時は既存フォールバックを使用）
- 設定キーの統合（ツール別のコマンドパスの分離を解消）

## 前提

- Gemini CLI の導入/認証は対象外（ユーザー環境に既に存在する前提）
- サンドボックス/権限モデルは他の CLI と同一の前提
- `stream-json` のイベント種別: `init` / `message` / `tool_use` / `tool_result` / `error` / `result`
- 公式ドキュメントで確認済みの仕様:
  - `write_file` / `replace` が書き込み系ツール
  - 書き込み系パラメータは `parameters.file_path`（絶対パス必須）
  - `--approval-mode` は `default` / `auto_edit` / `yolo`
  - `auto_edit` は `write_file` / `replace` のみ自動承認

## 仕様（Gemini CLI 起動とパース）

### CLI 起動

- コマンド例
  - `gemini -p "<prompt>" --output-format stream-json`
- `allowWrite` とフラグの対応
  - `allowWrite=false` → `--approval-mode default` を指定（または未指定）
  - `allowWrite=true` → `--approval-mode auto_edit` を指定
- モデル指定が必要な場合は `-m` / `--model` を使う（設定キーに集約）

### stream-json のイベント対応

- `init` → `started` に変換（最初の受信時に taskId などと紐付け）
- `message`
  - `role === "assistant"` の `content` を `log(level=info)` に流す
  - `delta` がある場合は逐次連結せず、そのままログに流しても成立
- `tool_use`
  - `tool_name` が `write_file` / `replace` の場合のみ `fileWrite` を生成
  - `parameters.file_path` を `fileWrite.path` として採用
  - `tool_id -> file_path` を map で保持（`tool_result` との突合用）
- `tool_result`
  - `tool_id` から `file_path` を引ける場合はログに `output` を表示
  - `fileWrite` のメタ情報は無し（lines/bytes は提供されないため）
- `error`
  - `log(level=error)` に変換
  - フィールド仕様は未検証のため、`message` などは存在確認の上で採用
- `result`
  - 結果ログとして扱う（必要なら `status` を表示）
  - `completed` はプロセス終了時に発火

### fileWrite フォールバック

`fileWrite` が取れなかった場合は既存実装にある git diff フォールバックを使用する。

## 設定・統合方針

### コマンドパスの統合

- 新規設定キー（例）: `dontforgetest.agentPath`
- 既存キー（`dontforgetest.cursorAgentPath` / `dontforgetest.claudePath`）は後方互換の読み取りのみ
- 優先順位
  1. `dontforgetest.agentPath`
  2. 既存キー（プロバイダに応じて参照）
  3. 既定コマンド名（`cursor-agent` / `claude` / `gemini`）

### モデル指定

- `dontforgetest.agentModel` のような共通キーを検討
- 未指定ならプロバイダ既定値を使用

## 実装手順（具体）

### 1. Provider の追加

- 新規ファイル: `src/providers/geminiCliProvider.ts`
- 既存の provider 選択ロジックに `gemini` を追加
- `runProviderToCompletion` で `outputFormat: 'stream-json'` を指定

### 2. JSONL パーサー追加

- `stream-json` の 1 行 1 JSON を `JSON.parse` する
- パース失敗時は `log(level=warn)` を出しつつ処理継続
- イベント種別は `type` フィールドで分岐

### 3. fileWrite 抽出

- `tool_use` で `write_file` / `replace` を検知
- `parameters.file_path` を必須扱いにする
- `tool_id` が無い場合は `fileWrite` のみ出し、`tool_result` では紐付けを行わない

### 4. preflight の拡張

- `gemini` の存在確認を追加
- コマンドパス統合後のロジックに合わせて修正

### 5. 設定定義の更新

- `package.json` に統合キーを追加
- 既存キーは description に「非推奨/移行」文言を追加

### 6. UI/コマンド

- Provider 選択 UI に Gemini を追加
- `dontforgetest.<command>` の利用箇所で Provider 名の分岐を更新

### 7. ドキュメント更新

- `docs/usage*.md` に Gemini CLI の選択方法を追記
- 設定統合の説明を追加

## 未検証項目と検証手順

### 未検証項目

- `error` イベントのフィールド仕様
- 失敗時に `result` が必ず出るか
- exit code の体系
- `message.delta` の正確な仕様

### 検証手順（実機）

- エラーイベント確認
  - `gemini -p "test" -m invalid --output-format stream-json`
- 失敗時の `result` / exit code 確認
  - `gemini -p "test" --output-format stream-json; echo $?`
- `delta` 仕様の確認
  - 長文プロンプトで streaming を観察

## 受け入れ基準

- Gemini CLI を選択してヘッドレス実行できる
- `stream-json` をパースし、`message` / `error` / `tool_use` / `tool_result` をログ表示できる
- `write_file` / `replace` で `fileWrite` を抽出できる（失敗時は git diff フォールバックが動作する）
- `allowWrite` の設定で `--approval-mode` を正しく切り替えられる

## 影響範囲（想定）

- `src/providers/`
- `src/core/` の preflight / 設定取得
- `package.json` の configuration
- `docs/` の利用ガイド
