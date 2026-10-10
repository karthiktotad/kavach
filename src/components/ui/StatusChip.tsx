/**
 * StatusChip — where the app is on the connectivity ladder.
 *
 * This is the component that makes AGENTS.md's "never hide degraded state
 * behind a spinner" rule visible. It is ALWAYS rendered, it ALWAYS names the
 * level in words, and it ALWAYS carries an icon — because colour alone must
 * never be the signal (rule 6, and this is the one component where a
 * colour-blind tourist could otherwise think they are offline when they are not).
 *
 * It opens a Sheet that explains, in plain language, what works and what does
 * not at the current level. That is not a nicety: "Cellular-only" means
 * nothing to someone who has just landed, and the difference between it and
 * "Offline" is the difference between receiving alerts by SMS and not.
 */
import { useState } from 'react'
import { Icon, type IconName } from './Icon'
import { Sheet } from './Sheet'

export type ConnectivityLevel = 'live' | 'degraded' | 'offline' | 'relay'

export interface StatusChipProps {
  level: ConnectivityLevel
  /** Milliseconds since the last successful data fetch. Null when never fetched. */
  ageMs: number | null
}

/** Icon per level. Every level gets a distinct glyph. */
const ICONS: Record<ConnectivityLevel, IconName> = {
  live: 'wifi',
  degraded: 'warning',
  offline: 'wifi-off',
  relay: 'chat',
}

/**
 * What works at each level. This is the whole point of the chip: the user is
 * told what they can rely on right now, rather than being left to guess.
 *
 * Keys are i18n keys, not strings — rule 5. The copy lives in the locale files
 * so the explanation is as localised as the alert itself.
 */
const EXPLAINER: Record<
  ConnectivityLevel,
  { titleKey: string; worksKey: string; limitedKey: string }
> = {
  live: {
    titleKey: 'chip.live.title',
    worksKey: 'chip.live.works',
    limitedKey: 'chip.live.limited',
  },
  degraded: {
    titleKey: 'chip.degraded.title',
    worksKey: 'chip.degraded.works',
    limitedKey: 'chip.degraded.limited',
  },
  offline: {
    titleKey: 'chip.offline.title',
    worksKey: 'chip.offline.works',
    limitedKey: 'chip.offline.limited',
  },
  relay: {
    titleKey: 'chip.relay.title',
    worksKey: 'chip.relay.works',
    limitedKey: 'chip.relay.limited',
  },
}

/** Formats an age for display. Compact: "3m", "2h", "just now". */
export function formatAge(ageMs: number | null): string {
  if (ageMs === null) return ''
  const minutes = Math.floor(ageMs / 60_000)
  if (minutes < 1) return 'key'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function StatusChip({ level, ageMs }: StatusChipProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-10 border border-line bg-surface px-3 py-2 text-sm font-bold text-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-verified focus-visible:outline-offset-2"
      >
        <Icon name={ICONS[level]} className="h-5 w-5" />
        <span>{`chip.${level}`}</span>
      </button>

      {open ? (
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title={`chip.${level}.title`}
        >
          <p className="text-base text-ink">{EXPLAINER[level].worksKey}</p>
          <p className="text-base text-ink">{EXPLAINER[level].limitedKey}</p>
        </Sheet>
      ) : null}
    </>
  )
}
