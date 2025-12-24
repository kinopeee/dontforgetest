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

  // --- Control Panel (UI/Logic) ---

  // TC-UI-01: Webview初期表示
  // Given: WebviewViewが解決される
  // When: HTMLが生成される
  // Then: ソース選択の初期値が workingTree であり、説明文が表示されていること
  test('TC-UI-01: Webview初期表示 - ソース選択と説明文', () => {
    resolveView();
    const html = webviewView.webview.html;
    
    // workingTree が option の先頭にあるか（デフォルト選択）
    assert.ok(html.includes('<option value="workingTree">未コミット差分</option>'), 'workingTreeオプションが存在する');
    // optionDesc の初期値はHTMLには埋め込まれており、JSで動的にセットされる前の静的HTMLを確認
    assert.ok(html.includes('<div class="option-desc" id="optionDesc">git add していない変更を対象</div>'), '初期説明文が表示されている');
  });

  // TC-UI-02: ソース選択を latestCommit に変更
  // Given: Webview内のJS
  // When: ソース選択が変更される
  // Then: 説明文が動的に更新されるロジックが含まれていること
  test('TC-UI-02: ソース選択変更 (latestCommit) のロジック確認', () => {
    resolveView();
    const html = webviewView.webview.html;

    // JSコード内に descriptions 定義が含まれているか
    assert.ok(html.includes('latestCommit: "HEAD の変更を対象"'), 'latestCommit用の説明文定義が含まれる');
    
    // change イベントリスナーが含まれているか
    assert.ok(html.includes('sourceSelect.addEventListener("change"'), 'changeイベントリスナーが含まれる');
    assert.ok(html.includes('optionDesc.textContent = descriptions[sourceSelect.value]'), '説明文更新ロジックが含まれる');
  });

  // TC-UI-03: ソース選択を commitRange に変更
  // Given: Webview内のJS
  // When: ソース選択が変更される
  // Then: 説明文が動的に更新されるロジックが含まれていること
  test('TC-UI-03: ソース選択変更 (commitRange) のロジック確認', () => {
    resolveView();
    const html = webviewView.webview.html;
    
    // JSコード内に descriptions 定義が含まれているか
    assert.ok(html.includes('commitRange: "指定した範囲のコミットを対象"'), 'commitRange用の説明文定義が含まれる');
  });

  // TC-UI-04: ソース選択に定義外の値が設定される場合
  // Given: Webview内のJS
  // When: descriptionsにない値が選択された場合
  // Then: 空文字またはエラーにならないロジックになっていること
  test('TC-UI-04: 定義外の値に対する堅牢性確認', () => {
    resolveView();
    const html = webviewView.webview.html;
    
    // フォールバック処理 ( || "") があるか
    assert.ok(html.includes('descriptions[sourceSelect.value] || ""'), '未定義値へのフォールバックが含まれる');
  });

  // TC-UI-05: 「テスト生成」ボタンクリック
  // Given: Webview内のJS
  // When: runBtn がクリックされる
  // Then: vscode.postMessage が type: "run" と source を送信すること
  test('TC-UI-05: テスト生成ボタンクリック時の処理確認', () => {
    resolveView();
    const html = webviewView.webview.html;
    
    assert.ok(html.includes('runBtn.addEventListener("click"'), 'runBtnのクリックリスナーが含まれる');
    assert.ok(html.includes('vscode.postMessage({ type: "run", source: sourceSelect.value })'), '正しいメッセージ送信処理が含まれる');
  });

  // TC-UI-06: アコーディオンメニュー（成果物）の開閉
  // Given: Webview HTML
  // When: details タグがレンダリングされる
  // Then: summary と content が正しく構造化されていること
  test('TC-UI-06: アコーディオンメニューの構造確認', () => {
    resolveView();
    const html = webviewView.webview.html;
    
    assert.ok(html.includes('<details class="section">'), 'detailsタグが存在する');
    assert.ok(html.includes('<summary><span class="chevron">›</span> 成果物</summary>'), 'summaryタグとシェブロンが存在する');
    // CSSで chevron の回転アニメーションが定義されているか
    assert.ok(html.includes('details.section[open] summary .chevron {'), '開閉時のCSSが含まれる');
    assert.ok(html.includes('transform: rotate(90deg);'), '90度回転スタイルが含まれる');
  });

  // TC-UI-07: セカンダリボタン（QuickPick等）のスタイル
  // Given: Webview CSS
  // When: ボタンにスタイルが適用される
  // Then: ホバー時のフィルタ解除などが定義されていること
  test('TC-UI-07: ボタンのスタイル定義確認', () => {
    resolveView();
    const html = webviewView.webview.html;
    
    assert.ok(html.includes('button.secondary:hover {'), 'セカンダリボタンのホバースタイル定義がある');
    assert.ok(html.includes('filter: none;'), 'filter: none が適用されている');
    assert.ok(html.includes('button:hover {'), '共通のボタンホバースタイル定義がある');
    assert.ok(html.includes('filter: brightness(1.1);'), 'brightness調整が含まれる');
  });

  // --- 既存のサーバーサイドロジックテスト（維持） ---

  // Given: 初期化済み
  // When: readyメッセージを受信する
  // Then: エラーなく処理される
  test('TC-CP-OLD-01: readyメッセージ処理', async () => {
    resolveView();

    // 状態は送信されないが、エラーにならないことを確認
    await webviewView.webview._onMessage?.({ type: 'ready' });

    // 何も実行されない
    assert.strictEqual(executedCommands.length, 0);
  });

  // Given: 初期化済み
  // When: runメッセージ (workingTree) を受信する
  // Then: generateTestFromWorkingTreeコマンドが実行される
  test('TC-CP-OLD-02: runメッセージ (workingTree)', async () => {
    resolveView();
    
    await webviewView.webview._onMessage?.({ type: 'run', source: 'workingTree' });

    assert.strictEqual(executedCommands.length, 1);
    assert.strictEqual(executedCommands[0], 'dontforgetest.generateTestFromWorkingTree');
  });

  // Given: 初期化済み
  // When: runメッセージ (latestCommit) を受信する
  // Then: generateTestFromCommitコマンドが実行される
  test('TC-CP-OLD-03: runメッセージ (latestCommit)', async () => {
    resolveView();
    
    await webviewView.webview._onMessage?.({ type: 'run', source: 'latestCommit' });

    assert.strictEqual(executedCommands[0], 'dontforgetest.generateTestFromCommit');
  });

  // Given: 初期化済み
  // When: runCommandメッセージを受信する
  // Then: 指定されたコマンドが実行される
  test('TC-CP-OLD-04: runCommandメッセージ', async () => {
    resolveView();
    
    await webviewView.webview._onMessage?.({ type: 'runCommand', command: 'dontforgetest.generateTest' });

    assert.strictEqual(executedCommands[0], 'dontforgetest.generateTest');
  });

  // Given: 初期化済み
  // When: 不正なメッセージを受信する
  // Then: エラーにならず無視される
  test('TC-CP-OLD-05: 不正なメッセージ', async () => {
    resolveView();
    
    await webviewView.webview._onMessage?.(null);
    await webviewView.webview._onMessage?.({ type: 'unknown' });

    assert.strictEqual(executedCommands.length, 0);
  });
});
