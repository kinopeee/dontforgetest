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
    files: ['**/*.cjs'],
    languageOptions: {
      globals: {
        // Node.js グローバル
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
      },
      ecmaVersion: 'latest',
      sourceType: 'script',
    },
    rules: {
      // CommonJS では require() を使用するため許可
      '@typescript-eslint/no-require-imports': 'off',
      // console の使用を許可（スクリプトファイルのため）
      'no-console': 'off',
    },
  },
  {
    ignores: ['out/**', 'node_modules/**', '*.js'],
  }
);
