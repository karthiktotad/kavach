import { Page } from '../components/Page'
import { StatusChip } from '../components/StatusChip'
import { useLanguage } from '../store/language'
import { IconAlerts, IconCellular, IconGlobe, IconMe, IconRelay } from '../components/icons'

/**
 * Home. For M1 this is a status surface: where am I on the ladder, what
 * language am I reading in, and the three offline promises (signed packets,
 * offline map, no install).
 */
function HomePage() {
  const { t } = useLanguage()

  return (
    <Page>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-3">
          <div className="text-brand-strong flex items-center gap-2">
            <IconGlobe className="size-5" />
            <span className="text-xs font-bold tracking-[0.2em] uppercase">{t('app.name')}</span>
          </div>
          <h1 className="text-ink text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            {t('app.tagline')}
          </h1>
          <p className="text-ink-muted max-w-prose text-base leading-relaxed">
            {t('page.home.intro')}
          </p>
        </header>

        {/* Always-visible ladder chip, with its explanation. */}
        <section
          aria-labelledby="status-heading"
          className="bg-surface ring-ink-subtle/25 rounded-2xl p-4 ring-1"
        >
          <h2 id="status-heading" className="text-ink-muted mb-2 text-sm font-semibold">
            {t('status.label')}
          </h2>
          <StatusChip showDetail />
        </section>

        {/* The three offline promises — the actual differentiators. */}
        <section aria-labelledby="promise-heading" className="flex flex-col gap-3">
          <h2 id="promise-heading" className="sr-only">
            {t('home.promise.heading')}
          </h2>
          <article className="bg-surface ring-ink-subtle/25 flex gap-3 rounded-2xl p-4 ring-1">
            <IconAlerts className="text-brand mt-0.5 size-6 shrink-0" />
            <div>
              <h3 className="text-ink font-semibold">{t('home.signed.title')}</h3>
              <p className="text-ink-muted mt-1 text-sm leading-relaxed">{t('home.signed.desc')}</p>
            </div>
          </article>
          <article className="bg-surface ring-ink-subtle/25 flex gap-3 rounded-2xl p-4 ring-1">
            <IconCellular className="text-brand mt-0.5 size-6 shrink-0" />
            <div>
              <h3 className="text-ink font-semibold">{t('home.nodata.title')}</h3>
              <p className="text-ink-muted mt-1 text-sm leading-relaxed">{t('home.nodata.desc')}</p>
            </div>
          </article>
          <article className="bg-surface ring-ink-subtle/25 flex gap-3 rounded-2xl p-4 ring-1">
            <IconMe className="text-brand mt-0.5 size-6 shrink-0" />
            <div>
              <h3 className="text-ink font-semibold">{t('home.noinstall.title')}</h3>
              <p className="text-ink-muted mt-1 text-sm leading-relaxed">
                {t('home.noinstall.desc')}
              </p>
            </div>
          </article>
          <article className="bg-surface ring-ink-subtle/25 flex gap-3 rounded-2xl p-4 ring-1">
            <IconRelay className="text-brand mt-0.5 size-6 shrink-0" />
            <div>
              <h3 className="text-ink font-semibold">{t('home.relay.title')}</h3>
              <p className="text-ink-muted mt-1 text-sm leading-relaxed">{t('home.relay.desc')}</p>
            </div>
          </article>
        </section>

        <p className="text-ink-subtle text-xs">{t('status.stubbed')}</p>
      </div>
    </Page>
  )
}

export default HomePage
