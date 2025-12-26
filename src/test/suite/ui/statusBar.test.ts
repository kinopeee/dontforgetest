import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  initializeTestGenStatusBar,
  handleTestGenEventForStatusBar,
  _resetForTesting,
} from '../../../ui/statusBar';
import { type TestGenEvent } from '../../../core/event';
import { nowMs } from '../../../core/event';
import { t } from '../../../core/l10n';

// Mock StatusBarItem
interface MockStatusBarItem {
  text: string;
  tooltip: string | undefined;
  command: string | undefined;
  alignment: vscode.StatusBarAlignment;
  priority: number;
  showCalled: boolean;
  hideCalled: boolean;
  disposeCalled: boolean;
  show(): void;
  hide(): void;
  dispose(): void;
}

function createMockStatusBarItem(
  alignment: vscode.StatusBarAlignment,
  priority: number
): MockStatusBarItem {
  const mock: MockStatusBarItem = {
    text: '',
    tooltip: undefined,
    command: undefined,
    alignment,
    priority,
    showCalled: false,
    hideCalled: false,
    disposeCalled: false,
    show() {
      this.showCalled = true;
    },
    hide() {
      this.hideCalled = true;
    },
    dispose() {
      this.disposeCalled = true;
    },
  };
  return mock;
}

function buildRunningLabel(count: number): string {
  return t('statusBar.running', count);
}

function buildStatusBarText(count: number): string {
  return `$(beaker) $(loading~spin) ${buildRunningLabel(count)}`;
}

