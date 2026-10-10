/**
 * Printable QR Poster Component for Emergency Broadcasts.
 * Includes @media print stylesheet for crisp high-contrast evacuation postering.
 */
import { Button, Icon } from '../../components/ui'
import { QrCodeSvg } from './QrCodeSvg'
import type { AlertLevel, HazardCode, PacketMode } from '../../../shared/packet'

export interface QrPosterProps {
  readonly packet: string
  readonly hazard: HazardCode
  readonly level: AlertLevel
  readonly zones: readonly string[]
  readonly mode: PacketMode
  readonly shareUrl: string
  readonly onDismiss: () => void
}

const HAZARD_LABELS: Record<HazardCode, string> = {
  FL: 'FLOOD / FLASH FLOOD',
  CY: 'CYCLONE / STORM SURGE',
  HT: 'EXTREME HEATWAVE',
  WN: 'HIGH WINDS / GALE',
  LS: 'LANDSLIDE HAZARD',
  AC: 'ALL-CLEAR / CANCELLED',
}

const LEVEL_LABELS: Record<AlertLevel, string> = {
  0: 'ALL CLEAR',
  1: 'LEVEL 1: ADVISORY',
  2: 'LEVEL 2: WATCH',
  3: 'LEVEL 3: WARNING',
  4: 'LEVEL 4: EXTREME EMERGENCY',
}

export function QrPoster({
  packet,
  hazard,
  level,
  zones,
  mode,
  shareUrl,
  onDismiss,
}: QrPosterProps) {
  const isDrill = mode === 'D'

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/75 backdrop-blur-sm p-4 overflow-y-auto">
      {/* Container card */}
      <div className="relative w-full max-w-2xl rounded-20 bg-surface p-6 shadow-2xl space-y-6 border border-line print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none print:w-full">
        {/* Screen-only top action bar */}
        <div className="flex items-center justify-between gap-3 border-b border-line pb-4 print:hidden">
          <div>
            <h2 className="text-lg font-black text-ink">Print QR Poster</h2>
            <p className="text-xs font-medium text-ink-muted">
              Display at hotel lobbies, transit hubs, and shelters for offline tourist access.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={handlePrint}
              className="font-bold text-xs"
              data-testid="poster-print-btn"
            >
              <Icon name="download" className="h-4 w-4" />
              <span>Print Poster</span>
            </Button>
            <button
              type="button"
              onClick={onDismiss}
              className="p-2 rounded-8 text-ink-muted hover:bg-surface-sunken"
              aria-label="Close poster view"
            >
              ✕
            </button>
          </div>
        </div>

        {/* The Printable Poster Area */}
        <div
          id="printable-poster-content"
          className="border-4 border-ink p-8 rounded-16 space-y-6 text-center bg-white print:border-4 print:border-black print:p-10 print:rounded-none"
        >
          {/* Header Banner */}
          <div className="flex items-center justify-between border-b-2 border-ink pb-4">
            <div className="flex items-center gap-2 text-left">
              <Icon name="shield-check" className="h-8 w-8 text-verified" />
              <div>
                <span className="block text-xs font-black tracking-widest uppercase text-ink-muted">
                  Official Crisis Notice
                </span>
                <span className="text-xl font-black text-ink">KAVACH · தமிழ்நாடு அரசு</span>
              </div>
            </div>

            {isDrill ? (
              <div className="rounded-8 bg-drill border-2 border-drill-dark px-4 py-1.5 font-black text-white text-sm tracking-wider uppercase">
                DRILL / 演習 (EXERCISE ONLY)
              </div>
            ) : (
              <div className="rounded-8 bg-danger border-2 border-danger-dark px-4 py-1.5 font-black text-white text-sm tracking-wider uppercase">
                OFFICIAL LIVE ALERT
              </div>
            )}
          </div>

          {/* Hazard & Level Highlight */}
          <div className="space-y-1 py-2">
            <div
              className={`text-2xl font-black uppercase tracking-wide ${
                level >= 3 ? 'text-danger' : level === 2 ? 'text-drill' : 'text-verified'
              }`}
            >
              {LEVEL_LABELS[level]}
            </div>
            <div className="text-3xl font-black text-ink">
              {HAZARD_LABELS[hazard]}
            </div>
            <div className="text-sm font-bold text-ink-muted">
              Target Zone(s): <span className="text-ink font-extrabold">{zones.join(', ')}</span>
            </div>
          </div>

          {/* Center QR Code */}
          <div className="flex flex-col items-center justify-center py-2 space-y-3">
            <div className="p-4 rounded-16 border-4 border-ink bg-white shadow-md inline-block print:shadow-none">
              <QrCodeSvg value={shareUrl || `/#/a/${packet}`} size={240} />
            </div>
            <span className="text-xs font-black tracking-wider uppercase text-ink">
              SCAN WITH PHONE CAMERA · NO INTERNET REQUIRED
            </span>
          </div>

          {/* Multilingual Quick Guidance Instructions */}
          <div className="grid grid-cols-2 gap-4 border-t-2 border-ink pt-4 text-left text-xs">
            <div className="space-y-1">
              <span className="font-extrabold text-ink block">English</span>
              <p className="font-medium text-ink-muted leading-tight">
                Scan this QR code with your phone camera to view official crisis instructions and offline shelter routes in your language.
              </p>
            </div>
            <div className="space-y-1">
              <span className="font-extrabold text-ink block">தமிழ் (Tamil)</span>
              <p className="font-medium text-ink-muted leading-tight">
                உங்கள் மொழியில் அவசரகால பாதுகாப்பு வழிகாட்டுதலைப் பெற இந்த QR குறியீட்டை ஸ்கேன் செய்யவும்.
              </p>
            </div>
            <div className="space-y-1">
              <span className="font-extrabold text-ink block">हिन्दी (Hindi)</span>
              <p className="font-medium text-ink-muted leading-tight">
                अपनी भाषा में आधिकारिक सुरक्षा निर्देश देखने के लिए इस QR कोड को स्कैन करें।
              </p>
            </div>
            <div className="space-y-1">
              <span className="font-extrabold text-ink block">Français & Deutsch</span>
              <p className="font-medium text-ink-muted leading-tight">
                Scannez ce code pour obtenir les alertes officielles traduites et les itinéraires de refuge hors ligne.
              </p>
            </div>
          </div>

          {/* Offline Trust Guarantee Footer */}
          <div className="border-t border-line pt-3 flex items-center justify-between text-[11px] font-semibold text-ink-muted">
            <span>Cryptographically Signed (ECDSA P-256)</span>
            <span>Packet: {packet.slice(0, 32)}…</span>
            <span>Zero-Install PWA</span>
          </div>
        </div>
      </div>
    </div>
  )
}
