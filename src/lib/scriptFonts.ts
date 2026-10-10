/**
 * Script fonts load on demand. Atkinson Hyperlegible is always in the CSS
 * bundle (offline). Tamil and Devanagari are only fetched when that locale is
 * selected, so a French tourist does not pay for those files.
 */
export function loadScriptFont(locale: string): void {
  if (locale === 'ta') {
    void import('@fontsource/noto-sans-tamil/400.css')
    void import('@fontsource/noto-sans-tamil/700.css')
  } else if (locale === 'hi') {
    void import('@fontsource/noto-sans-devanagari/400.css')
    void import('@fontsource/noto-sans-devanagari/700.css')
  }
}
