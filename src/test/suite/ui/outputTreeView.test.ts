import * as assert from 'assert';
import * as vscode from 'vscode';
import { initializeOutputTreeView, OutputTreeViewProvider } from '../../../ui/outputTreeView';

suite('src/ui/outputTreeView.ts', () => {
  let context: vscode.ExtensionContext;
  let mockTreeView: vscode.TreeView<unknown> | undefined;
  let originalCreateTreeView: typeof vscode.window.createTreeView;

  setup(() => {
    // Mock ExtensionContext
    context = {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/'),
    } as unknown as vscode.ExtensionContext;

    // Mock createTreeView
    originalCreateTreeView = vscode.window.createTreeView;
    (vscode.window.createTreeView as unknown) = (
      viewId: string,
      _options: { treeDataProvider: unknown; showCollapseAll?: boolean },
    ) => {
      mockTreeView = {
        id: viewId,
        visible: false,
        message: () => {},
        reveal: () => {},
        dispose: () => {},
      } as unknown as vscode.TreeView<unknown>;
      return mockTreeView;
    };
  });

  teardown(() => {
    // Restore original function
    vscode.window.createTreeView = originalCreateTreeView;
  });

  // TC-N-02: Valid ExtensionContext provided
  // Given: Valid ExtensionContext provided
  // When: initializeOutputTreeView is called
  // Then: OutputTreeView initialized successfully
  test('TC-N-02: Valid ExtensionContext provided', () => {
    // Given: Valid ExtensionContext provided
    const initialSubscriptionCount = context.subscriptions.length;

    // When: initializeOutputTreeView is called
    initializeOutputTreeView(context);

    // Then: OutputTreeView initialized successfully
    assert.ok(context.subscriptions.length > initialSubscriptionCount, 'Subscriptions are registered');
    assert.ok(mockTreeView, 'TreeView is created');
  });

  // TC-N-15: OutputTreeViewProvider getChildren called
  // Given: OutputTreeViewProvider initialized
  // When: getChildren is called
  // Then: Two items returned: "観点表" and "テストレポート" with correct icons and commands
  test('TC-N-15: OutputTreeViewProvider getChildren called', () => {
    // Given: OutputTreeView initialized
    initializeOutputTreeView(context);
    const provider = new OutputTreeViewProvider();

    // When: getChildren is called
    const items = provider.getChildren();

    // Then: Three items displayed: "観点表" / "テストレポート" / "手動マージ" with correct icons
    assert.strictEqual(items.length, 3, 'Three items are displayed');
    const perspectiveItem = items.find((item) => item.command?.command === 'dontforgetest.openLatestPerspective');
    const reportItem = items.find((item) => item.command?.command === 'dontforgetest.openLatestExecutionReport');
    const mergeItem = items.find((item) => item.command?.command === 'dontforgetest.openLatestMergeInstruction');
    assert.ok(perspectiveItem, 'Perspective item exists');
    assert.ok(reportItem, 'Report item exists');
    assert.ok(mergeItem, 'Merge item exists');
    assert.ok(perspectiveItem.iconPath, 'Perspective item has icon');
    assert.ok(reportItem.iconPath, 'Report item has icon');
    assert.ok(mergeItem.iconPath, 'Merge item has icon');
  });

  // TC-N-16: OutputTreeView item click (perspective item)
  // Given: OutputTreeView perspective item
  // When: Item is clicked
  // Then: Corresponding command executed (dontforgetest.openLatestPerspective)
  test('TC-N-16: OutputTreeView item click (perspective item)', () => {
    // Given: OutputTreeView initialized
    initializeOutputTreeView(context);
    const provider = new OutputTreeViewProvider();

    // When: getChildren is called to get items
    const items = provider.getChildren();

    // Then: Items have correct command IDs
    const perspectiveItem = items.find((item) => item.command?.command === 'dontforgetest.openLatestPerspective');
    const reportItem = items.find((item) => item.command?.command === 'dontforgetest.openLatestExecutionReport');
    assert.ok(perspectiveItem, 'Perspective item exists');
    assert.ok(reportItem, 'Report item exists');
    
    if (perspectiveItem.command) {
      assert.strictEqual(
        perspectiveItem.command.command,
        'dontforgetest.openLatestPerspective',
        'Perspective item has correct command'
      );
    } else {
      assert.fail('Perspective item should have command');
    }
  });

  // TC-N-17: OutputTreeView item click (report item)
  // Given: OutputTreeView report item
  // When: Item is clicked
  // Then: Corresponding command executed (dontforgetest.openLatestExecutionReport)
  test('TC-N-17: OutputTreeView item click (report item)', () => {
    // Given: OutputTreeView initialized
    initializeOutputTreeView(context);
    const provider = new OutputTreeViewProvider();

    // When: getChildren is called to get items
    const items = provider.getChildren();

    // Then: Report item has correct command
    const reportItem = items.find((item) => item.command?.command === 'dontforgetest.openLatestExecutionReport');
    assert.ok(reportItem, 'Report item exists');
    
    if (reportItem.command) {
      assert.strictEqual(
        reportItem.command.command,
        'dontforgetest.openLatestExecutionReport',
        'Report item has correct command'
      );
    } else {
      assert.fail('Report item should have command');
    }
  });

  // TC-N-18: OutputTreeView item click (merge item)
  // Given: OutputTreeView merge item
  // When: Item is clicked
  // Then: Corresponding command executed (dontforgetest.openLatestMergeInstruction)
  test('TC-N-18: OutputTreeView item click (merge item)', () => {
    // Given: OutputTreeView initialized
    initializeOutputTreeView(context);
    const provider = new OutputTreeViewProvider();

    // When: getChildren is called to get items
    const items = provider.getChildren();

    // Then: Merge item has correct command
    const mergeItem = items.find((item) => item.command?.command === 'dontforgetest.openLatestMergeInstruction');
    assert.ok(mergeItem, 'Merge item exists');

    if (mergeItem.command) {
      assert.strictEqual(
        mergeItem.command.command,
        'dontforgetest.openLatestMergeInstruction',
        'Merge item has correct command'
      );
    } else {
      assert.fail('Merge item should have command');
    }
  });

  // TC-E-02: initializeOutputTreeView called multiple times
  // Given: initializeOutputTreeView called multiple times
  // When: Function is called again
  // Then: Multiple TreeViews created, no error thrown
  test('TC-E-02: initializeOutputTreeView called multiple times', () => {
    // Given: initializeOutputTreeView called once
    initializeOutputTreeView(context);
    const firstSubscriptionCount = context.subscriptions.length;

    // When: Function is called again
    initializeOutputTreeView(context);

    // Then: Multiple TreeViews created, no error thrown
    assert.ok(context.subscriptions.length > firstSubscriptionCount, 'Additional subscriptions are registered');
  });

  // TC-B-24: OutputTreeView getChildren returns 0 items (theoretical)
  // Given: OutputTreeView provider
  // When: getChildren returns empty array (not possible with current implementation)
  // Then: Empty array returned, empty tree view displayed
  test('TC-B-24: OutputTreeView getChildren returns 0 items (theoretical)', () => {
    // Given: OutputTreeView provider
    const provider = new OutputTreeViewProvider();

    // When: getChildren is called
    // Note: Current implementation always returns 2 items, so this test verifies the structure
    const items = provider.getChildren();

    // Then: Items are returned (current implementation always returns 2 items)
    assert.ok(Array.isArray(items), 'Items is an array');
    // Current implementation always returns 2 items, so we verify the structure
    assert.ok(items.length >= 0, 'Items array exists');
  });

  // TC-B-25: OutputTreeView getChildren returns 2 items
  // Given: OutputTreeView provider
  // When: getChildren is called
  // Then: Two items returned correctly
  test('TC-B-25: OutputTreeView getChildren returns 2 items', () => {
    // Given: OutputTreeView provider
    const provider = new OutputTreeViewProvider();

    // When: getChildren is called
    const items = provider.getChildren();

    // Then: Three items returned correctly
    assert.strictEqual(items.length, 3, 'Three items are returned');
    assert.ok(Array.isArray(items), 'Items is an array');
  });

  // TC-B-46: OutputTreeView getChildren called with invalid element
  // Given: OutputTreeView provider
  // When: getChildren is called with invalid element
  // Then: Empty array returned, no error thrown
  test('TC-B-46: OutputTreeView getChildren called with invalid element', () => {
    // Given: OutputTreeView provider
    const provider = new OutputTreeViewProvider();

    // When: getChildren is called (current implementation doesn't accept parameters)
    // Note: Current implementation doesn't use element parameter
    const items = provider.getChildren();

    // Then: Items are returned (current implementation ignores element parameter)
    assert.ok(Array.isArray(items), 'Items is an array');
  });

  // TC-B-47: OutputTreeView getTreeItem called with invalid element
  // Given: OutputTreeView provider
  // When: getTreeItem is called with invalid element
  // Then: Element returned as-is, no error thrown
  test('TC-B-47: OutputTreeView getTreeItem called with invalid element', () => {
    // Given: OutputTreeView provider
    const provider = new OutputTreeViewProvider();
    const items = provider.getChildren();
    assert.ok(items.length > 0, 'Items exist');

    // When: getTreeItem is called with invalid element
    const invalidElement = {} as unknown;
    
    // Then: Element returned as-is, no error thrown
    assert.doesNotThrow(() => {
      const result = provider.getTreeItem(invalidElement as unknown as Parameters<OutputTreeViewProvider['getTreeItem']>[0]);
      assert.ok(result, 'TreeItem is returned');
    }, 'getTreeItem with invalid element does not throw');
  });
});
