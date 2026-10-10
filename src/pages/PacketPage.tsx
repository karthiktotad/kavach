/**
 * PacketPage — offline deep-link viewer for signed alert packets (`/#/a/<packet>`).
 *
 * Core guarantee (AGENTS.md §2.1):
 *  - Verifies ECDSA P-256 signatures OFFLINE via WebCrypto.
 *  - Renders pre-translated hazard action cards in tourist's language.
 *  - Prominently distinguishes DRILL mode vs. LIVE alerts.
 *  - Flags clock skew without dropping critical alerts.
 */

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Page, PageHeader } from '../components/Page'
import {
  IconAid,
  IconAlerts,
  IconCheck,
  IconClose,
  IconMap,
  IconShield,
} from '../components/icons'
import { useLanguage } from '../store/language'
import { verifyAndStore, type RenderedAlert } from '../lib/packetClient'
import { type VerifyResult } from '@shared/packet'
import { formatClock, formatAge } from '../lib/freshness'

export default function PacketPage() {
  const { t, locale } = useLanguage()
  const params = useParams<{ packet: string }>()
  const rawPacket = params.packet ?? ''

  const [loading, setLoading] = useState(() => Boolean(rawPacket))
  const [result, setResult] = useState<VerifyResult | null>(() =>
    !rawPacket ? { ok: false, reason: 'format', error: 'No packet data in URL' } : null,
  )
  const [rendered, setRendered] = useState<RenderedAlert | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!rawPacket) return
    let alive = true

    void verifyAndStore(rawPacket, 'sms-link', {}, locale).then(({ result: res, rendered: rnd }) => {
      if (alive) {
        setResult(res)
        setRendered(rnd ?? null)
        setLoading(false)
      }
    })

    return () => {
      alive = false
    }
  }, [rawPacket, locale])

  const handleShare = async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({
          title: rendered?.headline ?? t('app.name'),
          text: rendered?.headline ?? 'Emergency Alert',
          url,
        })
        return
      } catch {
        // User cancelled or unsupported
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Clipboard write failed
    }
  }

  if (loading) {
    return (
      <Page>
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center" role="status">
          <div className="border-brand h-10 w-10 animate-spin rounded-full border-4 border-t-transparent" />
          <p className="text-ink-muted text-sm">{t('ui.loading')}…</p>
        </div>
      </Page>
    )
  }

  if (!result || !result.ok) {
    const failureReason = result?.reason ?? 'format'
    return (
      <Page>
        <div className="flex flex-col gap-6">
          <PageHeader title={t('page.packet.title')} intro={t('page.packet.intro')} />
          <header className="bg-risk-4/15 ring-risk-4/40 flex flex-col gap-3 rounded-2xl p-5 ring-1">
            <div className="flex items-center gap-2.5 text-risk-3">
              <IconClose className="size-6 shrink-0" />
              <h1 className="text-lg font-bold">{t('packet.unverified')}</h1>
            </div>
            <p className="text-ink text-sm font-semibold">
              {failureReason === 'signature' && t('packet.reason.signature')}
              {failureReason === 'unknown-kid' && t('packet.reason.unknownKid', { kid: 'unknown' })}
              {failureReason === 'expired' && t('packet.reason.expired', { expires: 'past' })}
              {failureReason === 'not-yet-valid' && t('packet.reason.notYetValid', { issued: 'future' })}
              {failureReason === 'format' && t('packet.reason.format')}
            </p>
            <p className="text-ink-muted text-xs leading-relaxed">
              {t('packet.unverifiedNotice')}
            </p>
          </header>

          {rawPacket ? (
            <section className="bg-surface ring-ink-subtle/25 flex flex-col gap-2 rounded-2xl p-4 ring-1">
              <h2 className="text-ink-muted text-xs font-semibold uppercase tracking-wider">
                {t('packet.rawPayload')}
              </h2>
              <code className="bg-surface-sunken text-ink-subtle block max-h-32 overflow-y-auto rounded-lg p-3 font-mono text-xs break-all">
                {rawPacket}
              </code>
            </section>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              to="/aid"
              className="touch-target bg-risk-3 text-surface-sunken flex-1 rounded-xl font-semibold"
            >
              <IconAid className="size-5" />
              <span>{t('packet.viewAid')}</span>
            </Link>
            <Link
              to="/alerts"
              className="touch-target bg-surface-raised text-ink ring-ink-subtle/30 flex-1 rounded-xl font-semibold ring-1"
            >
              <IconAlerts className="size-5" />
              <span>{t('nav.alerts')}</span>
            </Link>
          </div>
        </div>
      </Page>
    )
  }

  const { fields, isDrill, issuedAt, expiresAt, clockSkewWarning } = result

  return (
    <Page>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('page.packet.title')} intro={t('page.packet.intro')} />
        {/* Verification & Drill Header */}
        <section
          className={`flex flex-col gap-3 rounded-2xl p-5 ring-1 ${
            isDrill
              ? 'bg-amber-950/20 text-amber-200 ring-amber-500/40'
              : 'bg-emerald-950/25 text-emerald-200 ring-emerald-500/40'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <IconShield className="size-6 shrink-0 text-emerald-400" />
              <span className="text-sm font-bold tracking-wide uppercase">
                {t('packet.verified')}
              </span>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-extrabold tracking-wider uppercase ${
                isDrill
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'bg-risk-3 text-slate-950 shadow-sm'
              }`}
            >
              {isDrill ? t('packet.drill') : t('packet.live')}
            </span>
          </div>

          {isDrill ? (
            <p className="rounded-lg bg-amber-500/10 p-2.5 text-xs font-semibold text-amber-300">
              ⚠️ {t('packet.drillNotice')}
            </p>
          ) : null}

          {clockSkewWarning ? (
            <p className="rounded-lg bg-yellow-500/15 p-2.5 text-xs font-semibold text-yellow-300">
              ⏱️ {t('packet.clockWarning')}
            </p>
          ) : null}

          {/* Rendered Action Card Headline */}
          <h1 className="text-ink text-2xl font-extrabold tracking-tight">
            {rendered?.headline}
          </h1>

          {/* Metadata Grid */}
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="bg-surface/80 ring-ink-subtle/20 rounded-xl p-2.5 ring-1">
              <dt className="text-ink-subtle">{t('packet.hazard')}</dt>
              <dd className="text-ink mt-0.5 font-bold">{rendered?.hazardName}</dd>
            </div>
            <div className="bg-surface/80 ring-ink-subtle/20 rounded-xl p-2.5 ring-1">
              <dt className="text-ink-subtle">{t('packet.level')}</dt>
              <dd className="text-ink mt-0.5 font-bold">{rendered?.levelName}</dd>
            </div>
            <div className="bg-surface/80 ring-ink-subtle/20 rounded-xl p-2.5 ring-1">
              <dt className="text-ink-subtle">{t('packet.zones')}</dt>
              <dd className="text-ink mt-0.5 font-bold">{fields.zones.join(', ')}</dd>
            </div>
            <div className="bg-surface/80 ring-ink-subtle/20 rounded-xl p-2.5 ring-1">
              <dt className="text-ink-subtle">{t('packet.expires')}</dt>
              <dd className="text-ink mt-0.5 font-bold" title={new Date(expiresAt).toISOString()}>
                {formatAge(expiresAt, locale)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Action Steps */}
        {rendered?.steps && rendered.steps.length > 0 ? (
          <section className="bg-surface ring-ink-subtle/25 flex flex-col gap-3 rounded-2xl p-5 ring-1">
            <h2 className="text-ink text-base font-bold">{t('packet.actionSteps')}</h2>
            <ol className="flex flex-col gap-2.5">
              {rendered.steps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm leading-relaxed">
                  <span className="bg-brand text-surface-sunken flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                    {idx + 1}
                  </span>
                  <span className="text-ink-muted">{step}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {/* Primary Action Buttons */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            to="/map"
            className="touch-target bg-brand text-surface-sunken flex-1 rounded-xl font-semibold"
          >
            <IconMap className="size-5" />
            <span>{t('packet.viewMap')}</span>
          </Link>
          <button
            type="button"
            onClick={() => void handleShare()}
            className="touch-target bg-surface-raised text-ink ring-ink-subtle/30 flex-1 rounded-xl font-semibold ring-1"
          >
            <IconCheck className="size-5" />
            <span>{copied ? t('ui.copied') : t('ui.share')}</span>
          </button>
        </div>

        {/* Cryptographic Proof & Signature Details */}
        <details className="bg-surface-raised ring-ink-subtle/20 rounded-2xl p-4 ring-1">
          <summary className="text-ink-muted cursor-pointer text-xs font-semibold">
            {t('packet.rawPayload')} &amp; ECDSA P-256 Proof
          </summary>
          <div className="mt-3 flex flex-col gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-ink-subtle">Key ID:</span>
              <span className="text-ink font-mono">{fields.kid}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-subtle">Sequence:</span>
              <span className="text-ink font-mono">{fields.seq}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-subtle">Issued At:</span>
              <span className="text-ink font-mono">{formatClock(issuedAt, locale)}</span>
            </div>
            <div className="mt-2">
              <span className="text-ink-subtle block">Raw Packet:</span>
              <code className="bg-surface-sunken text-ink-subtle mt-1 block rounded-lg p-2 font-mono break-all">
                {rawPacket}
              </code>
            </div>
          </div>
        </details>
      </div>
    </Page>
  )
}
