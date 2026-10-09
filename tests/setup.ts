/**
 * Vitest global setup.
 *
 * jsdom lacks several APIs the app touches at import time (matchMedia,
 * scrollTo, IntersectionObserver). Providing safe stubs here keeps tests
 * focused on our logic instead of DOM polyfill plumbing.
 */
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

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
