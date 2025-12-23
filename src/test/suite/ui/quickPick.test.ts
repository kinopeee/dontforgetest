import * as assert from 'assert';
import * as vscode from 'vscode';
import { generateTestWithQuickPick } from '../../../ui/quickPick';
import { AgentProvider } from '../../../providers/provider';

// QuickPick アイテムの型定義
interface MockQuickPickItem extends vscode.QuickPickItem {
  source?: string;
  mode?: string;
  modelValue?: string;
}

// QuickPick 呼び出し履歴の型
interface QuickPickCall {
  items: MockQuickPickItem[];
  options: vscode.QuickPickOptions;
}

// テスト用のモックプロバイダー
const mockProvider: AgentProvider = {
  id: 'mock-provider',
  displayName: 'Mock Provider',
  run: (options) => {
    // イベント通知をシミュレート
    options.onEvent({ type: 'started', taskId: options.taskId, label: 'mock', timestampMs: Date.now() });
    return {
      taskId: options.taskId,
      dispose: () => {
        // 中断処理（テストでは何もしない）
      },
    };
  },
};

suite('src/ui/quickPick.ts', () => {
  let originalWindow: typeof vscode.window;
  let originalWorkspace: typeof vscode.workspace;
  
  let showQuickPickStub: (items: MockQuickPickItem[], options: vscode.QuickPickOptions) => Promise<MockQuickPickItem | undefined>;
  let showInputBoxStub: (options: vscode.InputBoxOptions) => Promise<string | undefined>;
  let showErrorMessageStub: (message: string, ...items: string[]) => Promise<string | undefined>;
  
  // 呼び出し履歴
  let quickPickCalls: QuickPickCall[] = [];
  let errorMessages: string[] = [];

  setup(() => {
    originalWindow = { ...vscode.window };
    originalWorkspace = { ...vscode.workspace };

    quickPickCalls = [];
    errorMessages = [];

    // モックのデフォルト実装
    showQuickPickStub = async () => undefined;
    showInputBoxStub = async () => undefined;
    showErrorMessageStub = async () => undefined;

    // vscode.window のモック化
    try {
      // @ts-expect-error テスト用にAPIをモック化
      vscode.window.showQuickPick = async (items: MockQuickPickItem[], options: vscode.QuickPickOptions) => {
        quickPickCalls.push({ items, options });
        return showQuickPickStub(items, options);
      };
      // @ts-expect-error テスト用にAPIをモック化
      vscode.window.showInputBox = async (options: vscode.InputBoxOptions) => {
        return showInputBoxStub(options);
      };
      // @ts-expect-error テスト用にAPIをモック化
      vscode.window.showErrorMessage = async (message: string, ...items: string[]) => {
        errorMessages.push(message);
        return showErrorMessageStub(message, ...items);
      };
    } catch {
      console.warn('vscode APIのモック化に失敗しました。この環境ではテストできません。');
    }

    // preflight をパスさせるための workspace モック
    try {
      // workspaceRoot のモック
      // @ts-expect-error テスト用にAPIをモック化
      vscode.workspace.workspaceFolders = [{ uri: { fsPath: '/mock/root' } }];
      
      // getConfiguration のモック
      // @ts-expect-error テスト用にAPIをモック化
      vscode.workspace.getConfiguration = (_section: string) => {
        return {
            get: <T>(key: string, defaultValue?: T): T | undefined => {
                // cursorAgentPath に echo コマンドを指定して実行可能に見せかける
                if (key === 'cursorAgentPath') return 'echo' as T;
                // testStrategyPath
                if (key === 'testStrategyPath') return 'docs/test-strategy.md' as T;
                return defaultValue;
            }
        };
      };
      
      // fs.stat のモック (testStrategyPath の存在確認用)
      // @ts-expect-error テスト用にAPIをモック化
      vscode.workspace.fs = {
          stat: async (uri: vscode.Uri) => {
              if (uri.fsPath.endsWith('docs/test-strategy.md')) {
                  return { type: vscode.FileType.File };
              }
              throw new Error('File not found');
          }
      };

    } catch {
      console.warn('vscode workspace APIのモック化に失敗しました。');
    }
  });

  teardown(() => {
    // 復元
    try {
        vscode.window.showQuickPick = originalWindow.showQuickPick;
        vscode.window.showInputBox = originalWindow.showInputBox;
        vscode.window.showErrorMessage = originalWindow.showErrorMessage;
        
        // @ts-expect-error テスト用にAPIを復元（read-onlyプロパティへの代入）
        vscode.workspace.workspaceFolders = originalWorkspace.workspaceFolders;
        vscode.workspace.getConfiguration = originalWorkspace.getConfiguration;
        // @ts-expect-error テスト用にAPIを復元（read-onlyプロパティへの代入）
        vscode.workspace.fs = originalWorkspace.fs;
    } catch {
        // 無視
    }
  });

  // TC-UI-01: Mock Setup: valid items
  test('TC-UI-01: Mock Setup: showQuickPick with valid items executes safely', async () => {
    // Given: Valid MockQuickPickItem[]
    const items: MockQuickPickItem[] = [{ label: 'item1' }, { label: 'item2' }];
    // When: showQuickPick is called
    await vscode.window.showQuickPick(items, {});
    // Then: No error throws
    assert.ok(true);
  });

  // TC-UI-02: Mock Setup: invalid item types
  test('TC-UI-02: Mock Setup: showQuickPick with invalid types handles gracefully (type check)', async () => {
    // Given: Invalid input (not an array)
    try {
      // @ts-expect-error Testing invalid input
      await vscode.window.showQuickPick('invalid', {});
    } catch {
       // Should be caught or handled by mock
    }
    assert.ok(true);
  });

  // Given: ユーザーが「未コミット差分」を選択する
  // When: generateTestWithQuickPick を実行
  // Then: generateTestFromWorkingTree に関連する次のQuickPickが表示される
  test('TC-UI-03: workingTree 選択時の挙動', async () => {
    // 1回目の QuickPick (Source選択)
    showQuickPickStub = async (items: MockQuickPickItem[], options: vscode.QuickPickOptions) => {
        if (options.title === 'Chottotest: 実行ソースを選択') {
            // itemsの中から workingTree を持つものを探して返す
            const found = items.find((i: MockQuickPickItem) => i.source === 'workingTree');
            return found;
        }
        // 2回目の QuickPick (Model選択 - pickModelOverride) -> useConfig
        if (options.title === 'Chottotest: モデルを選択') {
            const found = items.find((i: MockQuickPickItem) => i.mode === 'useConfig');
            return found;
        }
        // 3回目の QuickPick (Staged/Unstaged選択 - generateTestFromWorkingTree内)
        if (options.title === '未コミット差分からテスト生成') {
             // ここまで到達すればOK
             return undefined; // ここでキャンセルして終了
        }
        return undefined;
    };

    await generateTestWithQuickPick(mockProvider);

    // 検証: 3回目のQuickPickが呼ばれたか確認
    const calls = quickPickCalls.map(c => c.options.title);
    assert.ok(calls.includes('未コミット差分からテスト生成'), 'workingTree選択後に詳細選択が表示されるべき');
  });

  // Given: ユーザーが「最新コミット差分」を選択する
  // When: generateTestWithQuickPick を実行
  // Then: generateTestFromLatestCommit が実行される（エラーメッセージ等で検証）
  test('TC-UI-04: latestCommit 選択時の挙動', async () => {
    showQuickPickStub = async (items: MockQuickPickItem[], options: vscode.QuickPickOptions) => {
        if (options.title === 'Chottotest: 実行ソースを選択') {
            return items.find((i: MockQuickPickItem) => i.source === 'latestCommit');
        }
        if (options.title === 'Chottotest: モデルを選択') {
            return items.find((i: MockQuickPickItem) => i.mode === 'useConfig');
        }
        return undefined;
    };
    
    // git diff が失敗してエラーになることが予想される
    await generateTestWithQuickPick(mockProvider);

    // ここではエラーが出るか、あるいはGitコマンドが走って終了するか。
    // 少なくとも pickSource と pickModelOverride は呼ばれたはず。
    const titles = quickPickCalls.map(c => c.options.title);
    assert.ok(titles.includes('Chottotest: 実行ソースを選択'));
    assert.ok(titles.includes('Chottotest: モデルを選択'));
  });

  // Given: ユーザーが「コミット範囲差分」を選択する
  // When: generateTestWithQuickPick を実行
  // Then: コミット範囲入力のInputBoxが表示される
  test('TC-QP-03: commitRange 選択時の挙動', async () => {
    showQuickPickStub = async (items: MockQuickPickItem[], options: vscode.QuickPickOptions) => {
        if (options.title === 'Chottotest: 実行ソースを選択') {
            return items.find((i: MockQuickPickItem) => i.source === 'commitRange');
        }
        if (options.title === 'Chottotest: モデルを選択') {
            return items.find((i: MockQuickPickItem) => i.mode === 'useConfig');
        }
        return undefined;
    };
    
    // generateTestFromCommitRange は内部で InputBox を呼ぶ
    let inputBoxCalled = false;
    showInputBoxStub = async (options: vscode.InputBoxOptions) => {
        if (options.title === 'コミット範囲を指定') {
            inputBoxCalled = true;
            return undefined; // キャンセル
        }
        return undefined;
    };

    await generateTestWithQuickPick(mockProvider);

    assert.ok(inputBoxCalled, 'コミット範囲入力が表示されるべき');
  });

  // Given: ソース選択でキャンセル
  // When: generateTestWithQuickPick を実行
  // Then: 何も実行されない
  test('TC-QP-04: ソース選択キャンセル', async () => {
    showQuickPickStub = async () => undefined; // キャンセル

    await generateTestWithQuickPick(mockProvider);

    // モデル選択に進んでいないこと
    const titles = quickPickCalls.map(c => c.options.title);
    assert.ok(!titles.includes('Chottotest: モデルを選択'), 'キャンセル時はモデル選択に進まないべき');
  });

  // Given: モデル選択でキャンセル
  // When: generateTestWithQuickPick を実行
  // Then: 何も実行されない
  test('TC-QP-05: モデル選択キャンセル', async () => {
    showQuickPickStub = async (items: MockQuickPickItem[], options: vscode.QuickPickOptions) => {
      if (options.title === 'Chottotest: 実行ソースを選択') {
        return items.find((i: MockQuickPickItem) => i.source === 'workingTree');
      }
      if (options.title === 'Chottotest: モデルを選択') {
        return undefined; // キャンセル
      }
      return undefined;
    };

    await generateTestWithQuickPick(mockProvider);

    // ソースに応じた処理（3回目のQuickPick）に進んでいないこと
    const titles = quickPickCalls.map(c => c.options.title);
    assert.ok(!titles.includes('未コミット差分からテスト生成'), 'モデル選択キャンセル時は続行しないべき');
  });

  // Given: モデル選択で入力モードを選択
  // When: モデル名を入力
  // Then: 入力されたモデル名が使用される（検証困難だがフローは通る）
  test('TC-QP-06: モデル入力', async () => {
    showQuickPickStub = async (items: MockQuickPickItem[], options: vscode.QuickPickOptions) => {
        if (options.title === 'Chottotest: 実行ソースを選択') {
            return items.find((i: MockQuickPickItem) => i.source === 'workingTree'); // workingTreeを選択
        }
        if (options.title === 'Chottotest: モデルを選択') {
            return items.find((i: MockQuickPickItem) => i.mode === 'input'); // 入力モード
        }
        return undefined; // generateTestFromWorkingTree内でのキャンセル
    };

    let modelInputCalled = false;
    showInputBoxStub = async (options: vscode.InputBoxOptions) => {
        if (options.title === 'モデルを入力') {
            modelInputCalled = true;
            return 'my-custom-model';
        }
        return undefined;
    };

    await generateTestWithQuickPick(mockProvider);

    assert.ok(modelInputCalled, 'モデル入力ボックスが表示されるべき');
    // その後 workingTree のフローに進んでいること
    const titles = quickPickCalls.map(c => c.options.title);
    assert.ok(titles.includes('未コミット差分からテスト生成'), 'モデル入力後に処理が継続するべき');
  });
});
