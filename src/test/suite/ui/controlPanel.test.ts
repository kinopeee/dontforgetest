import * as assert from 'assert';
import * as vscode from 'vscode';
import { TestGenControlPanelViewProvider } from '../../../ui/controlPanel';

// テスト用の型定義
interface MockWebviewView {
  webview: {
    options: Record<string, unknown>;
    html: string;
    onDidReceiveMessage: (cb: (msg: unknown) => void) => void;
    postMessage: (msg: unknown) => Promise<boolean>;
    cspSource: string;
    _onMessage?: (msg: unknown) => void;
  };
  visible: boolean;
  onDidDispose: () => void;
}

interface MockMessage {
  type: string;
  state?: unknown;
}

suite('src/ui/controlPanel.ts', () => {
  let context: vscode.ExtensionContext;
  let provider: TestGenControlPanelViewProvider;
  let webviewView: MockWebviewView;
  let receivedMessages: MockMessage[] = [];
  
  // スパイ用の変数
  let executedCommands: string[] = [];
  let openSettingsCalled = false;
  let setDefaultModelValue: string | undefined | null = 'INITIAL'; // nullとundefinedを区別するため初期値を入れる
  const panelState = { defaultModel: 'gpt-4', modelCandidates: ['gpt-4', 'claude-3'] };

  setup(() => {
    // リセット
    executedCommands = [];
    openSettingsCalled = false;
    setDefaultModelValue = 'INITIAL';
    receivedMessages = [];

    // Contextのモック
    context = {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/'),
    } as unknown as vscode.ExtensionContext;

    // Depsのモック
    const deps = {
      executeCommand: async (cmd: string) => { executedCommands.push(cmd); },
      openSettings: async () => { openSettingsCalled = true; },
      setDefaultModel: async (model: string | undefined) => { setDefaultModelValue = model; },
      getPanelState: () => panelState,
    };

    // WebviewViewのモック
    webviewView = {
      webview: {
        options: {},
        html: '',
        onDidReceiveMessage: (cb: (msg: unknown) => void) => {
          webviewView.webview._onMessage = cb;
        },
        postMessage: async (msg: unknown) => {
          receivedMessages.push(msg as MockMessage);
          return true;
        },
        cspSource: 'vscode-webview-resource:',
      },
      visible: true,
      onDidDispose: () => {},
    };

    provider = new TestGenControlPanelViewProvider(context, deps);
  });

  // ヘルパー関数: resolveWebviewViewを呼び出す
  function resolveView(): void {
    provider.resolveWebviewView(
      webviewView as unknown as vscode.WebviewView,
      {} as vscode.WebviewViewResolveContext,
      { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) } as vscode.CancellationToken
    );
  }

  // Given: WebviewViewが解決される
  // When: resolveWebviewViewを呼び出す
  // Then: HTMLが設定され、初期状態が送信される
  test('TC-CP-01: 初期化処理の確認', () => {
    resolveView();

    assert.ok(webviewView.webview.html.includes('<!DOCTYPE html>'), 'HTMLが設定されている');
    assert.strictEqual(receivedMessages.length, 1, '初期状態メッセージが送信されている');
    assert.strictEqual(receivedMessages[0].type, 'state');
    assert.deepStrictEqual(receivedMessages[0].state, panelState);
  });

  // Given: 初期化済み
  // When: readyメッセージを受信する
  // Then: 状態が再送信される
  test('TC-CP-02: readyメッセージ処理', async () => {
    resolveView();
    receivedMessages = []; // クリア

    await webviewView.webview._onMessage?.({ type: 'ready' });

    assert.strictEqual(receivedMessages.length, 1);
    assert.strictEqual(receivedMessages[0].type, 'state');
  });

  // Given: 初期化済み
  // When: runメッセージ (activeFile) を受信する
  // Then: generateTestFromFileコマンドが実行される
  test('TC-CP-03: runメッセージ (activeFile)', async () => {
    resolveView();
    
    await webviewView.webview._onMessage?.({ type: 'run', source: 'activeFile' });

    assert.strictEqual(executedCommands.length, 1);
    assert.strictEqual(executedCommands[0], 'testgen-agent.generateTestFromFile');
  });

  // Given: 初期化済み
  // When: runメッセージ (latestCommit) を受信する
  // Then: generateTestFromCommitコマンドが実行される
  test('TC-CP-04: runメッセージ (latestCommit)', async () => {
    resolveView();
    
    await webviewView.webview._onMessage?.({ type: 'run', source: 'latestCommit' });

    assert.strictEqual(executedCommands[0], 'testgen-agent.generateTestFromCommit');
  });

  // Given: 初期化済み
  // When: runCommandメッセージを受信する
  // Then: 指定されたコマンドが実行される
  test('TC-CP-05: runCommandメッセージ', async () => {
    resolveView();
    
    await webviewView.webview._onMessage?.({ type: 'runCommand', command: 'testgen-agent.generateTest' });

    assert.strictEqual(executedCommands[0], 'testgen-agent.generateTest');
  });

  // Given: 初期化済み
  // When: openSettingsを指定したrunCommandメッセージを受信する
  // Then: openSettings依存関数が呼ばれる
  test('TC-CP-06: runCommand (openSettings)', async () => {
    resolveView();
    
    await webviewView.webview._onMessage?.({ 
      type: 'runCommand', 
      command: 'workbench.action.openSettings' 
    });

    assert.strictEqual(openSettingsCalled, true, 'openSettingsが呼ばれるべき');
    assert.strictEqual(executedCommands.length, 0, 'executeCommandは呼ばれないべき');
  });

  // Given: 初期化済み
  // When: setDefaultModelメッセージを受信する
  // Then: モデルが設定され、状態が更新される
  test('TC-CP-07: setDefaultModelメッセージ', async () => {
    resolveView();
    receivedMessages = []; // クリア
    
    await webviewView.webview._onMessage?.({ type: 'setDefaultModel', model: 'claude-3' });

    assert.strictEqual(setDefaultModelValue, 'claude-3');
    assert.strictEqual(receivedMessages.length, 1, '状態更新が送信されるべき');
  });

  // Given: 初期化済み
  // When: setDefaultModelメッセージ (null) を受信する
  // Then: モデルがundefinedに設定される
  test('TC-CP-08: setDefaultModelメッセージ (null)', async () => {
    resolveView();
    
    await webviewView.webview._onMessage?.({ type: 'setDefaultModel', model: null });

    assert.strictEqual(setDefaultModelValue, undefined);
  });

  // Given: 初期化済み
  // When: setDefaultModelメッセージ (空文字) を受信する
  // Then: 無視される
  test('TC-CP-09: setDefaultModelメッセージ (空文字)', async () => {
    resolveView();
    
    await webviewView.webview._onMessage?.({ type: 'setDefaultModel', model: '   ' });

    assert.strictEqual(setDefaultModelValue, 'INITIAL', '変更されるべきではない');
  });

  // Given: 初期化済み
  // When: 不正なメッセージを受信する
  // Then: エラーにならず無視される
  test('TC-CP-10: 不正なメッセージ', async () => {
    resolveView();
    
    await webviewView.webview._onMessage?.(null);
    await webviewView.webview._onMessage?.({ type: 'unknown' });

    assert.strictEqual(executedCommands.length, 0);
  });
});
