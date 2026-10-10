import type { ReactNode } from 'react'
import { useLanguage } from '../../store/language'

export interface PhoneShellProps {
  children: ReactNode
}

/**
 * Phone-width column on desktop, full-bleed on a real phone.
 * Safe-area padding lives on header/nav; this shell only constrains width.
 */
export function PhoneShell({ children }: PhoneShellProps) {
  const { t } = useLanguage()
  return (
    <div className="bg-ground min-h-dvh">
      <a
        href="#main-content"
        className="sr-only-focusable bg-verified absolute top-2 start-2 z-50 rounded-10 px-4 py-2 font-semibold text-white"
      >
        {t('a11y.skipToContent')}
      </a>
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-surface sm:shadow-[0_0_40px_rgb(11_31_51_/_0.12)]">
        {children}
      </div>
    </div>
  )
}
