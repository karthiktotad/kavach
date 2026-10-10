import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page, PageHeader } from '../components/Page'
import { Button, Card, Sheet } from '../components/ui'
import { getDb } from '../lib/db'
import { request } from '../lib/permissions'
import { useLanguage } from '../store/language'

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike
  }
}

function extractPacket(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  try {
    const url = new URL(value, window.location.origin)
    const hash = url.hash
    if (hash.startsWith('#/a/')) {
      return decodeURIComponent(hash.slice('/a/'.length + 1) || '')
    }
    if (url.pathname.startsWith('/a/')) {
      return decodeURIComponent(url.pathname.slice('/a/'.length))
    }
  } catch {
    // Fallback: accept raw packet strings or path fragments.
  }

  if (value.includes('/a/')) {
    const match = value.match(/\/a\/([^?#/]+)/)
    if (match?.[1]) return decodeURIComponent(match[1])
  }

  return value
}

export default function ScanPage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [linkValue, setLinkValue] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [showQrSheet, setShowQrSheet] = useState(false)

  const handlePacket = useCallback(
    async (raw: string, source: 'manual' | 'scan' = 'manual') => {
      const packet = extractPacket(raw)
      if (!packet) {
        setStatus(t('scan.invalid'))
        return
      }

      const existing = await getDb().packets.get(packet)
      if (existing) {
        setStatus(t('scan.alreadySaved'))
        return
      }

      setStatus(source === 'scan' ? t('scan.scanned') : t('scan.linkReady'))
      void navigate(`/a/${encodeURIComponent(packet)}`)
    },
    [navigate, t],
  )

  useEffect(() => {
    let cancelled = false
    let stream: MediaStream | null = null

    const startCamera = async () => {
      if (!window.BarcodeDetector && !navigator.mediaDevices?.getUserMedia) {
        return
      }

      const permission = await request('camera')
      if (permission !== 'granted') {
        if (!cancelled) setCameraError(t('scan.cameraBlocked'))
        return
      }

      if (cancelled) return

      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        const video = videoRef.current
        if (!video || cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        video.srcObject = stream
        await video.play().catch(() => undefined)

        const BarcodeDetectorCtor = window.BarcodeDetector
        if (!BarcodeDetectorCtor) return

        const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] })
        const loop = async () => {
          if (cancelled || !video.videoWidth || !video.videoHeight) return
          try {
            const codes = await detector.detect(video)
            const code = codes[0]?.rawValue
            if (code) {
              if (!cancelled) {
                await handlePacket(code, 'scan')
              }
              return
            }
          } catch {
            // The detector can fail on unsupported formats or temporary camera quirks.
          }
          if (!cancelled) window.setTimeout(loop, 500)
        }
        void loop()
      } catch {
        if (!cancelled) setCameraError(t('scan.cameraBlocked'))
      }
    }

    void startCamera()

    return () => {
      cancelled = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [handlePacket, t])

  return (
    <Page>
      <div className="mx-auto flex max-w-[420px] flex-col gap-4">
        <PageHeader title={t('scan.title')} intro={t('scan.intro')} />

        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-ink">{t('scan.cameraTitle')}</h2>
            <span className="rounded-full bg-verified-tint px-2 py-1 text-[11px] font-bold text-verified uppercase tracking-[0.12em]">
              {t('scan.live')}
            </span>
          </div>

          <div className="overflow-hidden rounded-16 border border-line bg-ground">
            <video ref={videoRef} className="h-56 w-full object-cover" playsInline muted aria-label={t('scan.cameraLabel')} />
          </div>

          {cameraError ? <p className="text-sm font-medium text-danger">{cameraError}</p> : null}
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <label htmlFor="scan-link" className="text-sm font-bold text-ink">
            {t('scan.pasteLabel')}
          </label>
          <input
            id="scan-link"
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            placeholder="https://.../#/a/<packet>"
            className="min-h-[52px] rounded-12 border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-muted"
          />
          <Button size="lg" onClick={() => { void handlePacket(linkValue) }} className="w-full">
            {t('scan.openLink')}
          </Button>
        </Card>

        {status ? <p className="text-sm font-medium text-ink">{status}</p> : null}

        <Button variant="secondary" onClick={() => setShowQrSheet(true)} className="w-full">
          {t('scan.showQr')}
        </Button>

        <Sheet
          open={showQrSheet}
          onClose={() => setShowQrSheet(false)}
          title={t('scan.showQr')}
          closeLabel={t('ui.close')}
        >
          <div className="rounded-12 border-2 border-dashed border-line bg-ground p-6 text-center">
            <div className="mx-auto grid h-32 w-32 place-items-center rounded-xl bg-surface text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
              QR
            </div>
            <p className="mt-3 break-all text-xs text-muted">{window.location.origin}/#/a/packet</p>
          </div>
        </Sheet>
      </div>
    </Page>
  )
}
