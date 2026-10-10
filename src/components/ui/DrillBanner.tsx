import { useLanguage } from '../../store/language'
import { Icon } from './Icon'

/** Orange + flag icon. Drills must never look like a live verified alert. */
export function DrillBanner() {
  const { t } = useLanguage()
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-14 bg-drill-tint p-3 text-drill ring-2 ring-drill"
    >
      <Icon name="flag" className="mt-0.5 h-6 w-6 shrink-0" />
      <div className="flex flex-col gap-0.5">
        <p className="font-bold tracking-wide uppercase">{t('ui.drill')}</p>
        <p className="text-[15px] leading-snug">{t('ui.drillBanner')}</p>
      </div>
    </div>
  )
}
