import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCALE,
  LOCALE_META,
  MESSAGES,
  RTL_LOCALES,
  SUPPORTED_LOCALES,
  dirFor,
  hasTranslation,
  intlLocale,
  isLocale,
  resolveLocale,
  translate,
} from '../src/i18n'

/**
 * The i18n layer is the backbone of "understandable in the tourist's language".
 * These tests lock the fallback, interpolation and RTL behaviour so a later
 * milestone cannot silently break it.
 */
describe('i18n', () => {
  it('registers exactly the 8 languages promised by the brief', () => {
    expect(SUPPORTED_LOCALES).toHaveLength(8)
    expect([...SUPPORTED_LOCALES]).toEqual(['en', 'ta', 'hi', 'fr', 'de', 'ar', 'zh', 'ja'])
  })

  it('ships a real English bundle with the full key set', () => {
    expect(Object.keys(MESSAGES.en).length).toBeGreaterThan(50)
    expect(MESSAGES.en['nav.alerts']).toBeTruthy()
  })

  it('returns each locale own strings when a bundle exists', () => {
    // All 8 locales were machine-translated by scripts/translate-pack.ts, so a
    // translated locale must differ from English rather than silently falling
    // back. Tamil uses a different script, so it must clearly differ.
    for (const locale of SUPPORTED_LOCALES) {
      expect(hasTranslation(locale), `${locale} has no bundle`).toBe(true)
      expect(Object.keys(MESSAGES[locale]).length).toBeGreaterThan(50)
    }
    expect(translate('ta', 'nav.alerts')).not.toBe(translate('en', 'nav.alerts'))
  })

  it('falls back to English for a key a locale is missing', () => {
    // Simulates a partially-translated bundle.
    const saved = MESSAGES.fr['nav.alerts'] as string
    delete MESSAGES.fr['nav.alerts']
    expect(translate('fr', 'nav.alerts')).toBe(MESSAGES.en['nav.alerts'])
    MESSAGES.fr['nav.alerts'] = saved
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
    expect(dirFor('zh')).toBe('ltr')
  })

  it('gives every locale an endonym and a direction', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(LOCALE_META[locale].endonym.length).toBeGreaterThan(0)
      expect(['ltr', 'rtl']).toContain(LOCALE_META[locale].dir)
    }
  })

  it('matches a browser language list to the first supported base language', () => {
    expect(resolveLocale(['fr-CA', 'en-US'])).toBe('fr')
    // First match wins, which is what a browser language list means.
    expect(resolveLocale(['zh-Hans-CN', 'ta-IN'])).toBe('zh')
    expect(resolveLocale(['ta-IN', 'en-US'])).toBe('ta')
    expect(resolveLocale(['kl-GL'])).toBe(DEFAULT_LOCALE)
    expect(resolveLocale([])).toBe(DEFAULT_LOCALE)
  })

  it('validates locale input', () => {
    expect(isLocale('hi')).toBe(true)
    expect(isLocale('xx')).toBe(false)
    expect(isLocale(42)).toBe(false)
  })

  it('maps every locale to an Intl tag', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(intlLocale(locale)).toContain('-')
    }
  })
})
