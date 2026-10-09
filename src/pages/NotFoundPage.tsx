import { Page } from '../components/Page'
import { Link } from 'react-router-dom'
import { useLanguage } from '../store/language'

/** 404 — a shared link with a typo must never dead-end. */
export default function NotFoundPage() {
  const { t } = useLanguage()
  return (
    <Page>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-ink text-2xl font-bold">404</h1>
          <p className="text-ink-muted">This screen does not exist in Kavach.</p>
        </header>
        <Link
          to="/"
          className="touch-target bg-surface-raised text-ink ring-ink-subtle/30 self-start rounded-xl px-5 font-semibold ring-1"
        >
          {t('nav.home')}
        </Link>
      </div>
    </Page>
  )
}
