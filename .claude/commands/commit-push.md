# コミット＆プッシュ（現在のブランチ）

## 概要

現在のブランチに対して変更をコミットし、リモートへプッシュするための汎用的なコマンド例です。  
誤操作防止のため main/master での実行はテンプレート内のチェックでブロックします（詳細は `AGENTS.md`）。品質チェック（lint / test / build など）は、各プロジェクトのポリシーに応じてこのテンプレートを調整してください。

## 前提条件

- 変更済みファイルが存在すること
- リモート `origin` が設定済みであること

## 実行手順（対話なし）

1. ブランチ確認（main/master 直プッシュ防止）
2. 必要に応じて品質チェック（lint / test / build など）を実行
3. 変更のステージング（`git add -A`）
4. コミット（引数または環境変数のメッセージ使用）
5. プッシュ（`git push -u origin <current-branch>`）

## 使い方

### A) 安全な一括実行（メッセージ引数版）

```bash
MSG="<Prefix>: <サマリ（命令形/簡潔に）>" \
BRANCH=$(git branch --show-current) && \
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then \
  echo "⚠️ main/master への直接プッシュは禁止です（詳細はAGENTS.md）"; exit 1; \
fi

# 任意の品質チェック（必要な場合のみ）
# 例:
# ./scripts/lint.sh && ./scripts/test.sh && ./scripts/build.sh || exit 1

git add -A && \
git commit -m "$MSG" && \
git push -u origin "$BRANCH"
```

例：

```bash
MSG="fix: 不要なデバッグログ出力を削除" \
BRANCH=$(git branch --show-current) && \
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then \
  echo "⚠️ main/master への直接プッシュは禁止です（詳細はAGENTS.md）"; exit 1; \
fi

# 任意の品質チェック（必要な場合のみ）
# ./scripts/quality-check.sh || exit 1

git add -A && git commit -m "$MSG" && git push -u origin "$BRANCH"
```

### B) ステップ実行（読みやすさ重視）

```bash
# 1) ブランチ確認
BRANCH=$(git branch --show-current)
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo "⚠️ main/master への直接プッシュは禁止です（詳細はAGENTS.md）"; exit 1;
fi

# 2) 任意のローカル品質チェック（必要に応じて追加）
# 例:
# echo "品質チェック実行中..."
# ./scripts/lint.sh && ./scripts/test.sh && ./scripts/build.sh || exit 1

# 3) 変更をステージング
git add -A

# 4) コミット（メッセージを編集）
git commit -m "<Prefix>: <サマリ（命令形/簡潔に）>"

# 5) プッシュ
git push -u origin "$BRANCH"
```

## ノート

- ブランチ運用の詳細は、`AGENTS.md` の「ブランチ運用規約」を参照してください。
- コミットメッセージのフォーマットやメッセージ生成の原則は、`AGENTS.md` の規約に従ってください。
- 先に `git status` や `git diff` で差分を確認してからの実行を推奨します。
