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

## 8. 成果物保存（観点表/テスト実行レポート）のテスト観点表（概要）

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---------|---------------------|--------------------------------------|-----------------|-------|
| TC-N-01 | includeTestPerspectiveTable=true | Equivalence – normal | 生成前に観点表が生成され、`docs/test-perspectives/test-perspectives_*.md` に新規保存される | `src/commands/runWithArtifacts.ts` |
| TC-N-02 | testCommandが設定されている（例: npm test） | Equivalence – normal | 生成後にテストが実行され、`docs/test-execution-reports/test-execution_*.md` に新規保存される | 失敗時も保存 |
| TC-A-01 | testCommandが空文字 | Boundary – empty | テスト実行はスキップされ、ログにスキップ理由が出力される | - |
| TC-A-02 | provider error（spawn失敗等） | Boundary – provider failure | completedイベントが発行され、ステータスバーの「実行中」が残留しない | `providers/cursorAgentProvider.ts` 改修 |

### 直近の自動生成観点表（例）
- `docs/test-perspectives/test-perspectives_20251223_022649.md`

## 9. core/artifacts.ts (成果物処理) のテスト観点表

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---------|---------------------|--------------------------------------|-----------------|-------|
| TC-ART-01 | 設定値の取得 | Equivalence - normal | `getArtifactSettings()` が正しいデフォルト値または設定値を返す | `includeTestPerspectiveTable`=true 等 |
| TC-ART-02 | タイムスタンプ生成 | Equivalence - normal | `formatTimestamp()` が `YYYYMMDD_HHmmss` 形式を返す | |
| TC-ART-03 | 絶対パス解決（絶対パス入力） | Equivalence - normal | そのまま返される | |
| TC-ART-04 | 絶対パス解決（相対パス入力） | Equivalence - normal | ワークスペースルートと結合して返される | |
| TC-ART-05 | 絶対パス解決（空文字） | Boundary - empty | ワークスペースルートが返される | |
| TC-ART-06 | 観点表Markdown生成（正常） | Equivalence - normal | タイトル、対象、Markdownコンテンツが含まれる | |
| TC-ART-07 | 観点表Markdown生成（対象なし） | Boundary - empty list | 「(なし)」と表示される | |
| TC-ART-08 | 実行レポートMarkdown生成（正常） | Equivalence - normal | タイトル、環境、コマンド、終了コード0、出力が含まれる | |
| TC-ART-09 | 実行レポートMarkdown生成（エラー） | Boundary - error | エラーメッセージ（spawn errorなど）が含まれる | |
| TC-ART-10 | 実行レポートMarkdown生成（空出力） | Boundary - empty output | 空のコードブロックが含まれる | |
| TC-ART-11 | 観点表保存（ファイル書き込み） | Equivalence - IO | 指定ディレクトリにファイルが生成され、内容が正しい | |
| TC-ART-12 | 実行レポート保存（ファイル書き込み） | Equivalence - IO | 指定ディレクトリにファイルが生成され、内容が正しい | |

## 10. core/testRunner.ts (テスト実行) のテスト観点表

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---------|---------------------|--------------------------------------|-----------------|-------|
| TC-RUN-01 | 正常コマンド実行 | Equivalence - normal | exitCode=0, stdoutあり, stderrなし | echoコマンド |
| TC-RUN-02 | 無効コマンド実行 | Boundary - error | exitCode!=0 または errorMessageあり | |
| TC-RUN-03 | 失敗コマンド実行 | Boundary - exit code | exitCode=1 | exit 1 |
| TC-RUN-04 | 大量出力コマンド | Boundary - large output | stdoutが切り詰められ、サイズ制限内である | |

## 11. commands/runWithArtifacts.ts (統合フロー) のテスト観点表

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---------|---------------------|--------------------------------------|-----------------|-------|
| TC-CMD-01 | 全機能有効（観点表+テスト実行） | Equivalence - flow | 観点表と実行レポートの両方が保存される | MockProvider使用 |
| TC-CMD-02 | 観点表無効 | Equivalence - config | 観点表は保存されないが、テスト生成は行われる | |
| TC-CMD-03 | テストコマンド空 | Boundary - config | テスト実行がスキップされ、レポートは保存されない | |
| TC-CMD-04 | テスト実行失敗 | Boundary - runtime | レポートが保存され、失敗（exitCode!=0）が記録される | |
| TC-CMD-05 | 観点表生成失敗（Provider） | Boundary - runtime | ログがそのまま観点表として保存される | フォールバック動作 |
| TC-CMD-06 | VS Code起動テストコマンド | Equivalence - config | テスト実行がスキップされる（再帰起動防止） | |

## 12. テスト実行情報

- **実行コマンド**: `npm test`
- **カバレッジ**: 現状は `vscode-test` による統合テスト実行のため、カバレッジレポートは出力されません（将来対応予定）。

