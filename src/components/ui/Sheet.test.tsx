/**
 * Sheet tests. The focus trap and Esc are the behaviours worth testing —
 * escape and restore are easy to assert, and a broken trap is exactly the kind
 * of bug that only shows up when someone actually presses Tab.
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { it, expect, describe, vi } from 'vitest'
import { Sheet } from './Sheet'

function renderSheet(props: Partial<React.ComponentProps<typeof Sheet>> = {}) {
  const onClose = vi.fn()
  const utils = render(
    <Sheet open onClose={onClose} title="What works right now" closeLabel="Close" {...props}>
      <button type="button">First</button>
      <button type="button">Second</button>
    </Sheet>,
  )
  return { onClose, ...utils }
}

describe('Sheet', () => {
  it('renders a modal dialog with an accessible name', () => {
    renderSheet()
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
    expect(screen.getByRole('heading').textContent).toBe('What works right now')
  })

  it('closes on Escape', () => {
    const { onClose } = renderSheet()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the scrim is clicked', () => {
    const { onClose } = renderSheet()
    fireEvent.click(screen.getByTestId('sheet-scrim'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not let Tab escape the panel', () => {
    renderSheet()
    // The close button comes first in DOM order; the assertion is about
    // whatever genuinely is first and last, so query the panel rather than
    // assuming the test's own two buttons are the extremes.
    const panel = screen.getByRole('dialog')
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])'))
      .filter((el) => !el.hasAttribute('disabled'))
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!

    // Start on the last focusable; Tab must wrap to the first, not exit.
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    // Shift+Tab from the first must wrap to the last.
    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('renders into document.body so an ancestor cannot clip it', () => {
    // This is the trap that already bit this codebase: a parent with
    // `backdrop-filter` or `transform` silently becomes the containing block
    // for a fixed-position child, clipping the sheet to the header's box.
    const { container } = render(
      <div style={{ backdropFilter: 'blur(4px)', height: 93, overflow: 'hidden' }}>
        <Sheet open onClose={() => {}} title="Trapped?" closeLabel="Close">
          <p>content</p>
        </Sheet>
      </div>,
    )
    // The dialog must NOT be inside that ancestor.
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('renders nothing when closed', () => {
    render(
      <Sheet open={false} onClose={() => {}} title="x" closeLabel="Close">
        <p>nope</p>
      </Sheet>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
