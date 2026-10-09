import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../src/app/App'
import { LanguageProvider } from '../src/store/LanguageProvider'

/**
 * Renders the whole app (HashRouter + providers) and asserts the M1 shell:
 * header chip, language selector, bottom nav, and a route actually mounting.
 */
function renderApp() {
  return render(
    <LanguageProvider>
      <App />
    </LanguageProvider>,
  )
}

describe('app shell', () => {
  it('renders the brand, status chip and language selector', async () => {
    renderApp()
    // Brand is a link home with an accessible name, not a heading.
    expect(await screen.findByRole('link', { name: 'Kavach' })).toBeInTheDocument()
    // The header chip and the Home status panel both expose role=status.
    const statuses = screen.getAllByRole('status', { name: /connection status/i })
    expect(statuses.length).toBeGreaterThan(0)
    // Language <select> labelled for assistive tech.
    expect(screen.getByLabelText(/select language/i)).toBeInTheDocument()
  })

  it('renders all five bottom-nav destinations', () => {
    renderApp()
    const nav = screen.getByRole('navigation', { name: /main navigation/i })
    for (const label of [/home/i, /alerts/i, /map/i, /assist/i, /aid/i]) {
      expect(nav).toHaveTextContent(label)
    }
  })

  it('mounts the home route with the offline promises', async () => {
    renderApp()
    expect(await screen.findByText(/signed alerts/i)).toBeInTheDocument()
    expect(screen.getByText(/relay mode/i)).toBeInTheDocument()
  })
})
