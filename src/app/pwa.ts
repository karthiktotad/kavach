/**
 * Service-worker registration (M1: install only, no update prompt yet).
 *
 * `injectRegister: null` in vite.config.ts means we own this file. That is
 * deliberate: offline behaviour is core to the product, so SW lifecycle must be
 * app code we can reason about, not a silent side effect of a build plugin.
 *
 * In development vite-plugin-pwa's devOptions are disabled, so this is a no-op
 * and the app runs as a plain Vite app.
 */
import { registerSW } from 'virtual:pwa-register'

export interface ServiceWorkerHandle {
  /** Prompt the user to activate a waiting worker (M11 wires this to the UI). */
  readonly needRefresh: () => void
  /** Currently installed offline-capable build. */
  readonly offlineReady: () => void
}

export function setupServiceWorker(): ServiceWorkerHandle {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // M11: show "A new version of Kavach is ready" with an explicit button.
      // Never auto-swap mid-crisis — an unexpected reload loses user context.
      console.info('[kavach] update waiting; M11 will surface an explicit prompt')
    },
    onOfflineReady() {
      console.info('[kavach] content cached — Kavach now works without a network')
    },
  })

  return {
    needRefresh: () => void updateSW(true),
    offlineReady: () => undefined,
  }
}
