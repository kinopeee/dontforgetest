# 通知機能の実装ガイドライン

本ドキュメントは、`dontforgetest` 拡張機能に新しい通知機能を追加する際のベストプラクティスとガイドラインをまとめたものです。既存の実装パターンを基に、一貫性のある通知機能を実装するための指針を提供します。

---

## 1. 通知チャネルの全体像

本拡張機能では、以下の通知チャネルを目的に応じて使い分けています。

| チャネル | 用途 | 即時性 | ユーザー操作 |
|---|---|---|---|
| `showInformationMessage` | 成功・完了の報告 | 高 | 不要（自動消失） |
| `showWarningMessage` | 注意喚起・手動対応の案内 | 高 | アクションボタンで対応可能 |
| `showErrorMessage` | 致命的エラーの通知 | 高 | アクションボタンで対応可能 |
| ステータスバー | 実行中タスクの常時表示 | 中 | クリックで詳細表示 |
| Progress TreeView | フェーズごとの進捗表示 | 中 | サイドバーで常時確認可能 |
| Output Channel | 詳細ログの記録 | 低 | ユーザーが能動的に確認 |
| Control Panel (Webview) | リアルタイム状態同期 | 高 | ボタン操作で即座に反映 |

---

## 2. VS Code 標準 API の使用方法

### 2.1 情報メッセージ（`showInformationMessage`）

処理が正常に完了したことをユーザーに伝える場合に使用します。

```typescript
import * as vscode from 'vscode';
import { t } from '../core/l10n';

void vscode.window.showInformationMessage(
  t('your.notification.key', param1, param2)
);
```

**既存の使用例** (`src/commands/runWithArtifacts/worktreeApplyStep.ts`):

```typescript
void vscode.window.showInformationMessage(
  `Worktreeのテスト差分をローカルへ適用しました（${testPaths.length}件）`
);
```

**ポイント**:
- `void` を付けて fire-and-forget で呼び出す（`await` しない）
- 本処理のフローをブロックしない

### 2.2 警告メッセージ（`showWarningMessage`）

ユーザーの手動対応が必要な場合に使用します。アクションボタンを付けて次のアクションを案内できます。

```typescript
const action1 = t('your.action1.key');
const action2 = t('your.action2.key');

void vscode.window.showWarningMessage(warnMsg, action1, action2).then(async (picked) => {
  try {
    if (picked === action1) {
      // アクション1の処理
      return;
    }
    if (picked === action2) {
      // アクション2の処理
      return;
    }
  } catch {
    // noop（通知導線の失敗は本処理の失敗ではない）
  }
});
```

**既存の使用例** (`src/commands/runWithArtifacts/worktreeApplyStep.ts:136-165`):

```typescript
const actionOpenInstruction = t('worktree.apply.actionOpenInstructions');
const actionCopy = t('worktree.apply.actionCopyPrompt');

void vscode.window.showWarningMessage(warnMsg, actionOpenInstruction, actionCopy).then(async (picked) => {
  try {
    if (picked === actionCopy) {
      const promptText = buildMergeAssistancePromptText({ /* ... */ });
      await writeTextToClipboard(promptText);
      void vscode.window.showInformationMessage(t('worktree.apply.promptCopied'));
      return;
    }
    if (picked === actionOpenInstruction) {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(persisted.instructionPath));
      await vscode.window.showTextDocument(doc, { preview: true });
      return;
    }
  } catch {
    // noop（通知導線の失敗は本処理の失敗ではない）
  }
});
```

**ポイント**:
- `void` + `.then()` パターンで非同期に処理する（`await` するとバックグラウンド処理の完了が遅れる）
- アクションボタンは2つ程度に絞る（多いと視認性が悪化する）
- ボタンのコールバック内では必ず `try/catch` でエラーを握りつぶす

### 2.3 エラーメッセージ（`showErrorMessage`）

致命的なエラーや、設定の問題など、ユーザーが明示的に対応すべき場合に使用します。

```typescript
await vscode.window.showErrorMessage(
  t('your.error.key', errorDetail)
);
```

**既存の使用例** (`src/extension.ts:71`):

