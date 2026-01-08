import * as assert from 'assert';
import * as vscode from 'vscode';
import { SettingsPanelViewProvider } from '../../../ui/settingsPanel';
import * as configuredProvider from '../../../providers/configuredProvider';
import * as modelSettings from '../../../core/modelSettings';
import { combineRestorers, stubModuleFunction } from '../testUtils/stubHelpers';

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

  type ConfigUpdateScenario = {
    agentProvider: configuredProvider.AgentProviderId;
    settings: modelSettings.ModelSettings;
    modelCandidates: string[];
    effectiveModel: string | undefined;
  };

  function stubConfigUpdateScenario(scenario: ConfigUpdateScenario): () => void {
    return combineRestorers(
      stubModuleFunction(configuredProvider, 'getAgentProviderId', () => scenario.agentProvider),
      stubModuleFunction(modelSettings, 'getModelSettings', () => scenario.settings),
      stubModuleFunction(modelSettings, 'getModelCandidatesForProvider', () => scenario.modelCandidates),
      stubModuleFunction(modelSettings, 'getEffectiveDefaultModel', () => scenario.effectiveModel),
    );
  }

  async function sendReadyAndGetMessage(): Promise<{
    type: string;
    agentProvider: string;
    modelCandidates: string[];
    currentModel: string;
  }> {
    await webviewView.webview._onMessage?.({ type: 'ready' });
    assert.strictEqual(postedMessages.length, 1);
    return postedMessages[0] as { type: string; agentProvider: string; modelCandidates: string[]; currentModel: string };
  }

  // TC-SP-HTML-01: HTML generation
  test('TC-SP-HTML-01: HTML generation contains expected options', () => {
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

  test('TC-SP-N-01: cursorAgent uses auto when defaultModel is undefined', async () => {
    // Case ID: TC-SP-N-01
    // Given: cursorAgent with undefined defaultModel and auto in candidates
    const restore = stubConfigUpdateScenario({
      agentProvider: 'cursorAgent',
      settings: { defaultModel: undefined, customModels: [] },
      modelCandidates: ['auto', 'sonnet-4.5'],
      effectiveModel: undefined,
    });
    try {
      resolveView();
      postedMessages = [];

      // When: "ready" message is received from the webview
      const msg = await sendReadyAndGetMessage();

      // Then: currentModel is auto
      assert.strictEqual(msg.type, 'configUpdate');
      assert.strictEqual(msg.agentProvider, 'cursorAgent');
      assert.ok(Array.isArray(msg.modelCandidates), 'modelCandidates should be an array');
      assert.strictEqual(msg.currentModel, 'auto');
    } finally {
      restore();
    }
  });

  test('TC-SP-N-02: cursorAgent prefers effective defaultModel when available', async () => {
    // Case ID: TC-SP-N-02
    // Given: cursorAgent with defaultModel in candidates and effectiveModel resolved
    const restore = stubConfigUpdateScenario({
      agentProvider: 'cursorAgent',
      settings: { defaultModel: 'gpt-5.2', customModels: [] },
      modelCandidates: ['auto', 'gpt-5.2'],
      effectiveModel: 'gpt-5.2',
    });
    try {
      resolveView();
      postedMessages = [];

      // When: "ready" message is received from the webview
      const msg = await sendReadyAndGetMessage();

      // Then: currentModel matches effectiveModel
      assert.strictEqual(msg.type, 'configUpdate');
      assert.strictEqual(msg.agentProvider, 'cursorAgent');
      assert.strictEqual(msg.currentModel, 'gpt-5.2');
    } finally {
      restore();
    }
  });

  test('TC-SP-N-03: cursorAgent with single auto candidate uses auto', async () => {
    // Case ID: TC-SP-N-03
    // Given: cursorAgent with one candidate (auto) and no effectiveModel
    const restore = stubConfigUpdateScenario({
      agentProvider: 'cursorAgent',
      settings: { defaultModel: undefined, customModels: [] },
      modelCandidates: ['auto'],
      effectiveModel: undefined,
    });
    try {
      resolveView();
      postedMessages = [];

      // When: "ready" message is received from the webview
      const msg = await sendReadyAndGetMessage();

      // Then: currentModel is auto
      assert.strictEqual(msg.type, 'configUpdate');
      assert.strictEqual(msg.currentModel, 'auto');
    } finally {
      restore();
    }
  });

  test('TC-SP-E-01: cursorAgent with no candidates uses empty string', async () => {
    // Case ID: TC-SP-E-01
    // Given: cursorAgent with zero candidates and no effectiveModel
    const restore = stubConfigUpdateScenario({
      agentProvider: 'cursorAgent',
      settings: { defaultModel: undefined, customModels: [] },
      modelCandidates: [],
      effectiveModel: undefined,
    });
    try {
      resolveView();
      postedMessages = [];

      // When: "ready" message is received from the webview
      const msg = await sendReadyAndGetMessage();

      // Then: currentModel is empty string
      assert.strictEqual(msg.type, 'configUpdate');
      assert.strictEqual(msg.currentModel, '');
    } finally {
      restore();
    }
  });

  test('TC-SP-E-02: cursorAgent treats null defaultModel as unset and uses auto', async () => {
    // Case ID: TC-SP-E-02
    // Given: cursorAgent with null defaultModel and auto in candidates
    const restore = stubConfigUpdateScenario({
      agentProvider: 'cursorAgent',
      settings: { defaultModel: null as unknown as string, customModels: [] },
      modelCandidates: ['auto', 'sonnet-4.5'],
      effectiveModel: undefined,
    });
    try {
      resolveView();
      postedMessages = [];

      // When: "ready" message is received from the webview
      const msg = await sendReadyAndGetMessage();

      // Then: currentModel is auto
      assert.strictEqual(msg.type, 'configUpdate');
      assert.strictEqual(msg.currentModel, 'auto');
    } finally {
      restore();
    }
  });

  test('TC-SP-E-03: cursorAgent honors empty string effectiveModel', async () => {
    // Case ID: TC-SP-E-03
    // Given: cursorAgent with empty string defaultModel and auto in candidates
    const restore = stubConfigUpdateScenario({
      agentProvider: 'cursorAgent',
      settings: { defaultModel: '', customModels: [] },
      modelCandidates: ['auto'],
      effectiveModel: '',
    });
    try {
      resolveView();
      postedMessages = [];

      // When: "ready" message is received from the webview
      const msg = await sendReadyAndGetMessage();

      // Then: currentModel is empty string
      assert.strictEqual(msg.type, 'configUpdate');
      assert.strictEqual(msg.currentModel, '');
    } finally {
      restore();
    }
  });

  test('TC-SP-E-04: cursorAgent honors whitespace effectiveModel', async () => {
    // Case ID: TC-SP-E-04
    // Given: cursorAgent with whitespace defaultModel and auto in candidates
    const restore = stubConfigUpdateScenario({
      agentProvider: 'cursorAgent',
      settings: { defaultModel: ' ', customModels: [] },
      modelCandidates: ['auto'],
      effectiveModel: ' ',
    });
    try {
      resolveView();
      postedMessages = [];

      // When: "ready" message is received from the webview
      const msg = await sendReadyAndGetMessage();

      // Then: currentModel is whitespace
      assert.strictEqual(msg.type, 'configUpdate');
      assert.strictEqual(msg.currentModel, ' ');
    } finally {
      restore();
    }
  });

  test('TC-SP-E-05: cursorAgent uses first candidate when auto is absent', async () => {
    // Case ID: TC-SP-E-05
    // Given: cursorAgent with multiple candidates and no auto
    const restore = stubConfigUpdateScenario({
      agentProvider: 'cursorAgent',
      settings: { defaultModel: undefined, customModels: [] },
      modelCandidates: ['sonnet-4.5', 'gpt-5.2'],
      effectiveModel: undefined,
    });
    try {
      resolveView();
      postedMessages = [];

      // When: "ready" message is received from the webview
      const msg = await sendReadyAndGetMessage();

      // Then: currentModel uses the first candidate
      assert.strictEqual(msg.type, 'configUpdate');
      assert.strictEqual(msg.currentModel, 'sonnet-4.5');
    } finally {
      restore();
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
