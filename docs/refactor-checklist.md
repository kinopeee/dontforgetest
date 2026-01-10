# 優先度高リファクタリング チェックリスト

## 1. testAnalyzer.ts の分割

### Week 1: Day 1-2 - 型定義とパーサー模块立
- [x] `analysis/types.ts` を作成し、型定義を移動
  - [x] `AnalysisIssue`
  - [x] `AnalysisResult`
  - [x] `AnalysisSummary`
  - [x] `TestFunction`
  - [x] `AnalysisContext`
- [x] `parsers/testParser.ts` を作成
  - [x] `extractTestFunctions()` を移動
  - [x] `findFunctionEnd()` を移動
  - [x] `extractPrecedingComments()` を移動
- [x] `parsers/codeExtractor.ts` を作成
  - [x] `extractCodeOnlyContent()` を移動
  - [x] `hasEmptyStringLiteralInCode()` を移動
  - [x] `isRegexStart()` を移動
- [x] `parsers/index.ts` でエクスポートを整理
- [x] 既存のテストが通ることを確認

### Week 1: Day 3-4 - 分析ルールの分離
- [x] `analysis/rules/baseRule.ts` を作成
  - [x] `BaseAnalysisRule` 抽象クラスを実装
- [x] `analysis/rules/givenWhenThenRule.ts` を作成
  - [x] `GivenWhenThenAnalysisRule` を移動
  - [x] `checkGivenWhenThenStrict()` を移動
- [x] `analysis/rules/boundaryValueRule.ts` を作成
  - [x] `BoundaryValueAnalysisRule` を移動
  - [x] `checkBoundaryValue()` を移動
- [x] `analysis/rules/exceptionMessageRule.ts` を作成
  - [x] `ExceptionMessageAnalysisRule` を移動
  - [x] `checkExceptionMessage()` を移動
- [x] `analysis/rules/index.ts` でエクスポートを整理
- [x] 既存のテストが通ることを確認

### Week 1: Day 5 - レポート生成模块立と残りの整理
- [x] `reporting/summaryCalculator.ts` を作成
  - [x] `calculateSummary()` を移動
- [x] `reporting/analysisReporter.ts` を作成
  - [x] レポート出力関連関数を移動
- [x] `analysis/analyzer.ts` を作成
  - [x] `TestFileAnalysisPipeline` を移動
  - [x] `createDefaultAnalysisPipeline()` を移動
- [x] `testAnalyzer.ts` を整理
  - [x] パイプライン調整のみに絞る
  - [x] エクスポート関数を整理
- [x] すべてのファイルが300行以内であることを確認
- [x] 既存のテストが通ることを確認

## 2. 不安定なテストの修正

### Week 2: Day 1-2 - モックユーティリティの実装
- [ ] `test/utils/mockAgentProvider.ts` を作成
  - [ ] 安定したモックProviderを実装
  - [ ] エラーシナリオを再現できるようにする
- [ ] `test/utils/testEnvironment.ts` を作成
  - [ ] テスト環境のセットアップ関数を実装
  - [ ] クリーンアップ処理を実装
- [ ] `test/utils/asyncHelpers.ts` を作成
  - [ ] `createMockStream()` を実装
  - [ ] `withDelay()` を実装
  - [ ] `waitForStreamEnd()` を実装
- [ ] 新しいユーティリティの単体テストを作成

### Week 2: Day 3-5 - 各テストの修正と有効化
- [ ] TC-CMD-05: Provider失敗テストを修正
  - [ ] モックを使用して失敗シナリオを再現
  - [ ] test.skip を削除
- [ ] TC-CMD-09: Unsafeコマンド実行テストを修正
  - [ ] 設定ベースのテストに変更
  - [ ] test.skip を削除
- [ ] TC-N-03: タイムアウト関連テストを修正
  - [ ] タイマーモックを使用
  - [ ] test.skip を削除
- [ ] TC-E-08: 観点表生成失敗テストを修正
  - [ ] 適切なモックで再現
  - [ ] test.skip を削除
- [ ] TC-E-11: マーカー未検出テストを修正
  - [ ] ローカル環境依存を排除
  - [ ] test.skip を削除
- [ ] TC-E-23: JSON/Markdown不在テストを修正
  - [ ] 安定したモックを実装
  - [ ] test.skip を削除
- [ ] CIで99%以上の成功率を確認

## 3. ロギングの統一

### Week 3: Day 1-2 - ロガーの実装と設定連携
- [ ] `core/logger.ts` を作成
  - [ ] `Logger` クラスを実装
  - [ ] `LogLevel` 列挙型を実装
  - [ ] コンテキスト別ロガーを定義
- [ ] `package.json` に設定項目を追加
  - [ ] `dontforgetest.logLevel` 設定を追加
- [ ] 設定読み込み機能を実装
- [ ] ロガーの単体テストを作成
- [ ] 出力フォーマットを統一

### Week 3: Day 3-5 - 既存コードの置き換え
- [ ] providers/*.ts の console.* を置き換え
  - [ ] `cursorAgentProvider.ts`
  - [ ] `claudeCodeProvider.ts`
  - [ ] `geminiCliProvider.ts`
  - [ ] `codexCliProvider.ts`
- [ ] commands/*.ts の console.* を置き換え
  - [ ] すべてのコマンドファイル
- [ ] git/*.ts の console.* を置き換え
  - [ ] `gitExec.ts`
  - [ ] `diffAnalyzer.ts`
  - [ ] `worktreeManager.ts`
- [ ] その他のファイルの console.* を置き換え
  - [ ] `extension.ts`
  - [ ] テストファイル以外の全ファイル
- [ ] 設定でログレベルを制御できることを確認
- [ ] パフォーマンス影響を測定

## 全体の進捗

### マイルストーン
- [ ] **Week 1 完了**: testAnalyzer.ts の分割完了
- [ ] **Week 2 完了**: 不安定なテストすべて修正完了
- [ ] **Week 3 完了**: ロギング統一完了

### 品質チェック
- [ ] すべての既存テストが通過
- [ ] テストカバレッジが維持されている
- [ ] コードレビュー完了
- [ ] パフォーマンス低下なし
- [ ] ドキュメント更新完了

### 最終確認
- [ ] PRを作成し、レビューを依頼
- [ ] CIで全テストがパス
- [ ] マージ完了
- [ ] ブランチを削除

---

## 進捗率

- [x] 1. testAnalyzer.ts の分割: 100%
- [ ] 2. 不安定なテストの修正: 0%
- [ ] 3. ロギングの統一: 0%
- [ ] **全体進捗: 33%**

---

*最終更新日: 2026-01-11*
