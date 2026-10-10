import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from '../src/app/App'
import { LanguageProvider } from '../src/store/LanguageProvider'
import { KavachDb, __setDbForTests, setSetting, SETTING } from '../src/lib/db'

/**
 * Renders the whole app (HashRouter + providers) and asserts the M1/M3 shell.
 *
 * The app gates on onboarding, so these cover both states: a first launch that
 * lands on Get Ready, and the shell once onboarding is done.
 */
function renderApp() {
  return render(
    <LanguageProvider>
      <App />
    </LanguageProvider>,
  )
}

describe('app shell', () => {
  let db: KavachDb | null = null

  beforeEach(async () => {
    // HashRouter reads window.location.hash, which is shared across tests in
    // jsdom. Without this, an earlier redirect to #/ready makes later tests
    // start there even after onboarding is marked complete.
    window.location.hash = ''
    // Clear tables rather than deleting the database: the app itself opens a
    // connection during render (AppHeader polls the outbox), and deleting an
    // IndexedDB that another connection still holds blocks until it closes.
    db?.close()
    __setDbForTests(null)
    db = new KavachDb()
    __setDbForTests(db)
    await db.open()
    await Promise.all(db.tables.map((table) => table.clear()))
  })

  afterEach(() => {
    cleanup()
    db?.close()
    __setDbForTests(null)
  })

  it('sends a first-time user to Get Ready', async () => {
    renderApp()
    // Onboarding is not complete, so /ready must be what renders.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /get kavach ready/i })).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: /download for offline use/i })).toBeInTheDocument()
  })

  it('renders the brand, status chip and language selector after onboarding', async () => {
    await setSetting(SETTING.ONBOARDED, true)
    renderApp()

    await waitFor(() => expect(screen.getByRole('link', { name: 'Kavach' })).toBeInTheDocument())
    // The chip is a button: tapping it explains what the level can do.
    expect(screen.getByRole('button', { name: /connection status/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/select language/i)).toBeInTheDocument()
  })

  it('renders all five bottom-nav destinations', async () => {
    await setSetting(SETTING.ONBOARDED, true)
    renderApp()

    await waitFor(() => {
      const nav = screen.getByRole('navigation', { name: /main navigation/i })
      for (const label of [/home/i, /alerts/i, /map/i, /assist/i, /me/i]) {
        expect(nav).toHaveTextContent(label)
      }
    })
  })

  it('mounts the home route with the offline promises', async () => {
    await setSetting(SETTING.ONBOARDED, true)
    renderApp()

    await waitFor(() => expect(screen.getByText(/signed alerts/i)).toBeInTheDocument())
    expect(screen.getByText(/relay mode/i)).toBeInTheDocument()
  })

  it('opens a sheet explaining what the current level can do', async () => {
    await setSetting(SETTING.ONBOARDED, true)
    renderApp()

    const chip = await screen.findByRole('button', { name: /connection status/i })
    expect(chip).toHaveAttribute('aria-haspopup', 'dialog')
  })
})
