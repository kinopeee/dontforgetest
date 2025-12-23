/**
 * テスト結果のパースを担当するモジュール。
 * Mocha形式のテスト出力を解析し、構造化されたテスト結果を返す。
 */

/**
 * テスト結果の詳細を表す型
 */
export interface TestCaseResult {
  /** テストファイル名またはスイート名 */
  suite: string;
  /** テストケース名 */
  name: string;
  /** 成功/失敗 */
  passed: boolean;
}

/**
 * Mocha出力のパース結果
 */
export interface ParsedTestResult {
  /** 成功件数 */
  passed: number;
  /** 失敗件数 */
  failed: number;
  /** テストケースごとの詳細（パース可能な場合） */
  cases: TestCaseResult[];
  /** パースに成功したか */
  parsed: boolean;
}

/**
 * ANSIエスケープシーケンスを除去する。
 * @param text ANSIエスケープを含む可能性のあるテキスト
 * @returns ANSIエスケープを除去したテキスト
 */
export function stripAnsi(text: string): string {
  // 例: "\u001b[90m" などのANSIエスケープを除去する（文字化けに見えるため）
  // 参考: strip-ansi の実装パターン
  const ansiPattern =
    // eslint-disable-next-line no-control-regex
    /[\u001B\u009B][[\]()#;?]*(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-ORZcf-nqry=><])/g;
  return text.replace(ansiPattern, '');
}

/**
 * Mocha形式のテスト出力をパースしてテスト結果を抽出する。
 * @param stdout テストコマンドの標準出力
 * @returns パースされたテスト結果
 */
export function parseMochaOutput(stdout: string): ParsedTestResult {
  const lines = stripAnsi(stdout).split('\n');
  const cases: TestCaseResult[] = [];
  let currentSuite = '';

  // ✔ または ✓ でパスしたテストを検出
  // 例: "      ✔ TC-EXT-01: 拡張機能の存在確認"
  const passPattern = /^\s*[✔✓]\s+(.+)$/;
  // ✖ または 数字) で失敗したテストを検出
  // 例: "  1) should fail"
  const failPattern = /^\s*(?:[✖✗]|\d+\))\s+(.+)$/;
  // スイート名（インデントが浅い行）
  // 例: "  src/extension.ts" または "    Extension Activation"
  const suitePattern = /^(\s{2,6})(\S.*)$/;

  for (const line of lines) {
    // スイート名の検出（✔ ✓ ✖ で始まらない、適度なインデントの行）
    const suiteMatch = suitePattern.exec(line);
    if (suiteMatch && !passPattern.test(line) && !failPattern.test(line)) {
      const indent = suiteMatch[1].length;
      const suiteName = suiteMatch[2].trim();
      // ファイル名っぽい場合（.ts, .js で終わる）またはインデントが浅い場合
      if (suiteName.match(/\.(ts|js)$/) || indent <= 4) {
        currentSuite = suiteName;
      }
    }

    // パスしたテスト
    const passMatch = passPattern.exec(line);
    if (passMatch) {
      cases.push({
        suite: currentSuite,
        name: passMatch[1].trim(),
        passed: true,
      });
      continue;
    }

    // 失敗したテスト
    const failMatch = failPattern.exec(line);
    if (failMatch) {
      cases.push({
        suite: currentSuite,
        name: failMatch[1].trim(),
        passed: false,
      });
    }
  }

  const passed = cases.filter((c) => c.passed).length;
  const failed = cases.filter((c) => !c.passed).length;

  return {
    passed,
    failed,
    cases,
    parsed: cases.length > 0,
  };
}
