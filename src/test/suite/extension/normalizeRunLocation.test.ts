/**
 * Test file for normalizeRunLocation function in extension.ts
 *
 * This file tests the normalizeRunLocation function both directly (unit tests)
 * and through command handler integration.
 * The function normalizes runLocation option to either 'local' or 'worktree'.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

import { normalizeRunLocation } from '../../../extension';
import * as generateFromCommitModule from '../../../commands/generateFromCommit';
import * as generateFromCommitRangeModule from '../../../commands/generateFromCommitRange';

suite('src/extension.ts normalizeRunLocation', () => {
  suiteSetup(async () => {
    // Given: The extension is installed and active
    const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
    assert.ok(ext, 'Extension not found');
    if (!ext.isActive) {
      await ext.activate();
    }
    assert.ok(ext.isActive, 'Extension should be active');
  });

  suite('normalizeRunLocation unit tests', () => {
    // TC-N-01: value = 'worktree'
    // Given: value is 'worktree'
    // When: normalizeRunLocation is called
    // Then: Returns 'worktree' exactly
    test('TC-N-01: returns "worktree" when value is "worktree"', () => {
      // Given: value = 'worktree'
      const value = 'worktree';

      // When: normalizeRunLocation is called
      const result = normalizeRunLocation(value);

      // Then: Returns 'worktree'
      assert.strictEqual(result, 'worktree');
    });

    // TC-N-02: value = 'local'
    // Given: value is 'local'
    // When: normalizeRunLocation is called
    // Then: Returns 'local' exactly
    test('TC-N-02: returns "local" when value is "local"', () => {
      // Given: value = 'local'
      const value = 'local';

      // When: normalizeRunLocation is called
      const result = normalizeRunLocation(value);

      // Then: Returns 'local'
      assert.strictEqual(result, 'local');
    });

    // TC-E-01: value = undefined
    // Given: value is undefined
    // When: normalizeRunLocation is called
    // Then: Returns 'local' (default fallback)
    test('TC-E-01: returns "local" when value is undefined', () => {
      // Given: value = undefined
      const value = undefined;

      // When: normalizeRunLocation is called
      const result = normalizeRunLocation(value);

      // Then: Returns 'local'
      assert.strictEqual(result, 'local');
    });

    // TC-E-02: value = null
    // Given: value is null
    // When: normalizeRunLocation is called
    // Then: Returns 'local' (default fallback)
    test('TC-E-02: returns "local" when value is null', () => {
      // Given: value = null
      const value = null;

      // When: normalizeRunLocation is called
      const result = normalizeRunLocation(value);

      // Then: Returns 'local'
      assert.strictEqual(result, 'local');
    });

    // TC-E-03: value = '' (empty string)
    // Given: value is empty string
    // When: normalizeRunLocation is called
    // Then: Returns 'local' (not 'worktree')
    test('TC-E-03: returns "local" when value is empty string', () => {
      // Given: value = ''
      const value = '';

      // When: normalizeRunLocation is called
      const result = normalizeRunLocation(value);

      // Then: Returns 'local'
      assert.strictEqual(result, 'local');
    });

    // TC-E-04: value = 'WORKTREE' (uppercase)
    // Given: value is 'WORKTREE' (uppercase)
    // When: normalizeRunLocation is called (case-sensitive)
    // Then: Returns 'local' (strict equality fails)
    test('TC-E-04: returns "local" when value is "WORKTREE" (case-sensitive)', () => {
      // Given: value = 'WORKTREE'
      const value = 'WORKTREE';

      // When: normalizeRunLocation is called
      const result = normalizeRunLocation(value);

      // Then: Returns 'local' (strict equality fails)
      assert.strictEqual(result, 'local');
    });

    // TC-E-05: value = 'worktree ' (trailing space)
    // Given: value is 'worktree ' with trailing space
    // When: normalizeRunLocation is called (no trimming)
    // Then: Returns 'local' (strict equality fails)
    test('TC-E-05: returns "local" when value is "worktree " (trailing space)', () => {
      // Given: value = 'worktree '
      const value = 'worktree ';

      // When: normalizeRunLocation is called
      const result = normalizeRunLocation(value);

      // Then: Returns 'local' (no trimming)
      assert.strictEqual(result, 'local');
    });

    // TC-E-06: value = 0 (number)
    // Given: value is 0 (number type)
    // When: normalizeRunLocation is called
    // Then: Returns 'local' (type mismatch)
    test('TC-E-06: returns "local" when value is 0 (number)', () => {
      // Given: value = 0
      const value = 0;

      // When: normalizeRunLocation is called
      const result = normalizeRunLocation(value);

      // Then: Returns 'local'
      assert.strictEqual(result, 'local');
    });

    // TC-E-07: value = {} (object)
    // Given: value is an empty object
    // When: normalizeRunLocation is called
    // Then: Returns 'local' (object is not 'worktree')
    test('TC-E-07: returns "local" when value is {} (object)', () => {
      // Given: value = {}
      const value = {};

      // When: normalizeRunLocation is called
      const result = normalizeRunLocation(value);

      // Then: Returns 'local'
      assert.strictEqual(result, 'local');
    });

    // TC-E-08: value = 'invalid'
    // Given: value is an invalid string
    // When: normalizeRunLocation is called
    // Then: Returns 'local' (default fallback)
    test('TC-E-08: returns "local" when value is "invalid"', () => {
      // Given: value = 'invalid'
      const value = 'invalid';

      // When: normalizeRunLocation is called
      const result = normalizeRunLocation(value);

      // Then: Returns 'local'
      assert.strictEqual(result, 'local');
    });

    // TC-B-01: value = ' worktree' (leading space)
    // Given: value is ' worktree' with leading space
    // When: normalizeRunLocation is called
    // Then: Returns 'local' (strict equality fails)
    test('TC-B-01: returns "local" when value is " worktree" (leading space)', () => {
      // Given: value = ' worktree'
      const value = ' worktree';

      // When: normalizeRunLocation is called
      const result = normalizeRunLocation(value);

      // Then: Returns 'local' (no trimming)
      assert.strictEqual(result, 'local');
    });

    // TC-B-02: value = true (boolean)
    // Given: value is true (boolean type)
    // When: normalizeRunLocation is called
    // Then: Returns 'local' (type mismatch)
    test('TC-B-02: returns "local" when value is true (boolean)', () => {
      // Given: value = true
      const value = true;

      // When: normalizeRunLocation is called
      const result = normalizeRunLocation(value);

      // Then: Returns 'local'
      assert.strictEqual(result, 'local');
    });

    // TC-B-03: value = [] (array)
    // Given: value is an empty array
    // When: normalizeRunLocation is called
    // Then: Returns 'local' (array is not 'worktree')
    test('TC-B-03: returns "local" when value is [] (array)', () => {
      // Given: value = []
      const value: unknown[] = [];

      // When: normalizeRunLocation is called
      const result = normalizeRunLocation(value);

      // Then: Returns 'local'
      assert.strictEqual(result, 'local');
    });
  });

  suite('generateTestFromCommit command - runLocation normalization', () => {
    // TC-CMD-N-01: generateTestFromCommit with { runLocation: 'worktree' }
    // Given: Command is invoked with runLocation='worktree'
    // When: The command handler processes the argument
    // Then: generateTestFromLatestCommit is called with runLocation='worktree'
    test('TC-CMD-N-01: runLocation "worktree" is passed through correctly', async () => {
      // Given: Stub generateTestFromLatestCommit to capture arguments
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedOptions: generateFromCommitModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: Executing the command with runLocation='worktree'
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', {
          runLocation: 'worktree',
        });

        // Then: runLocation is 'worktree' in the captured options
        assert.ok(capturedOptions, 'Options should be captured');
        assert.strictEqual(capturedOptions.runLocation, 'worktree', 'runLocation should be worktree');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });

    // TC-CMD-N-02: generateTestFromCommit with { runLocation: 'local' }
    // Given: Command is invoked with runLocation='local'
    // When: The command handler processes the argument
    // Then: generateTestFromLatestCommit is called with runLocation='local'
    test('TC-CMD-N-02: runLocation "local" is passed through correctly', async () => {
      // Given: Stub generateTestFromLatestCommit to capture arguments
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedOptions: generateFromCommitModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: Executing the command with runLocation='local'
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', {
          runLocation: 'local',
        });

        // Then: runLocation is 'local' in the captured options
        assert.ok(capturedOptions, 'Options should be captured');
        assert.strictEqual(capturedOptions.runLocation, 'local', 'runLocation should be local');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });

    // TC-CMD-E-01: generateTestFromCommit with no args
    // Given: Command is invoked without arguments
    // When: The command handler processes undefined args
    // Then: generateTestFromLatestCommit is called with runLocation='local' (default)
    test('TC-CMD-E-01: no args defaults runLocation to "local"', async () => {
      // Given: Stub generateTestFromLatestCommit to capture arguments
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedOptions: generateFromCommitModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: Executing the command without arguments
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit');

        // Then: runLocation defaults to 'local'
        assert.ok(capturedOptions, 'Options should be captured');
        assert.strictEqual(capturedOptions.runLocation, 'local', 'runLocation should default to local');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });

    // TC-CMD-E-02: generateTestFromCommit with { runLocation: undefined }
    // Given: Command is invoked with explicit undefined runLocation
    // When: The command handler processes the argument
    // Then: generateTestFromLatestCommit is called with runLocation='local'
    test('TC-CMD-E-02: explicit undefined runLocation defaults to "local"', async () => {
      // Given: Stub generateTestFromLatestCommit to capture arguments
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedOptions: generateFromCommitModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: Executing the command with explicit undefined runLocation
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', {
          runLocation: undefined,
        });

        // Then: runLocation defaults to 'local'
        assert.ok(capturedOptions, 'Options should be captured');
        assert.strictEqual(capturedOptions.runLocation, 'local', 'runLocation should default to local');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });

    // TC-CMD-E-03: generateTestFromCommit with invalid runLocation string
    // Given: Command is invoked with invalid runLocation (not 'worktree')
    // When: The command handler normalizes the argument
    // Then: generateTestFromLatestCommit is called with runLocation='local' (fallback)
    test('TC-CMD-E-03: invalid runLocation string defaults to "local"', async () => {
      // Given: Stub generateTestFromLatestCommit to capture arguments
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedOptions: generateFromCommitModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: Executing the command with invalid runLocation
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', {
          runLocation: 'invalid',
        });

        // Then: runLocation defaults to 'local'
        assert.ok(capturedOptions, 'Options should be captured');
        assert.strictEqual(capturedOptions.runLocation, 'local', 'runLocation should default to local');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });

    // TC-CMD-E-04: generateTestFromCommit with uppercase WORKTREE
    // Given: Command is invoked with 'WORKTREE' (uppercase)
    // When: The command handler normalizes the argument (case-sensitive)
    // Then: generateTestFromLatestCommit is called with runLocation='local' (strict equality)
    test('TC-CMD-E-04: uppercase WORKTREE defaults to "local" (case-sensitive)', async () => {
      // Given: Stub generateTestFromLatestCommit to capture arguments
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedOptions: generateFromCommitModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: Executing the command with uppercase 'WORKTREE'
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', {
          runLocation: 'WORKTREE',
        });

        // Then: runLocation defaults to 'local' (case-sensitive comparison)
        assert.ok(capturedOptions, 'Options should be captured');
        assert.strictEqual(capturedOptions.runLocation, 'local', 'runLocation should default to local');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });
  });

  suite('generateTestFromCommit command - modelOverride handling', () => {
    // TC-CMD-MO-N-01: generateTestFromCommit with valid modelOverride string
    // Given: Command is invoked with modelOverride='gpt-4'
    // When: The command handler processes the argument
    // Then: generateTestFromLatestCommit is called with modelOverride='gpt-4'
    test('TC-CMD-MO-N-01: valid modelOverride string is passed through', async () => {
      // Given: Stub generateTestFromLatestCommit to capture arguments
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedModelOverride: string | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, modelOverride, _options) => {
        capturedModelOverride = modelOverride;
      };

      try {
        // When: Executing the command with modelOverride
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', {
          modelOverride: 'gpt-4',
        });

        // Then: modelOverride is 'gpt-4'
        assert.strictEqual(capturedModelOverride, 'gpt-4', 'modelOverride should be gpt-4');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });

    // TC-CMD-MO-E-01: generateTestFromCommit with non-string modelOverride
    // Given: Command is invoked with modelOverride=123 (number)
    // When: The command handler processes the argument
    // Then: generateTestFromLatestCommit is called with modelOverride=undefined
    test('TC-CMD-MO-E-01: non-string modelOverride is ignored', async () => {
      // Given: Stub generateTestFromLatestCommit to capture arguments
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedModelOverride: string | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, modelOverride, _options) => {
        capturedModelOverride = modelOverride;
      };

      try {
        // When: Executing the command with non-string modelOverride
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', {
          modelOverride: 123,
        });

        // Then: modelOverride is undefined (non-string ignored)
        assert.strictEqual(capturedModelOverride, undefined, 'modelOverride should be undefined');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });

    // TC-CMD-MO-E-02: generateTestFromCommit with no modelOverride
    // Given: Command is invoked without modelOverride
    // When: The command handler processes the argument
    // Then: generateTestFromLatestCommit is called with modelOverride=undefined
    test('TC-CMD-MO-E-02: no modelOverride defaults to undefined', async () => {
      // Given: Stub generateTestFromLatestCommit to capture arguments
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedModelOverride: string | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, modelOverride, _options) => {
        capturedModelOverride = modelOverride;
      };

      try {
        // When: Executing the command without modelOverride
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit');

        // Then: modelOverride is undefined
        assert.strictEqual(capturedModelOverride, undefined, 'modelOverride should be undefined');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });
  });

  suite('generateTestFromCommitRange command - runLocation normalization', () => {
    // TC-RANGE-N-01: generateTestFromCommitRange with { runLocation: 'worktree' }
    // Given: Command is invoked with runLocation='worktree'
    // When: The command handler processes the argument
    // Then: generateTestFromCommitRange is called with runLocation='worktree'
    test('TC-RANGE-N-01: runLocation "worktree" is passed through correctly', async () => {
      // Given: Stub generateTestFromCommitRange to capture arguments
      const original = generateFromCommitRangeModule.generateTestFromCommitRange;
      let capturedOptions: { runLocation?: 'local' | 'worktree' } | undefined;

      (
        generateFromCommitRangeModule as unknown as {
          generateTestFromCommitRange: typeof generateFromCommitRangeModule.generateTestFromCommitRange;
        }
      ).generateTestFromCommitRange = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: Executing the command with runLocation='worktree'
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommitRange', {
          runLocation: 'worktree',
        });

        // Then: runLocation is 'worktree' in the captured options
        assert.ok(capturedOptions, 'Options should be captured');
        assert.strictEqual(capturedOptions.runLocation, 'worktree', 'runLocation should be worktree');
      } finally {
        (
          generateFromCommitRangeModule as unknown as {
            generateTestFromCommitRange: typeof original;
          }
        ).generateTestFromCommitRange = original;
      }
    });

    // TC-RANGE-E-01: generateTestFromCommitRange with no args
    // Given: Command is invoked without arguments
    // When: The command handler processes undefined args
    // Then: generateTestFromCommitRange is called with runLocation='local' (default)
    test('TC-RANGE-E-01: no args defaults runLocation to "local"', async () => {
      // Given: Stub generateTestFromCommitRange to capture arguments
      const original = generateFromCommitRangeModule.generateTestFromCommitRange;
      let capturedOptions: { runLocation?: 'local' | 'worktree' } | undefined;

      (
        generateFromCommitRangeModule as unknown as {
          generateTestFromCommitRange: typeof generateFromCommitRangeModule.generateTestFromCommitRange;
        }
      ).generateTestFromCommitRange = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: Executing the command without arguments
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommitRange');

        // Then: runLocation defaults to 'local'
        assert.ok(capturedOptions, 'Options should be captured');
        assert.strictEqual(capturedOptions.runLocation, 'local', 'runLocation should default to local');
      } finally {
        (
          generateFromCommitRangeModule as unknown as {
            generateTestFromCommitRange: typeof original;
          }
        ).generateTestFromCommitRange = original;
      }
    });

    // TC-RANGE-E-02: generateTestFromCommitRange with invalid runLocation
    // Given: Command is invoked with invalid runLocation
    // When: The command handler normalizes the argument
    // Then: generateTestFromCommitRange is called with runLocation='local' (fallback)
    test('TC-RANGE-E-02: invalid runLocation defaults to "local"', async () => {
      // Given: Stub generateTestFromCommitRange to capture arguments
      const original = generateFromCommitRangeModule.generateTestFromCommitRange;
      let capturedOptions: { runLocation?: 'local' | 'worktree' } | undefined;

      (
        generateFromCommitRangeModule as unknown as {
          generateTestFromCommitRange: typeof generateFromCommitRangeModule.generateTestFromCommitRange;
        }
      ).generateTestFromCommitRange = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: Executing the command with invalid runLocation
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommitRange', {
          runLocation: 'somewhere-else',
        });

        // Then: runLocation defaults to 'local'
        assert.ok(capturedOptions, 'Options should be captured');
        assert.strictEqual(capturedOptions.runLocation, 'local', 'runLocation should default to local');
      } finally {
        (
          generateFromCommitRangeModule as unknown as {
            generateTestFromCommitRange: typeof original;
          }
        ).generateTestFromCommitRange = original;
      }
    });
  });

  suite('Boundary value tests for normalizeRunLocation', () => {
    // TC-BV-01: empty string runLocation
    // Given: Command is invoked with runLocation='' (empty string)
    // When: The command handler normalizes the argument
    // Then: generateTestFromLatestCommit is called with runLocation='local'
    test('TC-BV-01: empty string runLocation defaults to "local"', async () => {
      // Given: Stub generateTestFromLatestCommit to capture arguments
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedOptions: generateFromCommitModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: Executing the command with empty string runLocation
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', {
          runLocation: '',
        });

        // Then: runLocation defaults to 'local'
        assert.ok(capturedOptions, 'Options should be captured');
        assert.strictEqual(capturedOptions.runLocation, 'local', 'runLocation should default to local');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });

    // TC-BV-02: null runLocation
    // Given: Command is invoked with runLocation=null
    // When: The command handler normalizes the argument
    // Then: generateTestFromLatestCommit is called with runLocation='local'
    test('TC-BV-02: null runLocation defaults to "local"', async () => {
      // Given: Stub generateTestFromLatestCommit to capture arguments
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedOptions: generateFromCommitModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: Executing the command with null runLocation
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', {
          runLocation: null,
        });

        // Then: runLocation defaults to 'local'
        assert.ok(capturedOptions, 'Options should be captured');
        assert.strictEqual(capturedOptions.runLocation, 'local', 'runLocation should default to local');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });

    // TC-BV-03: number type runLocation
    // Given: Command is invoked with runLocation=0 (number)
    // When: The command handler normalizes the argument
    // Then: generateTestFromLatestCommit is called with runLocation='local'
    test('TC-BV-03: number runLocation defaults to "local"', async () => {
      // Given: Stub generateTestFromLatestCommit to capture arguments
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedOptions: generateFromCommitModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: Executing the command with number runLocation
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', {
          runLocation: 0,
        });

        // Then: runLocation defaults to 'local'
        assert.ok(capturedOptions, 'Options should be captured');
        assert.strictEqual(capturedOptions.runLocation, 'local', 'runLocation should default to local');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });

    // TC-BV-04: object type runLocation
    // Given: Command is invoked with runLocation={} (object)
    // When: The command handler normalizes the argument
    // Then: generateTestFromLatestCommit is called with runLocation='local'
    test('TC-BV-04: object runLocation defaults to "local"', async () => {
      // Given: Stub generateTestFromLatestCommit to capture arguments
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedOptions: generateFromCommitModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: Executing the command with object runLocation
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', {
          runLocation: {},
        });

        // Then: runLocation defaults to 'local'
        assert.ok(capturedOptions, 'Options should be captured');
        assert.strictEqual(capturedOptions.runLocation, 'local', 'runLocation should default to local');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });

    // TC-BV-05: worktree with trailing space
    // Given: Command is invoked with runLocation='worktree ' (trailing space)
    // When: The command handler normalizes the argument (no trimming)
    // Then: generateTestFromLatestCommit is called with runLocation='local' (strict equality)
    test('TC-BV-05: worktree with trailing space defaults to "local"', async () => {
      // Given: Stub generateTestFromLatestCommit to capture arguments
      const original = generateFromCommitModule.generateTestFromLatestCommit;
      let capturedOptions: generateFromCommitModule.GenerateTestCommandOptions | undefined;

      (
        generateFromCommitModule as unknown as {
          generateTestFromLatestCommit: typeof generateFromCommitModule.generateTestFromLatestCommit;
        }
      ).generateTestFromLatestCommit = async (_provider, _modelOverride, options) => {
        capturedOptions = options;
      };

      try {
        // When: Executing the command with trailing space
        await vscode.commands.executeCommand('dontforgetest.generateTestFromCommit', {
          runLocation: 'worktree ',
        });

        // Then: runLocation defaults to 'local' (strict equality, no trim)
        assert.ok(capturedOptions, 'Options should be captured');
        assert.strictEqual(capturedOptions.runLocation, 'local', 'runLocation should default to local');
      } finally {
        (
          generateFromCommitModule as unknown as {
            generateTestFromLatestCommit: typeof original;
          }
        ).generateTestFromLatestCommit = original;
      }
    });
  });
});
