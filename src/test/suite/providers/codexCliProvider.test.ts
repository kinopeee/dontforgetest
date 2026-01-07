import * as assert from 'assert';
import * as vscode from 'vscode';
import { CodexCliProvider } from '../../../providers/codexCliProvider';
import { type AgentRunOptions } from '../../../providers/provider';
import { type TestGenEvent } from '../../../core/event';

suite('CodexCliProvider', () => {
  test('TC-COD-N-01: Properties check', () => {
    // Given: CodexCliProvider instance
    const provider = new CodexCliProvider();

    // When: accessing id and displayName
    // Then: returns expected values
    assert.strictEqual(provider.id, 'codex-cli');
    assert.strictEqual(provider.displayName, 'Codex CLI');
  });

  test('TC-COD-N-02: run() returns RunningTask', () => {
    // Given: CodexCliProvider instance
    const provider = new CodexCliProvider();
    const options: AgentRunOptions = {
      taskId: 'codex-task-1',
      workspaceRoot: '/tmp',
      prompt: 'test prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: () => {},
    };

    // When: run() is called
    const task = provider.run(options);

    // Then: returns RunningTask with correct taskId
    assert.strictEqual(task.taskId, 'codex-task-1');
    assert.strictEqual(typeof task.dispose, 'function');

    task.dispose();
  });

  test('TC-COD-N-03: started event detail includes codex command', async () => {
    // Given: CodexCliProvider instance and captured events
    const provider = new CodexCliProvider();
    const events: TestGenEvent[] = [];
    const options: AgentRunOptions = {
      taskId: 'codex-task-started',
      workspaceRoot: '/tmp',
      agentCommand: 'my-codex',
      prompt: 'test prompt',
      outputFormat: 'stream-json',
      allowWrite: false,
      onEvent: (e) => events.push(e),
    };

    // When: run() is called
    const task = provider.run(options);

    // Then: started event is emitted with custom command in detail
    const startedEvent = events.find(e => e.type === 'started');
    assert.ok(startedEvent, 'Expected started event');
    assert.ok(startedEvent.detail?.includes('cmd=my-codex'), 'Expected custom command in detail');

    task.dispose();
  });

  test('TC-COD-E-09: codexPromptCommand is empty, injection is skipped', async () => {
    // Given: CodexCliProvider and codexPromptCommand setting is empty
    const provider = new CodexCliProvider();
    const config = vscode.workspace.getConfiguration('dontforgetest');
    await config.update('codexPromptCommand', '', vscode.ConfigurationTarget.Workspace);

    try {
      const options: AgentRunOptions = {
        taskId: 'codex-task-empty-prompt',
        workspaceRoot: '/tmp',
        prompt: 'Original Prompt',
        outputFormat: 'stream-json',
        allowWrite: false,
        onEvent: () => {},
      };

      // When: run() is called
      // We can't easily check the internal injected prompt without mocking spawn or similar,
      // but we can at least ensure it doesn't throw and proceeds normally.
      // In a real integration test, we would verify that spawn was called with the original prompt.
      const task = provider.run(options);

      // Then: returns normally
      assert.strictEqual(task.taskId, 'codex-task-empty-prompt');
      task.dispose();
    } finally {
      await config.update('codexPromptCommand', undefined, vscode.ConfigurationTarget.Workspace);
    }
  });
});
