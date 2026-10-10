import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Page, PageHeader } from '../components/Page'
import { Button, Card, Icon, type IconName } from '../components/ui'
import { useLanguage } from '../store/language'
import { outbox } from '../lib/outbox'
import { loadScriptFont } from '../lib/scriptFonts'
import { analyzeRumor, parseSharedText } from '@shared/rumor'

function scriptFont(script: string): string {
  switch (script) {
    case 'ta':
      return '"Noto Sans Tamil", sans-serif'
    case 'hi':
      return '"Noto Sans Devanagari", sans-serif'
    case 'ar':
      return '"Noto Naskh Arabic", sans-serif'
    default:
      return 'system-ui, sans-serif'
  }
}

function pathFromMessage(value: string): string | null {
  const normalized = value.trim()
  if (!normalized) return null
  const matches = normalized.match(/\/a\/([A-Za-z0-9._~-]+)/i)
  if (matches?.[1]) return `/a/${matches[1]}`
  return null
}

export default function CheckPage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [value, setValue] = useState(() => {
    const direct = searchParams.get('text') ?? searchParams.get('title') ?? ''
    return parseSharedText(direct || location.search || '')
  })
  const [analysis, setAnalysis] = useState(() => analyzeRumor(parseSharedText(location.search || '')))
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (analysis.detectedScript === 'ta' || analysis.detectedScript === 'hi') {
      loadScriptFont(analysis.detectedScript)
    }
  }, [analysis.detectedScript])

  const verdict = useMemo(() => {
    switch (analysis.verdict) {
      case 'official':
        return {
          label: t('check.verdict.official'),
          tone: 'border-verified/40 bg-verified/8 text-verified',
          icon: 'shield-check' as const,
        }
      case 'conflicts':
        return {
          label: t('check.verdict.conflicts'),
          tone: 'border-drill/40 bg-drill-tint/50 text-drill',
          icon: 'warning' as const,
        }
      default:
        return {
          label: t('check.verdict.unconfirmed'),
          tone: 'border-line bg-surface text-ink-muted',
          icon: 'info' as const,
        }
    }
  }, [analysis.verdict, t])

  const utils = [
    { label: t('check.claim'), value: analysis.claim || t('check.emptyShort') },
    { label: t('check.action'), value: analysis.action || t('check.emptyShort') },
    { label: t('check.place'), value: analysis.place || t('check.emptyShort') },
    { label: t('check.source'), value: analysis.source || t('check.emptyShort') },
  ]

  const evidence = [
    { key: 'signature', label: t('check.evidence.signature'), status: analysis.evidence.signature },
    { key: 'alerts', label: t('check.evidence.alerts'), status: analysis.evidence.officialAlerts },
    { key: 'weather', label: t('check.evidence.weather'), status: analysis.evidence.weatherData },
    { key: 'reports', label: t('check.evidence.reports'), status: analysis.evidence.nearbyReports },
  ]

  const handleCheck = () => {
    const toAnalyze = parseSharedText(value)
    const packetRoute = pathFromMessage(toAnalyze)
    if (packetRoute) {
      void navigate(packetRoute)
      return
    }
    const result = analyzeRumor(toAnalyze)
    setAnalysis(result)
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const nextValue = parseSharedText(text)
      setValue(nextValue)
      setAnalysis(analyzeRumor(nextValue))
    } catch {
      setStatus(t('check.pasteFailed'))
    }
  }

  const handleReport = async () => {
    await outbox.enqueue('rumour', {
      claimType: analysis.claimType,
      zone: analysis.place,
      risk: analysis.risk,
      createdAt: Date.now(),
    })
    setStatus(t('check.reported'))
  }

  const script = analysis.detectedScript

  return (
    <Page>
      <div className="mx-auto flex max-w-[420px] flex-col gap-4 pb-8">
        <PageHeader title={t('page.check.title')} intro={t('page.check.intro')} />

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold ${verdict.tone}`}>
                <Icon name={verdict.icon} className="h-4 w-4" />
                {verdict.label}
              </div>
            </div>
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-ink-muted">{t('check.riskLevel')} {analysis.risk}</span>
          </div>
          <p className="text-sm leading-relaxed text-ink">{analysis.note}</p>
        </Card>

        <Card className="flex flex-col gap-3">
          <label htmlFor="rumour-input" className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            {t('check.searchLabel')}
          </label>
          <textarea
            id="rumour-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            rows={5}
            lang={script}
            style={{ fontFamily: scriptFont(script) }}
            className="w-full rounded-12 border border-line bg-surface-sunken px-3 py-3 text-base text-ink outline-none ring-0 placeholder:text-ink-muted focus:border-verified"
            placeholder={t('check.placeholder')}
          />
          <div className="flex gap-2">
            <Button onClick={() => handleCheck()} className="flex-1" size="lg">
              {t('check.submit')}
            </Button>
            <Button variant="secondary" onClick={() => { void handlePaste() }} className="min-w-[110px]" size="lg">
              {t('check.paste')}
            </Button>
          </div>
          {status ? <p className="text-xs text-ink-muted">{status}</p> : null}
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">{t('check.claims')}</h2>
            <span className="text-xs text-ink-muted">{t('check.flags')}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {utils.map((item) => (
              <div key={item.label} className="rounded-12 border border-line bg-surface-sunken p-2.5">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{item.label}</p>
                <p className="mt-1 text-sm font-medium text-ink">{item.value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">{t('check.translation')}</h2>
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">{t('check.machine')}</span>
          </div>
          <p className="text-sm leading-relaxed text-ink" style={{ fontFamily: scriptFont(script) }}>
            {analysis.translation}
          </p>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">{t('check.original')}</h2>
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">{script.toUpperCase()}</span>
          </div>
          <p className="text-sm leading-relaxed text-ink" style={{ fontFamily: scriptFont(script) }}>
            {value || t('check.emptyText')}
          </p>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted">{t('check.evidence')}</h2>
          <div className="flex flex-col gap-2">
            {evidence.map((item) => {
              const icon = item.status === 'check' ? 'check-circle' : item.status === 'info' ? 'info' : 'clock'
              const resolvedIcon: IconName = icon
              return (
                <div key={item.key} className="flex items-center justify-between gap-3 rounded-12 border border-line bg-surface-sunken px-3 py-2">
                  <span className="text-sm text-ink">{item.label}</span>
                  <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-ink-muted">
                    <Icon name={resolvedIcon} className="h-4 w-4" />
                    {item.status}
                  </span>
                </div>
              )
            })}
          </div>
        </Card>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button href="tel:112" variant="danger" className="w-full" size="lg">
            <Icon name="phone" className="h-4 w-4" />
            {t('check.call')}
          </Button>
          <Button onClick={() => { void handleReport() }} variant="secondary" className="w-full" size="lg">
            <Icon name="flag" className="h-4 w-4" />
            {t('check.report')}
          </Button>
        </div>
      </div>
    </Page>
  )
}
