# 公開手順（Visual Studio Marketplace）

このドキュメントは、Dontforgetest を **Visual Studio Marketplace（Microsoft Marketplace）** に公開する手順をまとめたものです。

## 前提条件

- Visual Studio Marketplace 上に **Publisher（発行者）** を作成済み
- `package.json` の `publisher` が Publisher ID と一致している
- 公開用の **PAT（Personal Access Token）** を作成済み（Marketplace の publish 権限）
- Node.js が利用できる

## 1) Publisher の作成 / 確認

1. Visual Studio Marketplace にサインイン
2. Publisher（Publisher ID）を作成
3. `package.json` に同じ値が入っていることを確認:
   - `publisher`: `<publisher-id>`

## 2) PAT（Personal Access Token）の作成

Azure DevOps 側で PAT を作成し、以下の権限を付与します:

- Scope: **Marketplace** → **Manage**

トークンは漏洩しないように厳重に扱ってください。

## 3) VSIX の生成（公開前チェック）

```bash
npm run marketplace:package
```

リポジトリルートに `dontforgetest-<version>.vsix` が生成されます。

## 4) Visual Studio Marketplace へ公開

環境変数に PAT を設定して公開します:

```bash
VSCE_PAT="<YOUR_PAT>" npm run marketplace:publish
```

補足:

- `marketplace:publish` は公開前に `lint` / `typecheck` / `compile` を実行します。
- `vsce publish` がパッケージ生成とアップロードを行います。

## トラブルシュート

### `Publisher not found`

- Marketplace の Publisher ID と `package.json` の `publisher` が一致しているか確認してください。

### `Invalid token` / `Unauthorized`

- PAT に **Marketplace: Manage** の権限が付いているか確認してください。
- `VSCE_PAT` 経由でトークンが渡っているか確認してください。
