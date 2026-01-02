# コミット＆プッシュ（現在のブランチ）

## 概要

現在のブランチに対して変更をコミットし、リモートへプッシュする。

## 前提条件

- 変更済みファイルが存在すること
- リモート `origin` が設定済みであること
- 作業ブランチにいること（main/master 以外）
- コミットメッセージ規約は `AGENTS.md` に従う

## 実行手順

```bash
MSG="<Prefix>: <サマリ>"
BRANCH=$(git branch --show-current)
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo "⚠️ main/master への直接プッシュは禁止です"; exit 1;
fi

(npm run lint && npm run typecheck) || { echo "❌ lint/型チェックエラー"; exit 1; }

git add -A && \
git commit -m "$MSG" && \
git push -u origin "$BRANCH"
```

## 参照

- コミットメッセージ規約: `AGENTS.md`
- ブランチ運用規約: `AGENTS.md`
