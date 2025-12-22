# テスト実装サマリ

## 実装したテスト

テスト戦略ルール（`docs/test-strategy.md`）に従って、以下のテストを実装しました。

### 1. テスト観点表
- `docs/test-perspectives.md` に全モジュールのテスト観点表を作成

### 2. 実装したテストファイル

#### `src/test/suite/core/event.test.ts`
- `nowMs()` 関数のテスト
- `TestGenEvent` 型の各バリアント（started/log/fileWrite/completed）のテスト
- 正常系・異常系・境界値のテスト

#### `src/test/suite/core/promptBuilder.test.ts`
- `parseLanguageConfig()` 関数のテスト
  - 正常な設定ファイルの解析
  - 設定ファイルなしの場合
  - 不正なJSON形式
  - 必須フィールド欠如
- `buildTestGenPrompt()` 関数のテスト
  - 正常なプロンプト構築
  - 複数のtargetPaths
  - 空のtargetPaths配列
  - 存在しないtestStrategyPath
  - 相対パス・絶対パスの処理

#### `src/test/suite/core/preflight.test.ts`
- `ensurePreflight()` 関数のテスト
  - 正常な環境での実行
  - cursorAgentPath未設定時のデフォルト値
  - defaultModel設定済み・未設定
  - 環境依存のため、条件付きで実行

#### `src/test/suite/ui/outputChannel.test.ts`
- `getTestGenOutputChannel()` のテスト（シングルトンパターン）
- `appendEventToOutput()` のテスト（各イベント型の出力）
- `showTestGenOutput()` のテスト

#### `src/test/suite/providers/cursorAgentProvider.test.ts`
- `CursorAgentProvider` クラスのテスト
  - プロパティの確認
  - agentCommand指定・未指定
  - model指定
  - allowWrite=true/false
  - dispose呼び出し

### 3. テストランナー設定

#### `src/test/runTest.ts`
- VS Code拡張機能テストのエントリーポイント
- `@vscode/test-electron` を使用

#### `src/test/suite/index.ts`
- Mochaテストスイートの実行
- テストファイルの自動検出

## テスト実行方法

### 前提条件
1. 依存関係のインストール:
   ```bash
   npm install
   ```

2. コンパイル:
   ```bash
   npm run compile
   ```

### テスト実行
```bash
npm test
```

または、VS Codeのデバッグ機能を使用:
1. F5キーで「Run Extension」を実行
2. Extension Development Hostウィンドウが起動
3. コマンドパレット（Cmd+Shift+P）で「Test: Run All Tests」を実行

## テストカバレッジ

### カバーしているモジュール
- ✅ `core/event.ts` - 完全カバー
- ✅ `core/promptBuilder.ts` - 主要機能をカバー
- ✅ `core/preflight.ts` - 環境依存のため条件付きテスト
- ✅ `ui/outputChannel.ts` - 完全カバー
- ✅ `providers/cursorAgentProvider.ts` - 主要機能をカバー

### 未カバー（統合テストが必要）
- `commands/generateFromFile.ts` - VS Code API依存のため統合テストが必要
- `commands/generateFromCommit.ts` - Gitコマンド依存のため統合テストが必要

## 注意事項

1. **環境依存テスト**: `preflight.test.ts` と `promptBuilder.test.ts` の一部テストは、実際のワークスペースやファイルシステムに依存するため、条件付きで実行されます。

2. **外部依存のモック**: `cursorAgentProvider.test.ts` では、実際の `spawn` を呼び出すため、プロセスが起動しますが、すぐに `dispose()` でクリーンアップされます。

3. **型定義**: Mochaの型定義（`@types/mocha`）が必要です。`npm install` を実行してインストールしてください。

## 実行コマンドとカバレッジ

### 実行コマンド
```bash
npm test
```

### カバレッジ取得（将来実装）
現在、カバレッジ計測は実装されていません。将来的には以下のツールを使用できます:
- `nyc` (Istanbul)
- `c8` (V8 coverage)

### カバレッジ目標
- 分岐網羅率: 100% を目標（達成が困難な場合は主要なエラー経路を優先）
- ステートメントカバレッジ: 80%以上

## テスト観点表の遵守

すべてのテストケースは `docs/test-perspectives.md` のテスト観点表に基づいて実装されています。各テストケースには以下のコメントフォーマットを付与しています:

```typescript
// Given: 前提条件
// When:  実行する操作
// Then:  期待する結果/検証
```
