/**
 * History Panel for Authority Console.
 * Shows historical issued packets with mode filters and in-browser offline re-verification badges.
 */
import { useEffect, useState } from 'react'
import { Card, Icon, SeverityPill } from '../../components/ui'
import { getAuthorityKeys } from '../../lib/packetClient'
import { verifyPacket, type VerifyResult } from '../../../shared/packet'
import type { IssuedAlertRecord } from './types'

export interface HistoryPanelProps {
  readonly history: readonly IssuedAlertRecord[]
}

export function HistoryPanel({ history }: HistoryPanelProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'D' | 'L'>('all')
  const [verificationMap, setVerificationMap] = useState<Record<string, VerifyResult>>({})

  // Perform in-browser offline ECDSA re-verification for all packets in history
  useEffect(() => {
    let active = true
    const keys = getAuthorityKeys()

    Promise.all(
      history.map(async (item) => {
        const res = await verifyPacket(keys, item.packet, { allowExpired: true })
        return { id: item.id, res }
      }),
    ).then((results) => {
      if (!active) return
      const map: Record<string, VerifyResult> = {}
      for (const r of results) map[r.id] = r.res
      setVerificationMap(map)
    }).catch(() => {
      // Ignore
    })

    return () => {
      active = false
    }
  }, [history])

  const filtered = history.filter((item) => {
    if (filterMode === 'all') return true
    return item.mode === filterMode
  })

  return (
    <div className="space-y-6" data-testid="history-panel">
      {/* Header & Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div>
          <h2 className="text-lg font-black text-ink">Historical Alert Ledger</h2>
          <p className="text-xs font-medium text-ink-muted">
            Auditable log of all issued signed packets. Every packet is re-verified in your browser offline.
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex items-center rounded-10 bg-surface-sunken p-1 border border-line">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`rounded-8 px-3 py-1 text-xs font-bold transition-all ${
              filterMode === 'all'
                ? 'bg-verified text-white shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
            data-testid="history-filter-all"
          >
            All ({history.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('D')}
            className={`rounded-8 px-3 py-1 text-xs font-bold transition-all ${
              filterMode === 'D'
                ? 'bg-drill text-white shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
            data-testid="history-filter-drill"
          >
            Drill ({history.filter((h) => h.mode === 'D').length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('L')}
            className={`rounded-8 px-3 py-1 text-xs font-bold transition-all ${
              filterMode === 'L'
                ? 'bg-danger text-white shadow-sm'
                : 'text-ink-muted hover:text-ink'
            }`}
            data-testid="history-filter-live"
          >
            Live ({history.filter((h) => h.mode === 'L').length})
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center space-y-2 border-line">
          <p className="text-xs font-medium text-ink-muted">No packets matching filter criteria.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const isDrill = item.mode === 'D'
            const verifyStatus = verificationMap[item.id]

            return (
              <Card
                key={item.id}
                className="p-4 space-y-3 border-line bg-surface hover:border-verified/40 transition-colors"
                data-testid={`history-item-${item.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <SeverityPill level={item.level} />
                    <span className="font-extrabold text-sm text-ink">{item.hazard}</span>
                    {isDrill ? (
                      <span className="rounded-6 bg-drill/15 text-drill font-black text-[10px] px-2 py-0.5 uppercase">
                        DRILL
                      </span>
                    ) : (
                      <span className="rounded-6 bg-danger/15 text-danger font-black text-[10px] px-2 py-0.5 uppercase">
                        LIVE
                      </span>
                    )}
                    <span className="font-mono text-xs font-bold text-ink-muted">
                      Seq #{item.seq}
                    </span>
                  </div>

                  {/* In-Browser Re-Verification Badge */}
                  <div className="flex items-center gap-1.5">
                    {verifyStatus ? (
                      verifyStatus.ok ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-live-tint px-2.5 py-0.5 font-bold text-[11px] text-live-text border border-live/30">
                          <Icon name="shield-check" className="h-3.5 w-3.5 text-live" />
                          <span>ECDSA Verified (In-Browser)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-0.5 font-bold text-[11px] text-danger border border-danger/30">
                          <Icon name="warning" className="h-3.5 w-3.5 text-danger" />
                          <span>Signature Failed</span>
                        </span>
                      )
                    ) : (
                      <span className="text-[11px] text-ink-muted">Verifying…</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-ink-muted">
                  <div>
                    <span className="font-semibold block text-[10px]">Zones</span>
                    <span className="font-bold text-ink">{item.zones.join(', ')}</span>
                  </div>
                  <div>
                    <span className="font-semibold block text-[10px]">Issued At</span>
                    <span className="font-bold text-ink">{new Date(item.issuedAt).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="font-semibold block text-[10px]">Expires At</span>
                    <span className="font-bold text-ink">{new Date(item.expiresAt).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="font-semibold block text-[10px]">Key ID</span>
                    <span className="font-mono font-bold text-ink">{item.kid}</span>
                  </div>
                </div>

                <div className="rounded-8 bg-surface-sunken p-2 font-mono text-[11px] text-ink-muted break-all border border-line select-all">
                  {item.packet}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
