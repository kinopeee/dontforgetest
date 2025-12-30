import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

import { t } from '../../../core/l10n';
import * as artifactsModule from '../../../core/artifacts';
import * as quickPickModule from '../../../ui/quickPick';
import * as outputChannelModule from '../../../ui/outputChannel';
import * as generateFromWorkingTreeModule from '../../../commands/generateFromWorkingTree';
import * as selectDefaultModelModule from '../../../commands/selectDefaultModel';

type ExecuteCommand = typeof vscode.commands.executeCommand;

const assertRejectsWithErrorMessage = async (fn: () => Promise<unknown>, expectedMessage: string): Promise<void> => {
  await assert.rejects(fn, (err: unknown) => {
    assert.ok(err instanceof Error, 'Expected Error instance');
    assert.ok(err.message.includes(expectedMessage), `Expected message to include "${expectedMessage}"`);
    return true;
  });
};

suite('src/extension.ts command handlers (high priority coverage)', () => {
  suiteSetup(async () => {
    // Given: The extension is installed
    const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
    assert.ok(ext, 'Extension not found');

    // When: Activating the extension (if needed)
    if (!ext.isActive) {
      await ext.activate();
    }

    // Then: The extension is active
    assert.ok(ext.isActive, 'Extension should be active');
  });

  test('TC-EXTCMD-N-01: dontforgetest.generateTest calls generateTestWithQuickPick once', async () => {
    // Given: generateTestWithQuickPick is stubbed to avoid UI
    const original = quickPickModule.generateTestWithQuickPick;
    let callCount = 0;
    (quickPickModule as unknown as { generateTestWithQuickPick: typeof quickPickModule.generateTestWithQuickPick }).generateTestWithQuickPick =
      async () => {
        callCount += 1;
      };

    try {
      // When: Executing the command
      await vscode.commands.executeCommand('dontforgetest.generateTest');

      // Then: The stub is invoked exactly once
      assert.strictEqual(callCount, 1);
    } finally {
      (quickPickModule as unknown as { generateTestWithQuickPick: typeof original }).generateTestWithQuickPick = original;
    }
  });

  test('TC-EXTCMD-E-01: dontforgetest.generateTest propagates errors from generateTestWithQuickPick', async () => {
    // Given: generateTestWithQuickPick throws
    const original = quickPickModule.generateTestWithQuickPick;
    const expectedMessage = 'boom-generateTestWithQuickPick';
    (quickPickModule as unknown as { generateTestWithQuickPick: typeof quickPickModule.generateTestWithQuickPick }).generateTestWithQuickPick =
      async () => {
        throw new Error(expectedMessage);
      };

    try {
      // When: Executing the command
      // Then: The command rejects with the expected error message
      await assertRejectsWithErrorMessage(async () => {
        await vscode.commands.executeCommand('dontforgetest.generateTest');
      }, expectedMessage);
    } finally {
      (quickPickModule as unknown as { generateTestWithQuickPick: typeof original }).generateTestWithQuickPick = original;
    }
  });

  test('TC-EXTCMD-N-02: dontforgetest.generateTestFromWorkingTree calls generateTestFromWorkingTree once', async () => {
    // Given: generateTestFromWorkingTree is stubbed to avoid QuickPick
    const original = generateFromWorkingTreeModule.generateTestFromWorkingTree;
    let callCount = 0;
    (generateFromWorkingTreeModule as unknown as { generateTestFromWorkingTree: typeof generateFromWorkingTreeModule.generateTestFromWorkingTree })
      .generateTestFromWorkingTree = async () => {
        callCount += 1;
      };

    try {
      // When: Executing the command
      await vscode.commands.executeCommand('dontforgetest.generateTestFromWorkingTree');

      // Then: The stub is invoked exactly once
      assert.strictEqual(callCount, 1);
    } finally {
      (generateFromWorkingTreeModule as unknown as { generateTestFromWorkingTree: typeof original }).generateTestFromWorkingTree = original;
    }
  });

  test('TC-EXTCMD-E-02: dontforgetest.generateTestFromWorkingTree propagates errors from generateTestFromWorkingTree', async () => {
    // Given: generateTestFromWorkingTree throws
    const original = generateFromWorkingTreeModule.generateTestFromWorkingTree;
    const expectedMessage = 'boom-generateFromWorkingTree';
    (generateFromWorkingTreeModule as unknown as { generateTestFromWorkingTree: typeof generateFromWorkingTreeModule.generateTestFromWorkingTree })
      .generateTestFromWorkingTree = async () => {
        throw new Error(expectedMessage);
      };

    try {
      // When / Then: The command rejects with the expected error message
      await assertRejectsWithErrorMessage(async () => {
        await vscode.commands.executeCommand('dontforgetest.generateTestFromWorkingTree');
      }, expectedMessage);
    } finally {
      (generateFromWorkingTreeModule as unknown as { generateTestFromWorkingTree: typeof original }).generateTestFromWorkingTree = original;
    }
  });

  test('TC-EXTCMD-N-03: dontforgetest.showTestGeneratorOutput calls showTestGenOutput(true)', async () => {
    // Given: showTestGenOutput is stubbed
    const original = outputChannelModule.showTestGenOutput;
    const calledWith: Array<boolean | undefined> = [];
    (outputChannelModule as unknown as { showTestGenOutput: typeof outputChannelModule.showTestGenOutput }).showTestGenOutput = (show) => {
      calledWith.push(show);
    };

    try {
      // When: Executing the command
      await vscode.commands.executeCommand('dontforgetest.showTestGeneratorOutput');

      // Then: Called with true exactly once
      assert.deepStrictEqual(calledWith, [true]);
    } finally {
      (outputChannelModule as unknown as { showTestGenOutput: typeof original }).showTestGenOutput = original;
    }
  });

  test('TC-EXTCMD-E-03: dontforgetest.showTestGeneratorOutput propagates errors from showTestGenOutput', async () => {
    // Given: showTestGenOutput throws synchronously
    const original = outputChannelModule.showTestGenOutput;
    const expectedMessage = 'boom-showTestGenOutput';
    (outputChannelModule as unknown as { showTestGenOutput: typeof outputChannelModule.showTestGenOutput }).showTestGenOutput = () => {
      throw new Error(expectedMessage);
    };

    try {
      // When / Then: The command rejects with the expected message
      await assertRejectsWithErrorMessage(async () => {
        await vscode.commands.executeCommand('dontforgetest.showTestGeneratorOutput');
      }, expectedMessage);
    } finally {
      (outputChannelModule as unknown as { showTestGenOutput: typeof original }).showTestGenOutput = original;
    }
  });

  test('TC-EXTCMD-N-04: dontforgetest.selectDefaultModel calls selectDefaultModel once', async () => {
    // Given: selectDefaultModel is stubbed to avoid UI
    const original = selectDefaultModelModule.selectDefaultModel;
    let callCount = 0;
    (selectDefaultModelModule as unknown as { selectDefaultModel: typeof selectDefaultModelModule.selectDefaultModel }).selectDefaultModel =
      async () => {
        callCount += 1;
      };

    try {
      // When: Executing the command
      await vscode.commands.executeCommand('dontforgetest.selectDefaultModel');

      // Then: Called exactly once
      assert.strictEqual(callCount, 1);
    } finally {
      (selectDefaultModelModule as unknown as { selectDefaultModel: typeof original }).selectDefaultModel = original;
    }
  });

  test('TC-EXTCMD-E-04: dontforgetest.selectDefaultModel propagates errors from selectDefaultModel', async () => {
    // Given: selectDefaultModel throws
    const original = selectDefaultModelModule.selectDefaultModel;
    const expectedMessage = 'boom-selectDefaultModel';
    (selectDefaultModelModule as unknown as { selectDefaultModel: typeof selectDefaultModelModule.selectDefaultModel }).selectDefaultModel =
      async () => {
        throw new Error(expectedMessage);
      };

    try {
      // When / Then: The command rejects with the expected message
      await assertRejectsWithErrorMessage(async () => {
        await vscode.commands.executeCommand('dontforgetest.selectDefaultModel');
      }, expectedMessage);
    } finally {
      (selectDefaultModelModule as unknown as { selectDefaultModel: typeof original }).selectDefaultModel = original;
    }
  });

  test('TC-EXTCMD-N-05: dontforgetest.openPanel delegates to workbench.view.extension.dontforgetest', async () => {
    // Given: vscode.commands.executeCommand is wrapped to capture the inner built-in call
    const originalExecute: ExecuteCommand = vscode.commands.executeCommand;
    const called: Array<{ command: string; args: unknown[] }> = [];
    const builtInCommand = 'workbench.view.extension.dontforgetest';

    (vscode.commands as unknown as { executeCommand: ExecuteCommand }).executeCommand = (async (command: string, ...args: unknown[]) => {
      if (command === builtInCommand) {
        called.push({ command, args });
        return undefined;
      }
      return await originalExecute.call(vscode.commands, command, ...args);
    }) as ExecuteCommand;

    try {
      // When: Executing the extension command
      await vscode.commands.executeCommand('dontforgetest.openPanel');

      // Then: It calls the expected built-in command exactly once
      assert.strictEqual(called.length, 1);
      assert.strictEqual(called[0]?.command, builtInCommand);
    } finally {
      (vscode.commands as unknown as { executeCommand: ExecuteCommand }).executeCommand = originalExecute;
    }
  });

  test('TC-EXTCMD-N-06: dontforgetest.openSettings delegates to workbench.action.openSettings with "dontforgetest"', async () => {
    // Given: vscode.commands.executeCommand is wrapped to capture the inner built-in call
    const originalExecute: ExecuteCommand = vscode.commands.executeCommand;
    const called: Array<{ command: string; args: unknown[] }> = [];
    const builtInCommand = 'workbench.action.openSettings';

    (vscode.commands as unknown as { executeCommand: ExecuteCommand }).executeCommand = (async (command: string, ...args: unknown[]) => {
      if (command === builtInCommand) {
        called.push({ command, args });
        return undefined;
      }
      return await originalExecute.call(vscode.commands, command, ...args);
    }) as ExecuteCommand;

    try {
      // When: Executing the extension command
      await vscode.commands.executeCommand('dontforgetest.openSettings');

      // Then: It delegates to openSettings with the dontforgetest scope
      assert.strictEqual(called.length, 1);
      assert.strictEqual(called[0]?.command, builtInCommand);
      assert.deepStrictEqual(called[0]?.args, ['dontforgetest']);
    } finally {
      (vscode.commands as unknown as { executeCommand: ExecuteCommand }).executeCommand = originalExecute;
    }
  });

  test('TC-EXTCMD-E-05: dontforgetest.openSettings propagates errors from workbench.action.openSettings', async () => {
    // Given: vscode.commands.executeCommand is wrapped so the built-in openSettings rejects
    const originalExecute: ExecuteCommand = vscode.commands.executeCommand;
    const builtInCommand = 'workbench.action.openSettings';
    const expectedMessage = 'boom-openSettings';

    (vscode.commands as unknown as { executeCommand: ExecuteCommand }).executeCommand = (async (command: string, ...args: unknown[]) => {
      if (command === builtInCommand) {
        void args; // keep signature explicit
        throw new Error(expectedMessage);
      }
      return await originalExecute.call(vscode.commands, command, ...args);
    }) as ExecuteCommand;

    try {
      // When / Then: Executing openSettings should reject with the built-in error
      await assertRejectsWithErrorMessage(async () => {
        await vscode.commands.executeCommand('dontforgetest.openSettings');
      }, expectedMessage);
    } finally {
      (vscode.commands as unknown as { executeCommand: ExecuteCommand }).executeCommand = originalExecute;
    }
  });

  test('TC-EXTCMD-N-07: dontforgetest.openLatestPerspective opens the path returned by findLatestArtifact', async () => {
    // Given: findLatestArtifact returns a deterministic file path and openTextDocument/showTextDocument are stubbed
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const fakePath = path.join(workspaceRoot, 'docs', 'test-perspectives', 'test-perspectives_20990101_000000.md');

    const originalFindLatest = artifactsModule.findLatestArtifact;
    const workspaceAny = vscode.workspace as unknown as { openTextDocument: unknown };
    const originalOpenTextDocument = workspaceAny.openTextDocument as typeof vscode.workspace.openTextDocument;
    const originalShowTextDocument = vscode.window.showTextDocument;

    let openedPath: string | undefined;
    (artifactsModule as unknown as { findLatestArtifact: typeof artifactsModule.findLatestArtifact }).findLatestArtifact = async () => fakePath;
    workspaceAny.openTextDocument = (async (...args: unknown[]) => {
      const first = args[0];
      if (first instanceof vscode.Uri) {
        openedPath = first.fsPath;
      } else if (typeof first === 'string') {
        openedPath = first;
      }
      return {} as unknown as vscode.TextDocument;
    }) as unknown;
    (vscode.window as unknown as { showTextDocument: typeof vscode.window.showTextDocument }).showTextDocument = async () => {
      return {} as unknown as vscode.TextEditor;
    };

    try {
      // When: Executing the command
      await vscode.commands.executeCommand('dontforgetest.openLatestPerspective');

      // Then: It attempts to open the returned file path
      assert.strictEqual(openedPath, fakePath);
    } finally {
      (artifactsModule as unknown as { findLatestArtifact: typeof originalFindLatest }).findLatestArtifact = originalFindLatest;
      workspaceAny.openTextDocument = originalOpenTextDocument as unknown;
      (vscode.window as unknown as { showTextDocument: typeof originalShowTextDocument }).showTextDocument = originalShowTextDocument;
    }
  });

  test('TC-EXTCMD-E-06: dontforgetest.openLatestPerspective shows info when latest artifact is not found', async () => {
    // Given: findLatestArtifact returns undefined
    const originalFindLatest = artifactsModule.findLatestArtifact;
    (artifactsModule as unknown as { findLatestArtifact: typeof artifactsModule.findLatestArtifact }).findLatestArtifact = async () => undefined;

    const originalShowInfo = vscode.window.showInformationMessage;
    const messages: string[] = [];
    (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = async (
      message: string,
    ) => {
      messages.push(message);
      return undefined;
    };

    try {
      // When: Executing the command
      await vscode.commands.executeCommand('dontforgetest.openLatestPerspective');

      // Then: It shows the localized "not found" message exactly once
      assert.deepStrictEqual(messages, [t('artifact.latestPerspective.notFound')]);
    } finally {
      (artifactsModule as unknown as { findLatestArtifact: typeof originalFindLatest }).findLatestArtifact = originalFindLatest;
      (vscode.window as unknown as { showInformationMessage: typeof originalShowInfo }).showInformationMessage = originalShowInfo;
    }
  });

  test('TC-EXTCMD-N-08: dontforgetest.openLatestExecutionReport opens the path returned by findLatestArtifact', async () => {
    // Given: findLatestArtifact returns a deterministic file path and openTextDocument/showTextDocument are stubbed
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const fakePath = path.join(workspaceRoot, 'docs', 'test-execution-reports', 'test-execution_20990101_000000.md');

    const originalFindLatest = artifactsModule.findLatestArtifact;
    const workspaceAny = vscode.workspace as unknown as { openTextDocument: unknown };
    const originalOpenTextDocument = workspaceAny.openTextDocument as typeof vscode.workspace.openTextDocument;
    const originalShowTextDocument = vscode.window.showTextDocument;

    let openedPath: string | undefined;
    (artifactsModule as unknown as { findLatestArtifact: typeof artifactsModule.findLatestArtifact }).findLatestArtifact = async () => fakePath;
    workspaceAny.openTextDocument = (async (...args: unknown[]) => {
      const first = args[0];
      if (first instanceof vscode.Uri) {
        openedPath = first.fsPath;
      } else if (typeof first === 'string') {
        openedPath = first;
      }
      return {} as unknown as vscode.TextDocument;
    }) as unknown;
    (vscode.window as unknown as { showTextDocument: typeof vscode.window.showTextDocument }).showTextDocument = async () => {
      return {} as unknown as vscode.TextEditor;
    };

    try {
      // When: Executing the command
      await vscode.commands.executeCommand('dontforgetest.openLatestExecutionReport');

      // Then: It attempts to open the returned file path
      assert.strictEqual(openedPath, fakePath);
    } finally {
      (artifactsModule as unknown as { findLatestArtifact: typeof originalFindLatest }).findLatestArtifact = originalFindLatest;
      workspaceAny.openTextDocument = originalOpenTextDocument as unknown;
      (vscode.window as unknown as { showTextDocument: typeof originalShowTextDocument }).showTextDocument = originalShowTextDocument;
    }
  });

  test('TC-EXTCMD-E-07: dontforgetest.openLatestExecutionReport shows info when latest artifact is not found', async () => {
    // Given: findLatestArtifact returns undefined
    const originalFindLatest = artifactsModule.findLatestArtifact;
    (artifactsModule as unknown as { findLatestArtifact: typeof artifactsModule.findLatestArtifact }).findLatestArtifact = async () => undefined;

    const originalShowInfo = vscode.window.showInformationMessage;
    const messages: string[] = [];
    (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = async (
      message: string,
    ) => {
      messages.push(message);
      return undefined;
    };

    try {
      // When: Executing the command
      await vscode.commands.executeCommand('dontforgetest.openLatestExecutionReport');

      // Then: It shows the localized "not found" message exactly once
      assert.deepStrictEqual(messages, [t('artifact.latestExecutionReport.notFound')]);
    } finally {
      (artifactsModule as unknown as { findLatestArtifact: typeof originalFindLatest }).findLatestArtifact = originalFindLatest;
      (vscode.window as unknown as { showInformationMessage: typeof originalShowInfo }).showInformationMessage = originalShowInfo;
    }
  });

  test('TC-EXTCMD-N-09: dontforgetest.openLatestMergeInstruction opens the latest .md by mtimeMs', async () => {
    // Given: fs.promises.readdir/stat are stubbed, and openTextDocument/showTextDocument are stubbed
    const promisesAny = fs.promises as unknown as { readdir: unknown; stat: unknown };
    const originalReaddir = promisesAny.readdir as typeof fs.promises.readdir;
    const originalStat = promisesAny.stat as typeof fs.promises.stat;
    const workspaceAny = vscode.workspace as unknown as { openTextDocument: unknown };
    const originalOpenTextDocument = workspaceAny.openTextDocument as typeof vscode.workspace.openTextDocument;
    const originalShowTextDocument = vscode.window.showTextDocument;

    let capturedInstructionsDir: string | undefined;
    promisesAny.readdir = (async (dirPath: fs.PathLike) => {
      capturedInstructionsDir = String(dirPath);
      return ['old.md', 'latest.md', 'note.txt'];
    }) as unknown;
    promisesAny.stat = (async (targetPath: fs.PathLike) => {
      const p = String(targetPath);
      if (p.endsWith('latest.md')) {
        return { mtimeMs: 200 } as unknown as fs.Stats;
      }
      if (p.endsWith('old.md')) {
        return { mtimeMs: 100 } as unknown as fs.Stats;
      }
      return { mtimeMs: 0 } as unknown as fs.Stats;
    }) as unknown;

    let openedPath: string | undefined;
    workspaceAny.openTextDocument = (async (...args: unknown[]) => {
      const first = args[0];
      if (first instanceof vscode.Uri) {
        openedPath = first.fsPath;
      } else if (typeof first === 'string') {
        openedPath = first;
      }
      return {} as unknown as vscode.TextDocument;
    }) as unknown;
    (vscode.window as unknown as { showTextDocument: typeof vscode.window.showTextDocument }).showTextDocument = async () => {
      return {} as unknown as vscode.TextEditor;
    };

    try {
      // When: Executing the command
      await vscode.commands.executeCommand('dontforgetest.openLatestMergeInstruction');

      // Then: It opens the latest.md under the captured instructions dir
      assert.ok(capturedInstructionsDir && capturedInstructionsDir.trim().length > 0, 'Expected instructionsDir to be passed to readdir');
      assert.ok(openedPath && openedPath.endsWith(path.join('merge-instructions', 'latest.md')), `Unexpected openedPath: ${openedPath}`);
      assert.strictEqual(openedPath, path.join(capturedInstructionsDir!, 'latest.md'));
    } finally {
      promisesAny.readdir = originalReaddir as unknown;
      promisesAny.stat = originalStat as unknown;
      workspaceAny.openTextDocument = originalOpenTextDocument as unknown;
      (vscode.window as unknown as { showTextDocument: typeof originalShowTextDocument }).showTextDocument = originalShowTextDocument;
    }
  });

  test('TC-EXTCMD-E-08: dontforgetest.openLatestMergeInstruction shows info when directory is missing (readdir throws)', async () => {
    // Given: readdir throws like ENOENT
    const promisesAny = fs.promises as unknown as { readdir: unknown };
    const originalReaddir = promisesAny.readdir as typeof fs.promises.readdir;
    promisesAny.readdir = (async () => {
      throw new Error('ENOENT: no such file or directory');
    }) as unknown;

    const originalShowInfo = vscode.window.showInformationMessage;
    const messages: string[] = [];
    (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = async (
      message: string,
    ) => {
      messages.push(message);
      return undefined;
    };

    try {
      // When: Executing the command
      await vscode.commands.executeCommand('dontforgetest.openLatestMergeInstruction');

      // Then: It shows the localized "not found" message
      assert.deepStrictEqual(messages, [t('artifact.mergeInstruction.notFound')]);
    } finally {
      promisesAny.readdir = originalReaddir as unknown;
      (vscode.window as unknown as { showInformationMessage: typeof originalShowInfo }).showInformationMessage = originalShowInfo;
    }
  });

  test('TC-EXTCMD-E-09: dontforgetest.openLatestMergeInstruction shows info when no .md files exist', async () => {
    // Given: readdir returns only non-md files
    const promisesAny = fs.promises as unknown as { readdir: unknown };
    const originalReaddir = promisesAny.readdir as typeof fs.promises.readdir;
    promisesAny.readdir = (async () => {
      return ['a.txt', 'b.json', 'README'];
    }) as unknown;

    const originalShowInfo = vscode.window.showInformationMessage;
    const messages: string[] = [];
    (vscode.window as unknown as { showInformationMessage: typeof vscode.window.showInformationMessage }).showInformationMessage = async (
      message: string,
    ) => {
      messages.push(message);
      return undefined;
    };

    try {
      // When: Executing the command
      await vscode.commands.executeCommand('dontforgetest.openLatestMergeInstruction');

      // Then: It shows the localized "not found" message
      assert.deepStrictEqual(messages, [t('artifact.mergeInstruction.notFound')]);
    } finally {
      promisesAny.readdir = originalReaddir as unknown;
      (vscode.window as unknown as { showInformationMessage: typeof originalShowInfo }).showInformationMessage = originalShowInfo;
    }
  });

  test('TC-EXTCMD-E-10: dontforgetest.openLatestMergeInstruction tolerates stat failure and still opens the latest valid file', async () => {
    // Given: stat throws for one file; the other has newer mtimeMs
    const promisesAny = fs.promises as unknown as { readdir: unknown; stat: unknown };
    const originalReaddir = promisesAny.readdir as typeof fs.promises.readdir;
    const originalStat = promisesAny.stat as typeof fs.promises.stat;
    const workspaceAny = vscode.workspace as unknown as { openTextDocument: unknown };
    const originalOpenTextDocument = workspaceAny.openTextDocument as typeof vscode.workspace.openTextDocument;
    const originalShowTextDocument = vscode.window.showTextDocument;

    let capturedInstructionsDir: string | undefined;
    promisesAny.readdir = (async (dirPath: fs.PathLike) => {
      capturedInstructionsDir = String(dirPath);
      return ['bad.md', 'good.md'];
    }) as unknown;
    promisesAny.stat = (async (targetPath: fs.PathLike) => {
      const p = String(targetPath);
      if (p.endsWith('bad.md')) {
        throw new Error('EACCES');
      }
      return { mtimeMs: 123 } as unknown as fs.Stats;
    }) as unknown;

    let openedPath: string | undefined;
    workspaceAny.openTextDocument = (async (...args: unknown[]) => {
      const first = args[0];
      if (first instanceof vscode.Uri) {
        openedPath = first.fsPath;
      } else if (typeof first === 'string') {
        openedPath = first;
      }
      return {} as unknown as vscode.TextDocument;
    }) as unknown;
    (vscode.window as unknown as { showTextDocument: typeof vscode.window.showTextDocument }).showTextDocument = async () => {
      return {} as unknown as vscode.TextEditor;
    };

    try {
      // When: Executing the command
      await vscode.commands.executeCommand('dontforgetest.openLatestMergeInstruction');

      // Then: It opens good.md (bad.md treated as mtimeMs=0)
      assert.ok(capturedInstructionsDir && capturedInstructionsDir.trim().length > 0);
      assert.strictEqual(openedPath, path.join(capturedInstructionsDir!, 'good.md'));
    } finally {
      promisesAny.readdir = originalReaddir as unknown;
      promisesAny.stat = originalStat as unknown;
      workspaceAny.openTextDocument = originalOpenTextDocument as unknown;
      (vscode.window as unknown as { showTextDocument: typeof originalShowTextDocument }).showTextDocument = originalShowTextDocument;
    }
  });
});