// TC-V-03スキップ中は未使用だが、テスト再有効化時に必要なため保持
function _buildBaseTooltip(count: number): string {
  return t('statusBar.tooltip', count);
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const buildBaseTooltip = _buildBaseTooltip;

suite('src/ui/statusBar.ts', () => {
  let context: vscode.ExtensionContext;
  let mockStatusBar: MockStatusBarItem | undefined;
  let originalCreateStatusBarItem: typeof vscode.window.createStatusBarItem;

  setup(() => {
    // モジュール状態をリセット
    _resetForTesting();

    // Mock ExtensionContext
    context = {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/'),
    } as unknown as vscode.ExtensionContext;

    // Mock createStatusBarItem
    mockStatusBar = createMockStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    originalCreateStatusBarItem = vscode.window.createStatusBarItem;
    (vscode.window.createStatusBarItem as unknown) = (
      alignment: vscode.StatusBarAlignment,
      priority: number
    ) => {
      mockStatusBar = createMockStatusBarItem(alignment, priority);
      return mockStatusBar as unknown as vscode.StatusBarItem;
    };
  });

  teardown(() => {
    // Restore original function
    vscode.window.createStatusBarItem = originalCreateStatusBarItem;
    // Reset module state would require module reload, which is complex
    // For now, we'll work with the assumption that tests run in isolation
  });

  // TC-N-01: statusBar not initialized, valid context
  // Given: statusBar not initialized, valid context
  // When: initializeTestGenStatusBar is called
  // Then: Status bar created, command set, added to subscriptions, update() called
  test('TC-N-01: statusBar not initialized, valid context', () => {
    // Given: statusBar not initialized, valid context
    // When: initializeTestGenStatusBar is called
    initializeTestGenStatusBar(context);

    // Then: Status bar created, command set, added to subscriptions, update() called
    assert.ok(mockStatusBar, 'Status bar is created');
    assert.strictEqual(mockStatusBar?.command, 'dontforgetest.showTestGeneratorOutput', 'Command is set');
    assert.strictEqual(context.subscriptions.length, 1, 'Status bar added to subscriptions');
    // update() is called during initialization (hideCalled should be true when count is 0)
    assert.ok(mockStatusBar?.hideCalled, 'update() was called (hide() called when count is 0)');
  });

  // TC-N-02: statusBar initialized, 'started' event with taskId, label, detail
  // Given: statusBar initialized, 'started' event with taskId, label, detail
  // When: handleTestGenEventForStatusBar is called
  // Then: Task added to running Map, update() called, statusBar shows count
  test("TC-N-02: statusBar initialized, 'started' event with taskId, label, detail", () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      detail: 'test-detail',
      timestampMs: nowMs(),
    };

    // When: handleTestGenEventForStatusBar is called
    handleTestGenEventForStatusBar(event);

    // Then: Task added to running Map, update() called, statusBar shows count
    assert.ok(
      mockStatusBar?.text.includes(buildRunningLabel(1)),
      'Status bar shows count 1'
    );
    assert.ok(mockStatusBar?.showCalled, 'statusBar.show() was called');
    assert.ok(mockStatusBar?.tooltip?.includes('task-1: test-label'), 'Tooltip contains task info');
    assert.ok(mockStatusBar?.tooltip?.includes('test-detail'), 'Tooltip contains detail');
  });

  // TC-N-03: statusBar initialized, 'started' event with taskId, label, no detail
  // Given: statusBar initialized, 'started' event with taskId, label, no detail
  // When: handleTestGenEventForStatusBar is called
  // Then: Task added to running Map, update() called, tooltip without detail
  test("TC-N-03: statusBar initialized, 'started' event with taskId, label, no detail", () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      timestampMs: nowMs(),
    };

    // When: handleTestGenEventForStatusBar is called
    handleTestGenEventForStatusBar(event);

    // Then: Task added to running Map, update() called, tooltip without detail
    assert.ok(
      mockStatusBar?.text.includes(buildRunningLabel(1)),
      'Status bar shows count 1'
    );
    assert.ok(mockStatusBar?.showCalled, 'statusBar.show() was called');
    assert.ok(mockStatusBar?.tooltip?.includes('task-1: test-label'), 'Tooltip contains task info');
    assert.ok(!mockStatusBar?.tooltip?.includes('(test-detail)'), 'Tooltip does not contain detail');
  });

  // TC-N-02: statusBar initialized, running.size = 5
  // Given: statusBar initialized, running.size = 5
  // When: update() is called
  // Then: statusBar.text contains `$(beaker) $(loading~spin) Dontforgetest: 5 実行中`, statusBar.show() called
  test('TC-N-02: statusBar initialized, running.size = 5', () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    // Simulate running.size = 5 by triggering 5 started events
    for (let i = 1; i <= 5; i++) {
      const event: TestGenEvent = {
        type: 'started',
        taskId: `task-${i}`,
        label: `test-label-${i}`,
        timestampMs: nowMs(),
      };
      handleTestGenEventForStatusBar(event);
    }

    // When: update() is called (via handleTestGenEventForStatusBar)
    // Then: statusBar.text contains loading icon and count 5, statusBar.show() called
    assert.ok(
      mockStatusBar?.text.includes(buildStatusBarText(5)),
      'Status bar text contains beaker icon, loading icon, and count 5'
    );
    assert.ok(mockStatusBar?.showCalled, 'statusBar.show() was called');
  });

  // TC-N-03: handleTestGenEventForStatusBar called with 'started' event
  // Given: handleTestGenEventForStatusBar called with 'started' event
  // When: Event is processed
  // Then: Task added to running Map, update() called, statusBar.text contains loading icon
  test("TC-N-03: handleTestGenEventForStatusBar called with 'started' event", () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      detail: 'test-detail',
      timestampMs: nowMs(),
    };

    // When: handleTestGenEventForStatusBar called with 'started' event
    handleTestGenEventForStatusBar(event);

    // Then: Task added to running Map, update() called, statusBar.text contains loading icon
    assert.ok(
      mockStatusBar?.text.includes('$(loading~spin)'),
      'Status bar text contains loading icon'
    );
    assert.ok(
      mockStatusBar?.text.includes(buildRunningLabel(1)),
      'Status bar text contains count'
    );
    assert.ok(mockStatusBar?.showCalled, 'statusBar.show() was called');
  });

  // TC-N-04: statusBar initialized, 'completed' event with existing taskId
  // Given: statusBar initialized, 'completed' event with existing taskId
  // When: handleTestGenEventForStatusBar is called
  // Then: Task removed from running Map, update() called
  test("TC-N-04: statusBar initialized, 'completed' event with existing taskId", () => {
    // Given: statusBar initialized with one running task
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const startedEvent: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(startedEvent);
    assert.ok(mockStatusBar?.text.includes(buildRunningLabel(1)), 'One task is running');

    const completedEvent: TestGenEvent = {
      type: 'completed',
      taskId: 'task-1',
      exitCode: 0,
      timestampMs: nowMs(),
    };

    // When: handleTestGenEventForStatusBar is called
    handleTestGenEventForStatusBar(completedEvent);

    // Then: Task removed from running Map, update() called
    assert.ok(mockStatusBar?.hideCalled, 'statusBar.hide() was called');
  });

  // TC-N-05: statusBar initialized, running.size = 1
  // Given: statusBar initialized, running.size = 1
  // When: update() is called
  // Then: statusBar.text contains "$(beaker) $(loading~spin) Dontforgetest: 1 実行中", statusBar.show() called
  test('TC-N-05: statusBar initialized, running.size = 1', () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    // Simulate running.size = 1 by triggering a started event
    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(event);

    // When: update() is called (via handleTestGenEventForStatusBar)
    // Then: statusBar.text contains loading icon and count, statusBar.show() called
    assert.ok(
      mockStatusBar?.text.includes(buildStatusBarText(1)),
      'Status bar text contains beaker icon, loading icon, and count'
    );
    assert.ok(mockStatusBar?.showCalled, 'statusBar.show() was called');
  });

  // TC-N-06: statusBar initialized, running.size = 5
  // Given: statusBar initialized, running.size = 5
  // When: update() is called
  // Then: statusBar.text contains count 5, statusBar.show() called
  test('TC-N-06: statusBar initialized, running.size = 5', () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    // Simulate running.size = 5 by triggering 5 started events
    for (let i = 1; i <= 5; i++) {
      const event: TestGenEvent = {
        type: 'started',
        taskId: `task-${i}`,
        label: `test-label-${i}`,
        timestampMs: nowMs(),
      };
      handleTestGenEventForStatusBar(event);
    }

    // When: update() is called (via handleTestGenEventForStatusBar)
    // Then: statusBar.text contains count 5, statusBar.show() called
    assert.ok(
      mockStatusBar?.text.includes(buildRunningLabel(5)),
      'Status bar text contains count 5'
    );
    assert.ok(mockStatusBar?.showCalled, 'statusBar.show() was called');
  });

  // TC-N-07: statusBar initialized, multiple tasks with and without detail
  // Given: statusBar initialized, multiple tasks with and without detail
  // When: Multiple started events are processed
  // Then: Tooltip contains all tasks, detail shown when present
  test('TC-N-07: statusBar initialized, multiple tasks with and without detail', () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    // When: Multiple started events are processed
    const event1: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'label-1',
      detail: 'detail-1',
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(event1);

    const event2: TestGenEvent = {
      type: 'started',
      taskId: 'task-2',
      label: 'label-2',
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(event2);

    const event3: TestGenEvent = {
      type: 'started',
      taskId: 'task-3',
      label: 'label-3',
      detail: 'detail-3',
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(event3);

    // Then: Tooltip contains all tasks, detail shown when present
    const tooltip = mockStatusBar?.tooltip || '';
    assert.ok(tooltip.includes('task-1: label-1'), 'Tooltip contains task-1');
    assert.ok(tooltip.includes('(detail-1)'), 'Tooltip contains detail-1');
    assert.ok(tooltip.includes('task-2: label-2'), 'Tooltip contains task-2');
    assert.ok(!tooltip.includes('task-2: label-2 ('), 'Tooltip does not show detail for task-2');
    assert.ok(tooltip.includes('task-3: label-3'), 'Tooltip contains task-3');
    assert.ok(tooltip.includes('(detail-3)'), 'Tooltip contains detail-3');
  });

  // TC-B-01: statusBar initialized, running.size = 0
  // Given: statusBar initialized, running.size = 0
  // When: update() is called
  // Then: statusBar.hide() called, statusBar.text not set
  test('TC-B-01: statusBar initialized, running.size = 0', () => {
    // Given: statusBar initialized, running.size = 0 (no tasks started)
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    // When: update() is called (via initializeTestGenStatusBar)
    // Then: statusBar.hide() called, statusBar.text not set (or empty)
    assert.ok(mockStatusBar?.hideCalled, 'statusBar.hide() was called');
  });

  // TC-B-02: statusBar initialized, running.size = 1
  // Given: statusBar initialized, running.size = 1
  // When: update() is called
  // Then: statusBar.text contains `$(loading~spin)`, statusBar.show() called
  test('TC-B-02: statusBar initialized, running.size = 1', () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(event);

    // When: update() is called (via handleTestGenEventForStatusBar)
    // Then: statusBar.text contains loading icon, statusBar.show() called
    assert.ok(
      mockStatusBar?.text.includes('$(loading~spin)'),
      'Status bar text contains loading icon'
    );
    assert.ok(mockStatusBar?.showCalled, 'statusBar.show() was called');
  });

  // TC-B-03: statusBar initialized, running.size = Number.MAX_SAFE_INTEGER
  // Given: statusBar initialized, running.size = Number.MAX_SAFE_INTEGER
  // When: update() is called
  // Then: statusBar.text contains count value, statusBar.show() called
  test('TC-B-03: statusBar initialized, running.size = Number.MAX_SAFE_INTEGER', () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    // Simulate MAX_SAFE_INTEGER tasks (limited to reasonable number for testing)
    // Note: Actually adding MAX_SAFE_INTEGER tasks would be impractical
    // We'll test with a large but reasonable number (100) to verify the pattern
    const testCount = 100;
    for (let i = 1; i <= testCount; i++) {
      const event: TestGenEvent = {
        type: 'started',
        taskId: `task-${i}`,
        label: `test-label-${i}`,
        timestampMs: nowMs(),
      };
      handleTestGenEventForStatusBar(event);
    }

    // When: update() is called (via handleTestGenEventForStatusBar)
    // Then: statusBar.text contains count value, statusBar.show() called
    assert.ok(
      mockStatusBar?.text.includes(buildRunningLabel(testCount)),
      `Status bar text contains count ${testCount}`
    );
    assert.ok(mockStatusBar?.showCalled, 'statusBar.show() was called');
  });

  // TC-B-04: statusBar = undefined
  // Given: statusBar = undefined
  // When: handleTestGenEventForStatusBar is called
  // Then: handleTestGenEventForStatusBar returns early, no operations
  test('TC-B-04: statusBar = undefined', () => {
    // Given: statusBar = undefined (not initialized)
    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      timestampMs: nowMs(),
    };

    // When: handleTestGenEventForStatusBar is called
    // Then: handleTestGenEventForStatusBar returns early, no operations
    assert.doesNotThrow(() => {
      handleTestGenEventForStatusBar(event);
    }, 'Function handles undefined statusBar gracefully');
  });

  // TC-B-05: statusBar = undefined
  // Given: statusBar = undefined
  // When: update() is called
  // Then: update() returns early, no operations
  test('TC-B-05: statusBar = undefined, update() returns early', () => {
    // Given: statusBar = undefined (not initialized)
    // update() is a private function, so we test via public API
    // handleTestGenEventForStatusBar calls update() internally
    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      timestampMs: nowMs(),
    };

    // When: handleTestGenEventForStatusBar called (which calls update())
    // Then: update() returns early, no operations
    assert.doesNotThrow(() => {
      handleTestGenEventForStatusBar(event);
    }, 'Function handles undefined statusBar gracefully');
  });

  // TC-B-06: 'started' event with empty string taskId
  // Given: statusBar initialized, 'started' event with empty string taskId
  // When: handleTestGenEventForStatusBar is called
  // Then: Task added with empty taskId key, update() called
  test("TC-B-06: 'started' event with empty string taskId", () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const event: TestGenEvent = {
      type: 'started',
      taskId: '',
      label: 'test-label',
      timestampMs: nowMs(),
    };

    // When: handleTestGenEventForStatusBar is called
    handleTestGenEventForStatusBar(event);

    // Then: Task added with empty taskId key, update() called
    assert.ok(
      mockStatusBar?.text.includes(buildRunningLabel(1)),
      'Status bar shows count 1'
    );
    assert.ok(mockStatusBar?.showCalled, 'statusBar.show() was called');
  });

  // TC-B-07: 'started' event with empty string label
  // Given: statusBar initialized, 'started' event with empty string label
  // When: handleTestGenEventForStatusBar is called
  // Then: Task added with empty label, tooltip shows empty label
  test("TC-B-07: 'started' event with empty string label", () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: '',
      timestampMs: nowMs(),
    };

    // When: handleTestGenEventForStatusBar is called
    handleTestGenEventForStatusBar(event);

    // Then: Task added with empty label, tooltip shows empty label
    assert.ok(
      mockStatusBar?.text.includes(buildRunningLabel(1)),
      'Status bar shows count 1'
    );
    assert.ok(mockStatusBar?.showCalled, 'statusBar.show() was called');
    assert.ok(mockStatusBar?.tooltip?.includes('task-1: '), 'Tooltip shows empty label');
  });

  // TC-B-08: 'started' event with empty string detail
  // Given: statusBar initialized, 'started' event with empty string detail
  // When: handleTestGenEventForStatusBar is called
  // Then: Task added, detail treated as empty string (not undefined), tooltip may show empty detail
  test("TC-B-08: 'started' event with empty string detail", () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      detail: '',
      timestampMs: nowMs(),
    };

    // When: handleTestGenEventForStatusBar is called
    handleTestGenEventForStatusBar(event);

    // Then: Task added, detail treated as empty string (not undefined), tooltip may show empty detail
    assert.ok(
      mockStatusBar?.text.includes(buildRunningLabel(1)),
      'Status bar shows count 1'
    );
    assert.ok(mockStatusBar?.showCalled, 'statusBar.show() was called');
    // Empty detail should not be shown in tooltip (only non-empty detail is shown)
    assert.ok(mockStatusBar?.tooltip?.includes('task-1: test-label'), 'Tooltip contains task info');
    assert.ok(!mockStatusBar?.tooltip?.includes('task-1: test-label ()'), 'Tooltip does not show empty detail');
  });

  // TC-B-09: 'completed' event with non-existent taskId
  // Given: statusBar initialized, 'completed' event with non-existent taskId
  // When: handleTestGenEventForStatusBar is called
  // Then: running.delete() called (no-op), update() called
  test("TC-B-09: 'completed' event with non-existent taskId", () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const completedEvent: TestGenEvent = {
      type: 'completed',
      taskId: 'non-existent-task',
      exitCode: 0,
      timestampMs: nowMs(),
    };

    // When: handleTestGenEventForStatusBar is called
    handleTestGenEventForStatusBar(completedEvent);

    // Then: running.delete() called (no-op), update() called
    assert.ok(mockStatusBar?.hideCalled, 'statusBar.hide() was called (count is 0)');
  });

  // TC-B-10: 'completed' event with empty string taskId
  // Given: statusBar initialized, 'completed' event with empty string taskId
  // When: handleTestGenEventForStatusBar is called
  // Then: running.delete() called with empty key, update() called
  test("TC-B-10: 'completed' event with empty string taskId", () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const completedEvent: TestGenEvent = {
      type: 'completed',
      taskId: '',
      exitCode: 0,
      timestampMs: nowMs(),
    };

    // When: handleTestGenEventForStatusBar is called
    handleTestGenEventForStatusBar(completedEvent);

    // Then: running.delete() called with empty key, update() called
    assert.ok(mockStatusBar?.hideCalled, 'statusBar.hide() was called (count is 0)');
  });

  // TC-E-01: initializeTestGenStatusBar called when statusBar already exists
  // Given: initializeTestGenStatusBar called when statusBar already exists
  // When: Function is called again
  // Then: Function returns early, existing statusBar preserved
  test('TC-E-01: initializeTestGenStatusBar called when statusBar already exists', () => {
    // Given: statusBar already initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');
    const firstStatusBar = mockStatusBar;

    // When: initializeTestGenStatusBar called again
    initializeTestGenStatusBar(context);

    // Then: Function returns early, existing statusBar preserved
    // Note: The module-level statusBar variable prevents recreation
    // We verify that the same instance (or behavior) is maintained
    assert.ok(mockStatusBar, 'Status bar still exists');
    assert.strictEqual(mockStatusBar, firstStatusBar, 'Same statusBar instance should be preserved');
  });

  // TC-E-02: handleTestGenEventForStatusBar called with statusBar = undefined
  // Given: handleTestGenEventForStatusBar called with statusBar = undefined
  // When: Function is called
  // Then: Function returns early, no operations performed
  test('TC-E-02: handleTestGenEventForStatusBar called with statusBar = undefined', () => {
    // Given: statusBar = undefined (not initialized)
    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      timestampMs: nowMs(),
    };

    // When: handleTestGenEventForStatusBar called without initialization
    // Then: Function returns early, no operations performed
    assert.doesNotThrow(() => {
      handleTestGenEventForStatusBar(event);
    }, 'Function handles undefined statusBar gracefully');
  });

  // TC-E-03: handleTestGenEventForStatusBar called with 'phase' event type
  // Given: statusBar initialized, handleTestGenEventForStatusBar called with 'phase' event type
  // When: Function is called
  // Then: Function returns without updating running Map
  test("TC-E-03: handleTestGenEventForStatusBar called with 'phase' event type", () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const initialText = mockStatusBar.text;
    const initialShowCalled = mockStatusBar.showCalled;

    const event = {
      type: 'phase',
      taskId: 'task-1',
      phase: 'preparing' as const,
      phaseLabel: '準備中',
      timestampMs: nowMs(),
    } as TestGenEvent;

    // When: handleTestGenEventForStatusBar called with 'phase' event type
    // Then: Function returns without updating running Map
    assert.doesNotThrow(() => {
      handleTestGenEventForStatusBar(event);
    }, 'Function handles phase event type gracefully');

    // Verify status bar wasn't updated
    assert.strictEqual(
      mockStatusBar?.text,
      initialText,
      'Status bar text was not updated'
    );
    assert.strictEqual(
      mockStatusBar?.showCalled,
      initialShowCalled,
      'Status bar show() was not called'
    );
  });

  // TC-E-04: handleTestGenEventForStatusBar called with 'log' event type
  // Given: statusBar initialized, handleTestGenEventForStatusBar called with 'log' event type
  // When: Function is called
  // Then: Function returns without updating running Map
  test("TC-E-04: handleTestGenEventForStatusBar called with 'log' event type", () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const initialText = mockStatusBar.text;
    const initialShowCalled = mockStatusBar.showCalled;

    const event = {
      type: 'log',
      taskId: 'task-1',
      level: 'info' as const,
      message: 'test',
      timestampMs: nowMs(),
    } as TestGenEvent;

    // When: handleTestGenEventForStatusBar called with 'log' event type
    // Then: Function returns without updating running Map
    assert.doesNotThrow(() => {
      handleTestGenEventForStatusBar(event);
    }, 'Function handles log event type gracefully');

    // Verify status bar wasn't updated
    assert.strictEqual(
      mockStatusBar?.text,
      initialText,
      'Status bar text was not updated'
    );
    assert.strictEqual(
      mockStatusBar?.showCalled,
      initialShowCalled,
      'Status bar show() was not called'
    );
  });

  // TC-E-05: handleTestGenEventForStatusBar called with 'fileWrite' event type
  // Given: statusBar initialized, handleTestGenEventForStatusBar called with 'fileWrite' event type
  // When: Function is called
  // Then: Function returns without updating running Map
  test("TC-E-05: handleTestGenEventForStatusBar called with 'fileWrite' event type", () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const initialText = mockStatusBar.text;
    const initialShowCalled = mockStatusBar.showCalled;

    const event = {
      type: 'fileWrite',
      taskId: 'task-1',
      path: '/path/to/file.ts',
      linesCreated: 10,
      bytesWritten: 100,
      timestampMs: nowMs(),
    } as TestGenEvent;

    // When: handleTestGenEventForStatusBar called with 'fileWrite' event type
    // Then: Function returns without updating running Map
    assert.doesNotThrow(() => {
      handleTestGenEventForStatusBar(event);
    }, 'Function handles fileWrite event type gracefully');

    // Verify status bar wasn't updated
    assert.strictEqual(
      mockStatusBar?.text,
      initialText,
      'Status bar text was not updated'
    );
    assert.strictEqual(
      mockStatusBar?.showCalled,
      initialShowCalled,
      'Status bar show() was not called'
    );
  });

  // TC-E-06: update() called with statusBar = undefined
  // Given: update() called with statusBar = undefined
  // When: update() is called
  // Then: Function returns early, no operations performed
  test('TC-E-06: update() called with statusBar = undefined', () => {
    // Given: statusBar = undefined (not initialized)
    // update() is a private function, so we test via public API
    // handleTestGenEventForStatusBar calls update() internally
    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      timestampMs: nowMs(),
    };

    // When: handleTestGenEventForStatusBar called (which calls update())
    // Then: Function returns early, no operations performed
    assert.doesNotThrow(() => {
      handleTestGenEventForStatusBar(event);
    }, 'Function handles undefined statusBar gracefully');
  });


  // TC-V-01: statusBar.text format verification with count = 1
  // Given: statusBar initialized with running tasks, count = 1
  // When: update() is called
  // Then: Text matches pattern "$(beaker) $(loading~spin) Dontforgetest: 1 実行中"
  test('TC-V-01: statusBar.text format verification with count = 1', () => {
    // Given: statusBar initialized with running tasks, count = 1
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(event);

    // When: update() is called (via handleTestGenEventForStatusBar)
    // Then: Text matches pattern "$(beaker) $(loading~spin) Dontforgetest: 1 実行中"
    const text = mockStatusBar?.text || '';
    assert.strictEqual(text, buildStatusBarText(1), 'Status bar text matches expected format with count 1');
  });

  // TC-V-02: statusBar.text format verification with count = 10
  // Given: statusBar initialized with running tasks, count = 10
  // When: update() is called
  // Then: Text matches pattern "$(beaker) $(loading~spin) Dontforgetest: 10 実行中"
  test('TC-V-02: statusBar.text format verification with count = 10', () => {
    // Given: statusBar initialized with running tasks, count = 10
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    for (let i = 1; i <= 10; i++) {
      const event: TestGenEvent = {
        type: 'started',
        taskId: `task-${i}`,
        label: `test-label-${i}`,
        timestampMs: nowMs(),
      };
      handleTestGenEventForStatusBar(event);
    }

    // When: update() is called (via handleTestGenEventForStatusBar)
    // Then: Text matches pattern "$(beaker) $(loading~spin) Dontforgetest: 10 実行中"
    const text = mockStatusBar?.text || '';
    assert.strictEqual(text, buildStatusBarText(10), 'Status bar text matches expected format with count 10');
  });

  // TC-V-03: statusBar.tooltip format verification with single task
  // Given: statusBar initialized with single running task
  // When: update() is called
  // Then: Tooltip contains "Dontforgetest", "実行中: 1", task info, "クリックで出力ログを表示"
  test('TC-V-03: statusBar.tooltip format verification with single task', () => {
    // Given: statusBar initialized with single running task
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(event);

    // When: update() is called (via handleTestGenEventForStatusBar)
    // Then: Tooltip contains "Dontforgetest", "実行中: 1", task info, "クリックで出力ログを表示"
    const tooltip = mockStatusBar?.tooltip ?? '';
    assert.notStrictEqual(tooltip, '', `Tooltip should not be empty. mockStatusBar.tooltip=${mockStatusBar?.tooltip}`);

    // ローカライズ（vscode.l10n.t）のロード状況により、文言がキーのまま返ることがある。
    // そのため、このテストでは「直書き文言」ではなく t() ベースで期待値を構築して検証する。
    const baseTooltip = buildBaseTooltip(1);
    const baseLines = baseTooltip.split('\n');
    const titleLine = baseLines[0] ?? '';
    const runningLine = baseLines.length >= 3 ? baseLines[2] : undefined;
    const clickLine = baseLines.length >= 5 ? baseLines[baseLines.length - 1] : undefined;

    assert.ok(titleLine !== '', 'base tooltip should have title line');
    assert.ok(tooltip.includes(titleLine), `Tooltip contains title. Got: ${tooltip}`);

    // タスクの詳細行（挿入される行）を検証
    const taskLine = '- task-1: test-label';
    assert.ok(tooltip.includes(taskLine), `Tooltip contains task info. Got: ${tooltip}`);

    // baseTooltip が複数行の場合のみ、見出し→タスク→クリック案内の順序も確認する
    if (runningLine && clickLine) {
      const idxRunning = tooltip.indexOf(runningLine);
      const idxTask = tooltip.indexOf(taskLine);
      const idxClick = tooltip.lastIndexOf(clickLine);
      assert.ok(idxRunning >= 0, `Tooltip contains running line: "${runningLine}". Got: ${tooltip}`);
      assert.ok(idxClick >= 0, `Tooltip contains click instruction: "${clickLine}". Got: ${tooltip}`);
      assert.ok(idxTask > idxRunning, `Task line should appear after running line. Got: ${tooltip}`);
      assert.ok(idxClick > idxTask, `Click instruction should appear after task line. Got: ${tooltip}`);
    }
  });

  // TC-V-04: statusBar.tooltip format verification with multiple tasks
  // Given: statusBar initialized with multiple running tasks
  // When: update() is called
  // Then: Tooltip contains all tasks listed with taskId and label
  test('TC-V-04: statusBar.tooltip format verification with multiple tasks', () => {
    // Given: statusBar initialized with multiple running tasks
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    for (let i = 1; i <= 3; i++) {
      const event: TestGenEvent = {
        type: 'started',
        taskId: `task-${i}`,
        label: `label-${i}`,
        timestampMs: nowMs(),
      };
      handleTestGenEventForStatusBar(event);
    }

    // When: update() is called (via handleTestGenEventForStatusBar)
    // Then: Tooltip contains all tasks listed with taskId and label
    const tooltip = mockStatusBar?.tooltip || '';
    assert.ok(tooltip.includes('task-1: label-1'), 'Tooltip contains task-1');
    assert.ok(tooltip.includes('task-2: label-2'), 'Tooltip contains task-2');
    assert.ok(tooltip.includes('task-3: label-3'), 'Tooltip contains task-3');
  });

  // TC-V-05: statusBar.tooltip format verification with task detail
  // Given: statusBar initialized with running task that has detail
  // When: update() is called
  // Then: Tooltip shows detail in parentheses after label
  test('TC-V-05: statusBar.tooltip format verification with task detail', () => {
    // Given: statusBar initialized with running task that has detail
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      detail: 'test-detail',
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(event);

    // When: update() is called (via handleTestGenEventForStatusBar)
    // Then: Tooltip shows detail in parentheses after label
    const tooltip = mockStatusBar?.tooltip || '';
    assert.ok(tooltip.includes('task-1: test-label (test-detail)'), 'Tooltip shows detail in parentheses');
  });

  // TC-V-06: statusBar.tooltip format verification without task detail
  // Given: statusBar initialized with running task without detail
  // When: update() is called
  // Then: Tooltip shows label without parentheses
  test('TC-V-06: statusBar.tooltip format verification without task detail', () => {
    // Given: statusBar initialized with running task without detail
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(event);

    // When: update() is called (via handleTestGenEventForStatusBar)
    // Then: Tooltip shows label without parentheses
    const tooltip = mockStatusBar?.tooltip || '';
    assert.ok(tooltip.includes('task-1: test-label'), 'Tooltip contains task info');
    assert.ok(!tooltip.includes('task-1: test-label ('), 'Tooltip does not show parentheses without detail');
  });

  // TC-I-01: Multiple 'started' events followed by 'completed' events
  // Given: Multiple 'started' events followed by 'completed' events
  // When: Events are processed sequentially
  // Then: Status bar updates correctly, count reflects current running tasks
  test('TC-I-01: Multiple started events followed by completed events', () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    // Start 3 tasks
    for (let i = 1; i <= 3; i++) {
      const event: TestGenEvent = {
        type: 'started',
        taskId: `task-${i}`,
        label: `test-label-${i}`,
        timestampMs: nowMs(),
      };
      handleTestGenEventForStatusBar(event);
    }

    // When: Events are processed sequentially
    // Verify count is 3
    assert.ok(
      mockStatusBar?.text.includes(buildRunningLabel(3)),
      'Status bar shows 3 running tasks'
    );
    assert.ok(
      mockStatusBar?.text.includes('$(loading~spin)'),
      'Status bar contains loading icon'
    );

    // Reset hideCalled flag to track new hide() calls
    if (mockStatusBar) {
      mockStatusBar.hideCalled = false;
    }

    // Complete 2 tasks
    const completedEvent1: TestGenEvent = {
      type: 'completed',
      taskId: 'task-1',
      exitCode: 0,
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(completedEvent1);

    const completedEvent2: TestGenEvent = {
      type: 'completed',
      taskId: 'task-2',
      exitCode: 0,
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(completedEvent2);

    // Then: Status bar updates correctly, count reflects current running tasks
    // After completing 2 tasks, 1 should remain running
    assert.ok(
      mockStatusBar?.text.includes(buildRunningLabel(1)),
      'Status bar shows 1 running task after completing 2'
    );
    assert.ok(
      mockStatusBar?.text.includes('$(loading~spin)'),
      'Status bar still contains loading icon'
    );
    assert.ok(!mockStatusBar?.hideCalled, 'statusBar.hide() was not called (1 task still running)');

    // Complete the last task
    const completedEvent3: TestGenEvent = {
      type: 'completed',
      taskId: 'task-3',
      exitCode: 0,
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(completedEvent3);

    // Verify status bar is hidden when all tasks complete
    assert.ok(mockStatusBar?.hideCalled, 'statusBar.hide() was called when all tasks completed');
  });

  // TC-I-02: initializeTestGenStatusBar → handleTestGenEventForStatusBar → update() flow
  // Given: initializeTestGenStatusBar → handleTestGenEventForStatusBar → update() flow
  // When: Complete flow is executed
  // Then: Status bar initialized, event processed, status bar updated
  test('TC-I-02: initializeTestGenStatusBar → handleTestGenEventForStatusBar → update() flow', () => {
    // Given: initializeTestGenStatusBar → handleTestGenEventForStatusBar → update() flow
    // When: Complete flow is executed
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is initialized');

    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      detail: 'test-detail',
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(event);

    // Then: Status bar initialized, event processed, status bar updated
    assert.ok(mockStatusBar?.text.includes('$(loading~spin)'), 'Loading icon is present');
    assert.ok(
      mockStatusBar?.text.includes(buildRunningLabel(1)),
      'Count is correct'
    );
    assert.ok(mockStatusBar?.showCalled, 'Status bar is shown');
    assert.ok(mockStatusBar?.tooltip, 'Tooltip is set');
  });

  // TC-I-03: Multiple tasks started, some completed, remaining tasks shown
  // Given: Multiple tasks started, some completed
  // When: Events are processed
  // Then: Status bar shows correct count of remaining tasks
  test('TC-I-03: Multiple tasks started, some completed, remaining tasks shown', () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    // Start 5 tasks
    for (let i = 1; i <= 5; i++) {
      const event: TestGenEvent = {
        type: 'started',
        taskId: `task-${i}`,
        label: `test-label-${i}`,
        timestampMs: nowMs(),
      };
      handleTestGenEventForStatusBar(event);
    }

    // Verify count is 5
    assert.ok(
      mockStatusBar?.text.includes(buildRunningLabel(5)),
      'Status bar shows 5 running tasks'
    );

    // Reset hideCalled flag to track new hide() calls
    if (mockStatusBar) {
      mockStatusBar.hideCalled = false;
    }

    // Complete 3 tasks
    for (let i = 1; i <= 3; i++) {
      const completedEvent: TestGenEvent = {
        type: 'completed',
        taskId: `task-${i}`,
        exitCode: 0,
        timestampMs: nowMs(),
      };
      handleTestGenEventForStatusBar(completedEvent);
    }

    // When: Events are processed
    // Then: Status bar shows correct count of remaining tasks
    assert.ok(
      mockStatusBar?.text.includes(buildRunningLabel(2)),
      'Status bar shows 2 remaining tasks'
    );
    assert.ok(!mockStatusBar?.hideCalled, 'statusBar.hide() was not called (2 tasks still running)');
  });

  // TC-I-04: All tasks completed, running.size becomes 0
  // Given: All tasks completed
  // When: Last task completes
  // Then: statusBar.hide() called when all tasks complete
  test('TC-I-04: All tasks completed, running.size becomes 0', () => {
    // Given: statusBar initialized with running tasks
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    // Start 2 tasks
    for (let i = 1; i <= 2; i++) {
      const event: TestGenEvent = {
        type: 'started',
        taskId: `task-${i}`,
        label: `test-label-${i}`,
        timestampMs: nowMs(),
      };
      handleTestGenEventForStatusBar(event);
    }

    // Reset hideCalled flag to track new hide() calls
    if (mockStatusBar) {
      mockStatusBar.hideCalled = false;
    }

    // Complete all tasks
    for (let i = 1; i <= 2; i++) {
      const completedEvent: TestGenEvent = {
        type: 'completed',
        taskId: `task-${i}`,
        exitCode: 0,
        timestampMs: nowMs(),
      };
      handleTestGenEventForStatusBar(completedEvent);
    }

    // When: Last task completes
    // Then: statusBar.hide() called when all tasks complete
    assert.ok(mockStatusBar?.hideCalled, 'statusBar.hide() was called when all tasks completed');
  });

  // TC-I-02: initializeTestGenStatusBar → handleTestGenEventForStatusBar → update() flow
  // Given: initializeTestGenStatusBar → handleTestGenEventForStatusBar → update() flow
  // When: Complete flow is executed
  // Then: Status bar initialized, event processed, status bar updated with loading icon
  test('TC-I-02: Complete initialization and update flow', () => {
    // Given: initializeTestGenStatusBar → handleTestGenEventForStatusBar → update() flow
    // When: Complete flow is executed
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is initialized');

    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      detail: 'test-detail',
      timestampMs: nowMs(),
    };
    handleTestGenEventForStatusBar(event);

    // Then: Status bar initialized, event processed, status bar updated with loading icon
    assert.ok(mockStatusBar?.text.includes('$(loading~spin)'), 'Loading icon is present');
    assert.ok(
      mockStatusBar?.text.includes(buildRunningLabel(1)),
      'Count is correct'
    );
    assert.ok(mockStatusBar?.showCalled, 'Status bar is shown');
    assert.ok(mockStatusBar?.tooltip, 'Tooltip is set');
  });
});
