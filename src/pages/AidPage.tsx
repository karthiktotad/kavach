/**
 * SOS Screen (/sos and /aid) — FE-7 UI.
 *
 * Requirements:
 *  - Header (back, "SOS", StatusChip).
 *  - "Get help now" + "Calls and texts use your phone's mobile network. They work with no internet."
 *  - Location card:
 *     * coordinates 22px bold, accuracy (±X m) and age
 *     * Copy button (with visual copied feedback)
 *     * No fix fallback -> "Location not available yet. You can still call." + last known position with age.
 *  - Call 112 button (72px, danger variant, href="tel:112").
 *  - Call 108 ambulance (secondary/outline variant, href="tel:108").
 *  - "Text my emergency contact" (sms: link).
 *  - Message preview card (dashed border, "Opens in your messages app. You press send.").
 *  - Honest note: "Kavach cannot confirm that help is on its way."
 *  - When online, also enqueue a high-priority "need help" report in outbox (idempotent).
 *  - Never auto-send anything.
 *  - No contact saved -> show "Add an emergency contact in Me" prompt.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, Icon, PhoneShell } from '../components/ui'
import { StatusChip } from '../components/ui/StatusChip'
import { useLanguage } from '../store/language'
import { useConnectivity } from '../lib/connectivity'
import { getMedicalId, type MedicalIdData } from '../lib/medicalId'
import { buildSosPayload, type SosLocation } from '../lib/sos'
import { outbox } from '../lib/outbox'

const LAST_KNOWN_LOC_KEY = 'kavach_last_known_location'

interface StoredLocation {
  readonly lat: number
  readonly lon: number
  readonly accuracyMetres?: number
  readonly timestamp: number
}

function loadLastKnownLocation(): StoredLocation | null {
  try {
    const raw = localStorage.getItem(LAST_KNOWN_LOC_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredLocation
  } catch {
    return null
  }
}

function saveLastKnownLocation(loc: StoredLocation): void {
  try {
    localStorage.setItem(LAST_KNOWN_LOC_KEY, JSON.stringify(loc))
  } catch {
    // Ignore storage quota
  }
}

function formatAge(timestamp: number, now: number): string {
  const elapsedSec = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (elapsedSec < 60) return `${elapsedSec}s ago`
  const minutes = Math.floor(elapsedSec / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

export default function AidPage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const connectivity = useConnectivity()

  const [medicalId, setMedicalId] = useState<MedicalIdData | null>(null)
  const [currentLoc, setCurrentLoc] = useState<SosLocation | null>(null)
  const [locTimestamp, setLocTimestamp] = useState<number | null>(null)
  const [lastKnownLoc, setLastKnownLoc] = useState<StoredLocation | null>(() => loadLastKnownLocation())
  const [locError, setLocError] = useState<string | null>(() =>
    typeof navigator === 'undefined' || !navigator.geolocation
      ? 'Geolocation unavailable'
      : null,
  )
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const checkinQueuedRef = useRef(false)

  // Update clock ticker every 5s for age calculation
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(interval)
  }, [])

  // Load medical profile
  useEffect(() => {
    let mounted = true
    void getMedicalId().then((data) => {
      if (mounted) setMedicalId(data)
    })
    return () => {
      mounted = false
    }
  }, [])

  // Geolocation watch
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc: SosLocation = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyMetres: pos.coords.accuracy,
        }
        const time = pos.timestamp || Date.now()
        setCurrentLoc(loc)
        setLocTimestamp(time)
        setLocError(null)

        const stored: StoredLocation = {
          lat: loc.lat,
          lon: loc.lon,
          accuracyMetres: loc.accuracyMetres,
          timestamp: time,
        }
        setLastKnownLoc(stored)
        saveLastKnownLocation(stored)
      },
      (err) => {
        setLocError(err.message)
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
      },
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  // Build SOS Payload
  const activeLocation = useMemo(() => {
    return currentLoc ?? (lastKnownLoc ? { lat: lastKnownLoc.lat, lon: lastKnownLoc.lon, accuracyMetres: lastKnownLoc.accuracyMetres } : null)
  }, [currentLoc, lastKnownLoc])

  const primaryContact = medicalId?.emergencyContacts?.[0]
  const sosPayload = useMemo(() => {
    return buildSosPayload({
      location: activeLocation,
      medical: {
        bloodGroup: medicalId?.bloodGroup,
        allergies: medicalId?.allergies,
      },
      recipientPhone: primaryContact?.phone,
    })
  }, [activeLocation, medicalId, primaryContact])

  // Enqueue idempotent high-priority outbox check-in when online
  useEffect(() => {
    if (connectivity.level === 'live' && !checkinQueuedRef.current && activeLocation) {
      checkinQueuedRef.current = true
      // Deterministic key per day + location bucket so it's idempotent
      const today = new Date().toISOString().slice(0, 10)
      const idempotencyKey = `sos-need-help-${today}`

      void outbox.enqueue(
        'checkin',
        {
          status: 'need_help',
          lat: activeLocation.lat,
          lon: activeLocation.lon,
          timestamp: Date.now(),
          note: 'SOS triggered from app',
        },
        { id: idempotencyKey },
      ).catch(() => undefined)
    }
  }, [connectivity.level, activeLocation])

  const handleCopyCoords = async () => {
    const locToCopy = currentLoc ?? lastKnownLoc
    if (!locToCopy) return

    const coordStr = `${locToCopy.lat.toFixed(5)}, ${locToCopy.lon.toFixed(5)}`
    try {
      await navigator.clipboard.writeText(coordStr)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Fallback if clipboard API is restricted
    }
  }

  return (
    <PhoneShell>
      <main className="flex flex-col space-y-5 px-4 py-4 pb-12">
        {/* Header (Back, "SOS", StatusChip) */}
        <header className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void navigate(-1)
              }}
              aria-label={t('ui.back')}
              className="touch-target inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink hover:bg-surface-sunken"
            >
              <Icon name="chevron-left" className="h-5 w-5 rtl:rotate-180" />
            </button>
            <h1 className="text-xl font-extrabold text-ink">{t('sos.title')}</h1>
          </div>
          <StatusChip />
        </header>

        {/* Title and honest explanation */}
        <section className="space-y-1">
          <h2 className="text-2xl font-black tracking-tight text-ink">
            {t('sos.heading')}
          </h2>
          <p className="text-sm font-medium leading-relaxed text-ink-muted">
            {t('sos.subtitle')}
          </p>
        </section>

        {/* Location Card */}
        <Card className="space-y-3 p-4 border-line">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon name="pin" className="h-4 w-4 text-verified" />
              <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t('sos.locationTitle')}
              </span>
            </div>

            {(currentLoc || lastKnownLoc) && (
              <button
                type="button"
                onClick={() => void handleCopyCoords()}
                aria-label={copied ? t('sos.copied') : t('sos.copy')}
                className={`touch-target inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold transition-colors ${
                  copied
                    ? 'bg-live-tint text-live-text'
                    : 'bg-surface-sunken text-ink hover:text-ink-primary'
                }`}
                data-testid="sos-copy-coords-btn"
              >
                <Icon name={copied ? 'check-circle' : 'copy'} className="h-3.5 w-3.5" />
                <span>{copied ? t('sos.copied') : t('sos.copy')}</span>
              </button>
            )}
          </div>

          {currentLoc ? (
            <div className="space-y-1.5">
              <div
                className="font-mono text-[22px] font-extrabold tracking-tight text-ink"
                data-testid="sos-coords-display"
              >
                {currentLoc.lat.toFixed(5)}, {currentLoc.lon.toFixed(5)}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-ink-muted">
                {typeof currentLoc.accuracyMetres === 'number' && (
                  <span>{t('sos.accuracy', { acc: Math.round(currentLoc.accuracyMetres) })}</span>
                )}
                {locTimestamp && (
                  <span>• {t('sos.age', { age: formatAge(locTimestamp, now) })}</span>
                )}
              </div>
            </div>
          ) : lastKnownLoc ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-amber-900 bg-amber-50 rounded-lg p-2 border border-amber-200">
                {t('sos.locUnavailable')}
              </p>
              <div className="font-mono text-lg font-bold text-ink-muted">
                {lastKnownLoc.lat.toFixed(5)}, {lastKnownLoc.lon.toFixed(5)}
              </div>
              <p className="text-xs text-ink-muted">
                {t('sos.lastKnown', {
                  loc: `${lastKnownLoc.lat.toFixed(4)}, ${lastKnownLoc.lon.toFixed(4)}`,
                  age: formatAge(lastKnownLoc.timestamp, now),
                })}
              </p>
            </div>
          ) : (
            <div className="space-y-1 py-1">
              <p className="text-sm font-semibold text-danger">
                {t('sos.locUnavailable')}
              </p>
              {locError && <p className="text-xs text-ink-muted">{locError}</p>}
            </div>
          )}
        </Card>

        {/* Primary Call 112 Button (72px, danger) */}
        <Button
          variant="danger"
          size="xl"
          href="tel:112"
          className="w-full text-xl shadow-lg hover:shadow-xl font-black transition-all"
          data-testid="sos-call-112-btn"
        >
          <Icon name="phone" className="h-6 w-6" />
          <span>{t('sos.call112')}</span>
        </Button>

        {/* Secondary Call 108 Ambulance Button */}
        <Button
          variant="secondary"
          size="lg"
          href="tel:108"
          className="w-full font-bold"
          data-testid="sos-call-108-btn"
        >
          <Icon name="phone" className="h-5 w-5" />
          <span>{t('sos.call108')}</span>
        </Button>

        {/* Text Emergency Contact Button */}
        <Button
          variant="secondary"
          size="lg"
          href={sosPayload.smsUrl}
          className="w-full font-bold"
          data-testid="sos-sms-contact-btn"
        >
          <Icon name="bubbles" className="h-5 w-5" />
          <span>{t('sos.textContact')}</span>
        </Button>

        {/* No Contact Saved Warning */}
        {sosPayload.needsContact && (
          <div className="flex items-center justify-between gap-3 rounded-12 border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950">
            <div className="flex items-center gap-2">
              <Icon name="info" className="h-4 w-4 shrink-0 text-amber-700" />
              <span className="font-semibold">{t('sos.noContact')}</span>
            </div>
            <Link
              to="/me"
              className="font-bold underline underline-offset-2 text-amber-900 hover:text-amber-950 shrink-0"
            >
              {t('sos.addContact')}
            </Link>
          </div>
        )}

        {/* Message Preview Card (dashed border) */}
        <div className="space-y-2 rounded-16 border-2 border-dashed border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t('sos.previewTitle')}
            </span>
            <span className="text-[11px] font-semibold text-ink-muted/80">
              {sosPayload.text.length} / 300 chars
            </span>
          </div>

          <p
            className="rounded-lg bg-surface-sunken p-3 font-mono text-xs leading-relaxed text-ink selection:bg-verified-tint"
            data-testid="sos-preview-text"
          >
            {sosPayload.text}
          </p>

          <p className="text-[11px] font-medium text-ink-muted">
            {t('sos.previewHint')}
          </p>
        </div>

        {/* Honest Note */}
        <div className="rounded-12 bg-surface-sunken p-3.5 text-center text-xs font-medium leading-relaxed text-ink-muted">
          {t('sos.disclaimer')}
        </div>
      </main>
    </PhoneShell>
  )
}
