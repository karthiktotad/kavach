import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LanguageProvider } from '../src/store/LanguageProvider'
import PacketPage from '../src/pages/PacketPage'
import AlertsPage from '../src/pages/AlertsPage'

const { verifyAndStoreMock } = vi.hoisted(() => ({
  verifyAndStoreMock: vi.fn(),
}))

vi.mock('../src/lib/packetClient', () => ({
  verifyAndStore: verifyAndStoreMock,
}))

vi.mock('../src/lib/db', () => ({
  getDb: () => ({
    alerts: {
      orderBy: () => ({
        reverse: () => ({
          toArray: async () => [
            {
              id: 'alert-1',
              packetId: 'packet-a',
              hazard: 'FL',
              level: 3,
              zoneIds: ['Z1'],
              headline: 'Flood warning',
              steps: ['Move to higher ground'],
              issuedAt: Date.now() - 60_000,
              expiresAt: Date.now() + 60_000,
              isDrill: false,
              acknowledged: false,
              updatedAt: Date.now(),
            },
          ],
        }),
      }),
    },
    packets: {
      get: async () => ({ source: 'sms' }),
      toArray: async () => [{ id: 'packet-a', source: 'sms' }],
    },
  }),
}))

describe('alert detail and list pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a verified alert panel with the authority verdict', async () => {
    verifyAndStoreMock.mockResolvedValue({
      result: {
        ok: true,
        fields: {
          kid: 'k1',
          hazard: 'FL',
          level: 3,
          zones: ['Z1'],
          issuedMin: 1,
          expiresMin: 2,
          seq: 1,
          mode: 'L',
        },
        packet: 'packet.test',
        payload: 'payload.test',
        signature: 'sig.test',
        isDrill: false,
        issuedAt: Date.now(),
        expiresAt: Date.now() + 3_600_000,
      },
      rendered: {
        headline: 'Flood warning',
        steps: ['Move to higher ground', 'Avoid floodwater', 'Check official updates'],
        templateId: 'FL-3',
        hazardName: 'Flood',
        levelName: 'Level 3',
      },
    })

    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/a/packet.test']}>
          <Routes>
            <Route path="/a/:packet" element={<PacketPage />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>,
    )

    expect(await screen.findByText(/Verified by Authority/i)).toBeInTheDocument()
    expect(screen.getByText(/Checked on this phone. No internet needed./i)).toBeInTheDocument()
  })

  it('shows the effective alert list and keeps the alert state visible', async () => {
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={['/alerts']}>
          <Routes>
            <Route path="/alerts" element={<AlertsPage />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>,
    )

    expect(await screen.findByText(/FL/i)).toBeInTheDocument()
    expect(screen.getByText(/Level 3/i)).toBeInTheDocument()
    expect(screen.getByText(/Verified/i)).toBeInTheDocument()
  })
})
