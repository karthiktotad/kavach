/**
 * App header: brand, always-visible connectivity chip, queue indicator,
 * language selector.
 *
 * The status chip is never hidden, even on a good connection — during a crisis
 * the user must be able to tell at a glance whether what they are reading came
 * from the network or from the device (AGENTS.md §8).
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LanguageSelector } from './LanguageSelector'
import { OutboxIndicator, StatusChip } from './StatusChip'
import { IconGlobe } from './icons'
import { useLanguage } from '../store/language'
import { PILOT_REGION } from '../config/region'
import { outbox } from '../lib/outbox'

export function AppHeader() {
  const { t } = useLanguage()
  const [pending, setPending] = useState(0)

  // Poll the queue rather than subscribing: the count changes from user actions
  // and from the outbox's own drain, and a 3 s tick is far cheaper than wiring
  // an event bus through before M9 needs one.
  useEffect(() => {
    let alive = true
    const tick = () => void outbox.pending().then((n) => alive && setPending(n))
    tick()
    const timer = setInterval(tick, 3000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  return (
    <header
      className="bg-surface/90 border-ink-subtle/20 sticky top-0 z-20 border-b backdrop-blur-md"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5 sm:gap-3">
        <Link
          to="/"
          className="text-brand-strong flex min-w-0 items-center gap-2"
          aria-label={t('app.name')}
        >
          <IconGlobe className="size-6 shrink-0" />
          <span className="truncate text-lg font-extrabold tracking-tight">{t('app.name')}</span>
        </Link>

        <div className="ms-auto flex items-center gap-2">
          <OutboxIndicator pending={pending} />
          <StatusChip />
          <LanguageSelector />
        </div>
      </div>

      {/* Region is visible so nobody mistakes this for a global deployment. */}
      <p className="text-ink-subtle mx-auto max-w-3xl truncate px-4 pb-2 text-[0.7rem]">
        {PILOT_REGION.name}
      </p>
    </header>
  )
}
