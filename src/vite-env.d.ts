/**
 * Ambient types for the virtual modules provided by vite-plugin-pwa.
 *
 * `vite/client` does not know about them, and these modules only exist when
 * the plugin is active — declaring them here keeps `tsc` honest in every
 * environment (including `tsc -b` on a cold cache).
 */

declare module 'virtual:pwa-register' {
  export interface RegisterSWOptions {
    immediate?: boolean
    onNeedRefresh?: () => void
    onOfflineReady?: () => void
    onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void
    onRegisterError?: (error: unknown) => void
  }

  /** Returns a callback that forces the waiting worker to activate. */
  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>
}

declare module 'virtual:pwa-info' {
  export interface PwaInfo {
    type: 'generated' | 'manifest' | 'html'
    timestamp: string
    mode: 'development' | 'production'
    buildTime: number
    swMode: boolean
    scope: string
    fileSafeName: string
    manifest?: { name?: string; short_name?: string; start_url?: string }
    size?: number
    warnings?: Array<{ code: string; value?: string; msg: string }>
  }
  export const pwaInfo: PwaInfo
}

declare module 'virtual:pwa-precache-manifest' {
  /** Array of `[url, revision]` tuples. Used for build-time integrity checks. */
  export const precacheManifest: Array<[string, string]>
}

// Re-exported so `virtual:pwa-register` can type its handle.
declare module 'workbox-window' {
  export interface WorkboxServiceWorker {
    addEventListener(type: string, listener: (event: Event) => void): void
  }
}
