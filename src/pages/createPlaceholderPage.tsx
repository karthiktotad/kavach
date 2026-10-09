import type { ReactNode } from 'react'
import { Page, PageHeader } from '../components/Page'
import { useLanguage } from '../store/language'

/**
 * Factory for the M1 placeholder pages.
 *
 * Every screen in the brief gets a real route now — so the router, the
 * navigation and the deep-link behaviour are genuinely exercised in M1 — but
 * the content is honest about which milestone delivers it. No fake data, ever.
 */
export function createPlaceholderPage(options: {
  /** i18n key for the h1. */
  titleKey: string
  /** i18n key for the one-sentence explanation. */
  introKey: string
  /** Milestone badge. */
  milestone: string
  /** Extra body content (cards, lists). */
  children?: ReactNode
}) {
  function PlaceholderPage() {
    const { t } = useLanguage()
    return (
      <Page>
        <div className="flex flex-col gap-6">
          <PageHeader
            title={t(options.titleKey)}
            intro={t(options.introKey)}
            milestone={options.milestone}
          />
          {options.children}
          <PlaceholderNotice milestone={options.milestone} />
        </div>
      </Page>
    )
  }
  return PlaceholderPage
}

function PlaceholderNotice({ milestone }: { milestone: string }) {
  const { t } = useLanguage()
  return (
    <p className="bg-surface-raised text-ink-subtle ring-ink-subtle/20 rounded-xl p-3 text-xs leading-relaxed ring-1">
      <span className="text-ink-muted font-semibold">
        {t('ui.comingSoon')} · {milestone}
      </span>
      {' — '}
      {t('status.stubbed')}
    </p>
  )
}
