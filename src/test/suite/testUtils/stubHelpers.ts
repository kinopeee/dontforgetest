import * as vscode from 'vscode';

/**
 * VS Code API のスタブ化と復元を安全に行うためのヘルパー。
 *
 * 使用例:
 * ```typescript
 * const restore = stubWorkspaceFolders([{ uri: vscode.Uri.file('/path'), name: 'test', index: 0 }]);
 * try {
 *   // テストコード
 * } finally {
 *   restore();
 * }
 * ```
 */

/**
 * vscode.workspace.workspaceFolders をスタブ化する。
 * 返却される関数を呼び出すと元の状態に復元される。
 */
export function stubWorkspaceFolders(folders: vscode.WorkspaceFolder[] | undefined): () => void {
  const workspaceObj = vscode.workspace as unknown as { workspaceFolders?: vscode.WorkspaceFolder[] };
  const hadOwn = Object.prototype.hasOwnProperty.call(workspaceObj, 'workspaceFolders');
  const originalDesc = Object.getOwnPropertyDescriptor(workspaceObj, 'workspaceFolders');
  Object.defineProperty(workspaceObj, 'workspaceFolders', {
    configurable: true,
    get: () => folders,
  });
  return () => {
    if (hadOwn && originalDesc) {
      Object.defineProperty(workspaceObj, 'workspaceFolders', originalDesc);
      return;
    }
    delete workspaceObj.workspaceFolders;
  };
}

/**
 * vscode.window.activeTextEditor をスタブ化する。
 * 返却される関数を呼び出すと元の状態に復元される。
 */
export function stubActiveTextEditor(editor: vscode.TextEditor | undefined): () => void {
  const windowObj = vscode.window as unknown as { activeTextEditor?: vscode.TextEditor };
  const hadOwn = Object.prototype.hasOwnProperty.call(windowObj, 'activeTextEditor');
  const originalDesc = Object.getOwnPropertyDescriptor(windowObj, 'activeTextEditor');
  Object.defineProperty(windowObj, 'activeTextEditor', {
    configurable: true,
    get: () => editor,
  });
  return () => {
    if (hadOwn && originalDesc) {
      Object.defineProperty(windowObj, 'activeTextEditor', originalDesc);
      return;
    }
    delete windowObj.activeTextEditor;
  };
}

/**
 * モジュールの関数をスタブ化する。
 * 返却される関数を呼び出すと元の状態に復元される。
 *
 * @param moduleObj モジュールオブジェクト（例: `import * as myModule from './myModule'`）
 * @param functionName スタブ化する関数名
 * @param stubFn スタブ関数
 */
export function stubModuleFunction<T, K extends keyof T>(
  moduleObj: T,
  functionName: K,
  stubFn: T[K],
): () => void {
  const original = moduleObj[functionName];
  (moduleObj as Record<string, unknown>)[functionName as string] = stubFn;
  return () => {
    (moduleObj as Record<string, unknown>)[functionName as string] = original;
  };
}

/**
 * vscode.window.showWarningMessage をスタブ化する。
 * 返却される関数を呼び出すと元の状態に復元される。
 *
 * @param onCall 呼び出し時に実行されるコールバック（メッセージを受け取る）
 */
export function stubShowWarningMessage(
  onCall?: (message: string) => void,
): () => void {
  const original = vscode.window.showWarningMessage;
  (vscode.window as unknown as { showWarningMessage: typeof vscode.window.showWarningMessage }).showWarningMessage =
    async (message: string): Promise<string | undefined> => {
      if (onCall) {
        onCall(message);
      }
      return undefined;
    };
  return () => {
    (vscode.window as unknown as { showWarningMessage: typeof original }).showWarningMessage = original;
  };
}

/**
 * vscode.window.showInformationMessage をスタブ化する。
 * 返却される関数を呼び出すと元の状態に復元される。
 *
 * @param onCall 呼び出し時に実行されるコールバック（メッセージを受け取る）
 */
export function stubShowInformationMessage(
  onCall?: (message: string) => void,
): () => void {
  const original = vscode.window.showInformationMessage;
  (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage =
    async (message: string): Promise<string | undefined> => {
      if (onCall) {
        onCall(message);
      }
      return undefined;
    };
  return () => {
    (vscode.window as unknown as { showInformationMessage: typeof original }).showInformationMessage = original;
  };
}

/**
 * vscode.window.showQuickPick をスタブ化する。
 * 返却される関数を呼び出すと元の状態に復元される。
 *
 * @param returnValue 返却する値（undefined でキャンセル扱い）
 */
export function stubShowQuickPick<T extends vscode.QuickPickItem>(
  returnValue: T | undefined,
): () => void {
  const original = vscode.window.showQuickPick;
  // オーバーロードされた関数をスタブ化するため unknown を経由してキャスト
  (vscode.window as unknown as Record<string, unknown>).showQuickPick =
    async (): Promise<T | undefined> => {
      return returnValue;
    };
  return () => {
    (vscode.window as unknown as Record<string, unknown>).showQuickPick = original;
  };
}

/**
 * vscode.window.withProgress をスタブ化する（タスクを即座に実行する）。
 * 返却される関数を呼び出すと元の状態に復元される。
 */
export function stubWithProgress(): () => void {
  const original = vscode.window.withProgress;
  // オーバーロードされた関数をスタブ化するため unknown を経由してキャスト
  // task には progress と token が渡されるため、それに対応するダミーオブジェクトを渡す
  (vscode.window as unknown as Record<string, unknown>).withProgress =
    async <T>(
      _options: vscode.ProgressOptions,
      task: (
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        token: vscode.CancellationToken,
      ) => Thenable<T>,
    ): Promise<T> => {
      const dummyProgress: vscode.Progress<{ message?: string; increment?: number }> = {
        report: () => { },
      };
      const dummyToken: vscode.CancellationToken = {
        isCancellationRequested: false,
        onCancellationRequested: new vscode.EventEmitter<void>().event,
      };
      return await task(dummyProgress, dummyToken);
    };
  return () => {
    (vscode.window as unknown as Record<string, unknown>).withProgress = original;
  };
}

/**
 * 複数の復元関数を一括で実行するヘルパー。
 *
 * 使用例:
 * ```typescript
 * const restoreAll = combineRestorers(
 *   stubWorkspaceFolders([...]),
 *   stubActiveTextEditor(undefined),
 *   stubShowWarningMessage((msg) => { ... }),
 * );
 * try {
 *   // テストコード
 * } finally {
 *   restoreAll();
 * }
 * ```
 */
export function combineRestorers(...restorers: Array<() => void>): () => void {
  return () => {
    for (const restore of restorers) {
      try {
        restore();
      } catch {
        // 個別の復元失敗は無視して続行
      }
    }
  };
}
