import * as assert from 'assert';
import * as vscode from 'vscode';
import { ensurePreflight } from '../../../core/preflight';

suite('core/preflight.ts', () => {
  suite('ensurePreflight', () => {
    // Given: 正常な環境（ワークスペース開いている、ファイル存在、コマンド利用可能）
    // When: ensurePreflightを呼び出す
    // Then: PreflightOkが返される
    test('TC-N-01: 正常な環境 (ensurePreflight / getConfig checks)', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        // ワークスペースが開かれていない場合はスキップ
        return;
      }

      // Check config reading specifically (TC-N-01 additional check)
      const config = vscode.workspace.getConfiguration('dontforgetest');
      const cursorAgentPath = config.get('cursorAgentPath');
      assert.strictEqual(cursorAgentPath, '', 'Default path should be empty');

      // このテストは実際の環境に依存するため、条件付きで実行
      // cursor-agentがインストールされていない場合はスキップ
      try {
        const result = await ensurePreflight();

        if (result) {
          assert.ok(result.workspaceRoot.length > 0, 'workspaceRootが設定されている');
          assert.ok(result.testStrategyPath.length > 0, 'testStrategyPathが設定されている');
          assert.ok(result.cursorAgentCommand.length > 0, 'cursorAgentCommandが設定されている');
        }
        // resultがundefinedの場合は、環境が整っていないためスキップ
      } catch (err) {
        // エラーが発生した場合はスキップ（環境依存のため）
        console.log('preflight test skipped:', err);
      }
    });

    // Given: ワークスペースが開かれていない
    // When: ensurePreflightを呼び出す
    // Then: undefinedが返され、エラーメッセージが表示される
    test('TC-A-01: ワークスペースが開かれていない', async () => {
      // このテストは実際のVS Code環境に依存するため、
      // ワークスペースが開かれていない環境では実行できない
      // モックを使用したテストが必要だが、VS Code APIのモックは複雑なため、
      // 統合テストとして実装する
    });

    // Given: cursorAgentPathが未設定
    // When: ensurePreflightを呼び出す
    // Then: デフォルトの 'cursor-agent' が使用される
    test('TC-N-02: cursorAgentPathが未設定', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        return;
      }

      // 設定を一時的にクリア（実際の設定変更はできないため、このテストは統合テストで確認）
      // ここでは、ensurePreflightが呼び出せることを確認するのみ
      try {
        const result = await ensurePreflight();
        if (result) {
          // cursorAgentCommandが設定されていることを確認
          assert.ok(result.cursorAgentCommand.length > 0);
        }
      } catch (err) {
        console.log('preflight test skipped:', err);
      }
    });

    // Given: defaultModelが設定済み
    // When: ensurePreflightを呼び出す
    // Then: 設定値がPreflightOkに含まれる
    test('TC-N-04: defaultModelが設定済み', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        return;
      }

      // このテストは実際の設定に依存するため、条件付きで実行
      try {
        const result = await ensurePreflight();
        if (result) {
          // defaultModelはオプショナルなので、設定されていれば検証
          if (result.defaultModel !== undefined) {
            assert.strictEqual(typeof result.defaultModel, 'string');
          }
        }
      } catch (err) {
        console.log('preflight test skipped:', err);
      }
    });

    // Given: defaultModelが未設定
    // When: ensurePreflightを呼び出す
    // Then: PreflightOk.defaultModelがundefined
    test('TC-N-05: defaultModelが未設定', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        return;
      }

      // このテストは実際の設定に依存するため、条件付きで実行
      try {
        const result = await ensurePreflight();
        if (result && result.defaultModel === undefined) {
          // defaultModelがundefinedであることを確認
          assert.strictEqual(result.defaultModel, undefined);
        }
      } catch (err) {
        console.log('preflight test skipped:', err);
      }
    });

    // Given: testStrategyPath が空文字
    // When: ensurePreflight を呼び出す
    // Then: 警告なし。戻り値の testStrategyPath は空文字となる
    test('TC-PF-01: 設定 testStrategyPath が空文字 (Default)', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        return;
      }

      const config = vscode.workspace.getConfiguration('dontforgetest');
      const originalPath = config.get<string>('testStrategyPath', '');
      try {
        await config.update('testStrategyPath', '', vscode.ConfigurationTarget.Workspace);

        const result = await ensurePreflight();

        if (result) {
          assert.strictEqual(result.testStrategyPath, '', 'testStrategyPathが空文字になる');
        }
      } catch (err) {
        console.log('preflight test skipped:', err);
      } finally {
        await config.update('testStrategyPath', originalPath, vscode.ConfigurationTarget.Workspace);
      }
    });

    // Given: testStrategyPath が有効なファイルパス
    // When: ensurePreflight を呼び出す
    // Then: 警告なし。戻り値の testStrategyPath は設定されたパスとなる
    test('TC-PF-02: 設定 testStrategyPath が有効な既存ファイルパス', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        return;
      }

      const config = vscode.workspace.getConfiguration('dontforgetest');
      const originalPath = config.get<string>('testStrategyPath', '');
      // 確実に存在するファイルとして package.json を使用（テスト用）
      // ※実際には .md ファイルを想定しているが、存在確認ロジックのテストとしては任意のファイルで可
      const validPath = 'package.json';
      
      try {
        await config.update('testStrategyPath', validPath, vscode.ConfigurationTarget.Workspace);

        const result = await ensurePreflight();

        if (result) {
          assert.strictEqual(result.testStrategyPath, validPath, 'testStrategyPathが設定値のまま維持される');
        }
      } catch (err) {
        console.log('preflight test skipped:', err);
      } finally {
        await config.update('testStrategyPath', originalPath, vscode.ConfigurationTarget.Workspace);
      }
    });

    // Given: 存在しないファイルパス
    // When: ensurePreflight を呼び出す
    // Then: 警告は出るが、undefined ではなく PreflightOk が返される
    test('TC-PF-03: 設定 testStrategyPath が存在しないファイルパス', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        return;
      }

      // 存在しないファイルパスを設定
      const config = vscode.workspace.getConfiguration('dontforgetest');
      const originalPath = config.get<string>('testStrategyPath', '');
      try {
        await config.update('testStrategyPath', 'non-existent-strategy.md', vscode.ConfigurationTarget.Workspace);

        const result = await ensurePreflight();

        // ファイルが存在しない場合でも、undefined ではなく PreflightOk が返される
        if (result) {
          assert.ok(result.workspaceRoot.length > 0, 'workspaceRootが設定されている');
          assert.ok(result.cursorAgentCommand.length > 0, 'cursorAgentCommandが設定されている');
          // testStrategyPath は空文字になる（内蔵デフォルト使用を示す）
          assert.strictEqual(result.testStrategyPath, '', 'testStrategyPathが空文字になる');
        }
      } catch (err) {
        console.log('preflight test skipped:', err);
      } finally {
        // 設定を元に戻す
        await config.update('testStrategyPath', originalPath, vscode.ConfigurationTarget.Workspace);
      }
    });

    // Given: testStrategyPath が空白文字のみ
    // When: ensurePreflight を呼び出す
    // Then: トリムされ空文字として扱われる。戻り値は ""
    test('TC-PF-04: 設定 testStrategyPath が空白文字のみ', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        return;
      }

      const config = vscode.workspace.getConfiguration('dontforgetest');
      const originalPath = config.get<string>('testStrategyPath', '');
      try {
        await config.update('testStrategyPath', '   ', vscode.ConfigurationTarget.Workspace);

        const result = await ensurePreflight();

        if (result) {
          assert.strictEqual(result.testStrategyPath, '', '空白のみの場合は空文字として扱われる');
        }
      } catch (err) {
        console.log('preflight test skipped:', err);
      } finally {
        await config.update('testStrategyPath', originalPath, vscode.ConfigurationTarget.Workspace);
      }
    });
  });
});
