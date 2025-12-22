# テスト観点表テンプレート

## 基本テンプレート

| Case ID | Input / Precondition | Perspective (Equivalence / Boundary) | Expected Result | Notes |
|---------|----------------------|--------------------------------------|-----------------|-------|
| TC-N-01 | 有効な入力 A | Equivalence – normal | 処理成功、期待値を返す | - |
| TC-N-02 | 有効な入力 B | Equivalence – normal | 処理成功、期待値を返す | - |
| TC-A-01 | NULL | Boundary – NULL | バリデーションエラー | 必須フィールド |
| TC-A-02 | 空文字 | Boundary – empty | バリデーションエラー | - |
| TC-A-03 | 最小値 - 1 | Boundary – below min | 範囲外エラー | - |
| TC-A-04 | 最小値 | Boundary – min | 処理成功 | 境界ちょうど |
| TC-A-05 | 最大値 | Boundary – max | 処理成功 | 境界ちょうど |
| TC-A-06 | 最大値 + 1 | Boundary – above max | 範囲外エラー | - |
| TC-A-07 | 不正な型 | Equivalence – invalid type | 型エラー | - |
| TC-A-08 | 外部API失敗 | External dependency failure | 適切なエラーハンドリング | モック使用 |

## Case ID 命名規則

| プレフィックス | 意味 | 例 |
|---------------|------|-----|
| TC-N-XX | 正常系 (Normal) | TC-N-01 |
| TC-A-XX | 異常系 (Abnormal) | TC-A-01 |
| TC-B-XX | 境界値 (Boundary) | TC-B-01 |
| TC-E-XX | 例外 (Exception) | TC-E-01 |

## 境界値チェックリスト

以下の境界値を検討し、仕様上意味を持つものをテスト対象とする：

- [ ] 0
- [ ] 最小値
- [ ] 最小値 - 1
- [ ] 最大値
- [ ] 最大値 + 1
- [ ] 空文字 / 空配列
- [ ] NULL / undefined
- [ ] 負数（数値の場合）
- [ ] 特殊文字（文字列の場合）

## テストコード例

### TypeScript (Jest/Vitest)

```typescript
describe('UserService.createUser', () => {
  // TC-N-01: 有効なユーザー情報で作成成功
  it('should create user with valid input', async () => {
    // Given: 有効なユーザー情報
    const input = { name: 'Test User', email: 'test@example.com' };

    // When: ユーザー作成を実行
    const result = await userService.createUser(input);

    // Then: ユーザーが作成される
    expect(result).toBeDefined();
    expect(result.name).toBe(input.name);
  });

  // TC-A-01: NULLでバリデーションエラー
  it('should throw validation error when name is null', async () => {
    // Given: nameがnullの入力
    const input = { name: null, email: 'test@example.com' };

    // When/Then: バリデーションエラーがスローされる
    await expect(userService.createUser(input))
      .rejects
      .toThrow(ValidationError);
  });

  // TC-A-08: 外部API失敗時のエラーハンドリング
  it('should handle external API failure gracefully', async () => {
    // Given: 外部APIが失敗するようモック
    jest.spyOn(externalApi, 'verify').mockRejectedValue(new Error('API Error'));
    const input = { name: 'Test User', email: 'test@example.com' };

    // When/Then: 適切なエラーがスローされる
    await expect(userService.createUser(input))
      .rejects
      .toThrow(ExternalServiceError);
  });
});
```

### Python (pytest)

```python
class TestUserService:
    # TC-N-01: 有効なユーザー情報で作成成功
    def test_create_user_with_valid_input(self, user_service):
        # Given: 有効なユーザー情報
        input_data = {"name": "Test User", "email": "test@example.com"}

        # When: ユーザー作成を実行
        result = user_service.create_user(input_data)

        # Then: ユーザーが作成される
        assert result is not None
        assert result.name == input_data["name"]

    # TC-A-01: Noneでバリデーションエラー
    def test_create_user_raises_error_when_name_is_none(self, user_service):
        # Given: nameがNoneの入力
        input_data = {"name": None, "email": "test@example.com"}

        # When/Then: バリデーションエラーがスローされる
        with pytest.raises(ValidationError) as exc_info:
            user_service.create_user(input_data)
        assert "name is required" in str(exc_info.value)

    # TC-A-08: 外部API失敗時のエラーハンドリング
    def test_create_user_handles_external_api_failure(self, user_service, mocker):
        # Given: 外部APIが失敗するようモック
        mocker.patch.object(
            external_api, "verify",
            side_effect=Exception("API Error")
        )
        input_data = {"name": "Test User", "email": "test@example.com"}

        # When/Then: 適切なエラーがスローされる
        with pytest.raises(ExternalServiceError):
            user_service.create_user(input_data)
```

## カバレッジコマンド例

### JavaScript/TypeScript

```bash
# Jest
npm run test -- --coverage

# Vitest
npx vitest run --coverage
```

### Python

```bash
# pytest
pytest --cov=src --cov-report=html

# coverage.py
coverage run -m pytest && coverage report
```

### Go

```bash
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```
