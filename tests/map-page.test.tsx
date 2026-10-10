import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi } from './render-ui'
import MapPage from '../src/pages/MapPage'
import { KavachDb, __setDbForTests, getDb } from '../src/lib/db'
import { sha256Hex } from '../src/lib/pack'

// Load real pack fixtures
const placesRaw = readFileSync(resolve(__dirname, '../public/pack/places.json'), 'utf-8')
const roadsRaw = readFileSync(resolve(__dirname, '../public/pack/roads.json'), 'utf-8')
const zonesRaw = readFileSync(resolve(__dirname, '../public/pack/zones.geojson'), 'utf-8')

describe('FE-5: Map Screen (/map), Place Sheet, and Compass UI', () => {
  beforeEach(async () => {
    localStorage.clear()
    const db = new KavachDb()
    __setDbForTests(db)
    await db.open()
    await Promise.all(db.tables.map((t) => t.clear()))

    // Seed real pack files into fake-indexeddb
    await getDb().packFiles.bulkPut([
      {
        key: 'places.json',
        version: '0.2.0',
        data: placesRaw,
        bytes: placesRaw.length,
        sha256: await sha256Hex(placesRaw),
        fetchedAt: Date.now(),
      },
      {
        key: 'roads.json',
        version: '0.2.0',
        data: roadsRaw,
        bytes: roadsRaw.length,
        sha256: await sha256Hex(roadsRaw),
        fetchedAt: Date.now(),
      },
      {
        key: 'zones.geojson',
        version: '0.2.0',
        data: zonesRaw,
        bytes: zonesRaw.length,
        sha256: await sha256Hex(zonesRaw),
        fetchedAt: Date.now(),
      },
    ])

    vi.clearAllMocks()
  })

  it('renders offline vector map with header, legend, controls, and attribution', async () => {
    renderUi(<MapPage />)

    // Header & title
    expect(screen.getByRole('heading', { level: 1, name: /map & safe routes/i })).toBeInTheDocument()

    // Legend items
    expect(screen.getByText('Flagged by authority')).toBeInTheDocument()
    expect(screen.getByText('Unverified report')).toBeInTheDocument()

    // Control buttons
    expect(screen.getByTestId('map-layers-btn')).toBeInTheDocument()
    expect(screen.getByTestId('map-compass-btn')).toBeInTheDocument()
    expect(screen.getByTestId('map-zoom-in-btn')).toBeInTheDocument()
    expect(screen.getByTestId('map-zoom-out-btn')).toBeInTheDocument()
    expect(screen.getByTestId('map-view-toggle-btn')).toBeInTheDocument()

    // Mandatory OSM attribution
    expect(screen.getByText(/Map data © OpenStreetMap contributors/i)).toBeInTheDocument()
  })

  it('renders places on the map, and clicking a place marker opens the Place Sheet with honest guidance', async () => {
    renderUi(<MapPage />)

    // Wait for pack places to load
    await waitFor(() => {
      const markers = screen.getAllByTestId(/place-marker-/i)
      expect(markers.length).toBeGreaterThan(0)
    })

    const firstMarker = screen.getAllByTestId(/place-marker-/i)[0]!
    fireEvent.click(firstMarker)

    // Place Sheet assertions
    await waitFor(() => {
      expect(screen.getByTestId('place-sheet-content')).toBeInTheDocument()
      expect(
        screen.getByText(/The route avoids flagged areas. It cannot promise the way is safe./i),
      ).toBeInTheDocument()
      expect(screen.getByTestId('place-sheet-start-route-btn')).toBeInTheDocument()
      expect(screen.getByTestId('place-sheet-compass-btn')).toBeInTheDocument()
    })
  })

  it('computes an offline route avoiding hazard zones in under 1s and displays route details', async () => {
    renderUi(<MapPage />)

    await waitFor(() => {
      expect(screen.getAllByTestId(/place-marker-/i).length).toBeGreaterThan(0)
    })

    const firstMarker = screen.getAllByTestId(/place-marker-/i)[0]!
    fireEvent.click(firstMarker)

    const startRouteBtn = await screen.findByTestId('place-sheet-start-route-btn')
    const t0 = performance.now()
    fireEvent.click(startRouteBtn)
    const t1 = performance.now()

    // Route computation must be offline and sub-1s
    expect(t1 - t0).toBeLessThan(1000)

    // Floating route summary card
    await waitFor(() => {
      expect(screen.getByTestId('route-clear-btn')).toBeInTheDocument()
      expect(screen.getByTestId('route-compass-shortcut-btn')).toBeInTheDocument()
      expect(screen.getByText(/avoids flagged areas/i)).toBeInTheDocument()
    })
  })

  it('opens full-screen compass modal with rotating needle and deterministic guidance text', async () => {
    renderUi(<MapPage />)

    await waitFor(() => {
      expect(screen.getAllByTestId(/place-marker-/i).length).toBeGreaterThan(0)
    })

    const compassBtn = screen.getByTestId('map-compass-btn')
    fireEvent.click(compassBtn)

    await waitFor(() => {
      expect(screen.getByTestId('compass-modal-content')).toBeInTheDocument()
      expect(screen.getByTestId('compass-needle')).toBeInTheDocument()
      expect(screen.getByText(/Head roughly/i)).toBeInTheDocument()
      expect(
        screen.getByText(/Calibrate compass by rotating your phone in a figure 8./i),
      ).toBeInTheDocument()
    })
  })

  it('switches between map view and list fallback view with compass and route triggers', async () => {
    renderUi(<MapPage />)

    const viewToggleBtn = screen.getByTestId('map-view-toggle-btn')
    fireEvent.click(viewToggleBtn)

    // Switched to list view
    await waitFor(() => {
      expect(screen.getByText('Nearest shelters & medical centres')).toBeInTheDocument()
      const listRouteButtons = screen.getAllByTestId(/list-route-/i)
      expect(listRouteButtons.length).toBeGreaterThan(0)
    })

    // Clicking route in list view starts route and switches back to map
    const firstListRouteBtn = screen.getAllByTestId(/list-route-/i)[0]!
    fireEvent.click(firstListRouteBtn)

    await waitFor(() => {
      expect(screen.getByTestId('route-clear-btn')).toBeInTheDocument()
    })
  })

  it('handles GPS denial gracefully with manual start mode', async () => {
    // Mock navigator without geolocation
    Object.defineProperty(navigator, 'geolocation', {
      value: undefined,
      configurable: true,
      writable: true,
    })

    renderUi(<MapPage />)

    await waitFor(() => {
      expect(
        screen.getByText('GPS unavailable. Tap map or pick a starting point.'),
      ).toBeInTheDocument()
      expect(screen.getByTestId('map-pick-start-btn')).toBeInTheDocument()
    })
  })

  it('toggles map layers and low-power settings', async () => {
    renderUi(<MapPage />)

    const layersBtn = screen.getByTestId('map-layers-btn')
    fireEvent.click(layersBtn)

    await waitFor(() => {
      expect(screen.getByTestId('layers-sheet-content')).toBeInTheDocument()
      expect(screen.getByText('Road network')).toBeInTheDocument()
      expect(screen.getByText('Hazard zones')).toBeInTheDocument()
      expect(screen.getByText('Low-power mode')).toBeInTheDocument()
    })
  })
})
