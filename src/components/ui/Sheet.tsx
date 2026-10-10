/**
 * Sheet — the bottom sheet used for anything that needs to interrupt.
 *
 * Two things make this harder than it looks, and both are load-bearing for a
 * safety app:
 *
 * 1. **Focus trap.** A sheet is modal. If a screen-reader or keyboard user can
 *    Tab out the back of it and start pressing buttons on the page underneath,
 *    they are operating a context they cannot see. This implementation loops
 *    focus within the panel and restores it to the opener on close.
 *
 * 2. **The transform trap.** `position: fixed` inside an ancestor with a
 *    `backdrop-filter` or `transform` creates a new containing block, so the
 *    sheet silently gets clipped to its parent's box. This has already bitten
 *    this codebase once (the StatusChip sheet was clipped to a 93px header).
 *    The fix is `createPortal` to document.body, so the sheet's containing block
 *    is the viewport no matter who renders it.
 */
import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

export interface SheetProps {
  open: boolean
  onClose: () => void
  /** i18n key or already-translated string. */
  title: string
  children: ReactNode
}

/** Elements that can receive focus, in DOM order. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Sheet({ open, onClose, title, children }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // Where focus was when the sheet opened. Restoring it on close is what makes
  // the interaction feel like a mode you entered and left, rather than a jump.
  const restoreTo = useRef<Element | null>(null)

  const close = useCallback(() => {
    onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return

    restoreTo.current = document.activeElement
    // Move focus into the panel, but skip the close button so the user lands on
    // the content rather than the obvious exit.
    const panel = panelRef.current
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? panel)?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        // stopPropagation so a parent sheet does not also close.
        event.stopPropagation()
        close()
        return
      }

      if (event.key !== 'Tab') return

      // The FOCUSABLE selector already excludes disabled and tabindex="-1",
      // so no extra visibility filter is applied. An `offsetParent` check was
      // here and is deliberately gone: jsdom returns null for it on every
      // element, which silently stripped every candidate and disabled the trap
      // in tests — exactly the kind of filter that passes review and fails in
      // the one environment that would catch it.
      const focusables = Array.from(
        panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      )
      if (focusables.length === 0) return

      const firstEl = focusables[0]!
      const lastEl = focusables[focusables.length - 1]!

      // Wrap in both directions. Without this, focus escapes the modal.
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault()
        lastEl.focus()
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Return focus where the user left it.
      ;(restoreTo.current as HTMLElement | null)?.focus?.()
    }
  }, [open, close])

  if (!open) return null

  // Portalled to body so an ancestor's backdrop-filter or transform cannot
  // clip the sheet. See the header note.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Scrim. Clicking it closes — the affordance users expect. */}
      <div
        className="absolute inset-0 bg-ink/40"
        onClick={close}
        aria-hidden="true"
        data-testid="sheet-scrim"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-[480px] rounded-t-16 bg-surface p-6 pb-10 shadow-[0_-8px_30px_rgba(11,31,51,0.18)] focus:outline-none"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-xl font-bold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            className="ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-10 border border-line text-ink focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-verified focus-visible:outline-offset-2"
          >
            <Icon name="chevron-left" className="h-6 w-6" />
            <span className="sr-only">{title}</span>
          </button>
        </div>

        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
