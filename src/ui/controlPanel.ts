import * as vscode from 'vscode';
import { getModelCandidates, getModelSettings, setDefaultModel } from '../core/modelSettings';

type PanelRunSource = 'workingTree' | 'latestCommit' | 'commitRange';

type WebviewMessage =
  | { type: 'ready' }
  | { type: 'run'; source: PanelRunSource }
  | { type: 'runCommand'; command: AllowedCommand }
  | { type: 'setDefaultModel'; model: string | null };

type AllowedCommand =
  | 'testgen-agent.generateTest'
  | 'testgen-agent.generateTestFromCommit'
  | 'testgen-agent.generateTestFromCommitRange'
  | 'testgen-agent.generateTestFromWorkingTree'
  | 'testgen-agent.previewLastRun'
  | 'testgen-agent.rollbackLastRun'
  | 'testgen-agent.showTestGeneratorOutput'
  | 'testgen-agent.selectDefaultModel'
  | 'workbench.action.openSettings';

interface PanelState {
  defaultModel?: string;
  modelCandidates: string[];
}

interface ControlPanelDeps {
  executeCommand: (command: AllowedCommand) => Thenable<unknown>;
  openSettings: () => Thenable<unknown>;
  setDefaultModel: (model: string | undefined) => Promise<void>;
  getPanelState: () => PanelState;
}

