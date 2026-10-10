import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Page } from '../components/Page'
import { ConnectionSummary } from '../components/StatusChip'
import { useLanguage } from '../store/language'
import { packManager, type PackState } from '../lib/pack'
import { IconAlerts, IconCellular, IconGlobe, IconMe, IconRelay } from '../components/icons'

/** Subscribe to the pack manager so the version shown is the one on disk. */
function usePackState(): PackState {
  const [state, setState] = useState<PackState>(() => packManager.getState())
  useEffect(() => packManager.subscribe(setState), [])
  return state
}

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

        {/*
          The header already shows the compact chip. Home explains the current
          level in words instead — a second identical button would duplicate its
          accessible name and add nothing for the user.
        */}
        <section
          aria-labelledby="status-heading"
          className="bg-surface ring-ink-subtle/25 rounded-2xl p-4 ring-1"
        >
          <h2 id="status-heading" className="text-ink-muted mb-2 text-sm font-semibold">
            {t('status.label')}
          </h2>
          <ConnectionSummary />
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

        <OfflinePackSummary />
      </div>
    </Page>
  )
}

/**
 * Live pack status.
 *
 * Replaces the "status detection arrives in M3" placeholder: the user should be
 * able to see that the offline data is actually on their device, and when it
 * was last refreshed. That is a safety fact, not a milestone note.
 */
function OfflinePackSummary() {
  const { t } = useLanguage()
  const pack = usePackState()

  if (pack.status === 'ready') {
    return (
      <p className="text-ink-subtle text-xs">
        {t('home.packReady', { version: pack.version ?? '—' })}
      </p>
    )
  }
  return (
    <p className="text-ink-subtle text-xs">
      <Link to="/ready" className="underline">
        {t('home.packNotReady')}
      </Link>
    </p>
  )
}

export default HomePage
