# Contributing Guide

Thanks for your interest in contributing to Dontforgetest.

## What we welcome

- **Bug fixes**: Always welcome. Please send a PR.
- **Feature requests / new features**: Please start with an **Issue** so we can discuss the direction first.

## Filing an Issue

- **Bug report**: include steps to reproduce, expected vs actual behavior, and logs if possible.
- **Feature request**: describe the problem you want to solve and your ideal UX/flow.

## Development

Requirements:

- Node.js (LTS recommended)
- Cursor / VS Code-compatible environment

Commands:

```bash
npm install
npm run compile
npm run lint
npm test
```

## Testing / implementation rules

This repository has specific rules for tests and generated artifacts. Please read `AGENTS.md`.

## PR guidelines (recommended)

1. Create a branch (e.g., `fix/xxx`, `feat/xxx`, `docs/xxx`)
2. Implement changes
3. Run `npm run lint` and `npm test`
4. Open a PR

## Commit message

We recommend Conventional Commits (in Japanese) to match the repository conventions.

---

# コントリビューションガイド

Dontforgetest への貢献ありがとうございます。

## 受け付けたいこと / 方針

- **不具合修正**: いつでも歓迎です。PR を送ってください。
- **機能追加**: できれば **Issue で要望を先に相談**してから着手してください（方向性のすり合わせのため）。

## Issue の起票

- **バグ報告**: 再現手順・期待結果・実際の結果・ログ（可能なら）を添えてください。
- **機能要望**: 解決したい課題（背景/目的）と、理想の UI/操作フローを教えてください。

## 開発

前提:

- Node.js（LTS 推奨）
- Cursor / VS Code 互換環境

コマンド:

```bash
npm install
npm run compile
npm run lint
npm test
```

## 実装/テストの方針

このリポジトリにはテストや生成物に関するルールがあります。`AGENTS.md` を参照してください。

## PR の作り方（推奨）

1. ブランチを作成（例: `fix/xxx`, `feat/xxx`, `docs/xxx`）
2. 変更を実装
3. `npm run lint` / `npm test` を実行
4. PR を作成

## コミットメッセージ

リポジトリの運用に合わせて、Conventional Commits 準拠（日本語）を推奨します。

