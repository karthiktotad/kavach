/**
 * BottomNav tests.
 *
 * The behaviour worth locking down is not "it renders five links" — it is that
 * the active destination is announced rather than merely coloured, and that the
 * bar uses logical properties so it mirrors under RTL without a second
 * stylesheet.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { renderUi } from '../../../tests/render-ui'
import { expectNoAxeViolations } from '../../../tests/setup'
import { LanguageProvider } from '../../store/LanguageProvider'
import { BottomNav, NAV_ITEMS } from './BottomNav'

const t = (key: string) => key

describe('BottomNav', () => {
  it('renders the five DESIGN_SPEC destinations in order', () => {
    renderUi(<BottomNav t={t} />)
    const nav = screen.getByRole('navigation', { name: 'a11y.navigation' })
    const links = nav.querySelectorAll('a')
    expect(links).toHaveLength(5)
    expect([...links].map((a) => a.textContent)).toEqual([
      'nav.home',
      'nav.alerts',
      'nav.map',
      'nav.assist',
      'nav.me',
    ])
  })

  it('marks the active destination with aria-current, not colour alone', () => {
    // Needs an explicit router seeded at a non-root route, so it renders
    // directly rather than through renderUi's wrapper (which seeds MemoryRouter
    // at "/" and accepts no initialEntries).
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/alerts']}>
          <BottomNav t={t} />
        </MemoryRouter>
      </LanguageProvider>,
    )
    const alerts = screen.getByRole('link', { name: 'nav.alerts' })
    // NavLink emits aria-current="page" for the active route.
    expect(alerts).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'nav.home' })).not.toHaveAttribute('aria-current')
  })

  it('gives every item an icon AND a visible label', () => {
    renderUi(<BottomNav t={t} />)
    for (const item of NAV_ITEMS) {
      const link = screen.getByRole('link', { name: item.labelKey })
      // Decorative svg: the label beside it carries the meaning, so the icon
      // must not be announced twice.
      expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      expect(link.textContent).toBe(item.labelKey)
    }
  })

  it('meets the 44px touch-target floor', () => {
    renderUi(<BottomNav t={t} />)
    for (const link of screen.getAllByRole('link')) {
      expect(link.className).toContain('min-h-[56px]')
    }
  })

  it('is a landmark with an accessible name, and passes axe', async () => {
    const { container } = renderUi(<BottomNav t={t} />)
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    await expectNoAxeViolations(container)
  })

  it('uses logical + safe-area properties so it mirrors and clears the home bar', () => {
    renderUi(<BottomNav t={t} />)
    const nav = screen.getByRole('navigation')
    // Safe-area inset — without it the bar sits under the iOS home indicator.
    expect(nav.className).toContain('pb-[env(safe-area-inset-bottom)]')
    // No physical left/right anywhere in the nav subtree.
    expect(nav.outerHTML).not.toMatch(/\b(ml|mr|pl|pr)-/)
  })

  it('accepts an overridden item list for the gallery', () => {
    renderUi(
      <BottomNav
        t={t}
        items={[
          { to: '/', labelKey: 'nav.home', icon: 'home', end: true },
          { to: '/aid', labelKey: 'nav.aid', icon: 'aid' },
        ]}
      />,
    )
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'nav.aid' })).toBeInTheDocument()
  })
})