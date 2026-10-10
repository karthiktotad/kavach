/**
 * /dev/ui — the design-system gallery. DEV ONLY.
 *
 * The point is not to look pretty; it is to make regressions *visible* before a
 * screen depends on a component. It shows every component in every state, at
 * 100% and 200% text, and in RTL — because those three are where design-system
 * bugs actually live, and none of them are catchable by reading the code.
 *
 * 200% text is simulated by scaling the ROOT font-size, not by a transform.
 * A transform would leave the layout engine at 1x, so it would show a page that
 * reflows perfectly while a real user on a 200% setting watches text overlap.
 *
 * RTL is toggled with `dir` on this subtree only, never on <html>, so flipping
 * it here cannot leak into the app shell.
 */
import { useState } from 'react'
import { useLanguage } from '../store/language'
import {
  AppHeader,
  BottomNav,
  NAV_ITEMS,
  Button,
  Card,
  ChipGroup,
  DrillBanner,
  EmptyState,
  ErrorFallback,
  Icon,
  ICON_NAMES,
  PhoneShell,
  RiskMeter,
  SeverityPill,
  Sheet,
  SourceChip,
  StatusChip,
  StepList,
  UnverifiedTag,
  VerifiedBadge,
  RISK_LEVELS,
} from '../components/ui'

/**
 * A third guard, and the only one that survives tree-shaking analysis by a
 * reviewer: the route module already refuses to mount outside DEV, so this is
 * a backstop rather than the primary defence. Kept as a render-time early
 * return instead of a module-level side effect, so importing the page in a
 * test does not write to the console.
 */
function DevOnly({ children }: { children: React.ReactNode }) {
  if (!import.meta.env.DEV) return null
  return <>{children}</>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line py-6">
      <h2 className="text-ink mb-4 text-lg font-bold">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

export default function DevUiPage() {
  const { t } = useLanguage()
  const [scale, setScale] = useState<1 | 2>(1)
  const [rtl, setRtl] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [chipValue, setChipValue] = useState('nearest')

  return (
    <DevOnly>
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ fontSize: `${scale * 100}%` }}>
      <div className="bg-ground flex min-h-dvh flex-col">
        <div className="bg-verified text-white px-4 py-2 font-bold">
          <div className="mx-auto flex max-w-[480px] flex-wrap items-center gap-2">
            <span>{t('dev.ui.title')}</span>
            <span className="ms-auto flex gap-2">
              <Button size="md" variant="secondary" onClick={() => setScale(scale === 1 ? 2 : 1)}>
                {scale === 1 ? t('dev.ui.text200') : t('dev.ui.text100')}
              </Button>
              <Button size="md" variant="secondary" onClick={() => setRtl(!rtl)}>
                {rtl ? t('dev.ui.ltr') : t('dev.ui.rtl')}
              </Button>
            </span>
          </div>
        </div>

        <p className="text-muted mx-auto max-w-[480px] px-4 py-3 text-sm">
          {t('dev.ui.intro')}
        </p>

        <PhoneShell>
          <Section title="Button">
            {(['primary', 'secondary', 'danger', 'drill'] as const).map((v) => (
              <Button key={v} variant={v}>
                {v}
              </Button>
            ))}
            {(['md', 'lg', 'xl'] as const).map((s) => (
              <Button key={s} size={s} variant="primary">
                size {s}
              </Button>
            ))}
            <Button loading>loading</Button>
            <Button disabled>disabled</Button>
            <Button href="#/dev/ui" variant="secondary">
              href → renders an &lt;a&gt;
            </Button>
          </Section>

          <Section title="StatusChip — all five rungs">
            {(['live', 'degraded', 'cellular', 'offline', 'relay'] as const).map((level) => (
              <StatusChip key={level} level={level} />
            ))}
            <Button onClick={() => setSheetOpen(true)}>open Sheet</Button>
          </Section>

          <Section title="Trust markers — colour is never alone">
            <div className="flex flex-wrap items-center gap-2">
              <VerifiedBadge />
              <UnverifiedTag />
              <SeverityPill level={3} />
              <SourceChip source="open-meteo" />
            </div>
            <DrillBanner />
            <div className="flex flex-col gap-3">
              {RISK_LEVELS.map((level) => (
                <RiskMeter key={level} level={level} verified />
              ))}
              {RISK_LEVELS.map((level) => (
                <RiskMeter key={`unverified-${level}`} level={level} verified={false} />
              ))}
            </div>
          </Section>

          <Section title="Card, StepList, ChipGroup">
            <Card>
              <p className="text-text-2 text-[15px]">Body copy at 15px minimum.</p>
            </Card>
            <StepList steps={['Move to higher ground', 'Avoid floodwater entirely', 'Call 108 if injured']} />
            <ChipGroup
              label="Sort by"
              value={chipValue}
              onChange={setChipValue}
              options={[
                { id: 'nearest', label: 'Nearest' },
                { id: 'safest', label: 'Safest' },
                { id: 'fastest', label: 'Fastest' },
              ]}
            />
          </Section>

          <Section title="Empty and error states">
            <EmptyState
              title={t('ui.emptyTitle')}
              body={t('ui.emptyBody')}
              icon="search-check"
            />
            <ErrorFallback onRetry={() => undefined} />
          </Section>

          <Section title="Icon — every name in the set">
            <ul className="grid grid-cols-6 gap-3">
              {ICON_NAMES.map((name) => (
                <li key={name} className="flex flex-col items-center gap-1 text-center">
                  <Icon name={name} className="text-ink h-6 w-6" />
                  <span className="text-muted text-[12px]">{name}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Header chrome">
            <AppHeader title="Alerts" showBack statusLevel="degraded" t={t} />
            <p className="text-muted text-sm">
              NAV_ITEMS: {NAV_ITEMS.map((item) => item.labelKey).join(' · ')}
            </p>
          </Section>
        </PhoneShell>

        <div className="fixed inset-x-0 bottom-0 z-30">
          <BottomNav t={t} items={NAV_ITEMS} />
        </div>

        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={t('status.sheetTitle')}
          closeLabel={t('ui.close')}
        >
          <p className="text-text-2 text-[15px]">Sheet body at {scale * 100}% text, dir={rtl ? 'rtl' : 'ltr'}.</p>
        </Sheet>
      </div>
    </div>
    </DevOnly>
  )
}