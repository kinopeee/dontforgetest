import * as vscode from 'vscode';
import { taskManager } from '../core/taskManager';

type PanelRunSource = 'workingTree' | 'latestCommit' | 'commitRange';

/** Webviewから拡張機能へのメッセージ */
type WebviewMessage =
  | { type: 'ready' }
  | { type: 'run'; source: PanelRunSource }
  | { type: 'runCommand'; command: AllowedCommand }
  | { type: 'cancel' };

/** 拡張機能からWebviewへのメッセージ */
type ExtensionMessage =
  | { type: 'stateUpdate'; isRunning: boolean; taskCount: number };

type AllowedCommand =
  | 'dontforgetest.generateTest'
  | 'dontforgetest.generateTestFromCommit'
  | 'dontforgetest.generateTestFromCommitRange'
  | 'dontforgetest.generateTestFromWorkingTree'
  | 'dontforgetest.showTestGeneratorOutput'
  | 'dontforgetest.selectDefaultModel'
  | 'dontforgetest.openLatestPerspective'
  | 'dontforgetest.openLatestExecutionReport';

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
  public static readonly viewId = 'dontforgetest.controlPanel';

  private view?: vscode.WebviewView;
  private readonly deps: ControlPanelDeps;
  private readonly stateListener: (isRunning: boolean, taskCount: number) => void;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    deps: Partial<ControlPanelDeps> = {},
  ) {
    this.deps = { ...createDefaultDeps(), ...deps };

    // タスク状態変更を監視してWebviewに通知
    this.stateListener = (isRunning, taskCount) => {
      this.sendStateUpdate(isRunning, taskCount);
    };
    taskManager.addListener(this.stateListener);
  }

  /**
   * Webviewに状態更新を送信する。
   */
  private sendStateUpdate(isRunning: boolean, taskCount: number): void {
    if (!this.view) {
      return;
    }
    const message: ExtensionMessage = { type: 'stateUpdate', isRunning, taskCount };
    void this.view.webview.postMessage(message);
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
      // 現在の状態を送信
      this.sendStateUpdate(taskManager.isRunning(), taskManager.getRunningCount());
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

    if (msg.type === 'cancel') {
      // 実行中のすべてのタスクをキャンセル
      taskManager.cancelAll();
      return;
    }
  }

  private sourceToCommand(source: PanelRunSource): AllowedCommand | undefined {
    switch (source) {
      case 'workingTree':
        return 'dontforgetest.generateTestFromWorkingTree';
      case 'latestCommit':
        return 'dontforgetest.generateTestFromCommit';
      case 'commitRange':
        return 'dontforgetest.generateTestFromCommitRange';
      default:
        // 未知の source 値の場合（TypeScript レベルでは到達不可能だが、ランタイム安全性のため）
        return undefined;
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
      '  <title>Dontforgetest</title>',
      '  <style>',
      '    * { box-sizing: border-box; }',
      '    html, body { height: auto; min-height: 0; }',
      '    body {',
      '      margin: 0;',
      '      padding: 4px 14px 4px 14px;',
      '      color: var(--vscode-foreground);',
      '      background: transparent;',
      '      font-family: var(--vscode-font-family);',
      '      font-size: var(--vscode-font-size);',
      '      line-height: 1.4;',
      '    }',
      '    .section { margin-bottom: 0; }',
      '    .row { margin: 6px 0; }',
      '',
      '    /* VS Code native-like dropdown wrapper */  ',
      '    .select-wrap {',
      '      position: relative;',
      '      display: block;',
      '    }',
      '    .select-wrap::after {',
      '      content: "";',
      '      position: absolute;',
      '      right: 8px;',
      '      top: 50%;',
      '      transform: translateY(-50%);',
      '      width: 0;',
      '      height: 0;',
      '      border-left: 4px solid transparent;',
      '      border-right: 4px solid transparent;',
      '      border-top: 4px solid var(--vscode-foreground);',
      '      opacity: 0.7;',
      '      pointer-events: none;',
      '    }',
      '    select {',
      '      width: 100%;',
      '      height: 24px;',
      '      padding: 2px 24px 2px 8px;',
      '      font-size: 13px;',
      '      font-family: var(--vscode-font-family);',
      '      color: var(--vscode-dropdown-foreground, var(--vscode-foreground));',
      '      background-color: var(--vscode-dropdown-background, var(--vscode-input-background));',
      '      border: 1px solid var(--vscode-dropdown-border, var(--vscode-widget-border, rgba(127,127,127,0.25)));',
      '      border-radius: 2px;',
      '      outline: none;',
      '      cursor: pointer;',
      '      appearance: none;',
      '      -webkit-appearance: none;',
      '    }',
      '    select:hover {',
      '      border-color: var(--vscode-focusBorder, var(--vscode-dropdown-border));',
      '    }',
      '    select:focus {',
      '      border-color: var(--vscode-focusBorder);',
      '      outline: 1px solid var(--vscode-focusBorder);',
      '      outline-offset: -1px;',
      '    }',
      '',
      '    /* VS Code native-like button */  ',
      '    button {',
      '      width: 100%;',
      '      height: 26px;',
      '      padding: 4px 14px;',
      '      font-size: 13px;',
      '      font-family: var(--vscode-font-family);',
      '      font-weight: 400;',
      '      color: var(--vscode-button-foreground);',
      '      background-color: var(--vscode-button-background);',
      '      border: none;',
      '      border-radius: 2px;',
      '      cursor: pointer;',
      '      outline: none;',
      '    }',
      '    button:hover {',
      '      background-color: var(--vscode-button-hoverBackground);',
      '    }',
      '    button:focus-visible {',
      '      outline: 1px solid var(--vscode-focusBorder);',
      '      outline-offset: 1px;',
      '    }',
      '',
      '    /* Link-style button */  ',
      '    button.link {',
      '      width: auto;',
      '      height: auto;',
      '      padding: 2px 0;',
      '      margin: 0;',
      '      background: transparent;',
      '      color: var(--vscode-textLink-foreground);',
      '      font-size: 13px;',
      '      text-align: left;',
      '      display: block;',
      '    }',
      '    button.link:hover {',
      '      background: transparent;',
      '      color: var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground));',
      '      text-decoration: underline;',
      '    }',
      '',
      '    .hint {',
      '      font-size: 12px;',
      '      color: var(--vscode-descriptionForeground);',
      '      margin: 2px 0 6px 0;',
      '    }',
      '    .divider {',
      '      height: 1px;',
      '      background: var(--vscode-sideBarSectionHeader-border, var(--vscode-widget-border, transparent));',
      '      margin: 14px 0;',
      '    }',
      '    .section-header {',
      '      font-size: 11px;',
      '      font-weight: 700;',
      '      text-transform: uppercase;',
      '      letter-spacing: 0.04em;',
      '      color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));',
      '      margin-bottom: 8px;',
      '    }',
      '  </style>',
      '</head>',
      '<body>',
      '  <div class="section">',
      '    <div class="row">',
      '      <div class="select-wrap">',
      '        <select id="sourceSelect" aria-label="source">',
      '          <option value="workingTree">未コミット差分</option>',
      '          <option value="latestCommit">最新コミット</option>',
      '          <option value="commitRange">コミット範囲</option>',
      '        </select>',
      '      </div>',
      '    </div>',
      '    <div class="hint" id="optionDesc">Staged / Unstaged の変更を対象</div>',
      '    <div class="row">',
      '      <button class="primary" id="runBtn">テスト生成</button>',
      '    </div>',
      '  </div>',
      '',
      `  <script nonce="${nonce}">`,
      '    const vscode = acquireVsCodeApi();',
      '',
      '    const sourceSelect = document.getElementById("sourceSelect");',
      '    const optionDesc = document.getElementById("optionDesc");',
      '    const runBtn = document.getElementById("runBtn");',
      '',
      '    // 状態管理',
      '    let isRunning = false;',
      '',
      '    const descriptions = {',
      '      workingTree: "Staged / Unstaged の変更を対象",',
      '      latestCommit: "HEAD の変更を対象",',
      '      commitRange: "指定した範囲のコミットを対象"',
      '    };',
      '',
      '    // ボタンの表示を更新',
      '    function updateButtonState(running) {',
      '      isRunning = running;',
      '      if (running) {',
      '        runBtn.textContent = "テスト作成中 (中断)";',
      '        runBtn.style.backgroundColor = "var(--vscode-button-secondaryBackground, #5a5a5a)";',
      '        runBtn.style.color = "var(--vscode-button-secondaryForeground, #fff)";',
      '      } else {',
      '        runBtn.textContent = "テスト生成";',
      '        runBtn.style.backgroundColor = "";',
      '        runBtn.style.color = "";',
      '      }',
      '    }',
      '',
      '    sourceSelect.addEventListener("change", () => {',
      '      optionDesc.textContent = descriptions[sourceSelect.value] || "";',
      '    });',
      '',
      '    runBtn.addEventListener("click", () => {',
      '      if (isRunning) {',
      '        // 実行中の場合はキャンセル',
      '        vscode.postMessage({ type: "cancel" });',
      '      } else {',
      '        // 実行開始',
      '        vscode.postMessage({ type: "run", source: sourceSelect.value });',
      '      }',
      '    });',
      '',
      '    // 拡張機能からのメッセージを受信',
      '    window.addEventListener("message", (event) => {',
      '      const msg = event.data;',
      '      if (msg && msg.type === "stateUpdate") {',
      '        updateButtonState(msg.isRunning);',
      '      }',
      '    });',
      '',
      '    // 初期化時にready送信',
      '    vscode.postMessage({ type: "ready" });',
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

