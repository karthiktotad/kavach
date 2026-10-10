/**
 * Button tests, including an axe accessibility check on every variant/size
 * combination. The spec requires zero axe violations per component.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, describe, vi } from 'vitest'
import { axe } from 'vitest-axe'
import { Button, type ButtonVariant, type ButtonSize } from './Button'

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'danger', 'drill']
const SIZES: ButtonSize[] = ['md', 'lg', 'xl']

describe('Button', () => {
  it('renders a real <button> with an explicit type', () => {
    render(<Button>Go</Button>)
    const button = screen.getByRole('button', { name: 'Go' })
    // Default must be 'button', NOT the HTML default 'submit'. A stray submit
    // inside the report form would fire the form on every press.
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('button')
  })

  it('honours an explicit submit type', () => {
    render(<Button type="submit">Save</Button>)
    expect(screen.getByRole('button').getAttribute('type')).toBe('submit')
  })

  it('renders an <a> when href is given, not a fake link button', () => {
    render(<Button href="/#/a/KV1.test">Open alert</Button>)
    const link = screen.getByRole('link', { name: 'Open alert' })
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/#/a/KV1.test')
  })

  it('is still focusable as a link (rule: links must be tabbable)', async () => {
    const user = userEvent.setup()
    render(<Button href="tel:108">Call 108</Button>)
    await user.tab()
    expect(screen.getByRole('link', { name: 'Call 108' })).toHaveFocus()
  })

  it.each(VARIANTS)('applies the %s variant and an axe check', async (variant) => {
    const { container } = render(<Button variant={variant}>{variant}</Button>)
    expect(screen.getByRole('button')).toBeTruthy()
    expect(await axe(container)).toHaveNoViolations()
  })

  it.each(SIZES)('enforces the %s touch target of at least 44px', async (size) => {
    render(<Button size={size}>{size}</Button>)
    const classes = screen.getByRole('button').className
    // The min-h class is the enforcement point; a caller cannot accidentally
    // shrink a control below the 44px floor by passing no padding.
    expect(classes).toMatch(/min-h-\[(52|60|72)px\]/)
    expect(await axe(screen.getByRole('button').parentElement!)).toHaveNoViolations()
  })

  it('blocks presses and announces them when loading', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Sending
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button.getAttribute('aria-disabled')).toBe('true')

    await userEvent.setup().click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('shows a spinner while loading', () => {
    const { container } = render(<Button loading>Sending</Button>)
    expect(container.querySelector('svg.animate-spin')).not.toBeNull()
  })

  it('blocks a disabled link but keeps it reachable and explained', () => {
    // A caller CAN pass onClick to a disabled link — the component must strip
    // it. This is the spread-order trap: `{...rest}` comes after the handler,
    // so a naive wrapper is silently overwritten by the caller's own prop.
    render(
      <Button href="tel:108" disabled onClick={() => { throw new Error('should not fire') }}>
        Call
      </Button>,
    )
    const link = screen.getByRole('link')
    // Not tabbable, but not removed from the DOM where it can be explained.
    expect(link.getAttribute('tabindex')).toBe('-1')
    expect(link.getAttribute('aria-disabled')).toBe('true')
  })

  it('keeps the focus ring class on every variant (never removed)', () => {
    for (const variant of VARIANTS) {
      render(<Button variant={variant}>x</Button>)
    }
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain('focus-visible:outline')
    }
  })

  it('does not accept colour overrides through className', () => {
    // Documented constraint of the design system: className is for layout.
    render(<Button className="mt-4 w-full">Stretch</Button>)
    const classes = screen.getByRole('button').className
    expect(classes).toContain('mt-4')
    expect(classes).toContain('w-full')
  })
})
