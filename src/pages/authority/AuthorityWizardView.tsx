import { useEffect, useState } from 'react'
import { Button, Card, Icon, SeverityPill, Sheet, StepList } from '../../components/ui'
import type { AuthorityWizard, WizardStep } from './wizard'
import { QrCodeSvg } from './QrCodeSvg'
import { QrPoster } from './QrPoster'
import { renderAlertFromPack, type RenderedAlert } from '../../lib/packetClient'
import type { AlertLevel, HazardCode, PacketFields, PacketMode } from '../../../shared/packet'

export interface AuthorityWizardViewProps {
  readonly wizard: AuthorityWizard
  readonly onBroadcastSuccess?: (packet: string) => void
  readonly signer: (fields: PacketFields) => Promise<{ packet: string; shareUrl?: string }>
}

const HAZARD_OPTIONS: readonly { code: HazardCode; label: string; icon: string; desc: string }[] = [
  { code: 'FL', label: 'Flood', icon: 'waves', desc: 'Coastal storm surge, riverine inundation, heavy rainfall.' },
  { code: 'CY', label: 'Cyclone', icon: 'warning', desc: 'Tropical cyclone, extreme gusts, coastal surge.' },
  { code: 'WN', label: 'High Winds', icon: 'warning', desc: 'Severe gale force winds, tree/infrastructure damage.' },
  { code: 'HT', label: 'Extreme Heat', icon: 'warning', desc: 'Severe heatwave exceeding dangerous wet-bulb threshold.' },
  { code: 'LS', label: 'Landslide', icon: 'warning', desc: 'Slope failure, road blockages, hilly terrain hazard.' },
  { code: 'AC', label: 'All-Clear', icon: 'shield-check', desc: 'Cancel warning and declare hazard subsided.' },
]

const LEVEL_OPTIONS: readonly { level: AlertLevel; name: string; desc: string; badgeVariant: 'low' | 'watch' | 'warning' | 'critical' }[] = [
  { level: 1, name: 'Advisory', desc: 'Minor or potential hazard. Normal precautions.', badgeVariant: 'low' },
  { level: 2, name: 'Watch', desc: 'Conditions favorable for hazard. Prepare contingency plan.', badgeVariant: 'watch' },
  { level: 3, name: 'Warning', desc: 'Hazard is imminent or occurring. Take protective action immediately.', badgeVariant: 'warning' },
  { level: 4, name: 'Extreme Emergency', desc: 'Catastrophic conditions. Immediate life-safety actions.', badgeVariant: 'critical' },
]

const DURATION_OPTIONS = [
  { min: 30, label: '30 mins' },
  { min: 60, label: '1 hour' },
  { min: 180, label: '3 hours' },
  { min: 360, label: '6 hours' },
  { min: 720, label: '12 hours' },
  { min: 1440, label: '24 hours' },
]

const PILOT_ZONES = [
  { id: 'Z1', name: 'Mamallapuram seafront & beach', currentRisk: 3, floodProne: true },
  { id: 'Z2', name: 'Mamallapuram old town & fort', currentRisk: 2, floodProne: true },
  { id: 'Z3', name: 'Theewari & west settlement', currentRisk: 2, floodProne: true },
  { id: 'Z4', name: 'Salavankuppam & backwater', currentRisk: 1, floodProne: true },
  { id: 'Z5', name: 'Seven Pagodas complex & hills', currentRisk: 0, floodProne: false },
  { id: 'Z6', name: 'Kovalam coast', currentRisk: 2, floodProne: true },
  { id: 'Z7', name: 'ECR corridor & Injambakkam', currentRisk: 1, floodProne: true },
  { id: 'Z8', name: 'Thiruvanmiyur coast', currentRisk: 1, floodProne: true },
  { id: 'Z9', name: 'OMR inland corridor', currentRisk: 0, floodProne: false },
]

const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ar', label: 'العربية' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
]

