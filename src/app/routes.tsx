import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { BottomNav } from '../components/BottomNav'
import { UpdateBanner } from '../components/UpdateBanner'
import { useLanguage } from '../store/language'
import { applyLocaleToDocument } from '../store/language'
import { getSetting, SETTING } from '../lib/db'
import { getServiceWorkerState, onServiceWorkerUpdate } from './pwa'
import { packManager } from '../lib/pack'

import HomePage from '../pages/HomePage'

// Route-level code splitting: MapLibre and the assistant are heavy and must not
// sit in the offline-critical precache bundle (see vite.config.ts manualChunks).
const AlertsPage = lazy(() => import('../pages/AlertsPage'))
const MapPage = lazy(() => import('../pages/MapPage'))
const AssistPage = lazy(() => import('../pages/AssistPage'))
const AidPage = lazy(() => import('../pages/AidPage'))
const PhrasesPage = lazy(() => import('../pages/PhrasesPage'))
const MePage = lazy(() => import('../pages/MePage'))
const ReportsPage = lazy(() => import('../pages/ReportsPage'))
const AuthorityPage = lazy(() => import('../pages/AuthorityPage'))
const PacketPage = lazy(() => import('../pages/PacketPage'))
const ReadyPage = lazy(() => import('../pages/ReadyPage'))
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))

/** Scroll to top on navigation — hash routing does not do it for us. */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

/**
 * Keeps `<html lang>` and `<html dir>` in sync with the active locale.
 * RTL support is a first-class requirement (rule 6), not a CSS afterthought.
 */
function LocaleDocumentSync() {
  const { locale } = useLanguage()
  useEffect(() => {
    applyLocaleToDocument(locale)
  }, [locale])
  return null
}

/** Accessible busy indicator while a lazy route loads (offline: instant). */
function RouteFallback() {
  const { t } = useLanguage()
  return (
    <div className="text-ink-muted p-8 text-center text-sm" role="status" aria-live="polite">
      {t('ui.loading')}…
    </div>
  )
}

/**
 * Send first-time users to Get Ready before anything else.
 *
 * The pack download is the whole point of the app, so it happens once, up
 * front, while the tourist still has hotel wi-Fi. Deliberately not a hard gate:
 * a user who skips it must still reach every screen, because being trapped in
 * onboarding would be the worst possible time to hit a dead end.
 */
function OnboardingGate({ children }: { children: ReactNode }) {
  const location = useLocation()
  // Keyed by the path the value was read for. A stale `false` must never drive a
  // redirect: Get Ready sets the flag and then navigates home, and this gate
  // stays mounted across that transition, so rendering the redirect from a
  // value read for the previous path bounced the user straight back to /ready.
  const [read, setRead] = useState<{ path: string; value: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    void getSetting<boolean>(SETTING.ONBOARDED, false).then((value) => {
      if (!cancelled) setRead({ path: location.pathname, value })
    })
    return () => {
      cancelled = true
    }
  }, [location.pathname])

  // Render nothing until we know the flag for THIS path.
  if (!read || read.path !== location.pathname) return null

  // `/a/<packet>` is always exempt: a signed packet handed over by SMS must render
  // even for someone who never completed onboarding.
  const exempt = location.pathname === '/ready' || location.pathname.startsWith('/a/')
  if (!read.value && !exempt) return <Navigate to="/ready" replace />

  return <>{children}</>
}

/**
 * Non-blocking update banner.
 *
 * Never auto-reloads: an unexpected reload during a flood destroys whatever the
 * user was reading. Both the service worker and the content pack offer an
 * explicit "update when you are ready".
 */
function Updates() {
  const [sw, setSw] = useState(getServiceWorkerState)
  // Wrapped in an arrow: a bare method reference would lose `this` when React
  // invokes the initialiser.
  const [pack, setPack] = useState(() => packManager.getState())
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => onServiceWorkerUpdate(setSw), [])
  useEffect(() => packManager.subscribe(setPack), [])

  // Ask whether a newer pack exists, but never block the app on the answer.
  useEffect(() => {
    void packManager.checkForUpdate().then(() => undefined)
  }, [])

  if (dismissed) return null

  return (
    <UpdateBanner
      serviceWorkerReady={sw.needRefresh}
      packUpdateReady={pack.status === 'update-available'}
      onApplyServiceWorker={sw.applyUpdate}
      onApplyPack={() => void packManager.ensureInstalled()}
      onDismiss={() => setDismissed(true)}
    />
  )
}

export function AppRoutes() {
  const { t } = useLanguage()

  return (
    <div className="bg-surface-sunken min-h-dvh">
      <ScrollToTop />
      <LocaleDocumentSync />

      <a
        href="#main-content"
        className="sr-only-focusable bg-brand text-surface-sunken absolute top-2 z-50 rounded-lg px-4 py-2 font-semibold"
      >
        {t('a11y.skipToContent')}
      </a>

      <AppHeader />
      <Updates />

      <Suspense fallback={<RouteFallback />}>
        <OnboardingGate>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/assist" element={<AssistPage />} />
            <Route path="/aid" element={<AidPage />} />
            <Route path="/phrases" element={<PhrasesPage />} />
            <Route path="/me" element={<MePage />} />
            <Route path="/report" element={<ReportsPage />} />
            <Route path="/ready" element={<ReadyPage />} />
            <Route path="/authority" element={<AuthorityPage />} />
            {/* Signed-packet deep link: /#/a/<packet> — must work fully offline. */}
            <Route path="/a/:packet" element={<PacketPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </OnboardingGate>
      </Suspense>

      <BottomNav />
    </div>
  )
}
