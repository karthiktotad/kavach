/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,tsx,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        inherit: 'inherit',
        current: 'currentColor',
        // Design tokens from src/styles/tokens.css
        ink: 'var(--ink)',
        ground: 'var(--ground)',
        surface: 'var(--surface)',
        line: 'var(--line)',
        muted: 'var(--muted)',
        'text-2': 'var(--text-2)',
        verified: 'var(--verified)',
        'verified-tint': 'var(--verified-tint)',
        drill: 'var(--drill)',
        'drill-tint': 'var(--drill-tint)',
        danger: 'var(--danger)',
        'danger-dark': 'var(--danger-dark)',
        live: 'var(--live)',
        'live-text': 'var(--live-text)',
        'live-tint': 'var(--live-tint)',
        offline: 'var(--offline)',
      },
      borderRadius: {
        radius10: 'var(--radius-10)',
        radius12: 'var(--radius-12)',
        radius14: 'var(--radius-14)',
        radius16: 'var(--radius-16)',
      },
      fontFamily: {
        sans: 'var(--font-family)',
      },
      fontSize: {
        base: ['var(--font-size-base)', { lineHeight: 'var(--line-height-base)' }],
      },
    },
  },
  plugins: [],
}