import { useEffect, useState } from 'react'
import { Button, Card, DrillBanner, RiskMeter, VerifiedBadge } from '../components/ui'
import { Page } from '../components/Page'
import { useLanguage } from '../store/language'
import { useConnectivity } from '../lib/connectivity'
import { getDb, type AlertRow, type RiskSnapshotRow } from '../lib/db'
import { formatAge } from '../lib/freshness'
import { outbox } from '../lib/outbox'

export interface HomeRiskView {
  level: number
  reason: string
  zoneId: string
  updatedAt: number
}

export interface HomeAlertView {
  id: string
  hazard: string
  level: number
  zoneIds: string[]
  packetId: string
  isDrill: boolean
  issuedAt: number
  expiresAt: number | null
}

export interface HomePageViewProps {
  loading?: boolean
  risk?: HomeRiskView | null
  alert?: HomeAlertView | null
  lastCheckedAt?: number | null
}

function getRiskSummary(snapshot: RiskSnapshotRow | null | undefined): HomeRiskView | null {
  if (!snapshot || snapshot.zones.length === 0) return null

  const first = snapshot.zones[0]
  if (!first) return null

  const top = snapshot.zones.slice(1).reduce((best, item) => {
    return item.level > best.level ? item : best
  }, first)

  return {
    level: Math.max(0, Math.min(4, top.level)),
    reason: top.reason || 'No reason available.',
    zoneId: top.zoneId,
    updatedAt: snapshot.computedAt,
  }
}

function getAlertSummary(rows: AlertRow[]): HomeAlertView | null {
  if (rows.length === 0) return null

  const active = rows.filter((row) => !row.expiresAt || row.expiresAt > Date.now())
  if (active.length === 0) return null

  const sorted = [...active].sort((a, b) => {
    if (Number(Boolean(a.isDrill)) !== Number(Boolean(b.isDrill))) {
      return Number(Boolean(a.isDrill)) - Number(Boolean(b.isDrill))
    }
    return (b.level ?? 0) - (a.level ?? 0)
  })

  const chosen = sorted[0]
  if (!chosen) return null

  return {
    id: chosen.id,
    hazard: chosen.hazard,
    level: chosen.level ?? 0,
    zoneIds: chosen.zoneIds,
    packetId: chosen.packetId,
    isDrill: chosen.isDrill,
    issuedAt: chosen.issuedAt,
    expiresAt: chosen.expiresAt,
  }
}

