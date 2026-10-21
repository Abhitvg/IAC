import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-undef': 'off', // TypeScript handles undef checks
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': 'off',
    },
  },
  {
    ignores: [
      'dist/',
      'dist-electron/',
      'release/',
      'node_modules/',
      '*.config.js',
      '*.config.mjs',
      'browser-extension/',
    ],
  },
];
