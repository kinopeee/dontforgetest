# Providers（イベント正規化 / プロセス管理）テスト観点表

目的: `src/providers/*Provider.ts` の **イベント正規化（stream-json 等）** と **多重起動/プロセス管理** の分岐を重点的にカバーし、`npm run coverage` の弱い箇所を改善する。

前提:
- 外部FS（実ユーザのホームディレクトリ）や実CLI（gemini/claude/codex）に依存しないよう、スタブ/モックで分岐を再現する。
- 各テストケースは Given / When / Then を明示する。

## 観点表（Case ID 一覧）

| Case ID | 対象 | Input / Precondition | 観点（同値/境界/異常） | 期待結果 |
|---|---|---|---|---|
| TC-PROV-CODEX-PROMPT-EMPTY | Codex | `dontforgetest.codexPromptCommand` が空 | 境界（空文字） | 注入なし（stdin に元 prompt） |
| TC-PROV-CODEX-PROMPT-INJECT | Codex | `~/.codex/prompts/<name>.md` が存在し非空 | 正常（同値） | 注入あり（先頭に挿入）+ info log |
| TC-PROV-CODEX-PROMPT-NOTFOUND | Codex | ファイルが存在しない（readFileSync が throw） | 異常（I/O） | warn log（スキップ） |
| TC-PROV-CODEX-PROMPT-EMPTYFILE | Codex | ファイル内容が空/空白 | 境界（空） | warn log（スキップ） |
| TC-PROV-CODEX-MULTIRUN-KILL | Codex | `activeChild` が残った状態で `run()` | 異常（多重起動） | 旧 child.kill() + warn log |
| TC-PROV-CODEX-WIREOUT-STDOUT | Codex | stdout が複数行 + close 時に末尾バッファ | 正常（同値） | 行ごとに info log + tail info log |
| TC-PROV-CODEX-WIREOUT-STDERR | Codex | stderr 出力 | 異常（stderr） | error log |
| TC-PROV-CODEX-WIREOUT-ERROR | Codex | child が `error` を emit | 異常（プロセス） | error log + completed(null) |
| TC-PROV-CODEX-WIREOUT-CLOSE | Codex | child が `close(code)` を emit | 正常（同値） | completed(code) |
| TC-PROV-GEM-WIREOUT-INIT-START | Gemini | stdout に `{"type":"init"}` | 正常（同値） | started event が 1 回だけ出る |
| TC-PROV-GEM-WIREOUT-PARSEFAIL | Gemini | stdout に JSON でない行 | 異常（パース失敗） | warn log（parse error） |
| TC-PROV-GEM-WIREOUT-ERROR | Gemini | child が `error` を emit | 異常（プロセス） | error log + completed(null) |
| TC-PROV-GEM-TOOLUSE-REPLACE | Gemini | `tool_use` / `tool_name=replace` | 正常（同値） | `fileWrite` として扱う |
| TC-PROV-GEM-E-TOOLUSE-NOFILEPATH | Gemini | `tool_use(write_file)` だが `file_path` が無い | 異常（入力欠落） | fileWrite しない |
| TC-PROV-GEM-E-TOOLUSE-UNKNOWNTOOL | Gemini | `tool_use` だが `tool_name` が対象外 | 異常（未知ツール） | fileWrite しない |
| TC-PROV-GEM-TOOLRESULT-RESULTOUTPUT | Gemini | `tool_result` / `result.output` | 正常（同値） | output 抽出して info log |
| TC-PROV-GEM-TOOLRESULT-RESULTCONTENT | Gemini | `tool_result` / `result.content` | 正常（同値） | content 抽出して info log |
| TC-PROV-GEM-E-TOOLRESULT-NOTOOLID | Gemini | `tool_result` に `tool_id` が無い | 異常（入力欠落） | log しない |
| TC-PROV-GEM-E-TOOLRESULT-NOMAPPING | Gemini | `tool_id` があるが path 解決できない | 異常（状態不整合） | log しない |
| TC-PROV-GEM-RESULT-STATUS | Gemini | `result` / `status` | 正常（同値） | status を info log |
| TC-PROV-GEM-E-ERROR-NOMESSAGE | Gemini | `error` だが `message` が無い | 境界（欠落） | デフォルト文言で error log |
| TC-PROV-GEM-E-MESSAGE-ROLE-USER | Gemini | `message(role=user)` | 異常（無視対象） | log しない |
| TC-PROV-GEM-PATH-OUTSIDE | Gemini | workspace 外の絶対パス | 境界（workspace 外） | 相対化不可 → absolute を返す |
| TC-PROV-CLAUDE-TOOLCALL-COMPLETED-PREFER-SUCCESS | Claude | `tool_call subtype=completed` + `success.path` | 正常（同値） | `success.path` を優先 + `linesAdded` を反映 |
| TC-PROV-CLAUDE-TOOLCALL-COMPLETED-FALLBACK-LAST | Claude | `subtype=completed` で path 無し + `lastWritePath` あり | 境界（フォールバック） | `lastWritePath` にフォールバックして `fileWrite` |
| TC-PROV-CLAUDE-TOOLCALL-EDITTOOLCALL | Claude | tool_call キーが `editToolCall` | 正常（同値） | `editToolCall` を write として扱う |
| TC-PROV-CLAUDE-E-TOOLCALL-EMPTY | Claude | `tool_call` が空オブジェクト | 異常（入力欠落） | fileWrite せず無視 |
| TC-PROV-CLAUDE-E-TOOLCALL-NONRECORD | Claude | `tool_call` が record でない | 異常（型不正） | fileWrite せず無視 |
| TC-PROV-CLAUDE-E-TOOLCALL-STARTED-NOPATH | Claude | `subtype=started` だが path 無し | 異常（入力欠落） | fileWrite せず無視 |
| TC-PROV-CLAUDE-E-TOOLCALL-COMPLETED-NOPATH | Claude | `subtype=completed` だが path/lastWritePath 無し | 異常（入力欠落） | fileWrite せず無視 |
| TC-PROV-CLAUDE-E-SYSTEM-NOSUBTYPE | Claude | `system` だが subtype 無し | 異常（入力欠落） | log しない |
| TC-PROV-CLAUDE-E-ASSISTANT-INVALID | Claude | `assistant` だが message 形式不正 | 異常（入力欠落） | log しない |
| TC-PROV-CLAUDE-RESULTTEXT-STRING | Claude | `result.result` が string | 正常（同値） | duration log + 本文 log |
| TC-PROV-CLAUDE-RESULTTEXT-ARRAY | Claude | `result.result.content[0].text` | 正常（同値） | duration log + 本文 log |
| TC-PROV-CLAUDE-TOOLCALL-UNKNOWN-IGNORE | Claude | tool_call が未知キーのみ | 異常（未知形式） | fileWrite せず無視 |

