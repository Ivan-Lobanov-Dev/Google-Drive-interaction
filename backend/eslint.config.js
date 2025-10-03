import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';

export default [
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['vitest.config.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: ['./tsconfig.json', './vitest.config.ts'],
      },
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'import': importPlugin,
    },
    rules: {
      // Prohibit default exports
      'import/no-default-export': 'error',
      
      // Additional rules for named exports
      'import/prefer-default-export': 'off',
      'import/no-named-as-default': 'off',
      
      // Other useful TypeScript rules
      '@typescript-eslint/no-unused-vars': ['error', { 
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_',
        'ignoreRestSiblings': true
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'warn',
      
      // Disable no-undef for TypeScript files
      'no-undef': 'off',
      'no-unused-vars': 'off', // Use @typescript-eslint/no-unused-vars instead
    },
  },
];
