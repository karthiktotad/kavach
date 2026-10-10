import { useLanguage } from '../../store/language'
import { Icon } from './Icon'

/** Filled bar + check + word — never colour alone, never the same shape as RiskMeter. */
export function VerifiedBadge() {
  const { t } = useLanguage()
  return (
    <span className="inline-flex items-center gap-1.5 rounded-10 bg-verified px-2.5 py-1 text-[15px] font-bold text-white">
      <Icon name="check-circle" className="h-4 w-4" />
      {t('ui.verified')}
    </span>
  )
}
