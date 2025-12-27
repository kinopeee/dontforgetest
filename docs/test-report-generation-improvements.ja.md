# テスト観点表 / テスト実行レポート生成の改善案（仕組み側）

このドキュメントは、`docs/test-perspectives/` と `docs/test-execution-reports/` に出力される成果物（レポートそのもの）を修正するのではなく、**それらを生成する仕組み**を改善し、差分レビューや障害解析に役立つ情報を安定して残すための提案をまとめたものです。

## 対象範囲（現状の設計の要点）

- **成果物の保存**: `src/core/artifacts.ts`
  - 観点表: `saveTestPerspectiveTable()` / `buildTestPerspectiveArtifactMarkdown()`
  - 実行レポート: `saveTestExecutionReport()` / `buildTestExecutionArtifactMarkdown()`
- **実行レポートの集計**: 現状は `TestExecutionResult.stdout` を `parseMochaOutput()` でパースしてサマリ・詳細表を生成
  - `src/core/testResultParser.ts` の `parseMochaOutput()`
- **拡張機能テストの実行**（`npm test` で動く runner）:
  - `src/test/runTest.ts` が VS Code（Extension Host）を起動し、`test-result.json` を待って最終判定
- **Extension Host 側のテストランナー**（Mocha 実行 + `test-result.json` 出力）:
  - `src/test/suite/index.ts` が `test-result.json` を生成（pass/fail/pending + failedTests など）

## 課題（なぜ「失敗理由」がレポートに出にくいか）

- `buildTestExecutionArtifactMarkdown()` は `stdout` の **テキスト**から `parseMochaOutput()` で pass/fail を推定しており、**失敗理由（Assertion message, expected/actual, stack）** を構造的に取り込めない
- `parseMochaOutput()` は pending（`-` 表記）を拾えないため、**サマリに pending が反映されにくい**
- `stdout/stderr` はレポート生成時に上限で truncate されるため、**重要情報が末尾にあると欠落**する可能性がある
- cursor-agent 実行時は、レポートに書かれる `OS/Node/VS Code` が「実行環境」ではなく「レポート生成環境」になり得て、**環境情報が不正確**になるリスクがある

## 改善案（優先度順）

### P0: 失敗理由（原因特定に必要な情報）をレポートへ含める

最優先は、失敗時に「何が違ったか」をレポート上部で即座に把握できることです。

- **案A（最短・効果大）**: `test-result.json` の `failedTests` を `stdout`/`stderr` に明示的に出力する
  - `src/test/suite/index.ts` では `failedTests.push({ ..., error: err.message })` が既にあるため、`src/test/runTest.ts` 側で `test-result.json` を読み取った時点で、失敗理由を整形してログ出力できる
  - レポート生成側は「詳細ログ（stdout）」をそのまま載せているため、**仕組みの変更だけで失敗理由がレポートに残る**

- **案B（設計として堅い）**: `TestExecutionResult` に「構造化結果（test-result.json）の中身」を載せ、レポート生成がそれを優先する
  - 例: `TestExecutionResult` に `testResultJsonPath?: string` / `testResultJsonRaw?: string` / `failedTests?: ...` 等を追加
  - `buildTestExecutionArtifactMarkdown()` は `parseMochaOutput(stdout)` に依存せず、構造化結果から
    - 失敗テスト一覧（fullTitle）
    - 失敗理由（message）
    - （可能なら）stack
    を **専用セクション**として出す

### P0: pending（スキップ/未実装）の集計をサマリに入れる

- `src/test/suite/index.ts` の `test-result.json` には `pending` が含まれるため、P0案Bで吸収できる
- もしくは `parseMochaOutput()` に pending のパターン（`- <title>`）を追加し、`ParsedTestResult` に `pending` を追加する
  - ただし、テキストパースは揺れやすいので、**構造化結果優先**が望ましい

### P1: 失敗理由の“情報量”を増やす（message だけで終わらせない）

`failedTests.error` がメッセージのみだと、修正に必要な情報が不足することがあります。

- `src/test/suite/index.ts` の `FailedTestInfo` を拡張（後方互換のため optional 推奨）
  - `stack?: string`
  - `code?: string`（例: `ERR_ASSERTION`）
  - `expected?: string` / `actual?: string`（取得可能な場合）

### P1: truncate の影響を明示し、必要ならフルログを別ファイルで保存する

