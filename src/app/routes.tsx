import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { BottomNav } from '../components/BottomNav'
import { useLanguage } from '../store/language'
import { applyLocaleToDocument } from '../store/language'

import HomePage from '../pages/HomePage'

// Route-level code splitting: MapLibre and the assistant are heavy and must not
// sit in the offline-critical precache bundle (see vite.config.ts manualChunks).
const AlertsPage = lazy(() => import('../pages/AlertsPage'))
const MapPage = lazy(() => import('../pages/MapPage'))
const AssistPage = lazy(() => import('../pages/AssistPage'))
const AidPage = lazy(() => import('../pages/AidPage'))
const PhrasesPage = lazy(() => import('../pages/PhrasesPage'))
const MePage = lazy(() => import('../pages/MePage'))
const ReportPage = lazy(() => import('../pages/ReportPage'))
const AuthorityPage = lazy(() => import('../pages/AuthorityPage'))
const PacketPage = lazy(() => import('../pages/PacketPage'))
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

      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/assist" element={<AssistPage />} />
          <Route path="/aid" element={<AidPage />} />
          <Route path="/phrases" element={<PhrasesPage />} />
          <Route path="/me" element={<MePage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/authority" element={<AuthorityPage />} />
          {/* Signed-packet deep link: /#/a/<packet> — must work fully offline. */}
          <Route path="/a/:packet" element={<PacketPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>

      <BottomNav />
    </div>
  )
}
