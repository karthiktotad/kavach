/**
 * End-to-end offline verification.
 *
 * This is the test that proves the product claim: after the pack is installed,
 * the app still works with the network switched off — shell, navigation, and
 * pack data all readable from IndexedDB.
 *
 * Run against a production preview build:
 *   npm run build && npm run preview -- --port 4173
 *   npx playwright test
 */
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env['E2E_BASE_URL'] ?? 'http://localhost:4173'

/** Wait for the pack download to finish and onboarding to be recorded. */
async function completeGetReady(page: Page): Promise<void> {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { name: /get kavach ready/i })).toBeVisible()

  await page.getByRole('button', { name: /download for offline use/i }).click()
  await expect(page.getByText(/ready\./i)).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: /^continue$/i }).click()
  await expect(page.getByText(/signed alerts/i)).toBeVisible()
}

test.describe('Kavach offline', () => {
  test('app shell, pack data and navigation work with the network off', async ({
    page,
    context,
  }) => {
    await completeGetReady(page)

    // Sanity: the pack really is in IndexedDB, not just in the SW cache.
    const storedBefore = await page.evaluate(async () => {
      const open = indexedDB.open('kavach')
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onsuccess = () => resolve(open.result)
        open.onerror = () => reject(open.error)
      })
      const rows = await new Promise<unknown[]>((resolve, reject) => {
        const tx = db.transaction('packFiles', 'readonly')
        const req = tx.objectStore('packFiles').getAll()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      db.close()
      return (rows as Array<{ key: string }>).map((r) => r.key).sort()
    })
    expect(storedBefore.length).toBeGreaterThan(0)
    expect(storedBefore).toContain('places.json')

    // Kill the network at the context level: every request now fails.
    await context.setOffline(true)

    // Reload from scratch — nothing may come from the network.
    await page.reload({ waitUntil: 'domcontentloaded' })

    // 1. The shell boots from the service worker precache.
    await expect(page.getByRole('link', { name: 'Kavach' })).toBeVisible({ timeout: 30_000 })

    // 2. The status chip reports the offline level, and says so in words.
    const chip = page.getByRole('button', { name: /connection status/i })
    await expect(chip).toBeVisible({ timeout: 30_000 })
    await expect(chip).toContainText(/offline|degraded/i, { timeout: 30_000 })

    // 3. Navigation still works offline.
    await page
      .getByRole('link', { name: /alerts/i })
      .first()
      .click()
    await expect(page).toHaveURL(/#\/alerts/, { timeout: 15_000 })
    await page.getByRole('link', { name: /map/i }).first().click()
    await expect(page).toHaveURL(/#\/map/, { timeout: 15_000 })

    // 4. Pack data is still readable from IndexedDB with no network.
    const zonesOffline = await page.evaluate(async () => {
      const open = indexedDB.open('kavach')
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onsuccess = () => resolve(open.result)
        open.onerror = () => reject(open.error)
      })
      const row = await new Promise<{ data: string } | undefined>((resolve, reject) => {
        const tx = db.transaction('packFiles', 'readonly')
        const req = tx.objectStore('packFiles').get('zones.geojson')
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      db.close()
      return row ? JSON.parse(row.data) : null
    })
    expect(zonesOffline).not.toBeNull()
    expect((zonesOffline as { features: unknown[] }).features.length).toBeGreaterThanOrEqual(6)
  })

  test('the offline deep link /#/a/<packet> still renders', async ({ page, context }) => {
    await completeGetReady(page)
    await context.setOffline(true)

    await page.goto(`${BASE}/#/a/SMOKE-TEST-PACKET`, { waitUntil: 'domcontentloaded' })
    // A malformed packet must render an explanation, never a crash.
    await expect(page.getByRole('heading', { name: /alert packet/i })).toBeVisible({
      timeout: 30_000,
    })
  })
})
