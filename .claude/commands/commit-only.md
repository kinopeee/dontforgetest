# コミットのみ（現在のブランチ）

## 概要

現在のブランチに対してコミットのみ行う。プッシュは行わない。

## 前提条件

- 変更済みファイルが存在すること
- 作業ブランチにいること（main/master 以外）
- コミットメッセージ規約は `AGENTS.md` に従う

## 実行手順

```bash
MSG="<Prefix>: <サマリ>"
BRANCH=$(git branch --show-current)
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo "⚠️ main/master での直接コミットは禁止です"; exit 1;
fi

(npm run lint && npm run typecheck) || { echo "❌ lint/型チェックエラー"; exit 1; }

git add -A && git commit -m "$MSG"
```

## 参照

- コミットメッセージ規約: `AGENTS.md`
- ブランチ運用規約: `AGENTS.md`
