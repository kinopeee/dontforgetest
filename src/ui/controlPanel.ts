import * as vscode from 'vscode';

type PanelRunSource = 'workingTree' | 'latestCommit' | 'commitRange';

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'run'; source: PanelRunSource }
  | { type: 'runCommand'; command: AllowedCommand };

type AllowedCommand =
  | 'testgen-agent.generateTest'
  | 'testgen-agent.generateTestFromCommit'
  | 'testgen-agent.generateTestFromCommitRange'
  | 'testgen-agent.generateTestFromWorkingTree'
  | 'testgen-agent.previewLastRun'
  | 'testgen-agent.rollbackLastRun'
  | 'testgen-agent.showTestGeneratorOutput'
  | 'testgen-agent.selectDefaultModel';

interface ControlPanelDeps {
  executeCommand: (command: AllowedCommand) => Thenable<unknown>;
}

/**
 * サイドバーに表示する TestGen 操作パネル（WebviewView）。
 *
 * 方針:
 * - UI は最小構成（既存コマンド呼び出しに寄せる）
 * - 設定はビュータイトルバーのギアアイコンから開く
 */
export class TestGenControlPanelViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'testgen-agent.controlPanel';

  private view?: vscode.WebviewView;
  private readonly deps: ControlPanelDeps;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    deps: Partial<ControlPanelDeps> = {},
  ) {
    this.deps = { ...createDefaultDeps(), ...deps };
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      // ローカル読み込みは現状不要（script/style はインライン）
    };

    webviewView.webview.html = this.buildHtml();

    webviewView.webview.onDidReceiveMessage(async (raw: unknown) => {
      const msg = raw as WebviewMessage;
      await this.handleMessage(msg);
    });
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    if (!msg || typeof msg !== 'object') {
      return;
    }

    if (msg.type === 'ready') {
      // 状態を送る必要がなくなったため何もしない
      return;
    }

    if (msg.type === 'run') {
      const cmd = this.sourceToCommand(msg.source);
      if (!cmd) {
        return;
      }
      await this.deps.executeCommand(cmd);
      return;
    }

    if (msg.type === 'runCommand') {
      // セキュリティのため、許可したコマンドのみ実行する
      await this.deps.executeCommand(msg.command);
      return;
    }
  }

  private sourceToCommand(source: PanelRunSource): AllowedCommand | undefined {
    switch (source) {
      case 'workingTree':
        return 'testgen-agent.generateTestFromWorkingTree';
      case 'latestCommit':
        return 'testgen-agent.generateTestFromCommit';
      case 'commitRange':
        return 'testgen-agent.generateTestFromCommitRange';
      default: {
        const _exhaustive: never = source;
        return _exhaustive;
      }
    }
  }

  private buildHtml(): string {
    const nonce = getNonce();

    return [
      '<!DOCTYPE html>',
      '<html lang="ja">',
      '<head>',
      '  <meta charset="UTF-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      `  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />`,
      '  <title>Chottotest</title>',
      '  <style>',
      '    :root {',
      '      --gap: 10px;',
      '      --radius: 8px;',
      '    }',
      '    body {',
      '      padding: 12px;',
      '      color: var(--vscode-foreground);',
      '      background: var(--vscode-editor-background);',
      '      font-family: var(--vscode-font-family);',
      '      font-size: var(--vscode-font-size);',
      '    }',
      '    .section {',
      '      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.3));',
      '      border-radius: var(--radius);',
      '      padding: 10px;',
      '      margin-bottom: 12px;',
      '    }',
      '    .title {',
      '      font-weight: 600;',
      '      margin: 0 0 8px 0;',
      '      font-size: 12px;',
      '      opacity: 0.9;',
      '    }',
      '    .row {',
      '      display: flex;',
      '      gap: var(--gap);',
      '      align-items: center;',
      '      margin: 8px 0;',
      '    }',
      '    select, button {',
      '      width: 100%;',
      '      border-radius: 6px;',
      '      border: 1px solid var(--vscode-input-border, rgba(127,127,127,.3));',
      '      background: var(--vscode-input-background);',
      '      color: var(--vscode-input-foreground);',
      '      padding: 6px 8px;',
      '      outline: none;',
      '      transition: all 0.15s ease;',
      '    }',
      '    select:hover {',
      '      border-color: var(--vscode-focusBorder);',
      '    }',
      '    button {',
      '      cursor: pointer;',
      '      background: var(--vscode-button-background);',
      '      color: var(--vscode-button-foreground);',
      '      border: 1px solid var(--vscode-button-background);',
      '    }',
      '    button:hover {',
      '      filter: brightness(1.1);',
      '      transform: translateY(-1px);',
      '    }',
      '    button:active {',
      '      transform: translateY(0);',
      '    }',
      '    button.primary {',
      '      font-weight: 600;',
      '      padding: 8px 12px;',
      '    }',
      '    button.secondary {',
      '      background: transparent;',
      '      color: var(--vscode-foreground);',
      '      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.3));',
      '    }',
      '    button.secondary:hover {',
      '      background: var(--vscode-list-hoverBackground);',
      '      filter: none;',
      '    }',
      '    .muted {',
      '      opacity: 0.75;',
      '      font-size: 11px;',
      '      line-height: 1.35;',
      '    }',
      '    .option-desc {',
      '      font-size: 11px;',
      '      opacity: 0.7;',
      '      margin-top: 4px;',
      '      margin-bottom: 8px;',
      '    }',
      '    details.section {',
      '      cursor: default;',
      '    }',
      '    details.section summary {',
      '      cursor: pointer;',
      '      user-select: none;',
      '      list-style: none;',
      '      display: flex;',
      '      align-items: center;',
      '      gap: 6px;',
      '      padding: 2px 0;',
      '      outline: none;',
      '      font-weight: 600;',
      '      font-size: 12px;',
      '      opacity: 0.9;',
      '    }',
      '    details.section summary::-webkit-details-marker {',
      '      display: none;',
      '    }',
      '    details.section summary .chevron {',
      '      display: inline-flex;',
      '      align-items: center;',
      '      justify-content: center;',
      '      width: 16px;',
      '      height: 16px;',
      '      font-size: 12px;',
      '      transition: transform 0.15s ease;',
      '    }',
      '    details.section[open] summary .chevron {',
      '      transform: rotate(90deg);',
      '    }',
      '    details.section .content {',
      '      margin-top: 8px;',
      '    }',
      '  </style>',
      '</head>',
      '<body>',
      '  <div class="section">',
      '    <div class="row">',
      '      <select id="sourceSelect" aria-label="source">',
      '        <option value="workingTree">未コミット差分</option>',
      '        <option value="latestCommit">最新コミット差分</option>',
      '        <option value="commitRange">コミット範囲差分</option>',
      '      </select>',
      '    </div>',
      '    <div class="option-desc" id="optionDesc">git add していない変更を対象</div>',
      '    <div class="row">',
      '      <button class="primary" id="runBtn">テスト生成</button>',
      '    </div>',
      '    <div class="row">',
      '      <button class="secondary" id="quickPickBtn">QuickPick</button>',
      '    </div>',
      '  </div>',
      '',
      '  <details class="section">',
      '    <summary><span class="chevron">›</span> 差分 / 元に戻す</summary>',
      '    <div class="content">',
      '      <div class="row"><button class="secondary" id="previewBtn">差分を表示</button></div>',
      '      <div class="row"><button class="secondary" id="rollbackBtn">元に戻す</button></div>',
      '    </div>',
      '  </details>',
      '',
      '  <details class="section">',
      '    <summary><span class="chevron">›</span> ログ</summary>',
      '    <div class="content">',
      '      <div class="row"><button class="secondary" id="openLogBtn">ログを表示</button></div>',
      '    </div>',
      '  </details>',
      '',
      `  <script nonce="${nonce}">`,
      '    const vscode = acquireVsCodeApi();',
      '',
      '    const sourceSelect = document.getElementById("sourceSelect");',
      '    const optionDesc = document.getElementById("optionDesc");',
      '    const runBtn = document.getElementById("runBtn");',
      '    const quickPickBtn = document.getElementById("quickPickBtn");',
      '    const previewBtn = document.getElementById("previewBtn");',
      '    const rollbackBtn = document.getElementById("rollbackBtn");',
      '    const openLogBtn = document.getElementById("openLogBtn");',
      '',
      '    const descriptions = {',
      '      workingTree: "git add していない変更を対象",',
      '      latestCommit: "HEAD の変更を対象",',
      '      commitRange: "指定した範囲のコミットを対象"',
      '    };',
      '',
      '    sourceSelect.addEventListener("change", () => {',
      '      optionDesc.textContent = descriptions[sourceSelect.value] || "";',
      '    });',
      '',
      '    runBtn.addEventListener("click", () => {',
      '      vscode.postMessage({ type: "run", source: sourceSelect.value });',
      '    });',
      '',
      '    quickPickBtn.addEventListener("click", () => {',
      '      vscode.postMessage({ type: "runCommand", command: "testgen-agent.generateTest" });',
      '    });',
      '',
      '    previewBtn.addEventListener("click", () => {',
      '      vscode.postMessage({ type: "runCommand", command: "testgen-agent.previewLastRun" });',
      '    });',
      '',
      '    rollbackBtn.addEventListener("click", () => {',
      '      vscode.postMessage({ type: "runCommand", command: "testgen-agent.rollbackLastRun" });',
      '    });',
      '',
      '    openLogBtn.addEventListener("click", () => {',
      '      vscode.postMessage({ type: "runCommand", command: "testgen-agent.showTestGeneratorOutput" });',
      '    });',
      '  </script>',
      '</body>',
      '</html>',
    ].join('\n');
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function createDefaultDeps(): ControlPanelDeps {
  return {
    executeCommand: async (command) => await vscode.commands.executeCommand(command),
  };
}

