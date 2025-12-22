// Mochaの型定義（@types/mochaがインストールされていない場合のフォールバック）
declare const suite: (title: string, fn: (this: Mocha.Suite) => void) => void;
declare const test: (title: string, fn: (this: Mocha.Context) => void | Promise<void>) => void;
declare const describe: (title: string, fn: (this: Mocha.Suite) => void) => void;
declare const it: (title: string, fn: (this: Mocha.Context) => void | Promise<void>) => void;
declare const before: (fn: (this: Mocha.Context, done: Mocha.Done) => void | Promise<void>) => void;
declare const after: (fn: (this: Mocha.Context, done: Mocha.Done) => void | Promise<void>) => void;
declare const beforeEach: (fn: (this: Mocha.Context, done: Mocha.Done) => void | Promise<void>) => void;
declare const afterEach: (fn: (this: Mocha.Context, done: Mocha.Done) => void | Promise<void>) => void;

declare namespace Mocha {
  interface Suite {
    timeout(ms: number): this;
    retries(n: number): this;
  }
  interface Context {
    timeout(ms: number): void;
    skip(): void;
  }
  type Done = (err?: Error) => void;
}
