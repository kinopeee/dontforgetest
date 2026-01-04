import * as vscode from 'vscode';
import { t } from '../core/l10n';
import { getAgentProviderId, type AgentProviderId } from '../providers/configuredProvider';
import { getModelSettings, getModelCandidatesForProvider, getEffectiveDefaultModel, setDefaultModel } from '../core/modelSettings';

/** Webviewから拡張機能へのメッセージ */
type WebviewMessage =
  | { type: 'ready' }
  | { type: 'setAgentProvider'; agentProvider: AgentProviderId }
  | { type: 'setModel'; model: string };

/** 拡張機能からWebviewへのメッセージ */
type ExtensionMessage =
  | { type: 'configUpdate'; agentProvider: AgentProviderId; modelCandidates: string[]; currentModel: string };

/**
 * エージェント・モデル設定用の独立パネル（WebviewView）。
 */
export class SettingsPanelViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewId = 'dontforgetest.settingsPanel';

  private view?: vscode.WebviewView;
  private disposables: vscode.Disposable[] = [];

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.buildHtml();

    const messageListener = webviewView.webview.onDidReceiveMessage(async (raw: unknown) => {
      const msg = raw as WebviewMessage;
      await this.handleMessage(msg);
    });
    // テストでは onDidReceiveMessage が undefined を返すスタブの場合があるため、防御的に扱う
    if (messageListener && typeof (messageListener as vscode.Disposable).dispose === 'function') {
      this.disposables.push(messageListener);
    }
  }

  public dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.view = undefined;
  }

  private async handleMessage(msg: WebviewMessage): Promise<void> {
    if (!msg || typeof msg !== 'object') {
      return;
    }

    if (msg.type === 'ready') {
      this.sendConfigUpdate();
      return;
    }

    if (msg.type === 'setAgentProvider') {
      const agentProvider = (msg as { agentProvider?: unknown }).agentProvider;
      if (agentProvider !== 'cursorAgent' && agentProvider !== 'claudeCode') {
        return;
      }
      const config = vscode.workspace.getConfiguration('dontforgetest');
      const target = vscode.workspace.workspaceFolders?.length
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
      await config.update('agentProvider', agentProvider, target);
      // 設定更新後にモデル候補を再送信
      this.sendConfigUpdate();
      return;
    }

    if (msg.type === 'setModel') {
      const model = (msg as { model?: unknown }).model;
      if (typeof model !== 'string') {
        return;
      }
      await setDefaultModel(model.trim() || undefined);
      // 設定更新後に UI 側へ同期通知（選択状態の整合性維持）
      this.sendConfigUpdate();
      return;
    }
  }

  /**
   * Webviewに設定状態を送信する。
   */
  private sendConfigUpdate(): void {
    if (!this.view) {
      return;
    }
    const agentProvider = getAgentProviderId();
    const settings = getModelSettings();
    const modelCandidates = getModelCandidatesForProvider(agentProvider, settings);
    // 現在の Provider に対して有効なモデルを取得（候補リストの先頭をデフォルトとして使用）
    const effectiveModel = getEffectiveDefaultModel(agentProvider, settings);
    const currentModel = effectiveModel ?? (modelCandidates.length > 0 ? modelCandidates[0] : '');
    const message: ExtensionMessage = { type: 'configUpdate', agentProvider, modelCandidates, currentModel };
    void this.view.webview.postMessage(message);
  }

  private buildHtml(): string {
    const nonce = getNonce();
    const htmlLang = (vscode.env.language || 'en').split('-')[0];

    return [
      '<!DOCTYPE html>',
      `<html lang="${htmlLang}">`,
      '<head>',
      '  <meta charset="UTF-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      `  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />`,
      '  <title>Settings</title>',
      '  <style>',
      '    * { box-sizing: border-box; }',
      '    html, body { height: auto; min-height: 0; }',
      '    body {',
      '      margin: 0;',
      '      padding: 8px 14px;',
      '      color: var(--vscode-foreground);',
      '      background: transparent;',
      '      font-family: var(--vscode-font-family);',
      '      font-size: var(--vscode-font-size);',
      '      line-height: 1.4;',
      '    }',
      '    .row { margin: 6px 0; }',
      '    .field { display: flex; flex-direction: column; gap: 2px; }',
      '    .field-label {',
      '      font-size: 11px;',
      '      text-transform: uppercase;',
      '      letter-spacing: 0.5px;',
      '      opacity: 0.8;',
      '    }',
      '    .select-wrap {',
      '      position: relative;',
      '    }',
      '    select {',
      '      width: 100%;',
      '      padding: 4px 24px 4px 8px;',
      '      font-size: 13px;',
      '      border: 1px solid var(--vscode-dropdown-border, var(--vscode-contrastBorder, transparent));',
      '      border-radius: 4px;',
      '      background: var(--vscode-dropdown-background);',
      '      color: var(--vscode-dropdown-foreground);',
      '      cursor: pointer;',
      '      appearance: none;',
      '      -webkit-appearance: none;',
      '      -moz-appearance: none;',
      '      background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e");',
      '      background-repeat: no-repeat;',
      '      background-position: right 6px center;',
      '      background-size: 14px;',
      '    }',
      '    select:focus {',
      '      outline: 1px solid var(--vscode-focusBorder);',
      '      outline-offset: -1px;',
      '    }',
      '  </style>',
      '</head>',
      '<body>',
      '  <div class="row">',
      '    <div class="field">',
      `      <div class="field-label">${t('controlPanel.label.agentProvider')}</div>`,
      '      <div class="select-wrap">',
      '        <select id="agentProviderSelect" aria-label="agentProvider">',
      `          <option value="cursorAgent">Cursor CLI</option>`,
      `          <option value="claudeCode">Claude Code</option>`,
      '        </select>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="row">',
      '    <div class="field">',
      `      <div class="field-label">${t('controlPanel.label.model')}</div>`,
      '      <div class="select-wrap">',
      '        <select id="modelSelect" aria-label="model">',
      `          <option value="auto">auto</option>`,
      '        </select>',
      '      </div>',
      '    </div>',
      '  </div>',
      '',
      `  <script nonce="${nonce}">`,
      '    const vscode = acquireVsCodeApi();',
      '',
      '    const agentProviderSelect = document.getElementById("agentProviderSelect");',
      '    const modelSelect = document.getElementById("modelSelect");',
      '',
      '    // Agent Provider 変更イベント',
      '    agentProviderSelect.addEventListener("change", () => {',
      '      vscode.postMessage({ type: "setAgentProvider", agentProvider: agentProviderSelect.value });',
      '    });',
      '',
      '    // Model 変更イベント',
      '    modelSelect.addEventListener("change", () => {',
      '      vscode.postMessage({ type: "setModel", model: modelSelect.value });',
      '    });',
      '',
      '    // モデル候補を更新する関数',
      '    function updateModelCandidates(candidates, currentModel) {',
      '      if (!modelSelect) { return; }',
      '      modelSelect.innerHTML = "";',
      '      for (const m of candidates) {',
      '        const opt = document.createElement("option");',
      '        opt.value = m;',
      '        opt.textContent = m;',
      '        if (m === currentModel) { opt.selected = true; }',
      '        modelSelect.appendChild(opt);',
      '      }',
      '      // currentModel が候補に無い場合は先頭を選択',
      '      if (currentModel && !candidates.includes(currentModel) && candidates.length > 0) {',
      '        modelSelect.value = candidates[0];',
      '      }',
      '    }',
      '',
      '    // 拡張機能からのメッセージを受信',
      '    window.addEventListener("message", (event) => {',
      '      const msg = event.data;',
      '      if (msg && msg.type === "configUpdate") {',
      '        // Agent Provider の選択状態を更新',
      '        if (agentProviderSelect && msg.agentProvider) {',
      '          agentProviderSelect.value = msg.agentProvider;',
      '        }',
      '        // モデル候補を更新',
      '        if (msg.modelCandidates) {',
      '          updateModelCandidates(msg.modelCandidates, msg.currentModel || "");',
      '        }',
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
