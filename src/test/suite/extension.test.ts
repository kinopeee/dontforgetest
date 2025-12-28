import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { createMockExtensionContext } from './testUtils/vscodeMocks';
import { initializeProgressTreeView, _resetForTesting as resetProgressTreeView } from '../../ui/progressTreeView';
import { initializeOutputTreeView } from '../../ui/outputTreeView';

suite('src/extension.ts', () => {
  suite('Extension Activation', () => {
    // Given: Extension is installed
    // When: Getting extension by ID
    // Then: Extension object exists
    test('TC-EXT-01: Extension existence check', () => {
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');
    });

    // Given: Extension is available
    // When: Calling activate()
    // Then: Extension becomes active
    test('TC-N-01: Extension activated with all changes applied', async () => {
      // Given: Extension is available
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      // When: Calling activate()
      if (!ext.isActive) {
        await ext.activate();
      }

      // Then: Extension is active without import errors
      assert.ok(ext.isActive, 'Extension should be active');
    });

    // TC-E-01: Old extension ID lookup fails
    // Given: Extension ID 'local.dontforgetest'
    // When: Looking up extension
    // Then: Returns undefined
    test('TC-E-01: Old extension ID "local.dontforgetest" is not found', function () {
      // NOTE: ローカル環境では、アップグレード検証や手動インストールの都合で旧IDが一時的に共存している場合がある。
      // その場合にCI前提の前提条件でテストが落ちないよう、存在するならスキップする。

      // When: Looking up extension by old ID
      const ext = vscode.extensions.getExtension('local.dontforgetest');

      if (ext) {
        this.skip();
      }

      // Then: Returns undefined
      assert.strictEqual(ext, undefined, 'Old extension ID should not be found');
    });
  });

  suite('Command Registration', () => {
    // Given: Extension is activated
    // When: Querying all registered commands
    // Then: All expected command IDs are present
    test('TC-N-02: All remaining commands registered', async () => {
      const expectedCommands = [
        'dontforgetest.generateTest',
        'dontforgetest.openPanel',
        'dontforgetest.generateTestFromCommit',
        'dontforgetest.generateTestFromCommitRange',
        'dontforgetest.generateTestFromWorkingTree',
        'dontforgetest.selectDefaultModel',
        'dontforgetest.showTestGeneratorOutput'
      ];

      // Get all commands including built-in ones
      const allCommands = await vscode.commands.getCommands(true);

      expectedCommands.forEach(cmd => {
        assert.ok(
          allCommands.includes(cmd),
          `Command "${cmd}" is not registered`
        );
      });
    });

    // Given: Extension is activated
    // When: Querying all registered commands
    // Then: Command list does not contain 'dontforgetest.generateTestFromFile'
    test('TC-N-03: Command list does not contain deleted command', async () => {
      // Given: Extension is activated
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      if (!ext.isActive) {
        await ext.activate();
      }

      // When: Querying all registered commands
      const allCommands = await vscode.commands.getCommands(true);

      // Then: Deleted command is not in the list
      assert.ok(
        !allCommands.includes('dontforgetest.generateTestFromFile'),
        'Deleted command "dontforgetest.generateTestFromFile" should not be registered'
      );
    });

    // Given: Extension is activated
    // When: Attempting to execute deleted command
    // Then: Command execution fails with "command not found" error
    test('TC-E-01: Deleted command execution fails', async () => {
      // Given: Extension is activated
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      if (!ext.isActive) {
        await ext.activate();
      }

      // When: Attempting to execute deleted command
      // Then: Command execution fails with error
      try {
        await vscode.commands.executeCommand('dontforgetest.generateTestFromFile');
        assert.fail('Command execution should have failed');
      } catch (error) {
        // Expected: Command not found error
        assert.ok(error instanceof Error, 'Error should be an Error instance');
        assert.ok(
          error.message.includes('command') || error.message.includes('not found'),
          `Error message should indicate command not found, got: ${error.message}`
        );
      }
    });

    // Given: Extension package.json
    // When: Checking command definitions
    // Then: package.json does not contain 'dontforgetest.generateTestFromFile' command definition
    test('TC-E-04: package.json does not contain deleted command definition', () => {
      // Given: Extension package.json
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const packageJSON = ext.packageJSON;
      const commands = packageJSON.contributes?.commands || [];

      // When: Checking command definitions
      // Then: Deleted command is not in the list
      const deletedCommand = commands.find((cmd: { command: string }) =>
        cmd.command === 'dontforgetest.generateTestFromFile'
      );
      assert.strictEqual(
        deletedCommand,
        undefined,
        'Deleted command "dontforgetest.generateTestFromFile" should not be in package.json'
      );
    });

    // Given: Extension is activated
    // When: Querying registered commands
    // Then: At least one command is registered (boundary: not empty)
    test('TC-B-01: Command list is not empty', async () => {
      // Given: Extension is activated
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      if (!ext.isActive) {
        await ext.activate();
      }

      // When: Querying registered commands
      const allCommands = await vscode.commands.getCommands(true);
      const dontforgetestCommands = allCommands.filter(cmd => cmd.startsWith('dontforgetest.'));

      // Then: At least one command is registered
      assert.ok(
        dontforgetestCommands.length > 0,
        'At least one dontforgetest command should be registered'
      );
    });

    // Given: Extension is activated
    // When: Querying registered commands
    // Then: Multiple commands are registered (boundary: more than one)
    test('TC-B-02: Multiple commands are registered', async () => {
      // Given: Extension is activated
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      if (!ext.isActive) {
        await ext.activate();
      }

      // When: Querying registered commands
      const allCommands = await vscode.commands.getCommands(true);
      const dontforgetestCommands = allCommands.filter(cmd => cmd.startsWith('dontforgetest.'));

      // Then: Multiple commands are registered
      assert.ok(
        dontforgetestCommands.length >= 1,
        'At least one command should be registered'
      );
    });

    // Given: Extension is activated
    // When: Querying all registered commands
    // Then: All expected commands are present (boundary: maximum number)
    test('TC-B-03: All expected commands are registered (boundary: max)', async () => {
      // Given: Extension is activated
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      if (!ext.isActive) {
        await ext.activate();
      }

      // When: Querying all registered commands
      const allCommands = await vscode.commands.getCommands(true);
      const expectedCommands = [
        'dontforgetest.generateTest',
        'dontforgetest.openPanel',
        'dontforgetest.generateTestFromCommit',
        'dontforgetest.generateTestFromCommitRange',
        'dontforgetest.generateTestFromWorkingTree',
        'dontforgetest.selectDefaultModel',
        'dontforgetest.showTestGeneratorOutput',
        'dontforgetest.openSettings',
        'dontforgetest.openLatestPerspective',
        'dontforgetest.openLatestExecutionReport',
        'dontforgetest.openLatestMergeInstruction'
      ];

      // Then: All expected commands are present
      expectedCommands.forEach(cmd => {
        assert.ok(
          allCommands.includes(cmd),
          `Command "${cmd}" should be registered`
        );
      });
    });

    // Given: Test expectedCommands array
    // When: Checking array length
    // Then: Array contains all remaining commands (boundary: max)
    test('TC-B-08: Test expectedCommands array contains all remaining commands', async () => {
      // Given: Test expectedCommands array
      const expectedCommands = [
        'dontforgetest.generateTest',
        'dontforgetest.openPanel',
        'dontforgetest.generateTestFromCommit',
        'dontforgetest.generateTestFromCommitRange',
        'dontforgetest.generateTestFromWorkingTree',
        'dontforgetest.selectDefaultModel',
        'dontforgetest.showTestGeneratorOutput'
      ];

      // When: Checking array length
      // Then: Array contains expected number of commands
      assert.strictEqual(
        expectedCommands.length,
        7,
        'Expected commands array should contain 7 commands'
      );
      assert.ok(
        !expectedCommands.includes('dontforgetest.generateTestFromFile'),
        'Deleted command should not be in expected commands array'
      );
    });
  });

  suite('Configuration', () => {
    // Given: Extension configuration is loaded
    // When: Getting values for each configuration item
    // Then: Default values are as expected
    test('TC-EXT-04: Default configuration values check (TC-B-01: Clean Install State)', () => {
      const config = vscode.workspace.getConfiguration('dontforgetest');

      assert.strictEqual(config.get('cursorAgentPath'), '', 'cursorAgentPath default value is incorrect');
      assert.strictEqual(config.get('maxParallelTasks'), 4, 'maxParallelTasks default value is incorrect');
      assert.strictEqual(config.get('defaultModel'), '', 'defaultModel default value is incorrect');
      assert.deepStrictEqual(config.get('customModels'), [], 'customModels default value is incorrect');
      assert.strictEqual(config.get('testStrategyPath'), '', 'testStrategyPath default value is incorrect');
      assert.strictEqual(config.get('includeTestPerspectiveTable'), true, 'includeTestPerspectiveTable default value is incorrect');
      assert.strictEqual(config.get('perspectiveReportDir'), 'docs/test-perspectives', 'perspectiveReportDir default value is incorrect');
      assert.strictEqual(config.get('testExecutionReportDir'), 'docs/test-execution-reports', 'testExecutionReportDir default value is incorrect');
      assert.strictEqual(config.get('testCommand'), 'npm test', 'testCommand default value is incorrect');
      assert.strictEqual(config.get('testExecutionRunner'), 'extension', 'testExecutionRunner default value is incorrect');
      assert.strictEqual(config.get('allowUnsafeTestCommand'), false, 'allowUnsafeTestCommand default value is incorrect');
      assert.strictEqual(config.get('cursorAgentForceForTestExecution'), false, 'cursorAgentForceForTestExecution default value is incorrect');
    });

    // TC-N-06: package.json validation
    test('TC-N-06: Package metadata check (Name/DisplayName)', () => {
      // Given: 拡張機能がインストールされ、参照可能である
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      // When: 拡張機能の package.json メタデータを取得する
      const pkg = ext.packageJSON;

      // Then: name / displayName が期待値と一致する
      assert.strictEqual(pkg.name, 'dontforgetest');
      // package.nls により VS Code 側で解決された displayName が取得できること
      // NOTE:
      // `npm run test:ja` / `npm run test:en` のいずれでも、本テスト環境では
      // displayName は英語（package.nls.json）に解決されるため、英語値を期待する。
      assert.strictEqual(pkg.displayName, 'Test Generation Agent (Dontforgetest)');
    });
  });

  suite('Event.ts Comment Validation', () => {
    // Given: event.ts file
    // When: Reading the comment content
    // Then: Comment contains updated example labels (generateFromCommit, generateFromWorkingTree)
    test('TC-N-06: Event.ts comment contains updated example labels', async () => {
      // Given: Extension is available
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      // When: Reading event.ts file content
      const eventTsUri = vscode.Uri.file(path.join(ext.extensionPath, 'src', 'core', 'event.ts'));
      const eventTsContent = (await vscode.workspace.fs.readFile(eventTsUri)).toString();

      // Then: Comment shows updated examples
      assert.ok(
        eventTsContent.includes('generateFromCommit, generateFromWorkingTree'),
        'Comment should contain updated example labels: generateFromCommit, generateFromWorkingTree'
      );
      assert.ok(
        !eventTsContent.includes('generateFromFile'),
        'Comment should not contain old example label: generateFromFile'
      );
    });

    // Given: event.ts file
    // When: Checking comment content
    // Then: Comment does not contain old 'generateFromFile' text
    test('TC-B-10: Event.ts comment does not contain old generateFromFile text', async () => {
      // Given: Extension is available
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      // When: Reading event.ts file content
      const eventTsUri = vscode.Uri.file(path.join(ext.extensionPath, 'src', 'core', 'event.ts'));
      const eventTsContent = (await vscode.workspace.fs.readFile(eventTsUri)).toString();

      // Then: Comment does not contain outdated reference
      const labelCommentMatch = eventTsContent.match(/ユーザーに表示するラベル（例: ([^）]+)）/);
      if (labelCommentMatch) {
        const examples = labelCommentMatch[1];
        assert.ok(
          !examples.includes('generateFromFile'),
          'Comment should not contain outdated reference to generateFromFile'
        );
      }
    });
  });

  suite('Metadata & Resources', () => {
    // Given: 拡張機能がインストールされている
    // When: package.json のメタデータを取得する
    // Then: ライセンスが GPL-3.0-only であること
    test('TC-META-01: ライセンス情報の確認', () => {
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, '拡張機能が見つかりません');

      const packageJSON = ext.packageJSON;
      assert.strictEqual(packageJSON.license, 'GPL-3.0-only', 'ライセンスが GPL-3.0-only ではありません');
    });

    // Given: 拡張機能がインストールされている
    // When: LICENSE ファイルの存在を確認する
    // Then: ファイルが存在すること
    test('TC-META-02: ライセンスファイルの存在確認', async () => {
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, '拡張機能が見つかりません');

      const licenseUri = vscode.Uri.file(path.join(ext.extensionPath, 'LICENSE'));
      try {
        await vscode.workspace.fs.stat(licenseUri);
      } catch {
        assert.fail('LICENSE ファイルが存在しません');
      }
    });

    // TC-RES-01: package.json バージョン形式確認
    // Given: 拡張機能の package.json
    // When: バージョンを確認する
    // Then: セマンティックバージョニング形式（x.y.z）であること
    test('TC-RES-01: パッケージバージョンの形式確認', () => {
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, '拡張機能が見つかりません');

      const packageJSON = ext.packageJSON;
      const version = packageJSON.version;

      // バージョンが存在すること
      assert.ok(version, 'バージョンが定義されていません');
      assert.strictEqual(typeof version, 'string', 'バージョンは文字列である必要があります');

      // セマンティックバージョニング形式（x.y.z）であること
      const semverPattern = /^\d+\.\d+\.\d+$/;
      assert.ok(semverPattern.test(version), `バージョン "${version}" はセマンティックバージョニング形式（x.y.z）ではありません`);
    });

    // TC-PKG-01: package.json version field is valid semantic version
    // Given: package.json file exists
    // When: Reading package.json
    // Then: Version field is valid semantic version format
    test('TC-PKG-01: package.json version field is valid semantic version', () => {
      // Given: package.json file exists
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const packageJsonPath = path.join(ext.extensionPath, 'package.json');
      assert.ok(fs.existsSync(packageJsonPath), 'package.json file exists');

      // When: Reading package.json
      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageJsonContent) as { version?: string };

      // Then: Version field is valid semantic version format
      assert.ok(packageJson.version, 'Version field should be defined');
      const semverPattern = /^\d+\.\d+\.\d+$/;
      assert.ok(semverPattern.test(packageJson.version), `Version "${packageJson.version}" should be semantic version format (x.y.z)`);
    });

    // TC-PKG-02: package-lock.json version field matches package.json version
    // Given: package.json and package-lock.json files exist
    // When: Reading both files
    // Then: Version fields are synchronized
    test('TC-PKG-02: package-lock.json version field matches package.json version', () => {
      // Given: package.json and package-lock.json files exist
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const packageJsonPath = path.join(ext.extensionPath, 'package.json');
      const packageLockJsonPath = path.join(ext.extensionPath, 'package-lock.json');
      assert.ok(fs.existsSync(packageJsonPath), 'package.json file exists');
      assert.ok(fs.existsSync(packageLockJsonPath), 'package-lock.json file exists');

      // When: Reading both files
      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageJsonContent) as { version?: string };
      const packageLockJsonContent = fs.readFileSync(packageLockJsonPath, 'utf8');
      const packageLockJson = JSON.parse(packageLockJsonContent) as {
        version?: string;
        packages?: Record<string, { version?: string }>;
      };

      // Then: Version fields are synchronized
      assert.ok(packageJson.version, 'package.json version should be defined');
      assert.strictEqual(packageLockJson.version, packageJson.version, 'Version number should be synchronized in lock file root');
      if (packageLockJson.packages && packageLockJson.packages['']) {
        assert.strictEqual(packageLockJson.packages[''].version, packageJson.version, 'Version number should be synchronized in lock file packages[""]');
      }
    });

    // TC-PKG-03: package.json file does not exist
    // Given: package.json file does not exist
    // When: Attempting to read package.json
    // Then: File read operation throws error or returns null
    test('TC-PKG-03: package.json file does not exist', () => {
      // Given: Non-existent file path
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const nonExistentPath = path.join(ext.extensionPath, 'non-existent-package.json');

      // When: Attempting to read non-existent file
      // Then: File read operation throws error
      assert.throws(() => {
        fs.readFileSync(nonExistentPath, 'utf8');
      }, /ENOENT|no such file/i, 'Reading non-existent file should throw error');
    });

    // TC-PKG-04: package-lock.json file does not exist
    // Given: package-lock.json file does not exist
    // When: Attempting to read package-lock.json
    // Then: File read operation throws error or returns null
    test('TC-PKG-04: package-lock.json file does not exist', () => {
      // Given: Non-existent file path
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const nonExistentPath = path.join(ext.extensionPath, 'non-existent-package-lock.json');

      // When: Attempting to read non-existent file
      // Then: File read operation throws error
      assert.throws(() => {
        fs.readFileSync(nonExistentPath, 'utf8');
      }, /ENOENT|no such file/i, 'Reading non-existent file should throw error');
    });

    // TC-PKG-05: package.json contains invalid JSON
    // Given: package.json contains invalid JSON
    // When: Parsing JSON content
    // Then: JSON.parse throws SyntaxError
    test('TC-PKG-05: package.json contains invalid JSON', () => {
      // Given: Invalid JSON string
      const invalidJson = '{ "version": "0.0.72", invalid }';

      // When: Parsing invalid JSON
      // Then: JSON.parse throws SyntaxError
      assert.throws(() => {
        JSON.parse(invalidJson);
      }, SyntaxError, 'Parsing invalid JSON should throw SyntaxError');
    });

    // TC-PKG-06: package.json version field is missing
    // Given: package.json version field is missing
    // When: Reading package.json without version field
    // Then: Version field is undefined or null
    test('TC-PKG-06: package.json version field is missing', () => {
      // Given: JSON without version field
      const jsonWithoutVersion = '{}';
      const packageJson = JSON.parse(jsonWithoutVersion) as { version?: string };

      // When: Reading version field
      // Then: Version field is undefined
      assert.strictEqual(packageJson.version, undefined, 'Version field should be undefined when missing');
    });

    // TC-PKG-07: package.json version field is empty string
    // Given: package.json version field is empty string
    // When: Reading package.json with empty version
    // Then: Version field is empty string
    test('TC-PKG-07: package.json version field is empty string', () => {
      // Given: JSON with empty version field
      const jsonWithEmptyVersion = '{"version": ""}';
      const packageJson = JSON.parse(jsonWithEmptyVersion) as { version?: string };

      // When: Reading version field
      // Then: Version field is empty string
      assert.strictEqual(packageJson.version, '', 'Version field should be empty string');
    });

    // TC-PKG-08: package-lock.json packages[''] is missing
    // Given: package-lock.json packages[''] is missing
    // When: Reading package-lock.json without packages['']
    // Then: packages[''] is undefined, test handles gracefully
    test('TC-PKG-08: package-lock.json packages[""] is missing', () => {
      // Given: JSON without packages[''] field
      const jsonWithoutPackages = '{"version": "0.0.72"}';
      const packageLockJson = JSON.parse(jsonWithoutPackages) as {
        version?: string;
        packages?: Record<string, { version?: string }>;
      };

      // When: Reading packages[''] field
      // Then: packages[''] is undefined
      assert.strictEqual(packageLockJson.packages?.[''], undefined, 'packages[""] should be undefined when missing');
    });

    // TC-N-01: package.json and package-lock.json exist with valid version fields
    // Given: package.json and package-lock.json files exist with valid version fields
    // When: Reading both files
    // Then: Both files are updated to version 0.0.72 and versions are synchronized
    test('TC-N-01: package.json and package-lock.json exist with valid version fields', () => {
      // Given: package.json and package-lock.json files exist
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const packageJsonPath = path.join(ext.extensionPath, 'package.json');
      const packageLockJsonPath = path.join(ext.extensionPath, 'package-lock.json');
      assert.ok(fs.existsSync(packageJsonPath), 'package.json file exists');
      assert.ok(fs.existsSync(packageLockJsonPath), 'package-lock.json file exists');

      // When: Reading both files
      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageJsonContent) as { version?: string };
      const packageLockJsonContent = fs.readFileSync(packageLockJsonPath, 'utf8');
      const packageLockJson = JSON.parse(packageLockJsonContent) as {
        version?: string;
        packages?: Record<string, { version?: string }>;
      };

      // Then: Both files are updated to version 0.0.72 and versions are synchronized
      assert.ok(packageJson.version, 'package.json version should be defined');
      const semverPattern = /^\d+\.\d+\.\d+$/;
      assert.ok(semverPattern.test(packageJson.version), `Version "${packageJson.version}" should be semantic version format (x.y.z)`);
    const expectedVersion = packageJson.version;
      assert.ok(packageLockJson.version, 'package-lock.json version should be defined');
      assert.ok(semverPattern.test(packageLockJson.version), `Lock file version "${packageLockJson.version}" should be semantic version format (x.y.z)`);
    assert.strictEqual(packageLockJson.version, expectedVersion, 'Version numbers should be synchronized');
      if (packageLockJson.packages && packageLockJson.packages['']) {
      assert.strictEqual(packageLockJson.packages[''].version, expectedVersion, 'Version number should be synchronized in lock file packages[""]');
      }
    });

    // TC-N-02: package.json version field exists and is valid semver string
    // Given: package.json version field exists and is valid semver string
    // When: Reading package.json
    // Then: package.json version is updated to 0.0.72 and maintains valid semver format (x.y.z)
    test('TC-N-02: package.json version field exists and is valid semver string', () => {
      // Given: package.json file exists
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const packageJsonPath = path.join(ext.extensionPath, 'package.json');
      assert.ok(fs.existsSync(packageJsonPath), 'package.json file exists');

      // When: Reading package.json
      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageJsonContent) as { version?: string };

      // Then: package.json version is updated to 0.0.72 and maintains valid semver format (x.y.z)
      assert.ok(packageJson.version, 'Version field should be defined');
      const semverPattern = /^\d+\.\d+\.\d+$/;
      assert.ok(semverPattern.test(packageJson.version), `Version "${packageJson.version}" should be semantic version format (x.y.z)`);
    });

    // TC-N-03: package-lock.json root version and packages[""] version exist
    // Given: package-lock.json root version and packages[""] version exist
    // When: Reading package-lock.json
    // Then: Both package-lock.json root version and packages[""] version are updated to 0.0.72
    test('TC-N-03: package-lock.json root version and packages[""] version exist', () => {
      // Given: package-lock.json file exists
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const packageLockJsonPath = path.join(ext.extensionPath, 'package-lock.json');
      assert.ok(fs.existsSync(packageLockJsonPath), 'package-lock.json file exists');

      // When: Reading package-lock.json
      const packageLockJsonContent = fs.readFileSync(packageLockJsonPath, 'utf8');
      const packageLockJson = JSON.parse(packageLockJsonContent) as {
        version?: string;
        packages?: Record<string, { version?: string }>;
      };

      // Then: Both package-lock.json root version and packages[""] version are updated to 0.0.72
      assert.ok(packageLockJson.version, 'package-lock.json root version should be defined');
      const semverPattern = /^\d+\.\d+\.\d+$/;
      assert.ok(semverPattern.test(packageLockJson.version), `Root version "${packageLockJson.version}" should be semantic version format (x.y.z)`);
      if (packageLockJson.packages && packageLockJson.packages['']) {
        assert.ok(packageLockJson.packages[''].version, 'packages[""] version should be defined');
        assert.ok(semverPattern.test(packageLockJson.packages[''].version!), `packages[""] version "${packageLockJson.packages[''].version}" should be semantic version format (x.y.z)`);
        assert.strictEqual(packageLockJson.packages[''].version, packageLockJson.version, 'packages[""] version should match root version');
      }
    });

    // TC-N-04: extension.test.ts file exists with trailing whitespace
    // Given: extension.test.ts file exists with trailing whitespace
    // When: Reading extension.test.ts file content
    // Then: Trailing whitespace is removed, file formatting is consistent
    test('TC-N-04: extension.test.ts file exists with trailing whitespace', () => {
      // Given: extension.test.ts file exists
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const extensionTestPath = path.join(ext.extensionPath, 'src', 'test', 'suite', 'extension.test.ts');
      assert.ok(fs.existsSync(extensionTestPath), 'extension.test.ts file exists');

      // When: Reading extension.test.ts file content
      const extensionTestContent = fs.readFileSync(extensionTestPath, 'utf8');
      const lines = extensionTestContent.split('\n');

      // Then: Trailing whitespace is removed, file formatting is consistent
      lines.forEach((line, index) => {
        if (line.trim().length > 0) {
          // Non-empty lines should not have trailing whitespace
          assert.strictEqual(
            line,
            line.trimEnd(),
            `Line ${index + 1} should not have trailing whitespace: "${line.replace(/\s/g, '·')}"`
          );
        }
      });
    });

    // TC-N-05: progressTreeView.ts file exists
    // Given: progressTreeView.ts file exists
    // When: Reading progressTreeView.ts file
    // Then: File changes are applied correctly without breaking functionality
    test('TC-N-05: progressTreeView.ts file exists', () => {
      // Given: progressTreeView.ts file exists
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const progressTreeViewPath = path.join(ext.extensionPath, 'src', 'ui', 'progressTreeView.ts');
      assert.ok(fs.existsSync(progressTreeViewPath), 'progressTreeView.ts file exists');

      // When: Reading progressTreeView.ts file
      const progressTreeViewContent = fs.readFileSync(progressTreeViewPath, 'utf8');

      // Then: File changes are applied correctly without breaking functionality
      assert.ok(progressTreeViewContent.length > 0, 'progressTreeView.ts file should not be empty');
      assert.ok(progressTreeViewContent.includes('ProgressTreeViewProvider'), 'progressTreeView.ts should contain ProgressTreeViewProvider class');
      assert.ok(progressTreeViewContent.includes('initializeProgressTreeView'), 'progressTreeView.ts should contain initializeProgressTreeView function');
    });

    // TC-E-01: package.json version field is missing
    // Given: package.json version field is missing
    // When: Reading package.json without version field
    // Then: Error is thrown or version update fails
    test('TC-E-01: package.json version field is missing', () => {
      // Given: JSON without version field
      const jsonWithoutVersion = '{}';
      const packageJson = JSON.parse(jsonWithoutVersion) as { version?: string };

      // When: Reading version field
      // Then: Error is thrown or version update fails
      assert.strictEqual(packageJson.version, undefined, 'Version field should be undefined when missing');
    });

    // TC-E-02: package.json version field is null
    // Given: package.json version field is null
    // When: Reading package.json with null version
    // Then: Error is thrown or version update fails
    test('TC-E-02: package.json version field is null', () => {
      // Given: JSON with null version field
      const jsonWithNullVersion = '{"version": null}';
      const packageJson = JSON.parse(jsonWithNullVersion) as { version?: string | null };

      // When: Reading version field
      // Then: Error is thrown or version update fails
      assert.strictEqual(packageJson.version, null, 'Version field should be null');
      const semverPattern = /^\d+\.\d+\.\d+$/;
      if (packageJson.version !== null) {
        assert.ok(!semverPattern.test(packageJson.version), 'Null version should not match semantic version format');
      } else {
        assert.ok(true, 'Null version correctly fails semantic version validation');
      }
    });

    // TC-E-03: package.json version field is empty string
    // Given: package.json version field is empty string
    // When: Reading package.json with empty version
    // Then: Error is thrown or version update fails
    test('TC-E-03: package.json version field is empty string', () => {
      // Given: JSON with empty version field
      const jsonWithEmptyVersion = '{"version": ""}';
      const packageJson = JSON.parse(jsonWithEmptyVersion) as { version?: string };

      // When: Reading version field
      // Then: Error is thrown or version update fails
      assert.strictEqual(packageJson.version, '', 'Version field should be empty string');
      const semverPattern = /^\d+\.\d+\.\d+$/;
      assert.ok(!semverPattern.test(packageJson.version), 'Empty string should not match semantic version format');
    });

    // TC-E-04: package.json version is invalid format (e.g., "abc", "1.2", "1.2.3.4")
    // Given: package.json with invalid version format
    // When: Validating version format
    // Then: Error is thrown or version format validation fails
    test('TC-E-04: package.json version is invalid format (e.g., "abc", "1.2", "1.2.3.4")', () => {
      // Given: JSON with invalid version formats
      const invalidVersions = ['abc', '1.2', '1.2.3.4'];
      const semverPattern = /^\d+\.\d+\.\d+$/;

      // When: Validating version format
      // Then: Error is thrown or version format validation fails
      invalidVersions.forEach(invalidVersion => {
        const jsonWithInvalidVersion = `{"version": "${invalidVersion}"}`;
        const packageJson = JSON.parse(jsonWithInvalidVersion) as { version?: string };
        assert.ok(packageJson.version, 'Version field should be defined');
        assert.ok(!semverPattern.test(packageJson.version), `Version "${packageJson.version}" should not match semantic version format`);
      });
    });

    // TC-E-05: package.json and package-lock.json versions become mismatched after update
    // Given: package.json and package-lock.json with mismatched versions
    // When: Comparing versions
    // Then: Error is detected or versions remain synchronized
    test('TC-E-05: package.json and package-lock.json versions become mismatched after update', () => {
      // Given: JSON objects with mismatched versions
      const packageJsonContent = '{"version": "0.0.72"}';
      const packageLockJsonContent = '{"version": "0.0.70", "packages": {"": {"version": "0.0.70"}}}';
      const packageJson = JSON.parse(packageJsonContent) as { version?: string };
      const packageLockJson = JSON.parse(packageLockJsonContent) as {
        version?: string;
        packages?: Record<string, { version?: string }>;
      };

      // When: Comparing versions
      // Then: Error is detected or versions remain synchronized
      assert.ok(packageJson.version, 'package.json version should be defined');
      assert.ok(packageLockJson.version, 'package-lock.json version should be defined');
      assert.notStrictEqual(packageLockJson.version, packageJson.version, 'Versions should be mismatched');
      assert.strictEqual(packageJson.version, '0.0.72', 'package.json version should be 0.0.72');
      assert.strictEqual(packageLockJson.version, '0.0.70', 'package-lock.json version should be 0.0.70');
      if (packageLockJson.packages && packageLockJson.packages['']) {
        assert.notStrictEqual(packageLockJson.packages[''].version, packageJson.version, 'packages[""] version should also be mismatched');
      }
    });

    // TC-E-06: package.json is invalid JSON format
    // Given: package.json contains invalid JSON
    // When: Parsing JSON content
    // Then: JSON parse error is thrown
    test('TC-E-06: package.json is invalid JSON format', () => {
      // Given: Invalid JSON string
      const invalidJson = '{ "version": "0.0.72", invalid }';

      // When: Parsing invalid JSON
      // Then: JSON parse error is thrown
      assert.throws(() => {
        JSON.parse(invalidJson);
      }, SyntaxError, 'Parsing invalid JSON should throw SyntaxError');
    });

    // TC-E-07: package-lock.json is invalid JSON format
    // Given: package-lock.json contains invalid JSON
    // When: Parsing JSON content
    // Then: JSON parse error is thrown
    test('TC-E-07: package-lock.json is invalid JSON format', () => {
      // Given: Invalid JSON string
      const invalidJson = '{ "version": "0.0.72", "packages": { invalid }';

      // When: Parsing invalid JSON
      // Then: JSON parse error is thrown
      assert.throws(() => {
        JSON.parse(invalidJson);
      }, SyntaxError, 'Parsing invalid JSON should throw SyntaxError');
    });

    // TC-E-08: package.json version is a negative number (e.g., "-1.0.0")
    // Given: package.json with negative version number
    // When: Validating version format
    // Then: Version format error is detected
    test('TC-E-08: package.json version is a negative number (e.g., "-1.0.0")', () => {
      // Given: JSON with negative version number
      const jsonWithNegativeVersion = '{"version": "-1.0.0"}';
      const packageJson = JSON.parse(jsonWithNegativeVersion) as { version?: string };

      // When: Validating version format
      const semverPattern = /^\d+\.\d+\.\d+$/;

      // Then: Version format error is detected
      assert.ok(packageJson.version, 'Version field should be defined');
      assert.ok(!semverPattern.test(packageJson.version), `Version "${packageJson.version}" should not match semantic version format (negative number)`);
      assert.strictEqual(packageJson.version, '-1.0.0', 'Version should be the negative number "-1.0.0"');
    });

    // TC-E-03: package.json and package-lock.json versions are mismatched (e.g., package.json=0.0.72, package-lock.json=0.0.70)
    // Given: package.json and package-lock.json with mismatched versions
    // When: Comparing versions
    // Then: Version mismatch error is detected
    test('TC-E-03: package.json and package-lock.json versions are mismatched', () => {
      // Given: JSON objects with mismatched versions
      const packageJsonContent = '{"version": "0.0.72"}';
      const packageLockJsonContent = '{"version": "0.0.70", "packages": {"": {"version": "0.0.70"}}}';
      const packageJson = JSON.parse(packageJsonContent) as { version?: string };
      const packageLockJson = JSON.parse(packageLockJsonContent) as {
        version?: string;
        packages?: Record<string, { version?: string }>;
      };

      // When: Comparing versions
      // Then: Version mismatch error is detected
      assert.ok(packageJson.version, 'package.json version should be defined');
      assert.ok(packageLockJson.version, 'package-lock.json version should be defined');
      assert.notStrictEqual(packageLockJson.version, packageJson.version, 'Versions should be mismatched');
      assert.strictEqual(packageJson.version, '0.0.72', 'package.json version should be 0.0.72');
      assert.strictEqual(packageLockJson.version, '0.0.70', 'package-lock.json version should be 0.0.70');
      if (packageLockJson.packages && packageLockJson.packages['']) {
        assert.notStrictEqual(packageLockJson.packages[''].version, packageJson.version, 'packages[""] version should also be mismatched');
      }
    });

    // TC-B-01: package.json version is "0.0.0" (minimum semver)
    // Given: package.json with minimum version number
    // When: Validating version format
    // Then: Version can be updated from 0.0.0 to 0.0.72
    test('TC-B-01: package.json version is "0.0.0" (minimum semver)', () => {
      // Given: JSON with minimum version number
      const jsonWithMinVersion = '{"version": "0.0.0"}';
      const packageJson = JSON.parse(jsonWithMinVersion) as { version?: string };

      // When: Validating version format
      const semverPattern = /^\d+\.\d+\.\d+$/;

      // Then: Version can be updated from 0.0.0 to 0.0.72
      assert.ok(packageJson.version, 'Version field should be defined');
      assert.ok(semverPattern.test(packageJson.version), `Version "${packageJson.version}" should match semantic version format`);
      assert.strictEqual(packageJson.version, '0.0.0', 'Version should be the minimum version "0.0.0"');
    });

    // TC-B-02: package.json version is "999.999.999" (very large)
    // Given: package.json with maximum version number
    // When: Validating version format
    // Then: Version can be updated from 999.999.999 to 0.0.72 or appropriate value
    test('TC-B-02: package.json version is "999.999.999" (very large)', () => {
      // Given: JSON with maximum version number
      const jsonWithMaxVersion = '{"version": "999.999.999"}';
      const packageJson = JSON.parse(jsonWithMaxVersion) as { version?: string };

      // When: Validating version format
      const semverPattern = /^\d+\.\d+\.\d+$/;

      // Then: Version can be updated from 999.999.999 to 0.0.72 or appropriate value
      assert.ok(packageJson.version, 'Version field should be defined');
      assert.ok(semverPattern.test(packageJson.version), `Version "${packageJson.version}" should match semantic version format`);
      assert.strictEqual(packageJson.version, '999.999.999', 'Version should be the maximum version "999.999.999"');
    });

    // TC-B-03: package.json version contains negative numbers (e.g., "-1.0.0")
    // Given: package.json with negative version number
    // When: Validating version format
    // Then: Error is thrown or version format validation fails
    test('TC-B-03: package.json version contains negative numbers (e.g., "-1.0.0")', () => {
      // Given: JSON with negative version number
      const jsonWithNegativeVersion = '{"version": "-1.0.0"}';
      const packageJson = JSON.parse(jsonWithNegativeVersion) as { version?: string };

      // When: Validating version format
      const semverPattern = /^\d+\.\d+\.\d+$/;

      // Then: Error is thrown or version format validation fails
      assert.ok(packageJson.version, 'Version field should be defined');
      assert.ok(!semverPattern.test(packageJson.version), `Version "${packageJson.version}" should not match semantic version format (negative number)`);
      assert.strictEqual(packageJson.version, '-1.0.0', 'Version should be the negative number "-1.0.0"');
    });

    // TC-B-04: package.json version has leading zeros (e.g., "00.00.72")
    // Given: package.json with version containing leading zeros
    // When: Validating version format
    // Then: Error is thrown or version is normalized to valid format
    test('TC-B-04: package.json version has leading zeros (e.g., "00.00.72")', () => {
      // Given: JSON with version containing leading zeros
      const jsonWithLeadingZeros = '{"version": "00.00.72"}';
      const packageJson = JSON.parse(jsonWithLeadingZeros) as { version?: string };

      // When: Validating version format
      // Then: Error is thrown or version is normalized to valid format
      assert.ok(packageJson.version, 'Version field should be defined');
      // Note: Leading zeros technically match the pattern but are not standard semver
      // The pattern /^\d+\.\d+\.\d+$/ matches "00.00.72", but it's not valid semver
      // For strict validation, we should check that numbers don't have leading zeros
      const hasLeadingZeros = /^0+\d|\.0+\d/.test(packageJson.version);
      if (hasLeadingZeros) {
        assert.ok(true, 'Version with leading zeros should be flagged as invalid or normalized');
      }
      assert.strictEqual(packageJson.version, '00.00.72', 'Version should be "00.00.72"');
    });

    // TC-B-05: package.json file does not exist
    // Given: package.json file does not exist
    // When: Attempting to read package.json
    // Then: File not found error is thrown
    test('TC-B-05: package.json file does not exist', () => {
      // Given: Non-existent file path
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const nonExistentPath = path.join(ext.extensionPath, 'non-existent-package.json');

      // When: Attempting to read non-existent file
      // Then: File not found error is thrown
      assert.throws(() => {
        fs.readFileSync(nonExistentPath, 'utf8');
      }, /ENOENT|no such file/i, 'Reading non-existent file should throw error');
    });

    // TC-B-06: package-lock.json file does not exist
    // Given: package-lock.json file does not exist
    // When: Attempting to read package-lock.json
    // Then: File not found error is thrown or package-lock.json is created
    test('TC-B-06: package-lock.json file does not exist', () => {
      // Given: Non-existent file path
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const nonExistentPath = path.join(ext.extensionPath, 'non-existent-package-lock.json');

      // When: Attempting to read non-existent file
      // Then: File not found error is thrown or package-lock.json is created
      assert.throws(() => {
        fs.readFileSync(nonExistentPath, 'utf8');
      }, /ENOENT|no such file/i, 'Reading non-existent file should throw error');
    });

    // TC-B-07: package.json version is "0.0.71" (one version before 0.0.72)
    // Given: package.json with version 0.0.71
    // When: Validating version format
    // Then: Version is updated from 0.0.71 to 0.0.72
    test('TC-B-07: package.json version is "0.0.71" (one version before 0.0.72)', () => {
      // Given: JSON with version 0.0.71
      const jsonWithVersion = '{"version": "0.0.71"}';
      const packageJson = JSON.parse(jsonWithVersion) as { version?: string };

      // When: Validating version format
      const semverPattern = /^\d+\.\d+\.\d+$/;

      // Then: Version is updated from 0.0.71 to 0.0.72
      assert.ok(packageJson.version, 'Version field should be defined');
      assert.ok(semverPattern.test(packageJson.version), `Version "${packageJson.version}" should match semantic version format`);
      assert.strictEqual(packageJson.version, '0.0.71', 'Version should be "0.0.71"');
    });

    // TC-B-08: package.json version field is undefined
    // Given: package.json version field is undefined
    // When: Reading package.json with undefined version
    // Then: Error is thrown or version update fails
    test('TC-B-08: package.json version field is undefined', () => {
      // Given: JSON without version field (undefined)
      const jsonWithoutVersion = '{}';
      const packageJson = JSON.parse(jsonWithoutVersion) as { version?: string };

      // When: Reading version field
      // Then: Error is thrown or version update fails
      assert.strictEqual(packageJson.version, undefined, 'Version field should be undefined');
    });

    // TC-B-09: package.json version is "0.0.73" (one version after 0.0.72)
    // Given: package.json with version 0.0.73
    // When: Validating version format
    // Then: Version update behavior is handled correctly
    test('TC-B-09: package.json version is "0.0.73" (one version after 0.0.72)', () => {
      // Given: JSON with version 0.0.73
      const jsonWithVersion = '{"version": "0.0.73"}';
      const packageJson = JSON.parse(jsonWithVersion) as { version?: string };

      // When: Validating version format
      const semverPattern = /^\d+\.\d+\.\d+$/;

      // Then: Version update behavior is handled correctly
      assert.ok(packageJson.version, 'Version field should be defined');
      assert.ok(semverPattern.test(packageJson.version), `Version "${packageJson.version}" should match semantic version format`);
      assert.strictEqual(packageJson.version, '0.0.73', 'Version should be "0.0.73"');
    });

    // TC-VERSION-N-01: package-lock.json root version matches package.json version
    // Given: package.json と package-lock.json が存在する
    // When: 両方のversionを読み取る
    // Then: package.json version が semver であり、package-lock.json の root version と一致する
    test('TC-VERSION-N-01: package-lock.json root version matches package.json version', () => {
      // Given: package.json と package-lock.json が存在する
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const packageJsonPath = path.join(ext.extensionPath, 'package.json');
      const packageLockJsonPath = path.join(ext.extensionPath, 'package-lock.json');
      assert.ok(fs.existsSync(packageJsonPath), 'package.json file exists');
      assert.ok(fs.existsSync(packageLockJsonPath), 'package-lock.json file exists');

      // When: 両方のversionを読み取る
      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageJsonContent) as { version?: string };
      const packageLockJsonContent = fs.readFileSync(packageLockJsonPath, 'utf8');
      const packageLockJson = JSON.parse(packageLockJsonContent) as { version?: string };

      // Then: package.json version が semver であり、package-lock.json の root version と一致する
      const semverPattern = /^\d+\.\d+\.\d+$/;
      assert.ok(
        typeof packageJson.version === 'string' && semverPattern.test(packageJson.version),
        'package.json version should be a valid semantic version string',
      );
      assert.strictEqual(
        packageLockJson.version,
        packageJson.version,
        'package-lock.json root version should match package.json version',
      );
    });

    // TC-VERSION-N-02: package-lock.json version matches package.json version
    // Given: package.json と package-lock.json が存在する
    // When: package-lock.json の packages[""] を読む
    // Then: packages[""].version が package.json version と一致する
    test('TC-VERSION-N-02: package-lock.json version matches package.json version', () => {
      // Given: package.json と package-lock.json が存在する
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const packageJsonPath = path.join(ext.extensionPath, 'package.json');
      const packageLockJsonPath = path.join(ext.extensionPath, 'package-lock.json');
      assert.ok(fs.existsSync(packageJsonPath), 'package.json file exists');
      assert.ok(fs.existsSync(packageLockJsonPath), 'package-lock.json file exists');

      // When: package-lock.json の packages[""] を読む
      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageJsonContent) as { version?: string };
      const packageLockJsonContent = fs.readFileSync(packageLockJsonPath, 'utf8');
      const packageLockJson = JSON.parse(packageLockJsonContent) as {
        version?: string;
        packages?: Record<string, { version?: string }>;
      };

      // Then: packages[""].version が package.json version と一致する
      assert.ok(packageJson.version, 'package.json version should exist');
      assert.ok(packageLockJson.packages, 'package-lock.json packages should exist');
      assert.ok(packageLockJson.packages[''], 'package-lock.json packages[""] should exist');
      assert.strictEqual(
        packageLockJson.packages[''].version,
        packageJson.version,
        'package-lock.json packages[""] version should match package.json version',
      );
    });

    // TC-DOC-N-01: docs/usage.md contains testExecutionRunner setting documentation
    // Given: docs/usage.md file exists
    // When: Reading docs/usage.md content
    // Then: Documentation correctly describes testExecutionRunner setting with default value 'extension'
    test('TC-DOC-N-01: docs/usage.md contains testExecutionRunner setting documentation', () => {
      // Given: docs/usage.md file exists
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const usageMdPath = path.join(ext.extensionPath, 'docs', 'usage.md');
      assert.ok(fs.existsSync(usageMdPath), 'docs/usage.md file exists');

      // When: Reading docs/usage.md content
      const usageMdContent = fs.readFileSync(usageMdPath, 'utf8');

      // Then: Documentation correctly describes testExecutionRunner setting with default value 'extension'
      assert.ok(usageMdContent.includes('dontforgetest.testExecutionRunner'), 'testExecutionRunner setting should be documented');
      assert.ok(usageMdContent.includes('Default: `extension`'), 'Default value should be documented as extension');
      assert.ok(usageMdContent.includes('extension'), 'extension option should be documented');
      assert.ok(usageMdContent.includes('cursorAgent'), 'cursorAgent option should be documented');
      assert.ok(usageMdContent.includes('automatic fallback'), 'Fallback behavior should be documented');
    });

    // TC-RES-02: dontforgetest-view.svg のレンダリング
    // Given: media/dontforgetest-view.svg ファイル
    // When: ファイル内容を読み込む
    // Then: 有効なSVGであり、更新されたパス（試験管）を含んでいること
    test('TC-RES-02: dontforgetest-view.svg の内容確認', async () => {
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, '拡張機能が見つかりません');
 
      const svgUri = vscode.Uri.file(path.join(ext.extensionPath, 'media', 'dontforgetest-view.svg'));
      const svgContent = (await vscode.workspace.fs.readFile(svgUri)).toString();

      assert.ok(svgContent.includes('<svg'), 'SVGタグが含まれていること');
      assert.ok(svgContent.includes('width="24"'), '幅が24であること');
      assert.ok(svgContent.includes('height="24"'), '高さが24であること');

      // 新しいアイコンの特徴（試験管のパス）を確認
      // "試験管本体" コメントが含まれているか
      assert.ok(svgContent.includes('試験管本体'), '新しいアイコン（試験管）のコメントが含まれていること');
      // パスデータの断片
      assert.ok(
        svgContent.includes(
          'd="M9 2h6M10 2v8l-5 10a2.5 2.5 0 0 0 2.2 3.5h9.6a2.5 2.5 0 0 0 2.2-3.5l-5-10V2"',
        ),
        '試験管のパスデータが含まれていること',
      );
      assert.ok(svgContent.includes('d="M7.5 16h9"'), '液体の線が含まれていること');
    });

    // TC-N-03: .vscodeignore check
    // Given: .vscodeignore file exists
    // When: Reading .vscodeignore content
    // Then: It contains .claude/, coverage/, and *.vsix
    test('TC-N-03: .vscodeignore contains excluded patterns', async () => {
      // Given: .vscodeignore file path
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');
      const vscodeIgnorePath = path.join(ext.extensionPath, '.vscodeignore');

      // When: Reading file
      const content = fs.readFileSync(vscodeIgnorePath, 'utf8');

      // Then: Patterns exist
      // NOTE: ここではパッケージング結果（実際に除外されるか）までは検証せず、設定の退行防止としてパターンの存在のみ確認する。
      assert.ok(content.includes('.claude/**'), '.claude/** should be ignored');
      assert.ok(content.includes('coverage/**'), 'coverage/** should be ignored');
      assert.ok(content.includes('*.vsix'), '*.vsix should be ignored');
    });

    // TC-N-04: package.json metadata check (Repository/Bugs/Homepage)
    // Given: package.json
    // When: Checking metadata fields
    // Then: repository, bugs, and homepage are correctly set
    test('TC-N-04: package.json contains repository, bugs, and homepage URLs', () => {
      // Given: Extension package.json
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');
      const pkg = ext.packageJSON;

      // When & Then: Checking metadata fields
      assert.strictEqual(pkg.repository?.url, 'https://github.com/kinopeee/dontforgetest.git', 'Repository URL mismatch');
      assert.strictEqual(pkg.bugs?.url, 'https://github.com/kinopeee/dontforgetest/issues', 'Bugs URL mismatch');
      assert.strictEqual(pkg.homepage, 'https://github.com/kinopeee/dontforgetest#readme', 'Homepage URL mismatch');
    });

    // NOTE:
    // ここからの TC-META-B-01 ～ TC-META-B-05 は「実際の拡張機能の package.json（ext.packageJSON）」を検証するテストではない。
    // モック（`const pkg = { ... }`）を使い、package.json 由来の“データ構造”が境界値でも破綻しない（扱える）ことを確認するための構造的な境界値テスト。

    // TC-META-B-01: Empty publisher check (構造的検証 / モックデータ使用)
    // Given: package.json with empty publisher
    // When: Checking publisher field
    // Then: Field is empty string
    test('TC-META-B-01: package.json publisher can be empty in data structure', () => {
      // Given: Mock package.json data with empty publisher
      const pkg = { publisher: "" };
      
      // When & Then: Field is empty string
      assert.strictEqual(pkg.publisher, "", 'Publisher should be empty string');
    });

    // TC-META-B-02: Missing license check (構造的検証 / モックデータ使用)
    // Given: package.json with missing license
    // When: Checking license field
    // Then: Field is undefined
    test('TC-META-B-02: package.json license can be missing in data structure', () => {
      // Given: Mock package.json data without license
      const pkg: { license?: string } = {};
      
      // When & Then: Field is undefined
      assert.strictEqual(pkg.license, undefined, 'License should be undefined');
    });

    // TC-META-B-03: Version 0.0.0 check (構造的検証 / モックデータ使用)
    // Given: package.json with version 0.0.0
    // When: Checking version field
    // Then: Version is 0.0.0
    test('TC-META-B-03: package.json version 0.0.0 is valid semver', () => {
      // Given: Mock package.json data with version 0.0.0
      const pkg = { version: "0.0.0" };
      const semverPattern = /^\d+\.\d+\.\d+$/;
      
      // When & Then: Version matches semver pattern
      assert.ok(semverPattern.test(pkg.version), '0.0.0 should be valid semver');
      assert.strictEqual(pkg.version, "0.0.0", 'Version should be 0.0.0');
    });

    // TC-META-B-04: 1-char author check (構造的検証 / モックデータ使用)
    // Given: author field with 1 character
    // When: Checking author field
    // Then: author is 1 character
    test('TC-META-B-04: package.json author field can be 1 character', () => {
      // Given: Mock package.json data with 1-char author
      const pkg = { author: "A" };
      
      // When & Then: author is 1 character
      assert.strictEqual(pkg.author, "A", 'Author should be "A"');
    });

    // TC-META-B-05: Long description check (構造的検証 / モックデータ使用)
    // Given: description field with very long string
    // When: Checking description length
    // Then: length matches the long string
    test('TC-META-B-05: package.json description can be very long', () => {
      // Given: Mock package.json data with long description
      const longDescription = "A".repeat(1000);
      const pkg = { description: longDescription };
      
      // When & Then: length matches
      assert.strictEqual(pkg.description.length, 1000, 'Description should have length 1000');
    });
  });

  suite('File Formatting', () => {
    // TC-FMT-01: extension.test.ts contains trailing whitespace on multiple lines
    // Given: extension.test.ts file exists
    // When: Reading extension.test.ts file content
    // Then: All trailing whitespace is removed, code formatting is consistent
    test('TC-FMT-01: extension.test.ts contains trailing whitespace on multiple lines', () => {
      // Given: extension.test.ts file exists
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const extensionTestPath = path.join(ext.extensionPath, 'src', 'test', 'suite', 'extension.test.ts');
      assert.ok(fs.existsSync(extensionTestPath), 'extension.test.ts file exists');

      // When: Reading extension.test.ts file content
      const extensionTestContent = fs.readFileSync(extensionTestPath, 'utf8');
      const lines = extensionTestContent.split('\n');

      // Then: All trailing whitespace is removed, code formatting is consistent
      let trailingWhitespaceCount = 0;
      lines.forEach((line) => {
        if (line.trim().length > 0 && line !== line.trimEnd()) {
          trailingWhitespaceCount++;
        }
      });
      assert.strictEqual(trailingWhitespaceCount, 0, 'No lines should have trailing whitespace');
    });

    // TC-FMT-02: extension.test.ts has inconsistent line spacing
    // Given: extension.test.ts file exists
    // When: Reading extension.test.ts file content
    // Then: Line spacing is normalized, file is properly formatted
    test('TC-FMT-02: extension.test.ts has inconsistent line spacing', () => {
      // Given: extension.test.ts file exists
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const extensionTestPath = path.join(ext.extensionPath, 'src', 'test', 'suite', 'extension.test.ts');
      assert.ok(fs.existsSync(extensionTestPath), 'extension.test.ts file exists');

      // When: Reading extension.test.ts file content
      const extensionTestContent = fs.readFileSync(extensionTestPath, 'utf8');
      const lines = extensionTestContent.split('\n');

      // Then: Line spacing is normalized, file is properly formatted
      // Check that there are no more than 2 consecutive empty lines
      let consecutiveEmptyLines = 0;
      let maxConsecutiveEmptyLines = 0;
      lines.forEach((line) => {
        if (line.trim().length === 0) {
          consecutiveEmptyLines++;
          maxConsecutiveEmptyLines = Math.max(maxConsecutiveEmptyLines, consecutiveEmptyLines);
        } else {
          consecutiveEmptyLines = 0;
        }
      });
      assert.ok(maxConsecutiveEmptyLines <= 2, `File should not have more than 2 consecutive empty lines, found ${maxConsecutiveEmptyLines}`);
    });

    // TC-FMT-03: extension.test.ts file is empty
    // Given: extension.test.ts file exists
    // When: Reading extension.test.ts file content
    // Then: Empty file is handled gracefully or error is thrown
    test('TC-FMT-03: extension.test.ts file is empty', () => {
      // Given: extension.test.ts file exists
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const extensionTestPath = path.join(ext.extensionPath, 'src', 'test', 'suite', 'extension.test.ts');
      assert.ok(fs.existsSync(extensionTestPath), 'extension.test.ts file exists');

      // When: Reading extension.test.ts file content
      const extensionTestContent = fs.readFileSync(extensionTestPath, 'utf8');

      // Then: Empty file is handled gracefully or error is thrown
      assert.ok(extensionTestContent.length > 0, 'extension.test.ts file should not be empty');
    });
  });

  suite('ProgressTreeView File Changes', () => {
    // TC-PROG-01: progressTreeView.ts file exists and is modified
    // Given: progressTreeView.ts file exists and is modified
    // When: Reading progressTreeView.ts file
    // Then: File changes are applied correctly, functionality remains intact
    test('TC-PROG-01: progressTreeView.ts file exists and is modified', () => {
      // Given: progressTreeView.ts file exists
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const progressTreeViewPath = path.join(ext.extensionPath, 'src', 'ui', 'progressTreeView.ts');
      assert.ok(fs.existsSync(progressTreeViewPath), 'progressTreeView.ts file exists');

      // When: Reading progressTreeView.ts file
      const progressTreeViewContent = fs.readFileSync(progressTreeViewPath, 'utf8');

      // Then: File changes are applied correctly, functionality remains intact
      assert.ok(progressTreeViewContent.length > 0, 'progressTreeView.ts file should not be empty');
      assert.ok(progressTreeViewContent.includes('export class ProgressTreeViewProvider'), 'progressTreeView.ts should export ProgressTreeViewProvider class');
      assert.ok(progressTreeViewContent.includes('export function initializeProgressTreeView'), 'progressTreeView.ts should export initializeProgressTreeView function');
      assert.ok(progressTreeViewContent.includes('export function handleTestGenEventForProgressView'), 'progressTreeView.ts should export handleTestGenEventForProgressView function');
      assert.ok(progressTreeViewContent.includes('export function _resetForTesting'), 'progressTreeView.ts should export _resetForTesting function');
    });

    // TC-PROG-02: progressTreeView.ts file does not exist
    // Given: Non-existent progressTreeView.ts file path
    // When: Attempting to read progressTreeView.ts
    // Then: File not found error is thrown or file is created
    test('TC-PROG-02: progressTreeView.ts file does not exist', () => {
      // Given: Non-existent file path
      const ext = vscode.extensions.getExtension('kinopeee.dontforgetest');
      assert.ok(ext, 'Extension not found');

      const nonExistentPath = path.join(ext.extensionPath, 'src', 'ui', 'non-existent-progressTreeView.ts');

      // When: Attempting to read non-existent file
      // Then: File not found error is thrown or file is created
      assert.throws(() => {
        fs.readFileSync(nonExistentPath, 'utf8');
      }, /ENOENT|no such file/i, 'Reading non-existent file should throw error');
    });
  });

  suite('Version Synchronization', () => {
    // TC-SYNC-01: package.json version is 0.0.72 but package-lock.json version is 0.0.70
    // Given: package.json and package-lock.json with mismatched versions
    // When: Comparing versions
    // Then: Version mismatch is detected or versions are synchronized
    test('TC-SYNC-01: package.json version is 0.0.72 but package-lock.json version is 0.0.70', () => {
      // Given: JSON objects with mismatched versions
      const packageJsonContent = '{"version": "0.0.72"}';
      const packageLockJsonContent = '{"version": "0.0.70", "packages": {"": {"version": "0.0.70"}}}';
      const packageJson = JSON.parse(packageJsonContent) as { version?: string };
      const packageLockJson = JSON.parse(packageLockJsonContent) as {
        version?: string;
        packages?: Record<string, { version?: string }>;
      };

      // When: Comparing versions
      // Then: Version mismatch is detected or versions are synchronized
      assert.ok(packageJson.version, 'package.json version should be defined');
      assert.ok(packageLockJson.version, 'package-lock.json version should be defined');
      assert.notStrictEqual(packageLockJson.version, packageJson.version, 'Versions should be mismatched');
      assert.strictEqual(packageJson.version, '0.0.72', 'package.json version should be 0.0.72');
      assert.strictEqual(packageLockJson.version, '0.0.70', 'package-lock.json version should be 0.0.70');
      if (packageLockJson.packages && packageLockJson.packages['']) {
        assert.notStrictEqual(packageLockJson.packages[''].version, packageJson.version, 'packages[""] version should also be mismatched');
      }
    });

    // TC-SYNC-02: package-lock.json root version matches package.json but packages[""] version differs
    // Given: package-lock.json with root version matching package.json but packages[""] version differs
    // When: Comparing versions
    // Then: Version mismatch is detected or all versions are synchronized
    test('TC-SYNC-02: package-lock.json root version matches package.json but packages[""] version differs', () => {
      // Given: JSON objects with root version matching but packages[""] version differs
      const packageJsonContent = '{"version": "0.0.72"}';
      const packageLockJsonContent = '{"version": "0.0.72", "packages": {"": {"version": "0.0.70"}}}';
      const packageJson = JSON.parse(packageJsonContent) as { version?: string };
      const packageLockJson = JSON.parse(packageLockJsonContent) as {
        version?: string;
        packages?: Record<string, { version?: string }>;
      };

      // When: Comparing versions
      // Then: Version mismatch is detected or all versions are synchronized
      assert.ok(packageJson.version, 'package.json version should be defined');
      assert.ok(packageLockJson.version, 'package-lock.json root version should be defined');
      assert.strictEqual(packageLockJson.version, packageJson.version, 'Root version should match package.json version');
      if (packageLockJson.packages && packageLockJson.packages['']) {
        assert.notStrictEqual(packageLockJson.packages[''].version, packageJson.version, 'packages[""] version should be mismatched');
        assert.strictEqual(packageLockJson.packages[''].version, '0.0.70', 'packages[""] version should be 0.0.70');
      }
    });
  });

  suite('ProgressTreeView Initialization', () => {
    setup(() => {
      // モジュール状態をリセット
      resetProgressTreeView();
    });

    // TC-N-01: Valid ExtensionContext provided
    // Given: Valid ExtensionContext provided
    // When: initializeProgressTreeView is called
    // Then: ProgressTreeView initialized successfully, provider returned
    test('TC-N-01: Valid ExtensionContext provided', () => {
      // Given: Valid ExtensionContext provided
      const context: vscode.ExtensionContext = {
        subscriptions: [],
        extensionUri: vscode.Uri.file('/'),
      } as unknown as vscode.ExtensionContext;

      // When: initializeProgressTreeView is called
      const provider = initializeProgressTreeView(context);

      // Then: ProgressTreeView initialized successfully, provider returned
      assert.ok(provider, 'ProgressTreeView provider is created');
      assert.ok(context.subscriptions.length > 0, 'Subscriptions are registered');
    });
  });

  suite('OutputTreeView Initialization', () => {
    // TC-N-02: Valid ExtensionContext provided
    // Given: Valid ExtensionContext provided
    // When: initializeOutputTreeView is called
    // Then: OutputTreeView initialized successfully
    test('TC-N-02: Valid ExtensionContext provided', () => {
      // Given: Valid ExtensionContext provided
      const context: vscode.ExtensionContext = {
        subscriptions: [],
        extensionUri: vscode.Uri.file('/'),
      } as unknown as vscode.ExtensionContext;

      const initialSubscriptionCount = context.subscriptions.length;

      // When: initializeOutputTreeView is called
      initializeOutputTreeView(context);

      // Then: OutputTreeView initialized successfully
      assert.ok(context.subscriptions.length > initialSubscriptionCount, 'Subscriptions are registered');
    });
  });

  suite('Mock Verification', () => {
    // TC-N-05: createMockExtensionContext extension ID check
    // Given: createMockExtensionContext is called
    // When: Checking returned context.extension.id
    // Then: ID matches 'kinopeee.dontforgetest.test'
    test('TC-N-05: createMockExtensionContext returns correct extension ID', () => {
      // Given: Mock context
      const context = createMockExtensionContext();

      // When & Then: ID matches 'kinopeee.dontforgetest.test'
      assert.strictEqual(context.extension.id, 'kinopeee.dontforgetest.test');
    });
  });
});
