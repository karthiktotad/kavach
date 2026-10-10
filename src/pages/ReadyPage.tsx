/**
 * Get Ready — first-launch onboarding and the pack download.
 *
 * This is the moment that turns "a web page" into "an offline app". It has to
 * be honest and quick: a tourist on hotel wi-fi will delete anything that
 * sounds like a licence agreement or hides how much data it wants.
 *
 *  - says exactly what will be stored and how big it is, before anything downloads
 *  - shows real progress, because a silent 30-second wait reads as a hang
 *  - never blocks if the network drops: it says so and offers a retry
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page, PageHeader } from '../components/Page'
import { IconArrowLeft, IconCheck, IconDownload, IconGlobe, IconShield } from '../components/icons'
import { useLanguage } from '../store/language'
import { packManager, type PackState } from '../lib/pack'
import { setSetting, getSetting, SETTING } from '../lib/db'
import { formatBytes } from '../lib/freshness'

/** Captured from `beforeinstallprompt` so we can offer a real install button. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function ReadyPage() {
  const { t, locale } = useLanguage()
  const navigate = useNavigate()
  const [state, setState] = useState<PackState>(() => packManager.getState())
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [packed, setPacked] = useState(0)

  useEffect(() => packManager.subscribe(setState), [])

  // iOS Safari fires no `beforeinstallprompt`, so it needs manual instructions.
  // Derived during render rather than in an effect: there is nothing async
  // about detecting the platform, and setState-in-effect causes a double render.
  const [iOS] = useState(() => {
    const ua = navigator.userAgent
    return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  })

  // Capture the install prompt before Chrome/Edge fires it.
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const start = useCallback(async () => {
    setPacked(0)
    await packManager.ensureInstalled([locale])
    setPacked(await packManager.storageUsed())
  }, [locale])

  const done = state.status === 'ready' && packed > 0

  async function finish(): Promise<void> {
    await setSetting(SETTING.ONBOARDED, true)
    // navigate() returns a Promise under a data router, so mark it as
    // deliberately not awaited.
    void navigate('/')
  }

  // An install prompt that rejects must not leave the button wedged.
  const promptInstall = async (): Promise<void> => {
    if (!installEvent) return
    try {
      await installEvent.prompt()
      await installEvent.userChoice
    } catch {
      // Dismissed or unsupported: the manual instructions below still apply.
    } finally {
      setInstallEvent(null)
    }
  }

  return (
    <Page>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('ready.title')} intro={t('ready.intro')} />

        {/* 1. What it does, in one line. */}
        <section className="flex flex-col gap-3">
          <Bullet Icon={IconDownload} title={t('ready.step1Title')} body={t('ready.step1Body')} />
          <Bullet Icon={IconGlobe} title={t('ready.step2Title')} body={t('ready.step2Body')} />
          <Bullet Icon={IconShield} title={t('ready.step3Title')} body={t('ready.step3Body')} />
        </section>

        {/* 2. Size + privacy, stated before anything downloads. */}
        <section className="bg-surface ring-ink-subtle/25 rounded-2xl p-4 ring-1">
          <h2 className="text-ink font-semibold">{t('ready.storageTitle')}</h2>
          <ul className="text-ink-muted mt-2 flex flex-col gap-1.5 text-sm">
            <li>{t('ready.storageSize')}</li>
            <li>{t('ready.storageLocal')}</li>
            <li>{t('ready.storageDelete')}</li>
          </ul>
        </section>

        {/* 3. Download with real progress. */}
        <section className="flex flex-col gap-3">
          {state.status === 'downloading' ? (
            <>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={state.progress.total}
                aria-valuenow={state.progress.done}
                aria-label={t('ready.progress')}
                className="bg-surface-raised h-3 w-full overflow-hidden rounded-full"
              >
                <div
                  className="bg-brand h-full transition-[width] duration-300"
                  style={{
                    width: `${state.progress.total === 0 ? 0 : (state.progress.done / state.progress.total) * 100}%`,
                  }}
                />
              </div>
              <p className="text-ink-muted text-sm" aria-live="polite">
                {t('ready.progressLabel', {
                  done: state.progress.done,
                  total: state.progress.total,
                  current: state.progress.current ?? '',
                })}
              </p>
            </>
          ) : null}

          {state.status === 'error' ? (
            <p
              className="bg-risk-3/15 text-risk-3 ring-risk-3/40 rounded-xl p-3 text-sm ring-1"
              role="alert"
            >
              {t('ready.error')} <span className="text-ink-muted">{state.error}</span>
            </p>
          ) : null}

          {done ? (
            <p className="bg-safe/15 text-safe ring-safe/40 flex items-center gap-2 rounded-xl p-3 text-sm font-semibold ring-1">
              <IconCheck className="size-5" />
              {t('ready.done', { size: formatBytes(packed, locale) })}
            </p>
          ) : null}

          {!done ? (
            <button
              type="button"
              onClick={() => void start()}
              disabled={state.status === 'downloading'}
              className="touch-target bg-brand text-surface-sunken w-full rounded-xl font-semibold disabled:opacity-60"
            >
              {state.status === 'downloading' ? t('ready.downloading') : t('ready.download')}
            </button>
          ) : null}

          {done ? (
            <button
              type="button"
              onClick={() => void finish()}
              className="touch-target bg-brand text-surface-sunken w-full rounded-xl font-semibold"
            >
              {t('ready.continue')}
            </button>
          ) : null}
        </section>

        {/* 4. Install hint — real button where supported, instructions elsewhere. */}
        <section className="bg-surface ring-ink-subtle/25 rounded-2xl p-4 ring-1">
          <h2 className="text-ink font-semibold">{t('ready.installTitle')}</h2>
          {installEvent ? (
            <button
              type="button"
              onClick={() => void promptInstall()}
              className="touch-target bg-surface-raised text-ink ring-ink-subtle/30 mt-3 w-full rounded-xl font-semibold ring-1"
            >
              {t('ready.installButton')}
            </button>
          ) : iOS ? (
            <ol className="text-ink-muted mt-2 flex list-decimal flex-col gap-1 ps-5 text-sm">
              <li>{t('ready.iosStep1')}</li>
              <li>{t('ready.iosStep2')}</li>
              <li>{t('ready.iosStep3')}</li>
            </ol>
          ) : (
            <p className="text-ink-muted mt-2 text-sm">{t('ready.installGeneric')}</p>
          )}
        </section>

        {/* Never trap a user who cannot get the pack right now. */}
        <button
          type="button"
          onClick={() => void finish()}
          className="touch-target text-ink-muted self-start px-2 text-sm underline"
        >
          <IconArrowLeft className="size-4" />
          {t('ready.skip')}
        </button>
      </div>
    </Page>
  )
}

function Bullet({
  Icon,
  title,
  body,
}: {
  Icon: (p: { className?: string }) => React.ReactElement
  title: string
  body: string
}) {
  return (
    <article className="bg-surface ring-ink-subtle/25 flex gap-3 rounded-2xl p-4 ring-1">
      <Icon className="text-brand mt-0.5 size-6 shrink-0" />
      <div>
        <h2 className="text-ink font-semibold">{title}</h2>
        <p className="text-ink-muted mt-1 text-sm leading-relaxed">{body}</p>
      </div>
    </article>
  )
}

/** Redirect to /ready on first launch. */
export async function needsOnboarding(): Promise<boolean> {
  return !(await getSetting<boolean>(SETTING.ONBOARDED, false))
}
