import { useLanguage } from '../../store/language'
import { Icon, type IconName } from './Icon'

export interface EmptyStateProps {
  title?: string
  body?: string
  icon?: IconName
}

export function EmptyState({ title, body, icon = 'info' }: EmptyStateProps) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <Icon name={icon} className="h-12 w-12 text-muted" />
      <h2 className="text-lg font-bold text-ink">{title ?? t('ui.emptyTitle')}</h2>
      <p className="text-text-2 max-w-prose text-[15px] leading-relaxed">
        {body ?? t('ui.emptyBody')}
      </p>
    </div>
  )
}
