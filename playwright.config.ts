import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright is only used for the offline end-to-end check (M3 verification).
 * It runs against a production preview build, because a service worker does not
 * exist in the dev server — testing offline behaviour there proves nothing.
 *
 * Usage:
 *   npm run build
 *   npm run preview -- --port 4173
 *   npx playwright test
 */
export default defineConfig({
  testDir: './e2e',
  // One worker: these tests share a browser profile and IndexedDB state.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
    // A service worker needs a secure context; localhost counts as one.
    permissions: [],
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
