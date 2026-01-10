# 優先度高リファクタリング実装プラン

## 概要

本ドキュメントは、優先度高のリファクタリング項目についての詳細な実装プランを記述する。

## 1. testAnalyzer.ts の分割（1483行 → 複数ファイル）

### 現状の問題
- 単一ファイルに1483行と機能が集中しすぎている
- テストパース、分析ルール、レポート生成が混在
- 単体テストが困難
- コードの見通しが悪い

### 分割方針
```
src/core/
├── testAnalyzer.ts          # パイプライン調整のみ（残す）
├── parsers/
│   ├── index.ts
│   ├── testParser.ts        # テスト関数の抽出
│   └── codeExtractor.ts     # コードのみ抽出
├── analysis/
│   ├── index.ts
│   ├── analyzer.ts          # 分析パイプライン
│   ├── rules/
│   │   ├── index.ts
│   │   ├── baseRule.ts      # 基底クラス
│   │   ├── givenWhenThenRule.ts
│   │   ├── boundaryValueRule.ts
│   │   └── exceptionMessageRule.ts
│   └── types.ts             # 分析関連の型定義
└── reporting/
    ├── index.ts
    ├── analysisReporter.ts  # レポート生成
    └── summaryCalculator.ts # サマリー計算
```

### 実装手順
1. **型定義の移動**
   - `AnalysisIssue`, `AnalysisResult`, `TestFunction` などを `analysis/types.ts` へ

2. **パーサー模块立**
   - `extractTestFunctions()` → `parsers/testParser.ts`
   - `extractCodeOnlyContent()` → `parsers/codeExtractor.ts`
   - `findFunctionEnd()` などのヘルパー関数も移動

3. **分析ルールの分離**
   - 各ルールクラスを独立したファイルへ
   - `BaseAnalysisRule` 抽象クラスを作成
   - ルールの登録機構を実装

4. **レポート生成模块立**
   - `calculateSummary()` → `reporting/summaryCalculator.ts`
   - レポート出力関連を `reporting/analysisReporter.ts` へ

5. **残りの testAnalyzer.ts を整理**
   - パイプラインの構築と実行のみに焦点
   - エクスポート関数を整理

## 2. 不安定なテストの修正

### 問題のテスト
- `runWithArtifacts.test.ts` の6件のスキップされたテスト
- すべて「テスト環境依存の問題で不安定」というコメント

### 原因分析
1. **外部プロセス依存**
   - cursor-agent や claude-code などの外部CLIに依存
   - 実行環境によって挙動が異なる

2. **非同期処理のタイミング**
   - タイムアウト設定が環境によって異なる
   - ストリーム処理の完了判定が不安定

3. **モックの不足**
   - ファイルシステム操作のモックが不十分
   - VS Code APIのモックが不完全

### 修正方針
1. **テスト環境の分離**
   ```typescript
   // 新しいテストユーティリティを作成
   src/test/utils/
   ├── mockAgentProvider.ts    # 安定したモックProvider
   ├── testEnvironment.ts      # テスト環境のセットアップ
   └── asyncHelpers.ts         # 非同期テストのヘルパー
   ```

2. **各テストの修正**
   - TC-CMD-05: Provider失敗テスト → モックを使用して再現
   - TC-CMD-09: Unsafeコマンド実行 → 設定ベースのテストに変更
   - TC-N-03: タイムアウト関連 → タイマーモックを使用
   - TC-E-08/E-11/E-23: 各種エラーケース → 適切なモックで再現

3. **共通テストヘルパーの実装**
   ```typescript
   // 例：安定したストリームモック
   function createMockStream(outputs: string[]): Readable {
     // 実装
   }
   
   // 例：タイミング制御
   async function withDelay<T>(fn: () => Promise<T>, ms: number): Promise<T>
   ```

### 実装手順
1. モック用ユーティリティを作成
2. 各不安定テストを1つずつ修正
3. 修正後にテストを有効化し、CIで安定することを確認

## 3. ロギングの統一

### 現状の問題
- 14ファイルで `console.log` / `console.warn` / `console.error` が散在
- ログレベルの制御がない
- 本番環境でのデバッグログが出すぎる

### 実装方針
1. **ロガーの実装**
   ```typescript
   // src/core/logger.ts
   export enum LogLevel {
     DEBUG = 0,
     INFO = 1,
     WARN = 2,
     ERROR = 3,
   }
   
   export class Logger {
     constructor(
       private context: string,
       private minLevel: LogLevel = LogLevel.INFO
     ) {}
     
     debug(message: string, ...args: any[]): void
     info(message: string, ...args: any[]): void
     warn(message: string, ...args: any[]): void
     error(message: string, ...args: any[]): void
   }
   
   // コンテキスト別ロガー
   export const extensionLogger = new Logger('extension');
   export const agentLogger = new Logger('agent');
   export const gitLogger = new Logger('git');
   ```

2. **設定連携**
   - VS Code設定でログレベルを制御
   ```json
   "dontforgetest.logLevel": {
     "type": "string",
     "enum": ["debug", "info", "warn", "error"],
     "default": "info"
   }
   ```

3. **既存コードの修正**
   - 各ファイルの console.* をロガーに置き換え
   - 重要なログは INFO、デバッグ情報は DEBUG に分類

### 実装手順
1. ロガークラスを実装
2. 設定項目を package.json に追加
3. 各ファイルの console.* を置き換え（PRごとに分割）
   - providers/*.ts
   - commands/*.ts
   - git/*.ts
   - その他

## 実装スケジュール

### Week 1: testAnalyzer.ts の分割
- Day 1-2: 型定義とパーサー模块立
- Day 3-4: 分析ルールの分離
- Day 5: レポート生成模块立と残りの整理

### Week 2: 不安定なテストの修正
- Day 1-2: モックユーティリティの実装
- Day 3-5: 各テストの修正と有効化

### Week 3: ロギングの統一
- Day 1-2: ロガーの実装と設定連携
- Day 3-5: 既存コードの置き換え

## 成功基準

1. **testAnalyzer.ts 分割**
   - 各ファイルが300行以内
   - 既存のテストがすべて通過
   - 新しいアーキテクチャで機能追加が容易になる

2. **テスト修正**
   - 6件すべてのテストが有効化され安定
   - CIで99%以上の成功率
   - テスト実行時間が増加しない

3. **ロギング統一**
   - console.* が完全に置き換えられる
   - 設定でログレベルを制御可能
   - パフォーマンス影響が最小限

## リスクと対策

1. **後方互換性**
   - 公開APIは変更しない
   - 内部実装のみをリファクタリング

2. **テストカバレッジ**
   - リファクタリング前後でカバレッジを維持
   - 新しいモジュールの単体テストを追加

3. **パフォーマンス**
   - 分離によるオーバーヘッドを計測
   - 必要に応じて最適化を実施
