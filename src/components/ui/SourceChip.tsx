import { useLanguage } from '../../store/language'
import { Icon } from './Icon'

export interface SourceChipProps {
  /** Provenance label already resolved (dataset name, "signed packet", …). */
  source: string
}

export function SourceChip({ source }: SourceChipProps) {
  const { t } = useLanguage()
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-verified-tint px-2.5 py-1 text-[15px] font-semibold text-verified">
      <Icon name="info" className="h-4 w-4" />
      {t('ui.sourceBasedOn', { source })}
    </span>
  )
}
