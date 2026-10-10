/**
 * Active Alerts Panel for Authority Console.
 * Shows active warnings, live countdown timer, and quick Extend, Escalate, and Cancel actions.
 */
import { useEffect, useState } from 'react'
import { Button, Card, Icon, SeverityPill } from '../../components/ui'
import type { IssuedAlertRecord } from './types'

export interface ActiveAlertsPanelProps {
  readonly activeAlerts: readonly IssuedAlertRecord[]
  readonly onExtend: (alert: IssuedAlertRecord) => void
  readonly onEscalate: (alert: IssuedAlertRecord) => void
  readonly onCancel: (alert: IssuedAlertRecord) => void
  readonly onCreateNew: () => void
}

function formatCountdown(expiresAt: number, now: number): string {
  const diffMs = expiresAt - now
  if (diffMs <= 0) return 'Expired'
  const totalSec = Math.floor(diffMs / 1000)
  const hours = Math.floor(totalSec / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`
  return `${mins}m ${secs}s`
}

export function ActiveAlertsPanel({
  activeAlerts,
  onExtend,
  onEscalate,
  onCancel,
  onCreateNew,
}: ActiveAlertsPanelProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="space-y-6" data-testid="active-alerts-panel">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-ink">Active Official Warnings</h2>
          <p className="text-xs font-medium text-ink-muted">
            Currently active signed alerts being verified by tourist devices.
          </p>
        </div>

        <Button
          variant="primary"
          onClick={onCreateNew}
          className="text-xs font-bold"
          data-testid="create-new-alert-btn"
        >
          <Icon name="flag" className="h-4 w-4" />
          <span>Issue New Alert</span>
        </Button>
      </div>

      {activeAlerts.length === 0 ? (
        <Card className="p-8 text-center space-y-3 border-line">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
            <Icon name="shield-check" className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-ink">No Active Alerts</h3>
            <p className="text-xs font-medium text-ink-muted">
              There are currently no active official crisis warnings or drills in effect.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {activeAlerts.map((alert) => {
            const isDrill = alert.mode === 'D'
            const countdown = formatCountdown(alert.expiresAt, now)

            return (
              <Card
                key={alert.id}
                className={`p-5 space-y-4 border transition-all ${
                  isDrill ? 'border-drill/30 bg-drill-tint/10' : 'border-danger/30 bg-danger/5'
                }`}
                data-testid={`active-alert-card-${alert.id}`}
              >
                {/* Header line */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
                  <div className="flex items-center gap-2">
                    <SeverityPill level={alert.level} />
                    <span className="font-extrabold text-sm text-ink uppercase">
                      {alert.hazard}
                    </span>
                    {isDrill && (
                      <span className="rounded-6 bg-drill px-2 py-0.5 text-[10px] font-black text-white uppercase">
                        DRILL · 演習
                      </span>
                    )}
                  </div>

                  {/* Expiry countdown */}
                  <div className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 font-mono text-xs font-extrabold text-ink border border-line">
                    <Icon name="clock" className="h-3.5 w-3.5 text-danger" />
                    <span>Expires in {countdown}</span>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="font-semibold text-ink-muted">Target Zones</span>
                    <div className="font-extrabold text-ink">{alert.zones.join(', ')}</div>
                  </div>
                  <div>
                    <span className="font-semibold text-ink-muted">Sequence</span>
                    <div className="font-mono font-bold text-ink">Seq #{alert.seq}</div>
                  </div>
                  <div>
                    <span className="font-semibold text-ink-muted">Key ID</span>
                    <div className="font-mono font-bold text-ink">{alert.kid}</div>
                  </div>
                </div>

                {/* Packet string snippet */}
                <div className="rounded-8 bg-surface p-2.5 font-mono text-[11px] text-ink-muted break-all border border-line select-all">
                  {alert.packet}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line/60">
                  <Button
                    variant="secondary"
                    onClick={() => onExtend(alert)}
                    className="flex-1 text-xs font-bold"
                    data-testid={`alert-extend-btn-${alert.id}`}
                  >
                    Extend (+2h)
                  </Button>

                  <Button
                    variant="secondary"
                    onClick={() => onEscalate(alert)}
                    className="flex-1 text-xs font-bold"
                    data-testid={`alert-escalate-btn-${alert.id}`}
                  >
                    Escalate (+1 Level)
                  </Button>

                  <Button
                    variant="danger"
                    onClick={() => onCancel(alert)}
                    className="flex-1 text-xs font-bold"
                    data-testid={`alert-cancel-btn-${alert.id}`}
                  >
                    <Icon name="warning" className="h-3.5 w-3.5" />
                    <span>Cancel Alert (All-Clear)</span>
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
