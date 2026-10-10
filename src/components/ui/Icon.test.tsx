/**
 * Icon tests.
 *
 * The contract under test:
 *   1. Every name in ICON_NAMES renders — no gaps. The gallery route and the
 *      a11y matrix are driven from this list, so a hole here would silently
 *      ship an empty box.
 *   2. Unlabelled icons are hidden from screen readers (rule 6: no double read).
 *   3. Labelled icons expose their name via <title>, and are NOT aria-hidden —
 *      the two together would produce an unlabelled "image".
 *   4. Styling is inherited, never hardcoded: no width/height/fill defaults, so
 *      a caller's className or size attribute wins.
 */
import { render } from '@testing-library/react'
import { it, expect, describe } from 'vitest'
import { Icon, ICON_NAMES } from './Icon'

describe('Icon', () => {
  it('exposes a non-empty icon set', () => {
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(30)
    // No duplicates — a duplicated name would pass a length assertion.
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length)
  })

  it.each(ICON_NAMES)('renders the "%s" icon', (name) => {
    const { container } = render(<Icon name={name} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.getAttribute('stroke-width')).toBe('2')
    expect(svg!.getAttribute('stroke-linecap')).toBe('round')
    expect(svg!.getAttribute('stroke-linejoin')).toBe('round')
    // Every icon must have at least one path — an empty svg is a typo.
    expect(container.querySelectorAll('path').length).toBeGreaterThan(0)
  })

  it('hides unlabelled icons from assistive tech', () => {
    const { container } = render(<Icon name="warning" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelector('title')).toBeNull()
    expect(svg.getAttribute('role')).toBeNull()
  })

  it('gives a labelled icon an accessible name instead of hiding it', () => {
    const { container } = render(<Icon name="warning" label="Hazard warning" />)
    const svg = container.querySelector('svg')!
    // Not aria-hidden, or the title would never be read.
    expect(svg.getAttribute('aria-hidden')).toBeNull()
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.querySelector('title')!.textContent).toBe('Hazard warning')
  })

  it('inherits colour and size from the caller', () => {
    const { container } = render(
      <Icon name="pin" className="h-6 w-6 text-danger" data-testid="i" />,
    )
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('class')).toContain('h-6')
    // No hardcoded width/height attributes to fight the class.
    expect(svg.getAttribute('width')).toBeNull()
    expect(svg.getAttribute('height')).toBeNull()
    expect(svg.getAttribute('fill')).toBe('none')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
  })

  it('renders nothing for an unknown name rather than an empty box', () => {
    const { container } = render(<Icon name={'nope' as never} />)
    expect(container.querySelector('svg')).toBeNull()
  })
})
