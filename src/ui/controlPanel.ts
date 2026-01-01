import * as vscode from 'vscode';
import { taskManager } from '../core/taskManager';
import { t } from '../core/l10n';

type PanelRunSource = 'workingTree' | 'latestCommit' | 'commitRange';
type PanelRunLocation = 'local' | 'worktree';
type PanelRunMode = 'full' | 'perspectiveOnly';

type PanelAnalysisTarget = 'all' | 'current';

/** Webviewから拡張機能へのメッセージ */
type WebviewMessage =
  | { type: 'ready' }
  | { type: 'run'; source: PanelRunSource; runLocation: PanelRunLocation; runMode?: PanelRunMode }
  | { type: 'runCommand'; command: AllowedCommand }
  | { type: 'cancel' }
  | { type: 'analyze'; target: PanelAnalysisTarget };

/** 拡張機能からWebviewへのメッセージ */
type ExtensionMessage =
  | { type: 'stateUpdate'; isRunning: boolean; taskCount: number; phaseLabel?: string };

type AllowedCommand =
  | 'dontforgetest.generateTest'
  | 'dontforgetest.generateTestFromCommit'
  | 'dontforgetest.generateTestFromCommitRange'
  | 'dontforgetest.generateTestFromWorkingTree'
  | 'dontforgetest.showTestGeneratorOutput'
  | 'dontforgetest.selectDefaultModel'
  | 'dontforgetest.openLatestPerspective'
  | 'dontforgetest.openLatestExecutionReport'
  | 'dontforgetest.analyzeTests'
  | 'dontforgetest.openLatestAnalysisReport';

interface ControlPanelDeps {
  executeCommand: (command: AllowedCommand, ...args: unknown[]) => Thenable<unknown>;
}

/**
 * サイドバーに表示する TestGen 操作パネル（WebviewView）。
 *
 * 方針:
 * - UI は最小構成（既存コマンド呼び出しに寄せる）
 * - 設定はビュータイトルバーのギアアイコンから開く
 */
