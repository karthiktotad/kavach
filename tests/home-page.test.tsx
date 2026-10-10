import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../src/store/LanguageProvider'
import { HomePageView, type HomePageViewProps } from '../src/pages/HomePage'

function renderHome(props: HomePageViewProps) {
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <HomePageView {...props} />
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('HomePageView', () => {
  it('shows a loading skeleton while risk data is still arriving', () => {
    renderHome({ loading: true })

    expect(screen.getByRole('status', { name: /loading risk data/i })).toBeInTheDocument()
  })

  it('shows an honest empty risk state when the snapshot is missing', () => {
    renderHome({ risk: null, alert: null })

    expect(screen.getByText(/no risk data yet/i)).toBeInTheDocument()
  })

  it('flags stale risk snapshots after 30 minutes', () => {
    renderHome({
      risk: {
        level: 2,
        reason: 'Water is entering low-lying roads along the shoreline.',
        zoneId: 'Z-12',
        updatedAt: Date.now() - 31 * 60 * 1000,
      },
      alert: null,
    })

    expect(screen.getByText(/zone z-12/i)).toBeInTheDocument()
    expect(screen.getByText(/updated/i)).toBeInTheDocument()
  })

  it('renders drill alerts with the drill banner on top', () => {
    renderHome({
      risk: { level: 0, reason: 'No active hazard', zoneId: 'Z-3', updatedAt: Date.now() },
      alert: {
        id: 'D-FL-Z-3-2',
        hazard: 'FL',
        level: 2,
        zoneIds: ['Z-3'],
        isDrill: true,
        packetId: 'packet-1',
        issuedAt: Date.now() - 60_000,
        expiresAt: Date.now() + 300_000,
      },
    })

    expect(screen.getByText(/drill/i)).toBeInTheDocument()
    expect(screen.getAllByText(/fl/i).length).toBeGreaterThan(0)
  })

  it('shows the highest live alert in the action card', () => {
    renderHome({
      risk: { level: 3, reason: 'Storm surge expected', zoneId: 'Z-7', updatedAt: Date.now() },
      alert: {
        id: 'L-FL-Z-7-5',
        hazard: 'FL',
        level: 3,
        zoneIds: ['Z-7'],
        packetId: 'packet-2',
        isDrill: false,
        issuedAt: Date.now() - 30_000,
        expiresAt: Date.now() + 600_000,
      },
    })

    expect(screen.getAllByText(/fl/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/level 3/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open action card/i })).toHaveAttribute('href', '/a/packet-2')
  })

  it('renders a no-alert state without claiming safety', () => {
    renderHome({
      risk: { level: 0, reason: 'No active hazard', zoneId: 'Z-2', updatedAt: Date.now() },
      alert: null,
    })

    expect(screen.getByText(/no active alerts/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /i'm safe/i })).toBeInTheDocument()
  })

  it('renders all 6 quick action links connecting to their respective routes', () => {
    renderHome({ risk: null, alert: null })

    expect(screen.getByRole('link', { name: /nearest shelter/i })).toHaveAttribute('href', '/map')
    expect(screen.getByRole('link', { name: /sos/i })).toHaveAttribute('href', '/sos')
    expect(screen.getByRole('link', { name: /ask assistant/i })).toHaveAttribute('href', '/assist')
    expect(screen.getByRole('link', { name: /first aid/i })).toHaveAttribute('href', '/aid')
    expect(screen.getByRole('link', { name: /show a local/i })).toHaveAttribute('href', '/phrases')
    expect(screen.getByRole('link', { name: /check a message/i })).toHaveAttribute('href', '/scan')
  })
})
