import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { restoreWorkspaceSnapshot, snapshotToRelativePaths, takeWorkspaceSnapshot } from '../../../core/snapshot';

suite('core/snapshot.ts', () => {
  suite('takeWorkspaceSnapshot / restoreWorkspaceSnapshot', () => {
    // Given: 既存ファイル（テスト用一時ファイル）
    // When: スナップショット取得→内容変更→復元
    // Then: 内容がスナップショット時点に戻る
    test('TC-N-01: 既存ファイルの復元', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        // ワークスペースが開かれていない場合はスキップ
        return;
      }

      const baseDir = path.join(workspaceRoot, '.test-tmp', `snapshot-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const fileRel = path.relative(workspaceRoot, path.join(baseDir, 'a.txt'));
      const fileAbs = path.join(workspaceRoot, fileRel);
      const fileUri = vscode.Uri.file(fileAbs);

      try {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(fileAbs)));
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from('before', 'utf8'));

        const snapshot = await takeWorkspaceSnapshot(workspaceRoot, [fileRel]);
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from('after', 'utf8'));

        await restoreWorkspaceSnapshot(snapshot);
        const restored = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8');
        assert.strictEqual(restored, 'before');
      } finally {
        // 後片付け（失敗しても他テストに影響しないよう握りつぶす）
        try {
          await vscode.workspace.fs.delete(vscode.Uri.file(baseDir), { recursive: true, useTrash: false });
        } catch {
          // noop
        }
      }
    });

    // Given: スナップショット取得時点では存在しないファイルパス
    // When: スナップショット取得→ファイル作成→復元
    // Then: 復元でファイルが削除される（existed=false）
    test('TC-N-02: existed=false（作成されたファイルの削除）', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        return;
      }

      const baseDir = path.join(workspaceRoot, '.test-tmp', `snapshot-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const fileRel = path.relative(workspaceRoot, path.join(baseDir, 'new.txt'));
      const fileAbs = path.join(workspaceRoot, fileRel);
      const fileUri = vscode.Uri.file(fileAbs);

      try {
        // スナップショット取得時点では存在しないことを担保（念のため）
        try {
          await vscode.workspace.fs.delete(fileUri, { recursive: false, useTrash: false });
        } catch {
          // noop
        }

        const snapshot = await takeWorkspaceSnapshot(workspaceRoot, [fileRel]);

        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(fileAbs)));
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from('created', 'utf8'));
        assert.ok(await exists(fileUri), 'テスト準備としてファイルが作成されている');

        await restoreWorkspaceSnapshot(snapshot);
        assert.strictEqual(await exists(fileUri), false, '復元でファイルが削除されている');
      } finally {
        try {
          await vscode.workspace.fs.delete(vscode.Uri.file(baseDir), { recursive: true, useTrash: false });
        } catch {
          // noop
        }
      }
    });

    // Given: 相対/絶対/重複パスが混在
    // When: takeWorkspaceSnapshotを呼び出す
    // Then: 内部の相対パスは重複なく保持される
    test('TC-N-03: パス正規化と重複排除', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        return;
      }

      const baseDir = path.join(workspaceRoot, '.test-tmp', `snapshot-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const fileRel = path.relative(workspaceRoot, path.join(baseDir, 'dup.txt'));
      const fileAbs = path.join(workspaceRoot, fileRel);
      const fileUri = vscode.Uri.file(fileAbs);

      try {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(fileAbs)));
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from('x', 'utf8'));

        const snapshot = await takeWorkspaceSnapshot(workspaceRoot, [fileRel, fileAbs, fileRel]);
        const paths = snapshotToRelativePaths(snapshot);
        assert.strictEqual(paths.length, 1, '重複が除去されている');
        assert.strictEqual(paths[0], fileRel, 'ワークスペース相対パスが保持されている');
      } finally {
        try {
          await vscode.workspace.fs.delete(vscode.Uri.file(baseDir), { recursive: true, useTrash: false });
        } catch {
          // noop
        }
      }
    });
  });
});

async function exists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

