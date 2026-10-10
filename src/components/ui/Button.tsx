/**
 * Button — the only button in the app.
 *
 * From docs/DESIGN_SPEC.md. The rules that are NOT visual:
 *
 *   - `as a` when `href` is set. A link must be a link: it must be focusable,
 *     middle-clickable, and openable in a new tab. A <button onclick> that
 *     calls location.assign is none of those, and a tourist on a dying
 *     connection may well try to long-press it.
 *   - Colour is never the only signal. Each variant also carries a border
 *     weight and a font weight, so a colour-blind user can still tell danger
 *     from primary.
 *   - Touch target: md=52, lg=60, xl=72 (SOS). Enforced by the class list, not
 *     by the caller remembering to add padding.
 *   - Loading and disabled set `aria-disabled` as well as the attribute, so the
 *     state is announced, and are removed from the tab order.
 */
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'drill'
export type ButtonSize = 'md' | 'lg' | 'xl'

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant
  /** md=52, lg=60, xl=72px. Use xl only for SOS. */
  size?: ButtonSize
  /** When set, renders an <a> instead of a <button>. */
  href?: string
  /** Shows a spinner and blocks further presses. */
  loading?: boolean
  /** Disabled. Prefer `loading` for in-flight work so the reason is visible. */
  disabled?: boolean
  /** Extra classes for one-off layout (margins, width). Never colours. */
  className?: string
  children: ReactNode
}
const VARIANTS: Record<ButtonVariant, string> = {
  // Filled = primary action. Blue is reserved for "verified / primary" per the
  // semantics table; nothing else may use it.
  primary: 'bg-verified text-white border border-verified font-bold',
  // Outlined = secondary. Note the visible border AND the different weight: two
  // signals beyond colour.
  secondary: 'bg-surface text-verified border-2 border-verified font-bold',
  // Dark red = danger/SOS. Also the only bold uppercase-leaning treatment.
  danger: 'bg-danger text-white border border-danger-dark font-bold',
  // Orange = drill, and drills must never look like a real action.
  drill: 'bg-drill-tint text-drill border-2 border-drill font-bold',
}

const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-[52px] px-5 text-base rounded-12',
  lg: 'min-h-[60px] px-6 text-lg rounded-14',
  xl: 'min-h-[72px] px-7 text-xl rounded-16',
}

/** Shared by <a> and <button> so focus and disabled behave identically. */
const BASE =
  'inline-flex items-center justify-center gap-2.5 text-center select-none ' +
  'transition-colors duration-150 ' +
  // Never removed. 3px ring, 2px offset, brand blue — rule 6.
  'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-verified focus-visible:outline-offset-2 ' +
  'disabled:opacity-60 disabled:cursor-not-allowed ' +
  'aria-disabled:opacity-60 aria-disabled:cursor-not-allowed ' +
  'motion-reduce:transition-none ' +
  '[&>svg]:shrink-0 [&>svg]:pointer-events-none'

/** Decorative spinner; the visible label carries the meaning. */
function Spinner() {
  return (
    <svg className="h-5 w-5 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.5} opacity={0.25} />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  href,
  loading = false,
  disabled = false,
  className = '',
  children,
  type,
  ...rest
}: ButtonProps) {
  const classes = `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim()
  const isDisabled = disabled || loading

  const inner = (
    <>
      {loading ? <Spinner /> : null}
      {children}
    </>
  )

  if (href !== undefined) {
    // A disabled link must stay reachable so it can explain itself, but must
    // not be tabbable or followable. The handler is stripped entirely rather
    // than wrapped, because this component spreads `...rest` AFTER it — a
    // wrapped handler here would be silently overwritten by the caller's.
    const { onClick: _ignoredClick, ...linkRest } = rest
    void _ignoredClick

    return (
      <a
        href={href}
        className={classes}
        aria-disabled={isDisabled || undefined}
        tabIndex={isDisabled ? -1 : 0}
        onClick={
          isDisabled
            ? (event) => {
                event.preventDefault()
              }
            : undefined
        }
        // `linkRest` is typed for a <button> but the props the two elements
        // actually share (id, data-*, aria-*, event handlers) are identical, so
        // this is a safe narrowing rather than a lie. Casting at the boundary
        // keeps the public API simple: one props interface, not a union the
        // caller has to discriminate.
        {...(linkRest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {inner}
      </a>
    )
  }

  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      {...rest}
    >
      {inner}
    </button>
  )
}
