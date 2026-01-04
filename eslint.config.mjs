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
    // Node.js の実行スクリプト（CommonJS）向け設定
    // - `require` / `process` / `__dirname` などを未定義扱いしない
    // - `require()` を禁止する TypeScript ルールはスクリプトでは例外扱いにする
    files: ['scripts/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    ignores: ['out/**', 'node_modules/**', '*.js'],
  }
);
