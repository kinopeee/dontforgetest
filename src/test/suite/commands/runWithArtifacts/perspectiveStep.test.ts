import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { runPerspectiveTableStep } from '../../../commands/runWithArtifacts/perspectiveStep';
import { type AgentProvider, type AgentRunOptions, type RunningTask } from '../../../providers/provider';
import { type TestGenEvent } from '../../../core/event';

// Mock Provider
class MockPerspectiveProvider implements AgentProvider {
  readonly id = 'mock-perspective';
  readonly displayName = 'Mock Perspective';
  private exitCode: number | null = 0;
  private output: string;

  constructor(exitCode: number | null = 0, output?: string) {
    this.exitCode = exitCode;
    this.output =
      output ??
      '<!-- BEGIN TEST PERSPECTIVES JSON -->\n{"version":1,"cases":[{"caseId":"TC-N-01","inputPrecondition":"cond","perspective":"Equivalence – normal","expectedResult":"ok","notes":"-"}]}\n<!-- END TEST PERSPECTIVES JSON -->';
  }

  run(options: AgentRunOptions): RunningTask {
    setTimeout(() => {
      options.onEvent({
        type: 'started',
        taskId: options.taskId,
        label: 'perspectives',
        timestampMs: Date.now(),
      });
      options.onEvent({
        type: 'log',
        taskId: options.taskId,
        level: 'info',
        message: this.output,
        timestampMs: Date.now(),
      });
      options.onEvent({
        type: 'completed',
        taskId: options.taskId,
        exitCode: this.exitCode,
        timestampMs: Date.now(),
      });
    }, 10);
    return { taskId: options.taskId, dispose: () => {} };
  }
}

suite('commands/runWithArtifacts/perspectiveStep.ts', () => {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  // TC-N-09: runPerspectiveTableStep called with valid parameters and successful JSON extraction
  test('TC-N-09: runPerspectiveTableStep generates perspective table and saves to docs', async () => {
    // Given: Valid parameters and successful JSON extraction
    const provider = new MockPerspectiveProvider(0);
    const baseTaskId = `test-perspective-${Date.now()}`;
    const reportDir = path.join('out', 'test-perspectives', baseTaskId);

    // When: runPerspectiveTableStep is called
    const result = await runPerspectiveTableStep({
      provider,
      runWorkspaceRoot: workspaceRoot,
      artifactWorkspaceRoot: workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Test Generation',
      targetPaths: ['test.ts'],
      referenceText: 'Some reference text',
      model: 'test-model',
      reportDir,
      timeoutMs: 30000,
      timestamp: new Date().toISOString(),
      baseTaskId,
    });

    // Then: Perspective table generated, saved to docs, markdown returned for prompt injection
    assert.ok(result !== undefined, 'Result should be returned');
    assert.ok(result.extracted === true, 'Perspective should be extracted successfully');
    assert.ok(result.markdown.length > 0, 'Markdown should be returned');
    assert.ok(result.markdown.includes('Case ID'), 'Markdown should contain table header');
    assert.ok(result.saved !== undefined, 'Artifact should be saved');
  });

  // TC-E-07: runPerspectiveTableStep called but JSON extraction fails
  test('TC-E-07: runPerspectiveTableStep handles JSON extraction failure gracefully', async () => {
    // Given: Provider that fails to extract JSON
    const provider = new MockPerspectiveProvider(0, 'No markers found');
    const baseTaskId = `test-perspective-fail-${Date.now()}`;
    const reportDir = path.join('out', 'test-perspectives', baseTaskId);

    // When: runPerspectiveTableStep is called
    const result = await runPerspectiveTableStep({
      provider,
      runWorkspaceRoot: workspaceRoot,
      artifactWorkspaceRoot: workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Test Generation',
      targetPaths: ['test.ts'],
      referenceText: 'Some reference text',
      model: 'test-model',
      reportDir,
      timeoutMs: 30000,
      timestamp: new Date().toISOString(),
      baseTaskId,
    });

    // Then: Failure markdown table generated, saved to docs, extracted=false returned
    assert.ok(result !== undefined, 'Result should be returned even on failure');
    assert.ok(result.extracted === false, 'Extraction should be marked as failed');
    assert.ok(result.markdown.length > 0, 'Failure markdown should be generated');
    assert.ok(result.markdown.includes('TC-E-EXTRACT-01'), 'Failure markdown should contain error case');
  });

  // TC-B-07: runPerspectiveTableStep called with timeoutMs=0
  test('TC-B-07: runPerspectiveTableStep handles zero timeout', async () => {
    // Given: timeoutMs=0
    const provider = new MockPerspectiveProvider(0);
    const baseTaskId = `test-perspective-timeout-0-${Date.now()}`;
    const reportDir = path.join('out', 'test-perspectives', baseTaskId);

    // When: runPerspectiveTableStep is called
    const result = await runPerspectiveTableStep({
      provider,
      runWorkspaceRoot: workspaceRoot,
      artifactWorkspaceRoot: workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Test Generation',
      targetPaths: ['test.ts'],
      model: 'test-model',
      reportDir,
      timeoutMs: 0,
      timestamp: new Date().toISOString(),
      baseTaskId,
    });

    // Then: No timeout set, provider runs until completion
    assert.ok(result !== undefined, 'Result should be returned');
  });

  // TC-B-08: runPerspectiveTableStep called with timeoutMs=-1
  test('TC-B-08: runPerspectiveTableStep handles negative timeout', async () => {
    // Given: timeoutMs=-1
    const provider = new MockPerspectiveProvider(0);
    const baseTaskId = `test-perspective-timeout-neg-${Date.now()}`;
    const reportDir = path.join('out', 'test-perspectives', baseTaskId);

    // When: runPerspectiveTableStep is called
    const result = await runPerspectiveTableStep({
      provider,
      runWorkspaceRoot: workspaceRoot,
      artifactWorkspaceRoot: workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Test Generation',
      targetPaths: ['test.ts'],
      model: 'test-model',
      reportDir,
      timeoutMs: -1,
      timestamp: new Date().toISOString(),
      baseTaskId,
    });

    // Then: No timeout set, provider runs until completion
    assert.ok(result !== undefined, 'Result should be returned');
  });

  // TC-NULL-02: runPerspectiveTableStep called with referenceText=undefined
  test('TC-NULL-02: runPerspectiveTableStep handles undefined referenceText', async () => {
    // Given: referenceText=undefined
    const provider = new MockPerspectiveProvider(0);
    const baseTaskId = `test-perspective-undefined-ref-${Date.now()}`;
    const reportDir = path.join('out', 'test-perspectives', baseTaskId);

    // When: runPerspectiveTableStep is called
    const result = await runPerspectiveTableStep({
      provider,
      runWorkspaceRoot: workspaceRoot,
      artifactWorkspaceRoot: workspaceRoot,
      cursorAgentCommand: 'mock-agent',
      testStrategyPath: 'docs/test-strategy.md',
      generationLabel: 'Test Generation',
      targetPaths: ['test.ts'],
      referenceText: undefined,
      model: 'test-model',
      reportDir,
      timeoutMs: 30000,
      timestamp: new Date().toISOString(),
      baseTaskId,
    });

    // Then: Prompt built without reference text, generation proceeds
    assert.ok(result !== undefined, 'Result should be returned');
  });
});
