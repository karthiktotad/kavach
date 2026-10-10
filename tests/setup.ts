/**
 * Vitest global setup.
 *
 * jsdom lacks several APIs the app touches at import time (matchMedia,
 * scrollTo, IntersectionObserver). Providing safe stubs here keeps tests
 * focused on our logic instead of DOM polyfill plumbing.
 */
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { AxeResults } from 'axe-core'

vi.mock('virtual:pwa-register', () => ({
  registerSW: () => () => {},
}))

/**
 * `expectNoAxeViolations` — the axe assertion used by every component test.
 *
 * Why hand-written: the installed vitest-axe@0.1.0 exports the `axe` runner and
 * the matcher's *type*, but never registers the matcher at runtime, so the
 * documented `expect.extend` path does not exist. And augmenting vitest's
 * `Assertion` interface to add it conflicts with @testing-library/jest-dom's own
 * declaration (TS2428) — when that conflicts, BOTH sets of matchers stop
 * resolving, which looks exactly like "the matcher was never registered".
 *
 * A helper function avoids the interface merge entirely.
 *
 * The failure text is written for a developer mid-debug: rule id, impact, and
 * the offending HTML, because "a violation occurred" sends you back into the DOM
 * with nothing to go on.
 */
export async function expectNoAxeViolations(html: Element): Promise<void> {
  const results: AxeResults = await axe(html)
  const violations = results.violations

  if (violations.length === 0) return

  const lines = violations.map(
    (v) =>
      `  [${String(v.impact)}] ${v.id}: ${v.help}\n` +
      `    ${v.nodes.map((n) => n.html).join('\n    ')}`,
  )
  throw new Error(`axe found ${violations.length} violation(s):\n${lines.join('\n')}`)
}

// React 19 + testing library: mark the environment so React's `act` warnings
// behave correctly.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

// jsdom defines `scrollTo` but throws "Not implemented" when called.
// The router resets scroll on navigation, so stub it unconditionally.
window.scrollTo = vi.fn()

if (!('IntersectionObserver' in globalThis)) {
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).IntersectionObserver = IO
}
