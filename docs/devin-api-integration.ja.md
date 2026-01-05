# Devin API 統合メモ（Dontforgetest / 方針 B: パッチ返却 → 拡張で適用）

本ドキュメントは、VS Code 拡張機能 **Dontforgetest** に **Devin API** を統合するために、実装に必要な情報だけをまとめたメモです。

- **目的**: Devin API を使って「観点表生成」「テスト生成」を行い、生成結果を **ローカルに反映**する（既存 CLI エージェントと同じ体験）
- **方針（B）**: Devin は **パッチ（unified diff）を返すだけ**。拡張側が `git apply` で適用する

---

## 前提: Dontforgetest の既存アーキテクチャ（最小理解）

- 拡張は Provider 抽象 `AgentProvider` を通してエージェント実行を行う
- Provider は **実行**と **イベント通知（TestGenEvent）**だけが責務
- 既存 Provider（cursor-agent / Claude Code）は `stream-json` をパースし、`log/fileWrite/completed` を通知する
- 観点表生成は「エージェント出力 → マーカー抽出 → JSON パース → Markdown テーブル化 → docs に保存」

方針 B（Devin）では **「エージェントがローカルファイルを直接編集する」前提が崩れる**ため、テスト生成は「パッチ返却 → 拡張適用」が安全。

---

## Devin API の必須仕様（v1 推奨）

### ベース URL / 認証

- **Base URL**: `https://api.devin.ai/v1`
- **認証**: `Authorization: Bearer <DEVIN_API_KEY>`
- **推奨**: VS Code 拡張機能用途では **v1 API を推奨**
- **モデル指定**: **提供されていない**（Devin が自動選択）

---

## Sessions API（作成・監視・終了）

### セッション作成

- **POST** `/sessions`

リクエスト（例）:

```json
{
  "prompt": "Write unit tests for the authentication module",
  "idempotent": true,
  "max_acu_limit": 5,
  "tags": ["testing", "dontforgetest"]
}
```

主なパラメータ:

- **prompt** (string, required): Devin への指示
- **idempotent** (boolean, optional): `true` で重複セッション抑止（同一プロンプト）
- **max_acu_limit** (integer, optional): コスト上限（デフォルト 10）
- **snapshot_id / playbook_id / secret_ids / knowledge_ids / tags / title / unlisted**（必要に応じて）

レスポンス（例）:

```json
{
  "session_id": "devin-abc123def456",
  "url": "https://app.devin.ai/sessions/abc123def456",
  "is_new_session": true
}
```

### セッション状態取得（ポーリング）

- **GET** `/sessions/{session_id}`

レスポンス例（抜粋）:

```json
{
  "session_id": "devin-abc123def456",
  "status": "running",
  "status_enum": "working",
  "messages": [
    {
      "type": "initial_user_message",
      "message": "Write unit tests...",
      "origin": "api"
    },
    {
      "type": "devin_message",
      "message": "I'll analyze the authentication module..."
    }
  ],
  "structured_output": { "tests_created": 5 }
}
```

#### 完了判定（重要）

`status_enum` が以下のいずれかで「終了」と判定する:

- **blocked**: ユーザー入力待ち（終了扱い）
- **finished**: 正常完了（終了扱い）
- **expired**: 期限切れ（終了扱い）

それ以外（例: `working`）は継続。

#### ポーリング方式

- Devin API は **REST ポーリング方式**（WebSocket/SSE は提供されない）
- 推奨: Exponential backoff（初期 5 秒、最大 30 秒など）
- `429 Too Many Requests` は backoff でリトライ

### セッション終了

- **DELETE** `/sessions/{session_id}`

---

## Messages API（任意: 追加入力）

blocked 状態での継続や追加要求が必要な場合に使用。

- **POST** `/sessions/{session_id}/message`
- Body: `{"message":"..."}`

成功時は `200 OK` または `204 No Content`。

---

## Attachments API（ファイル添付）

### アップロード

- **POST** `/attachments`
- `multipart/form-data`（`file=@...`）
- レスポンスは **ファイル URL 文字列**（例: `"https://attachments.devin.ai/xxx/auth.ts"`）

### プロンプトでの参照形式（重要: 厳密ルール）

- `ATTACHMENT:` は **独立した行**で記載する
- URL は **ダブルクォートで囲む**
- 複数ファイルは 1 行ずつ
- **`ATTACHMENT:`（単数形）だけが認識**（`ATTACHMENTS:` は不可）

例:

```text
Please review the following file:
ATTACHMENT:"https://attachments.devin.ai/xxx/auth.ts"
```

---

## Dontforgetest 統合（方針 B: パッチ返却 → 拡張適用）

### 方針 B での出力契約（提案）

Devin の最終出力は「抽出しやすいマーカー付き」で統一する。

- **観点表**: 既存仕様と同等

  - `<!-- BEGIN TEST PERSPECTIVES JSON -->` と `<!-- END TEST PERSPECTIVES JSON -->`
  - JSON Schema: `{ "version": 1, "cases": [...] }`

- **テスト生成（パッチ）**: 新規に以下マーカーを採用（拡張が抽出）
  - `<!-- BEGIN DONTFORGETEST PATCH -->`
  - `<!-- END DONTFORGETEST PATCH -->`
  - 中身は `git apply` 可能な **unified diff**（末尾改行推奨）

例（イメージ）:

```text
<!-- BEGIN DONTFORGETEST PATCH -->
diff --git a/src/test/foo.test.ts b/src/test/foo.test.ts
index 0000000..1111111 100644
--- a/src/test/foo.test.ts
+++ b/src/test/foo.test.ts
@@ ...
<!-- END DONTFORGETEST PATCH -->
```

### パッチ適用の実装メモ

既存コードに `git apply --check` → `git apply` の実装があるため、同様の手順で適用できる。

要点:

- `git apply` は **パッチ末尾が改行で終わっていない**と失敗することがあるため、必要なら `\n` を補完する
- 適用前に `--check` して、失敗時はログとして理由を残す

### Devin 統合での制約（差分同梱戦略）

Devin がローカルワークスペースを直接読めない前提の場合:

- 既存フローのように「ファイルパスだけ渡す」では不足しやすい
- 最低限、以下を prompt/attachment で渡すことを推奨
  - 対象 diff（コミット差分/作業ツリー差分）
  - 変更対象ファイルの内容（必要な範囲のみ、可能なら attachments）
  - 既存テストの関連ファイル（スタイル合わせ用、可能なら attachments）

---

## 実装時の UX 判断（blocked の扱い）

`status_enum=blocked` は「ユーザー入力待ち」だが、API 仕様上は終了扱い。
MVP では以下のいずれかを採用する:

- **MVP 案**: blocked を「失敗/要追加入力」として扱い、ログに `POST /message` が必要であることを表示
- 発展案: UI で追加メッセージ入力 → `/message` を送って再ポーリング

---

## 参考（収集元）

- `compass_artifact_wf-..._text_markdown.md` に含まれる Devin API 仕様まとめ
- Dontforgetest 既存実装（Provider 抽象、観点表生成、git apply を使った差分適用）
