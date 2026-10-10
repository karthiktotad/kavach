import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderUi } from './render-ui'
import MePage from '../src/pages/MePage'
import { getMedicalId } from '../src/lib/medicalId'
import { __setDbForTests, KavachDb } from '../src/lib/db'

describe('FE-7: Medical ID & Settings Screen (/me)', () => {
  beforeEach(async () => {
    localStorage.clear()
    const db = new KavachDb()
    __setDbForTests(db)
    await db.open()
    await Promise.all(db.tables.map((t) => t.clear()))
    vi.clearAllMocks()
  })

  it('renders privacy banner and Medical ID form fields', () => {
    renderUi(<MePage />)
    expect(screen.getByRole('heading', { level: 1, name: /me & medical id/i })).toBeInTheDocument()
    expect(
      screen.getByText('Stored on this device only. Never uploaded or shared.'),
    ).toBeInTheDocument()

    expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Blood Group/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Allergies/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Medical Conditions/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Current Medications/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Emergency Contact Name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Emergency Contact Phone/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Embassy \/ Consulate Phone/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Organ Donor/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Additional Medical Notes/i)).toBeInTheDocument()
  })

  it('saves filled Medical ID fields strictly to local storage', async () => {
    // Spy on global fetch to ensure no network calls are ever made
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    renderUi(<MePage />)

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Alex Morgan' } })
    fireEvent.change(screen.getByLabelText(/Blood Group/i), { target: { value: 'O+' } })
    fireEvent.change(screen.getByLabelText(/Allergies/i), { target: { value: 'Penicillin, Peanuts' } })
    fireEvent.change(screen.getByLabelText(/Medical Conditions/i), { target: { value: 'Asthma' } })
    fireEvent.change(screen.getByLabelText(/Emergency Contact Name/i), { target: { value: 'Sarah' } })
    fireEvent.change(screen.getByLabelText(/Emergency Contact Phone/i), { target: { value: '+91 99999 88888' } })
    fireEvent.click(screen.getByLabelText(/Organ Donor/i))

    const saveBtn = screen.getByTestId('me-save-btn')
    fireEvent.click(saveBtn)

    await waitFor(async () => {
      const stored = await getMedicalId()
      expect(stored).not.toBeNull()
      expect(stored?.name).toBe('Alex Morgan')
      expect(stored?.bloodGroup).toBe('O+')
      expect(stored?.allergies).toEqual(['Penicillin', 'Peanuts'])
      expect(stored?.conditions).toEqual(['Asthma'])
      expect(stored?.organDonor).toBe(true)
      expect(stored?.emergencyContacts?.[0]?.phone).toBe('+91 99999 88888')
    })

    // Guarantee: Medical ID never triggers network requests
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('exports Medical ID to QR modal sheet with emergency lock screen summary', async () => {
    renderUi(<MePage />)

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Jane Doe' } })
    fireEvent.change(screen.getByLabelText(/Blood Group/i), { target: { value: 'B+' } })
    fireEvent.change(screen.getByLabelText(/Allergies/i), { target: { value: 'Aspirin' } })

    fireEvent.click(screen.getByTestId('me-save-btn'))

    await waitFor(async () => {
      const stored = await getMedicalId()
      expect(stored?.name).toBe('Jane Doe')
    })

    const exportBtn = screen.getByTestId('me-export-qr-btn')
    fireEvent.click(exportBtn)

    await waitFor(() => {
      expect(screen.getByText('Emergency Medical QR')).toBeInTheDocument()
      expect(screen.getByText('EMERGENCY MEDICAL ID')).toBeInTheDocument()
      expect(screen.getByText('Jane Doe')).toBeInTheDocument()
      expect(screen.getAllByText('B+').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Aspirin')).toBeInTheDocument()
    })
  })

  it('deletes all Medical ID data on confirmation', async () => {
    renderUi(<MePage />)

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'To Delete' } })
    fireEvent.click(screen.getByTestId('me-save-btn'))

    await waitFor(async () => {
      const stored = await getMedicalId()
      expect(stored?.name).toBe('To Delete')
    })

    // Click Delete All
    fireEvent.click(screen.getByTestId('me-delete-all-btn'))

    await waitFor(() => {
      expect(screen.getByText('Delete Medical ID?')).toBeInTheDocument()
    })

    // Confirm Delete
    fireEvent.click(screen.getByTestId('me-confirm-delete-btn'))

    await waitFor(async () => {
      const stored = await getMedicalId()
      expect(stored).toBeNull()
      expect(screen.getByLabelText<HTMLInputElement>(/Full Name/i).value).toBe('')
    })
  })

  it('renders offline AI toggle and checks WebGPU settings', async () => {
    renderUi(<MePage />)

    await waitFor(async () => {
      expect(screen.getByRole('heading', { name: /offline ai/i })).toBeInTheDocument()
      const toggle = screen.getByTestId('offline-ai-toggle')
      expect(toggle).toHaveAttribute('aria-checked', 'false')
    })

    const toggle = screen.getByTestId('offline-ai-toggle')
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Enable Offline AI' })).toBeInTheDocument()
      expect(screen.getByText('Download size warning')).toBeInTheDocument()
      expect(screen.getByTestId('confirm-enable-ai-btn')).toBeInTheDocument()
    })

    // Confirming enable
    fireEvent.click(screen.getByTestId('confirm-enable-ai-btn'))

    await waitFor(() => {
      expect(screen.getByText('Model ready on device')).toBeInTheDocument()
      expect(screen.getByTestId('offline-ai-delete-model-btn')).toBeInTheDocument()
    })

    // Delete model
    fireEvent.click(screen.getByTestId('offline-ai-delete-model-btn'))

    await waitFor(() => {
      expect(screen.getByText('Disabled (using on-device MiniSearch)')).toBeInTheDocument()
    })
  })
})
