import * as assert from 'assert';
import * as vscode from 'vscode';
import { SettingsPanelViewProvider } from '../../../ui/settingsPanel';

// Test type definitions
interface MockWebviewView {
  webview: {
    options: Record<string, unknown>;
    html: string;
    onDidReceiveMessage: (cb: (msg: unknown) => void) => void;
    postMessage: (msg: unknown) => Promise<boolean>;
    _onMessage?: (msg: unknown) => void;
  };
}

suite('src/ui/settingsPanel.ts', () => {
  let provider: SettingsPanelViewProvider;
  let webviewView: MockWebviewView;
  let postedMessages: unknown[] = [];

  setup(() => {
    postedMessages = [];

    webviewView = {
      webview: {
        options: {},
        html: '',
        onDidReceiveMessage: (cb: (msg: unknown) => void) => {
          webviewView.webview._onMessage = cb;
        },
        postMessage: async (msg: unknown) => {
          postedMessages.push(msg);
          return true;
        },
      },
    };

    provider = new SettingsPanelViewProvider();
  });

  teardown(() => {
    provider.dispose();
  });

  function resolveView(): void {
    provider.resolveWebviewView(
      webviewView as unknown as vscode.WebviewView,
      {} as vscode.WebviewViewResolveContext,
      { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) } as vscode.CancellationToken
    );
  }

  // TC-SP-N-01: HTML generation
  test('TC-SP-N-01: HTML generation contains expected options', () => {
    // Given: Provider is initialized
    // When: resolveWebviewView is called to generate HTML
    resolveView();
    const html = webviewView.webview.html;

    // Then: HTML contains expected provider options
    assert.ok(html.includes('value="cursorAgent"'), 'Contains cursorAgent');
    assert.ok(html.includes('value="claudeCode"'), 'Contains claudeCode');
    assert.ok(html.includes('value="geminiCli"'), 'Contains geminiCli');
    assert.ok(html.includes('value="codexCli"'), 'Contains codexCli');
  });

  // TC-SP-N-02: handle ready message
  test('TC-SP-N-02: handles ready message by sending configUpdate', async () => {
    // Given: Provider is resolved and view is ready
    resolveView();
    postedMessages = [];

    // When: "ready" message is received from the webview
    await webviewView.webview._onMessage?.({ type: 'ready' });

    // Then: "configUpdate" message is posted back to the webview
    assert.strictEqual(postedMessages.length, 1);
    const msg = postedMessages[0] as { type: string; agentProvider: string; modelCandidates: string[]; currentModel: string };
    assert.strictEqual(msg.type, 'configUpdate');
    assert.ok(msg.agentProvider);
    assert.ok(Array.isArray(msg.modelCandidates), 'modelCandidates should be an array');
    // defaultModel 未設定時は cursor-agent の実挙動（auto）に合わせて表示する
    if (msg.agentProvider === 'cursorAgent') {
      assert.ok(msg.modelCandidates.includes('auto'), 'cursorAgent candidates should include auto');
      assert.strictEqual(msg.currentModel, 'auto', 'cursorAgent currentModel should be auto when defaultModel is unset');
    }
  });

  // TC-SP-N-03: handle setAgentProvider message
  test('TC-SP-N-03: handles setAgentProvider message', async () => {
    // Given: Provider is resolved and view is ready
    resolveView();
    postedMessages = [];

    // When: "setAgentProvider" message is received with 'geminiCli'
    await webviewView.webview._onMessage?.({ type: 'setAgentProvider', agentProvider: 'geminiCli' });

    // Then: "configUpdate" message is posted back with the updated provider
    assert.ok(postedMessages.length >= 1);
    const lastMsg = postedMessages[postedMessages.length - 1] as { type: string; agentProvider: string };
    assert.strictEqual(lastMsg.agentProvider, 'geminiCli');
  });

  // SP-N-04: handle setAgentProvider message with codexCli
  test('SP-N-04: handles setAgentProvider message with codexCli', async () => {
    // Given: Provider is resolved and view is ready
    resolveView();
    postedMessages = [];

    // When: "setAgentProvider" message is received with 'codexCli'
    await webviewView.webview._onMessage?.({ type: 'setAgentProvider', agentProvider: 'codexCli' });

    // Then: "configUpdate" message is posted back with the updated provider
    assert.ok(postedMessages.length >= 1);
    const lastMsg = postedMessages[postedMessages.length - 1] as { type: string; agentProvider: string };
    assert.strictEqual(lastMsg.agentProvider, 'codexCli');
  });

  // TC-SP-E-01: handle invalid setAgentProvider message
  test('TC-SP-E-01: ignores invalid setAgentProvider message', async () => {
    // Given: Provider is resolved and view is ready
    resolveView();
    postedMessages = [];

    // When: "setAgentProvider" message is received with an 'invalid' provider ID
    await webviewView.webview._onMessage?.({ type: 'setAgentProvider', agentProvider: 'invalid' });

    // Then: No update messages are posted
    assert.strictEqual(postedMessages.length, 0);
  });
});