```typescript
await vscode.window.showErrorMessage(
  t('artifact.openFailed', latestPath, message)
);
```

**ポイント**:
- エラーメッセージには「設定を開く」「ドキュメントを開く」などの復旧アクションを付けるとユーザーフレンドリー
- 既存パターン参照: `cursorAgent.notFound` では「設定を開く」「ドキュメントを開く」の2つのアクションを提供

### 2.4 ステータスバー

実行中のタスク数など、常時表示が必要な情報に使用します。

```typescript
import * as vscode from 'vscode';

let statusBar: vscode.StatusBarItem | undefined;

export function initializeStatusBar(context: vscode.ExtensionContext): void {
  if (statusBar) {
    return;
  }
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBar.command = 'your.command.id';
  context.subscriptions.push(statusBar);
  update();
}
```

**既存の実装** (`src/ui/statusBar.ts`):

```typescript
export function initializeTestGenStatusBar(context: vscode.ExtensionContext): void {
  if (statusBar) {
    return;
  }
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'dontforgetest.showTestGeneratorOutput';
  context.subscriptions.push(statusBar);
  update();
}
```

**ポイント**:
- 初期化は `extension.ts` の `activate()` 内で一度だけ行う
- `context.subscriptions.push(statusBar)` で拡張機能の無効化時に自動破棄
- アイコンは Codicon を使用（例: `$(beaker)`, `$(loading~spin)`, `$(check)`）
- タスクがない場合は `statusBar.hide()` で非表示にする

---

## 3. TaskManager のリスナーパターンを使った状態管理との連携

### 3.1 アーキテクチャ概要

```
TaskManager (シングルトン)
  ├── register(taskId, label, runningTask)
  ├── unregister(taskId)
  ├── updatePhase(taskId, phase, phaseLabel)
  ├── addListener(callback)
  └── notifyListeners()
        ├── → Control Panel (Webview)
        ├── → Progress TreeView
        └── → Status Bar
```

`TaskManager` はオブザーバーパターンで状態変更を各 UI コンポーネントに通知します。

### 3.2 リスナーの登録

```typescript
import { taskManager } from '../core/taskManager';

// リスナーを登録
const listener = (isRunning: boolean, taskCount: number, phaseLabel?: string) => {
  // UI を更新する処理
};
taskManager.addListener(listener);

// 破棄時にリスナーを解除
taskManager.removeListener(listener);
```

**既存の使用例** (`src/ui/controlPanel.ts`):

```typescript
export class TestGenControlPanelViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly stateListener: (isRunning: boolean, taskCount: number, phaseLabel?: string) => void;

  public constructor(private readonly context: vscode.ExtensionContext) {
    this.stateListener = (isRunning, taskCount, phaseLabel) => {
      this.sendStateUpdate(isRunning, taskCount, phaseLabel);
    };
    taskManager.addListener(this.stateListener);
  }

  public dispose(): void {
    taskManager.removeListener(this.stateListener);
  }
}
```

### 3.3 イベント駆動の通知

`TestGenEvent` を使用して、各 UI コンポーネントに直接イベントを配信する方法です。

```typescript
import { type TestGenEvent } from '../core/event';

export function handleYourEvent(event: TestGenEvent): void {
  switch (event.type) {
    case 'started':
      // タスク開始時の処理
      break;
    case 'phase':
      // フェーズ変更時の処理
      break;
    case 'completed':
      // タスク完了時の処理
      break;
  }
}
```

**既存の使用例** (`src/ui/statusBar.ts`):

```typescript
export function handleTestGenEventForStatusBar(event: TestGenEvent): void {
  if (!statusBar) {
    return;
  }
  if (event.type === 'started') {
    running.set(event.taskId, { label: event.label, detail: event.detail });
    update();
    return;
  }
  if (event.type === 'completed') {
    running.delete(event.taskId);
    update();
    return;
  }
}
```

### 3.4 新しい UI コンポーネントの追加手順

