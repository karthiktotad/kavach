/**
 * Vitest global setup.
 *
 * jsdom lacks several APIs the app touches at import time (matchMedia,
 * scrollTo, IntersectionObserver). Providing safe stubs here keeps tests
 * focused on our logic instead of DOM polyfill plumbing.
 */
import '@testing-library/jest-dom/vitest'
import { expect, vi } from 'vitest'
import { axe } from 'vitest-axe'
import type { AxeResults } from 'axe-core'

/**
 * `toHaveNoViolations` — a local axe matcher.
 *
 * Why hand-written: the installed vitest-axe@0.1.0 exports the *type* for the
 * matcher and the `axe` runner, but never registers the matcher itself, so
 * the documented `expect.extend` path does not exist at runtime. Rather than
 * pin a fork or fight the package, the matcher is four lines of code and
 * lives here where it can be read.
 *
 * The failure message is written for a developer mid-debug: it names the rule,
 * the impact, and the offending HTML, because "some violation occurred" sends
 * you back into the DOM with nothing to go on.
 */
expect.extend({
  async toHaveNoViolations(html: Element) {
    const results: AxeResults = await axe(html)
    const violations = results.violations

    return {
      pass: violations.length === 0,
      message: () => {
        if (violations.length === 0) return 'expected axe violations, found none'
        const lines = violations.map(
          (v) =>
            `  [${String(v.impact)}] ${v.id}: ${v.help}\n` +
            `    ${v.nodes.map((n) => n.html).join('\n    ')}`,
        )
        return `axe found ${violations.length} violation(s):\n${lines.join('\n')}`
      },
      actual: violations,
    }
  },
})

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
