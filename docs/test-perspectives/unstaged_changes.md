# テスト観点表（Unstaged Changes）

## 対象機能
- `src/core/artifacts.ts`: 成果物（観点表・実行レポート）の保存ロジック
- `src/core/testRunner.ts`: テストコマンド実行ロジック
- `src/commands/runWithArtifacts.ts`: 生成フロー全体のオーケストレーション

| Case ID | Component | Function | Input / Precondition | Perspective | Expected Result | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| TC-ART-01 | artifacts.ts | getArtifactSettings | 設定値が存在する | Equivalence - Normal | 設定値が正しく読み込まれる | |
| TC-ART-02 | artifacts.ts | getArtifactSettings | 設定値が未定義 | Boundary - Defaults | デフォルト値が返される | |
| TC-ART-03 | artifacts.ts | formatTimestamp | Dateオブジェクト | Equivalence - Normal | `YYYYMMDD_HHmmss` 形式の文字列が返される | |
| TC-ART-04 | artifacts.ts | resolveDirAbsolute | 絶対パス | Equivalence - Absolute | そのまま返される | |
| TC-ART-05 | artifacts.ts | resolveDirAbsolute | 相対パス | Equivalence - Relative | ワークスペースルートと結合して返される | |
| TC-ART-06 | artifacts.ts | resolveDirAbsolute | 空文字 | Boundary - Empty | ワークスペースルートが返される | |
| TC-ART-07 | artifacts.ts | saveTestPerspectiveTable | 有効な入力 | Equivalence - Normal | ファイルが作成され、成果物情報が返される | `vscode.workspace.fs` をモックまたは実ファイル確認 |
| TC-ART-08 | artifacts.ts | saveTestExecutionReport | 有効な入力 | Equivalence - Normal | ファイルが作成され、成果物情報が返される | |
| TC-ART-09 | artifacts.ts | buildTestPerspectiveArtifactMarkdown | 有効な入力 | Equivalence - Normal | 期待されるMarkdown形式（ヘッダ、メタデータ、内容） | |
| TC-ART-10 | artifacts.ts | buildTestExecutionArtifactMarkdown | 有効な入力（正常終了） | Equivalence - Normal | 期待されるMarkdown形式（stdout/stderr含む） | |
| TC-ART-11 | artifacts.ts | buildTestExecutionArtifactMarkdown | エラー情報あり | Equivalence - Error | エラーメッセージが含まれる | |
| TC-RUN-01 | testRunner.ts | runTestCommand | 正常なコマンド（echo） | Equivalence - Normal | exitCode=0, stdoutが取得できる | |
| TC-RUN-02 | testRunner.ts | runTestCommand | 無効なコマンド | Equivalence - Error | exitCode!=0 または errorMessage が設定される | |
| TC-RUN-03 | testRunner.ts | runTestCommand | 大量出力を行うコマンド | Boundary - Large Output | 出力が切り詰められる（truncated） | |
| TC-CMD-01 | runWithArtifacts.ts | runWithArtifacts | 全機能ON, 正常系 | Equivalence - Normal | 観点表保存→生成→テスト実行→レポート保存 の順に実行される | 各ステップの呼び出しを確認 |
| TC-CMD-02 | runWithArtifacts.ts | runWithArtifacts | 観点表保存OFF | Equivalence - Config | 観点表保存がスキップされる | |
| TC-CMD-03 | runWithArtifacts.ts | runWithArtifacts | テストコマンド空 | Equivalence - Config | テスト実行とレポート保存がスキップされる | |
| TC-CMD-04 | runWithArtifacts.ts | runWithArtifacts | 生成ステップ失敗 | Equivalence - Error | エラーが表示され、後続（テスト実行）がスキップされる | |
| TC-CMD-05 | runWithArtifacts.ts | runWithArtifacts | テスト実行失敗 | Equivalence - Error | レポートは保存され、失敗が記録される | |
