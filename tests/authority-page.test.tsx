import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import AuthorityPage from '../src/pages/AuthorityPage'
import { KavachDb, __setDbForTests } from '../src/lib/db'
import { LanguageProvider } from '../src/store/LanguageProvider'

describe('FE-8: Authority Console UI (/authority)', () => {
  beforeEach(async () => {
    localStorage.clear()
    const db = new KavachDb()
    __setDbForTests(db)
    await db.open()
    await Promise.all(db.tables.map((t) => t.clear()))
  })

  it('renders sign-in gate and allows Judge Demo Access with Drill-only badge', async () => {
    render(
      <LanguageProvider>
        <AuthorityPage />
      </LanguageProvider>,
    )

    expect(screen.getByText('Kavach Authority Console')).toBeInTheDocument()
    expect(screen.getByTestId('judge-demo-signin-btn')).toBeInTheDocument()

    // Click Demo Authority Login
    fireEvent.click(screen.getByTestId('judge-demo-signin-btn'))

    // Console shell should mount with header, sidebar, wizard, and aside
    expect(screen.getByTestId('authority-mode-chip')).toHaveTextContent('DRILL MODE')
    expect(screen.getByTestId('authority-nav-create')).toBeInTheDocument()
    expect(screen.getByTestId('authority-nav-active')).toBeInTheDocument()
    expect(screen.getByTestId('authority-nav-history')).toBeInTheDocument()
    expect(screen.getByTestId('step-hazard-level')).toBeInTheDocument()
  })

  it('allows sign-in via email and password form button', async () => {
    render(
      <LanguageProvider>
        <AuthorityPage />
      </LanguageProvider>,
    )

    // Type email & password
    const emailInput = screen.getByLabelText(/Authority Email/i)
    fireEvent.change(emailInput, { target: { value: 'cs24i1049@iiitdm.ac.in' } })
    const passInput = screen.getByLabelText(/Password/i)
    fireEvent.change(passInput, { target: { value: 'secretpass' } })

    // Click Sign In button
    fireEvent.click(screen.getByTestId('authority-login-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('authority-nav-create')).toBeInTheDocument()
    })
  })

  it('completes the 4-step wizard to issue a signed Drill alert for two zones and displays success QR and poster', async () => {
    render(
      <LanguageProvider>
        <AuthorityPage />
      </LanguageProvider>,
    )

    // Sign in via demo
    fireEvent.click(screen.getByTestId('judge-demo-signin-btn'))

    // Step 1: Select Flood (FL) and Warning (Level 3)
    fireEvent.click(screen.getByTestId('hazard-card-FL'))
    fireEvent.click(screen.getByTestId('level-card-3'))
    fireEvent.click(screen.getByTestId('wizard-next-btn'))

    // Step 2: Select Zones Z1 and Z2
    await waitFor(() => {
      expect(screen.getByTestId('step-zones')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('zone-checkbox-Z1'))
    fireEvent.click(screen.getByTestId('zone-checkbox-Z2'))
    fireEvent.click(screen.getByTestId('wizard-next-btn'))

    // Step 3: Review step
    await waitFor(() => {
      expect(screen.getByTestId('step-review')).toBeInTheDocument()
    })
    expect(screen.getByText('Packet Payload Preview')).toBeInTheDocument()
    expect(screen.getByText(/KV1\.k1\.FL\.3\.Z1-Z2/)).toBeInTheDocument()

    // Switch language preview tab to Tamil
    fireEvent.click(screen.getByTestId('lang-tab-ta'))

    // Proceed to Step 4
    fireEvent.click(screen.getByTestId('wizard-next-btn'))

    // Step 4: Sign and Broadcast
    await waitFor(() => {
      expect(screen.getByTestId('step-sign-broadcast')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('sign-and-broadcast-btn'))

    // Success Screen
    await waitFor(() => {
      expect(screen.getByTestId('step-success')).toBeInTheDocument()
    })
    expect(screen.getByText('Alert Signed & Broadcasted Successfully')).toBeInTheDocument()
    expect(screen.getByTestId('copy-packet-btn')).toBeInTheDocument()
    expect(screen.getByTestId('copy-link-btn')).toBeInTheDocument()
    expect(screen.getByTestId('print-poster-btn')).toBeInTheDocument()

    // Open Print QR Poster
    fireEvent.click(screen.getByTestId('print-poster-btn'))
    expect(screen.getByRole('heading', { name: 'Print QR Poster' })).toBeInTheDocument()
    expect(screen.getByTestId('poster-print-btn')).toBeInTheDocument()
  })

  it('shows newly issued alert in Active Alerts panel and cancels it with Level 0 / AC superseding packet', async () => {
    render(
      <LanguageProvider>
        <AuthorityPage />
      </LanguageProvider>,
    )

    // Sign in via demo
    fireEvent.click(screen.getByTestId('judge-demo-signin-btn'))

    // 1. Issue Cyclone alert for Z1
    fireEvent.click(screen.getByTestId('hazard-card-CY'))
    fireEvent.click(screen.getByTestId('level-card-3'))
    fireEvent.click(screen.getByTestId('wizard-next-btn'))

    await waitFor(() => expect(screen.getByTestId('step-zones')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('zone-checkbox-Z1'))
    fireEvent.click(screen.getByTestId('wizard-next-btn'))

    await waitFor(() => expect(screen.getByTestId('step-review')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('wizard-next-btn'))

    await waitFor(() => expect(screen.getByTestId('step-sign-broadcast')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('sign-and-broadcast-btn'))

    await waitFor(() => expect(screen.getByTestId('step-success')).toBeInTheDocument())

    // 2. Navigate to Active Alerts
    fireEvent.click(screen.getByTestId('authority-nav-active'))
    await waitFor(() => {
      expect(screen.getByTestId('active-alerts-panel')).toBeInTheDocument()
    })
    expect(screen.getByText('Active Official Warnings')).toBeInTheDocument()

    // Find Cancel Alert button
    const cancelBtn = screen.getByText(/Cancel Alert/i)
    expect(cancelBtn).toBeInTheDocument()
    fireEvent.click(cancelBtn)

    // 3. Cancelling opens the review step with All-Clear (Level 0 / AC)
    await waitFor(() => {
      expect(screen.getByTestId('step-review')).toBeInTheDocument()
    })
    expect(screen.getByText(/All-Clear/i)).toBeInTheDocument()
    expect(screen.getByText(/Level 0/i)).toBeInTheDocument()

    // Broadcast the All-Clear cancellation
    fireEvent.click(screen.getByTestId('wizard-next-btn'))
    await waitFor(() => expect(screen.getByTestId('step-sign-broadcast')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('sign-and-broadcast-btn'))

    await waitFor(() => expect(screen.getByTestId('step-success')).toBeInTheDocument())

    // 4. Return to Active Alerts — previous alert should be superseded
    fireEvent.click(screen.getByTestId('authority-nav-active'))
    await waitFor(() => {
      expect(screen.getByText('No Active Alerts')).toBeInTheDocument()
    })
  })

  it('supports Live mode with mandatory explicit zone count confirmation modal', async () => {
    render(
      <LanguageProvider>
        <AuthorityPage />
      </LanguageProvider>,
    )

    // Sign in via demo
    fireEvent.click(screen.getByTestId('judge-demo-signin-btn'))

    // Step 1: Hazard & Level
    fireEvent.click(screen.getByTestId('hazard-card-FL'))
    fireEvent.click(screen.getByTestId('level-card-2'))
    fireEvent.click(screen.getByTestId('wizard-next-btn'))

    // Step 2: Select 2 zones
    await waitFor(() => expect(screen.getByTestId('step-zones')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('zone-checkbox-Z1'))
    fireEvent.click(screen.getByTestId('zone-checkbox-Z3'))
    fireEvent.click(screen.getByTestId('wizard-next-btn'))

    // Step 3: Switch to Live mode -> triggers modal
    await waitFor(() => expect(screen.getByTestId('step-review')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('mode-segment-live'))

    await waitFor(() => {
      expect(screen.getByTestId('live-confirm-sheet')).toBeInTheDocument()
    })

    // Submitting wrong count fails
    fireEvent.change(screen.getByTestId('live-confirm-input'), { target: { value: '9' } })
    expect(screen.getByTestId('live-confirm-submit-btn')).toBeDisabled()

    // Submitting correct count (2) confirms Live mode
    fireEvent.change(screen.getByTestId('live-confirm-input'), { target: { value: '2' } })
    expect(screen.getByTestId('live-confirm-submit-btn')).not.toBeDisabled()
    fireEvent.click(screen.getByTestId('live-confirm-submit-btn'))

    // Modal closes and live mode is activated
    await waitFor(() => {
      expect(screen.queryByTestId('live-confirm-sheet')).not.toBeInTheDocument()
    })
  })

  it('pre-fills wizard when clicking Official Confirm on a community report', async () => {
    render(
      <LanguageProvider>
        <AuthorityPage />
      </LanguageProvider>,
    )

    // Sign in via demo
    fireEvent.click(screen.getByTestId('judge-demo-signin-btn'))

    // Find first community report confirm button
    const confirmBtn = screen.getByTestId('report-confirm-btn-rep-01')
    expect(confirmBtn).toBeInTheDocument()
    fireEvent.click(confirmBtn)

    // Wizard should now be focused with the report's hazard (FL) and zone (Z1)
    expect(screen.getByTestId('step-hazard-level')).toBeInTheDocument()
  })

  it('re-verifies issued packets in History panel completely offline', async () => {
    render(
      <LanguageProvider>
        <AuthorityPage />
      </LanguageProvider>,
    )

    // Sign in via demo
    fireEvent.click(screen.getByTestId('judge-demo-signin-btn'))

    // Issue an alert
    fireEvent.click(screen.getByTestId('hazard-card-FL'))
    fireEvent.click(screen.getByTestId('level-card-2'))
    fireEvent.click(screen.getByTestId('wizard-next-btn'))
    await waitFor(() => expect(screen.getByTestId('step-zones')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('zone-checkbox-Z1'))
    fireEvent.click(screen.getByTestId('wizard-next-btn'))
    await waitFor(() => expect(screen.getByTestId('step-review')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('wizard-next-btn'))
    await waitFor(() => expect(screen.getByTestId('step-sign-broadcast')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('sign-and-broadcast-btn'))
    await waitFor(() => expect(screen.getByTestId('step-success')).toBeInTheDocument())

    // Navigate to History panel
    fireEvent.click(screen.getByTestId('authority-nav-history'))
    await waitFor(() => {
      expect(screen.getByTestId('history-panel')).toBeInTheDocument()
    })

    // In-browser offline ECDSA verification badge should appear
    await waitFor(() => {
      expect(screen.getByText('ECDSA Verified (In-Browser)')).toBeInTheDocument()
    })
  })
})
