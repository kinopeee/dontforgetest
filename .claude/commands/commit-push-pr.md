# コミット・プッシュ・PR 作成（一括実行）

## 概要

現在のブランチに対して変更をコミットし、リモートへプッシュしたあと、Pull Request を作成する。

## 前提条件

- 変更済みファイルが存在すること
- リモート `origin` が設定済みであること
- GitHub CLI (`gh`) がインストール済みであること
- 作業ブランチにいること（main/master 以外）
- コミットメッセージ・PR 規約は `AGENTS.md` に従う

## ⚠️ Cursor サンドボックス権限について

このコマンドは `git push` と `gh pr create` でネットワークアクセスを使用します。

- `gh` コマンドは TLS 証明書検証の都合上、**`all` 権限**が必要な場合があります
- Cursor のサンドボックス実行時に TLS エラーが発生した場合は、`all` 権限で再実行してください

## 実行手順

### 標準実行（`--fill` でコミットから補完）

```bash
MSG="<Prefix>: <サマリ>"
BRANCH=$(git branch --show-current)
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo "⚠️ main/master への直接プッシュは禁止です"; exit 1;
fi

(npm run lint && npm run typecheck) || { echo "❌ lint/型チェックエラー"; exit 1; }

git add -A && \
git commit -m "$MSG" && \
git push -u origin "$BRANCH" && \
gh pr create --fill --base main
```

### PR タイトル・本文を指定する場合

```bash
MSG="<Prefix>: <サマリ>"
PR_TITLE="<Prefix>: <サマリ>"
PR_BODY="## 概要
...

## 変更内容
- ...

## テスト内容
- ..."

BRANCH=$(git branch --show-current)
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo "⚠️ main/master への直接プッシュは禁止です"; exit 1;
fi

(npm run lint && npm run typecheck) || { echo "❌ lint/型チェックエラー"; exit 1; }

git add -A && \
git commit -m "$MSG" && \
git push -u origin "$BRANCH" && \
gh pr create --title "$PR_TITLE" --body "$PR_BODY" --base main
```

## 参照

- コミットメッセージ規約: `AGENTS.md`
- PR メッセージ規約: `AGENTS.md`
- ブランチ運用規約: `AGENTS.md`
