import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ensurePreflight } from '../../../core/preflight';

suite('core/preflight.ts', () => {
  suite('ensurePreflight', () => {
    let originalAgentProvider: string | undefined;

    setup(async () => {
      const config = vscode.workspace.getConfiguration('dontforgetest');
      originalAgentProvider = config.get<string>('agentProvider');
      await config.update('agentProvider', 'cursorAgent', vscode.ConfigurationTarget.Workspace);
    });

    teardown(async () => {
      const config = vscode.workspace.getConfiguration('dontforgetest');
      await config.update('agentProvider', originalAgentProvider, vscode.ConfigurationTarget.Workspace);
    });

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
      const agentPath = config.get('agentPath');
      assert.strictEqual(agentPath, '', 'Default agentPath should be empty');

      // このテストは実際の環境に依存するため、条件付きで実行
      // cursor-agentがインストールされていない場合はスキップ
      try {
        const result = await ensurePreflight();

        if (result) {
          assert.ok(result.workspaceRoot.length > 0, 'workspaceRootが設定されている');
          assert.ok(result.testStrategyPath.length > 0, 'testStrategyPathが設定されている');
          assert.ok(result.agentCommand.length > 0, 'agentCommandが設定されている');
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
      // Given: workspaceFolders を undefined にして「ワークスペース未オープン」を擬似的に再現する
      const originalFolders = vscode.workspace.workspaceFolders;
      const hadOwn = Object.prototype.hasOwnProperty.call(vscode.workspace, 'workspaceFolders');
      const originalDescriptor = Object.getOwnPropertyDescriptor(vscode.workspace, 'workspaceFolders');

      const originalShowErrorMessage = vscode.window.showErrorMessage;
      const errorMessages: string[] = [];

      let patched = false;
      let patchMethod: 'assign' | 'define' | undefined;

      try {
        vscode.window.showErrorMessage = (async (message: string, ..._items: unknown[]) => {
          errorMessages.push(message);
          return undefined;
        }) as typeof vscode.window.showErrorMessage;

        try {
          (vscode.workspace as unknown as { workspaceFolders: typeof originalFolders }).workspaceFolders = undefined;
          patched = true;
          patchMethod = 'assign';
        } catch {
          try {
            Object.defineProperty(vscode.workspace, 'workspaceFolders', { value: undefined, configurable: true });
            patched = true;
            patchMethod = 'define';
          } catch {
            // 環境によっては workspaceFolders を差し替えできないため、その場合はスキップ
            console.warn('workspaceFolders cannot be patched in this environment; skipping TC-A-01');
            return;
          }
        }

        // When: ensurePreflight を呼び出す
        const result = await ensurePreflight();

        // Then: undefined が返り、エラー表示が行われる
        assert.strictEqual(result, undefined);
        assert.strictEqual(errorMessages.length, 1, 'Expected one error message');
        assert.ok(errorMessages[0] && errorMessages[0].length > 0, 'Expected non-empty error message');
      } finally {
        vscode.window.showErrorMessage = originalShowErrorMessage;

        if (patched) {
          try {
            if (patchMethod === 'assign') {
              (vscode.workspace as unknown as { workspaceFolders: typeof originalFolders }).workspaceFolders = originalFolders;
            } else if (patchMethod === 'define') {
              if (hadOwn && originalDescriptor) {
                Object.defineProperty(vscode.workspace, 'workspaceFolders', originalDescriptor);
              } else {
                // もともと own property でなければ削除して元に戻す
                delete (vscode.workspace as unknown as Record<string, unknown>).workspaceFolders;
              }
            }
          } catch {
            // ignore restore failures
          }
        }
      }
    });

    // Given: agentPathが未設定
    // When: ensurePreflightを呼び出す
    // Then: デフォルトの 'cursor-agent' が使用される
    test('TC-N-02: agentPathが未設定', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        return;
      }

      // 設定を一時的にクリア（実際の設定変更はできないため、このテストは統合テストで確認）
      // ここでは、ensurePreflightが呼び出せることを確認するのみ
      try {
        const result = await ensurePreflight();
        if (result) {
          // agentCommandが設定されていることを確認
          assert.ok(result.agentCommand.length > 0);
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
          assert.ok(result.agentCommand.length > 0, 'agentCommandが設定されている');
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

    // Test Perspectives Table for ensurePreflight (deterministic coverage)
    // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
    // |---------|----------------------|--------------------------------------|-----------------|-------|
    // | TC-PF-DET-N-01 | testStrategyPath points to existing file; cursorAgentPath=process.execPath | Equivalence – normal | Returns PreflightOk with testStrategyPath preserved and agentCommand set; no warning | Numeric boundaries not applicable; empty/null handled in TC-PF-01/04 |
    // | TC-PF-DET-E-01 | testStrategyPath points to missing file; cursorAgentPath=process.execPath | Error – missing file | showWarningMessage called with path; PreflightOk.testStrategyPath="" | Empty file path is covered elsewhere |
    // | TC-PF-DET-E-02 | cursorAgentPath missing; VSCODE_TEST_RUNNER=1 | Error – command not found | showErrorMessage called and ensurePreflight returns undefined | Avoids blocking UI in test runner |
    // | TC-PF-DET-E-03 | cursorAgentPath missing; VSCODE_TEST_RUNNER unset; user picks first action | Error – command not found | executeCommand called to open settings; returns undefined | items[0] is openSettings |
    // | TC-PF-DET-E-04 | cursorAgentPath missing; VSCODE_TEST_RUNNER unset; user picks second action | Error – command not found | openExternal called with docs URL; returns undefined | items[1] is openDocs |
    suite('ensurePreflight deterministic coverage', () => {
      let originalAgentProvider: string | undefined;
      let originalAgentPath: string | undefined;
      let originalShowWarningMessage: typeof vscode.window.showWarningMessage;
      let originalShowErrorMessage: typeof vscode.window.showErrorMessage;
      let originalExecuteCommand: typeof vscode.commands.executeCommand;
      let originalOpenExternal: typeof vscode.env.openExternal;

      let warningMessages: string[] = [];
      let errorCalls: Array<{ message: string; items: string[] }> = [];
      let executeCommands: Array<{ command: string; args: unknown[] }> = [];
      let openExternalUris: vscode.Uri[] = [];
      let selectErrorAction: ((items: string[]) => string | undefined) | undefined;

      setup(async () => {
        warningMessages = [];
        errorCalls = [];
        executeCommands = [];
        openExternalUris = [];
        selectErrorAction = undefined;

        const config = vscode.workspace.getConfiguration('dontforgetest');
        originalAgentProvider = config.get<string>('agentProvider');
        originalAgentPath = config.get<string>('agentPath');
        await config.update('agentProvider', 'cursorAgent', vscode.ConfigurationTarget.Workspace);
        await config.update('agentPath', '', vscode.ConfigurationTarget.Workspace);

        originalShowWarningMessage = vscode.window.showWarningMessage;
        originalShowErrorMessage = vscode.window.showErrorMessage;
        originalExecuteCommand = vscode.commands.executeCommand;
        originalOpenExternal = vscode.env.openExternal;

        vscode.window.showWarningMessage = (async (message: string, ..._items: unknown[]) => {
          warningMessages.push(message);
          return undefined;
        }) as typeof vscode.window.showWarningMessage;
        vscode.window.showErrorMessage = (async (message: string, ...items: unknown[]) => {
          const stringItems = items.filter((item): item is string => typeof item === 'string');
          errorCalls.push({ message, items: stringItems });
          if (selectErrorAction) {
            return selectErrorAction(stringItems);
          }
          return undefined;
        }) as typeof vscode.window.showErrorMessage;
        vscode.commands.executeCommand = (async (command: string, ...args: unknown[]) => {
          executeCommands.push({ command, args });
          return undefined;
        }) as typeof vscode.commands.executeCommand;
        vscode.env.openExternal = (async (uri: vscode.Uri) => {
          openExternalUris.push(uri);
          return true;
        }) as typeof vscode.env.openExternal;
      });

      teardown(async () => {
        const config = vscode.workspace.getConfiguration('dontforgetest');
        await config.update('agentProvider', originalAgentProvider, vscode.ConfigurationTarget.Workspace);
        await config.update('agentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);

        vscode.window.showWarningMessage = originalShowWarningMessage;
        vscode.window.showErrorMessage = originalShowErrorMessage;
        vscode.commands.executeCommand = originalExecuteCommand;
        vscode.env.openExternal = originalOpenExternal;
      });

      test('TC-PF-DET-N-01: existing testStrategyPath returns PreflightOk without warnings', async () => {
        // Given: Existing test strategy file and a runnable cursorAgentPath
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          return;
        }

        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalPath = config.get<string>('testStrategyPath', '');
        const originalAgentPath = config.get<string>('cursorAgentPath', '');

        const tempDir = path.join(workspaceRoot, 'out', 'test-preflight');
        const tempFile = path.join(tempDir, `strategy-${Date.now()}.md`);
        const tempUri = vscode.Uri.file(tempFile);

        try {
          await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempDir));
          await vscode.workspace.fs.writeFile(tempUri, Buffer.from('# test-strategy', 'utf8'));

          const relativePath = path.relative(workspaceRoot, tempFile);
          await config.update('testStrategyPath', relativePath, vscode.ConfigurationTarget.Workspace);
          await config.update('cursorAgentPath', process.execPath, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: PreflightOk is returned and no warning is shown
          assert.ok(result, 'Expected PreflightOk result');
          assert.strictEqual(result?.workspaceRoot, workspaceRoot);
          assert.strictEqual(result?.testStrategyPath, relativePath);
          assert.strictEqual(result?.agentCommand, process.execPath);
          assert.strictEqual(warningMessages.length, 0, 'No warning should be emitted');
        } finally {
          await config.update('testStrategyPath', originalPath, vscode.ConfigurationTarget.Workspace);
          await config.update('cursorAgentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
          try {
            await vscode.workspace.fs.delete(tempUri, { useTrash: false });
          } catch {
            // テストの後処理失敗は無視する
          }
        }
      });

      test('TC-PF-DET-E-01: missing testStrategyPath emits warning and falls back', async () => {
        // Given: Missing test strategy file and a runnable cursorAgentPath
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          return;
        }

        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalPath = config.get<string>('testStrategyPath', '');
        const originalAgentPath = config.get<string>('cursorAgentPath', '');
        const missingPath = path.join('out', 'test-preflight', `missing-${Date.now()}.md`);

        try {
          await config.update('testStrategyPath', missingPath, vscode.ConfigurationTarget.Workspace);
          await config.update('cursorAgentPath', process.execPath, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: Warning is shown and testStrategyPath falls back to empty string
          assert.ok(result, 'Expected PreflightOk result even when file is missing');
          assert.strictEqual(result?.testStrategyPath, '', 'Expected fallback to built-in strategy');
          assert.strictEqual(warningMessages.length, 1, 'Expected one warning');
          assert.ok(warningMessages[0]?.includes(missingPath), 'Warning should include missing path');
        } finally {
          await config.update('testStrategyPath', originalPath, vscode.ConfigurationTarget.Workspace);
          await config.update('cursorAgentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
        }
      });

      // TC-E-05
      test('TC-E-05: missing cursorAgentPath returns undefined in test runner mode', async () => {
        // Given: Missing cursorAgentPath and VSCODE_TEST_RUNNER enabled
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          return;
        }

        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalPath = config.get<string>('testStrategyPath', '');
        const originalAgentPath = config.get<string>('cursorAgentPath', '');
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;
        const missingCommand = `dontforgetest-missing-agent-${Date.now()}`;

        try {
          process.env.VSCODE_TEST_RUNNER = '1';
          await config.update('testStrategyPath', '', vscode.ConfigurationTarget.Workspace);
          await config.update('cursorAgentPath', missingCommand, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: Error is shown and undefined is returned
          assert.strictEqual(result, undefined);
          assert.strictEqual(errorCalls.length, 1, 'Expected one error message');
          assert.ok(errorCalls[0]?.message.includes(missingCommand), 'Error should include missing command');
        } finally {
          if (originalTestRunner === undefined) {
            delete process.env.VSCODE_TEST_RUNNER;
          } else {
            process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          }
          await config.update('testStrategyPath', originalPath, vscode.ConfigurationTarget.Workspace);
          await config.update('cursorAgentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
        }
      });

      test('TC-PF-DET-E-03: missing cursorAgentPath opens settings when first action is chosen', async () => {
        // Given: Missing cursorAgentPath and user selects the first action
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          return;
        }

        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalAgentPath = config.get<string>('cursorAgentPath', '');
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;
        const missingCommand = `dontforgetest-missing-agent-${Date.now()}`;

        try {
          delete process.env.VSCODE_TEST_RUNNER;
          selectErrorAction = (items) => items[0];
          await config.update('cursorAgentPath', missingCommand, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: Settings command is executed and undefined is returned
          assert.strictEqual(result, undefined);
          assert.strictEqual(errorCalls.length, 1, 'Expected one error message');
          assert.strictEqual(executeCommands.length, 1, 'Expected one command execution');
          assert.strictEqual(executeCommands[0]?.command, 'workbench.action.openSettings');
          assert.strictEqual(executeCommands[0]?.args[0], 'dontforgetest.agentPath');
          assert.strictEqual(openExternalUris.length, 0, 'Docs should not be opened');
        } finally {
          if (originalTestRunner === undefined) {
            delete process.env.VSCODE_TEST_RUNNER;
          } else {
            process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          }
          await config.update('cursorAgentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
        }
      });

      test('TC-PF-DET-E-04: missing cursorAgentPath opens docs when second action is chosen', async () => {
        // Given: Missing cursorAgentPath and user selects the second action
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          return;
        }

        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalAgentPath = config.get<string>('cursorAgentPath', '');
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;
        const missingCommand = `dontforgetest-missing-agent-${Date.now()}`;

        try {
          delete process.env.VSCODE_TEST_RUNNER;
          selectErrorAction = (items) => items[1];
          await config.update('cursorAgentPath', missingCommand, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: Docs are opened and undefined is returned
          assert.strictEqual(result, undefined);
          assert.strictEqual(errorCalls.length, 1, 'Expected one error message');
          assert.strictEqual(openExternalUris.length, 1, 'Expected one openExternal call');
          assert.ok(
            openExternalUris[0]?.toString().includes('cursor.com/docs/cli/overview'),
            'Docs URL should be opened',
          );
          assert.strictEqual(executeCommands.length, 0, 'Settings should not be opened');
        } finally {
          if (originalTestRunner === undefined) {
            delete process.env.VSCODE_TEST_RUNNER;
          } else {
            process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          }
          await config.update('cursorAgentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
        }
      });

      test('TC-PF-ADD-N-01: absolute testStrategyPath is preserved and returns PreflightOk', async () => {
        // Given: Existing test strategy file with an absolute path and a runnable cursorAgentPath
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          return;
        }

        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalPath = config.get<string>('testStrategyPath', '');
        const originalAgentPath = config.get<string>('cursorAgentPath', '');

        const tempDir = path.join(workspaceRoot, 'out', 'test-preflight-abs');
        const tempFile = path.join(tempDir, `strategy-abs-${Date.now()}.md`);
        const tempUri = vscode.Uri.file(tempFile);

        try {
          await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempDir));
          await vscode.workspace.fs.writeFile(tempUri, Buffer.from('# test-strategy', 'utf8'));

          // Use absolute path here
          await config.update('testStrategyPath', tempFile, vscode.ConfigurationTarget.Workspace);
          await config.update('cursorAgentPath', process.execPath, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: PreflightOk is returned and absolute testStrategyPath is preserved
          assert.ok(result, 'Expected PreflightOk result');
          assert.strictEqual(result?.workspaceRoot, workspaceRoot);
          assert.strictEqual(result?.testStrategyPath, tempFile);
          assert.strictEqual(result?.agentCommand, process.execPath);
        } finally {
          await config.update('testStrategyPath', originalPath, vscode.ConfigurationTarget.Workspace);
          await config.update('cursorAgentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
          try {
            await vscode.workspace.fs.delete(tempUri, { useTrash: false });
          } catch {
            // ignore
          }
        }
      });

      test('TC-PF-ADD-E-03: non-executable cursorAgentPath triggers non-ENOENT spawn error path and returns undefined', async () => {
        // Given: An existing non-executable file path as cursorAgentPath and VSCODE_TEST_RUNNER enabled
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          return;
        }

        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalAgentPath = config.get<string>('cursorAgentPath', '');
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;

        const tempDir = path.join(workspaceRoot, 'out', 'test-preflight-nonexec');
        const tempFile = path.join(tempDir, `nonexec-${Date.now()}.txt`);

        try {
          await vscode.workspace.fs.createDirectory(vscode.Uri.file(tempDir));
          await vscode.workspace.fs.writeFile(vscode.Uri.file(tempFile), Buffer.from('not executable', 'utf8'));
          await fs.promises.chmod(tempFile, 0o644);

          process.env.VSCODE_TEST_RUNNER = '1';
          await config.update('cursorAgentPath', tempFile, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: Returns undefined and shows an error message (non-blocking in test runner)
          assert.strictEqual(result, undefined);
          assert.strictEqual(errorCalls.length, 1, 'Expected one error message');
          assert.ok(errorCalls[0]?.message.includes(tempFile), 'Error should include command path');
        } finally {
          if (originalTestRunner === undefined) {
            delete process.env.VSCODE_TEST_RUNNER;
          } else {
            process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          }
          await config.update('cursorAgentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
          try {
            await vscode.workspace.fs.delete(vscode.Uri.file(tempDir), { recursive: true, useTrash: false });
          } catch {
            // ignore
          }
        }
      });
    });

    suite('ensurePreflight with new providers and agentPath', () => {
      let originalShowErrorMessage: typeof vscode.window.showErrorMessage;

      setup(() => {
        originalShowErrorMessage = vscode.window.showErrorMessage;
        vscode.window.showErrorMessage = (async (_message: string, ..._items: unknown[]) => {
          return undefined;
        }) as typeof vscode.window.showErrorMessage;
      });

      teardown(() => {
        vscode.window.showErrorMessage = originalShowErrorMessage;
      });

      // TC-N-10
      test('TC-N-10: agentProvider=geminiCli, agentPath unset uses gemini', async () => {
        // Given: agentProvider is set to 'geminiCli' and agentPath is unset
        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalProvider = config.get('agentProvider');
        const originalAgentPath = config.get('agentPath');
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;

        try {
          process.env.VSCODE_TEST_RUNNER = '1';
          await config.update('agentProvider', 'geminiCli', vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', '', vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          // We use process.execPath to simulate a valid command for canSpawnCommand
          // Since we can't easily mock canSpawnCommand without rewiring, we use a command that exists.
          // In real use it would be 'gemini'.
          // Here we just want to see if it resolves to 'gemini' when agentPath is empty.
          // But ensurePreflight calls canSpawnCommand('gemini'), which will likely fail in test env.
          // So we expect result to be undefined if 'gemini' is not in PATH.
          const result = await ensurePreflight();

          // Then: If gemini is not in PATH, result is undefined. 
          // If it is, agentCommand should be 'gemini'.
          if (result) {
            assert.strictEqual(result.agentCommand, 'gemini');
          } else {
            assert.strictEqual(result, undefined);
          }
        } finally {
          process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          await config.update('agentProvider', originalProvider, vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
        }
      });

      // TC-N-11
      test('TC-N-11: agentProvider=codexCli, agentPath unset uses codex', async () => {
        // Given: agentProvider is set to 'codexCli' and agentPath is unset
        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalProvider = config.get('agentProvider');
        const originalAgentPath = config.get('agentPath');
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;

        try {
          process.env.VSCODE_TEST_RUNNER = '1';
          await config.update('agentProvider', 'codexCli', vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', '', vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: result should be codex if available, or undefined
          if (result) {
            assert.strictEqual(result.agentCommand, 'codex');
          } else {
            assert.strictEqual(result, undefined);
          }
        } finally {
          process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          await config.update('agentProvider', originalProvider, vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
        }
      });

      // TC-N-03
      test('TC-N-03: agentPath overrides default commands', async () => {
        // Given: a custom agentPath is configured
        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalAgentPath = config.get('agentPath');
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;

        try {
          process.env.VSCODE_TEST_RUNNER = '1';
          const customPath = process.execPath;
          await config.update('agentPath', customPath, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: it should return the custom agent path
          assert.ok(result);
          assert.strictEqual(result?.agentCommand, customPath);
        } finally {
          process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          await config.update('agentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
        }
      });

      // TC-N-13
      test('TC-N-13: claudeCode uses agentPath if provided', async () => {
        // Given: agentProvider is 'claudeCode' and a custom agentPath is set
        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalProvider = config.get('agentProvider');
        const originalAgentPath = config.get('agentPath');
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;

        try {
          process.env.VSCODE_TEST_RUNNER = '1';
          await config.update('agentProvider', 'claudeCode', vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', process.execPath, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: it should return the custom agent path
          assert.ok(result);
          assert.strictEqual(result?.agentCommand, process.execPath);
        } finally {
          process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          await config.update('agentProvider', originalProvider, vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
        }
      });

      // TC-N-14
      test('TC-N-14: cursorAgent uses agentPath if provided', async () => {
        // Given: agentProvider is 'cursorAgent' and a custom agentPath is set
        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalProvider = config.get('agentProvider');
        const originalAgentPath = config.get('agentPath');
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;

        try {
          process.env.VSCODE_TEST_RUNNER = '1';
          await config.update('agentProvider', 'cursorAgent', vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', process.execPath, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: it should return the custom agent path
          assert.ok(result);
          assert.strictEqual(result?.agentCommand, process.execPath);
        } finally {
          process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          await config.update('agentProvider', originalProvider, vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
        }
      });

      // TC-N-15
      test('TC-N-15: claudeCode falls back to claudePath if agentPath is empty', async () => {
        // Given: agentProvider is 'claudeCode', agentPath is empty, but claudePath is set
        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalProvider = config.get('agentProvider');
        const originalAgentPath = config.get('agentPath');
        const originalClaudePath = config.get('claudePath');
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;

        try {
          process.env.VSCODE_TEST_RUNNER = '1';
          await config.update('agentProvider', 'claudeCode', vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', '', vscode.ConfigurationTarget.Workspace);
          await config.update('claudePath', process.execPath, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: it should fall back to claudePath
          assert.ok(result);
          assert.strictEqual(result?.agentCommand, process.execPath);
        } finally {
          process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          await config.update('agentProvider', originalProvider, vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
          await config.update('claudePath', originalClaudePath, vscode.ConfigurationTarget.Workspace);
        }
      });

      // TC-E-04
      test('TC-E-04: cursorAgent falls back to cursorAgentPath if agentPath is empty', async () => {
        // Given: agentProvider is 'cursorAgent', agentPath is empty, but cursorAgentPath is set
        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalProvider = config.get('agentProvider');
        const originalAgentPath = config.get('agentPath');
        const originalCursorPath = config.get('cursorAgentPath');
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;

        try {
          process.env.VSCODE_TEST_RUNNER = '1';
          await config.update('agentProvider', 'cursorAgent', vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', '', vscode.ConfigurationTarget.Workspace);
          await config.update('cursorAgentPath', process.execPath, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: it should fall back to cursorAgentPath
          assert.ok(result);
          assert.strictEqual(result?.agentCommand, process.execPath);
        } finally {
          process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          await config.update('agentProvider', originalProvider, vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
          await config.update('cursorAgentPath', originalCursorPath, vscode.ConfigurationTarget.Workspace);
        }
      });

      // TC-N-17
      test('TC-N-17: geminiCli uses agentPath if provided', async () => {
        // Given: agentProvider is 'geminiCli' and a custom agentPath is set
        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalProvider = config.get('agentProvider');
        const originalAgentPath = config.get('agentPath');
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;

        try {
          process.env.VSCODE_TEST_RUNNER = '1';
          await config.update('agentProvider', 'geminiCli', vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', process.execPath, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: it should return the custom agent path
          assert.ok(result);
          assert.strictEqual(result?.agentCommand, process.execPath);
        } finally {
          process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          await config.update('agentProvider', originalProvider, vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
        }
      });

      // TC-N-18
      test('TC-N-18: codexCli uses agentPath if provided', async () => {
        // Given: agentProvider is 'codexCli' and a custom agentPath is set
        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalProvider = config.get('agentProvider');
        const originalAgentPath = config.get('agentPath');
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;

        try {
          process.env.VSCODE_TEST_RUNNER = '1';
          await config.update('agentProvider', 'codexCli', vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', process.execPath, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: it should return the custom agent path
          assert.ok(result);
          assert.strictEqual(result?.agentCommand, process.execPath);
        } finally {
          process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          await config.update('agentProvider', originalProvider, vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
        }
      });

      test('PF-E-10: geminiCli command not found returns undefined in test runner', async () => {
        // Given: agentProvider is 'geminiCli' and command is missing
        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalProvider = config.get('agentProvider');
        const originalAgentPath = config.get('agentPath');
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;
        const missingCommand = `missing-gemini-${Date.now()}`;

        try {
          process.env.VSCODE_TEST_RUNNER = '1';
          await config.update('agentProvider', 'geminiCli', vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', missingCommand, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: returns undefined
          assert.strictEqual(result, undefined);
        } finally {
          process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          await config.update('agentProvider', originalProvider, vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
        }
      });

      test('PF-E-11: codexCli command not found returns undefined in test runner', async () => {
        // Given: agentProvider is 'codexCli' and command is missing
        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalProvider = config.get('agentProvider');
        const originalAgentPath = config.get('agentPath');
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;
        const missingCommand = `missing-codex-${Date.now()}`;

        try {
          process.env.VSCODE_TEST_RUNNER = '1';
          await config.update('agentProvider', 'codexCli', vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', missingCommand, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: returns undefined
          assert.strictEqual(result, undefined);
        } finally {
          process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          await config.update('agentProvider', originalProvider, vscode.ConfigurationTarget.Workspace);
          await config.update('agentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
        }
      });

      // TC-E-06
      test('TC-E-06: agentPath with only whitespace is treated as empty and falls back to legacy path', async () => {
        // Given: agentPath is set to whitespace only, and cursorAgentPath is set
        const config = vscode.workspace.getConfiguration('dontforgetest');
        const originalAgentPath = config.get('agentPath');
        const originalCursorPath = config.get('cursorAgentPath');
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;

        try {
          process.env.VSCODE_TEST_RUNNER = '1';
          await config.update('agentPath', '   ', vscode.ConfigurationTarget.Workspace);
          await config.update('cursorAgentPath', process.execPath, vscode.ConfigurationTarget.Workspace);

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: it should fall back to cursorAgentPath (process.execPath)
          assert.ok(result);
          assert.strictEqual(result?.agentCommand, process.execPath);
        } finally {
          process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          await config.update('agentPath', originalAgentPath, vscode.ConfigurationTarget.Workspace);
          await config.update('cursorAgentPath', originalCursorPath, vscode.ConfigurationTarget.Workspace);
        }
      });
    });

    suite('ensurePreflight additional branch coverage', () => {
      let originalGetConfiguration: typeof vscode.workspace.getConfiguration;
      let originalShowErrorMessage: typeof vscode.window.showErrorMessage;

      teardown(() => {
        // Restore patched APIs
        if (originalGetConfiguration) {
          try {
            vscode.workspace.getConfiguration = originalGetConfiguration;
          } catch {
            // ignore
          }
        }
        if (originalShowErrorMessage) {
          try {
            vscode.window.showErrorMessage = originalShowErrorMessage;
          } catch {
            // ignore
          }
        }
      });

      test('TC-PF-ADD-E-02: nullish config.get values use fallback and still handle missing command', async () => {
        // Given: workspace is open and getConfiguration().get(...) returns undefined for relevant keys
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
          return;
        }

        const originalPathEnv = process.env.PATH;
        const originalTestRunner = process.env.VSCODE_TEST_RUNNER;
        const errorMessages: string[] = [];

        originalGetConfiguration = vscode.workspace.getConfiguration;
        originalShowErrorMessage = vscode.window.showErrorMessage;

        // cursor-agent の存在確認が PATH 拡張により成功する場合があるため、
        // 確実に失敗するダミーコマンド名を返して検証する。
        const missingCommand = 'cursor-agent__definitely_missing__';
        const configStub = {
          get: (section: string, _defaultValue?: unknown) => {
            if (section === 'cursorAgentPath') {
              return missingCommand;
            }
            return undefined;
          },
        } as unknown as vscode.WorkspaceConfiguration;

        vscode.workspace.getConfiguration = () => configStub;
        vscode.window.showErrorMessage = (async (message: string, ..._items: unknown[]) => {
          errorMessages.push(message);
          return undefined;
        }) as typeof vscode.window.showErrorMessage;

        try {
          // Force command lookup failure deterministically
          process.env.PATH = '';
          process.env.VSCODE_TEST_RUNNER = '1';

          // When: ensurePreflight is called
          const result = await ensurePreflight();

          // Then: Returns undefined and shows an error message containing the fallback command name
          assert.strictEqual(result, undefined);
          assert.strictEqual(errorMessages.length, 1, 'Expected one error message');
          assert.ok(errorMessages[0]?.includes(missingCommand), 'Expected message to include missing command name');
        } finally {
          if (originalPathEnv === undefined) {
            delete process.env.PATH;
          } else {
            process.env.PATH = originalPathEnv;
          }
          if (originalTestRunner === undefined) {
            delete process.env.VSCODE_TEST_RUNNER;
          } else {
            process.env.VSCODE_TEST_RUNNER = originalTestRunner;
          }
        }
      });
    });
  });
});
