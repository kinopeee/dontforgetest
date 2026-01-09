# Providers event normalization テスト観点表

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
| --- | --- | --- | --- | --- |
| TC-CODEX-P-01 | codexPromptCommand が空 | Equivalence | prompt への注入なし | buildPromptWithCodexCommand 経由 |
| TC-CODEX-P-02 | ~/.codex/prompts/<name>.md が存在し非空 | Equivalence | prompt 先頭に注入 | homedir 差し替えで検証 |
| TC-CODEX-P-03 | prompt ファイルが空または欠落 | Error | warn ログが出る | run 時のログ確認 |
| TC-CODEX-P-04 | activeChild が存在する状態で run() | Error | 旧 child.kill() と warn ログ | 多重起動防止 |
| TC-CODEX-P-05 | stdout が複数行 | Equivalence | 行ごとに info ログ | wireOutput |
| TC-CODEX-P-06 | stdout 末尾が改行なし | Boundary | close 時に tail ログ | wireOutput |
| TC-CODEX-P-07 | stderr 出力 | Error | error ログ | wireOutput |
| TC-CODEX-P-08 | child.on('error') | Error | error ログ + completed(null) | wireOutput |
| TC-CODEX-P-09 | child.on('close') | Equivalence | completed(code) | wireOutput |
| TC-GEM-P-01 | stream-json init | Equivalence | started イベントが出る | wireOutput |
| TC-GEM-P-02 | stream-json parse 失敗行 | Error | warn ログが出る | wireOutput |
| TC-GEM-P-03 | tool_use=replace | Equivalence | fileWrite 扱い | handleStreamJson |
| TC-GEM-P-04 | tool_result.result.output | Equivalence | log に反映 | handleStreamJson |
| TC-GEM-P-05 | tool_result.result.content | Equivalence | log に反映 | handleStreamJson |
| TC-GEM-P-06 | result イベント | Equivalence | status ログが出る | handleStreamJson |
| TC-GEM-P-07 | workspace 外パス | Boundary | absolute を返す | toWorkspaceRelative fallback |
| TC-CLAUDE-P-01 | tool_call completed + success.path | Equivalence | success.path を優先 | linesAdded 含む |
| TC-CLAUDE-P-02 | tool_call completed + args.path | Equivalence | args.path を使用 | success 無し |
| TC-CLAUDE-P-03 | tool_call completed + lastWritePath | Boundary | lastWritePath を使用 | args 無し |
| TC-CLAUDE-P-04 | result 本文 string/object/array | Equivalence | 本文ログが出る | extractResultText |
| TC-CLAUDE-P-05 | tool_call 名の判定 | Equivalence | editToolCall を優先 | findToolCallName 分岐 |
| TC-CLAUDE-P-06 | tool_call 名が未知 | Error | fileWrite が出ない | findToolCallName fallback |
