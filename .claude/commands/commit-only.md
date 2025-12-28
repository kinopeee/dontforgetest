# コミットのみ（現在のブランチ）

## 概要

現在のブランチに対して、ローカルの変更をコミットだけ行うためのシンプルなコマンドです。  
リモートへのプッシュは扱わず、**コミットメッセージ規約に沿ったコミット**だけを行います。誤操作防止のため、main/master での実行はチェックでブロックします（詳細は `AGENTS.md`）。

## 前提条件

- 変更済みファイルが存在すること
- 作業ブランチにいること（main/master 以外。詳細は `AGENTS.md`）
- コミットメッセージの具体的な書き方は、`AGENTS.md` で定義された規約に従うこと

## 実行手順（対話なし）

1. ブランチ確認（main/master 直コミット防止）
2. 未コミット差分を確認し、コミットメッセージの内容を検討する（例：`git diff` や `git diff --cached`）
3. 変更のステージング（`git add -A`）
4. コミット（環境変数または引数でメッセージを渡す）

### A) 安全な一括実行（メッセージ引数版）

```bash
MSG="<Prefix>: <サマリ（命令形/簡潔に）>"
BRANCH=$(git branch --show-current) && \
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then \
  echo "⚠️ main/master での直接コミットは禁止です（詳細はAGENTS.md）"; exit 1; \
fi

git add -A && \
git commit -m "$MSG"
```

例：

```bash
MSG="fix: 不要なデバッグログ出力を削除"
BRANCH=$(git branch --show-current) && \
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then \
  echo "⚠️ main/master での直接コミットは禁止です（詳細はAGENTS.md）"; exit 1; \
fi

git add -A && \
git commit -m "$MSG"
```

### B) ステップ実行（読みやすさ重視）

```bash
# 0) ブランチ確認（main/master 直コミット防止）
BRANCH=$(git branch --show-current)
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
  echo "⚠️ main/master での直接コミットは禁止です（詳細はAGENTS.md）"; exit 1;
fi

# 1) 差分を確認
git status
git diff

# 2) 変更をステージング
git add -A

# 3) コミット（メッセージを編集）
git commit -m "<Prefix>: <サマリ（命令形/簡潔に）>"
```

## ノート

- コミットメッセージのフォーマットやメッセージ生成の原則は、`AGENTS.md` のルールに従ってください。
- ブランチ運用の詳細（デフォルトブランチでの直接作業禁止、ブランチ命名など）は、`AGENTS.md` を参照してください。
- リモートへのプッシュ (`git push`) は、このコマンドの対象外です。必要に応じて別コマンドを使用してください。


