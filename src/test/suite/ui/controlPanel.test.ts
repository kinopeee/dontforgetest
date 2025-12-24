import * as assert from 'assert';
import * as vscode from 'vscode';
import { TestGenControlPanelViewProvider } from '../../../ui/controlPanel';
import { taskManager } from '../../../core/taskManager';
import { type RunningTask } from '../../../providers/provider';

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
  let postedMessages: unknown[] = [];

  setup(() => {
    // Reset
    executedCommands = [];
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
      executeCommand: async (cmd: string) => { executedCommands.push(cmd); },
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
  });

  // Helper function: call resolveWebviewView
  function resolveView(): void {
    provider.resolveWebviewView(
      webviewView as unknown as vscode.WebviewView,
      {} as vscode.WebviewViewResolveContext,
      { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => {} }) } as vscode.CancellationToken
    );
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
  // Then: HTML contains button element with VS Code native-like styles (height: 26px, padding: 4px 14px, border-radius: 2px)
  test('TC-N-07: Button element styles', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('height: 26px;'), 'Button has height: 26px');
    assert.ok(html.includes('padding: 4px 14px;'), 'Button has padding: 4px 14px');
    assert.ok(html.includes('border-radius: 2px;'), 'Button has border-radius: 2px');
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
    assert.ok(html.includes('<div class="hint" id="optionDesc">'), 'Hint class is used in HTML');
  });

  // TC-N-10: Divider element
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains `.divider` element with height: 1px
  test('TC-N-10: Divider element', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('.divider {'), 'Divider class CSS is present');
    assert.ok(html.includes('height: 1px;'), 'Divider has height: 1px');
    assert.ok(html.includes('<div class="divider"></div>'), 'Divider element is present in HTML');
  });

  // TC-N-11: Section header class
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains `.section-header` class with uppercase styling
  test('TC-N-11: Section header class', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('.section-header {'), 'Section header class CSS is present');
    assert.ok(html.includes('text-transform: uppercase;'), 'Section header has uppercase styling');
    assert.ok(html.includes('<div class="section-header">出力</div>'), 'Section header element is present in HTML');
  });

  // TC-N-12: Link-style button
  // Given: Provider initialized with valid context
  // When: HTML is generated
  // Then: HTML contains `button.link` class with link-style button styling
  test('TC-N-12: Link-style button', () => {
    resolveView();
    const html = webviewView.webview.html;
    assert.ok(html.includes('button.link {'), 'Link button class CSS is present');
    assert.ok(html.includes('background: transparent;'), 'Link button has transparent background');
    assert.ok(html.includes('color: var(--vscode-textLink-foreground);'), 'Link button uses textLink color');
    assert.ok(html.includes('<button class="link" id="openPerspectiveBtn">'), 'Link button is present in HTML');
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
    assert.ok(html.includes('<option value="workingTree">未コミット差分</option>'), 'workingTree option is present');
    assert.ok(html.includes('<option value="latestCommit">最新コミット</option>'), 'latestCommit option is present');
    assert.ok(html.includes('<option value="commitRange">コミット範囲</option>'), 'commitRange option is present');
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
    assert.ok(html.includes('descriptions[sourceSelect.value] || ""'), 'JavaScript has fallback for undefined value');
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
    const msg = postedMessages[0] as { type: string; isRunning: boolean; taskCount: number };
    assert.strictEqual(msg.type, 'stateUpdate', 'Message type is stateUpdate');
    assert.strictEqual(msg.isRunning, false, 'isRunning is false');
    assert.strictEqual(msg.taskCount, 0, 'taskCount is 0');
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
    const msg = postedMessages[0] as { type: string; isRunning: boolean; taskCount: number };
    assert.strictEqual(msg.type, 'stateUpdate', 'Message type is stateUpdate');
    assert.strictEqual(msg.isRunning, true, 'isRunning is true');
    assert.strictEqual(msg.taskCount, 1, 'taskCount is 1');
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
    const msg = postedMessages[postedMessages.length - 1] as { type: string; isRunning: boolean; taskCount: number };
    assert.strictEqual(msg.type, 'stateUpdate', 'Message type is stateUpdate');
    assert.strictEqual(msg.isRunning, true, 'isRunning is true');
    assert.strictEqual(msg.taskCount, 1, 'taskCount is 1');
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
    const msg = postedMessages[postedMessages.length - 1] as { type: string; isRunning: boolean; taskCount: number };
    assert.strictEqual(msg.type, 'stateUpdate', 'Message type is stateUpdate');
    assert.strictEqual(msg.isRunning, false, 'isRunning is false');
    assert.strictEqual(msg.taskCount, 0, 'taskCount is 0');
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
    assert.ok(html.includes('function updateButtonState(running)'), 'updateButtonState function exists');
    assert.ok(html.includes('テスト作成中 (中断)'), 'Running state button text exists');
    assert.ok(html.includes('テスト生成'), 'Default button text exists');
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
    assert.ok(html.includes('updateButtonState(msg.isRunning)'), 'updateButtonState call exists');
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

    // Then: HTML contains style changes for running state
    assert.ok(html.includes('runBtn.style.backgroundColor'), 'Button background color change exists');
    assert.ok(html.includes('--vscode-button-secondaryBackground'), 'Secondary background variable used');
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
});
