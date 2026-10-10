import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi } from './render-ui'
import AidPage from '../src/pages/AidPage'
import { saveMedicalId, deleteAllMedicalId } from '../src/lib/medicalId'
import { __setDbForTests, KavachDb } from '../src/lib/db'

describe('FE-7: SOS & Aid Screen (/sos, /aid)', () => {
  beforeEach(async () => {
    localStorage.clear()
    const db = new KavachDb()
    __setDbForTests(db)
    await db.open()
    await deleteAllMedicalId()
    vi.clearAllMocks()
  })

  it('renders header, title, and honest description', () => {
    renderUi(<AidPage />)
    expect(screen.getByRole('heading', { level: 1, name: /sos/i })).toBeInTheDocument()
    expect(screen.getByText('Get help now')).toBeInTheDocument()
    expect(
      screen.getByText(/Calls and texts use your phone's mobile network. They work with no internet./i),
    ).toBeInTheDocument()
  })

  it('renders primary Call 112 button (72px danger) and Call 108 button with exact tel: hrefs', () => {
    renderUi(<AidPage />)

    const call112 = screen.getByTestId('sos-call-112-btn')
    expect(call112).toBeInTheDocument()
    expect(call112).toHaveAttribute('href', 'tel:112')
    expect(call112.tagName.toLowerCase()).toBe('a')
    expect(call112).toHaveTextContent('Call 112 (National Emergency)')

    const call108 = screen.getByTestId('sos-call-108-btn')
    expect(call108).toBeInTheDocument()
    expect(call108).toHaveAttribute('href', 'tel:108')
    expect(call108.tagName.toLowerCase()).toBe('a')
    expect(call108).toHaveTextContent('Call 108 (Ambulance)')
  })

  it('renders emergency SMS button and message preview', () => {
    renderUi(<AidPage />)

    const smsBtn = screen.getByTestId('sos-sms-contact-btn')
    expect(smsBtn).toBeInTheDocument()
    expect(smsBtn.tagName.toLowerCase()).toBe('a')
    const href = smsBtn.getAttribute('href') ?? ''
    expect(href.startsWith('sms:')).toBe(true)
    expect(href).toContain(encodeURIComponent('SOS from Kavach. I need help.'))

    const preview = screen.getByTestId('sos-preview-text')
    expect(preview).toBeInTheDocument()
    expect(preview).toHaveTextContent('SOS from Kavach. I need help.')

    // Disclaimer
    expect(
      screen.getByText(/Kavach cannot confirm that help is on its way. Stay in a safe position./i),
    ).toBeInTheDocument()
  })

  it('shows "Add an emergency contact in Me" banner when no contact is saved', () => {
    renderUi(<AidPage />)
    expect(screen.getByText('No emergency contact saved')).toBeInTheDocument()
    expect(screen.getByText('Add an emergency contact in Me')).toBeInTheDocument()
  })

  it('includes saved emergency contact and medical details in SMS payload', async () => {
    await saveMedicalId({
      bloodGroup: 'O+',
      allergies: ['Penicillin'],
      emergencyContacts: [{ name: 'Alex', phone: '+919876543210' }],
    })

    renderUi(<AidPage />)

    await waitFor(() => {
      const smsBtn = screen.getByTestId('sos-sms-contact-btn')
      const href = smsBtn.getAttribute('href') ?? ''
      expect(href).toContain('919876543210')
      expect(href).toContain(encodeURIComponent('Blood group: O+'))
      expect(href).toContain(encodeURIComponent('Allergies: Penicillin'))
    })
  })

  it('handles location display and coordinates copy button', async () => {
    const mockGeolocation = {
      watchPosition: vi
        .fn()
        .mockImplementation((success: (pos: GeolocationPosition) => void) => {
          success({
            coords: {
              latitude: 12.6208,
              longitude: 80.1944,
              accuracy: 15,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: Date.now(),
            toJSON: () => ({}),
          })
          return 1
        }),
      clearWatch: vi.fn(),
    }

    Object.defineProperty(navigator, 'geolocation', {
      value: mockGeolocation,
      configurable: true,
    })

    renderUi(<AidPage />)

    await waitFor(() => {
      expect(screen.getByTestId('sos-coords-display')).toHaveTextContent('12.62080, 80.19440')
      expect(screen.getByText(/Accuracy: ±15 m/i)).toBeInTheDocument()
    })

    // Copy coords button
    const copyBtn = screen.getByTestId('sos-copy-coords-btn')
    expect(copyBtn).toBeInTheDocument()

    // Test clicking copy
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    })

    fireEvent.click(copyBtn)
    expect(writeTextMock).toHaveBeenCalledWith('12.62080, 80.19440')
  })
})
