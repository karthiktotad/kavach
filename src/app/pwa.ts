/**
 * Service-worker registration and the update flow.
 *
 * `injectRegister: null` in vite.config.ts means we own this file. That is
 * deliberate: offline behaviour is the product, so the SW lifecycle must be
 * app code we can reason about rather than a build-plugin side effect.
 *
 * Policy: a waiting worker is NEVER activated automatically. During a flood a
 * surprise reload destroys whatever the user was reading. The user is offered
 * an explicit, non-blocking banner instead.
 */
import { registerSW } from 'virtual:pwa-register'

interface SwUpdateState {
  /** A new service worker is downloaded and waiting. */
  needRefresh: boolean
  /** The app shell is cached and the app works offline. */
  offlineReady: boolean
  /** Activate the waiting worker. */
  applyUpdate: () => void
}

type Listener = (state: SwUpdateState) => void

const listeners = new Set<Listener>()

const state: SwUpdateState = {
  needRefresh: false,
  offlineReady: false,
  applyUpdate: () => void updateSW(true),
}

function emit(): void {
  for (const listener of listeners) listener(state)
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  listener(state)
  return () => {
    listeners.delete(listener)
  }
}

let started = false

/**
 * Start watching for updates.
 *
 * Returns an unsubscribe. In development vite-plugin-pwa's devOptions are
 * disabled, so this registers nothing and the app runs as a plain Vite app.
 */
export function setupServiceWorker(): void {
  if (started) return
  started = true

  // In development vite-plugin-pwa's devOptions are disabled: no worker, and
  // the app behaves as a plain Vite app.
  if (!import.meta.env.PROD) return

  updateSW = registerSW({
    // Register after load so a slow worker download never delays first paint.
    immediate: false,
    onNeedRefresh() {
      state.needRefresh = true
      emit()
    },
    onOfflineReady() {
      state.offlineReady = true
      emit()
    },
    onRegisterError(error: unknown) {
      // A failed SW registration means no offline shell. Loud, but not fatal:
      // the app still works online.
      console.warn('[kavach] service worker registration failed', error)
    },
  })
}

/** Subscribe to update state (for the non-blocking banner). */
export function onServiceWorkerUpdate(listener: Listener): () => void {
  return subscribe(listener)
}

/** Current update state, for a first render before any event fires. */
export function getServiceWorkerState(): SwUpdateState {
  return state
}

/* Placeholder until registerSW() assigns the real updater. */
let updateSW: (reloadPage?: boolean) => Promise<void> = () => Promise.resolve()