/**
 * サイドバーに表示する TestGen 操作パネル（WebviewView）。
 *
 * 方針:
 * - UI は最小構成（既存コマンド呼び出しに寄せる）
 * - モデルは「設定 → 未設定なら自動選択」に統一（動的取得はしない）
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

    webviewView.webview.html = this.buildHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (raw: unknown) => {
      const msg = raw as WebviewMessage;
      await this.handleMessage(msg);
    });

    // 初期状態を送る
    this.postState();

    // 設定変更を UI へ反映
    const disposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('testgen-agent.defaultModel') ||
        e.affectsConfiguration('testgen-agent.customModels')
      ) {
        this.postState();
      }
    });
    this.context.subscriptions.push(disposable);
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    if (!msg || typeof msg !== 'object') {
      return;
    }

    if (msg.type === 'ready') {
      this.postState();
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
      await this.executeAllowedCommand(msg.command);
      return;
    }

    if (msg.type === 'setDefaultModel') {
      // null: 自動選択（未設定）
      if (msg.model === null) {
        await this.deps.setDefaultModel(undefined);
        this.postState();
        return;
      }
      const trimmed = msg.model.trim();
      if (trimmed.length === 0) {
        return;
      }
      await this.deps.setDefaultModel(trimmed);
      this.postState();
      return;
    }
  }

  private async executeAllowedCommand(command: AllowedCommand): Promise<void> {
    if (command === 'workbench.action.openSettings') {
      await this.deps.openSettings();
      return;
    }
    await this.deps.executeCommand(command);
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

  private getPanelState(): PanelState {
    return this.deps.getPanelState();
  }

  private postState(): void {
    if (!this.view) {
      return;
    }
    void this.view.webview.postMessage({ type: 'state', state: this.getPanelState() });
  }

  private buildHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const initial = this.getPanelState();
    const initialJson = JSON.stringify(initial);

    return [
      '<!DOCTYPE html>',
      '<html lang="ja">',
      '<head>',
      '  <meta charset="UTF-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      `  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />`,
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
      '    }',
      '    button {',
      '      cursor: pointer;',
      '      background: var(--vscode-button-background);',
      '      color: var(--vscode-button-foreground);',
      '      border: 1px solid var(--vscode-button-background);',
      '    }',
      '    button.secondary {',
      '      background: transparent;',
      '      color: var(--vscode-foreground);',
      '      border: 1px solid var(--vscode-widget-border, rgba(127,127,127,.3));',
      '    }',
      '    .muted {',
      '      opacity: 0.75;',
      '      font-size: 11px;',
      '      line-height: 1.35;',
      '    }',
      '    .mono {',
      '      font-family: var(--vscode-editor-font-family);',
      '    }',
      '  </style>',
      '</head>',
      '<body>',
      '  <div class="section">',
      '    <div class="title">実行</div>',
      '    <div class="row">',
      '      <select id="sourceSelect" aria-label="source">',
      '        <option value="workingTree">未コミット差分</option>',
      '        <option value="latestCommit">最新コミット差分</option>',
      '        <option value="commitRange">コミット範囲差分</option>',
      '      </select>',
      '    </div>',
      '    <div class="row">',
      '      <button id="runBtn">生成を実行</button>',
      '    </div>',
      '    <div class="row">',
      '      <button class="secondary" id="quickPickBtn">QuickPickで実行</button>',
      '    </div>',
      '    <div class="muted">※ コミット範囲/未コミット差分の詳細は実行時に入力/選択します。</div>',
      '  </div>',
      '',
      '  <div class="section">',
      '    <div class="title">モデル（設定 → 自動選択フォールバック）</div>',
      '    <div class="row">',
      '      <select id="modelSelect" aria-label="model"></select>',
      '    </div>',
      '    <div class="row">',
      '      <button class="secondary" id="openSettingsBtn">設定を開く</button>',
      '    </div>',
      '    <div class="muted">現在の defaultModel: <span class="mono" id="currentModel"></span></div>',
      '  </div>',
      '',
      '  <div class="section">',
      '    <div class="title">差分 / ロールバック</div>',
      '    <div class="row"><button class="secondary" id="previewBtn">直近実行の差分を表示</button></div>',
      '    <div class="row"><button class="secondary" id="rollbackBtn">直近実行をロールバック</button></div>',
      '  </div>',
      '',
      '  <div class="section">',
      '    <div class="title">ログ</div>',
      '    <div class="row"><button class="secondary" id="openLogBtn">出力ログを表示</button></div>',
      '  </div>',
      '',
      `  <script nonce="${nonce}">`,
      '    const vscode = acquireVsCodeApi();',
      `    let state = ${initialJson};`,
      '',
      '    const sourceSelect = document.getElementById("sourceSelect");',
      '    const runBtn = document.getElementById("runBtn");',
      '    const quickPickBtn = document.getElementById("quickPickBtn");',
      '    const modelSelect = document.getElementById("modelSelect");',
      '    const openSettingsBtn = document.getElementById("openSettingsBtn");',
      '    const currentModel = document.getElementById("currentModel");',
      '    const previewBtn = document.getElementById("previewBtn");',
      '    const rollbackBtn = document.getElementById("rollbackBtn");',
      '    const openLogBtn = document.getElementById("openLogBtn");',
      '',
      '    function renderModel() {',
      '      const dm = state.defaultModel ? state.defaultModel : "（未設定: 自動選択）";',
      '      currentModel.textContent = dm;',
      '',
      '      // 既存 options を全消し',
      '      while (modelSelect.firstChild) modelSelect.removeChild(modelSelect.firstChild);',
      '',
      '      const optAuto = document.createElement("option");',
      '      optAuto.value = "__AUTO__";',
      '      optAuto.textContent = "自動選択（未設定）";',
      '      modelSelect.appendChild(optAuto);',
      '',
      '      (state.modelCandidates || []).forEach((m) => {',
      '        const opt = document.createElement("option");',
      '        opt.value = m;',
      '        opt.textContent = m;',
      '        modelSelect.appendChild(opt);',
      '      });',
      '',
      '      if (state.defaultModel) {',
      '        modelSelect.value = state.defaultModel;',
      '      } else {',
      '        modelSelect.value = "__AUTO__";',
      '      }',
      '    }',
      '',
      '    window.addEventListener("message", (event) => {',
      '      const msg = event.data;',
      '      if (!msg || typeof msg !== "object") return;',
      '      if (msg.type === "state") {',
      '        state = msg.state;',
      '        renderModel();',
      '      }',
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
      '    modelSelect.addEventListener("change", () => {',
      '      const v = modelSelect.value;',
      '      if (v === "__AUTO__") {',
      '        vscode.postMessage({ type: "setDefaultModel", model: null });',
      '        return;',
      '      }',
      '      vscode.postMessage({ type: "setDefaultModel", model: v });',
      '    });',
      '',
      '    openSettingsBtn.addEventListener("click", () => {',
      '      vscode.postMessage({ type: "runCommand", command: "workbench.action.openSettings" });',
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
      '',
      '    // 初回レンダリング',
      '    renderModel();',
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
    openSettings: async () => await vscode.commands.executeCommand('workbench.action.openSettings', 'testgen-agent'),
    setDefaultModel: async (model) => await setDefaultModel(model),
    getPanelState: () => {
      const settings = getModelSettings();
      return {
        defaultModel: settings.defaultModel,
        modelCandidates: getModelCandidates(settings),
      };
    },
  };
}

