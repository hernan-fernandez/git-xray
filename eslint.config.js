// ESLint flat config — correctness-focused, no stylistic reformatting.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'docs/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      // The parsers' `lines.pop()!` pattern is safe (split always yields ≥1
      // element) but each use should stay deliberate — keep as a warning.
      '@typescript-eslint/no-non-null-assertion': 'warn',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      // Tests legitimately build partial fixtures, mock loosely, and assert
      // on ANSI escape sequences in terminal output
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'no-control-regex': 'off',
      'no-regex-spaces': 'off',
    },
  },
);
