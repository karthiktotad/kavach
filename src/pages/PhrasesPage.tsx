import { EmptyState } from '../components/ui'
import { Page, PageHeader } from '../components/Page'
import { useLanguage } from '../store/language'

/**
 * Phrasebook route kept honest: this feature is planned, not implemented.
 * A real app must never pretend to ship a full phrasebook when it is not yet available.
 */
export default function PhrasesPage() {
  const { t } = useLanguage()

  return (
    <Page>
      <div className="mx-auto flex max-w-[390px] flex-col gap-4">
        <PageHeader
          title={t('page.phrases.title')}
          intro={t('page.phrases.intro')}
          milestone="M10"
        />
        <EmptyState
          icon="chat"
          title={t('ui.emptyTitle')}
          body={t('ui.emptyBody')}
        />
      </div>
    </Page>
  )
}