1. **イベントハンドラを作成**: `handleTestGenEventFor<Component>()` 関数を実装
2. **初期化関数を作成**: `initialize<Component>(context)` 関数を実装
3. **extension.ts で登録**: `activate()` 内で初期化関数を呼び出し
4. **イベントディスパッチに追加**: イベント発火箇所でハンドラを呼び出し

---

## 4. 通知のタイミングと使い分け

### 4.1 判断フロー

```
ユーザーに伝えたいことは何か？
  │
  ├── 処理が正常に完了した
  │     → showInformationMessage（fire-and-forget）
  │
  ├── ユーザーの手動対応が必要
  │     → showWarningMessage + アクションボタン
  │
  ├── 致命的エラー / 設定ミス
  │     → showErrorMessage + 復旧アクション
  │
  ├── 処理の進行状況を常時表示したい
  │     → ステータスバー or Progress TreeView
  │
  └── 詳細なログを残したい
        → Output Channel（appendEventToOutput）
```

### 4.2 通知レベルの選択基準

| レベル | 使用場面 | 例 |
|---|---|---|
| Information | 処理成功、完了報告 | テスト差分の適用完了、レポート保存完了 |
| Warning | 手動対応が必要、部分的な失敗 | 自動マージ失敗、設定の警告 |
| Error | 致命的エラー、前提条件の未充足 | ファイルオープン失敗、エージェント未検出 |

### 4.3 `void` vs `await` の使い分け

```typescript
// fire-and-forget: 本処理のフローをブロックしない
void vscode.window.showInformationMessage(msg);

// await: ユーザーの選択を待つ必要がある場合
const selected = await vscode.window.showWarningMessage(msg, action1, action2);

// void + then: 非同期でユーザーの選択を処理（推奨パターン）
void vscode.window.showWarningMessage(msg, action1, action2).then(async (picked) => {
  // ...
});
```

**原則**: バックグラウンド処理（worktree 削除、クリーンアップなど）の完了を遅らせないために、`void` + `.then()` パターンを推奨します。

---

## 5. アクションボタンを含む通知の実装パターン

### 5.1 基本パターン

```typescript
import * as vscode from 'vscode';
import { t } from '../core/l10n';

function notifyWithActions(): void {
  const message = t('your.notification.message');
  const actionA = t('your.action.a');
  const actionB = t('your.action.b');

  void vscode.window.showWarningMessage(message, actionA, actionB).then(async (picked) => {
    try {
      if (picked === actionA) {
        // ファイルを開く
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(doc, { preview: true });
        return;
      }
      if (picked === actionB) {
        // クリップボードにコピー
        await vscode.env.clipboard.writeText(textToCopy);
        void vscode.window.showInformationMessage(t('your.copied.message'));
        return;
      }
    } catch {
      // noop（通知導線の失敗は本処理の失敗ではない）
    }
  });
}
```

### 5.2 設定画面への誘導パターン

```typescript
const openSettings = t('your.openSettings');
const openDocs = t('your.openDocs');

void vscode.window.showErrorMessage(
  t('your.error.agentNotFound', detail),
  openSettings,
  openDocs
).then(async (picked) => {
  try {
    if (picked === openSettings) {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'dontforgetest');
      return;
    }
    if (picked === openDocs) {
      await vscode.env.openExternal(vscode.Uri.parse('https://example.com/docs'));
      return;
    }
  } catch {
    // noop
  }
});
```

### 5.3 設計上の注意点

- **ボタン数は最大2つ**: 多いと視認性が悪化する。詳細は別のファイルや画面に集約する
- **ボタンラベルは簡潔に**: 「設定を開く」「ドキュメントを開く」のように動詞 + 目的語で表現する
- **文字列比較で分岐**: ボタンの識別は返却された文字列とラベルの一致で行う
- **エラーハンドリング**: `try/catch` で握りつぶし、通知の失敗が本処理に影響しないようにする

---

## 6. 国際化（l10n）への対応

### 6.1 翻訳関数 `t()` の使用

すべてのユーザー向けメッセージは `t()` 関数を通して表示します。

```typescript
import { t } from '../core/l10n';

// 引数なし
t('your.message.key');

// 位置引数
t('your.message.key', value1, value2);

// 名前付き引数
t('your.message.key', { name: value });
```

