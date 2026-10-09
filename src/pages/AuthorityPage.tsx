import { Page, PageHeader } from '../components/Page'
import { useLanguage } from '../store/language'
import { IconAuthority } from '../components/icons'

/**
 * M6 — authority console.
 *
 * Deliberately NOT the placeholder factory: this is the screen an authority
 * uses to sign alerts, so it must already communicate the trust rules that
 * engineering rule 7 / AGENTS.md §9 impose (drills labelled, nothing fabricated).
 */
export default function AuthorityPage() {
  const { t } = useLanguage()

  return (
    <Page>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t('page.authority.title')}
          intro={t('page.authority.intro')}
          milestone="M6"
        />

        <div className="bg-surface ring-ink-subtle/25 flex items-start gap-3 rounded-2xl p-4 ring-1">
          <IconAuthority className="text-brand mt-0.5 size-6 shrink-0" />
          <div className="flex flex-col gap-2">
            <h2 className="text-ink font-semibold">{t('page.authority.heading')}</h2>
            <p className="text-ink-muted text-sm leading-relaxed">{t('page.authority.signing')}</p>
            <p className="text-ink-muted text-sm leading-relaxed">{t('page.authority.drill')}</p>
          </div>
        </div>
      </div>
    </Page>
  )
}
