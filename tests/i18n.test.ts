import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE, dirFor, isLocale, resolveLocale, translate, MESSAGES } from '../src/i18n'
import { LOCALE_META, RTL_LOCALES, SUPPORTED_LOCALES } from '../src/i18n'

/**
 * The i18n layer is the backbone of "understandable in the tourist's language".
 * These tests lock the fallback + interpolation + RTL behaviour so a later
 * milestone cannot silently break it.
 */
describe('i18n', () => {
  it('registers exactly the 8 languages promised by the brief', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(8)
    expect([...SUPPORTED_LOCALES]).toEqual(['en', 'ta', 'hi', 'bn', 'ar', 'fr', 'es', 'ja'])
  })

  it('falls back to English for a locale with no translations yet', () => {
    // Tamil catalogue is empty until M2; the key must still resolve.
    expect(translate('ta', 'nav.alerts')).toBe(MESSAGES.en['nav.alerts'])
    expect(translate('ta', 'nav.alerts')).toBe('Alerts')
  })

  it('interpolates {placeholder} tokens', () => {
    expect(translate('en', 'a11y.connectionStatus', { status: 'Offline' })).toBe(
      'Connection status: Offline',
    )
  })

  it('leaves unknown placeholders visible rather than printing undefined', () => {
    const out = translate('en', 'a11y.connectionStatus', {})
    expect(out).toContain('{status}')
    expect(out).not.toContain('undefined')
  })

  it('returns the key itself for a missing string (loud in dev, never crashes)', () => {
    expect(translate('en', 'this.key.does.not.exist')).toBe('this.key.does.not.exist')
  })

  it('marks Arabic as RTL and everything else LTR', () => {
    expect(RTL_LOCALES.has('ar')).toBe(true)
    expect(dirFor('ar')).toBe('rtl')
    expect(dirFor('en')).toBe('ltr')
    expect(dirFor('ja')).toBe('ltr')
  })

  it('gives every locale an endonym and a direction', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(LOCALE_META[locale].endonym.length).toBeGreaterThan(0)
      expect(['ltr', 'rtl']).toContain(LOCALE_META[locale].dir)
    }
  })

  it('matches a browser language list to a supported base language', () => {
    expect(resolveLocale(['fr-CA', 'en-US'])).toBe('fr')
    expect(resolveLocale(['zh-CN', 'ta-IN'])).toBe('ta')
    expect(resolveLocale(['kl-GL'])).toBe(DEFAULT_LOCALE)
  })

  it('validates locale input', () => {
    expect(isLocale('hi')).toBe(true)
    expect(isLocale('xx')).toBe(false)
    expect(isLocale(42)).toBe(false)
  })
})
