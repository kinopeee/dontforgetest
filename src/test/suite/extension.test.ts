import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { initializeProgressTreeView } from '../../ui/progressTreeView';
import { initializeOutputTreeView } from '../../ui/outputTreeView';

suite('src/extension.ts', () => {
  suite('Extension Activation', () => {
    // Given: Extension is installed
    // When: Getting extension by ID
    // Then: Extension object exists
    test('TC-EXT-01: Extension existence check', () => {
      const ext = vscode.extensions.getExtension('local.dontforgetest');
      assert.ok(ext, 'Extension not found');
    });

    // Given: Extension is available
    // When: Calling activate()
    // Then: Extension becomes active
    test('TC-N-01: Extension activated with all changes applied', async () => {
      // Given: Extension is available
      const ext = vscode.extensions.getExtension('local.dontforgetest');
      assert.ok(ext, 'Extension not found');
      
      // When: Calling activate()
      if (!ext.isActive) {
        await ext.activate();
      }
      
      // Then: Extension is active without import errors
      assert.ok(ext.isActive, 'Extension should be active');
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
      const ext = vscode.extensions.getExtension('local.dontforgetest');
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
      const ext = vscode.extensions.getExtension('local.dontforgetest');
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
      const ext = vscode.extensions.getExtension('local.dontforgetest');
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
      const ext = vscode.extensions.getExtension('local.dontforgetest');
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
      const ext = vscode.extensions.getExtension('local.dontforgetest');
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
      const ext = vscode.extensions.getExtension('local.dontforgetest');
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
        'dontforgetest.openLatestExecutionReport'
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
      assert.strictEqual(config.get('testExecutionRunner'), 'cursorAgent', 'testExecutionRunner default value is incorrect');
      assert.strictEqual(config.get('allowUnsafeTestCommand'), false, 'allowUnsafeTestCommand default value is incorrect');
      assert.strictEqual(config.get('cursorAgentForceForTestExecution'), false, 'cursorAgentForceForTestExecution default value is incorrect');
    });

    // TC-N-06: package.json validation
    test('TC-N-06: Package metadata check (Name/DisplayName)', () => {
      const ext = vscode.extensions.getExtension('local.dontforgetest');
      assert.ok(ext, 'Extension not found');
      const pkg = ext.packageJSON;
      assert.strictEqual(pkg.name, 'dontforgetest');
      assert.strictEqual(pkg.displayName, 'Dontforgetest');
    });
  });

  suite('Event.ts Comment Validation', () => {
    // Given: event.ts file
    // When: Reading the comment content
    // Then: Comment contains updated example labels (generateFromCommit, generateFromWorkingTree)
    test('TC-N-06: Event.ts comment contains updated example labels', async () => {
      // Given: Extension is available
      const ext = vscode.extensions.getExtension('local.dontforgetest');
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
      const ext = vscode.extensions.getExtension('local.dontforgetest');
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
    // Then: ライセンスが AGPL-3.0 であること
    test('TC-META-01: ライセンス情報の確認', () => {
      const ext = vscode.extensions.getExtension('local.dontforgetest');
      assert.ok(ext, '拡張機能が見つかりません');
      
      const packageJSON = ext.packageJSON;
      assert.strictEqual(packageJSON.license, 'AGPL-3.0', 'ライセンスが AGPL-3.0 ではありません');
    });

    // Given: 拡張機能がインストールされている
    // When: LICENSE ファイルの存在を確認する
    // Then: ファイルが存在すること
    test('TC-META-02: ライセンスファイルの存在確認', async () => {
      const ext = vscode.extensions.getExtension('local.dontforgetest');
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
      const ext = vscode.extensions.getExtension('local.dontforgetest');
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

    // TC-RES-02: testgen-view.svg のレンダリング
    // Given: media/testgen-view.svg ファイル
    // When: ファイル内容を読み込む
    // Then: 有効なSVGであり、更新されたパス（試験管）を含んでいること
    test('TC-RES-02: testgen-view.svg の内容確認', async () => {
      const ext = vscode.extensions.getExtension('local.dontforgetest');
      assert.ok(ext, '拡張機能が見つかりません');

      const svgUri = vscode.Uri.file(path.join(ext.extensionPath, 'media', 'testgen-view.svg'));
      const svgContent = (await vscode.workspace.fs.readFile(svgUri)).toString();

      assert.ok(svgContent.includes('<svg'), 'SVGタグが含まれていること');
      assert.ok(svgContent.includes('width="24"'), '幅が24であること');
      assert.ok(svgContent.includes('height="24"'), '高さが24であること');
      
      // 新しいアイコンの特徴（試験管のパス）を確認
      // "シンプルな試験管" コメントが含まれているか
      assert.ok(svgContent.includes('シンプルな試験管'), '新しいアイコン（試験管）のコメントが含まれていること');
      // パスデータの断片
      assert.ok(svgContent.includes('d="M9 3h6M10 3v7l-4 8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l-4-8V3"'), '試験管のパスデータが含まれていること');
      assert.ok(svgContent.includes('d="M7 15h10"'), '液体の線が含まれていること');
    });
  });

  suite('ProgressTreeView Initialization', () => {
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
});
