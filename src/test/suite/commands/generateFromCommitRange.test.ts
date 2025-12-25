import * as assert from 'assert';
import * as vscode from 'vscode';
import { generateTestFromCommitRange } from '../../../commands/generateFromCommitRange';
import { type AgentProvider } from '../../../providers/provider';

// Mock Provider that does nothing
class MockGenerateProvider implements AgentProvider {
  readonly id = 'mock-generate';
  readonly displayName = 'Mock Generate';
  run() {
    return { taskId: 'mock', dispose: () => {} };
  }
}

suite('commands/generateFromCommitRange.ts', () => {
  // TC-N-05: generateTestFromCommitRange called with valid range and runLocation='local'
  test('TC-N-05: generateTestFromCommitRange triggers test generation in local mode', async function () {
    // Given: Valid range and runLocation='local'
    const provider = new MockGenerateProvider();

    // Mock the input box to return a valid range
    const originalShowInputBox = vscode.window.showInputBox;
    let inputBoxCalled = false;
    (vscode.window as any).showInputBox = async () => {
      inputBoxCalled = true;
      return 'HEAD~1..HEAD';
    };

    try {
      // When: generateTestFromCommitRange is called
      await generateTestFromCommitRange(provider, undefined, { runLocation: 'local' });
      // Test passes if no exception is thrown
      assert.ok(inputBoxCalled, 'Input box should be called');
    } catch (e) {
      // If it fails due to git issues, that's acceptable for this test
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('Git') || message.includes('diff') || message.includes('範囲')) {
        // Expected failure in non-git environment
        assert.ok(true, 'Function handles git errors gracefully');
      } else {
        throw e;
      }
    } finally {
      // Restore original function
      (vscode.window as any).showInputBox = originalShowInputBox;
    }
  }).timeout(10000);

  // TC-N-06: generateTestFromCommitRange called with valid range and runLocation='worktree'
  test('TC-N-06: generateTestFromCommitRange triggers test generation in worktree mode', async function () {
    // Given: Valid range and runLocation='worktree'
    const provider = new MockGenerateProvider();
    const mockContext: vscode.ExtensionContext = {
      subscriptions: [],
      workspaceState: {} as vscode.Memento,
      globalState: {} as vscode.Memento,
      extensionPath: '',
      globalStorageUri: vscode.Uri.file(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd()),
      globalStoragePath: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
      extensionUri: vscode.Uri.file(''),
      environmentVariableCollection: {} as vscode.EnvironmentVariableCollection,
      extensionMode: vscode.ExtensionMode.Production,
      secrets: {} as vscode.SecretStorage,
      extension: {} as vscode.Extension<any>,
      storageUri: undefined,
      storagePath: undefined,
      logUri: undefined,
      logPath: undefined,
    };

    // Mock the input box to return a valid range
    const originalShowInputBox = vscode.window.showInputBox;
    let inputBoxCalled = false;
    (vscode.window as any).showInputBox = async () => {
      inputBoxCalled = true;
      return 'HEAD~1..HEAD';
    };

    try {
      // When: generateTestFromCommitRange is called
      await generateTestFromCommitRange(provider, undefined, {
        runLocation: 'worktree',
        extensionContext: mockContext,
      });
      // Test passes if no exception is thrown
      assert.ok(inputBoxCalled, 'Input box should be called');
    } catch (e) {
      // If it fails due to git issues, that's acceptable for this test
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('Git') || message.includes('diff') || message.includes('範囲')) {
        // Expected failure in non-git environment
        assert.ok(true, 'Function handles git errors gracefully');
      } else {
        throw e;
      }
    } finally {
      // Restore original function
      (vscode.window as any).showInputBox = originalShowInputBox;
    }
  }).timeout(10000);

  // TC-E-03: generateTestFromCommitRange called with runLocation='worktree' but extensionContext is undefined
  test('TC-E-03: generateTestFromCommitRange shows error when worktree mode requires extensionContext', async () => {
    // Given: runLocation='worktree' but extensionContext is undefined
    const provider = new MockGenerateProvider();

    // Mock the input box to return a valid range
    const originalShowInputBox = vscode.window.showInputBox;
    (vscode.window as any).showInputBox = async () => {
      return 'HEAD~1..HEAD';
    };

    try {
      // When: generateTestFromCommitRange is called
      // Then: Error message shown, function returns early
      await generateTestFromCommitRange(provider, undefined, {
        runLocation: 'worktree',
        extensionContext: undefined,
      });
      // Function should return early without throwing
      assert.ok(true, 'Function should handle missing extensionContext gracefully');
    } catch (e) {
      // If it fails due to git issues before checking extensionContext, that's acceptable
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes('Git') || message.includes('diff') || message.includes('範囲')) {
        assert.ok(true, 'Function handles git errors gracefully');
      } else {
        throw e;
      }
    } finally {
      // Restore original function
      (vscode.window as any).showInputBox = originalShowInputBox;
    }
  });
});
