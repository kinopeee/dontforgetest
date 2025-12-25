/**
 * テストコードで Mocha のグローバル（suite/test/describe/it など）を使用するための型参照。
 *
 * 以前は @types/mocha 未導入時のフォールバック定義を置いていたが、
 * 現在は @types/mocha を devDependencies に含めているため、
 * フォールバック定義が本来の Mocha 型と衝突して戻り値型が崩れる問題（例: test() が void 扱い）を防ぐ。
 */
/// <reference types="mocha" />
