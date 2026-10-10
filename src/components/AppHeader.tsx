/**
 * App header: back (when not home), brand, always-visible StatusChip, language.
 */
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LanguageSelector } from './LanguageSelector'
import { OutboxIndicator } from './StatusChip'
import { Icon } from './ui/Icon'
import { StatusChip } from './ui/StatusChip'
import { useLanguage } from '../store/language'
import { PILOT_REGION } from '../config/region'
import { outbox } from '../lib/outbox'

export function AppHeader() {
  const { t } = useLanguage()
  const location = useLocation()
  const navigate = useNavigate()
  const [pending, setPending] = useState(0)
  const showBack = location.pathname !== '/' && location.pathname !== '/ready'

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
      className="bg-surface/90 border-line sticky top-0 z-20 border-b backdrop-blur-md"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div className="flex items-center gap-2 px-4 py-2.5">
        {showBack ? (
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) navigate(-1)
              else void navigate('/')
            }}
            aria-label={t('ui.back')}
            className="text-ink inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-10"
          >
            <Icon name="chevron-left" className="h-6 w-6 rtl:rotate-180" />
          </button>
        ) : (
          <Link
            to="/"
            className="text-verified flex min-w-0 items-center gap-2"
            aria-label={t('app.name')}
          >
            <Icon name="globe" className="h-6 w-6 shrink-0" />
            <span className="truncate text-lg font-extrabold tracking-tight">{t('app.name')}</span>
          </Link>
        )}

        <div className="ms-auto flex items-center gap-2">
          <OutboxIndicator pending={pending} />
          <StatusChip />
          <LanguageSelector />
        </div>
      </div>

      <p className="text-muted truncate px-4 pb-2 text-[12px]">{PILOT_REGION.name}</p>
    </header>
  )
}
