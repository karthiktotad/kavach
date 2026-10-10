import { Link } from 'react-router-dom'
import { Page, PageHeader } from '../components/Page'
import { useLanguage } from '../store/language'
import { IconReport } from '../components/icons'

/** M9 — community reports with a trust score, queued in the offline outbox. */
export default function ReportsPage() {
  const { t } = useLanguage()
  return (
    <Page>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('page.report.title')} intro={t('page.report.intro')} milestone="M9" />
        <div className="bg-surface ring-ink-subtle/25 flex items-start gap-3 rounded-2xl p-4 ring-1">
          <IconReport className="text-ink-muted mt-0.5 size-6 shrink-0" />
          <p className="text-ink-muted text-sm leading-relaxed">
            Reports from other people are never shown as official alerts. They carry a confidence
            score and a source label, and they expire.
          </p>
        </div>
        <Link
          to="/"
          className="touch-target bg-surface-raised text-ink ring-ink-subtle/30 self-start rounded-xl px-5 font-semibold ring-1"
        >
          {t('ui.back')}
        </Link>
      </div>
    </Page>
  )
}
