import * as vscode from 'vscode';

/**
 * この関数は拡張機能が有効化されたときに呼ばれます
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('拡張機能 "ide-ext" が有効化されました');

    // "Hello World" コマンドを登録
    const disposable = vscode.commands.registerCommand('ide-ext.helloWorld', () => {
        vscode.window.showInformationMessage('Hello World from IDE Extension!');
    });

    context.subscriptions.push(disposable);
}

/**
 * この関数は拡張機能が無効化されたときに呼ばれます
 */
export function deactivate() {
    console.log('拡張機能 "ide-ext" が無効化されました');
}