- `buildTestExecutionArtifactMarkdown()` は `stdout/stderr` を上限付きで truncate している
- 改善案:
  - 「このセクションは truncate 済み」を明示する
  - フルの `stdout.txt` / `stderr.txt` を `docs/test-execution-reports/` に **別ファイルとして保存**する（レポート本文にはリンク/ファイル名を記載）

### P2: 実行環境情報を“実行した環境”から取得する（cursor-agent 対応）

cursor-agent 経由では、レポート生成側の `process.platform` 等と実行側が一致しない可能性があるため、JSONスキーマの拡張が有効です。

- `TestExecutionJsonV1` を v2 にして、以下を追加:
  - `platform`, `arch`, `nodeVersion`, `vscodeVersion`（取得可能なら）
- `buildTestExecutionArtifactMarkdown()` は JSON 内の値を優先し、無い場合のみローカル値へフォールバックする

### P2: 構造化成果物（test-result.json）を「レポート成果物」として保存する

- `docs/test-execution-reports/test-execution_YYYYMMDD_HHmmss_test-result.json` のようにコピーして残す
- 後から機械的に集計（失敗傾向、flake率、失敗テストTopなど）が可能になる

## 追加の改善アイデア（任意）

- **複数コマンド実行のレポート統合**:
  - `npm test` だけでなく `npm run test:runTest` / `npm run coverage:*` などを連続実行した場合、1回のセッションの成果物としてまとめる（または関連付ける）
- **差分の種類に応じた“観点表テンプレート”切り替え**:
  - `package.json` のメタデータ変更（publisher/license/repository 等）を検知した場合は、VSIXパッケージング検証の観点を優先する、など

## （運用性/堅牢性）pending件数・失敗詳細の反映後も残る3点

pending件数（サマリへの表示）と失敗詳細（Message/Expected/Actual/Stack等）が成果物に反映されると、レポートの“読めば判断できる”品質は大きく向上します。  
一方で、**仕組みの堅牢性/運用性（環境差・調査効率・長期運用）**まで含めると、以下の3点が残タスクとして整理できます。

### 1) 実行環境情報の正確化（cursor-agent 実行時の齟齬対策）

- **問題**: レポートに書かれる `OS/Node/VS Code` が「実行した環境」ではなく「レポート生成側の環境」になる可能性がある
- **期待する状態**: cursor-agent 実行でも、レポートの環境欄が **実行環境の値**を示す（少なくとも識別可能）
- **具体案**:
  - テスト実行JSONを `TestExecutionJsonV2` に拡張し、`platform/arch/nodeVersion/vscodeVersion` を実行側で採取して含める
  - レポート生成側は JSON 内の値を優先し、無い場合のみローカル値へフォールバックする

### 2) truncate 対策（重要情報の欠落を防ぐ）

- **問題**: `stdout/stderr` の長さ上限により、失敗理由や実行ログが末尾にあると欠落する
- **期待する状態**:
  - truncate が発生したことがレポート本文から明確に分かる
  - 必要に応じてフルログへ辿れる（ローカル/CIどちらでも）
- **具体案**:
  - レポート本文に「truncated」を明示（切り詰め前/後の長さも記録）
  - フルの `stdout.txt` / `stderr.txt` を `docs/test-execution-reports/` に別ファイルとして保存し、レポートから参照できるようにする

### 3) 構造化成果物（test-result.json）の保存と二次利用

- **問題**: レポート本文だけだと、後から集計/分析（flake率、失敗Top、pending傾向など）がしにくい
- **期待する状態**:
  - レポートと同じタイムスタンプで **構造化JSON**が保存され、機械処理できる
  - CIでアーティファクトとして回収しやすい
- **具体案**:
  - `test-result.json` を `docs/test-execution-reports/test-execution_YYYYMMDD_HHmmss_test-result.json` としてコピー保存（またはJSONをレポートに埋め込む）
  - 将来的に差分比較・傾向分析ができるよう、フォーマット（version等）を明示して後方互換を担保する

## 実装メモ（どこを触ると最短か）

- レポート生成の核:
  - `src/core/artifacts.ts` の `buildTestExecutionArtifactMarkdown()`
- Extension Host テスト結果の核（構造化）:
  - `src/test/suite/index.ts` の `TestResultFile` / `failedTests`
- `test-result.json` を使った最終判定・ログ出力:
  - `src/test/runTest.ts` の結果ファイル読取・例外処理周り