export function HomePageView({
  loading = false,
  risk: riskOverride,
  alert: alertOverride,
  lastCheckedAt = null,
}: HomePageViewProps) {
  const { t, locale } = useLanguage()
  const connectivity = useConnectivity()
  const [lastCheckIn, setLastCheckIn] = useState<number | null>(null)
  const [renderNow] = useState(() => Date.now())

  const risk = riskOverride ?? null
  const alert = alertOverride ?? null
  const stale = risk !== null && renderNow - risk.updatedAt > 30 * 60 * 1000
  const relativeChecked = lastCheckedAt ?? renderNow

  const handleCheckIn = async () => {
    const item = await outbox.enqueue('checkin', { safe: true, createdAt: Date.now() })
    setLastCheckIn(item.createdAt)
    if (navigator.share) {
      await navigator.share({
        title: 'I’m safe',
        text: 'I’m safe and checked in via Kavach.',
      }).catch(() => undefined)
    }
  }

  if (loading) {
    return (
      <Page>
        <div className="flex flex-col gap-5">
          <div
            role="status"
            aria-label="Loading risk data"
            aria-live="polite"
            className="flex flex-col gap-3"
          >
            <div className="h-3 w-24 animate-pulse rounded-full bg-line" />
            <div className="h-9 w-full animate-pulse rounded-12 bg-line" />
            <div className="h-16 w-full animate-pulse rounded-12 bg-line" />
          </div>
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <div className="mx-auto flex max-w-[390px] flex-col gap-4 pb-6">
        <div className="grid grid-cols-2 gap-3">
          <Card className="flex flex-col gap-1 p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
              {t('home.signed.title')}
            </p>
            <p className="text-[13px] text-ink">{t('home.signed.desc')}</p>
          </Card>
          <Card className="flex flex-col gap-1 p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
              {t('home.relay.title')}
            </p>
            <p className="text-[13px] text-ink">{t('home.relay.desc')}</p>
          </Card>
        </div>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
                {t('status.label')}
              </p>
              <p className="text-[15px] font-semibold text-ink">{connectivity.level}</p>
            </div>
            <span className="rounded-full bg-live-tint px-2 py-1 text-[12px] font-bold text-live">
              {connectivity.level}
            </span>
          </div>

          {risk === null ? (
            <p className="text-[15px] text-ink">{t('home.risk.empty')}</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <RiskMeter level={Math.max(0, Math.min(4, risk.level)) as 0 | 1 | 2 | 3 | 4} verified />
                {stale ? <span className="text-[12px] font-bold text-drill">⚠</span> : null}
              </div>
              <p className="text-[15px] text-ink">{risk.reason}</p>
              <p className="text-[13px] text-muted">
                Zone {risk.zoneId} · updated {formatAge(risk.updatedAt, locale)}
              </p>
            </>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          {alert ? (
            <>
              {alert.isDrill ? <DrillBanner /> : null}
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-muted">
                      {alert.hazard}
                    </span>
                    <span className="text-[13px] text-muted">·</span>
                    <span className="text-[13px] font-bold text-ink">Level {alert.level}</span>
                  </div>
                  <p className="text-[13px] text-muted">Zones: {alert.zoneIds.join(', ') || 'unknown'}</p>
                </div>
                <VerifiedBadge />
              </div>
              <div className="flex flex-wrap gap-2 text-[12px] text-muted">
                <span>Issued {new Date(alert.issuedAt).toLocaleString(locale)}</span>
                <span>·</span>
                <span>
                  Expires {alert.expiresAt ? new Date(alert.expiresAt).toLocaleString(locale) : 'n/a'}
                </span>
              </div>
              <Button href={`/a/${alert.packetId}`} className="w-full" size="lg">
                Open action card
              </Button>
            </>
          ) : (
            <p className="text-[15px] text-ink">
              No active alerts. Last checked {formatAge(relativeChecked, locale)}.
            </p>
          )}
        </Card>

        <Button
          onClick={() => void handleCheckIn()}
          size="lg"
          variant="secondary"
          className="w-full text-[15px] font-bold"
        >
          I&apos;m safe · tell my contacts
        </Button>
        {lastCheckIn ? (
          <p className="text-[12px] text-muted">Last check-in {formatAge(lastCheckIn, locale)}</p>
        ) : null}

        <div className="grid grid-cols-3 gap-3">
          <a
            href="/map?focus=nearest"
            className="flex min-h-[72px] flex-col items-center justify-center rounded-12 bg-surface p-3 text-center text-ink ring-1 ring-line"
          >
            <span className="text-[12px] font-bold">Nearest shelter</span>
          </a>
          <a
            href="/sos"
            className="flex min-h-[72px] flex-col items-center justify-center rounded-12 bg-danger p-3 text-center text-white ring-1 ring-danger-dark"
          >
            <span className="text-[12px] font-bold">SOS</span>
          </a>
          <a
            href="/assist"
            className="flex min-h-[72px] flex-col items-center justify-center rounded-12 bg-surface p-3 text-center text-ink ring-1 ring-line"
          >
            <span className="text-[12px] font-bold">Ask assistant</span>
          </a>
          <a
            href="/aid"
            className="flex min-h-[72px] flex-col items-center justify-center rounded-12 bg-surface p-3 text-center text-ink ring-1 ring-line"
          >
            <span className="text-[12px] font-bold">First aid</span>
          </a>
          <a
            href="/phrases"
            className="flex min-h-[72px] flex-col items-center justify-center rounded-12 bg-surface p-3 text-center text-ink ring-1 ring-line"
          >
            <span className="text-[12px] font-bold">Show a local</span>
          </a>
          <a
            href="/check"
            className="flex min-h-[72px] flex-col items-center justify-center rounded-12 bg-surface p-3 text-center text-ink ring-1 ring-line"
          >
            <span className="text-[12px] font-bold">Check a message</span>
          </a>
        </div>
      </div>
    </Page>
  )
}

export default function HomePage() {
  const [loading, setLoading] = useState(true)
  const [risk, setRisk] = useState<HomeRiskView | null>(null)
  const [alert, setAlert] = useState<HomeAlertView | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null)

  useEffect(() => {
    let alive = true

    const load = async () => {
      try {
        const db = getDb()
        const [snapshot, alerts] = await Promise.all([
          db.riskSnapshot.orderBy('computedAt').reverse().first(),
          db.alerts.orderBy('issuedAt').reverse().toArray(),
        ])

        if (!alive) return

        setRisk(getRiskSummary(snapshot))
        setAlert(getAlertSummary(alerts))
        setLastCheckedAt(alerts[0]?.issuedAt ?? snapshot?.computedAt ?? Date.now())
      } finally {
        if (alive) {
          window.setTimeout(() => setLoading(false), 100)
        }
      }
    }

    void load()

    return () => {
      alive = false
    }
  }, [])

  return <HomePageView loading={loading} risk={risk} alert={alert} lastCheckedAt={lastCheckedAt} />
}
