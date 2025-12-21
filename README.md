# IDE Extension

VS Code拡張機能の開発環境です。

## 機能

- Hello Worldコマンド

## 開発方法

### ビルド

```bash
npm run compile
```

### ウォッチモード

```bash
npm run watch
```

### 拡張機能の実行

1. F5キーを押すか、「Run Extension」デバッグ設定を実行
2. 新しいVS Codeウィンドウが開きます
3. コマンドパレット（Cmd+Shift+P）を開く
4. 「Hello World」と入力してコマンドを実行

## プロジェクト構造

```
.
├── src/
│   └── extension.ts    # 拡張機能のメインファイル
├── out/                # コンパイル後のファイル
├── package.json        # 拡張機能のマニフェスト
└── tsconfig.json       # TypeScript設定
```

## 依存関係

- TypeScript
- VS Code Extension API
- Node.js

## ライセンス

ISC
