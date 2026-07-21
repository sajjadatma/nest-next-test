import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'dashboard/**', 'test/generated/**', 'test/scripts/**/*.cjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['src/main.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
