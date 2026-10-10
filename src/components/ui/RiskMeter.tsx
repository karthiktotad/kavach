import { useLanguage } from '../../store/language'
import { RISK_BAR_COLORS, RISK_LABEL_KEYS, type RiskLevel } from './risk'

export interface RiskMeterProps {
  level: RiskLevel
  /**
   * Filled bars = verified source. Outlined + hatch = unverified.
   * Shape is the signal; colour is secondary.
   */
  verified?: boolean
}

export function RiskMeter({ level, verified = true }: RiskMeterProps) {
  const { t } = useLanguage()
  const label = t(RISK_LABEL_KEYS[level] ?? 'ui.risk.none')

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1" aria-hidden="true">
        {RISK_BAR_COLORS.map((color, index) => {
          const filled = index < level
          return (
            <span
              key={color}
              className={[
                'h-3 flex-1 rounded-[3px] border-2',
                filled
                  ? verified
                    ? color
                    : `${color} bg-hatch bg-transparent`
                  : 'border-line bg-transparent',
              ].join(' ')}
            />
          )
        })}
      </div>
      <p className="text-[15px] font-bold text-ink">{label}</p>
    </div>
  )
}
