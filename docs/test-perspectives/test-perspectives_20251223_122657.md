# テスト観点表（自動生成）

- 生成日時: 2025-12-23T03:27:31.108Z
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
- src/test/suite/core/promptBuilder.test.ts
- src/test/suite/extension.test.ts
- src/test/suite/index.ts
- src/test/suite/ui/outputChannel.test.ts
- src/ui/outputChannel.ts
- src/ui/quickPick.ts
- src/ui/statusBar.ts

---

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|--------|----------------------|---------------------------------------|-----------------|-------|
| **Core: Artifacts** | | | | `src/core/artifacts.ts` |
| TC-ART-01 | 設定 `perspectiveReportDir` がデフォルト値 | Equivalence - Default Config | ワークスペース直下の `docs/test-perspectives` に保存される | |
| TC-ART-02 | 設定 `perspectiveReportDir` がカスタムパス（相対） | Equivalence - Custom Config | 指定した相対パスがワークスペースルートと結合され、そこに保存される | |
| TC-ART-03 | 設定 `perspectiveReportDir` が絶対パス | Equivalence - Absolute Path | 指定した絶対パスに保存される | |
| TC-ART-04 | 保存先ディレクトリが存在しない | Boundary - Missing Dir | ディレクトリが再帰的に作成され、ファイルが保存される | |
| TC-ART-05 | 生成ファイル名 | Equivalence - Naming | `test-perspectives_YYYYMMDD_HHmmss.md` の形式で保存される | |
| TC-ART-06 | 観点表Markdown生成（正常な観点リスト） | Equivalence - Content | 指定された言語（ja）で、観点表フォーマットに従ったMarkdownが返される | |
| TC-ART-07 | 観点表Markdown生成（観点なし/空） | Boundary - Empty List | 「(なし)」または適切なプレースホルダーを含むMarkdownが返される | |
| TC-ART-08 | テスト実行レポート生成（正常実行） | Equivalence - Content | 成功ステータス、コマンド、標準出力が含まれる | |
| TC-ART-09 | テスト実行レポート生成（失敗実行） | Equivalence - Content | 失敗ステータス、Exit Code、標準エラー出力が含まれる | |
| TC-ART-10 | ファイル書き込み権限なし | Boundary - IO Error | エラーがスローされるか、適切にハンドリング（ログ出力等）される | |
| **Core: Test Runner** | | | | `src/core/testRunner.ts` |
| TC-RUN-01 | 正常なテストコマンド (`echo "test"`) | Equivalence - Success | Exit Code 0, stdoutに "test", stderrなし が返される | |
| TC-RUN-02 | 失敗するテストコマンド (`exit 1`) | Equivalence - Failure | Exit Code 1 が返される | |
| TC-RUN-03 | 存在しないコマンド (`invalidcmd`) | Boundary - System Error | エラー（ENOENT等）または Exit Code != 0 が返される | |
| TC-RUN-04 | 実行ディレクトリ指定 | Equivalence - CWD | 指定された `cwd` でコマンドが実行される | |
| TC-RUN-05 | 大量の標準出力が発生 | Boundary - Output Size | バッファオーバーフローせずにキャプチャされる（または制限内で切り捨て） | |
| **Command: Run With Artifacts** | | | | `src/commands/runWithArtifacts.ts` |
| TC-RWA-01 | `includeTestPerspectiveTable: true`, `testCommand` あり | Equivalence - Full Flow | 観点表生成保存 -> テスト生成 -> テスト実行 -> レポート保存 の全工程が行われる | |
| TC-RWA-02 | `includeTestPerspectiveTable: false` | Equivalence - Config Off | 観点表保存がスキップされ、テスト生成以降が行われる | |
| TC-RWA-03 | `testCommand` が空文字 | Boundary - Skip Test | テスト実行およびレポート保存がスキップされる | |
| TC-RWA-04 | テスト生成失敗（Provider Error） | Boundary - Process Break | 観点表保存済み、テスト実行スキップ、エラー通知が表示される | |
| TC-RWA-05 | テスト実行失敗（Exit Code 1） | Equivalence - Test Fail | レポートは保存され、失敗を示す通知が表示される | |
| **Integration & Settings** | | | | `src/extension.ts` |
| TC-EXT-01 | コマンドパレットからの実行 (`Chottotest: ...`) | Equivalence - Activation | コマンドが正常に起動し、QuickPick等のUIが表示される | 名称変更の確認 |
| TC-EXT-02 | `.vscodeignore` の除外設定 | Equivalence - Package | ビルドされた `.vsix` に `docs/test-perspectives/` 内の生成物が含まれていない | |
| TC-EXT-03 | 新規設定項目の初期値ロード | Equivalence - Config Load | `testgen-agent.perspectiveReportDir` 等が未設定時にデフォルト値が使用される | |
| **UI Components** | | | | `src/ui/*` |
| TC-UI-01 | ControlPanel 初期化 | Equivalence - Init | パネルが正常に作成され、初期コンテンツが表示される | `src/ui/controlPanel.ts` |
| TC-UI-02 | OutputChannel ログ出力 | Equivalence - Logging | アーティファクト保存時のパスや実行コマンドがログに出力される | `src/ui/outputChannel.ts` |
