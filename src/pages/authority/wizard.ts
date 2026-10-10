/**
 * Authority Alert Creation Wizard State Machine (FE-8).
 *
 * Steps:
 *  1. Hazard and Level
 *  2. Zones
 *  3. Review (Payload preview with placeholders & character estimate)
 *  4. Sign and Broadcast (Submitting to backend/Edge function)
 *
 * Safety Invariants:
 *  - Mode defaults to DRILL ('D'). Switching to LIVE ('L') requires explicit confirmation naming the exact zone count.
 *  - Double-submit lock prevents duplicate packets.
 *  - No optimistic success: transition to success occurs strictly after server response.
 *  - Cancel creates level 0 / AC packet with higher seq to supersede active warnings.
 */
import type { AlertLevel, HazardCode, PacketFields, PacketMode } from '../../../shared/packet'

export type WizardStep = 'hazard-level' | 'zones' | 'review' | 'sign-broadcast' | 'success'

export type WizardErrorCode =
  | 'INVALID_STEP_TRANSITION'
  | 'MISSING_HAZARD_OR_LEVEL'
  | 'NO_ZONES_SELECTED'
  | 'UNCONFIRMED_LIVE_MODE'
  | 'DOUBLE_SUBMIT_BLOCKED'
  | 'SIGNING_FAILED'

export interface WizardError {
  readonly code: WizardErrorCode
  readonly message: string
}

export interface WizardDraft {
  readonly hazard: HazardCode | null
  readonly level: AlertLevel | null
  readonly zones: readonly string[]
  readonly durationMinutes: number
  readonly mode: PacketMode
  readonly liveConfirmed: boolean
  readonly seq: number
}

export interface PayloadPreview {
  readonly preview: string
  readonly estimatedLength: number
  readonly maxSmsLength: number
}

export interface AuthorityWizardState {
  readonly step: WizardStep
  readonly draft: WizardDraft
  readonly isSubmitting: boolean
  readonly error: WizardError | null
  readonly signedPacket: string | null
}

const DEFAULT_DRAFT: WizardDraft = {
  hazard: null,
  level: null,
  zones: [],
  durationMinutes: 360, // 6 hours default
  mode: 'D', // Safe default: Drill
  liveConfirmed: false,
  seq: 1,
}

export class AuthorityWizard {
  private state: AuthorityWizardState
  private readonly listeners = new Set<(state: AuthorityWizardState) => void>()

  constructor(initialDraft?: Partial<WizardDraft>) {
    this.state = {
      step: 'hazard-level',
      draft: { ...DEFAULT_DRAFT, ...initialDraft },
      isSubmitting: false,
      error: null,
      signedPacket: null,
    }
  }

  getState(): AuthorityWizardState {
    return this.state
  }

