import * as path from 'path';
import * as vscode from 'vscode';
import { type WorkspaceSnapshot } from '../core/snapshot';

const SNAPSHOT_SCHEME = 'testgen-agent-snapshot';
const CURRENT_SCHEME = 'testgen-agent-current';

let registered = false;
let activeSnapshot: WorkspaceSnapshot | undefined;

/**
 * 直近スナップショットの差分を表示する（Diffエディタ）。
 * - まずファイル一覧をQuickPickで選択
 * - 選択された1ファイルのDiffを開く
 */
export async function previewSnapshotDiff(snapshot: WorkspaceSnapshot, relativePaths: string[], title: string): Promise<void> {
  ensureRegistered();
  activeSnapshot = snapshot;

  const unique = Array.from(new Set(relativePaths)).sort();
  if (unique.length === 0) {
    void vscode.window.showInformationMessage('差分対象ファイルがありません。');
    return;
  }

  const picked = await vscode.window.showQuickPick(
    unique.map((p) => ({ label: p })),
    { title, placeHolder: '差分を表示するファイルを選択してください' },
  );
  if (!picked) {
    return;
  }

  await openDiffForPath(snapshot.workspaceRoot, picked.label, title);
}

function ensureRegistered(): void {
  if (registered) {
    return;
  }
  registered = true;

  const provider: vscode.TextDocumentContentProvider = {
    provideTextDocumentContent: async (uri: vscode.Uri): Promise<string> => {
      const snapshot = activeSnapshot;
      if (!snapshot) {
        return '';
      }

      const rel = decodeVirtualPath(uri);
      if (!rel) {
        return '';
      }

      if (uri.scheme === SNAPSHOT_SCHEME) {
        const entry = snapshot.files.get(rel);
        return entry?.content ?? '';
      }

      if (uri.scheme === CURRENT_SCHEME) {
        const abs = path.join(snapshot.workspaceRoot, rel);
        try {
          const data = await vscode.workspace.fs.readFile(vscode.Uri.file(abs));
          return Buffer.from(data).toString('utf8');
        } catch {
          return '';
        }
      }

      return '';
    },
  };

  vscode.workspace.registerTextDocumentContentProvider(SNAPSHOT_SCHEME, provider);
  vscode.workspace.registerTextDocumentContentProvider(CURRENT_SCHEME, provider);
}

async function openDiffForPath(workspaceRoot: string, relativePath: string, titlePrefix: string): Promise<void> {
  const rel = normalizeRelativePath(relativePath);
  const left = vscode.Uri.from({ scheme: SNAPSHOT_SCHEME, path: `/${encodeURIComponent(rel)}` });
  const right = vscode.Uri.from({ scheme: CURRENT_SCHEME, path: `/${encodeURIComponent(rel)}` });
  const title = `${titlePrefix}: ${rel}`;

  // preview=true でタブが増えすぎるのを抑制
  await vscode.commands.executeCommand('vscode.diff', left, right, title, { preview: true });
}

function decodeVirtualPath(uri: vscode.Uri): string | undefined {
  const raw = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;
  if (raw.length === 0) {
    return undefined;
  }
  try {
    return normalizeRelativePath(decodeURIComponent(raw));
  } catch {
    return normalizeRelativePath(raw);
  }
}

function normalizeRelativePath(rel: string): string {
  return rel.replace(/^\.([/\\])/, '').trim();
}

