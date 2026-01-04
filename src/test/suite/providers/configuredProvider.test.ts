import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  getAgentProviderId,
  createAgentProvider,
  createAgentProviderById,
} from '../../../providers/configuredProvider';
import { CursorAgentProvider } from '../../../providers/cursorAgentProvider';
import { ClaudeCodeProvider } from '../../../providers/claudeCodeProvider';

suite('configuredProvider', () => {
  // === Test perspective table ===
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-N-01 | agentProvider unset | Equivalence – default | Returns 'cursorAgent' | - |
  // | TC-N-02 | agentProvider='cursorAgent' | Equivalence – explicit setting | Returns 'cursorAgent' | - |
  // | TC-N-03 | agentProvider='claudeCode' | Equivalence – Claude setting | Returns 'claudeCode' | - |
  // | TC-N-04 | createAgentProvider() | Equivalence – default factory | Returns CursorAgentProvider | - |
  // | TC-N-05 | createAgentProviderById('cursorAgent') | Equivalence | Returns CursorAgentProvider | - |
  // | TC-N-06 | createAgentProviderById('claudeCode') | Equivalence | Returns ClaudeCodeProvider | - |
  // | TC-B-01 | agentProvider='' | Boundary – empty string | Returns 'cursorAgent' | - |
  // | TC-E-01 | agentProvider='invalid' | Error – invalid value | Returns 'cursorAgent' | - |

  let originalValue: string | undefined;

  setup(async () => {
    const config = vscode.workspace.getConfiguration('dontforgetest');
    originalValue = config.get<string>('agentProvider');
  });

  teardown(async () => {
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', originalValue, vscode.ConfigurationTarget.Workspace);
  });

  // TC-N-01: agentProvider 未設定の場合、'cursorAgent' を返す
  test('TC-N-01: agentProvider 未設定の場合、cursorAgent を返す', async () => {
    // Given: agentProvider 未設定（デフォルト値）
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', undefined, vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId を呼び出す
    const id = getAgentProviderId();

    // Then: 'cursorAgent' を返す
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-N-02: agentProvider='cursorAgent' の場合
  test('TC-N-02: agentProvider=cursorAgent の場合、cursorAgent を返す', async () => {
    // Given: agentProvider='cursorAgent' を設定
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', 'cursorAgent', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId を呼び出す
    const id = getAgentProviderId();

    // Then: 'cursorAgent' を返す
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-N-03: agentProvider='claudeCode' の場合
  test('TC-N-03: agentProvider=claudeCode の場合、claudeCode を返す', async () => {
    // Given: agentProvider='claudeCode' を設定
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', 'claudeCode', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId を呼び出す
    const id = getAgentProviderId();

    // Then: 'claudeCode' を返す
    assert.strictEqual(id, 'claudeCode');
  });

  // TC-N-04: createAgentProvider() はデフォルトで CursorAgentProvider を返す
  test('TC-N-04: createAgentProvider はデフォルトで CursorAgentProvider を返す', async () => {
    // Given: agentProvider 未設定
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', undefined, vscode.ConfigurationTarget.Workspace);

    // When: createAgentProvider を呼び出す
    const provider = createAgentProvider();

    // Then: CursorAgentProvider を返す
    assert.ok(provider instanceof CursorAgentProvider);
    assert.strictEqual(provider.id, 'cursor-agent');
  });

  // TC-N-05: createAgentProviderById('cursorAgent') は CursorAgentProvider を返す
  test('TC-N-05: createAgentProviderById cursorAgent は CursorAgentProvider を返す', () => {
    // Given: 'cursorAgent' を指定
    // When: createAgentProviderById を呼び出す
    const provider = createAgentProviderById('cursorAgent');

    // Then: CursorAgentProvider を返す
    assert.ok(provider instanceof CursorAgentProvider);
    assert.strictEqual(provider.id, 'cursor-agent');
  });

  // TC-N-06: createAgentProviderById('claudeCode') は ClaudeCodeProvider を返す
  test('TC-N-06: createAgentProviderById claudeCode は ClaudeCodeProvider を返す', () => {
    // Given: 'claudeCode' を指定
    // When: createAgentProviderById を呼び出す
    const provider = createAgentProviderById('claudeCode');

    // Then: ClaudeCodeProvider を返す
    assert.ok(provider instanceof ClaudeCodeProvider);
    assert.strictEqual(provider.id, 'claude-code');
  });

  // TC-B-01: agentProvider='' の場合、'cursorAgent' を返す
  test('TC-B-01: agentProvider が空文字の場合、cursorAgent を返す', async () => {
    // Given: agentProvider='' を設定
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', '', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId を呼び出す
    const id = getAgentProviderId();

    // Then: 'cursorAgent' を返す（フォールバック）
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-E-01: agentProvider='invalid' の場合、'cursorAgent' を返す
  test('TC-E-01: agentProvider が無効値の場合、cursorAgent を返す', async () => {
    // Given: agentProvider='invalid' を設定
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', 'invalid', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId を呼び出す
    const id = getAgentProviderId();

    // Then: 'cursorAgent' を返す（フォールバック）
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-B-02: agentProvider=undefined (Boundary – undefined case is same as TC-N-01)
  // Note: This case is covered by TC-N-01 which explicitly sets undefined

  // TC-B-03: agentProvider=' claudeCode ' (Boundary – whitespace)
  test('TC-B-03: agentProvider が前後空白付きの claudeCode の場合、claudeCode を返す', async () => {
    // Given: agentProvider=' claudeCode ' を設定 (leading/trailing whitespace)
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', ' claudeCode ', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId を呼び出す
    const id = getAgentProviderId();

    // Then: 'claudeCode' を返す (trimmed to match)
    assert.strictEqual(id, 'claudeCode');
  });
});
