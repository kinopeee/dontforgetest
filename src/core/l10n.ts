import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * UI文言の翻訳（vscode.l10n.t のラッパー）
 *
 * VS Code の表示言語に応じて自動的に翻訳された文字列を返す。
 * 未対応言語の場合はデフォルト（英語）にフォールバックする。
 */
type PrimitiveArg = string | number | boolean;
type NamedArgs = Record<string, PrimitiveArg>;

let enFallbackBundle: Record<string, string> | undefined;
let enFallbackBundleLoaded = false;

function isNamedArgs(value: unknown): value is NamedArgs {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadEnglishFallbackBundle(): Record<string, string> {
  if (enFallbackBundleLoaded) {
    return enFallbackBundle ?? {};
  }
  enFallbackBundleLoaded = true;

  // NOTE:
  // - VS Code の l10n 仕様上、デフォルト言語（通常は英語）では bundle がロードされない。
  // - 本拡張は「キー文字列」を message として渡しているため、英語環境ではキーがそのまま表示されてしまう。
  // - そのため、英語文言は l10n/bundle.l10n.json を自前で読み込んでフォールバックする。
  try {
    // out/core/l10n.js から 2階層上が拡張機能ルートになる想定
    const extensionRoot = path.resolve(__dirname, '..', '..');
    const bundlePath = path.join(extensionRoot, 'l10n', 'bundle.l10n.json');
    if (!fs.existsSync(bundlePath)) {
      enFallbackBundle = {};
      return enFallbackBundle;
    }

    const raw = fs.readFileSync(bundlePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      enFallbackBundle = {};
      return enFallbackBundle;
    }

    const obj = parsed as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') {
        out[k] = v;
      }
    }
    enFallbackBundle = out;
    return out;
  } catch (error) {
    // NOTE:
    // - 英語フォールバックの読み込みに失敗しても、拡張機能の主要な機能は継続できる。
    // - ただし原因特定が難しくなるため、ログだけは残す。
    console.warn('[dontforgetest] 英語フォールバックバンドルの読み込みに失敗しました', error);
    enFallbackBundle = {};
    return enFallbackBundle;
  }
}

export function t(message: string, ...args: PrimitiveArg[]): string;
export function t(message: string, args: NamedArgs): string;
export function t(message: string, ...rest: Array<PrimitiveArg | NamedArgs>): string {
  const named = rest.length === 1 && isNamedArgs(rest[0]) ? rest[0] : undefined;
  const translated = named ? vscode.l10n.t(message, named) : vscode.l10n.t(message, ...(rest as PrimitiveArg[]));

  // 翻訳が存在する場合はそれを返す（通常はデフォルト言語以外）
  if (translated !== message) {
    return translated;
  }

  // デフォルト言語（英語）/ 未翻訳キーの場合は、英語バンドルへフォールバック
  const fallback = loadEnglishFallbackBundle()[message];
  if (!fallback) {
    return translated;
  }

  // NOTE:
  // - fallback は英語文言そのものだが、引数がある場合はプレースホルダー置換のために vscode.l10n.t を使う。
  // - 引数がない場合は、そのまま返して余計な処理を避ける。
  if (named) {
    return Object.keys(named).length === 0 ? fallback : vscode.l10n.t(fallback, named);
  }
  const positionalArgs = rest as PrimitiveArg[];
  if (positionalArgs.length === 0) {
    return fallback;
  }
  return vscode.l10n.t(fallback, ...positionalArgs);
}

/**
 * 生成物（観点表/実行レポート）の言語を取得
 *
 * VS Code の表示言語に追従し、未対応言語は英語にフォールバックする。
 *
 * @returns 'ja' | 'en'
 */
export function getArtifactLocale(): 'ja' | 'en' {
  const lang = vscode.env.language;
  if (lang.startsWith('ja')) {
    return 'ja';
  }
  return 'en'; // fallback
}
