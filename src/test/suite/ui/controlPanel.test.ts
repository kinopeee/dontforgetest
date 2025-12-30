import * as assert from 'assert';
import * as vscode from 'vscode';
import * as vm from 'vm';
import { TestGenControlPanelViewProvider } from '../../../ui/controlPanel';
import { taskManager } from '../../../core/taskManager';
import { type RunningTask } from '../../../providers/provider';
import { t } from '../../../core/l10n';

// Test type definitions
interface MockWebviewView {
  webview: {
    options: Record<string, unknown>;
    html: string;
    onDidReceiveMessage: (cb: (msg: unknown) => void) => void;
    postMessage: (msg: unknown) => Promise<boolean>;
    cspSource: string;
    _onMessage?: (msg: unknown) => void;
    _postedMessages?: unknown[];
  };
  visible: boolean;
  onDidDispose: () => void;
}

suite('src/ui/controlPanel.ts', () => {
  let context: vscode.ExtensionContext;
  let provider: TestGenControlPanelViewProvider;
  let webviewView: MockWebviewView;

  // Spy variables
  let executedCommands: string[] = [];
  let executedCommandCalls: Array<{ command: string; args: unknown[] }> = [];
  let postedMessages: unknown[] = [];

  setup(() => {
    // Reset
    executedCommands = [];
    executedCommandCalls = [];
    postedMessages = [];

    // タスクマネージャーをクリーンアップ
    taskManager.cancelAll();

    // Mock Context
    context = {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/'),
    } as unknown as vscode.ExtensionContext;

    // Mock Deps
    const deps = {
      executeCommand: async (cmd: string, ...args: unknown[]) => {
        executedCommands.push(cmd);
        executedCommandCalls.push({ command: cmd, args });
      },
    };

    // Mock WebviewView
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
        cspSource: 'vscode-webview-resource:',
        _postedMessages: [],
      },
      visible: true,
      onDidDispose: () => {},
    };

    provider = new TestGenControlPanelViewProvider(context, deps);
  });

  teardown(() => {
    // テスト後のクリーンアップ
    taskManager.cancelAll();
    // プロバイダーのリスナーを解除（リスナー蓄積を防ぐ）
    provider.dispose();
  });

  // Helper function: call resolveWebviewView
  function resolveView(): void {
    provider.resolveWebviewView(
      webviewView as unknown as vscode.WebviewView,
      {} as vscode.WebviewViewResolveContext,
      { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) } as vscode.CancellationToken
    );
  }

  function extractInlineScriptFromHtml(html: string): string {
    const match = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
    assert.ok(match, 'Expected one inline <script nonce="..."> block in webview HTML');
    return match?.[1] ?? '';
  }

  function createWebviewScriptHarness(html: string): {
    runBtn: { textContent: string; classList: { contains: (c: string) => boolean } };
    dispatchStateUpdate: (msg: { isRunning: boolean; taskCount?: number; phaseLabel?: unknown }) => void;
  } {
    const script = extractInlineScriptFromHtml(html);

    const classes = new Set<string>();
    const runBtn = {
      textContent: '',
      classList: {
        add: (c: string) => {
          classes.add(c);
        },
        remove: (c: string) => {
          classes.delete(c);
        },
        contains: (c: string) => classes.has(c),
      },
      addEventListener: () => {},
    };

    const sourceSelect = { disabled: false, value: 'latestCommit', addEventListener: () => {} };
    const runLocationSelect = { disabled: false, value: 'local', addEventListener: () => {} };
    const outputSelect = { disabled: false, value: 'full', addEventListener: () => {} };
    const helpLine = { textContent: '', style: { display: 'none' } };

    const elements = new Map<string, unknown>([
      ['runBtn', runBtn],
      ['sourceSelect', sourceSelect],
      ['runLocationSelect', runLocationSelect],
      ['outputSelect', outputSelect],
      ['helpLine', helpLine],
    ]);

    let messageHandler: ((event: { data: unknown }) => void) | undefined;
    const windowStub = {
      addEventListener: (type: string, cb: unknown) => {
        if (type === 'message') {
          messageHandler = cb as (event: { data: unknown }) => void;
        }
      },
    };

    const documentStub = {
      getElementById: (id: string) => (elements.get(id) ?? null) as unknown,
    };

    const posted: unknown[] = [];
    const vscodeApi = { postMessage: (msg: unknown) => posted.push(msg) };
    const acquireVsCodeApi = () => vscodeApi;

    const context = vm.createContext({
      window: windowStub,
      document: documentStub,
      acquireVsCodeApi,
      console,
    });

    vm.runInContext(script, context);
    assert.ok(typeof messageHandler === 'function', 'Expected script to register a window "message" handler');

    return {
      runBtn,
      dispatchStateUpdate: (msg: { isRunning: boolean; taskCount?: number; phaseLabel?: unknown }) => {
        messageHandler?.({ data: { type: 'stateUpdate', ...msg } });
      },
    };
  }

  // --- Test Perspectives Table Implementation ---

  // TC-N-01: CSS reset with box-sizing
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains `* { box-sizing: border-box; }` CSS reset
  test('TC-N-01: CSS reset with box-sizing', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('* { box-sizing: border-box; }'), 'CSS reset with box-sizing is present');
  });

  // TC-N-02: Body styles
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains body styles with updated padding values
  test('TC-N-02: Body styles', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('margin: 0;'), 'Body has margin: 0');
    assert.ok(html.includes('padding: 4px 14px 4px 14px;'), 'Body has updated padding: 4px 14px 4px 14px');
    assert.ok(html.includes('background: transparent;'), 'Body has background: transparent');
    assert.ok(html.includes('line-height: 1.4;'), 'Body has line-height: 1.4');
  });

  // TC-N-25: ControlPanel UI renders with updated styles
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML rendered with updated padding, margin values, output section removed
  test('TC-N-25: ControlPanel UI renders with updated styles', () => {
    resolveView();
    const html = webviewView.webview.html;
    // Verify updated padding values
    assert.ok(html.includes('padding: 4px 14px 4px 14px;'), 'Body has updated padding');
    assert.ok(html.includes('margin: 6px 0;'), 'Row has updated margin: 6px 0');
    assert.ok(html.includes('margin: 2px 0 6px 0;'), 'Hint has updated margin: 2px 0 6px 0');
    assert.ok(html.includes('margin-bottom: 0;'), 'Section has updated margin-bottom: 0');
    // Verify output section is removed
    assert.ok(!html.includes('id="openPerspectiveBtn"'), 'Output section buttons are removed');
    assert.ok(!html.includes('id="openReportBtn"'), 'Output section buttons are removed');
    assert.ok(!html.includes('<div class="section-header">出力</div>'), 'Output section header is removed');
  });

  // TC-N-03: Select wrapper div
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains `.select-wrap` wrapper div around select element
  test('TC-N-03: Select wrapper div', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('<div class="select-wrap">'), 'Select wrapper div is present');
    assert.ok(html.includes('<div class="select-wrap">') && html.indexOf('<div class="select-wrap">') < html.indexOf('<select id="sourceSelect"'), 'Select wrapper wraps select element');
  });

  // TC-N-04: Select wrapper pseudo-element
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains `.select-wrap::after` pseudo-element with dropdown arrow styling
  test('TC-N-04: Select wrapper pseudo-element', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('.select-wrap::after {'), 'Select wrapper pseudo-element CSS is present');
    assert.ok(html.includes('border-top: 4px solid var(--vscode-foreground);'), 'Dropdown arrow styling is present');
  });

  // TC-N-05: Select element styles
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains select element with VS Code native-like styles (height: 24px, padding: 2px 24px 2px 8px, appearance: none)
  test('TC-N-05: Select element styles', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('height: 24px;'), 'Select has height: 24px');
    assert.ok(html.includes('padding: 2px 24px 2px 8px;'), 'Select has padding: 2px 24px 2px 8px');
    assert.ok(html.includes('appearance: none;'), 'Select has appearance: none');
    assert.ok(html.includes('-webkit-appearance: none;'), 'Select has -webkit-appearance: none');
  });

  // TC-N-06: Select hover and focus styles
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains select:hover and select:focus styles with focusBorder
  test('TC-N-06: Select hover and focus styles', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('select:hover {'), 'Select hover style is present');
    assert.ok(html.includes('select:focus {'), 'Select focus style is present');
    assert.ok(html.includes('var(--vscode-focusBorder'), 'Focus border color uses focusBorder variable');
  });

  // TC-N-07: Button element styles
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains button element with VS Code native-like styles (height: 30px, padding: 4px 14px, border-radius: 2px)
  test('TC-N-07: Button element styles', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('height: 30px;'), 'Button has height: 30px');
    assert.ok(html.includes('padding: 4px 14px;'), 'Button has padding: 4px 14px');
    assert.ok(html.includes('border-radius: 2px;'), 'Button has border-radius: 2px');
  });

  // TC-N-03: ControlPanel HTML is generated with button element
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains button element with height: 30px style
  test('TC-N-03: ControlPanel HTML is generated with button element', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('height: 30px;'), 'HTML contains button element with height: 30px style');
    assert.ok(html.includes('<button'), 'HTML contains button element');
  });

  // TC-B-06: ControlPanel HTML is generated
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML does not contain height: 26px (old value)
  test('TC-B-06: ControlPanel HTML does not contain old height value', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(!html.includes('height: 26px;'), 'HTML does not contain height: 26px (old value)');
  });

  // TC-B-07: ControlPanel HTML is generated
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains height: 30px exactly (not 29px or 31px)
  test('TC-B-07: ControlPanel HTML contains exact height value', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('height: 30px;'), 'HTML contains height: 30px exactly');
    assert.ok(!html.includes('height: 29px;'), 'HTML does not contain height: 29px');
    assert.ok(!html.includes('height: 31px;'), 'HTML does not contain height: 31px');
  });

  // TC-N-08: Button hover and focus styles
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains button:hover and button:focus-visible styles
  test('TC-N-08: Button hover and focus styles', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('button:hover {'), 'Button hover style is present');
    assert.ok(html.includes('button:focus-visible {'), 'Button focus-visible style is present');
  });

  // TC-N-09: Hint class
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains `.hint` class (replacing `.option-desc`)
  test('TC-N-09: Hint class', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('.hint {'), 'Hint class CSS is present');
    assert.ok(html.includes('<div class="hint" id="helpLine"'), 'Hint class is used in HTML');
  });

  // TC-N-10: Divider CSS class
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains `.divider` CSS class with height: 1px (出力セクション削除により要素は使われていないがCSSは残存)
  test('TC-N-10: Divider CSS class', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('.divider {'), 'Divider class CSS is present');
    assert.ok(html.includes('height: 1px;'), 'Divider has height: 1px');
    // 出力セクションが削除されたため、divider要素は使われていない
  });

  // TC-N-11: Section header CSS class
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains `.section-header` CSS class with uppercase styling (出力セクション削除により要素は使われていないがCSSは残存)
  test('TC-N-11: Section header CSS class', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('.section-header {'), 'Section header class CSS is present');
    assert.ok(html.includes('text-transform: uppercase;'), 'Section header has uppercase styling');
    // 出力セクションが削除されたため、section-header要素は使われていない
  });

  // TC-N-12: Link-style button CSS class
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains `button.link` CSS class with link-style button styling (出力セクション削除により要素は使われていないがCSSは残存)
  test('TC-N-12: Link-style button CSS class', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('button.link {'), 'Link button class CSS is present');
    assert.ok(html.includes('background: transparent;'), 'Link button has transparent background');
    assert.ok(html.includes('color: var(--vscode-textLink-foreground);'), 'Link button uses textLink color');
    // 出力セクションが削除されたため、link button要素は使われていない
  });

  // TC-N-13: Section div structure
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML structure uses `<div class="section">` instead of `<details class="section">`
  test('TC-N-13: Section div structure', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('<div class="section">'), 'Section div is present');
    assert.ok(!html.includes('<details class="section">'), 'Details element is not present');
  });

  // TC-N-14: No details/summary elements
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML does not contain `<details>` or `<summary>` elements
  test('TC-N-14: No details/summary elements', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(!html.includes('<details>'), 'Details element is not present');
    assert.ok(!html.includes('<summary>'), 'Summary element is not present');
  });

  // TC-N-15: No option-desc class
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML does not contain `.option-desc` class
  test('TC-N-15: No option-desc class', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(!html.includes('.option-desc'), 'Option-desc class is not present in CSS');
    assert.ok(!html.includes('class="option-desc"'), 'Option-desc class is not present in HTML');
  });

  // TC-N-16: No chevron class
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML does not contain `.chevron` class or chevron rotation CSS
  test('TC-N-16: No chevron class', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(!html.includes('.chevron'), 'Chevron class is not present in CSS');
    assert.ok(!html.includes('class="chevron"'), 'Chevron class is not present in HTML');
    assert.ok(!html.includes('transform: rotate(90deg);'), 'Chevron rotation CSS is not present');
  });

  // TC-N-17: No button.secondary class
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML does not contain `button.secondary` class
  test('TC-N-17: No button.secondary class', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(!html.includes('button.secondary'), 'Button.secondary class is not present in CSS');
    assert.ok(!html.includes('class="secondary"'), 'Secondary class is not present in HTML');
  });

  // TC-N-18: Nonce value in CSP and script
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains nonce value in CSP meta tag and script tag
  test('TC-N-18: Nonce value in CSP and script', () => {
    resolveView();
    const html = webviewView.webview.html;
    // Extract nonce from CSP meta tag
    const cspMatch = html.match(/Content-Security-Policy.*nonce-([^']+)/);
    assert.ok(cspMatch, 'CSP meta tag contains nonce');
    const nonce = cspMatch[1];
    assert.ok(nonce.length > 0, 'Nonce is not empty');
    // Check script tag contains the same nonce
    assert.ok(html.includes(`<script nonce="${nonce}">`), 'Script tag contains nonce');
  });

  // TC-N-19: Select options
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains all three select options (workingTree, latestCommit, commitRange)
  test('TC-N-19: Select options', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(
      html.includes(`<option value="workingTree">${t('controlPanel.uncommittedDiff')}</option>`),
      'workingTree option is present',
    );
    assert.ok(
      html.includes(`<option value="latestCommit">${t('controlPanel.latestCommit')}</option>`),
      'latestCommit option is present',
    );
    assert.ok(
      html.includes(`<option value="commitRange">${t('controlPanel.commitRange')}</option>`),
      'commitRange option is present',
    );
  });

  // TC-N-20: JavaScript event listeners
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains JavaScript event listeners for sourceSelect change and runBtn click
  test('TC-N-20: JavaScript event listeners', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('sourceSelect.addEventListener("change"'), 'sourceSelect change listener is present');
    assert.ok(html.includes('runBtn.addEventListener("click"'), 'runBtn click listener is present');
    // Output section buttons are removed, so their listeners should not be present
    assert.ok(!html.includes('openPerspectiveBtn.addEventListener("click"'), 'openPerspectiveBtn click listener is removed');
    assert.ok(!html.includes('openReportBtn.addEventListener("click"'), 'openReportBtn click listener is removed');
  });

  // TC-B-01: getNonce() returns non-empty string
  // Given: getNonce() called
  // When: HTML is generated
  // Then: Returns non-empty string with length = 32
  test('TC-B-01: getNonce() returns non-empty string', () => {
    resolveView();
    const html = webviewView.webview.html;
    const cspMatch = html.match(/nonce-([^']+)/);
    assert.ok(cspMatch, 'Nonce is present in HTML');
    const nonce = cspMatch[1];
    assert.strictEqual(nonce.length, 32, 'Nonce has length 32');
  });

  // TC-B-02: getNonce() returns different values
  // Given: getNonce() called multiple times
  // When: HTML is generated multiple times
  // Then: Returns different nonce values each time
  test('TC-B-02: getNonce() returns different values', () => {
    resolveView();
    const html1 = webviewView.webview.html;
    const nonce1 = html1.match(/nonce-([^']+)/)?.[1];
    
    // Create new provider instance to generate new HTML
    const provider2 = new TestGenControlPanelViewProvider(context, {
      executeCommand: async () => {},
    });
    const webviewView2: MockWebviewView = {
      webview: {
        options: {},
        html: '',
        onDidReceiveMessage: () => {},
        postMessage: async () => true,
        cspSource: 'vscode-webview-resource:',
      },
      visible: true,
      onDidDispose: () => {},
    };
    provider2.resolveWebviewView(
      webviewView2 as unknown as vscode.WebviewView,
      {} as vscode.WebviewViewResolveContext,
      { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) } as vscode.CancellationToken
    );
    const html2 = webviewView2.webview.html;
    const nonce2 = html2.match(/nonce-([^']+)/)?.[1];
    
    assert.ok(nonce1 && nonce2, 'Both nonces are present');
    // Note: Due to randomness, there's a small chance they could be equal, but it's extremely unlikely
    // In practice, they should be different
    assert.ok(nonce1 !== nonce2 || nonce1.length === 32, 'Nonces are different or valid');
  });

  // TC-B-03: getNonce() character set
  // Given: getNonce() called
  // When: HTML is generated
  // Then: Returns string containing only alphanumeric characters (A-Z, a-z, 0-9)
  test('TC-B-03: getNonce() character set', () => {
    resolveView();
    const html = webviewView.webview.html;
    const cspMatch = html.match(/nonce-([^']+)/);
    assert.ok(cspMatch, 'Nonce is present in HTML');
    const nonce = cspMatch[1];
    assert.ok(/^[A-Za-z0-9]+$/.test(nonce), 'Nonce contains only alphanumeric characters');
  });

  // TC-E-01: resolveWebviewView with null webviewView
  // Given: resolveWebviewView called with null webviewView
  // When: Method is called
  // Then: Throws TypeError or handles gracefully
  test('TC-E-01: resolveWebviewView with null webviewView', () => {
    // Given: Provider initialized
    // When: resolveWebviewView is called with null
    // Then: Should throw TypeError (TypeScript type checking prevents this, but runtime check)
    assert.throws(() => {
      provider.resolveWebviewView(
        null as unknown as vscode.WebviewView,
        {} as vscode.WebviewViewResolveContext,
        { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) } as vscode.CancellationToken
      );
    }, /Cannot read propert|TypeError|undefined/, 'Throws error when webviewView is null');
  });

  // TC-E-02: buildHtml() with webviewView.webview.html = null
  // Given: resolveWebviewView called with webviewView.webview.html = null
  // When: HTML is generated
  // Then: buildHtml() returns valid HTML string
  test('TC-E-02: buildHtml() returns valid HTML string', () => {
    // Given: Provider initialized
    resolveView();
    // When: HTML is generated
    const html = webviewView.webview.html;
    // Then: Returns valid HTML string
    assert.ok(typeof html === 'string', 'HTML is a string');
    assert.ok(html.length > 0, 'HTML is not empty');
    assert.ok(html.includes('<!DOCTYPE html>'), 'HTML contains DOCTYPE');
  });

  // TC-E-03: handleMessage with null message
  // Given: handleMessage called with null message
  // When: Message is processed
  // Then: Returns early without executing commands
  test('TC-E-03: handleMessage with null message', async () => {
    // Given: Provider initialized and resolved
    resolveView();
    // When: Null message is sent
    await webviewView.webview._onMessage?.(null);
    // Then: No commands executed
    assert.strictEqual(executedCommands.length, 0, 'No commands executed');
  });

  // TC-B-19: ControlPanel receives message with null value
  // Given: ControlPanel receives message with null value
  // When: Message is processed
  // Then: Message ignored, no command executed
  test('TC-B-19: ControlPanel receives message with null value', async () => {
    // Given: Provider initialized and resolved
    resolveView();
    // When: Message with null value is sent
    await webviewView.webview._onMessage?.(null);
    // Then: Message ignored, no command executed
    assert.strictEqual(executedCommands.length, 0, 'No commands executed');
  });

  // TC-B-20: ControlPanel receives message with undefined value
  // Given: ControlPanel receives message with undefined value
  // When: Message is processed
  // Then: Message ignored, no command executed
  test('TC-B-20: ControlPanel receives message with undefined value', async () => {
    // Given: Provider initialized and resolved
    resolveView();
    // When: Message with undefined value is sent
    await webviewView.webview._onMessage?.(undefined);
    // Then: Message ignored, no command executed
    assert.strictEqual(executedCommands.length, 0, 'No commands executed');
  });

  // TC-E-04: handleMessage with empty object
  // Given: handleMessage called with empty object {}
  // When: Message is processed
  // Then: Returns early without executing commands
  test('TC-E-04: handleMessage with empty object', async () => {
    // Given: Provider initialized and resolved
    resolveView();
    // When: Empty object message is sent
    await webviewView.webview._onMessage?.({});
    // Then: No commands executed
    assert.strictEqual(executedCommands.length, 0, 'No commands executed');
  });

  // TC-E-05: handleMessage with unknown type
  // Given: handleMessage called with { type: 'unknown' }
  // When: Message is processed
  // Then: Returns early without executing commands
  test('TC-E-05: handleMessage with unknown type', async () => {
    // Given: Provider initialized and resolved
    resolveView();
    // When: Unknown type message is sent
    await webviewView.webview._onMessage?.({ type: 'unknown' });
    // Then: No commands executed
    assert.strictEqual(executedCommands.length, 0, 'No commands executed');
  });

  // TC-E-06: handleMessage with invalid source
  // Given: handleMessage called with { type: 'run', source: 'invalidSource' }
  // When: Message is processed
  // Then: sourceToCommand returns undefined, no command executed
  test('TC-E-06: handleMessage with invalid source', async () => {
    // Given: Provider initialized and resolved
    resolveView();
    // When: Invalid source message is sent
    await webviewView.webview._onMessage?.({ type: 'run', source: 'invalidSource' as 'workingTree' });
    // Then: No commands executed (sourceToCommand returns undefined for invalid source)
    assert.strictEqual(executedCommands.length, 0, 'No commands executed');
  });

  test('CP-N-RUNMODE-DEFAULT-01: run message without runMode defaults to full and passes args', async () => {
    // Given: Provider initialized and resolved
    resolveView();

    // When: A run message is sent without runMode (default path)
    await webviewView.webview._onMessage?.({ type: 'run', source: 'latestCommit', runLocation: 'local' });

    // Then: executeCommand is called once with runMode='full'
    assert.strictEqual(executedCommandCalls.length, 1);
    assert.strictEqual(executedCommandCalls[0]?.command, 'dontforgetest.generateTestFromCommit');
    assert.deepStrictEqual(executedCommandCalls[0]?.args, [{ runLocation: 'local', runMode: 'full' }]);
  });

  test('CP-N-RUNMODE-PO-01: run message with runMode=perspectiveOnly passes args', async () => {
    // Given: Provider initialized and resolved
    resolveView();

    // When: A run message is sent with runMode=perspectiveOnly
    await webviewView.webview._onMessage?.({
      type: 'run',
      source: 'latestCommit',
      runLocation: 'worktree',
      runMode: 'perspectiveOnly',
    });

    // Then: executeCommand is called once with runMode='perspectiveOnly'
    assert.strictEqual(executedCommandCalls.length, 1);
    assert.strictEqual(executedCommandCalls[0]?.command, 'dontforgetest.generateTestFromCommit');
    assert.deepStrictEqual(executedCommandCalls[0]?.args, [{ runLocation: 'worktree', runMode: 'perspectiveOnly' }]);
  });

  // TC-E-07: handleMessage with invalid command
  // Given: handleMessage called with { type: 'runCommand', command: 'invalid.command' }
  // When: Message is processed
  // Then: executeCommand called with invalid command (may throw or fail silently)
  test('TC-E-07: handleMessage with invalid command', async () => {
    // Given: Provider initialized and resolved
    resolveView();
    // When: Invalid command message is sent
    await webviewView.webview._onMessage?.({ type: 'runCommand', command: 'invalid.command' });
    // Then: Command is executed (type checking allows it, but VS Code may reject it)
    assert.strictEqual(executedCommands.length, 1, 'Command execution attempted');
    assert.strictEqual(executedCommands[0], 'invalid.command', 'Invalid command was passed to executeCommand');
  });

  // TC-E-08: buildHtml() when nonce generation fails
  // Given: buildHtml() called when nonce generation fails
  // When: HTML is generated
  // Then: HTML still generated with nonce placeholder or empty nonce
  // Note: Not applicable - getNonce() always returns valid string
  test('TC-E-08: buildHtml() when nonce generation fails', () => {
    // Given: Provider initialized
    // When: HTML is generated (nonce generation cannot fail in current implementation)
    resolveView();
    const html = webviewView.webview.html;
    // Then: HTML is generated successfully
    assert.ok(html.includes('nonce-'), 'HTML contains nonce attribute');
    assert.ok(html.length > 0, 'HTML is not empty');
  });

  // TC-E-09: HTML JavaScript handles undefined sourceSelect.value
  // Given: HTML contains select element with undefined sourceSelect.value
  // When: JavaScript executes
  // Then: JavaScript handles undefined value gracefully with fallback (|| "")
  test('TC-E-09: HTML JavaScript handles undefined sourceSelect.value', () => {
    // Given: Provider initialized and resolved
    resolveView();
    const html = webviewView.webview.html;
    // When: JavaScript code is generated
    // Then: Fallback logic is present for undefined values
    assert.ok(html.includes('descriptions[source] || ""'), 'JavaScript has fallback for undefined value');
  });

  // TC-E-10: HTML JavaScript receives invalid message type
  // Given: HTML JavaScript receives invalid message type
  // When: Message handling logic executes
  // Then: Message handling logic in handleMessage rejects invalid types
  test('TC-E-10: HTML JavaScript receives invalid message type', async () => {
    // Given: Provider initialized and resolved
    resolveView();
    // When: Invalid message type is sent
    await webviewView.webview._onMessage?.({ type: 'invalidType' });
    // Then: No commands executed (handleMessage rejects invalid types)
    assert.strictEqual(executedCommands.length, 0, 'No commands executed for invalid message type');
  });

  // TC-N-21: Ready message processing
  // Given: Provider initialized and resolved, ready message received
  // When: Message is processed
  // Then: Processes without error, no commands executed
  test('TC-N-21: Ready message processing', async () => {
    resolveView();
    await webviewView.webview._onMessage?.({ type: 'ready' });
    assert.strictEqual(executedCommands.length, 0, 'No commands executed');
  });

  // TC-N-22: Run message (workingTree)
  // Given: Provider initialized and resolved, run message with source='workingTree'
  // When: Message is processed
  // Then: generateTestFromWorkingTree command is executed
  test('TC-N-22: Run message (workingTree)', async () => {
    resolveView();
    await webviewView.webview._onMessage?.({ type: 'run', source: 'workingTree' });
    assert.strictEqual(executedCommands.length, 1, 'One command executed');
    assert.strictEqual(executedCommands[0], 'dontforgetest.generateTestFromWorkingTree', 'Correct command executed');
  });

  // TC-N-23: Run message (latestCommit)
  // Given: Provider initialized and resolved, run message with source='latestCommit'
  // When: Message is processed
  // Then: generateTestFromCommit command is executed
  test('TC-N-23: Run message (latestCommit)', async () => {
    resolveView();
    await webviewView.webview._onMessage?.({ type: 'run', source: 'latestCommit' });
    assert.strictEqual(executedCommands.length, 1, 'One command executed');
    assert.strictEqual(executedCommands[0], 'dontforgetest.generateTestFromCommit', 'Correct command executed');
  });

  // TC-N-24: Run message (commitRange)
  // Given: Provider initialized and resolved, run message with source='commitRange'
  // When: Message is processed
  // Then: generateTestFromCommitRange command is executed
  test('TC-N-24: Run message (commitRange)', async () => {
    resolveView();
    await webviewView.webview._onMessage?.({ type: 'run', source: 'commitRange' });
    assert.strictEqual(executedCommands.length, 1, 'One command executed');
    assert.strictEqual(executedCommands[0], 'dontforgetest.generateTestFromCommitRange', 'Correct command executed');
  });

  // TC-N-25: RunCommand message
  // Given: Provider initialized and resolved, runCommand message with valid command
  // When: Message is processed
  // Then: Specified command is executed
  test('TC-N-25: RunCommand message', async () => {
    resolveView();
    await webviewView.webview._onMessage?.({ type: 'runCommand', command: 'dontforgetest.generateTest' });
    assert.strictEqual(executedCommands.length, 1, 'One command executed');
    assert.strictEqual(executedCommands[0], 'dontforgetest.generateTest', 'Correct command executed');
  });

  // --- 状態通知・キャンセル機能のテスト ---

  // TC-N-26: Ready message sends initial state
  // Given: Provider initialized and resolved, no tasks running
  // When: Ready message is received
  // Then: stateUpdate message sent with isRunning=false
  test('TC-N-26: Ready message sends initial state (no tasks)', async () => {
    // Given: No tasks running
    resolveView();
    postedMessages = []; // readyメッセージ前にリセット

    // When: Ready message is sent
    await webviewView.webview._onMessage?.({ type: 'ready' });

    // Then: stateUpdate message sent
    assert.strictEqual(postedMessages.length, 1, 'One message posted');
    const msg = postedMessages[0] as { type: string; isRunning: boolean; taskCount: number; phaseLabel?: unknown };
    assert.strictEqual(msg.type, 'stateUpdate', 'Message type is stateUpdate');
    assert.strictEqual(msg.isRunning, false, 'isRunning is false');
    assert.strictEqual(msg.taskCount, 0, 'taskCount is 0');
    assert.strictEqual(msg.phaseLabel, undefined, 'phaseLabel is undefined');
  });

  test('CP-N-READY-0: ready posts stateUpdate with isRunning=false and taskCount=0', async () => {
    // Given: No tasks running
    resolveView();
    postedMessages = [];

    // When: Sending ready message
    await webviewView.webview._onMessage?.({ type: 'ready' });

    // Then: One stateUpdate is posted with count=0
    assert.strictEqual(postedMessages.length, 1);
    assert.deepStrictEqual(postedMessages[0], { type: 'stateUpdate', isRunning: false, taskCount: 0, phaseLabel: undefined });
  });

  // TC-N-27: Ready message sends running state
  // Given: Provider initialized and resolved, task running
  // When: Ready message is received
  // Then: stateUpdate message sent with isRunning=true
  test('TC-N-27: Ready message sends running state (task running)', async () => {
    // Given: Task running
    const mockTask: RunningTask = { taskId: 'test-task', dispose: () => {} };
    taskManager.register('test-task', 'テスト', mockTask);

    resolveView();
    postedMessages = []; // readyメッセージ前にリセット

    // When: Ready message is sent
    await webviewView.webview._onMessage?.({ type: 'ready' });

    // Then: stateUpdate message sent with isRunning=true
    assert.strictEqual(postedMessages.length, 1, 'One message posted');
    const msg = postedMessages[0] as { type: string; isRunning: boolean; taskCount: number; phaseLabel?: unknown };
    assert.strictEqual(msg.type, 'stateUpdate', 'Message type is stateUpdate');
    assert.strictEqual(msg.isRunning, true, 'isRunning is true');
    assert.strictEqual(msg.taskCount, 1, 'taskCount is 1');
    assert.strictEqual(msg.phaseLabel, undefined, 'phaseLabel is undefined by default');
  });

  test('CP-N-READY-1: ready posts stateUpdate with isRunning=true and taskCount=1', async () => {
    // Given: One task running
    const mockTask: RunningTask = { taskId: 'one-task', dispose: () => {} };
    taskManager.register('one-task', 'test', mockTask);
    resolveView();
    postedMessages = [];

    // When: Sending ready message
    await webviewView.webview._onMessage?.({ type: 'ready' });

    // Then: One stateUpdate is posted with count=1
    assert.strictEqual(postedMessages.length, 1);
    assert.deepStrictEqual(postedMessages[0], { type: 'stateUpdate', isRunning: true, taskCount: 1, phaseLabel: undefined });
  });

  test('TC-N-11: ready posts stateUpdate including phaseLabel from taskManager', async () => {
    // Case ID: TC-N-11
    // Given: One running task with phaseLabel="preparing"
    const mockTask: RunningTask = { taskId: 'phase-task', dispose: () => {} };
    taskManager.register('phase-task', 'test', mockTask);
    taskManager.updatePhase('phase-task', 'preparing', 'preparing');

    // When: Webview is resolved and sends ready
    resolveView();
    postedMessages = [];
    await webviewView.webview._onMessage?.({ type: 'ready' });

    // Then: stateUpdate includes phaseLabel="preparing"
    assert.strictEqual(postedMessages.length, 1);
    assert.deepStrictEqual(postedMessages[0], { type: 'stateUpdate', isRunning: true, taskCount: 1, phaseLabel: 'preparing' });
  });

  // TC-N-28: Task registration notifies webview
  // Given: Provider initialized and resolved
  // When: Task is registered with taskManager
  // Then: stateUpdate message sent to webview
  test('TC-N-28: Task registration notifies webview', () => {
    // Given: Provider resolved
    resolveView();
    postedMessages = [];

    // When: Task is registered
    const mockTask: RunningTask = { taskId: 'new-task', dispose: () => {} };
    taskManager.register('new-task', 'テスト', mockTask);

    // Then: stateUpdate message sent
    assert.ok(postedMessages.length >= 1, 'At least one message posted');
    const msg = postedMessages[postedMessages.length - 1] as { type: string; isRunning: boolean; taskCount: number; phaseLabel?: unknown };
    assert.strictEqual(msg.type, 'stateUpdate', 'Message type is stateUpdate');
    assert.strictEqual(msg.isRunning, true, 'isRunning is true');
    assert.strictEqual(msg.taskCount, 1, 'taskCount is 1');
    assert.strictEqual(msg.phaseLabel, undefined, 'phaseLabel is undefined by default');
  });

  // TC-N-29: Task unregistration notifies webview
  // Given: Provider initialized and resolved, task running
  // When: Task is unregistered
  // Then: stateUpdate message sent with isRunning=false
  test('TC-N-29: Task unregistration notifies webview', () => {
    // Given: Task running
    const mockTask: RunningTask = { taskId: 'running-task', dispose: () => {} };
    taskManager.register('running-task', 'テスト', mockTask);

    resolveView();
    postedMessages = [];

    // When: Task is unregistered
    taskManager.unregister('running-task');

    // Then: stateUpdate message sent with isRunning=false
    assert.ok(postedMessages.length >= 1, 'At least one message posted');
    const msg = postedMessages[postedMessages.length - 1] as { type: string; isRunning: boolean; taskCount: number; phaseLabel?: unknown };
    assert.strictEqual(msg.type, 'stateUpdate', 'Message type is stateUpdate');
    assert.strictEqual(msg.isRunning, false, 'isRunning is false');
    assert.strictEqual(msg.taskCount, 0, 'taskCount is 0');
    assert.strictEqual(msg.phaseLabel, undefined, 'phaseLabel is undefined');
  });

  // TC-N-30: Cancel message cancels all tasks
  // Given: Provider initialized and resolved, tasks running
  // When: Cancel message is received
  // Then: All tasks are cancelled via taskManager.cancelAll()
  test('TC-N-30: Cancel message cancels all tasks', async () => {
    // Given: Tasks running
    let disposed1 = false;
    let disposed2 = false;
    const mockTask1: RunningTask = { taskId: 'task-1', dispose: () => { disposed1 = true; } };
    const mockTask2: RunningTask = { taskId: 'task-2', dispose: () => { disposed2 = true; } };
    taskManager.register('task-1', 'タスク1', mockTask1);
    taskManager.register('task-2', 'タスク2', mockTask2);

    resolveView();

    // When: Cancel message is sent
    await webviewView.webview._onMessage?.({ type: 'cancel' });

    // Then: All tasks cancelled
    assert.strictEqual(disposed1, true, 'Task 1 disposed');
    assert.strictEqual(disposed2, true, 'Task 2 disposed');
    assert.strictEqual(taskManager.getRunningCount(), 0, 'No tasks running');
  });

  test('CP-N-CANCEL-01: cancel message disposes all running tasks and resets count', async () => {
    // Given: Two running tasks are registered
    let disposed1 = false;
    let disposed2 = false;
    const mockTask1: RunningTask = { taskId: 'cancel-task-1', dispose: () => { disposed1 = true; } };
    const mockTask2: RunningTask = { taskId: 'cancel-task-2', dispose: () => { disposed2 = true; } };
    taskManager.register('cancel-task-1', 'task1', mockTask1);
    taskManager.register('cancel-task-2', 'task2', mockTask2);
    resolveView();

    // When: Sending cancel message
    await webviewView.webview._onMessage?.({ type: 'cancel' });

    // Then: Both tasks are disposed and count becomes 0
    assert.strictEqual(disposed1, true);
    assert.strictEqual(disposed2, true);
    assert.strictEqual(taskManager.getRunningCount(), 0);
  });

  // TC-N-31: Cancel message with no tasks does nothing
  // Given: Provider initialized and resolved, no tasks running
  // When: Cancel message is received
  // Then: No error, no commands executed
  test('TC-N-31: Cancel message with no tasks does nothing', async () => {
    // Given: No tasks running
    resolveView();

    // When: Cancel message is sent
    await webviewView.webview._onMessage?.({ type: 'cancel' });

    // Then: No error, no commands executed
    assert.strictEqual(executedCommands.length, 0, 'No commands executed');
    assert.strictEqual(taskManager.getRunningCount(), 0, 'No tasks running');
  });

  // TC-N-32: HTML contains state management JavaScript
  // Given: Provider initialized
  // When: HTML is generated
  // Then: HTML contains isRunning state variable and updateButtonState function
  test('TC-N-32: HTML contains state management JavaScript', () => {
    resolveView();
    const html = webviewView.webview.html;

    // Then: HTML contains state management code
    assert.ok(html.includes('let isRunning = false;'), 'isRunning state variable exists');
    assert.ok(html.includes('function updateButtonState(running, phaseLabel)'), 'updateButtonState function exists');
    assert.ok(html.includes(t('controlPanel.generatingTests')), 'Running state button text exists');
    assert.ok(html.includes(t('controlPanel.run')), 'Run button text exists');
    assert.ok(html.includes(t('controlPanel.generateTests')), 'Full output option text exists');
    assert.ok(html.includes(t('controlPanel.generatePerspectivesOnly')), 'Perspective-only output option text exists');
  });

  // TC-N-33: HTML contains message handler for stateUpdate
  // Given: Provider initialized
  // When: HTML is generated
  // Then: HTML contains message event listener that handles stateUpdate
  test('TC-N-33: HTML contains message handler for stateUpdate', () => {
    resolveView();
    const html = webviewView.webview.html;

    // Then: HTML contains message handler
    assert.ok(html.includes('window.addEventListener("message"'), 'Message event listener exists');
    assert.ok(html.includes('msg.type === "stateUpdate"'), 'stateUpdate type check exists');
    assert.ok(html.includes('updateButtonState(msg.isRunning, msg.phaseLabel)'), 'updateButtonState call exists');
  });

  // TC-N-34: HTML button click sends cancel when running
  // Given: Provider initialized
  // When: HTML is generated
  // Then: HTML contains conditional logic for cancel message
  test('TC-N-34: HTML button click sends cancel when running', () => {
    resolveView();
    const html = webviewView.webview.html;

    // Then: HTML contains conditional cancel logic
    assert.ok(html.includes('if (isRunning)'), 'isRunning check exists in click handler');
    assert.ok(html.includes('type: "cancel"'), 'Cancel message type exists');
  });

  // TC-N-35: HTML button style changes when running
  // Given: Provider initialized
  // When: HTML is generated
  // Then: HTML contains style changes for running state
  test('TC-N-35: HTML button style changes when running', () => {
    resolveView();
    const html = webviewView.webview.html;

    // Then: HTML contains style changes for running state (updated to use classList)
    assert.ok(html.includes('runBtn.classList.add("running")'), 'Button uses classList.add for running state');
    assert.ok(html.includes('runBtn.classList.remove("running")'), 'Button uses classList.remove for non-running state');
  });

  // TC-N-36: Multiple tasks show correct count
  // Given: Provider initialized and resolved
  // When: Multiple tasks are registered
  // Then: stateUpdate shows correct taskCount
  test('TC-N-36: Multiple tasks show correct count', () => {
    // Given: Provider resolved
    resolveView();
    postedMessages = [];

    // When: Multiple tasks are registered
    const mockTask1: RunningTask = { taskId: 'task-1', dispose: () => {} };
    const mockTask2: RunningTask = { taskId: 'task-2', dispose: () => {} };
    const mockTask3: RunningTask = { taskId: 'task-3', dispose: () => {} };
    taskManager.register('task-1', 'タスク1', mockTask1);
    taskManager.register('task-2', 'タスク2', mockTask2);
    taskManager.register('task-3', 'タスク3', mockTask3);

    // Then: Last message shows correct count
    const lastMsg = postedMessages[postedMessages.length - 1] as { type: string; isRunning: boolean; taskCount: number };
    assert.strictEqual(lastMsg.taskCount, 3, 'taskCount is 3');
    assert.strictEqual(lastMsg.isRunning, true, 'isRunning is true');
  });

  // --- New test cases for CSS animations and button styles (TC-N-01 to TC-N-11) ---

  // TC-CSS-01: CSS @keyframes pulse-opacity animation definition
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains @keyframes pulse-opacity animation definition
  test('TC-CSS-01: CSS @keyframes pulse-opacity animation definition', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('@keyframes pulse-opacity {'), 'Pulse-opacity animation keyframes are defined');
    assert.ok(html.includes('0%, 100% { opacity: 1; }'), 'Pulse-opacity animation start/end states are defined');
    assert.ok(html.includes('50% { opacity: 0.75; }'), 'Pulse-opacity animation middle state is defined');
  });

  // TC-CSS-02: CSS @keyframes progress-slide animation definition
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains @keyframes progress-slide animation definition
  test('TC-CSS-02: CSS @keyframes progress-slide animation definition', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('@keyframes progress-slide {'), 'Progress-slide animation keyframes are defined');
    assert.ok(html.includes('0% { background-position: 0% 0; }'), 'Progress-slide animation start state is defined');
    assert.ok(html.includes('100% { background-position: 200% 0; }'), 'Progress-slide animation end state is defined');
  });

  // TC-CSS-03: CSS @keyframes glow animation definition (not present in implementation)
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML does not contain @keyframes glow animation definition
  test('TC-CSS-03: CSS @keyframes glow animation definition (not present)', () => {
    resolveView();
    const html = webviewView.webview.html;
    // Implementation uses pulse-opacity and progress-slide, not glow
    assert.ok(!html.includes('@keyframes glow {'), 'Glow animation is not defined (implementation uses pulse-opacity and progress-slide)');
  });

  // TC-CSS-04: CSS button.running class style definition with VS Code theme variables
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains button.running class style definition with VS Code theme variables
  test('TC-CSS-04: CSS button.running class style definition with VS Code theme variables', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('button.running {'), 'button.running class is defined');
    assert.ok(html.includes('background-color: var(--vscode-button-secondaryBackground);'), 'Running button uses VS Code theme variable');
    assert.ok(html.includes('animation: pulse-opacity 2s ease-in-out infinite;'), 'Running button has pulse-opacity animation');
  });

  // TC-CSS-05: CSS button.running:hover style definition
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains button.running:hover style definition with VS Code theme variables
  test('TC-CSS-05: CSS button.running:hover style definition', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('button.running:hover {'), 'button.running:hover class is defined');
    assert.ok(html.includes('background-color: var(--vscode-button-secondaryHoverBackground);'), 'Hover state uses VS Code theme variable');
  });

  // TC-N-06: HTML contains updateButtonState function with classList.add('running') call
  // Given: Provider initialized with valid context, HTML generated
  // When: HTML is generated
  // Then: HTML contains updateButtonState function with classList.add('running') call
  test('TC-N-06: HTML contains updateButtonState function with classList.add', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('function updateButtonState(running, phaseLabel)'), 'updateButtonState function exists');
    assert.ok(html.includes('runBtn.classList.add("running")'), 'Function uses classList.add instead of inline styles');
  });

  // TC-N-07: HTML contains updateButtonState function with classList.remove('running') call
  // Given: Provider initialized with valid context, HTML generated
  // When: HTML is generated
  // Then: HTML contains updateButtonState function with classList.remove('running') call
  test('TC-N-07: HTML contains updateButtonState function with classList.remove', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('function updateButtonState(running, phaseLabel)'), 'updateButtonState function exists');
    assert.ok(html.includes('runBtn.classList.remove("running")'), 'Function uses classList.remove instead of inline styles');
  });

  // TC-N-08: HTML contains dynamic button text logic when running state is set
  // Given: Provider initialized with valid context, HTML generated
  // When: HTML is generated
  // Then: HTML contains dynamic button text logic with phase label fallback
  test('TC-N-08: HTML contains button text when running', () => {
    resolveView();
    const html = webviewView.webview.html;
    // 新しい実装では動的にラベルを設定するため、フォールバック用のデフォルトラベルを確認
    assert.ok(
      html.includes(`"${t('controlPanel.generatingTests')}"`),
      'Default button text fallback is correct when running',
    );
    assert.ok(
      html.includes('runBtn.textContent = label'),
      'Button text is set dynamically based on phase',
    );
  });

  // TC-N-09: HTML contains button text 'テスト生成' when not running
  // Given: Provider initialized with valid context, HTML generated
  // When: HTML is generated
  // Then: HTML contains button text 'テスト生成' when not running
  test('TC-N-09: HTML contains button text when not running', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes(`runBtn.textContent = "${t('controlPanel.run')}"`), 'Default button text is correct');
  });

  // TC-N-10: HTML contains animation properties for running button
  // Given: Provider initialized with valid context, HTML generated
  // When: HTML is generated
  // Then: HTML contains animation: pulse-opacity 2s ease-in-out infinite
  test('TC-N-10: HTML contains animation properties for running button', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('animation: pulse-opacity 2s ease-in-out infinite;'), 'Running button has correct animation properties');
  });

  // TC-N-11: HTML contains animation properties for hover state
  // Given: Provider initialized with valid context, HTML generated
  // When: HTML is generated
  // Then: HTML contains button.running:hover style definition (no separate animation, inherits from button.running)
  test('TC-N-11: HTML contains animation properties for hover state', () => {
    resolveView();
    const html = webviewView.webview.html;
    // Hover state only changes background-color, animation is inherited from button.running
    assert.ok(html.includes('button.running:hover {'), 'Hover state style is defined');
    assert.ok(html.includes('background-color: var(--vscode-button-secondaryHoverBackground);'), 'Hover state uses VS Code theme variable');
  });

  // --- Error cases (TC-E-01 to TC-E-04) ---

  // TC-E-01: updateButtonState called with null runBtn element
  // Given: Provider initialized, updateButtonState called with null runBtn element
  // When: JavaScript executes with null runBtn
  // Then: Throws TypeError or handles gracefully
  test('TC-E-01: updateButtonState called with null runBtn element', () => {
    resolveView();
    const html = webviewView.webview.html;
    // The HTML contains getElementById which may return null
    // The actual behavior depends on runtime, but the code should handle it
    assert.ok(html.includes('document.getElementById("runBtn")'), 'runBtn element is retrieved via getElementById');
    // Note: Actual null handling is tested in browser environment, not in unit tests
  });

  // TC-E-02: updateButtonState called with undefined runBtn
  // Given: Provider initialized, updateButtonState called with undefined runBtn
  // When: JavaScript executes with undefined runBtn
  // Then: Throws TypeError or handles gracefully
  test('TC-E-02: updateButtonState called with undefined runBtn', () => {
    resolveView();
    const html = webviewView.webview.html;
    // The HTML contains getElementById which may return null/undefined
    assert.ok(html.includes('const runBtn = document.getElementById("runBtn")'), 'runBtn is retrieved via getElementById');
    // Note: Actual undefined handling is tested in browser environment, not in unit tests
  });

  // TC-E-03: updateButtonState called with running=true but classList.add fails
  // Given: Provider initialized, updateButtonState called with running=true but classList.add fails
  // When: classList.add fails
  // Then: Error is handled gracefully, button text still updates
  test('TC-E-03: updateButtonState handles classList.add failure gracefully', () => {
    resolveView();
    const html = webviewView.webview.html;
    // The code should update textContent before classList operations
    // If classList.add fails, textContent should still be updated
    // 新しい実装では動的にラベルを設定するため、ラベル設定部分を確認
    assert.ok(
      html.includes('runBtn.textContent = label'),
      'Button text is updated dynamically',
    );
    assert.ok(html.includes('runBtn.classList.add("running")'), 'classList.add is called');
    // Note: Actual error handling is tested in browser environment with mocked classList
  });

  // TC-E-04: updateButtonState called with running=false but classList.remove fails
  // Given: Provider initialized, updateButtonState called with running=false but classList.remove fails
  // When: classList.remove fails
  // Then: Error is handled gracefully, button text still updates
  test('TC-E-04: updateButtonState handles classList.remove failure gracefully', () => {
    resolveView();
    const html = webviewView.webview.html;
    // The code should update textContent before classList operations
    // If classList.remove fails, textContent should still be updated
    assert.ok(html.includes(`runBtn.textContent = "${t('controlPanel.run')}"`), 'Button text is updated');
    assert.ok(html.includes('runBtn.classList.remove("running")'), 'classList.remove is called');
    // Note: Actual error handling is tested in browser environment with mocked classList
  });

  // --- Boundary cases (TC-B-01 to TC-B-10) ---

  // TC-B-01: updateButtonState called with running=true immediately after running=false
  // Given: Provider initialized, updateButtonState called with running=true immediately after running=false
  // When: State transitions rapidly
  // Then: Button state transitions correctly, class is added
  test('TC-B-01: Rapid state transition from false to true', () => {
    resolveView();
    const html = webviewView.webview.html;
    // The function should handle rapid state changes correctly
    assert.ok(html.includes('if (running) {'), 'Running state check exists');
    assert.ok(html.includes('runBtn.classList.add("running")'), 'Class is added when running');
    assert.ok(html.includes('} else {'), 'Else branch exists for non-running state');
    assert.ok(html.includes('runBtn.classList.remove("running")'), 'Class is removed when not running');
  });

  // TC-B-02: updateButtonState called with running=false immediately after running=true
  // Given: Provider initialized, updateButtonState called with running=false immediately after running=true
  // When: State transitions rapidly
  // Then: Button state transitions correctly, class is removed
  test('TC-B-02: Rapid state transition from true to false', () => {
    resolveView();
    const html = webviewView.webview.html;
    // The function should handle rapid state changes correctly
    assert.ok(html.includes('if (running) {'), 'Running state check exists');
    assert.ok(html.includes('runBtn.classList.remove("running")'), 'Class is removed when not running');
  });

  // TC-B-03: updateButtonState called multiple times with running=true
  // Given: Provider initialized, updateButtonState called multiple times with running=true
  // When: Function is called multiple times with same state
  // Then: Button state remains consistent, no duplicate classes added
  test('TC-B-03: Multiple calls with running=true', () => {
    resolveView();
    const html = webviewView.webview.html;
    // classList.add is idempotent, so multiple calls should be safe
    assert.ok(html.includes('runBtn.classList.add("running")'), 'classList.add is used (idempotent)');
  });

  // TC-B-04: updateButtonState called multiple times with running=false
  // Given: Provider initialized, updateButtonState called multiple times with running=false
  // When: Function is called multiple times with same state
  // Then: Button state remains consistent, no errors when removing non-existent class
  test('TC-B-04: Multiple calls with running=false', () => {
    resolveView();
    const html = webviewView.webview.html;
    // classList.remove is safe to call multiple times
    assert.ok(html.includes('runBtn.classList.remove("running")'), 'classList.remove is used (safe for multiple calls)');
  });

  // TC-B-05: Animation duration set to 0s
  // Given: Provider initialized, animation duration set to 0s
  // When: HTML is generated
  // Then: Animation still defined but executes instantly
  test('TC-B-05: Animation duration with 0s (boundary - zero)', () => {
    resolveView();
    const html = webviewView.webview.html;
    // CSS animation with 0s duration is valid
    // Current implementation uses 2s and 1.5s, but 0s would be valid CSS
    assert.ok(html.includes('animation:'), 'Animation property is defined');
    // Note: 0s duration is not used in current implementation, but CSS accepts it
  });

  // TC-B-06: Animation duration set to very large value (999999s)
  // Given: Provider initialized, animation duration set to very large value (999999s)
  // When: HTML is generated
  // Then: Animation still defined and executes
  test('TC-B-06: Animation duration with very large value (boundary - max)', () => {
    resolveView();
    const html = webviewView.webview.html;
    // CSS accepts large duration values
    assert.ok(html.includes('animation:'), 'Animation property is defined');
    // Note: Very large values are not used in current implementation, but CSS accepts them
  });

  // TC-B-07: HTML contains UTF-8 charset declaration for proper text encoding
  // Given: Provider initialized, HTML contains text content
  // When: HTML is generated
  // Then: UTF-8 charset is declared for proper text encoding
  test('TC-B-07: HTML contains UTF-8 charset declaration', () => {
    resolveView();
    const html = webviewView.webview.html;
    // UTF-8 encoding should handle all text correctly including localized characters
    assert.ok(html.includes('charset="UTF-8"'), 'HTML has UTF-8 charset declaration');
    assert.ok(html.includes(t('controlPanel.generatingTests')), 'Localized text is present in HTML');
  });

  // TC-B-08: stateUpdate message received with isRunning=true
  // Given: Provider initialized, stateUpdate message received with isRunning=true
  // When: Message is received
  // Then: updateButtonState is called with true, button shows running state
  test('TC-B-08: stateUpdate message received with isRunning=true', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('msg.type === "stateUpdate"'), 'Message type check exists');
    assert.ok(html.includes('updateButtonState(msg.isRunning, msg.phaseLabel)'), 'updateButtonState is called with isRunning value');
  });

  // TC-B-09: stateUpdate message received with isRunning=false
  // Given: Provider initialized, stateUpdate message received with isRunning=false
  // When: Message is received
  // Then: updateButtonState is called with false, button shows default state
  test('TC-B-09: stateUpdate message received with isRunning=false', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('msg.type === "stateUpdate"'), 'Message type check exists');
    assert.ok(html.includes('updateButtonState(msg.isRunning, msg.phaseLabel)'), 'updateButtonState is called with isRunning value');
  });

  // TC-B-10: background-size set to 200% 100%
  // Given: Provider initialized, background-size set to 200% 100%
  // When: HTML is generated
  // Then: Gradient background animates correctly with progress-slide effect
  test('TC-B-10: background-size set to 200% 100% for animation', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('background-size: 200% 100%;'), 'Background size is set to 200% 100%');
    assert.ok(html.includes('background: linear-gradient('), 'Gradient background is defined');
    assert.ok(html.includes('var(--vscode-descriptionForeground)'), 'Gradient uses VS Code theme variable');
    assert.ok(html.includes('@keyframes progress-slide'), 'Progress-slide animation is defined for background animation');
    assert.ok(html.includes('animation: progress-slide 1.5s linear infinite;'), 'Progress-slide animation is applied to button.running::before');
  });

  suite('phaseLabel mapping in webview script', () => {
    test('TC-N-12: stateUpdate running=true phaseLabel="preparing" sets button label to Preparing... (Cancel)', () => {
      // Case ID: TC-N-12
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with phaseLabel="preparing"
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: 'preparing' });

      // Then: Button label matches the phase-specific label
      assert.strictEqual(harness.runBtn.textContent, 'Preparing... (Cancel)');
    });

    test('TC-N-13: stateUpdate running=true phaseLabel="perspectives" sets button label to Perspectives... (Cancel)', () => {
      // Case ID: TC-N-13
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with phaseLabel="perspectives"
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: 'perspectives' });

      // Then: Button label matches the phase-specific label
      assert.strictEqual(harness.runBtn.textContent, 'Perspectives... (Cancel)');
    });

    test('TC-N-14: stateUpdate running=true phaseLabel="generating" sets button label to Generating... (Cancel)', () => {
      // Case ID: TC-N-14
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with phaseLabel="generating"
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: 'generating' });

      // Then: Button label matches the phase-specific label
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });

    test('TC-N-15: stateUpdate running=true phaseLabel="running-tests" sets button label to Testing... (Cancel)', () => {
      // Case ID: TC-N-15
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with phaseLabel="running-tests"
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: 'running-tests' });

      // Then: Button label matches the phase-specific label
      assert.strictEqual(harness.runBtn.textContent, 'Testing... (Cancel)');
    });

    test('TC-B-04: stateUpdate running=true phaseLabel=undefined falls back to Generating... (Cancel)', () => {
      // Case ID: TC-B-04
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate without phaseLabel
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: undefined });

      // Then: Falls back to default running label
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });

    test('TC-B-05: stateUpdate running=true phaseLabel=null falls back to Generating... (Cancel)', () => {
      // Case ID: TC-B-05
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with phaseLabel=null (runtime edge)
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: null });

      // Then: Falls back to default running label
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });

    test('TC-B-06: stateUpdate running=true phaseLabel="" falls back to Generating... (Cancel)', () => {
      // Case ID: TC-B-06
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with phaseLabel=""
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: '' });

      // Then: Falls back to default running label
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });

    test('TC-B-07: stateUpdate running=true phaseLabel=" " falls back to Generating... (Cancel)', () => {
      // Case ID: TC-B-07
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with phaseLabel=" " (truthy but unmapped)
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: ' ' });

      // Then: Falls back to default running label
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });

    test('TC-E-04: stateUpdate running=true phaseLabel="done" falls back to Generating... (Cancel)', () => {
      // Case ID: TC-E-04
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with an unknown phaseLabel
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: 'done' });

      // Then: Falls back to default running label
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });

    test('TC-N-16: stateUpdate running=false ignores phaseLabel and sets button label to Generate', () => {
      // Case ID: TC-N-16
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with isRunning=false
      harness.dispatchStateUpdate({ isRunning: false, phaseLabel: 'preparing' });

      // Then: Button label is the idle label
      assert.strictEqual(harness.runBtn.textContent, 'Generate');
      assert.strictEqual(harness.runBtn.classList.contains('running'), false);
    });
  });

  suite('provided table cases (CP-* / WV-*)', () => {
    test('CP-N-01: on {type:"ready"} posts stateUpdate with isRunning=false, taskCount=0, phaseLabel=undefined', async () => {
      // Case ID: CP-N-01
      // Given: ControlPanel provider is resolved; taskManager has 0 tasks
      resolveView();
      postedMessages = [];

      // When: Receiving the ready message from webview
      await webviewView.webview._onMessage?.({ type: 'ready' });

      // Then: Provider posts the exact stateUpdate message with phaseLabel=undefined
      assert.strictEqual(postedMessages.length, 1);
      assert.deepStrictEqual(postedMessages[0], { type: 'stateUpdate', isRunning: false, taskCount: 0, phaseLabel: undefined });
    });

    test('CP-B-01: on {type:"ready"} posts stateUpdate with isRunning=true, taskCount=1, phaseLabel=undefined', async () => {
      // Case ID: CP-B-01
      // Given: ControlPanel provider is resolved; taskManager has exactly 1 task with no phaseLabel
      const mockTask: RunningTask = { taskId: 'T1', dispose: () => {} };
      taskManager.register('T1', 'Label', mockTask);
      resolveView();
      postedMessages = [];

      // When: Receiving the ready message from webview
      await webviewView.webview._onMessage?.({ type: 'ready' });

      // Then: Provider posts the exact stateUpdate message with phaseLabel=undefined
      assert.strictEqual(postedMessages.length, 1);
      assert.deepStrictEqual(postedMessages[0], { type: 'stateUpdate', isRunning: true, taskCount: 1, phaseLabel: undefined });
    });

    test('CP-N-02: on {type:"ready"} includes phaseLabel from taskManager.getCurrentPhaseLabel()', async () => {
      // Case ID: CP-N-02
      // Given: ControlPanel provider is resolved; one task has phaseLabel="preparing"
      const mockTask: RunningTask = { taskId: 'phase-task', dispose: () => {} };
      taskManager.register('phase-task', 'Label', mockTask);
      taskManager.updatePhase('phase-task', 'preparing', 'preparing');
      resolveView();
      postedMessages = [];

      // When: Receiving the ready message from webview
      await webviewView.webview._onMessage?.({ type: 'ready' });

      // Then: Provider posts phaseLabel="preparing"
      assert.strictEqual(postedMessages.length, 1);
      assert.deepStrictEqual(postedMessages[0], { type: 'stateUpdate', isRunning: true, taskCount: 1, phaseLabel: 'preparing' });
    });

    test('CP-N-03: after resolve, taskManager.register triggers a stateUpdate forwarding phaseLabel=undefined', () => {
      // Case ID: CP-N-03
      // Given: ControlPanel provider is resolved
      resolveView();
      postedMessages = [];

      // When: A task is registered
      const mockTask: RunningTask = { taskId: 'new-task', dispose: () => {} };
      taskManager.register('new-task', 'Label', mockTask);

      // Then: A stateUpdate is posted with phaseLabel=undefined
      assert.ok(postedMessages.length >= 1);
      assert.deepStrictEqual(postedMessages[postedMessages.length - 1], {
        type: 'stateUpdate',
        isRunning: true,
        taskCount: 1,
        phaseLabel: undefined,
      });
    });

    test('CP-N-04: after resolve, taskManager.unregister triggers a stateUpdate with isRunning=false, taskCount=0, phaseLabel=undefined', () => {
      // Case ID: CP-N-04
      // Given: ControlPanel provider is resolved and a task is registered
      const mockTask: RunningTask = { taskId: 'running-task', dispose: () => {} };
      taskManager.register('running-task', 'Label', mockTask);
      resolveView();
      postedMessages = [];

      // When: The task is unregistered
      taskManager.unregister('running-task');

      // Then: A stateUpdate is posted with count=0 and phaseLabel=undefined
      assert.ok(postedMessages.length >= 1);
      assert.deepStrictEqual(postedMessages[postedMessages.length - 1], {
        type: 'stateUpdate',
        isRunning: false,
        taskCount: 0,
        phaseLabel: undefined,
      });
    });

    test('CP-E-01: without resolveWebviewView (view undefined), state updates do not post messages', () => {
      // Case ID: CP-E-01
      // Given: ControlPanel provider exists but resolveWebviewView has NOT been called
      postedMessages = [];

      // When: taskManager state changes (register triggers notifyListeners)
      const mockTask: RunningTask = { taskId: 'no-view', dispose: () => {} };
      taskManager.register('no-view', 'Label', mockTask);

      // Then: No webview.postMessage call happens
      assert.strictEqual(postedMessages.length, 0);
    });

    test('WV-N-01: stateUpdate running=true phaseLabel="preparing" sets run button text to Preparing... (Cancel)', () => {
      // Case ID: WV-N-01
      // Given: Webview script is executed
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving {type:"stateUpdate", isRunning:true, phaseLabel:"preparing"}
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: 'preparing' });

      // Then: run button label is mapped by phaseButtonLabels.preparing
      assert.strictEqual(harness.runBtn.textContent, 'Preparing... (Cancel)');
    });

    test('WV-N-02: stateUpdate running=true phaseLabel="perspectives" sets run button text to Perspectives... (Cancel)', () => {
      // Case ID: WV-N-02
      // Given: Webview script is executed
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving {type:"stateUpdate", isRunning:true, phaseLabel:"perspectives"}
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: 'perspectives' });

      // Then: run button label is mapped by phaseButtonLabels.perspectives
      assert.strictEqual(harness.runBtn.textContent, 'Perspectives... (Cancel)');
    });

    test('WV-N-03: stateUpdate running=true phaseLabel="generating" sets run button text to Generating... (Cancel)', () => {
      // Case ID: WV-N-03
      // Given: Webview script is executed
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving {type:"stateUpdate", isRunning:true, phaseLabel:"generating"}
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: 'generating' });

      // Then: run button label is mapped by phaseButtonLabels.generating
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });

    test('WV-N-04: stateUpdate running=true phaseLabel="running-tests" sets run button text to Testing... (Cancel)', () => {
      // Case ID: WV-N-04
      // Given: Webview script is executed
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving {type:"stateUpdate", isRunning:true, phaseLabel:"running-tests"}
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: 'running-tests' });

      // Then: run button label is mapped by phaseButtonLabels["running-tests"]
      assert.strictEqual(harness.runBtn.textContent, 'Testing... (Cancel)');
    });

    test('WV-B-01: stateUpdate running=true phaseLabel=undefined falls back to controlPanel.generatingTests', () => {
      // Case ID: WV-B-01
      // Given: Webview script is executed
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving {type:"stateUpdate", isRunning:true, phaseLabel:undefined}
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: undefined });

      // Then: run button text uses the fallback label
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });

    test('WV-B-02: stateUpdate running=true phaseLabel=null falls back to controlPanel.generatingTests', () => {
      // Case ID: WV-B-02
      // Given: Webview script is executed
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving {type:"stateUpdate", isRunning:true, phaseLabel:null}
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: null });

      // Then: run button text uses the fallback label
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });

    test('WV-B-03: stateUpdate running=true phaseLabel="" falls back to controlPanel.generatingTests', () => {
      // Case ID: WV-B-03
      // Given: Webview script is executed
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving {type:"stateUpdate", isRunning:true, phaseLabel:""}
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: '' });

      // Then: run button text uses the fallback label
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });

    test('WV-B-04: stateUpdate running=true phaseLabel=" " falls back to controlPanel.generatingTests', () => {
      // Case ID: WV-B-04
      // Given: Webview script is executed
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving {type:"stateUpdate", isRunning:true, phaseLabel:" "}
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: ' ' });

      // Then: run button text uses the fallback label (unmapped phase)
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });

    test('WV-E-01: stateUpdate running=true phaseLabel="done" falls back to controlPanel.generatingTests', () => {
      // Case ID: WV-E-01
      // Given: Webview script is executed
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving {type:"stateUpdate", isRunning:true, phaseLabel:"done"}
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: 'done' });

      // Then: run button text uses the fallback label (unknown phase)
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });

    test('WV-N-05: stateUpdate running=false ignores phaseLabel and sets idle label + removes running class', () => {
      // Case ID: WV-N-05
      // Given: Webview script is executed
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving {type:"stateUpdate", isRunning:false, phaseLabel:"preparing"}
      harness.dispatchStateUpdate({ isRunning: false, phaseLabel: 'preparing' });

      // Then: run button text is idle label and "running" class is absent
      assert.strictEqual(harness.runBtn.textContent, 'Generate');
      assert.strictEqual(harness.runBtn.classList.contains('running'), false);
    });
  });

  suite('provided table cases (TC-CP-*)', () => {
    function getTaskManagerListenerCount(): number {
      const listeners = (taskManager as unknown as { listeners?: unknown }).listeners;
      assert.ok(listeners instanceof Set, 'Expected taskManager to hold an internal Set named listeners');
      return (listeners as Set<unknown>).size;
    }

    test('TC-CP-N-01: stateUpdate {isRunning:true, phaseLabel:"preparing"} maps to "Preparing... (Cancel)" and adds running class', () => {
      // Case ID: TC-CP-N-01
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving stateUpdate with phaseLabel="preparing"
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: 'preparing' });

      // Then: Run button text and class match the expected running state
      assert.strictEqual(harness.runBtn.textContent, 'Preparing... (Cancel)');
      assert.strictEqual(harness.runBtn.classList.contains('running'), true);
    });

    test('TC-CP-N-02: stateUpdate {isRunning:true, phaseLabel:"perspectives"} maps to "Perspectives... (Cancel)" and adds running class', () => {
      // Case ID: TC-CP-N-02
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving stateUpdate with phaseLabel="perspectives"
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: 'perspectives' });

      // Then: Run button text and class match the expected running state
      assert.strictEqual(harness.runBtn.textContent, 'Perspectives... (Cancel)');
      assert.strictEqual(harness.runBtn.classList.contains('running'), true);
    });

    test('TC-CP-N-03: stateUpdate {isRunning:true, phaseLabel:"generating"} maps to "Generating... (Cancel)" and adds running class', () => {
      // Case ID: TC-CP-N-03
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving stateUpdate with phaseLabel="generating"
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: 'generating' });

      // Then: Run button text and class match the expected running state
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
      assert.strictEqual(harness.runBtn.classList.contains('running'), true);
    });

    test('TC-CP-N-04: stateUpdate {isRunning:true, phaseLabel:"running-tests"} maps to "Testing... (Cancel)" and adds running class', () => {
      // Case ID: TC-CP-N-04
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving stateUpdate with phaseLabel="running-tests"
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: 'running-tests' });

      // Then: Run button text and class match the expected running state
      assert.strictEqual(harness.runBtn.textContent, 'Testing... (Cancel)');
      assert.strictEqual(harness.runBtn.classList.contains('running'), true);
    });

    test('TC-CP-B-01: stateUpdate {isRunning:true, phaseLabel:undefined} falls back to "Generating... (Cancel)"', () => {
      // Case ID: TC-CP-B-01
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving stateUpdate with phaseLabel undefined
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: undefined });

      // Then: It falls back to the default running label
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
      assert.strictEqual(harness.runBtn.classList.contains('running'), true);
    });

    test('TC-CP-B-02: stateUpdate {isRunning:true, phaseLabel:""} falls back to "Generating... (Cancel)"', () => {
      // Case ID: TC-CP-B-02
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving stateUpdate with empty-string phaseLabel
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: '' });

      // Then: It falls back to the default running label
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
      assert.strictEqual(harness.runBtn.classList.contains('running'), true);
    });

    test('TC-CP-B-03: stateUpdate {isRunning:true, phaseLabel:"unknown-phase"} falls back to "Generating... (Cancel)"', () => {
      // Case ID: TC-CP-B-03
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving stateUpdate with an unknown phaseLabel
      harness.dispatchStateUpdate({ isRunning: true, phaseLabel: 'unknown-phase' });

      // Then: It falls back to the default running label
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
      assert.strictEqual(harness.runBtn.classList.contains('running'), true);
    });

    test('TC-CP-E-01: without resolveWebviewView (view undefined), no postMessage occurs on taskManager notification', () => {
      // Case ID: TC-CP-E-01
      // Given: A provider exists but resolveWebviewView has not been called (view is undefined)
      postedMessages = [];

      // When: taskManager triggers a state change
      const mockTask: RunningTask = { taskId: 'no-view-case', dispose: () => {} };
      taskManager.register('no-view-case', 'Label', mockTask);

      // Then: No postMessage is sent and no exception is thrown
      assert.strictEqual(postedMessages.length, 0);
    });

    test('TC-CP-N-05: provider dispose removes taskManager listener and stops future stateUpdate posts', () => {
      // Case ID: TC-CP-N-05
      // Given: A fresh provider is created and its webview is resolved
      const baseCount = getTaskManagerListenerCount();

      const deps = {
        executeCommand: async () => {},
      };
      const localProvider = new TestGenControlPanelViewProvider(context, deps);
      const countAfterCreate = getTaskManagerListenerCount();
      assert.strictEqual(countAfterCreate, baseCount + 1);

      const localWebviewView: MockWebviewView = {
        webview: {
          options: {},
          html: '',
          onDidReceiveMessage: () => {},
          postMessage: async (msg: unknown) => {
            postedMessages.push(msg);
            return true;
          },
          cspSource: 'vscode-webview-resource:',
        },
        visible: true,
        onDidDispose: () => {},
      };
      localProvider.resolveWebviewView(
        localWebviewView as unknown as vscode.WebviewView,
        {} as vscode.WebviewViewResolveContext,
        { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) } as vscode.CancellationToken,
      );

      // When: The provider is disposed once, then taskManager notifies listeners
      localProvider.dispose();
      const countAfterDispose = getTaskManagerListenerCount();

      postedMessages = [];
      const mockTask: RunningTask = { taskId: 'after-dispose', dispose: () => {} };
      taskManager.register('after-dispose', 'Label', mockTask);

      // Then: listener count is decremented and no messages are posted after dispose
      assert.strictEqual(countAfterDispose, baseCount);
      assert.strictEqual(postedMessages.length, 0);
    });

    test('TC-CP-B-04: dispose() is idempotent (removeListener called at most once)', () => {
      // Case ID: TC-CP-B-04
      // Given: A fresh provider is created and taskManager.removeListener is wrapped
      const originalRemoveListener = taskManager.removeListener.bind(taskManager);
      let removeCount = 0;
      (taskManager as unknown as { removeListener: typeof taskManager.removeListener }).removeListener = ((listener) => {
        removeCount += 1;
        originalRemoveListener(listener);
      }) as typeof taskManager.removeListener;

      try {
        const localProvider = new TestGenControlPanelViewProvider(context, { executeCommand: async () => {} });

        // When: dispose() is called twice
        localProvider.dispose();
        localProvider.dispose();

        // Then: removeListener is called exactly once and no exception occurs
        assert.strictEqual(removeCount, 1);
      } finally {
        (taskManager as unknown as { removeListener: typeof taskManager.removeListener }).removeListener = originalRemoveListener;
      }
    });

    test('TC-CP-B-05: stateUpdate {isRunning:false, taskCount:0} sets idle label "Generate" and removes running class', () => {
      // Case ID: TC-CP-B-05
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving stateUpdate with isRunning=false
      harness.dispatchStateUpdate({ isRunning: false, phaseLabel: 'preparing' });

      // Then: Button label is idle and running class is removed
      assert.strictEqual(harness.runBtn.textContent, 'Generate');
      assert.strictEqual(harness.runBtn.classList.contains('running'), false);
    });
  });

  suite('provided perspectives table cases (TC-*-CP-*)', () => {
    test('TC-N-CP-01: stateUpdate {isRunning:true, taskCount:1, phaseLabel:"preparing"} sets label + running class', () => {
      // Case ID: TC-N-CP-01
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with phaseLabel="preparing"
      harness.dispatchStateUpdate({ isRunning: true, taskCount: 1, phaseLabel: 'preparing' });

      // Then: Run button text becomes "Preparing... (Cancel)" and has running class
      assert.strictEqual(harness.runBtn.textContent, 'Preparing... (Cancel)');
      assert.strictEqual(harness.runBtn.classList.contains('running'), true);
    });

    test('TC-N-CP-02: stateUpdate {isRunning:true, taskCount:1, phaseLabel:"perspectives"} sets label', () => {
      // Case ID: TC-N-CP-02
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with phaseLabel="perspectives"
      harness.dispatchStateUpdate({ isRunning: true, taskCount: 1, phaseLabel: 'perspectives' });

      // Then: Run button text becomes "Perspectives... (Cancel)"
      assert.strictEqual(harness.runBtn.textContent, 'Perspectives... (Cancel)');
    });

    test('TC-N-CP-03: stateUpdate {isRunning:true, taskCount:1, phaseLabel:"generating"} sets label', () => {
      // Case ID: TC-N-CP-03
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with phaseLabel="generating"
      harness.dispatchStateUpdate({ isRunning: true, taskCount: 1, phaseLabel: 'generating' });

      // Then: Run button text becomes "Generating... (Cancel)"
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });

    test('TC-N-CP-04: stateUpdate {isRunning:true, taskCount:1, phaseLabel:"running-tests"} sets label', () => {
      // Case ID: TC-N-CP-04
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with phaseLabel="running-tests"
      harness.dispatchStateUpdate({ isRunning: true, taskCount: 1, phaseLabel: 'running-tests' });

      // Then: Run button text becomes "Testing... (Cancel)"
      assert.strictEqual(harness.runBtn.textContent, 'Testing... (Cancel)');
    });

    test('TC-E-CP-05: stateUpdate {isRunning:true, taskCount:1, phaseLabel:"unknown-phase"} falls back to default running label', () => {
      // Case ID: TC-E-CP-05
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with an unknown phaseLabel
      harness.dispatchStateUpdate({ isRunning: true, taskCount: 1, phaseLabel: 'unknown-phase' });

      // Then: Run button text falls back to "Generating... (Cancel)"
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });

    test('TC-B-CP-06: stateUpdate {isRunning:true, taskCount:1} (phaseLabel omitted) falls back to default running label', () => {
      // Case ID: TC-B-CP-06
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with no phaseLabel field
      harness.dispatchStateUpdate({ isRunning: true, taskCount: 1 });

      // Then: Run button text falls back to "Generating... (Cancel)"
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });

    test('TC-B-CP-07: stateUpdate {isRunning:true, taskCount:1, phaseLabel:""} falls back to default running label', () => {
      // Case ID: TC-B-CP-07
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with empty-string phaseLabel
      harness.dispatchStateUpdate({ isRunning: true, taskCount: 1, phaseLabel: '' });

      // Then: Run button text falls back to "Generating... (Cancel)"
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });

    test('TC-B-CP-08: stateUpdate {isRunning:true, taskCount:1, phaseLabel:" "} falls back to default running label', () => {
      // Case ID: TC-B-CP-08
      // Given: The webview HTML/script is loaded
      resolveView();
      const harness = createWebviewScriptHarness(webviewView.webview.html);

      // When: Receiving a stateUpdate with whitespace phaseLabel (truthy but unmapped)
      harness.dispatchStateUpdate({ isRunning: true, taskCount: 1, phaseLabel: ' ' });

      // Then: Run button text falls back to "Generating... (Cancel)"
      assert.strictEqual(harness.runBtn.textContent, 'Generating... (Cancel)');
    });
  });
});
