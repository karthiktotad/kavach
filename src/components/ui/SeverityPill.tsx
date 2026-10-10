import { useLanguage } from '../../store/language'
import { RISK_LABEL_KEYS, type RiskLevel } from './risk'

const PILL: Record<RiskLevel, string> = {
  0: 'bg-live-tint text-live-text border-live',
  1: 'bg-drill-tint text-drill border-drill',
  2: 'bg-drill-tint text-drill border-drill',
  3: 'bg-danger text-white border-danger-dark',
  4: 'bg-danger-dark text-white border-danger-dark',
}

export interface SeverityPillProps {
  level: RiskLevel
}

export function SeverityPill({ level }: SeverityPillProps) {
  const { t } = useLanguage()
  return (
    <span
      className={`inline-flex items-center rounded-full border-2 px-3 py-1 text-[15px] font-bold ${PILL[level]}`}
    >
      {t(RISK_LABEL_KEYS[level] ?? 'ui.risk.none')}
    </span>
  )
}
