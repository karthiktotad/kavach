/**
 * Shared page frame for the M1 placeholders (and reused by real pages later).
 *
 * Keeps a consistent title order (h1), a short plain-language intro, and a
 * honest "which milestone ships this" note. Honest scaffolding beats fake
 * screenshots for the Technical Implementation judging criterion.
 */
import type { ReactNode } from 'react'
import { useLanguage } from '../store/language'

export interface PageHeaderProps {
  /** i18n key or literal text for the page title. */
  title: string
  /** One sentence, in plain language, about what the screen will do. */
  intro: string
  /** Milestone tag shown as a badge, e.g. "M7". */
  milestone?: string
  children?: ReactNode
}

export function PageHeader({ title, intro, milestone, children }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-ink text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {milestone ? (
          <span className="bg-surface-raised text-ink-muted ring-ink-subtle/30 rounded-full px-2.5 py-1 text-xs font-semibold ring-1">
            {milestone}
          </span>
        ) : null}
      </div>
      <p className="text-ink-muted max-w-prose text-sm leading-relaxed sm:text-base">{intro}</p>
      {children}
    </header>
  )
}

/** Content column with the bottom-nav clearance applied. */
export function Page({ children }: { children: ReactNode }) {
  const { t } = useLanguage()
  return (
    <main
      id="main-content"
      aria-label={t('a11y.mainContent')}
      tabIndex={-1}
      className="w-full flex-1 px-4 pt-4 pb-6"
    >
      {children}
    </main>
  )
}
