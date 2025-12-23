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

suite('src/ui/controlPanel.ts', () => {
  let context: vscode.ExtensionContext;
  let provider: TestGenControlPanelViewProvider;
  let webviewView: MockWebviewView;
  
  // スパイ用の変数
  let executedCommands: string[] = [];

  setup(() => {
    // リセット
    executedCommands = [];

    // Contextのモック
    context = {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/'),
    } as unknown as vscode.ExtensionContext;

    // Depsのモック
    const deps = {
      executeCommand: async (cmd: string) => { executedCommands.push(cmd); },
    };

    // WebviewViewのモック
    webviewView = {
      webview: {
        options: {},
        html: '',
        onDidReceiveMessage: (cb: (msg: unknown) => void) => {
          webviewView.webview._onMessage = cb;
        },
        postMessage: async () => true,
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
  // Then: HTMLが設定される
  test('TC-CP-01: 初期化処理の確認', () => {
    resolveView();

    assert.ok(webviewView.webview.html.includes('<!DOCTYPE html>'), 'HTMLが設定されている');
  });

  // Given: 初期化済み
  // When: readyメッセージを受信する
  // Then: エラーなく処理される
  test('TC-CP-02: readyメッセージ処理', async () => {
    resolveView();

    // 状態は送信されないが、エラーにならないことを確認
    await webviewView.webview._onMessage?.({ type: 'ready' });

    // 何も実行されない
    assert.strictEqual(executedCommands.length, 0);
  });

  // Given: 初期化済み
  // When: runメッセージ (workingTree) を受信する
  // Then: generateTestFromWorkingTreeコマンドが実行される
  test('TC-CP-03: runメッセージ (workingTree)', async () => {
    resolveView();
    
    await webviewView.webview._onMessage?.({ type: 'run', source: 'workingTree' });

    assert.strictEqual(executedCommands.length, 1);
    assert.strictEqual(executedCommands[0], 'testgen-agent.generateTestFromWorkingTree');
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
  // When: 不正なメッセージを受信する
  // Then: エラーにならず無視される
  test('TC-CP-06: 不正なメッセージ', async () => {
    resolveView();
    
    await webviewView.webview._onMessage?.(null);
    await webviewView.webview._onMessage?.({ type: 'unknown' });

    assert.strictEqual(executedCommands.length, 0);
  });
});
