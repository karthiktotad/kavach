import { describe, expect, it } from 'vitest'
import { PILOT_REGION, isInsideRegion } from '../src/config/region'
import { messages as enMessages } from '../src/i18n/messages/en'

/**
 * Smoke test for the M1 scaffold. Also enforces two cross-cutting invariants:
 * the route labels exist in the i18n catalogue, and the pilot region bbox is
 * internally consistent.
 */
describe('scaffold', () => {
  it('defines the pilot region inside the Chennai coast bbox', () => {
    expect(PILOT_REGION.countryCode).toBe('IN')
    const [west, south, east, north] = PILOT_REGION.bbox
    expect(PILOT_REGION.centre.lon).toBeGreaterThanOrEqual(west)
    expect(PILOT_REGION.centre.lon).toBeLessThanOrEqual(east)
    expect(PILOT_REGION.centre.lat).toBeGreaterThanOrEqual(south)
    expect(PILOT_REGION.centre.lat).toBeLessThanOrEqual(north)
    expect(west).toBeLessThan(east)
    expect(south).toBeLessThan(north)
  })

  it('includes Mamallapuram in the pilot bbox', () => {
    // Mamallapuram (Mahabalipuram), Tamil Nadu.
    expect(isInsideRegion(80.1945, 12.6208)).toBe(true)
    // Bengaluru — deliberately outside.
    expect(isInsideRegion(77.5946, 12.9716)).toBe(false)
  })

  it('ships an i18n key for every bottom-nav destination', () => {
    for (const key of ['nav.home', 'nav.alerts', 'nav.map', 'nav.assist', 'nav.aid']) {
      expect(enMessages[key], `missing translation for ${key}`).toBeTruthy()
    }
  })

  it('ships an i18n key for every placeholder page', () => {
    for (const key of [
      'page.alerts.title',
      'page.map.title',
      'page.assist.title',
      'page.aid.title',
      'page.phrases.title',
      'page.me.title',
      'page.report.title',
      'page.authority.title',
      'page.packet.title',
    ]) {
      expect(enMessages[key], `missing translation for ${key}`).toBeTruthy()
    }
  })

  it('has a key for every rung of the connectivity ladder', () => {
    for (const level of ['live', 'degraded', 'cellular', 'offline', 'relay']) {
      expect(enMessages[`status.${level}`], `missing status.${level}`).toBeTruthy()
      expect(enMessages[`status.${level}.desc`], `missing status.${level}.desc`).toBeTruthy()
    }
  })
})
