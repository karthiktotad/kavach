/**
 * AppHeader — back, title, connection status, language.
 *
 * The status chip lives here rather than being pushed down the page because the
 * connectivity ladder is the app's core promise: the user must be able to see
 * where they are on it from every screen, at all times, without scrolling
 * (AGENTS.md: "the status chip is always visible").
 *
 * Safe-area top padding via `env()` for the notch, and logical properties so
 * the back arrow and title flip correctly under `dir="rtl"`.
 */
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from './Icon'
import { StatusChip, type StatusLevel } from './StatusChip'

export interface AppHeaderProps {
  title: string
  /**
   * When true a back affordance is rendered. It calls navigate(-1) rather than
   * linking to a hardcoded parent, so it returns the user to wherever they
   * actually came from — including a deep link, where "back" has no other
   * sensible meaning.
   */
  showBack?: boolean
  /** Omit to hide the chip entirely (the gallery does this). */
  statusLevel?: StatusLevel
  /** Pre-formatted age string. StatusChip formats its own otherwise. */
  statusAge?: string | null
  /** Rendered at the inline-end, before the language button. */
  trailing?: ReactNode
  /** Mirrors the shape of `useLanguage().t` so it can be passed straight in. */
  t: (key: string, vars?: Record<string, string | number>) => string
  onOpenLanguage?: () => void
}

export function AppHeader({
  title,
  showBack = false,
  statusLevel,
  statusAge,
  trailing,
  t,
  onOpenLanguage,
}: AppHeaderProps) {
  const navigate = useNavigate()

  return (
    <header
      className="
        sticky top-0 z-20
        border-b border-line bg-surface
        pt-[env(safe-area-inset-top)]
      "
    >
      <div className="mx-auto flex min-h-[56px] max-w-[480px] items-center gap-2 px-3">
        {showBack ? (
          <button
            type="button"
            onClick={() => {
              // `void` because navigate() returns a promise in React Router 7 and
              // nothing here can handle a rejection: navigation failing is not
              // actionable, and an unhandled rejection would surface as a global
              // error in a crisis app.
              void navigate(-1)
            }}
            aria-label={t('ui.back')}
            className="
              -ms-2 inline-flex h-11 w-11 shrink-0 items-center justify-center
              rounded-10 text-ink
              focus-visible:outline focus-visible:outline-[3px]
              focus-visible:outline-verified focus-visible:outline-offset-2
            "
          >
            {/* chevron-left mirrors automatically: the SVG is not transformed,
                but `rtl:` flips it so "back" points right in Arabic. */}
            <Icon name="chevron-left" className="h-6 w-6 rtl:scale-x-[-1]" />
          </button>
        ) : null}

        <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-ink">{title}</h1>

        {trailing}

        {/* StatusChip opens its own Sheet and reads the live level itself, so
            AppHeader only passes through an override when the gallery needs a
            fixed state. Leaving it out entirely hides the chip — which is
            correct for the gallery row that is demonstrating the header chrome
            alone, and is never done on a real screen. */}
        {statusLevel ? <StatusChip level={statusLevel} age={statusAge ?? null} /> : null}

        {onOpenLanguage ? (
          <button
            type="button"
            onClick={onOpenLanguage}
            aria-label={t('a11y.selectLanguage')}
            className="
              inline-flex h-11 w-11 shrink-0 items-center justify-center
              rounded-10 border border-line text-ink
              focus-visible:outline focus-visible:outline-[3px]
              focus-visible:outline-verified focus-visible:outline-offset-2
            "
          >
            <Icon name="globe" className="h-5 w-5" />
          </button>
        ) : null}
      </div>
    </header>
  )
}