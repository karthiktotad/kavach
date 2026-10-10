/// <reference types="@testing-library/jest-dom" />
/**
 * Ambient type for the local `toHaveNoViolations` matcher.
 *
 * `expect.extend` registers it at RUNTIME, but TypeScript cannot infer an
 * augmented matcher, so without this file every axe assertion fails to compile.
 * vitest-axe ships this same declaration for its own registration path, which
 * does not exist at runtime in 0.1.0.
 */
import 'vitest'
import type { AxeResults } from 'axe-core'

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T extends AxeResults ? void : never
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void
  }
}
