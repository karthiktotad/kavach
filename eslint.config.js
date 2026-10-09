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
      'no-console': 'off',
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
