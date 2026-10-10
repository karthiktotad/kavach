import { useLanguage } from '../../store/language'
import { Icon } from './Icon'

/** Dashed outline — the opposite of VerifiedBadge's filled bar. */
export function UnverifiedTag() {
  const { t } = useLanguage()
  return (
    <span className="inline-flex items-center gap-1.5 rounded-10 border-2 border-dashed border-muted px-2.5 py-1 text-[15px] font-bold text-muted">
      <Icon name="warning" className="h-4 w-4" />
      {t('ui.unverified')}
    </span>
  )
}
