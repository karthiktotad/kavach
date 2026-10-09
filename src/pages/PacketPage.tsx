import { Link, useParams } from 'react-router-dom'
import { Page, PageHeader } from '../components/Page'
import { useLanguage } from '../store/language'
import { IconAlerts } from '../components/icons'

/**
 * M4/M7 — the signed alert packet viewer.
 *
 * This route is the deep-link target (`/#/a/<packet>`) that must keep working
 * with no network at all: the app is already installed, the packet is in the
 * URL, and the bundled public key verifies it locally.
 *
 * M1 behaviour: show the raw packet we were handed and the states it will grow.
 * It must never crash on a malformed packet — `useParams` returns an arbitrary
 * string, so everything is treated as untrusted input.
 */
export default function PacketPage() {
  const { t } = useLanguage()
  const params = useParams<{ packet: string }>()
  // Treat the URL segment as untrusted: it may be absent, empty or garbage.
  const packet = params.packet ?? ''

  return (
    <Page>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t('page.packet.title')}
          intro={t('page.packet.intro')}
          milestone="M4 · M7"
        />

        <section className="bg-surface ring-ink-subtle/25 flex flex-col gap-3 rounded-2xl p-4 ring-1">
          <div className="text-ink-muted flex items-center gap-2">
            <IconAlerts className="size-5 shrink-0" />
            <h2 className="text-sm font-semibold">{t('page.packet.received')}</h2>
          </div>
          {packet ? (
            <code className="bg-surface-sunken text-ink-muted block max-h-40 overflow-y-auto rounded-lg p-3 font-mono text-xs break-all">
              {packet}
            </code>
          ) : (
            <p className="text-ink-muted text-sm">{t('page.packet.empty')}</p>
          )}
          <p className="text-ink-subtle text-xs leading-relaxed">{t('page.packet.m4note')}</p>
        </section>

        <Link
          to="/alerts"
          className="touch-target bg-surface-raised text-ink ring-ink-subtle/30 self-start rounded-xl px-5 font-semibold ring-1"
        >
          {t('ui.back')}
        </Link>
      </div>
    </Page>
  )
}