### 6.2 l10n バンドルへのキー追加

新しい通知メッセージを追加する場合、以下の2つのファイルに**同時に**キーを追加します。

**`l10n/bundle.l10n.json`（英語 / デフォルト）:**

```json
{
  "your.notification.success": "Operation completed successfully ({0} files).",
  "your.notification.warning": "Manual intervention required.",
  "your.action.openFile": "Open file",
  "your.action.copyPrompt": "Copy prompt"
}
```

**`l10n/bundle.l10n.ja.json`（日本語）:**

```json
{
  "your.notification.success": "処理が完了しました（{0}件）。",
  "your.notification.warning": "手動対応が必要です。",
  "your.action.openFile": "ファイルを開く",
  "your.action.copyPrompt": "プロンプトをコピー"
}
```

### 6.3 キーの命名規則

既存のパターンに従い、以下の規則でキーを命名します。

```
<機能ドメイン>.<サブカテゴリ>.<詳細>
```

| パターン | 例 |
|---|---|
| 通知メッセージ | `worktree.apply.manualMergeRequired` |
| アクションボタン | `worktree.apply.actionOpenInstructions` |
| ステータスバー | `statusBar.running` |
| コントロールパネル | `controlPanel.button.generating` |
| 進捗表示 | `progressTreeView.phase.preparing` |

### 6.4 プレースホルダー

位置引数 `{0}`, `{1}`, ... を使用します。

```json
{
  "testGeneration.completed": "テスト生成が完了しました: {0}",
  "testGeneration.failed": "テスト生成に失敗しました: {0} (exit={1})"
}
```

### 6.5 注意事項

- 本拡張は「キー文字列」を `vscode.l10n.t()` の `message` に渡す方式を採用しています
- 英語環境ではキーがそのまま表示される問題を `l10n.ts` 内のフォールバック機構で解決しています
- 新しいキーを追加する際は、**必ず英語・日本語の両方のバンドルに追加**してください

---

## 7. Output Channel との併用

通知メッセージを表示するだけでなく、Output Channel にも詳細ログを残すのが推奨パターンです。

```typescript
import { emitLogEvent } from '../core/artifacts';
import { appendEventToOutput } from '../ui/outputChannel';

// Output Channel にログを残しつつ、ユーザーにも通知
appendEventToOutput(
  emitLogEvent(taskId, 'info', `処理が完了しました（${count}件）`)
);
void vscode.window.showInformationMessage(t('your.success.key', count));
```

**ログレベルの使い分け:**

| レベル | 用途 |
|---|---|
| `info` | 正常な処理の記録 |
| `warn` | 注意が必要だが処理は続行 |
| `error` | エラー発生（処理中断の可能性） |

---

## 8. エラーハンドリングの原則

### 8.1 通知導線の失敗は本処理の失敗ではない

通知に関するエラーは本処理のフローに影響を与えてはいけません。

```typescript
// 良い例: try/catch で握りつぶす
void vscode.window.showWarningMessage(msg, action).then(async (picked) => {
  try {
    if (picked === action) {
      await someOperation();
    }
  } catch {
    // noop（通知導線の失敗は本処理の失敗ではない）
  }
});

// 悪い例: 通知の失敗が本処理に伝播する
await vscode.window.showWarningMessage(msg, action).then(async (picked) => {
  if (picked === action) {
    await someOperation(); // ここのエラーが呼び出し元に伝播する
  }
});
```

### 8.2 防御的な初期化チェック

```typescript
export function handleEvent(event: TestGenEvent): void {
  // 初期化前のイベント呼び出しに備える
  if (!statusBar) {
    return;
  }
  // ...
}
```

### 8.3 リスナー内のエラー隔離

`TaskManager` のリスナー通知では、個々のリスナーのエラーが他のリスナーに影響しないようになっています。

```typescript
private notifyListeners(): void {
  for (const listener of this.listeners) {
    try {
      listener(isRunning, taskCount, phaseLabel);
    } catch {
      // リスナーのエラーは無視
    }
  }
}
```

