# テスト観点表（自動生成）

- 生成日時: 2025-12-23T03:37:27.695Z
- 対象: 未コミット差分 (Unstaged（未ステージ）)
- 対象ファイル:
- .cursor/commands/build-vsix.md
- .cursor/plans/テスト生成エージェント拡張機能_99f5aa74.plan.md
- .vscodeignore
- README.md
- docs/test-evaluation-report.md
- docs/test-execution-report.md
- docs/test-perspectives.md
- docs/usage.md
- package-lock.json
- package.json
- src/commands/generateFromCommit.ts
- src/commands/generateFromCommitRange.ts
- src/commands/generateFromFile.ts
- src/commands/generateFromWorkingTree.ts
- src/commands/selectDefaultModel.ts
- src/core/promptBuilder.ts
- src/extension.ts
- src/git/diffAnalyzer.ts
- src/providers/cursorAgentProvider.ts
- src/test/suite/commands/runWithArtifacts.test.ts
- src/test/suite/core/promptBuilder.test.ts
- src/test/suite/index.ts
- src/test/suite/ui/outputChannel.test.ts
- src/ui/outputChannel.ts
- src/ui/quickPick.ts
- src/ui/statusBar.ts

---

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|--------|----------------------|---------------------------------------|-----------------|-------|
| **1. Artifacts Core** | **src/core/artifacts.ts** | | | |
| TC-ART-01 | デフォルト設定の取得 | Equivalence - normal | `includeTestPerspectiveTable`=true, `testCommand`='npm test' 等のデフォルト値が返される | 設定ファイルがない/未設定の場合 |
| TC-ART-02 | タイムスタンプ生成 (正常系) | Equivalence - normal | `YYYYMMDD_HHmmss` 形式の文字列が返される | `Date` オブジェクトから生成 |
| TC-ART-03 | タイムスタンプ生成 (境界値 - 桁埋め) | Boundary - padding | 1月1日 1時1分1秒 等の場合でも0埋めされ桁数が一定である | `20250101_010101` |
| TC-ART-04 | 絶対パス解決 (絶対パス入力) | Equivalence - path resolution | 入力パスがそのまま返される | |
| TC-ART-05 | 絶対パス解決 (相対パス入力) | Equivalence - path resolution | ワークスペースルートと結合された絶対パスが返される | |
| TC-ART-06 | 絶対パス解決 (空文字) | Boundary - empty | ワークスペースルートパスが返される | |
| TC-ART-07 | 観点表Markdown生成 (正常) | Equivalence - content | タイトル、生成日時、対象ファイルリスト、Markdown本文が含まれる | |
| TC-ART-08 | 観点表Markdown生成 (対象ファイルなし) | Boundary - empty list | 対象ファイル欄に「(なし)」と表示される | |
| TC-ART-09 | 観点表Markdown生成 (本文空) | Boundary - empty content | 「(観点表の生成結果が空でした)」等の代替メッセージが含まれる | |
| TC-ART-10 | 実行レポートMarkdown生成 (正常 - 成功) | Equivalence - content | exitCode=0, stdout出力が含まれる | |
| TC-ART-11 | 実行レポートMarkdown生成 (正常 - 失敗) | Equivalence - content | exitCode=1, stderr出力が含まれる | |
| TC-ART-12 | 実行レポートMarkdown生成 (実行エラー) | Boundary - execution error | `errorMessage` (spawn error等) が含まれる | exitCodeは null |
| TC-ART-13 | 実行レポートMarkdown生成 (出力空) | Boundary - empty output | stdout/stderr セクションが空のコードブロックとして生成される | |
| TC-ART-14 | 実行レポートMarkdown生成 (ANSIコード除去) | Equivalence - formatting | 出力に含まれるANSIエスケープシーケンスが除去されている | 可読性のため |
| TC-ART-15 | 実行レポートMarkdown生成 (モデル名) | Equivalence - content | モデル名が指定されている場合、レポートに記載される | 指定なし時は (auto) |
| TC-ART-16 | ファイル保存 (ディレクトリ自動生成) | Equivalence - file system | 保存先ディレクトリが存在しない場合、自動生成されて保存される | `fs.mkdir -p` 相当 |
| **2. Test Runner** | **src/core/testRunner.ts** | | | |
| TC-RUN-01 | 正常コマンド実行 | Equivalence - normal | exitCode=0, stdoutあり, stderrなし | `echo` 等 |
| TC-RUN-02 | 失敗コマンド実行 | Equivalence - error flow | exitCode!=0 (例: 1) | `exit 1` 等 |
| TC-RUN-03 | 無効コマンド実行 | Boundary - invalid command | エラーメッセージが返される、またはexitCode!=0 | シェル依存の挙動確認 |
| TC-RUN-04 | 大量出力 (境界値 - 上限超過) | Boundary - max size | 指定サイズ (例: 5MB) で出力が切り詰められ、末尾にtruncatedメッセージが付与される | メモリ保護 |
| TC-RUN-05 | 大量出力 (境界値 - 上限未満) | Boundary - within limit | 出力が切り詰められず、全量取得できる | |
| TC-RUN-06 | 実行ディレクトリ (cwd) | Equivalence - context | 指定した `cwd` でコマンドが実行される | pwd/ls 等で確認 |
| TC-RUN-07 | 環境変数 | Equivalence - context | `process.env` が引き継がれている | |
| **3. Integration Flow** | **src/commands/runWithArtifacts.ts** | | | |
| TC-CMD-01 | 全機能有効 (観点表+生成+実行) | Equivalence - full flow | 観点表生成→コード生成→テスト実行 の順で進行し、全アーティファクトが保存される | |
| TC-CMD-02 | 観点表生成の無効化 | Equivalence - config | `includeTestPerspectiveTable`=false 時、観点表生成ステップがスキップされる | ファイル保存なし |
| TC-CMD-03 | テスト実行の無効化 (設定OFF) | Equivalence - config | `testCommand` が空文字の場合、テスト実行ステップがスキップされる | レポート保存なし |
| TC-CMD-04 | VSCode起動コマンドの検出 (スキップ) | Equivalence - safety | `testCommand` がVS Codeを起動するコマンド (`npm test` 内で `runTest.js` 実行等) の場合、実行が自動スキップされる | 再帰起動防止 |
| TC-CMD-05 | VSCode起動コマンドの検出 (実行) | Equivalence - safety | VS Code起動を含まない通常の `npm test` 等は実行される | |
| TC-CMD-06 | 観点表生成の失敗 (Provider Error) | Boundary - provider error | Providerエラー時でも、エラーログを含む観点表ファイルが保存される | 失敗の証跡を残す |
| TC-CMD-07 | テスト実行の失敗 (Test Fail) | Boundary - test failure | テスト失敗 (exitCode!=0) 時でも、実行レポートが保存される | 失敗の証跡を残す |
| TC-CMD-08 | 観点表抽出失敗 (マーカーなし) | Boundary - parse error | AI回答にマーカーが含まれない場合、回答全文をログとして保存する | フォールバック |
| TC-CMD-09 | 生成タスクIDの連携 | Equivalence - traceability | 観点表生成とテスト生成で関連するタスクIDが使用される（ログ/ステータスバー） | |
| TC-CMD-10 | デバッグログ出力 | Equivalence - debug | `runWithArtifacts` の各フェーズでデバッグログ (file/http) が出力される | エラー時含む |
| **4. Settings & UI** | **src/extension.ts / package.json** | | | |
| TC-SET-01 | 設定変更の即時反映 | Equivalence - config | 設定画面で保存先パス等を変更後、再起動なしで次回の生成に反映される | |
| TC-SET-02 | 新規依存関係 (ESLint) | Equivalence - maintenance | `npm run lint` がエラーなく通過する | ESLint v9対応 |
| TC-SET-03 | VSIXビルド | Equivalence - release | `npm run package` (vsce package) が成功し、`.vsix` が生成される | 新名称 `chottotest` |
