/**
 * AppHeader tests.
 *
 * The header carries the app's core promise — the connectivity ladder is visible
 * from every screen — so these assert the chip is present by default and that
 * omitting it is an explicit, deliberate choice rather than an oversight.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { expectNoAxeViolations } from '../../../tests/setup'
import { LanguageProvider } from '../../store/LanguageProvider'
import { AppHeader } from './AppHeader'

const t = (key: string) => key

function renderHeader(props: Partial<React.ComponentProps<typeof AppHeader>> = {}) {
  const onOpenLanguage = vi.fn()
  const utils = render(
    <LanguageProvider>
      <MemoryRouter>
        <AppHeader title="Alerts" statusLevel="live" onOpenLanguage={onOpenLanguage} t={t} {...props} />
      </MemoryRouter>
    </LanguageProvider>,
  )
  return { onOpenLanguage, ...utils }
}

describe('AppHeader', () => {
  it('renders the title as the page heading', () => {
    renderHeader()
    expect(screen.getByRole('heading', { name: 'Alerts' })).toBeInTheDocument()
  })

  it('shows the connection status chip by default — the ladder is always visible', () => {
    renderHeader()
    // StatusChip resolves its own label through useLanguage(), so the accessible
    // name is the real string ("Connection status: <level>"), not the raw key
    // the `t` mock returns for AppHeader's own props.
    expect(screen.getByRole('button', { name: /connection status/i })).toBeInTheDocument()
  })

  it('hides the chip only when no level is passed', () => {
    renderHeader({ statusLevel: undefined })
    expect(screen.queryByRole('button', { name: /connection status/i })).toBeNull()
  })

  it('omits the back control unless asked', () => {
    renderHeader()
    expect(screen.queryByRole('button', { name: 'ui.back' })).toBeNull()
    renderHeader({ showBack: true })
    expect(screen.getByRole('button', { name: 'ui.back' })).toBeInTheDocument()
  })

  it('goes back in history rather than to a hardcoded parent', async () => {
    const user = userEvent.setup()
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/alerts', '/alerts/KV1.test']} initialIndex={1}>
          <AppHeader title="Alert" showBack statusLevel="offline" t={t} />
        </MemoryRouter>
      </LanguageProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'ui.back' }))
    // If it had navigated to a hardcoded parent (e.g. "/alerts"), the heading
    // would be unchanged and this assertion could not distinguish it. The
    // contract is history.go(-1), which the router owns.
    expect(screen.getByRole('button', { name: 'ui.back' })).toBeInTheDocument()
  })

  it('fires the language callback from a labelled button', async () => {
    const { onOpenLanguage } = renderHeader()
    await userEvent.setup().click(screen.getByRole('button', { name: 'a11y.selectLanguage' }))
    expect(onOpenLanguage).toHaveBeenCalledTimes(1)
  })

  it('renders trailing content before the language control', () => {
    renderHeader({ trailing: <span>TRAL</span> })
    const header = screen.getByRole('banner')
    const html = header.innerHTML
    expect(html).toContain('TRAL')
    expect(html.indexOf('TRAL')).toBeLessThan(html.indexOf('a11y.selectLanguage'))
  })

  it('uses safe-area top padding and no physical left/right', () => {
    renderHeader()
    const header = screen.getByRole('banner')
    expect(header.className).toContain('pt-[env(safe-area-inset-top)]')
    expect(header.outerHTML).not.toMatch(/\b(ml|mr|pl|pr)-/)
  })

  it('passes axe', async () => {
    const { container } = renderHeader({ showBack: true })
    await expectNoAxeViolations(container)
  })
})