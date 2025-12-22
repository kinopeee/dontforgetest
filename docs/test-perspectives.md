# テスト観点表 - テスト生成エージェント拡張機能

## 1. core/event.ts のテスト観点表

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---------|---------------------|--------------------------------------|-----------------|-------|
| TC-N-01 | 正常なタイムスタンプ取得 | Equivalence – normal | `nowMs()` が現在時刻（ミリ秒）を返す | - |
| TC-N-02 | TestGenEvent型の各バリアント | Equivalence – normal | 各イベント型（started/log/fileWrite/completed）が正しく型付けされる | - |
| TC-A-01 | タイムスタンプが負の値 | Boundary – invalid | TypeScriptの型チェックで弾かれる（実行時エラーは発生しない） | 型安全性のテスト |
| TC-A-02 | 空のtaskId | Boundary – empty | TypeScriptの型チェックで弾かれる | 型安全性のテスト |

## 2. core/promptBuilder.ts のテスト観点表

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---------|---------------------|--------------------------------------|-----------------|-------|
| TC-N-01 | 正常な設定ファイル（testgen-agent-configあり） | Equivalence – normal | 言語設定が正しく抽出され、プロンプトに含まれる | - |
| TC-N-02 | 設定ファイルなし（testgen-agent-configなし） | Equivalence – normal | デフォルト言語（ja）が使用される | - |
| TC-N-03 | 相対パスのtestStrategyPath | Equivalence – normal | ワークスペースルートと結合されて絶対パスになる | - |
| TC-N-04 | 絶対パスのtestStrategyPath | Equivalence – normal | そのまま使用される | - |
| TC-N-05 | 複数のtargetPaths | Equivalence – normal | すべてのパスがプロンプトに含まれる | - |
| TC-N-06 | 空のtargetPaths配列 | Boundary – empty | プロンプトは生成されるが、対象ファイルリストは空 | - |
| TC-A-01 | 存在しないtestStrategyPath | Boundary – file not found | `vscode.workspace.fs.readFile` がエラーを投げる | 例外型とメッセージを検証 |
| TC-A-02 | 不正なJSON形式のtestgen-agent-config | Boundary – invalid JSON | `parseLanguageConfig` が `undefined` を返し、デフォルト言語が使用される | - |
| TC-A-03 | testgen-agent-configに必須フィールドが欠如 | Boundary – missing field | `parseLanguageConfig` が `undefined` を返す | - |
| TC-A-04 | 空のworkspaceRoot | Boundary – empty | パス結合が正しく動作するか確認 | - |

## 3. core/preflight.ts のテスト観点表

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---------|---------------------|--------------------------------------|-----------------|-------|
| TC-N-01 | 正常な環境（ワークスペース開いている、ファイル存在、コマンド利用可能） | Equivalence – normal | `PreflightOk` が返される | - |
| TC-N-02 | cursorAgentPathが未設定 | Equivalence – normal | デフォルトの 'cursor-agent' が使用される | - |
| TC-N-03 | cursorAgentPathが設定済み | Equivalence – normal | 設定値が使用される | - |
| TC-N-04 | defaultModelが設定済み | Equivalence – normal | 設定値が `PreflightOk` に含まれる | - |
| TC-N-05 | defaultModelが未設定 | Equivalence – normal | `PreflightOk.defaultModel` が `undefined` | - |
| TC-A-01 | ワークスペースが開かれていない | Boundary – no workspace | `undefined` が返され、エラーメッセージが表示される | - |
| TC-A-02 | testStrategyPathが未設定 | Boundary – empty | `undefined` が返され、設定エラーメッセージが表示される | - |
| TC-A-03 | testStrategyPathのファイルが存在しない | Boundary – file not found | `undefined` が返され、エラーメッセージが表示される | - |
| TC-A-04 | cursor-agentコマンドが見つからない（ENOENT） | Boundary – command not found | `undefined` が返され、エラーメッセージが表示される | 例外型 `ENOENT` を検証 |
| TC-A-05 | 相対パスのtestStrategyPath | Equivalence – normal | ワークスペースルートと結合される | - |
| TC-A-06 | 絶対パスのtestStrategyPath | Equivalence – normal | そのまま使用される | - |

