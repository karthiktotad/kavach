/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `shared/` is pure TS used by BOTH the client and Supabase Edge Functions.
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null, // we call registerSW() ourselves in src/app/pwa.tsx
      includeAssets: ['favicon.svg', 'apple-touch-icon.svg', 'robots.txt'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Offline first: everything the app needs to boot must be in the precache.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            // The preloaded content pack (map data, shelters, KB, templates).
            // Stale-while-revalidate: always answer from cache, refresh in background.
            urlPattern: ({ url }) => url.pathname.startsWith('/pack/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'kavach-content-pack',
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Computed risk snapshot from the Edge Function.
            urlPattern: ({ url }) => url.pathname.includes('/functions/v1/snapshot'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'kavach-snapshot',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 },
            },
          },
          {
            // Optional map tiles. NEVER required — Kavach works with none.
            urlPattern: ({ url, request }) =>
              request.destination === 'image' || /\.(pbf|mvt|png|jpg|webp)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'kavach-map-tiles',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        id: '/',
        name: 'Kavach — Crisis Alerts for Tourists',
        short_name: 'Kavach',
        description:
          'Offline-first, signed crisis alerts for tourists. Verify and read official warnings in your language, even with no internet.',
        lang: 'en',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'browser'],
        orientation: 'portrait',
        background_color: '#0b1120',
        theme_color: '#0b1120',
        categories: ['travel', 'utilities', 'medical', 'government'],
        icons: [
          { src: 'pwa-192x192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-512x512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          {
            src: 'pwa-maskable-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Alerts', short_name: 'Alerts', url: '/#/alerts' },
          { name: 'Map', short_name: 'Map', url: '/#/map' },
          { name: 'SOS', short_name: 'SOS', url: '/#/aid' },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    // MapLibre (~800 kB) is only pulled in by the lazy /map route in M8, so the
    // offline-critical precache stays small. Tune once M8 lands.
    chunkSizeWarningLimit: 1200,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/**/*.{test,spec}.{ts,tsx}',
      'shared/**/*.{test,spec}.ts',
      'src/**/*.{test,spec}.{ts,tsx}',
    ],
    css: false,
    restoreMocks: true,
  },
})
