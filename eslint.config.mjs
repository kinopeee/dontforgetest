// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    plugins: {
      '@stylistic': stylistic,
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      // any型の使用を禁止（プロジェクト規約）
      '@typescript-eslint/no-explicit-any': 'error',
      // 未使用変数はエラー（_プレフィックスは許可）
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // インデント: 2スペース
      '@stylistic/indent': ['error', 2],
    },
  },
  {
    ignores: ['out/**', 'node_modules/**', '*.js'],
  }
);