export class TestGenControlPanelViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewId = 'dontforgetest.controlPanel';

  private view?: vscode.WebviewView;
  private readonly deps: ControlPanelDeps;
  private readonly stateListener: (isRunning: boolean, taskCount: number, phaseLabel?: string) => void;
  private disposed = false;

  public constructor(
    private readonly context: vscode.ExtensionContext,
    deps: Partial<ControlPanelDeps> = {},
  ) {
    this.deps = { ...createDefaultDeps(), ...deps };

    // タスク状態変更を監視してWebviewに通知
    this.stateListener = (isRunning, taskCount, phaseLabel) => {
      this.sendStateUpdate(isRunning, taskCount, phaseLabel);
    };
    taskManager.addListener(this.stateListener);
  }

  /**
   * リソースを解放する。
   * taskManager のリスナーを解除し、再利用を防ぐ。
   */
  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    taskManager.removeListener(this.stateListener);
    this.view = undefined;
  }

  /**
   * Webviewに状態更新を送信する。
   */
  private sendStateUpdate(isRunning: boolean, taskCount: number, phaseLabel?: string): void {
    if (!this.view) {
      return;
    }
    const message: ExtensionMessage = { type: 'stateUpdate', isRunning, taskCount, phaseLabel };
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
      this.sendStateUpdate(taskManager.isRunning(), taskManager.getRunningCount(), taskManager.getCurrentPhaseLabel());
      return;
    }

    if (msg.type === 'run') {
      const cmd = this.sourceToCommand(msg.source);
      if (!cmd) {
        return;
      }
      const runMode: PanelRunMode = msg.runMode === 'perspectiveOnly' ? 'perspectiveOnly' : 'full';
      // コマンド側で引数を解釈する（未コミット差分は local 固定の想定）
      await this.deps.executeCommand(cmd, { runLocation: msg.runLocation, runMode });
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

    if (msg.type === 'analyze') {
      // 分析コマンドを実行
      // NOTE: Webview からの入力はランタイムでは型保証されないため、妥当性チェックを行う。
      const target = (msg as { target?: unknown }).target;
      if (target !== 'all' && target !== 'current') {
        return;
      }
      await this.deps.executeCommand('dontforgetest.analyzeTests', { target });
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
    const htmlLang = (vscode.env.language || 'en').split('-')[0];

    return [
      '<!DOCTYPE html>',
      `<html lang="${htmlLang}">`,
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
      '    .field { display: flex; flex-direction: column; gap: 2px; }',
      '    .field-label {',
      '      font-size: 11px;',
      '      font-weight: 600;',
      '      color: var(--vscode-descriptionForeground);',
      '      margin: 0;',
      '    }',
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
      '    select:disabled {',
      '      opacity: 0.5;',
      '      cursor: not-allowed;',
      '    }',
      '',
      '    /* VS Code native-like button */  ',
      '    button {',
      '      width: 100%;',
      '      height: 30px;',
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
      '    /* Running state - VS Code テーマ統合 */',
      '    @keyframes pulse-opacity {',
      '      0%, 100% { opacity: 1; }',
      '      50% { opacity: 0.75; }',
      '    }',
      '    @keyframes progress-slide {',
      '      0% { background-position: 0% 0; }',
      '      100% { background-position: 200% 0; }',
      '    }',
      '    button.running {',
      '      position: relative;',
      '      background-color: var(--vscode-button-secondaryBackground);',
      '      color: var(--vscode-button-secondaryForeground);',
      '      border: 1px solid var(--vscode-button-border, var(--vscode-contrastBorder, transparent));',
      '      overflow: hidden;',
      '      animation: pulse-opacity 2s ease-in-out infinite;',
      '    }',
      '    button.running::before {',
      '      content: "";',
      '      position: absolute;',
      '      top: 0;',
      '      left: 0;',
      '      right: 0;',
      '      height: 2px;',
      '      background: linear-gradient(',
      '        90deg,',
      '        transparent 0%,',
      '        var(--vscode-descriptionForeground) 30%,',
      '        var(--vscode-descriptionForeground) 70%,',
      '        transparent 100%',
      '      );',
      '      background-size: 200% 100%;',
      '      animation: progress-slide 1.5s linear infinite;',
      '    }',
      '    button.running:hover {',
      '      background-color: var(--vscode-button-secondaryHoverBackground);',
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
      '',
      '    /* Tab navigation */',
      '    .tab-container {',
      '      display: flex;',
      '      gap: 4px;',
      '      margin-bottom: 16px;',
      '      padding: 4px;',
      '      background: var(--vscode-input-background);',
      '      border: 1px solid var(--vscode-input-border, var(--vscode-widget-border));',
      '      border-radius: 6px;',
      '    }',
      '    .tab-btn {',
      '      flex: 1;',
      '      height: 32px;',
      '      padding: 0 12px;',
      '      font-size: 13px;',
      '      font-family: var(--vscode-font-family);',
      '      font-weight: 500;',
      '      color: var(--vscode-foreground);',
      '      background: transparent;',
      '      border: none;',
      '      border-radius: 4px;',
      '      cursor: pointer;',
      '      opacity: 0.7;',
      '      transition: all 0.15s ease;',
      '      display: flex;',
      '      align-items: center;',
      '      justify-content: center;',
      '    }',
      '    .tab-btn:hover:not(.active) {',
      '      opacity: 1;',
      '      background: var(--vscode-list-hoverBackground);',
      '    }',
      '    .tab-btn.active {',
      '      opacity: 1;',
      '      font-weight: 600;',
      '      color: var(--vscode-button-foreground);',
      '      background: var(--vscode-button-background);',
      '      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);',
      '    }',
      '    .tab-content {',
      '      display: none;',
      '    }',
      '    .tab-content.active {',
      '      display: block;',
      '    }',
      '  </style>',
      '</head>',
      '<body>',
      '  <!-- Tab Navigation -->',
      '  <div class="tab-container">',
      `    <button class="tab-btn active" id="tabGenerate" data-tab="generate">${t('controlPanel.tab.generate')}</button>`,
      `    <button class="tab-btn" id="tabAnalyze" data-tab="analyze">${t('controlPanel.tab.analyze')}</button>`,
      '  </div>',
      '',
      '  <!-- Generate Tab Content -->',
      '  <div class="tab-content active" id="contentGenerate">',
      '    <div class="section">',
      '      <div class="row">',
      '        <div class="field">',
      `          <div class="field-label" title="${t('controlPanel.label.outputTooltip')}">${t('controlPanel.label.output')}</div>`,
      '          <div class="select-wrap">',
      '            <select id="outputSelect" aria-label="output">',
      `              <option value="full" selected>${t('controlPanel.generateTests')}</option>`,
      `              <option value="perspectiveOnly">${t('controlPanel.generatePerspectivesOnly')}</option>`,
      '            </select>',
      '          </div>',
      '        </div>',
      '      </div>',
      '      <div class="row">',
      '        <div class="field">',
      `          <div class="field-label" title="${t('controlPanel.label.sourceTooltip')}">${t('controlPanel.label.source')}</div>`,
      '          <div class="select-wrap">',
      '            <select id="sourceSelect" aria-label="source">',
      `              <option value="workingTree">${t('controlPanel.uncommittedDiff')}</option>`,
      `              <option value="latestCommit">${t('controlPanel.latestCommit')}</option>`,
      `              <option value="commitRange">${t('controlPanel.commitRange')}</option>`,
      '            </select>',
      '          </div>',
      '        </div>',
      '      </div>',
      '      <div class="row">',
      '        <div class="field">',
      `          <div class="field-label" title="${t('controlPanel.label.locationTooltip')}">${t('controlPanel.label.location')}</div>`,
      '          <div class="select-wrap">',
      '            <select id="runLocationSelect" aria-label="runLocation">',
      `              <option value="local">${t('controlPanel.local')}</option>`,
      `              <option value="worktree">${t('controlPanel.worktree')}</option>`,
      '            </select>',
      '          </div>',
      '        </div>',
      '      </div>',
      '      <div class="hint" id="helpLine" style="display:none;"></div>',
      '      <div class="row">',
      `        <button class="primary" id="runBtn">${t('controlPanel.run')}</button>`,
      '      </div>',
      '    </div>',
      '  </div>',
      '',
      '  <!-- Analyze Tab Content -->',
      '  <div class="tab-content" id="contentAnalyze">',
      '    <div class="section">',
      '      <div class="row">',
      '        <div class="field">',
      `          <div class="field-label">${t('controlPanel.analysis.target')}</div>`,
      '          <div class="select-wrap">',
      '            <select id="analysisTargetSelect" aria-label="analysisTarget">',
      `              <option value="all" selected>${t('controlPanel.analysis.allTests')}</option>`,
      `              <option value="current">${t('controlPanel.analysis.currentFile')}</option>`,
      '            </select>',
      '          </div>',
      '        </div>',
      '      </div>',
      '      <div class="row">',
      `        <button id="analyzeBtn">${t('controlPanel.analysis.run')}</button>`,
      '      </div>',
      '    </div>',
      '  </div>',
      '',
      `  <script nonce="${nonce}">`,
      '    const vscode = acquireVsCodeApi();',
      '',
      '    // Tab elements',
      '    const tabGenerate = document.getElementById("tabGenerate");',
      '    const tabAnalyze = document.getElementById("tabAnalyze");',
      '    const contentGenerate = document.getElementById("contentGenerate");',
      '    const contentAnalyze = document.getElementById("contentAnalyze");',
      '',
      '    // Generate tab elements',
      '    const outputSelect = document.getElementById("outputSelect");',
      '    const sourceSelect = document.getElementById("sourceSelect");',
      '    const runLocationSelect = document.getElementById("runLocationSelect");',
      '    const helpLine = document.getElementById("helpLine");',
      '    const runBtn = document.getElementById("runBtn");',
      '',
      '    // Analyze tab elements',
      '    const analysisTargetSelect = document.getElementById("analysisTargetSelect");',
      '    const analyzeBtn = document.getElementById("analyzeBtn");',
      '',
      '    // 状態管理',
      '    let isRunning = false;',
      '    let currentTab = "generate";',
      '    /** 最後にユーザーが操作した項目（ヘルプ1行表示の対象） */',
      '    let activeHelp = null;', // 'output' | 'source' | 'location' | null
      '',
      `    const descriptions = {`,
      `      workingTree: "${t('controlPanel.uncommittedDiffHint')}",`,
      `      latestCommit: "${t('controlPanel.latestCommitHint')}",`,
      `      commitRange: "${t('controlPanel.commitRangeHint')}"`,
      `    };`,
      '',
      `    const runLocationDescriptions = {`,
      `      local: "${t('controlPanel.localHint')}",`,
      `      worktree: "${t('controlPanel.worktreeHint')}"`,
      `    };`,
      '',
      `    const runLocationNotes = {`,
      `      local: "",`,
      `      worktree: "${t('controlPanel.worktreeNote')}"`,
      `    };`,
      '',
      '    function getLockHelpText(source, mode) {',
      '      if (source === "workingTree") {',
      `        return "${t('controlPanel.runLocationLockedWorkingTree')}";`,
      '      }',
      '      if (mode === "perspectiveOnly") {',
      `        return "${t('controlPanel.runLocationLockedPerspectiveOnly')}";`,
      '      }',
      '      return "";',
      '    }',
      '',
      '    function updateHelpLine() {',
      '      if (!helpLine) { return; }',
      '      const source = sourceSelect?.value ?? "workingTree";',
      '      const mode = outputSelect?.value ?? "full";',
      '      const lock = getLockHelpText(source, mode);',
      '      if (lock && lock.trim().length > 0) {',
      '        helpLine.textContent = lock;',
      '        helpLine.style.display = "block";',
      '        return;',
      '      }',
      '      if (!activeHelp) {',
      '        helpLine.textContent = "";',
      '        helpLine.style.display = "none";',
      '        return;',
      '      }',
      '      if (activeHelp === "output") {',
      '        helpLine.textContent = mode === "perspectiveOnly"',
      `          ? "${t('controlPanel.outputHint.perspectiveOnly')}"`,
      `          : "${t('controlPanel.outputHint.full')}";`,
      '        helpLine.style.display = helpLine.textContent ? "block" : "none";',
      '        return;',
      '      }',
      '      if (activeHelp === "source") {',
      '        helpLine.textContent = descriptions[source] || "";',
      '        helpLine.style.display = helpLine.textContent ? "block" : "none";',
      '        return;',
      '      }',
      '      // location',
      '      const value = runLocationSelect?.value ?? "local";',
      '      const desc = runLocationDescriptions[value] || "";',
      '      const note = runLocationNotes[value] || "";',
      '      helpLine.textContent = note ? desc + " " + note : desc;',
      '      helpLine.style.display = helpLine.textContent ? "block" : "none";',
      '    }',
      '',
      '    function updateRunLocationAvailability() {',
      '      const source = sourceSelect.value;',
      '      const runMode = outputSelect?.value ?? "full";',
      '      // 未コミット差分は MVP で Local 固定',
      '      if (source === "workingTree") {',
      '        runLocationSelect.value = "local";',
      '        runLocationSelect.disabled = true;',
      '        updateHelpLine();',
      '        return;',
      '      }',
      '      // 観点表のみ生成は Local 固定（編集を伴わないため）',
      '      if (runMode === "perspectiveOnly") {',
      '        runLocationSelect.value = "local";',
      '        runLocationSelect.disabled = true;',
      '        updateHelpLine();',
      '        return;',
      '      }',
      '      // 通常（full）',
      '      runLocationSelect.disabled = false;',
      '      updateHelpLine();',
      '    }',
      '',
      '    // フェーズ別のボタンラベル',
      `    const phaseButtonLabels = {`,
      `      preparing: "${t('controlPanel.button.preparing')}",`,
      `      perspectives: "${t('controlPanel.button.perspectives')}",`,
      `      generating: "${t('controlPanel.button.generating')}",`,
      `      "running-tests": "${t('controlPanel.button.runningTests')}",`,
      `    };`,
      '',
      '    // ボタンとプルダウンの表示を更新',
      '    function updateButtonState(running, phaseLabel) {',
      '      isRunning = running;',
      `      if (running) {`,
      `        // フェーズラベルがあれば対応するボタンテキストを使用、なければデフォルト`,
      `        const label = phaseLabel && phaseButtonLabels[phaseLabel] ? phaseButtonLabels[phaseLabel] : "${t('controlPanel.generatingTests')}";`,
      `        runBtn.textContent = label;`,
      `        runBtn.classList.add("running");`,
      `        sourceSelect.disabled = true;`,
      `        runLocationSelect.disabled = true;`,
      `        outputSelect.disabled = true;`,
      `      } else {`,
      `        runBtn.textContent = "${t('controlPanel.run')}";`,
      `        runBtn.classList.remove("running");`,
      `        sourceSelect.disabled = false;`,
      `        outputSelect.disabled = false;`,
      '        updateRunLocationAvailability();',
      `      }`,
      '    }',
      '',
      '    sourceSelect.addEventListener("change", () => {',
      '      activeHelp = "source";',
      '      updateRunLocationAvailability();',
      '      updateHelpLine();',
      '    });',
      '',
      '    outputSelect.addEventListener("change", () => {',
      '      activeHelp = "output";',
      '      updateRunLocationAvailability();',
      '      updateHelpLine();',
      '    });',
      '',
      '    runLocationSelect.addEventListener("change", () => {',
      '      activeHelp = "location";',
      '      updateHelpLine();',
      '    });',
      '',
      '    // フォーカスでもヘルプを切り替える（1行だけ表示するため）',
      '    outputSelect.addEventListener("focus", () => { activeHelp = "output"; updateHelpLine(); });',
      '    sourceSelect.addEventListener("focus", () => { activeHelp = "source"; updateHelpLine(); });',
      '    runLocationSelect.addEventListener("focus", () => { activeHelp = "location"; updateHelpLine(); });',
      '',
      '    runBtn.addEventListener("click", () => {',
      '      if (isRunning) {',
      '        // 実行中の場合はキャンセル',
      '        vscode.postMessage({ type: "cancel" });',
      '      } else {',
      '        // 実行開始',
      '        const mode = outputSelect?.value ?? "full";',
      '        vscode.postMessage({ type: "run", source: sourceSelect.value, runLocation: runLocationSelect.value, runMode: mode });',
      '      }',
      '    });',
      '',
      '    // 分析ボタンのクリックイベント',
      '    analyzeBtn.addEventListener("click", () => {',
      '      const target = analysisTargetSelect?.value ?? "all";',
      '      vscode.postMessage({ type: "analyze", target: target });',
      '    });',
      '',
      '    // 拡張機能からのメッセージを受信',
      '    window.addEventListener("message", (event) => {',
      '      const msg = event.data;',
      '      if (msg && msg.type === "stateUpdate") {',
      '        updateButtonState(msg.isRunning, msg.phaseLabel);',
      '      }',
      '    });',
      '',
      '    // Tab switching',
      '    function switchTab(tabName) {',
      '      currentTab = tabName;',
      '      if (tabName === "generate") {',
      '        tabGenerate.classList.add("active");',
      '        tabAnalyze.classList.remove("active");',
      '        contentGenerate.classList.add("active");',
      '        contentAnalyze.classList.remove("active");',
      '      } else {',
      '        tabGenerate.classList.remove("active");',
      '        tabAnalyze.classList.add("active");',
      '        contentGenerate.classList.remove("active");',
      '        contentAnalyze.classList.add("active");',
      '      }',
      '    }',
      '',
      '    tabGenerate.addEventListener("click", () => switchTab("generate"));',
      '    tabAnalyze.addEventListener("click", () => switchTab("analyze"));',
      '',
      '    // 初期化時にready送信',
      '    vscode.postMessage({ type: "ready" });',
      '    updateRunLocationAvailability();',
      '    updateHelpLine();',
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
    executeCommand: async (command, ...args) => await vscode.commands.executeCommand(command, ...args),
  };
}

