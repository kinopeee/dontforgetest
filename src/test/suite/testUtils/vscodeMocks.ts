import * as path from 'path';
import * as vscode from 'vscode';

/**
 * テスト用の簡易Memento実装（メモリ上のみ）。
 * VS Code APIの `Memento` を満たしつつ、必要十分な動作だけ提供する。
 */
class InMemoryMemento implements vscode.Memento {
  private readonly store = new Map<string, unknown>();

  keys(): readonly string[] {
    return [...this.store.keys()];
  }

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    if (this.store.has(key)) {
      return this.store.get(key) as T;
    }
    return defaultValue;
  }

  update(key: string, value: unknown): Thenable<void> {
    if (value === undefined) {
      this.store.delete(key);
      return Promise.resolve();
    }
    this.store.set(key, value);
    return Promise.resolve();
  }
}

/**
 * `ExtensionContext.globalState` 用のMemento実装。
 * `setKeysForSync` が必須になったため、追加している。
 */
class InMemoryGlobalState extends InMemoryMemento implements vscode.Memento {
  // 同期キー自体はテストでは使わないが、型要件を満たすため保持する
  private syncedKeys: readonly string[] = [];

  setKeysForSync(keys: readonly string[]): void {
    this.syncedKeys = keys;
  }

  // デバッグ用途（必要になったら参照できる）
  getSyncedKeys(): readonly string[] {
    return this.syncedKeys;
  }
}

/**
 * テスト用の簡易EnvironmentVariableCollection実装（メモリ上のみ）。
 * 実装は最小限だが、VS Code APIのインターフェースを満たす。
 */
class InMemoryEnvironmentVariableCollection implements vscode.EnvironmentVariableCollection {
  persistent = true;
  description: string | vscode.MarkdownString | undefined = undefined;

  private readonly mutators = new Map<string, vscode.EnvironmentVariableMutator>();

  replace(variable: string, value: string, options?: vscode.EnvironmentVariableMutatorOptions): void {
    this.mutators.set(variable, {
      type: vscode.EnvironmentVariableMutatorType.Replace,
      value,
      options: options ?? { applyAtProcessCreation: true },
    });
  }

  append(variable: string, value: string, options?: vscode.EnvironmentVariableMutatorOptions): void {
    this.mutators.set(variable, {
      type: vscode.EnvironmentVariableMutatorType.Append,
      value,
      options: options ?? { applyAtProcessCreation: true },
    });
  }

  prepend(variable: string, value: string, options?: vscode.EnvironmentVariableMutatorOptions): void {
    this.mutators.set(variable, {
      type: vscode.EnvironmentVariableMutatorType.Prepend,
      value,
      options: options ?? { applyAtProcessCreation: true },
    });
  }

  get(variable: string): vscode.EnvironmentVariableMutator | undefined {
    return this.mutators.get(variable);
  }

  forEach(
    callback: (variable: string, mutator: vscode.EnvironmentVariableMutator, collection: vscode.EnvironmentVariableCollection) => unknown,
    thisArg?: unknown,
  ): void {
    for (const [variable, mutator] of this.mutators) {
      callback.call(thisArg, variable, mutator, this);
    }
  }

  delete(variable: string): void {
    this.mutators.delete(variable);
  }

  clear(): void {
    this.mutators.clear();
  }

  [Symbol.iterator](): Iterator<[variable: string, mutator: vscode.EnvironmentVariableMutator]> {
    return this.mutators[Symbol.iterator]();
  }
}

/**
 * `ExtensionContext.environmentVariableCollection` 用の簡易実装。
 * `getScoped` が必須になったため、スコープ毎に独立したコレクションを返す。
 */
class InMemoryGlobalEnvironmentVariableCollection
  extends InMemoryEnvironmentVariableCollection
  implements vscode.GlobalEnvironmentVariableCollection
{
  private readonly scopedCollections = new Map<string, InMemoryEnvironmentVariableCollection>();

  getScoped(scope: vscode.EnvironmentVariableScope): vscode.EnvironmentVariableCollection {
    const key = scope.workspaceFolder?.uri.toString() ?? '__all__';
    const existing = this.scopedCollections.get(key);
    if (existing) {
      return existing;
    }
    const created = new InMemoryEnvironmentVariableCollection();
    this.scopedCollections.set(key, created);
    return created;
  }
}

function createNoopEvent<T>(): vscode.Event<T> {
  return () => ({ dispose: () => {} });
}

function createNoopSecretStorage(): vscode.SecretStorage {
  const secrets = new Map<string, string>();
  return {
    onDidChange: createNoopEvent<vscode.SecretStorageChangeEvent>(),
    keys: async () => [...secrets.keys()],
    get: async (key: string) => secrets.get(key),
    store: async (key: string, value: string) => {
      secrets.set(key, value);
    },
    delete: async (key: string) => {
      secrets.delete(key);
    },
  };
}

function createNoopLanguageModelAccessInformation(): vscode.LanguageModelAccessInformation {
  return {
    onDidChange: createNoopEvent<void>(),
    canSendRequest: (_chat: vscode.LanguageModelChat) => false,
  };
}

export type MockExtensionContextOptions = Readonly<{
  workspaceRoot?: string;
  extensionPath?: string;
}>;

/**
 * VS Code APIの `ExtensionContext` を満たすテスト用モックを生成する。
 *
 * - `@types/vscode` の更新で追加された必須プロパティ（globalState.setKeysForSync / environmentVariableCollection.getScoped / logUri/logPath等）を含む
 * - 実装は最小限（テストで必要な範囲のみ）で、外部I/Oは行わない
 */
export function createMockExtensionContext(options?: MockExtensionContextOptions): vscode.ExtensionContext {
  const workspaceRoot = options?.workspaceRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  const extensionPath = options?.extensionPath ?? workspaceRoot;
  const extensionUri = vscode.Uri.file(extensionPath);

  const globalStoragePath = path.join(workspaceRoot, 'out', 'test-global-storage');
  const globalStorageUri = vscode.Uri.file(globalStoragePath);

  const logPath = path.join(workspaceRoot, 'out', 'test-logs');
  const logUri = vscode.Uri.file(logPath);

  const extensionExports: unknown = {};
  const extension: vscode.Extension<unknown> = {
    id: 'kinopeee.dontforgetest.test',
    extensionUri,
    extensionPath,
    isActive: false,
    packageJSON: {},
    extensionKind: vscode.ExtensionKind.UI,
    exports: extensionExports,
    activate: async () => extensionExports,
  };

  const globalState = new InMemoryGlobalState();

  return {
    subscriptions: [],
    workspaceState: new InMemoryMemento(),
    globalState: Object.assign(globalState, { setKeysForSync: globalState.setKeysForSync.bind(globalState) }),
    secrets: createNoopSecretStorage(),
    extensionUri,
    extensionPath,
    environmentVariableCollection: new InMemoryGlobalEnvironmentVariableCollection(),
    asAbsolutePath: (relativePath: string) => path.join(extensionPath, relativePath),
    storageUri: undefined,
    storagePath: undefined,
    globalStorageUri,
    globalStoragePath,
    logUri,
    logPath,
    extensionMode: vscode.ExtensionMode.Test,
    extension,
    languageModelAccessInformation: createNoopLanguageModelAccessInformation(),
  };
}

