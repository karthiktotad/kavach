import { describe, expect, it, vi } from 'vitest'
import { AuthorityWizard } from '../src/pages/authority/wizard'
import type { PacketFields } from '../shared/packet'

describe('Authority Alert Wizard State Machine (FE-8)', () => {
  it('initializes in hazard-level step with safe Drill default mode', () => {
    const wizard = new AuthorityWizard()
    const state = wizard.getState()

    expect(state.step).toBe('hazard-level')
    expect(state.draft.mode).toBe('D')
    expect(state.draft.liveConfirmed).toBe(false)
    expect(state.isSubmitting).toBe(false)
    expect(state.error).toBeNull()
  })

  it('rejects invalid transitions when required fields are missing', () => {
    const wizard = new AuthorityWizard()

    // Cannot jump to review without hazard & zones
    expect(wizard.goToStep('review')).toBe(false)
    expect(wizard.getState().error?.code).toBe('MISSING_HAZARD_OR_LEVEL')

    wizard.setHazardAndLevel('FL', 3)
    expect(wizard.goToStep('zones')).toBe(true)

    // Cannot jump to review without selecting at least one zone
    expect(wizard.goToStep('review')).toBe(false)
    expect(wizard.getState().error?.code).toBe('NO_ZONES_SELECTED')
  })

  it('progresses smoothly through valid steps in Drill mode', () => {
    const wizard = new AuthorityWizard()
    wizard.setHazardAndLevel('CY', 4, 480)
    expect(wizard.nextStep()).toBe(true)
    expect(wizard.getState().step).toBe('zones')

    wizard.setZones(['Z1', 'Z2', 'Z3'])
    expect(wizard.nextStep()).toBe(true)
    expect(wizard.getState().step).toBe('review')

    expect(wizard.nextStep()).toBe(true)
    expect(wizard.getState().step).toBe('sign-broadcast')
  })

  it('requires explicit confirmation naming zone count when switching to Live mode', () => {
    const wizard = new AuthorityWizard()
    wizard.setHazardAndLevel('FL', 3)
    wizard.setZones(['Z1', 'Z2'])

    // Switching to 'L' without providing exact count fails
    wizard.setMode('L')
    expect(wizard.getState().draft.liveConfirmed).toBe(false)
    expect(wizard.goToStep('review')).toBe(false)
    expect(wizard.getState().error?.code).toBe('UNCONFIRMED_LIVE_MODE')

    // Confirming with wrong count fails
    expect(wizard.confirmLiveBroadcast(5)).toBe(false)

    // Confirming with correct count succeeds
    expect(wizard.confirmLiveBroadcast(2)).toBe(true)
    expect(wizard.getState().draft.liveConfirmed).toBe(true)
    expect(wizard.goToStep('review')).toBe(true)
    expect(wizard.getState().step).toBe('review')
  })

  it('generates accurate payload preview with placeholders and length estimate under 160 chars', () => {
    const wizard = new AuthorityWizard()
    wizard.setHazardAndLevel('CY', 3)
    wizard.setZones(['Z1', 'Z2'])

    const preview = wizard.getPayloadPreview('kavach-pilot-01')
    expect(preview.preview).toBe('KV1.kavach-pilot-01.CY.3.Z1-Z2.[issued].[expires].[1].D')
    expect(preview.estimatedLength).toBeLessThanOrEqual(160)
    expect(preview.maxSmsLength).toBe(160)
  })

  it('locks against double-submission and does not optimistically succeed on network error', async () => {
    const wizard = new AuthorityWizard()
    wizard.setHazardAndLevel('FL', 2)
    wizard.setZones(['Z1'])
    wizard.goToStep('sign-broadcast')

    const mockSigner = vi.fn(async (_fields: PacketFields) => {
      // Simulate slow server response
      await new Promise((r) => setTimeout(r, 50))
      throw new Error('Supabase Edge Function 500: signing key unavailable')
    })

    const signPromise = wizard.signAndBroadcast(mockSigner)

    // Immediately attempting second submit throws
    await expect(wizard.signAndBroadcast(mockSigner)).rejects.toThrow('Double submission blocked')

    // First promise fails with network/signing error
    await expect(signPromise).rejects.toThrow('signing key unavailable')

    // State remains in non-success error state
    expect(wizard.getState().step).toBe('sign-broadcast')
    expect(wizard.getState().signedPacket).toBeNull()
    expect(wizard.getState().error?.code).toBe('SIGNING_FAILED')
  })

  it('transitions to success only after server signs the packet', async () => {
    const wizard = new AuthorityWizard()
    wizard.setHazardAndLevel('WN', 2)
    wizard.setZones(['Z4'])
    wizard.goToStep('sign-broadcast')

    const mockSigner = vi.fn(async (_fields: PacketFields) => ({
      packet: 'KV1.kavach-pilot-01.WN.2.Z4.35xyz.35abc.1.D.mock_signature_bytes_here',
    }))

    const result = await wizard.signAndBroadcast(mockSigner)

    expect(result).toContain('mock_signature_bytes')
    expect(wizard.getState().step).toBe('success')
    expect(wizard.getState().signedPacket).toBe(result)
    expect(wizard.getState().isSubmitting).toBe(false)
  })

  it('creates cancel draft with hazard AC, level 0, and higher sequence number', () => {
    const cancelDraft = AuthorityWizard.createCancelDraft({
      hazard: 'CY',
      zones: ['Z1', 'Z2'],
      seq: 3,
      mode: 'D',
    })

    expect(cancelDraft.hazard).toBe('AC')
    expect(cancelDraft.level).toBe(0)
    expect(cancelDraft.zones).toEqual(['Z1', 'Z2'])
    expect(cancelDraft.seq).toBe(4) // Higher seq supersedes previous warning
  })
})
