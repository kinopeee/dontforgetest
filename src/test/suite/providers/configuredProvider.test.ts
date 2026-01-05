import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  getAgentProviderId,
  createAgentProvider,
  createAgentProviderById,
} from '../../../providers/configuredProvider';
import { CursorAgentProvider } from '../../../providers/cursorAgentProvider';
import { ClaudeCodeProvider } from '../../../providers/claudeCodeProvider';
import { DevinApiProvider } from '../../../providers/devinApiProvider';

suite('configuredProvider', () => {
  // === Test perspective table ===
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-N-01 | agentProvider='claudeCode' | Equivalence – valid value | Returns 'claudeCode' | Claude Code agent selected |
  // | TC-N-02 | agentProvider='cursor' (or 'cursorAgent') | Equivalence – valid value | Returns 'cursorAgent' | Cursor agent selected |
  // | TC-N-03 | agentProvider='devinApi' | Equivalence – valid value | Returns 'devinApi' | Devin API selected |
  // | TC-E-01 | agentProvider undefined | Boundary – undefined | Returns default ('cursorAgent') | Fallback on undefined |
  // | TC-E-02 | agentProvider='' | Boundary – empty string | Returns default ('cursorAgent') | Fallback on empty |
  // | TC-E-03 | agentProvider=null | Boundary – null | Returns default ('cursorAgent') | Fallback on null |
  // | TC-E-04 | agentProvider='invalidProvider' | Equivalence – invalid value | Returns default ('cursorAgent') | Fallback on invalid provider |
  // | TC-E-05 | agentProvider=' ' (whitespace only) | Boundary – whitespace only | Returns default ('cursorAgent') | Fallback on whitespace |
  // | TC-E-06 | agentProvider=123 (number) | Equivalence – type error | Returns default ('cursorAgent') | Fallback on non-string |
  // | TC-B-01 | settings.json missing | Boundary – file missing | Returns default ('cursorAgent') | Handled by VS Code (undefined) |
  // | TC-B-02 | settings.json invalid JSON | Boundary – parse error | Returns default ('cursorAgent') | Handled by VS Code (undefined) |
  // Note: TC-B-01/TC-B-02 are handled by VS Code internally and result in undefined config values, covered by TC-E-01

  let originalValue: string | undefined;

  setup(async () => {
    const config = vscode.workspace.getConfiguration('dontforgetest');
    originalValue = config.get<string>('agentProvider');
  });

  teardown(async () => {
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', originalValue, vscode.ConfigurationTarget.Workspace);
  });

  // TC-N-01: agentProvider='claudeCode' の場合、Claude Code エージェントが選択される
  test('TC-N-01: agentProvider=claudeCode の場合、claudeCode を返す', async () => {
    // Given: agentProvider='claudeCode' を設定
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', 'claudeCode', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId を呼び出す
    const id = getAgentProviderId();

    // Then: 'claudeCode' を返す（Claude Code エージェントが選択される）
    assert.strictEqual(id, 'claudeCode');
  });

  // TC-N-02: agentProvider='cursorAgent' の場合、Cursor エージェントが選択される
  test('TC-N-02: agentProvider=cursorAgent の場合、cursorAgent を返す', async () => {
    // Given: agentProvider='cursorAgent' を設定
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', 'cursorAgent', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId を呼び出す
    const id = getAgentProviderId();

    // Then: 'cursorAgent' を返す（Cursor エージェントが選択される）
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-N-03: agentProvider='devinApi' の場合、Devin API が選択される
  test('TC-N-03: agentProvider=devinApi の場合、devinApi を返す', async () => {
    // Given: agentProvider='devinApi' を設定
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', 'devinApi', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId を呼び出す
    const id = getAgentProviderId();

    // Then: 'devinApi' を返す
    assert.strictEqual(id, 'devinApi');
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

  // TC-N-07: createAgentProviderById('devinApi') は DevinApiProvider を返す
  test('TC-N-07: createAgentProviderById devinApi は DevinApiProvider を返す', () => {
    const provider = createAgentProviderById('devinApi');
    assert.ok(provider instanceof DevinApiProvider);
    assert.strictEqual(provider.id, 'devin-api');
  });

  // TC-E-01: agentProvider 未設定（undefined）の場合、デフォルトを返す
  test('TC-E-01: agentProvider 未設定の場合、cursorAgent を返す', async () => {
    // Given: agentProvider 未設定（undefined）
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', undefined, vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId を呼び出す
    const id = getAgentProviderId();

    // Then: 'cursorAgent' を返す（デフォルトのエージェントプロバイダー）
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-E-02: agentProvider='' の場合、デフォルトを返す
  test('TC-E-02: agentProvider が空文字の場合、cursorAgent を返す', async () => {
    // Given: agentProvider='' を設定（空文字列）
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', '', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId を呼び出す
    const id = getAgentProviderId();

    // Then: 'cursorAgent' を返す（空文字列は無効な値としてデフォルトにフォールバック）
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-E-03: agentProvider=null の場合、デフォルトを返す
  test('TC-E-03: agentProvider が null の場合、cursorAgent を返す', async () => {
    // Given: agentProvider=null を設定
    const config = vscode.workspace.getConfiguration('dontforgetest');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await config.update('agentProvider', null as any, vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId を呼び出す
    const id = getAgentProviderId();

    // Then: 'cursorAgent' を返す（null は無効な値としてデフォルトにフォールバック）
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-E-04: agentProvider='invalidProvider' の場合、デフォルトを返す
  test('TC-E-04: agentProvider が無効なプロバイダー名の場合、cursorAgent を返す', async () => {
    // Given: agentProvider='invalidProvider' を設定（許可されていないプロバイダー名）
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', 'invalidProvider', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId を呼び出す
    const id = getAgentProviderId();

    // Then: 'cursorAgent' を返す（無効なプロバイダー名はデフォルトにフォールバック）
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-E-05: agentProvider=' ' (空白のみ) の場合、デフォルトを返す
  test('TC-E-05: agentProvider が空白のみの場合、cursorAgent を返す', async () => {
    // Given: agentProvider='   ' を設定（空白文字のみ）
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', '   ', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId を呼び出す
    const id = getAgentProviderId();

    // Then: 'cursorAgent' を返す（空白のみは無効な値としてデフォルトにフォールバック）
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-E-06: agentProvider=123 (数値) の場合、デフォルトを返す
  test('TC-E-06: agentProvider が数値の場合、cursorAgent を返す', async () => {
    // Given: agentProvider=123 を設定（文字列以外の型）
    const config = vscode.workspace.getConfiguration('dontforgetest');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await config.update('agentProvider', 123 as any, vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId を呼び出す
    const id = getAgentProviderId();

    // Then: 'cursorAgent' を返す（数値型は無効な値としてデフォルトにフォールバック）
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-B-01/TC-B-02: settings.json ファイルが存在しない、または不正なJSON形式の場合
  // Note: これらのケースはVS Codeが内部で処理し、設定値は undefined として返される
  // そのため、TC-E-01（undefined）のテストでカバーされる
});