## 4. ui/outputChannel.ts のテスト観点表

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---------|---------------------|--------------------------------------|-----------------|-------|
| TC-N-01 | 初回呼び出しでOutput Channel取得 | Equivalence – normal | 新しいOutput Channelが作成される | - |
| TC-N-02 | 2回目以降の呼び出し | Equivalence – normal | 同じOutput Channelインスタンスが返される | シングルトンパターン |
| TC-N-03 | startedイベントの出力 | Equivalence – normal | タイムスタンプ、taskId、ラベルが正しくフォーマットされる | - |
| TC-N-04 | logイベント（info/warn/error）の出力 | Equivalence – normal | レベルが大文字で出力される | - |
| TC-N-05 | fileWriteイベントの出力 | Equivalence – normal | パス、行数、バイト数が正しくフォーマットされる | - |
| TC-N-06 | completedイベントの出力 | Equivalence – normal | 終了コードが正しくフォーマットされる | - |
| TC-N-07 | fileWriteイベントでlinesCreated/bytesWrittenが未定義 | Boundary – optional fields | 該当フィールドが出力されない | - |
| TC-N-08 | showTestGenOutput呼び出し | Equivalence – normal | Output Channelが表示される | - |
| TC-A-01 | 不正なイベント型（将来追加される可能性） | Boundary – unknown type | TypeScriptの型チェックで弾かれる（never型） | 型安全性のテスト |

## 5. providers/cursorAgentProvider.ts のテスト観点表

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---------|---------------------|--------------------------------------|-----------------|-------|
| TC-N-01 | 正常な実行（stream-json出力） | Equivalence – normal | イベントが正しくパースされ、onEventが呼ばれる | - |
| TC-N-02 | assistant型イベントの処理 | Equivalence – normal | メッセージテキストがlogイベントとして通知される | - |
| TC-N-03 | tool_call型イベント（writeToolCall）の処理 | Equivalence – normal | fileWriteイベントが通知される | - |
| TC-N-04 | agentCommandが指定されている | Equivalence – normal | 指定されたコマンドが使用される | - |
| TC-N-05 | agentCommandが未指定 | Equivalence – normal | デフォルトの 'cursor-agent' が使用される | - |
| TC-N-06 | modelが指定されている | Equivalence – normal | --model オプションが追加される | - |
| TC-N-07 | allowWrite=true | Equivalence – normal | --force オプションが追加される | - |
| TC-N-08 | allowWrite=false | Equivalence – normal | --force オプションが追加されない | - |
| TC-A-01 | 不正なJSON行 | Boundary – invalid JSON | warnレベルのlogイベントとして通知される | - |
| TC-A-02 | spawnエラー（コマンドが見つからない等） | Boundary – spawn error | errorレベルのlogイベントが通知される | 例外型とメッセージを検証 |
| TC-A-03 | stderr出力 | Equivalence – normal | errorレベルのlogイベントとして通知される | - |
| TC-A-04 | プロセス終了（exitCode=0） | Equivalence – normal | completedイベントが通知される | - |
| TC-A-05 | プロセス終了（exitCode!=0） | Equivalence – normal | completedイベントが通知される | - |
| TC-A-06 | プロセス終了（シグナル終了、exitCode=null） | Boundary – null exit code | completedイベントのexitCodeがnull | - |
| TC-A-07 | dispose呼び出し | Equivalence – normal | プロセスがkillされる | - |

## 6. commands/generateFromFile.ts のテスト観点表

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---------|---------------------|--------------------------------------|-----------------|-------|
| TC-N-01 | 正常な実行（アクティブエディタあり、ファイル開いている） | Equivalence – normal | プロンプトが構築され、provider.runが呼ばれる | - |
| TC-A-01 | ワークスペースが開かれていない | Boundary – no workspace | エラーメッセージが表示され、処理が中断される | プリフライトで検出 |
| TC-A-02 | アクティブエディタがない | Boundary – no editor | エラーメッセージが表示され、処理が中断される | - |
| TC-A-03 | アクティブエディタがファイル以外（untitled等） | Boundary – non-file scheme | エラーメッセージが表示され、処理が中断される | - |
| TC-A-04 | プリフライトチェック失敗 | Boundary – preflight failed | エラーメッセージが表示され、処理が中断される | - |

## 7. commands/generateFromCommit.ts のテスト観点表

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---------|---------------------|--------------------------------------|-----------------|-------|
| TC-N-01 | 正常な実行（HEADコミットあり、変更ファイルあり） | Equivalence – normal | プロンプトが構築され、provider.runが呼ばれる | - |
| TC-N-02 | 差分テキストが20,000文字未満 | Equivalence – normal | 差分がそのままプロンプトに含まれる | - |
| TC-N-03 | 差分テキストが20,000文字超過 | Boundary – truncation | 差分が20,000文字で切り詰められ、truncatedメッセージが追加される | - |
| TC-A-01 | HEADが解決できない（コミットなし） | Boundary – no commit | エラーメッセージが表示され、処理が中断される | - |
| TC-A-02 | 変更ファイルがない | Boundary – no changes | 情報メッセージが表示され、処理が中断される | - |
| TC-A-03 | gitコマンド実行エラー | Boundary – git error | エラーメッセージが表示されるか、空配列/空文字が返される | 例外型を検証 |
| TC-A-04 | プリフライトチェック失敗 | Boundary – preflight failed | エラーメッセージが表示され、処理が中断される | - |