新しいリスナーを追加する場合も、この安全性を前提にできますが、リスナー内で重い処理や例外を発生させないよう注意してください。

---

## 9. 新しい通知機能を追加するチェックリスト

新しい通知機能を実装する際は、以下のチェックリストを確認してください。

- [ ] 通知の目的に合ったチャネル（Information / Warning / Error / StatusBar）を選択した
- [ ] メッセージ文字列を `t()` 関数でラップし、l10n キーを使用している
- [ ] `l10n/bundle.l10n.json`（英語）にキーと文言を追加した
- [ ] `l10n/bundle.l10n.ja.json`（日本語）にキーと文言を追加した
- [ ] アクションボタンを使用する場合、ボタン数は2つ以内に収めた
- [ ] アクションボタンのコールバックは `try/catch` で囲んでいる
- [ ] `void` + `.then()` パターンで本処理をブロックしていない（必要な場合を除く）
- [ ] Output Channel にも対応するログを出力している
- [ ] 初期化前の呼び出しに対する防御コードがある
- [ ] TaskManager のリスナーを使用する場合、`dispose()` でリスナーを解除している
- [ ] `context.subscriptions.push()` で拡張機能の無効化時の自動破棄を設定している

---

## 10. 実装テンプレート集

### 10.1 成功通知テンプレート

```typescript
import * as vscode from 'vscode';
import { emitLogEvent } from '../core/artifacts';
import { t } from '../core/l10n';
import { appendEventToOutput } from '../ui/outputChannel';

function notifySuccess(taskId: string, count: number): void {
  appendEventToOutput(
    emitLogEvent(taskId, 'info', t('your.success.log', count))
  );
  void vscode.window.showInformationMessage(t('your.success.message', count));
}
```

### 10.2 警告通知（アクション付き）テンプレート

```typescript
import * as vscode from 'vscode';
import { emitLogEvent } from '../core/artifacts';
import { t } from '../core/l10n';
import { appendEventToOutput } from '../ui/outputChannel';

function notifyWarningWithActions(taskId: string): void {
  const msg = t('your.warning.message');
  appendEventToOutput(emitLogEvent(taskId, 'warn', msg));

  const actionOpen = t('your.action.open');
  const actionCopy = t('your.action.copy');

  void vscode.window.showWarningMessage(msg, actionOpen, actionCopy).then(async (picked) => {
    try {
      if (picked === actionOpen) {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
        await vscode.window.showTextDocument(doc, { preview: true });
        return;
      }
      if (picked === actionCopy) {
        await vscode.env.clipboard.writeText(contentToCopy);
        void vscode.window.showInformationMessage(t('your.copied.message'));
        return;
      }
    } catch {
      // noop
    }
  });
}
```

### 10.3 TaskManager リスナー連携テンプレート

```typescript
import * as vscode from 'vscode';
import { taskManager } from '../core/taskManager';

export class YourNotificationComponent implements vscode.Disposable {
  private readonly listener: (isRunning: boolean, taskCount: number, phaseLabel?: string) => void;

  constructor() {
    this.listener = (isRunning, taskCount, phaseLabel) => {
      this.update(isRunning, taskCount, phaseLabel);
    };
    taskManager.addListener(this.listener);
  }

  private update(isRunning: boolean, taskCount: number, phaseLabel?: string): void {
    // UI 更新ロジック
  }

  public dispose(): void {
    taskManager.removeListener(this.listener);
  }
}
```

### 10.4 イベントハンドラテンプレート

```typescript
import { type TestGenEvent } from '../core/event';
import { t } from '../core/l10n';

let initialized = false;

export function initializeYourComponent(context: vscode.ExtensionContext): void {
  if (initialized) {
    return;
  }
  initialized = true;
  // 初期化処理
  // context.subscriptions.push(...) でリソースを登録
}

export function handleTestGenEventForYourComponent(event: TestGenEvent): void {
  if (!initialized) {
    return;
  }

  switch (event.type) {
    case 'started':
      // タスク開始の処理
      break;
    case 'phase':
      // フェーズ変更の処理
      break;
    case 'completed':
      // タスク完了の処理
      break;
  }
}
```
