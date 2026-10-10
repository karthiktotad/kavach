/** Shared risk vocabulary. 0 = NONE … 4 = EXTREME. */
export const RISK_LEVELS = [0, 1, 2, 3, 4] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

export const RISK_LABEL_KEYS = [
  'ui.risk.none',
  'ui.risk.low',
  'ui.risk.moderate',
  'ui.risk.high',
  'ui.risk.extreme',
] as const

export const RISK_BAR_COLORS = [
  'bg-risk-0 border-risk-0',
  'bg-risk-1 border-risk-1',
  'bg-risk-2 border-risk-2',
  'bg-risk-3 border-risk-3',
] as const
