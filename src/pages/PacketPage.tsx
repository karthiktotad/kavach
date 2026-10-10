import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Card, DrillBanner, Sheet, StepList, VerifiedBadge } from '../components/ui'
import { Page, PageHeader } from '../components/Page'
import { getDb } from '../lib/db'
import { formatClock } from '../lib/freshness'
import { verifyAndStore, type RenderedAlert } from '../lib/packetClient'
import { useLanguage } from '../store/language'
import type { VerifyResult } from '@shared/packet'

function getPacketSourceLabel(source: string | null | undefined, t: (key: string, vars?: Record<string, string | number>) => string) {
  switch (source) {
    case 'sync':
      return t('packet.source.server')
    case 'sms':
      return t('packet.source.sms')
    case 'qr':
      return t('packet.source.qr')
    case 'share':
      return t('packet.source.share')
    case 'manual':
    default:
      return t('packet.source.manual')
  }
}

export default function PacketPage() {
  const { t, locale } = useLanguage()
  const params = useParams<{ packet: string }>()
  const rawPacket = params.packet ?? ''

  const [loading, setLoading] = useState(Boolean(rawPacket))
  const [result, setResult] = useState<VerifyResult | null>(
    rawPacket ? null : { ok: false, reason: 'format', error: 'No packet in URL' },
  )
  const [rendered, setRendered] = useState<RenderedAlert | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!rawPacket) return

    let alive = true

    void verifyAndStore(rawPacket, 'sms-link', {}, locale).then(async ({ result: nextResult, rendered: nextRendered }) => {
      if (!alive) return
      setResult(nextResult)
      setRendered(nextRendered ?? null)

      if (nextResult.ok) {
        const saved = await getDb().packets.get(rawPacket)
        setSource(saved?.source ?? 'share')
      } else {
        setSource('share')
      }
      setLoading(false)
    })

    return () => {
      alive = false
    }
  }, [locale, rawPacket])

  const shareLink = typeof window !== 'undefined' ? window.location.href : ''

  const handleShareNearby = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Kavach alert', text: rendered?.headline ?? 'Alert', url: shareLink })
        return
      } catch {
        // User cancelled share.
      }
    }

    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard fallback is best effort.
    }
  }

  const handleReadAloud = () => {
    if (!('speechSynthesis' in window)) {
      setVoiceNotice(t('packet.voiceUnavailable'))
      return
    }

    const spoken = rendered?.headline ?? [
      'Official alert',
      'Follow local guidance',
    ].join('. ')

    const utterance = new SpeechSynthesisUtterance(spoken)
    const voices = window.speechSynthesis.getVoices()
    const preferred = voices.find((voice) => voice.lang.startsWith(locale)) ?? voices[0]
    if (preferred) utterance.voice = preferred
    utterance.lang = locale
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    setVoiceNotice(null)
  }

  if (loading) {
    return (
      <Page>
        <div className="flex min-h-[30vh] flex-col items-center justify-center gap-3" role="status" aria-live="polite">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-verified border-t-transparent" />
          <p className="text-sm text-muted">{t('ui.loading')}…</p>
        </div>
      </Page>
    )
  }

  if (!result || !result.ok) {
    const reason = result?.reason ?? 'format'
    const message =
      reason === 'format'
        ? t('packet.reason.format')
        : reason === 'signature'
          ? t('packet.reason.signature')
          : reason === 'unknown-kid'
            ? t('packet.reason.unknownKid', { kid: 'unknown' })
            : reason === 'expired'
              ? t('packet.reason.expired', { expires: 'past' })
              : t('packet.reason.notYetValid', { issued: 'future' })

    return (
      <Page>
        <div className="mx-auto flex max-w-[420px] flex-col gap-4">
          <PageHeader title={t('packet.alert.title')} intro={t('page.packet.intro')} />

          <Card className="border-2 border-danger bg-danger/5 p-4">
            <div className="flex items-center gap-2 text-danger">
              <span aria-hidden="true">!</span>
              <h2 className="text-lg font-bold">{t('packet.unverified')}</h2>
            </div>
            <p className="mt-2 text-sm font-medium text-ink">{message}</p>
            <p className="mt-3 text-sm text-muted">{t('packet.officialNotice')}</p>
          </Card>

          {reason === 'expired' ? (
            <Card className="border border-line bg-surface p-4">
              <p className="text-sm font-semibold text-muted">{t('packet.expiredMessage')}</p>
            </Card>
          ) : null}

          {rawPacket ? (
            <Card className="p-4">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted">{t('packet.rawPayload')}</p>
              <code className="mt-2 block max-h-40 overflow-auto break-all rounded-xl bg-ground p-3 text-[11px] text-ink">{rawPacket}</code>
            </Card>
          ) : null}

          <Button href="/alerts" variant="secondary" size="lg" className="w-full">
            {t('nav.alerts')}
          </Button>
        </div>
      </Page>
    )
  }

  const valid = result
  const totalZones = valid.fields.zones.length
  const areaText = totalZones > 0 ? t('packet.zoneMatch') : t('packet.zoneMismatch')

  return (
    <Page>
      <div className="mx-auto flex max-w-[420px] flex-col gap-4">
        <PageHeader title={t('packet.alert.title')} intro={t('page.packet.intro')} />

        <Card className="border-2 border-verified bg-verified-tint p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <VerifiedBadge />
              <span className="text-base font-bold text-verified">{t('packet.verified.byAuthority')}</span>
            </div>
            {valid.isDrill ? <DrillBanner /> : null}
          </div>

          <p className="mt-3 text-sm font-medium text-ink">{t('packet.verified.summary')}</p>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-verified/30 bg-surface p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{t('packet.issued')}</p>
              <p className="mt-1 text-ink">{formatClock(valid.issuedAt, locale)}</p>
            </div>
            <div className="rounded-xl border border-verified/30 bg-surface p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{t('packet.expires')}</p>
              <p className="mt-1 text-ink">{formatClock(valid.expiresAt, locale)}</p>
            </div>
            <div className="col-span-2 rounded-xl border border-verified/30 bg-surface p-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{t('packet.receivedBy')}</p>
              <p className="mt-1 text-ink">{getPacketSourceLabel(source, t)}</p>
            </div>
          </div>
        </Card>

        {valid.clockSkewWarning ? (
          <Card className="border-2 border-warning bg-warning/10 p-3">
            <p className="text-sm font-semibold text-warning">{t('packet.dateTimeCheck')}</p>
          </Card>
        ) : null}

        {rendered ? (
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">{rendered.hazardName}</p>
                <h3 className="mt-1 text-xl font-bold text-ink">{rendered.headline}</h3>
              </div>
              <span className="rounded-full bg-surface px-2 py-1 text-sm font-bold text-ink">Level {valid.fields.level}</span>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-ground p-3 text-sm text-muted">
              <span>{valid.fields.zones.join(', ') || 'No zone listed'}</span>
              <span className="font-semibold text-ink">{areaText}</span>
            </div>

            <div className="mt-4">
              <StepList steps={rendered.steps} />
            </div>
          </Card>
        ) : null}

        <Button href="/map?route=nearest" size="lg" className="w-full">
          {t('packet.routeToShelter')}
        </Button>

        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" size="md" onClick={() => handleReadAloud()} className="w-full">
            {t('packet.readAloud')}
          </Button>
          <Button variant="secondary" size="md" onClick={() => { void handleShareNearby() }} className="w-full">
            {copied ? t('ui.copied') : t('packet.shareNearby')}
          </Button>
          <Button variant="secondary" size="md" onClick={() => setShowQr(true)} className="w-full">
            {t('packet.showQr')}
          </Button>
        </div>

        {voiceNotice ? <p className="text-sm text-muted">{voiceNotice}</p> : null}

        <Sheet open={showQr} onClose={() => setShowQr(false)} title={t('packet.showQr')} closeLabel={t('ui.close')}>
          <div className="rounded-xl border-2 border-dashed border-line bg-ground p-6 text-center">
            <div className="mx-auto grid h-36 w-36 place-items-center rounded-12 bg-surface text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
              QR
            </div>
            <p className="mt-3 break-all text-[11px] text-muted">{shareLink}</p>
          </div>
        </Sheet>
      </div>
    </Page>
  )
}