  subscribe(listener: (state: AuthorityWizardState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  private update(patch: Partial<AuthorityWizardState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }

  // -------------------------------------------------------------------------
  // Step 1: Hazard & Level
  // -------------------------------------------------------------------------
  setHazardAndLevel(
    hazard: HazardCode,
    level: AlertLevel,
    durationMinutes = this.state.draft.durationMinutes,
  ): void {
    this.update({
      draft: {
        ...this.state.draft,
        hazard,
        level: hazard === 'AC' ? 0 : level,
        durationMinutes,
      },
      error: null,
    })
  }

  // -------------------------------------------------------------------------
  // Step 2: Zones
  // -------------------------------------------------------------------------
  setZones(zones: readonly string[]): void {
    const trimmed = zones.map((z) => z.trim()).filter(Boolean)
    this.update({
      draft: {
        ...this.state.draft,
        zones: trimmed,
        // Reset live confirmation if zones list changed
        liveConfirmed: this.state.draft.mode === 'L' ? false : this.state.draft.liveConfirmed,
      },
      error: null,
    })
  }

  // -------------------------------------------------------------------------
  // Mode Selection & Live Confirmation
  // -------------------------------------------------------------------------
  setMode(mode: PacketMode, confirmedZoneCount?: number): void {
    if (mode === 'L') {
      const zoneCount = this.state.draft.zones.length
      if (confirmedZoneCount === undefined || confirmedZoneCount !== zoneCount || zoneCount === 0) {
        this.update({
          draft: { ...this.state.draft, mode: 'L', liveConfirmed: false },
          error: {
            code: 'UNCONFIRMED_LIVE_MODE',
            message: `Switching to Live mode requires explicit confirmation naming all ${zoneCount} affected zone(s).`,
          },
        })
        return
      }
      this.update({
        draft: { ...this.state.draft, mode: 'L', liveConfirmed: true },
        error: null,
      })
    } else {
      this.update({
        draft: { ...this.state.draft, mode: 'D', liveConfirmed: false },
        error: null,
      })
    }
  }

  confirmLiveBroadcast(zoneCount: number): boolean {
    if (zoneCount === this.state.draft.zones.length && zoneCount > 0) {
      this.update({
        draft: { ...this.state.draft, mode: 'L', liveConfirmed: true },
        error: null,
      })
      return true
    }
    this.update({
      error: {
        code: 'UNCONFIRMED_LIVE_MODE',
        message: 'Live broadcast confirmation count mismatch.',
      },
    })
    return false
  }

  // -------------------------------------------------------------------------
  // Navigation Transitions
  // -------------------------------------------------------------------------
  goToStep(target: WizardStep): boolean {
    if (this.state.isSubmitting) {
      this.update({
        error: {
          code: 'DOUBLE_SUBMIT_BLOCKED',
          message: 'Cannot navigate while a signing operation is in progress.',
        },
      })
      return false
    }

    if (target === 'zones') {
      if (!this.state.draft.hazard || this.state.draft.level === null) {
        this.update({
          error: {
            code: 'MISSING_HAZARD_OR_LEVEL',
            message: 'Please select a valid hazard code and alert level.',
          },
        })
        return false
      }
    } else if (target === 'review' || target === 'sign-broadcast') {
      if (!this.state.draft.hazard || this.state.draft.level === null) {
        this.update({
          error: {
            code: 'MISSING_HAZARD_OR_LEVEL',
            message: 'Hazard and level must be specified.',
          },
        })
        return false
      }
      if (this.state.draft.zones.length === 0) {
        this.update({
          error: {
            code: 'NO_ZONES_SELECTED',
            message: 'At least one target zone must be selected.',
          },
        })
        return false
      }
      if (this.state.draft.mode === 'L' && !this.state.draft.liveConfirmed) {
        this.update({
          error: {
            code: 'UNCONFIRMED_LIVE_MODE',
            message: 'Live mode declaration requires explicit confirmation.',
          },
        })
        return false
      }
    }

    this.update({ step: target, error: null })
    return true
  }

  nextStep(): boolean {
    switch (this.state.step) {
      case 'hazard-level':
        return this.goToStep('zones')
      case 'zones':
        return this.goToStep('review')
      case 'review':
        return this.goToStep('sign-broadcast')
      default:
        return false
    }
  }

  prevStep(): boolean {
    if (this.state.isSubmitting || this.state.step === 'success') return false
    switch (this.state.step) {
      case 'zones':
        return this.goToStep('hazard-level')
      case 'review':
        return this.goToStep('zones')
      case 'sign-broadcast':
        return this.goToStep('review')
      default:
        return false
    }
  }

  // -------------------------------------------------------------------------
  // Payload Preview
  // -------------------------------------------------------------------------
  getPayloadPreview(kid = 'kavach-pilot-01'): PayloadPreview {
    const { hazard, level, zones, mode, seq } = this.state.draft
    const h = hazard ?? 'FL'
    const lvl = level ?? 1
    const z = zones.length > 0 ? zones.join('-') : 'Z1'
    const m = mode

    // Format: KV1.<kid>.<hazard>.<level>.<zones>.[issued].[expires].[seq].<mode>
    const preview = `KV1.${kid}.${h}.${lvl}.${z}.[issued].[expires].[${seq.toString(36)}].${m}`

    // Estimated full signed packet length (payload + '.' + 86 chars base64url signature)
    // Example: ~35 bytes payload + 87 bytes signature = ~122 characters
    const estimatedPayloadLen = preview.replace('[issued]', '123456').replace('[expires]', '123499').length
    const estimatedSignedLength = estimatedPayloadLen + 1 + 86

    return {
      preview,
      estimatedLength: estimatedSignedLength,
      maxSmsLength: 160,
    }
  }

  // -------------------------------------------------------------------------
  // Sign & Broadcast
  // -------------------------------------------------------------------------
  async signAndBroadcast(
    signer: (fields: PacketFields) => Promise<{ packet: string }>,
    kid = 'kavach-pilot-01',
  ): Promise<string> {
    if (this.state.isSubmitting) {
      throw new Error('Double submission blocked')
    }

    if (!this.state.draft.hazard || this.state.draft.level === null) {
      throw new Error('Hazard and level must be configured')
    }
    if (this.state.draft.zones.length === 0) {
      throw new Error('At least one zone must be selected')
    }
    if (this.state.draft.mode === 'L' && !this.state.draft.liveConfirmed) {
      throw new Error('Live broadcast unconfirmed')
    }

    this.update({ isSubmitting: true, error: null })

    const nowMin = Math.floor(Date.now() / 60000)
    const expiresMin = nowMin + this.state.draft.durationMinutes

    const fields: PacketFields = {
      kid,
      hazard: this.state.draft.hazard,
      level: this.state.draft.level,
      zones: this.state.draft.zones,
      issuedMin: nowMin,
      expiresMin,
      seq: this.state.draft.seq,
      mode: this.state.draft.mode,
    }

    try {
      const response = await signer(fields)
      if (!response.packet) {
        throw new Error('Server returned empty packet')
      }

      this.update({
        isSubmitting: false,
        signedPacket: response.packet,
        step: 'success',
        error: null,
      })

      return response.packet
    } catch (err) {
      const error: WizardError = {
        code: 'SIGNING_FAILED',
        message: err instanceof Error ? err.message : 'Alert signing and broadcasting failed',
      }
      this.update({
        isSubmitting: false,
        error,
      })
      throw err
    }
  }

  // -------------------------------------------------------------------------
  // Cancel / All-Clear Superseding Alert
  // -------------------------------------------------------------------------
  static createCancelDraft(prior: {
    hazard: HazardCode
    zones: readonly string[]
    seq: number
    mode?: PacketMode
  }): WizardDraft {
    return {
      hazard: 'AC',
      level: 0,
      zones: prior.zones,
      durationMinutes: 120,
      mode: prior.mode ?? 'D',
      liveConfirmed: false,
      seq: prior.seq + 1, // Higher sequence supersedes prior active warning
    }
  }
}
