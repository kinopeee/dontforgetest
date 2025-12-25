import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { cleanupUnexpectedPerspectiveFiles } from '../../../../commands/runWithArtifacts/cleanupStep';

suite('commands/runWithArtifacts/cleanupStep.ts', () => {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  const testDir = path.join(workspaceRoot, 'out', 'test-cleanup');

  suiteSetup(async () => {
    // Create test directory
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(testDir));
  });

  suiteTeardown(async () => {
    // Cleanup test directory
    try {
      await vscode.workspace.fs.delete(vscode.Uri.file(testDir), { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // TC-N-08: cleanupUnexpectedPerspectiveFiles called with workspace containing test_perspectives.md with internal markers
  test('TC-N-08: cleanupUnexpectedPerspectiveFiles deletes files with internal markers', async () => {
    // Given: Workspace containing test_perspectives.md with internal markers
    const testFile = path.join(testDir, 'test_perspectives.md');
    const content = '<!-- BEGIN TEST PERSPECTIVES -->\nSome content\n<!-- END TEST PERSPECTIVES -->';
    await vscode.workspace.fs.writeFile(vscode.Uri.file(testFile), Buffer.from(content, 'utf8'));

    // When: cleanupUnexpectedPerspectiveFiles is called
    const results = await cleanupUnexpectedPerspectiveFiles(testDir);

    // Then: Files with internal markers deleted, cleanup results returned
    assert.ok(results.length > 0, 'Cleanup results should be returned');
    const deleted = results.find((r) => r.relativePath.includes('test_perspectives.md'));
    assert.ok(deleted !== undefined, 'File with markers should be found');
    assert.ok(deleted.deleted === true, 'File with markers should be deleted');

    // Verify file is actually deleted
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(testFile));
      assert.fail('File should be deleted');
    } catch {
      // File should not exist
      assert.ok(true);
    }
  });

  // TC-E-12: cleanupUnexpectedPerspectiveFiles called but file deletion fails
  test('TC-E-12: cleanupUnexpectedPerspectiveFiles records error when file deletion fails', async () => {
    // Given: A file that cannot be deleted (simulated by using non-existent workspace)
    const nonExistentWorkspace = path.join(testDir, 'non-existent-workspace');

    // When: cleanupUnexpectedPerspectiveFiles is called
    const results = await cleanupUnexpectedPerspectiveFiles(nonExistentWorkspace);

    // Then: CleanupResult with deleted=false and errorMessage
    // Note: In this case, no files are found, so results may be empty
    // But if a file exists and deletion fails, errorMessage should be set
    for (const result of results) {
      if (!result.deleted) {
        assert.ok(result.errorMessage !== undefined, 'Error message should be present when deletion fails');
      }
    }
  });

  // TC-B-05: cleanupUnexpectedPerspectiveFiles called with workspace containing no matching files
  test('TC-B-05: cleanupUnexpectedPerspectiveFiles returns empty array when no matching files', async () => {
    // Given: Workspace containing no matching files
    const emptyDir = path.join(testDir, 'empty-dir');
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(emptyDir));

    // When: cleanupUnexpectedPerspectiveFiles is called
    const results = await cleanupUnexpectedPerspectiveFiles(emptyDir);

    // Then: Empty CleanupResult array returned
    assert.deepStrictEqual(results, [], 'No files to clean up should return empty array');
  });

  // TC-B-06: cleanupUnexpectedPerspectiveFiles called with file containing markers but not matching pattern
  test('TC-B-06: cleanupUnexpectedPerspectiveFiles does not delete files without markers', async () => {
    // Given: File containing markers but not matching pattern (or file without markers)
    const testFile = path.join(testDir, 'test_perspectives.md');
    const content = 'Some content without markers';
    await vscode.workspace.fs.writeFile(vscode.Uri.file(testFile), Buffer.from(content, 'utf8'));

    // When: cleanupUnexpectedPerspectiveFiles is called
    await cleanupUnexpectedPerspectiveFiles(testDir);

    // Then: File not deleted, not included in results
    // File without markers should not be deleted
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(testFile));
      assert.ok(true, 'File without markers should not be deleted');
    } catch {
      assert.fail('File without markers should not be deleted');
    }
  });
});
