import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import { reactRefresh } from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'eslint/config'

export default defineConfig([
  { ignores: ['dist', 'coverage', 'dev-dist', 'node_modules', 'supabase/functions/_shared'] },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: fileURLToPath(new URL('.', import.meta.url)),
      },
    },
    rules: {
      // Offline-first rule 1: an unhandled fetch failure must never be silent.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Safety-critical app: forbid silent equality with null/undefined traps.
      eqeqeq: ['error', 'smart'],
    },
  },

  {
    // Tests: allow non-null assertions and looser type rules.
    files: ['tests/**/*.{ts,tsx}', 'scripts/**/*.{ts,mjs}', 'shared/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // Test doubles satisfy async interfaces (e.g. an outbox sender must return
      // a Promise) without containing an await, which require-await misreads.
      '@typescript-eslint/require-await': 'off',
      'no-console': 'off',
    },
  },

  {
    // Playwright e2e runs in Node, not the browser. This block must come AFTER
    // the main rules, since later config wins in flat config.
    files: ['e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      // page.evaluate() bodies are serialised into the browser and come back
      // typed as `any`, so the strict promise/idb rules misfire there.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    // Scripts / config files run in Node, not the browser.
    files: ['scripts/**/*.{ts,mjs}', '*.config.{ts,js,mjs}'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },

  {
    // Supabase Edge Functions run on Deno.
    files: ['supabase/functions/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, Deno: 'readonly' } },
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
])
