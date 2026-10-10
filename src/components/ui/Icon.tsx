/**
 * Icon — the single source of truth for every pictogram in the app.
 *
 * Rules from docs/DESIGN_SPEC.md:
 *   - Inline SVG, stroke-width 2, round caps/joins, currentColor.
 *   - `aria-hidden` unless a label is supplied — rule 6, icon-first UI.
 *   - Sizing comes from the caller (className / width / height); the icon itself
 *     never assumes a size, so it can be 20px in a chip and 28px in a button
 *     without a variant.
 *
 * There is exactly one icon component rather than 30 named exports because a
 * component that must appear in a design-system gallery, a11y test matrix and
 * RTL mirror check is much easier to enumerate when the set is a data structure.
 * `ICON_NAMES` is that enumeration, so a missing icon is a type error and a new
 * one is impossible to forget in the gallery.
 */
import type { SVGProps } from 'react'

/** The complete icon set. Adding an icon means adding it here too. */
export const ICON_NAMES = [
  'shield-check',
  'globe',
  'wifi',
  'wifi-off',
  'warning',
  'waves',
  'check-circle',
  'pin',
  'phone',
  'chat',
  'aid',
  'bubbles',
  'search-check',
  'home',
  'bell',
  'map',
  'user',
  'speaker',
  'share',
  'qr',
  'compass',
  'layers',
  'mic',
  'send',
  'copy',
  'lock',
  'info',
  'chevron-left',
  'download',
  'camera',
  'flag',
  'clock',
] as const

export type IconName = (typeof ICON_NAMES)[number]

/** A path list per icon. Kept as data, not JSX, so the set stays diffable. */
const PATHS: Record<IconName, readonly string[]> = {
  'shield-check': ['M12 3 20 6v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6Z', 'm9 12 2 2 4-4'],
  globe: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M3 12h18', 'M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z'],
  wifi: ['M2 8.5a15 15 0 0 1 20 0', 'M5 12.5a10 10 0 0 1 14 0', 'M8.5 16a5 5 0 0 1 7 0', 'M12 19.5v.01'],
  'wifi-off': ['M2 3l20 20', 'M5 12.5a11 11 0 0 1 4-2.7', 'M19 12.5a11 11 0 0 0-6-3', 'M8.5 16a6.5 6.5 0 0 1 2-1.4', 'M15.5 16a6.5 6.5 0 0 0-1-1', 'M12 19.5v.01'],
  warning: ['M12 4 2.5 20h19L12 4Z', 'M12 10v4.5', 'M12 17.5v.01'],
  waves: ['M2 12c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0', 'M2 17c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0', 'M2 7c2-2.5 4-2.5 6 0s4 2.5 6 0 4-2.5 6 0'],
  'check-circle': ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'm8 12 3 3 5-6'],
  pin: ['M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
  phone: ['M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5L17 13l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3Z'],
  chat: ['M21 14a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z'],
  aid: ['M12 5v14M5 12h14', 'M3.5 6.5h17l-1 13a2 2 0 0 1-2 1.8H6.5a2 2 0 0 1-2-1.8Z'],
  bubbles: ['M4 5h9v7H8l-3 3V12H4Z', 'M15 9h5v6h-2v3l-3-3h-3'],
  'search-check': ['M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z', 'm15.5 15.5 4 4', 'm8.5 10.5 2 2 3.5-4'],
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5', 'M9.5 21v-6h5v6'],
  bell: ['M12 3a6 6 0 0 0-6 6c0 4-2 5-2 5h16s-2-1-2-5a6 6 0 0 0-6-6Z', 'M10.2 19a2 2 0 0 0 3.6 0'],
  map: ['M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z', 'M9 4v13', 'M15 6.5v13'],
  user: ['M12 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M4.5 20a7.5 7.5 0 0 1 15 0'],
  speaker: ['M4 9v6h4l5 4V5L8 9H4Z', 'M16 8.5a5 5 0 0 1 0 7', 'M19 6a8.5 8.5 0 0 1 0 12'],
  share: ['M12 3v12', 'm8 7 4-4 4 4', 'M4 15v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2'],
  qr: ['M4 4h6v6H4V4Z', 'M14 4h6v6h-6V4Z', 'M4 14h6v6H4v-6Z', 'M14 14h2v2h-2Z', 'M18 14h2v2h-2Z', 'M14 18h2v2h-2Z', 'M18 18h2v2h-2Z'],
  compass: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'm15.5 8.5-2 5-5 2 2-5 5-2Z'],
  layers: ['M12 3 3 8l9 5 9-5-9-5Z', 'm3 13 9 5 9-5'],
  mic: ['M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z', 'M6 11a6 6 0 0 0 12 0', 'M12 17v4'],
  send: ['M4 12 20 4l-7 16-2.5-6.5L4 12Z'],
  copy: ['M9 9h10v10H9V9Z', 'M15 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h4'],
  lock: ['M6 11h12v9H6v-9Z', 'M9 11V8a3 3 0 0 1 6 0v3', 'M12 15v2'],
  info: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 11v6', 'M12 7.5v.01'],
  'chevron-left': ['m14 6-6 6 6 6'],
  download: ['M12 3v12', 'm7 10 5 5 5-5', 'M4 19h16'],
  camera: ['M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z', 'M15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  flag: ['M6 21V4', 'M6 4h11l-2 4 2 4H6'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 7v5l3.5 2'],
}

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  /** Which icon to draw. */
  name: IconName
  /**
   * Rendered in a hidden text node so the icon carries its own accessible name.
   * When set, `aria-hidden` is omitted entirely — otherwise a screen reader
   * would read nothing where the label promises something.
   */
  label?: string
}

export function Icon({ name, label, ...rest }: IconProps) {
  const paths = PATHS[name]

  // A missing entry is a programming error, not a runtime case to silently
  // render as an empty box — but crashing a whole screen in a crisis app is
  // worse than an empty icon, so we render nothing and let the a11y tests catch
  // the regression through the label contract.
  if (!paths) return null

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(label ? { role: 'img' } : { 'aria-hidden': true })}
      {...rest}
    >
      {label ? <title>{label}</title> : null}
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
