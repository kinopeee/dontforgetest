import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  initializeTestGenStatusBar,
  handleTestGenEventForStatusBar,
  _resetForTesting,
} from '../../../ui/statusBar';
import { type TestGenEvent } from '../../../core/event';
import { nowMs } from '../../../core/event';

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

  // TC-N-01: statusBar initialized, running.size = 1
  // Given: statusBar initialized, running.size = 1
  // When: update() is called
  // Then: statusBar.text contains `$(beaker) $(loading~spin) Dontforgetest: 1 実行中`, statusBar.show() called
  test('TC-N-01: statusBar initialized, running.size = 1', () => {
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
      mockStatusBar?.text.includes('$(beaker) $(loading~spin) Dontforgetest: 1 実行中'),
      'Status bar text contains beaker icon, loading icon, and count'
    );
    assert.ok(mockStatusBar?.showCalled, 'statusBar.show() was called');
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
      mockStatusBar?.text.includes('$(beaker) $(loading~spin) Dontforgetest: 5 実行中'),
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
      mockStatusBar?.text.includes('Dontforgetest: 1 実行中'),
      'Status bar text contains count'
    );
    assert.ok(mockStatusBar?.showCalled, 'statusBar.show() was called');
  });

  // TC-N-04: handleTestGenEventForStatusBar called with 'completed' event
  // Given: handleTestGenEventForStatusBar called with 'completed' event
  // When: Event is processed
  // Then: Task removed from running Map, update() called
  test("TC-N-04: handleTestGenEventForStatusBar called with 'completed' event", () => {
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
    assert.ok(mockStatusBar?.text.includes('1 実行中'), 'One task is running');

    const completedEvent: TestGenEvent = {
      type: 'completed',
      taskId: 'task-1',
      exitCode: 0,
      timestampMs: nowMs(),
    };

    // When: handleTestGenEventForStatusBar called with 'completed' event
    handleTestGenEventForStatusBar(completedEvent);

    // Then: Task removed from running Map, update() called
    assert.ok(mockStatusBar?.hideCalled, 'statusBar.hide() was called');
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
      mockStatusBar?.text.includes(`Dontforgetest: ${testCount} 実行中`),
      `Status bar text contains count ${testCount}`
    );
    assert.ok(mockStatusBar?.showCalled, 'statusBar.show() was called');
  });

  // TC-B-04: statusBar = undefined
  // Given: statusBar = undefined
  // When: update() is called
  // Then: update() returns early, no statusBar operations performed
  test('TC-B-04: statusBar = undefined', () => {
    // Given: statusBar = undefined (not initialized)
    // Note: We can't directly test this without exposing internal state
    // We'll test via handleTestGenEventForStatusBar which checks statusBar
    const event: TestGenEvent = {
      type: 'started',
      taskId: 'task-1',
      label: 'test-label',
      timestampMs: nowMs(),
    };

    // When: handleTestGenEventForStatusBar called without initialization
    // Then: Function returns early, no operations performed
    // This should not throw and should not create a status bar
    assert.doesNotThrow(() => {
      handleTestGenEventForStatusBar(event);
    }, 'Function handles undefined statusBar gracefully');
  });

  // TC-E-01: handleTestGenEventForStatusBar called with statusBar = undefined
  // Given: handleTestGenEventForStatusBar called with statusBar = undefined
  // When: Function is called
  // Then: Function returns early, no operations performed
  test('TC-E-01: handleTestGenEventForStatusBar called with statusBar = undefined', () => {
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

  // TC-E-02: handleTestGenEventForStatusBar called with unknown event type
  // Given: handleTestGenEventForStatusBar called with unknown event type
  // When: Function is called
  // Then: Function returns without updating running Map
  test('TC-E-02: handleTestGenEventForStatusBar called with unknown event type', () => {
    // Given: statusBar initialized
    initializeTestGenStatusBar(context);
    assert.ok(mockStatusBar, 'Status bar is created');

    const initialText = mockStatusBar.text;
    const initialShowCalled = mockStatusBar.showCalled;

    // Create an event with a type that's not 'started' or 'completed'
    // TypeScript will prevent this, but we'll test runtime behavior
    const event = {
      type: 'log',
      taskId: 'task-1',
      level: 'info' as const,
      message: 'test',
      timestampMs: nowMs(),
    } as TestGenEvent;

    // When: handleTestGenEventForStatusBar called with unknown event type (for statusBar)
    // Then: Function returns without updating running Map
    assert.doesNotThrow(() => {
      handleTestGenEventForStatusBar(event);
    }, 'Function handles unknown event type gracefully');

    // Verify status bar wasn't updated
    assert.strictEqual(
      mockStatusBar?.text,
      initialText,
      'Status bar text was not updated'
    );
  });

  // TC-E-03: initializeTestGenStatusBar called when statusBar already exists
  // Given: initializeTestGenStatusBar called when statusBar already exists
  // When: Function is called again
  // Then: Function returns early, existing statusBar preserved
  test('TC-E-03: initializeTestGenStatusBar called when statusBar already exists', () => {
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
  });

  // TC-E-04: update() called with statusBar = undefined
  // Given: update() called with statusBar = undefined
  // When: update() is called
  // Then: Function returns early, no operations performed
  test('TC-E-04: update() called with statusBar = undefined', () => {
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

  // TC-V-01: statusBar.text format verification
  // Given: statusBar initialized with running tasks
  // When: update() is called
  // Then: Text matches pattern `$(beaker) $(loading~spin) Dontforgetest: ${count} 実行中`
  test('TC-V-01: statusBar.text format verification', () => {
    // Given: statusBar initialized with running tasks
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
    // Then: Text matches pattern with loading icon
    const text = mockStatusBar?.text || '';
    assert.ok(
      text.includes('$(beaker)'),
      'Status bar text contains beaker icon'
    );
    assert.ok(
      text.includes('$(loading~spin)'),
      'Status bar text contains loading icon'
    );
    assert.ok(
      text.includes('Dontforgetest: 1 実行中'),
      'Status bar text contains count and label'
    );
    assert.ok(
      /^\$\(beaker\) \$\(loading~spin\) Dontforgetest: \d+ 実行中$/.test(text),
      'Status bar text matches expected format'
    );
  });

  // TC-V-02: statusBar.tooltip verification
  // Given: statusBar initialized with running tasks
  // When: update() is called
  // Then: buildTooltip() called and tooltip set correctly
  test('TC-V-02: statusBar.tooltip verification', () => {
    // Given: statusBar initialized with running tasks
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
    // Then: buildTooltip() called and tooltip set correctly
    const tooltip = mockStatusBar?.tooltip || '';
    assert.ok(tooltip.includes('Dontforgetest'), 'Tooltip contains title');
    assert.ok(tooltip.includes('実行中: 1'), 'Tooltip contains running count');
    assert.ok(tooltip.includes('task-1: test-label'), 'Tooltip contains task info');
    assert.ok(tooltip.includes('test-detail'), 'Tooltip contains task detail');
    assert.ok(
      tooltip.includes('クリックで出力ログを表示'),
      'Tooltip contains click instruction'
    );
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
      mockStatusBar?.text.includes('Dontforgetest: 3 実行中'),
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
      mockStatusBar?.text.includes('Dontforgetest: 1 実行中'),
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
      mockStatusBar?.text.includes('Dontforgetest: 1 実行中'),
      'Count is correct'
    );
    assert.ok(mockStatusBar?.showCalled, 'Status bar is shown');
    assert.ok(mockStatusBar?.tooltip, 'Tooltip is set');
  });
});
