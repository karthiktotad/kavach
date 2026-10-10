/**
 * Inline SVG icon set.
 *
 * Rule 6: icon-first UI. Icons are decorative here — every icon is paired with
 * a visible label or an aria-label at the usage site, and `aria-hidden` is set
 * so screen readers read the label once, not twice.
 */
import type { SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement>

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconHome = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M9.5 21v-6h5v6" />
  </Base>
)

export const IconAlerts = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3a6 6 0 0 0-6 6c0 4-2 5-2 5h16s-2-1-2-5a6 6 0 0 0-6-6Z" />
    <path d="M10.2 19a2 2 0 0 0 3.6 0" />
  </Base>
)

export const IconMap = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" />
    <path d="M9 4v13M15 6.5v13" />
  </Base>
)

export const IconAssist = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" />
    <path d="M12 8v4M12 15.5v.5" />
  </Base>
)

export const IconAid = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
    <path d="M3.5 6.5 20.5 6.5l-1 13a2 2 0 0 1-2 1.8H6.5a2 2 0 0 1-2-1.8Z" />
  </Base>
)

export const IconPhrases = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 5h9v7H8l-3 3V12H4Z" />
    <path d="M15 9h5v6h-2v3l-3-3h-3" />
  </Base>
)

export const IconMe = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </Base>
)

export const IconReport = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v10" />
    <path d="M8 10l4 4 4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </Base>
)

export const IconAuthority = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3l7 3v6c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6Z" />
    <path d="m9 12 2 2 4-4" />
  </Base>
)

export const IconGlobe = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
  </Base>
)

/** Live: strong signal. */
export const IconSignalStrong = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20v-4M9.3 20V12M14.7 20V8M20 20V4" />
  </Base>
)

/** Degraded: middling signal. */
export const IconSignalMedium = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20v-4M9.3 20v-6" />
    <path d="M15 20v-9M20 20v-12" opacity={0.35} />
  </Base>
)

/** Cellular-only: antenna, no wifi. */
export const IconCellular = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 18.5V13M10 18.5V9M15 18.5V4.5" />
    <path d="M2 21h20" />
  </Base>
)

/** Offline: slashed wifi. */
export const IconOffline = (p: IconProps) => (
  <Base {...p}>
    <path d="M2 3l20 20" />
    <path d="M5 12.5a11 11 0 0 1 4-2.7M19 12.5a11 11 0 0 0-6-3" />
    <path d="M8.5 16a6.5 6.5 0 0 1 2-1.4M15.5 16a6.5 6.5 0 0 0-1-1" />
    <path d="M12 19.5v.01" />
  </Base>
)

/** Relay: packets over SMS/voice only. */
export const IconRelay = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 5.5A8.5 8.5 0 0 0 5.6 6.6L3 9.3l.6 3.8 3.1-1.3" />
    <path d="M8.5 15.5A6 6 0 0 0 21 18.5" />
    <path d="M8 12h8" />
    <path d="m8 8 8 8M16 8l-8 8" opacity={0.5} />
  </Base>
)

export const IconChevronDown = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
)

export const IconClose = (p: IconProps) => (
  <Base {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Base>
)

export const IconArrowLeft = (p: IconProps) => (
  <Base {...p}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </Base>
)

export const IconDownload = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M4 19h16" />
  </Base>
)

export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="m4 12 5 5L20 6" />
  </Base>
)

export const IconShield = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3 20 6v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6Z" />
    <path d="m9 12 2 2 4-4" />
  </Base>
)
