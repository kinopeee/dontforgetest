import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  getAgentProviderId,
  createAgentProvider,
  createAgentProviderById,
} from '../../../providers/configuredProvider';
import { CursorAgentProvider } from '../../../providers/cursorAgentProvider';
import { ClaudeCodeProvider } from '../../../providers/claudeCodeProvider';
import { GeminiCliProvider } from '../../../providers/geminiCliProvider';
import { CodexCliProvider } from '../../../providers/codexCliProvider';
import { CopilotCliProvider } from '../../../providers/copilotCliProvider';

suite('configuredProvider', () => {
  // === Test perspective table ===
  // | Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
  // |---------|----------------------|--------------------------------------|-----------------|-------|
  // | TC-N-01 | agentProvider='claudeCode' | Equivalence – valid value | Returns 'claudeCode' | Claude Code agent selected |
  // | TC-N-02 | agentProvider='geminiCli' | Equivalence – valid value | Returns 'geminiCli' | Gemini CLI agent selected |
  // | TC-N-03 | agentProvider='cursor' (or 'cursorAgent') | Equivalence – valid value | Returns 'cursorAgent' | Cursor agent selected |
  // | TC-N-04 | agentProvider='codexCli' | Equivalence – valid value | Returns 'codexCli' | Codex CLI agent selected |
  // | TC-N-05 | agentProvider='copilotCli' | Equivalence – valid value | Returns 'copilotCli' | Copilot CLI agent selected |
  // | TC-N-06 | createAgentProviderById('cursorAgent') | Equivalence – factory | Returns CursorAgentProvider instance | id='cursor-agent' |
  // | TC-N-07 | createAgentProviderById('claudeCode') | Equivalence – factory | Returns ClaudeCodeProvider instance | id='claude-code' |
  // | TC-N-08 | createAgentProviderById('geminiCli') | Equivalence – factory | Returns GeminiCliProvider instance | id='gemini-cli' |
  // | TC-N-09 | createAgentProviderById('codexCli') | Equivalence – factory | Returns CodexCliProvider instance | id='codex-cli' |
  // | TC-N-10 | createAgentProviderById('copilotCli') | Equivalence – factory | Returns CopilotCliProvider instance | id='copilot-cli' |
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

  // TC-N-04
  test('TC-N-04: agentProvider=geminiCli の場合、createAgentProvider は GeminiCliProvider を返す', async () => {
    // Given: agentProvider is set to 'geminiCli'
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', 'geminiCli', vscode.ConfigurationTarget.Workspace);

    // When: createAgentProvider is called
    const provider = createAgentProvider();

    // Then: It returns an instance of GeminiCliProvider
    assert.ok(provider instanceof GeminiCliProvider);
    assert.strictEqual(provider.id, 'gemini-cli');
  });

  // TC-N-01: agentProvider='claudeCode' の場合、Claude Code エージェントが選択される
  test('TC-N-01: agentProvider=claudeCode の場合、claudeCode を返す', async () => {
    // Given: agentProvider is set to 'claudeCode'
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', 'claudeCode', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId is called
    const id = getAgentProviderId();

    // Then: It returns 'claudeCode'
    assert.strictEqual(id, 'claudeCode');
  });

  // TC-N-02: agentProvider='geminiCli' の場合、Gemini CLI エージェントが選択される
  test('TC-N-02: agentProvider=geminiCli の場合、geminiCli を返す', async () => {
    // Given: agentProvider is set to 'geminiCli'
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', 'geminiCli', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId is called
    const id = getAgentProviderId();

    // Then: It returns 'geminiCli'
    assert.strictEqual(id, 'geminiCli');
  });

  // TC-N-03: agentProvider='cursorAgent' の場合、Cursor エージェントが選択される
  test('TC-N-03: agentProvider=cursorAgent の場合、cursorAgent を返す', async () => {
    // Given: agentProvider is set to 'cursorAgent'
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', 'cursorAgent', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId is called
    const id = getAgentProviderId();

    // Then: It returns 'cursorAgent'
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-N-04-ID: agentProvider='codexCli' の場合、Codex CLI エージェントが選択される
  test('TC-N-04-ID: agentProvider=codexCli の場合、codexCli を返す', async () => {
    // Given: agentProvider is set to 'codexCli'
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', 'codexCli', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId is called
    const id = getAgentProviderId();

    // Then: It returns 'codexCli'
    assert.strictEqual(id, 'codexCli');
  });

  // TC-N-05: createAgentProvider() はデフォルトで CursorAgentProvider を返す
  test('TC-N-05: createAgentProvider はデフォルトで CursorAgentProvider を返す', async () => {
    // Given: agentProvider is unset
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', undefined, vscode.ConfigurationTarget.Workspace);

    // When: createAgentProvider is called
    const provider = createAgentProvider();

    // Then: It returns an instance of CursorAgentProvider
    assert.ok(provider instanceof CursorAgentProvider);
    assert.strictEqual(provider.id, 'cursor-agent');
  });

  // TC-N-06: createAgentProviderById('cursorAgent') は CursorAgentProvider を返す
  test('TC-N-06: createAgentProviderById cursorAgent は CursorAgentProvider を返す', () => {
    // Given: providerId is 'cursorAgent'
    // When: createAgentProviderById is called
    const provider = createAgentProviderById('cursorAgent');

    // Then: It returns an instance of CursorAgentProvider
    assert.ok(provider instanceof CursorAgentProvider);
    assert.strictEqual(provider.id, 'cursor-agent');
  });

  // TC-N-07: createAgentProviderById('claudeCode') は ClaudeCodeProvider を返す
  test('TC-N-07: createAgentProviderById claudeCode は ClaudeCodeProvider を返す', () => {
    // Given: providerId is 'claudeCode'
    // When: createAgentProviderById is called
    const provider = createAgentProviderById('claudeCode');

    // Then: It returns an instance of ClaudeCodeProvider
    assert.ok(provider instanceof ClaudeCodeProvider);
    assert.strictEqual(provider.id, 'claude-code');
  });

  // TC-N-08: createAgentProviderById('geminiCli') は GeminiCliProvider を返す
  test('TC-N-08: createAgentProviderById geminiCli は GeminiCliProvider を返す', () => {
    // Given: providerId is 'geminiCli'
    // When: createAgentProviderById is called
    const provider = createAgentProviderById('geminiCli');

    // Then: It returns an instance of GeminiCliProvider
    assert.ok(provider instanceof GeminiCliProvider);
    assert.strictEqual(provider.id, 'gemini-cli');
  });

  // TC-N-09: createAgentProviderById('codexCli') は CodexCliProvider を返す
  test('TC-N-09: createAgentProviderById codexCli は CodexCliProvider を返す', () => {
    // Given: providerId is 'codexCli'
    // When: createAgentProviderById is called
    const provider = createAgentProviderById('codexCli');

    // Then: It returns an instance of CodexCliProvider
    assert.ok(provider instanceof CodexCliProvider);
    assert.strictEqual(provider.id, 'codex-cli');
  });

  // TC-N-10: createAgentProviderById('copilotCli') は CopilotCliProvider を返す
  test('TC-N-10: createAgentProviderById copilotCli は CopilotCliProvider を返す', () => {
    // Given: providerId is 'copilotCli'
    // When: createAgentProviderById is called
    const provider = createAgentProviderById('copilotCli');

    // Then: It returns an instance of CopilotCliProvider
    assert.ok(provider instanceof CopilotCliProvider);
    assert.strictEqual(provider.id, 'copilot-cli');
  });

  // TC-N-05-ID: agentProvider='copilotCli' の場合、Copilot CLI エージェントが選択される
  test('TC-N-05-ID: agentProvider=copilotCli の場合、copilotCli を返す', async () => {
    // Given: agentProvider is set to 'copilotCli'
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', 'copilotCli', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId is called
    const id = getAgentProviderId();

    // Then: It returns 'copilotCli'
    assert.strictEqual(id, 'copilotCli');
  });

  // TC-E-01: agentProvider 未設定（undefined）の場合、デフォルトを返す
  test('TC-E-01: agentProvider 未設定の場合、cursorAgent を返す', async () => {
    // Given: agentProvider is undefined
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', undefined, vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId is called
    const id = getAgentProviderId();

    // Then: It returns the default 'cursorAgent'
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-E-02: agentProvider='' の場合、デフォルトを返す
  test('TC-E-02: agentProvider が空文字の場合、cursorAgent を返す', async () => {
    // Given: agentProvider is an empty string
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', '', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId is called
    const id = getAgentProviderId();

    // Then: It returns the default 'cursorAgent'
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-E-03: agentProvider=null の場合、デフォルトを返す
  test('TC-E-03: agentProvider が null の場合、cursorAgent を返す', async () => {
    // Given: agentProvider is null
    const config = vscode.workspace.getConfiguration('dontforgetest');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await config.update('agentProvider', null as any, vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId is called
    const id = getAgentProviderId();

    // Then: It returns the default 'cursorAgent'
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-E-11
  test('TC-E-11: agentProvider が無効なプロバイダー名の場合、cursorAgent を返す', async () => {
    // Given: agentProvider is set to an invalid provider name
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', 'invalidProvider', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId is called
    const id = getAgentProviderId();

    // Then: It returns the default 'cursorAgent'
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-E-05: agentProvider=' ' (空白のみ) の場合、デフォルトを返す
  test('TC-E-05: agentProvider が空白のみの場合、cursorAgent を返す', async () => {
    // Given: agentProvider is whitespace only
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('agentProvider', '   ', vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId is called
    const id = getAgentProviderId();

    // Then: It returns the default 'cursorAgent'
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-E-06: agentProvider=123 (数値) の場合、デフォルトを返す
  test('TC-E-06: agentProvider が数値の場合、cursorAgent を返す', async () => {
    // Given: agentProvider is set to a number (invalid type)
    const config = vscode.workspace.getConfiguration('dontforgetest');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await config.update('agentProvider', 123 as any, vscode.ConfigurationTarget.Workspace);

    // When: getAgentProviderId is called
    const id = getAgentProviderId();

    // Then: It returns the default 'cursorAgent'
    assert.strictEqual(id, 'cursorAgent');
  });

  // TC-B-01/TC-B-02: settings.json ファイルが存在しない、または不正なJSON形式の場合
  // Note: これらのケースはVS Codeが内部で処理し、設定値は undefined として返される
  // そのため、TC-E-01（undefined）のテストでカバーされる
});