export function AuthorityWizardView({
  wizard,
  onBroadcastSuccess,
  signer,
}: AuthorityWizardViewProps) {
  const [wizardState, setWizardState] = useState(() => wizard.getState())
  const [selectedLanguageTab, setSelectedLanguageTab] = useState('en')
  const [renderedPreview, setRenderedPreview] = useState<RenderedAlert | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Live Confirmation Dialog State
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false)
  const [typedZoneCount, setTypedZoneCount] = useState('')

  // AI Suggestion state
  const [suggestedNote, setSuggestedNote] = useState('')
  const [suggesting, setSuggesting] = useState(false)

  // Success Poster Modal
  const [posterOpen, setPosterOpen] = useState(false)
  const [copiedText, setCopiedText] = useState<'packet' | 'link' | null>(null)

  // Subscribe to state machine updates
  useEffect(() => {
    return wizard.subscribe((st) => {
      setWizardState({ ...st })
    })
  }, [wizard])

  const { step, draft, isSubmitting, error, signedPacket } = wizardState
  const isDrill = draft.mode === 'D'

  // Update multilingual rendered preview whenever step 3 is reached
  useEffect(() => {
    if (step === 'review' || step === 'sign-broadcast' || step === 'success') {
      let active = true

      const h = draft.hazard ?? 'FL'
      const lvl = draft.level ?? 3
      const zones = draft.zones.length > 0 ? draft.zones : ['Z1']

      renderAlertFromPack(h, lvl, zones, selectedLanguageTab)
        .then((res) => {
          if (active) {
            setRenderedPreview(res)
            setPreviewLoading(false)
          }
        })
        .catch(() => {
          if (active) setPreviewLoading(false)
        })

      return () => {
        active = false
      }
    }
    return undefined
  }, [step, draft.hazard, draft.level, draft.zones, selectedLanguageTab])

  // Stepper metadata
  const stepsList: { id: WizardStep; label: string; number: number }[] = [
    { id: 'hazard-level', label: '1. Hazard & Level', number: 1 },
    { id: 'zones', label: '2. Zones', number: 2 },
    { id: 'review', label: '3. Review & Translation', number: 3 },
    { id: 'sign-broadcast', label: '4. Sign & Broadcast', number: 4 },
  ]

  const currentStepIndex = stepsList.findIndex((s) => s.id === step)

  // Handlers
  const handleSelectHazard = (hazard: HazardCode) => {
    const lvl = hazard === 'AC' ? 0 : draft.level ?? 3
    wizard.setHazardAndLevel(hazard, lvl)
  }

  const handleSelectLevel = (level: AlertLevel) => {
    const h = draft.hazard ?? 'FL'
    wizard.setHazardAndLevel(h, level)
  }

  const handleSelectDuration = (durationMin: number) => {
    const h = draft.hazard ?? 'FL'
    const lvl = draft.level ?? 3
    wizard.setHazardAndLevel(h, lvl, durationMin)
  }

  const handleToggleZone = (zoneId: string) => {
    const current = new Set(draft.zones)
    if (current.has(zoneId)) current.delete(zoneId)
    else current.add(zoneId)
    wizard.setZones(Array.from(current))
  }

  const handleSelectAllZones = () => {
    wizard.setZones(PILOT_ZONES.map((z) => z.id))
  }

  const handleClearAllZones = () => {
    wizard.setZones([])
  }

  const handleSwitchMode = (mode: PacketMode) => {
    if (mode === 'L') {
      setLiveConfirmOpen(true)
      setTypedZoneCount('')
    } else {
      wizard.setMode('D')
    }
  }

  const handleConfirmLiveBroadcast = () => {
    const parsed = parseInt(typedZoneCount.trim(), 10)
    if (parsed === draft.zones.length && draft.zones.length > 0) {
      wizard.confirmLiveBroadcast(parsed)
      setLiveConfirmOpen(false)
    }
  }

  const handleSuggestWording = () => {
    setSuggesting(true)
    setTimeout(() => {
      const hName = HAZARD_OPTIONS.find((h) => h.code === draft.hazard)?.label ?? 'Storm'
      setSuggestedNote(
        `High confidence observation: ${hName} surge expected along coastal roads. Avoid beach promenade and seek shelter inland.`,
      )
      setSuggesting(false)
    }, 600)
  }

  const handleSignBroadcast = async () => {
    try {
      const packet = await wizard.signAndBroadcast(signer, 'k1')
      onBroadcastSuccess?.(packet)
    } catch {
      // Error handled by state machine
    }
  }

  const handleCopy = async (text: string, type: 'packet' | 'link') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedText(type)
      setTimeout(() => setCopiedText(null), 2000)
    } catch {
      // Ignore
    }
  }

  const payloadPreview = wizard.getPayloadPreview('k1')

  const shareUrl = signedPacket
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/#/a/${signedPacket}`
    : ''

  return (
    <div className="space-y-6">
      {/* 1. Accessible Stepper */}
      <div
        role="navigation"
        aria-label="Alert Creation Stepper"
        className="rounded-16 border border-line bg-surface p-4 shadow-sm"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {stepsList.map((s, idx) => {
            const isDone = currentStepIndex > idx || step === 'success'
            const isCurrent = step === s.id
            const canClick = idx <= currentStepIndex && step !== 'success'

            return (
              <button
                key={s.id}
                type="button"
                disabled={!canClick}
                onClick={() => canClick && wizard.goToStep(s.id)}
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex items-center gap-2.5 rounded-10 p-2 text-xs font-bold transition-all text-left ${
                  isCurrent
                    ? 'bg-verified text-white shadow-sm'
                    : isDone
                    ? 'bg-live-tint text-live-text hover:bg-live-tint/80 cursor-pointer'
                    : 'bg-surface-sunken text-ink-muted opacity-60 cursor-not-allowed'
                }`}
                data-testid={`wizard-step-${s.id}`}
              >
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-extrabold ${
                    isCurrent
                      ? 'bg-white text-verified'
                      : isDone
                      ? 'bg-live text-white'
                      : 'bg-line text-ink-muted'
                  }`}
                >
                  {isDone ? '✓' : s.number}
                </div>
                <span className="truncate">{s.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-12 border border-danger/30 bg-danger/10 p-3.5 text-xs font-bold text-danger"
          data-testid="wizard-error-banner"
        >
          <Icon name="warning" className="h-4 w-4 shrink-0" />
          <span>{error.message}</span>
        </div>
      )}

      {/* STEP 1: HAZARD & LEVEL */}
      {step === 'hazard-level' && (
        <div className="space-y-6" data-testid="step-hazard-level">
          {/* Hazard Selection */}
          <Card className="p-5 space-y-4 border-line">
            <div>
              <h2 className="text-base font-black text-ink">1. Select Crisis Hazard</h2>
              <p className="text-xs font-medium text-ink-muted">
                Pick the primary environmental hazard threatening the zone.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {HAZARD_OPTIONS.map((h) => {
                const isSelected = draft.hazard === h.code
                return (
                  <button
                    key={h.code}
                    type="button"
                    onClick={() => handleSelectHazard(h.code)}
                    className={`flex flex-col items-start gap-1.5 rounded-12 border p-3.5 text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-verified bg-verified/5 ring-2 ring-verified shadow-sm'
                        : 'border-line bg-surface hover:border-verified/40 hover:bg-surface-sunken'
                    }`}
                    data-testid={`hazard-card-${h.code}`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-extrabold text-sm text-ink">{h.label}</span>
                      <span className="rounded-6 bg-surface-sunken px-2 py-0.5 font-mono text-xs font-bold text-brand border border-line">
                        {h.code}
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-ink-muted leading-relaxed">
                      {h.desc}
                    </p>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Level Selection (if not All-Clear) */}
          {draft.hazard !== 'AC' && (
            <Card className="p-5 space-y-4 border-line">
              <div>
                <h2 className="text-base font-black text-ink">2. Select Severity Level</h2>
                <p className="text-xs font-medium text-ink-muted">
                  Matches NDMA & IMD CAP risk scales. Plain language displayed to tourists.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {LEVEL_OPTIONS.map((lvl) => {
                  const isSelected = draft.level === lvl.level
                  return (
                    <button
                      key={lvl.level}
                      type="button"
                      onClick={() => handleSelectLevel(lvl.level)}
                      className={`flex flex-col items-start gap-2 rounded-12 border p-3.5 text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-verified bg-verified/5 ring-2 ring-verified shadow-sm'
                          : 'border-line bg-surface hover:border-verified/40 hover:bg-surface-sunken'
                      }`}
                      data-testid={`level-card-${lvl.level}`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <SeverityPill level={lvl.level} />
                        <span className="font-mono text-xs font-bold text-ink-muted">
                          Level {lvl.level}
                        </span>
                      </div>
                      <span className="font-bold text-sm text-ink">{lvl.name}</span>
                      <p className="text-[11px] font-medium text-ink-muted leading-relaxed">
                        {lvl.desc}
                      </p>
                    </button>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Duration Selector */}
          <Card className="p-5 space-y-3 border-line">
            <h2 className="text-base font-black text-ink">3. Alert Duration</h2>
            <p className="text-xs font-medium text-ink-muted">
              Alerts auto-expire on tourist devices after this duration to prevent stale alerts.
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              {DURATION_OPTIONS.map((dur) => {
                const isSelected = draft.durationMinutes === dur.min
                return (
                  <button
                    key={dur.min}
                    type="button"
                    onClick={() => handleSelectDuration(dur.min)}
                    className={`rounded-10 px-3.5 py-2 text-xs font-bold border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-verified bg-verified text-white shadow-sm'
                        : 'border-line bg-surface text-ink hover:bg-surface-sunken'
                    }`}
                    data-testid={`duration-btn-${dur.min}`}
                  >
                    {dur.label}
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Next button */}
          <div className="flex justify-end pt-2">
            <Button
              variant="primary"
              onClick={() => wizard.nextStep()}
              disabled={!draft.hazard || draft.level === null}
              className="px-8 font-bold"
              data-testid="wizard-next-btn"
            >
              <span>Continue to Zones</span>
              <span>→</span>
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: ZONES */}
      {step === 'zones' && (
        <div className="space-y-6" data-testid="step-zones">
          <Card className="p-5 space-y-4 border-line">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
              <div>
                <h2 className="text-base font-black text-ink">Target Geographic Zones</h2>
                <p className="text-xs font-medium text-ink-muted">
                  Select which pilot polygons receive this signed emergency warning.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllZones}
                  className="text-xs font-bold text-verified hover:underline"
                  data-testid="zones-select-all-btn"
                >
                  Select All
                </button>
                <span className="text-ink-muted">•</span>
                <button
                  type="button"
                  onClick={handleClearAllZones}
                  className="text-xs font-bold text-ink-muted hover:underline"
                  data-testid="zones-clear-all-btn"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PILOT_ZONES.map((zone) => {
                const isSelected = draft.zones.includes(zone.id)
                return (
                  <label
                    key={zone.id}
                    className={`flex items-start gap-3 rounded-12 border p-3.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-verified bg-verified/5 ring-1 ring-verified shadow-sm'
                        : 'border-line bg-surface hover:bg-surface-sunken'
                    }`}
                    data-testid={`zone-checkbox-${zone.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleZone(zone.id)}
                      className="mt-1 h-4 w-4 rounded border-line text-verified focus:ring-verified"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-extrabold text-sm text-ink truncate">
                          {zone.name}
                        </span>
                        <span className="font-mono text-xs font-black text-brand">
                          {zone.id}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 pt-1 text-[11px] font-semibold text-ink-muted">
                        <span>Current Risk: Level {zone.currentRisk}</span>
                        {zone.floodProne && (
                          <span className="rounded bg-drill/10 px-1.5 py-0.2 text-[10px] text-drill font-bold">
                            Flood-prone
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="secondary"
              onClick={() => wizard.prevStep()}
              className="px-6 font-bold"
            >
              <span>←</span>
              <span>Back</span>
            </Button>
            <Button
              variant="primary"
              onClick={() => wizard.nextStep()}
              disabled={draft.zones.length === 0}
              className="px-8 font-bold"
              data-testid="wizard-next-btn"
            >
              <span>Review Alert ({draft.zones.length} zones)</span>
              <span>→</span>
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: REVIEW & TRANSLATION */}
      {step === 'review' && (
        <div className="space-y-6" data-testid="step-review">
          {/* Summary & Mode Toggle Card */}
          <Card className="p-5 space-y-4 border-line">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
              <div>
                <h2 className="text-base font-black text-ink">Alert Summary</h2>
                <p className="text-xs font-medium text-ink-muted">
                  Verify broadcast mode and affected zones before signing.
                </p>
              </div>

              {/* Mode Segmented Control */}
              <div className="flex items-center rounded-10 bg-surface-sunken p-1 border border-line">
                <button
                  type="button"
                  onClick={() => handleSwitchMode('D')}
                  className={`rounded-8 px-3.5 py-1 text-xs font-black transition-all cursor-pointer ${
                    isDrill
                      ? 'bg-drill text-white shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                  data-testid="mode-segment-drill"
                >
                  DRILL (Practice)
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchMode('L')}
                  className={`rounded-8 px-3.5 py-1 text-xs font-black transition-all cursor-pointer ${
                    !isDrill
                      ? 'bg-danger text-white shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                  data-testid="mode-segment-live"
                >
                  LIVE BROADCAST
                </button>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-10 bg-surface-sunken p-3 text-xs">
                <span className="font-semibold text-ink-muted">Hazard</span>
                <div className="text-base font-black text-ink">
                  {HAZARD_OPTIONS.find((h) => h.code === draft.hazard)?.label}
                </div>
              </div>
              <div className="rounded-10 bg-surface-sunken p-3 text-xs">
                <span className="font-semibold text-ink-muted">Severity</span>
                <div className="text-base font-black text-ink">
                  Level {draft.level}
                </div>
              </div>
              <div className="rounded-10 bg-surface-sunken p-3 text-xs">
                <span className="font-semibold text-ink-muted">Zones</span>
                <div className="text-base font-black text-ink">
                  {draft.zones.length} zone(s)
                </div>
              </div>
              <div className="rounded-10 bg-surface-sunken p-3 text-xs">
                <span className="font-semibold text-ink-muted">Valid For</span>
                <div className="text-base font-black text-ink">
                  {draft.durationMinutes / 60} hours
                </div>
              </div>
            </div>

            {/* Optional Suggest Wording Helper */}
            <div className="rounded-12 border border-line bg-surface-sunken p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                  <Icon name="chat" className="h-4 w-4 text-verified" />
                  <span>Optional Operator Note (Editable)</span>
                </div>
                <button
                  type="button"
                  onClick={handleSuggestWording}
                  disabled={suggesting}
                  className="text-xs font-bold text-verified hover:underline flex items-center gap-1"
                  data-testid="suggest-wording-btn"
                >
                  <Icon name="bubbles" className="h-3.5 w-3.5" />
                  <span>{suggesting ? 'Drafting...' : 'Suggest wording'}</span>
                </button>
              </div>
              <textarea
                value={suggestedNote}
                onChange={(e) => setSuggestedNote(e.target.value)}
                placeholder="Add optional notes for tourist context (editable, never auto-applied)..."
                rows={2}
                className="w-full rounded-8 border border-line bg-surface p-2 text-xs text-ink placeholder:text-ink-muted focus:border-verified focus:outline-none"
              />
            </div>
          </Card>

          {/* Multilingual Template Preview ("What tourists will see") */}
          <Card className="p-5 space-y-4 border-line">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <div>
                <h2 className="text-base font-black text-ink">What tourists will see</h2>
                <p className="text-xs font-medium text-ink-muted">
                  Pre-translated templates bundled on device. Instant rendering with no internet.
                </p>
              </div>

              {/* Language selection tabs */}
              <div className="flex flex-wrap gap-1">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => setSelectedLanguageTab(lang.code)}
                    className={`rounded-8 px-2.5 py-1 text-xs font-bold transition-colors ${
                      selectedLanguageTab === lang.code
                        ? 'bg-verified text-white shadow-sm'
                        : 'bg-surface-sunken text-ink-muted hover:text-ink'
                    }`}
                    data-testid={`lang-tab-${lang.code}`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Real Rendered Card Preview */}
            <div className="rounded-16 border-2 border-verified/30 bg-surface p-4 space-y-3 shadow-inner">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SeverityPill level={draft.level ?? 3} />
                  {isDrill && (
                    <span className="rounded-6 bg-drill px-2 py-0.5 text-[10px] font-black text-white uppercase">
                      DRILL
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-bold text-ink-muted">
                  Zone(s): {draft.zones.join(', ')}
                </span>
              </div>

              {previewLoading ? (
                <div className="py-4 text-center text-xs text-ink-muted">
                  Loading template preview…
                </div>
              ) : (
                <div className="space-y-2">
                  <h3 className="text-base font-black text-ink">
                    {renderedPreview?.headline}
                  </h3>
                  <StepList steps={renderedPreview?.steps ?? []} />
                </div>
              )}
            </div>
          </Card>

          {/* Packet Preview (PAYLOAD ONLY with placeholders) */}
          <Card className="p-5 space-y-3 border-line">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-ink">Packet Payload Preview</h2>
              <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 font-mono text-xs font-bold text-brand border border-line">
                ~{payloadPreview.estimatedLength} of {payloadPreview.maxSmsLength} chars (1 SMS)
              </span>
            </div>

            <p className="text-xs font-medium text-ink-muted leading-relaxed">
              Showing canonical payload only. The server attaches the ECDSA P-256 signature upon broadcast.
              Private keys exist strictly server-side.
            </p>

            <div className="rounded-10 bg-slate-900 p-3 font-mono text-xs text-emerald-400 select-all break-all border border-slate-800">
              {payloadPreview.preview}
            </div>
          </Card>

          {/* Navigation */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="secondary"
              onClick={() => wizard.prevStep()}
              className="px-6 font-bold"
            >
              <span>←</span>
              <span>Back</span>
            </Button>
            <Button
              variant={isDrill ? 'drill' : 'danger'}
              onClick={() => wizard.nextStep()}
              className="px-8 font-bold"
              data-testid="wizard-next-btn"
            >
              <span>Proceed to Sign & Broadcast</span>
              <span>→</span>
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: SIGN & BROADCAST */}
      {step === 'sign-broadcast' && (
        <div className="space-y-6" data-testid="step-sign-broadcast">
          <Card className="p-6 space-y-6 border-line text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-verified/10 text-verified">
              <Icon name="shield-check" className="h-8 w-8" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-black text-ink">Ready to Sign & Broadcast</h2>
              <p className="text-xs font-medium text-ink-muted max-w-md mx-auto">
                Pressing broadcast will request the signing server to mint an ECDSA P-256 signed packet and publish it over realtime channels.
              </p>
            </div>

            {/* Mode Confirmation Box */}
            <div
              className={`rounded-12 border p-4 text-left space-y-1 max-w-lg mx-auto ${
                isDrill
                  ? 'border-drill/40 bg-drill-tint/30 text-drill'
                  : 'border-danger/40 bg-danger/5 text-danger'
              }`}
            >
              <div className="flex items-center gap-2 font-black text-sm uppercase">
                <Icon name="warning" className="h-4 w-4" />
                <span>{isDrill ? 'DRILL SIMULATION MODE' : 'LIVE OFFICIAL BROADCAST'}</span>
              </div>
              <p className="text-xs font-medium text-ink-muted">
                {isDrill
                  ? 'This alert is watermarked as an exercise and will not trigger real emergency responses.'
                  : `This alert is live and affects ${draft.zones.length} zone(s): ${draft.zones.join(', ')}.`}
              </p>
            </div>

            {/* Sign and Broadcast Button */}
            <div className="pt-2 flex flex-col items-center gap-3">
              <Button
                variant={isDrill ? 'drill' : 'danger'}
                size="lg"
                loading={isSubmitting}
                onClick={() => void handleSignBroadcast()}
                className="w-full max-w-md font-black text-base shadow-lg"
                data-testid="sign-and-broadcast-btn"
              >
                <Icon name="send" className="h-5 w-5" />
                <span>
                  {isSubmitting ? 'Signing and broadcasting...' : 'Sign and Broadcast Alert'}
                </span>
              </Button>

              <Button
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => wizard.prevStep()}
                className="w-full max-w-md font-bold text-xs"
              >
                Cancel and edit draft
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* STEP 5: SUCCESS SCREEN */}
      {step === 'success' && signedPacket && (
        <div className="space-y-6" data-testid="step-success">
          <Card className="p-6 space-y-6 border-line bg-surface shadow-md">
            {/* Header Success Status */}
            <div className="flex items-center gap-3 border-b border-line pb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-live-tint text-live">
                <Icon name="check-circle" className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-lg font-black text-ink">
                  Alert Signed & Broadcasted Successfully
                </h2>
                <p className="text-xs font-medium text-ink-muted">
                  Cryptographically signed with ECDSA P-256. Verified and active.
                </p>
              </div>
            </div>

            {/* Packet details grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* QR Code display */}
              <div className="flex flex-col items-center justify-center p-4 rounded-16 border border-line bg-surface-sunken space-y-2">
                <QrCodeSvg value={shareUrl || `/#/a/${signedPacket}`} size={160} />
                <span className="text-[10px] font-bold text-ink-muted uppercase">
                  Scannable by any tourist device
                </span>
              </div>

              {/* Packet String & Copy */}
              <div className="md:col-span-2 space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink-muted">Signed Packet String</span>
                    <span className="font-mono text-xs font-extrabold text-brand">
                      {signedPacket.length} / 160 characters (1 SMS)
                    </span>
                  </div>
                  <div className="mt-1 rounded-10 bg-slate-900 p-3 font-mono text-xs text-emerald-400 select-all break-all border border-slate-800">
                    {signedPacket}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    variant="secondary"
                    onClick={() => void handleCopy(signedPacket, 'packet')}
                    className="flex-1 text-xs font-bold"
                    data-testid="copy-packet-btn"
                  >
                    <Icon name="copy" className="h-3.5 w-3.5" />
                    <span>{copiedText === 'packet' ? 'Copied!' : 'Copy Packet'}</span>
                  </Button>

                  <Button
                    variant="secondary"
                    onClick={() => void handleCopy(shareUrl, 'link')}
                    className="flex-1 text-xs font-bold"
                    data-testid="copy-link-btn"
                  >
                    <Icon name="share" className="h-3.5 w-3.5" />
                    <span>{copiedText === 'link' ? 'Copied Link!' : 'Copy Share Link'}</span>
                  </Button>

                  <Button
                    variant="primary"
                    onClick={() => setPosterOpen(true)}
                    className="flex-1 text-xs font-bold"
                    data-testid="print-poster-btn"
                  >
                    <Icon name="download" className="h-3.5 w-3.5" />
                    <span>Print QR Poster</span>
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Live Mode Confirmation Dialog Sheet */}
      <Sheet
        open={liveConfirmOpen}
        onClose={() => setLiveConfirmOpen(false)}
        title="Confirm LIVE Emergency Broadcast"
        closeLabel="Cancel"
      >
        <div className="space-y-4 py-2" data-testid="live-confirm-sheet">
          <div className="rounded-12 border border-danger/30 bg-danger/10 p-3.5 text-xs font-bold text-danger">
            ⚠️ WARNING: You are declaring an official emergency affecting {draft.zones.length} zone(s).
          </div>

          <p className="text-xs font-medium text-ink-muted leading-relaxed">
            To prevent accidental real broadcasts, please confirm the exact number of targeted zones (
            <span className="font-extrabold text-ink">{draft.zones.length}</span>).
          </p>

          <div className="space-y-1">
            <label htmlFor="zone-count-input" className="text-xs font-bold text-ink">
              Enter target zone count:
            </label>
            <input
              id="zone-count-input"
              type="text"
              value={typedZoneCount}
              onChange={(e) => setTypedZoneCount(e.target.value)}
              placeholder={String(draft.zones.length)}
              className="w-full rounded-8 border border-line bg-surface-sunken p-2.5 font-mono text-sm text-ink focus:border-danger focus:outline-none"
              data-testid="live-confirm-input"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="danger"
              onClick={handleConfirmLiveBroadcast}
              disabled={parseInt(typedZoneCount.trim(), 10) !== draft.zones.length}
              className="flex-1 font-bold"
              data-testid="live-confirm-submit-btn"
            >
              Confirm Live Mode
            </Button>
            <Button
              variant="secondary"
              onClick={() => setLiveConfirmOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Sheet>

      {/* Printable Poster Modal */}
      {posterOpen && signedPacket && (
        <QrPoster
          packet={signedPacket}
          hazard={draft.hazard ?? 'FL'}
          level={draft.level ?? 3}
          zones={draft.zones}
          mode={draft.mode}
          shareUrl={shareUrl}
          onDismiss={() => setPosterOpen(false)}
        />
      )}
    </div>
  )
}
