import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Page, PageHeader } from '../components/Page'
import { Button, Card, EmptyState, VerifiedBadge } from '../components/ui'
import { getDb, type AlertRow } from '../lib/db'
import { formatAge } from '../lib/freshness'
import { useLanguage } from '../store/language'

export default function AlertsPage() {
  const { t, locale } = useLanguage()
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [sourceByPacket, setSourceByPacket] = useState<Record<string, string>>({})
  const [now] = useState(() => Date.now())

  useEffect(() => {
    let alive = true

    const load = async () => {
      const db = getDb()
      const [rows, packets] = await Promise.all([db.alerts.orderBy('issuedAt').reverse().toArray(), db.packets.toArray()])
      if (!alive) return

      const byPacket = Object.fromEntries(packets.map((packet) => [packet.id, packet.source]))
      setAlerts(rows)
      setSourceByPacket(byPacket)
    }

    void load()

    return () => {
      alive = false
    }
  }, [])

  const effective = alerts.filter((alert) => !alert.expiresAt || alert.expiresAt > now)
  const history = alerts.filter((alert) => alert.expiresAt && alert.expiresAt <= now)

  const list = [...effective, ...history].sort((a, b) => {
    if ((b.level ?? 0) !== (a.level ?? 0)) return (b.level ?? 0) - (a.level ?? 0)
    return (b.issuedAt ?? 0) - (a.issuedAt ?? 0)
  })

  if (!list.length) {
    return (
      <Page>
        <div className="mx-auto max-w-[420px]">
          <PageHeader title={t('page.alerts.title')} intro={t('page.alerts.intro')} />
          <EmptyState title={t('ui.emptyTitle')} body={t('ui.emptyBody')} />
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <div className="mx-auto flex max-w-[420px] flex-col gap-3">
        <PageHeader title={t('page.alerts.title')} intro={t('page.alerts.intro')} />

        {list.map((alert) => {
          const source = sourceByPacket[alert.packetId] ?? 'share'
          const sourceLabel =
            source === 'sync'
              ? t('packet.source.server')
              : source === 'sms'
                ? t('packet.source.sms')
                : source === 'qr'
                  ? t('packet.source.qr')
                  : source === 'share'
                    ? t('packet.source.share')
                    : t('packet.source.manual')

          const expired = !!alert.expiresAt && alert.expiresAt <= now

          return (
            <Link key={alert.id} to={`/a/${encodeURIComponent(alert.packetId)}`} className="block">
              <Card className={`flex flex-col gap-3 p-4 ${expired ? 'opacity-75' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-ink">{alert.hazard}</span>
                      <span className="text-xs text-muted">·</span>
                      <span className="text-sm font-semibold text-ink">Level {alert.level ?? 0}</span>
                    </div>
                    <p className="truncate text-sm text-muted">{alert.zoneIds.join(', ') || 'Unknown zone'}</p>
                  </div>
                  <VerifiedBadge />
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                  {alert.isDrill ? (
                    <span className="rounded-full bg-drill-tint px-2 py-1 font-bold text-drill uppercase tracking-[0.12em]">
                      {t('ui.drill')}
                    </span>
                  ) : null}
                  <span>{sourceLabel}</span>
                  <span>·</span>
                  <span>{formatAge(alert.issuedAt, locale)}</span>
                </div>

                <div className="flex items-center justify-between gap-2 text-[12px] text-muted">
                  <span>{alert.zoneIds.length ? alert.zoneIds.join(', ') : 'No zone listed'}</span>
                  {expired ? <span className="font-semibold text-danger">Expired</span> : null}
                </div>
              </Card>
            </Link>
          )
        })}

        <div className="pt-2">
          <Button href="/scan" variant="secondary" size="lg" className="w-full">
            {t('scan.title')}
          </Button>
        </div>
      </div>
    </Page>
  )
}
