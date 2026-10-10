/**
 * Assistant Orchestrator & Context Builder.
 *
 * Orchestration flow:
 *   Deterministic Intent (Tier 0)
 *     -> (Online Available ? Online API (Tier 1) : Offline Guidance (Tier 2))
 *     -> Fallback to Offline Guidance on any network/API failure
 *
 * Invariant: Always returns an Answer with a valid mode label.
 * Invariant: Numbers are strictly validated against contacts.json on every path.
 */
import { apiAssistantProvider } from './api'
import { offlineProvider } from './offline'
import { matchDeterministicIntent, sanitizeAllowedNumbers } from './router'
import type { Answer, AssistantContext, AssistantProvider } from './types'

export interface OrchestratorOptions {
  readonly onlineProvider?: AssistantProvider
  readonly offlineProvider?: AssistantProvider
}

export class AssistantOrchestrator {
  private readonly online: AssistantProvider
  private readonly offline: AssistantProvider

  constructor(options?: OrchestratorOptions) {
    this.online = options?.onlineProvider ?? apiAssistantProvider
    this.offline = options?.offlineProvider ?? offlineProvider
  }

  /**
   * Main entry point to query the assistant.
   */
  async ask(
    query: string,
    context: AssistantContext,
    signal?: AbortSignal,
  ): Promise<Answer> {
    const trimmed = query.trim()
    if (!trimmed) {
      return {
        mode: 'offline-guidance',
        severity: 'info',
        answer: 'Please type a question regarding weather safety, shelters, or first aid.',
        steps: [],
        sources: [],
        escalate: false,
        numbers: [],
      }
    }

    // 1. Tier 0: Deterministic intent matching
    try {
      const deterministicAnswer = await matchDeterministicIntent(trimmed, context)
      if (deterministicAnswer) {
        return deterministicAnswer
      }
    } catch {
      // If intent matching fails unexpectedly, continue to providers
    }

    // 2. Tier 1: Online AI (if available)
    try {
      const isOnlineAvailable = await this.online.available(context)
      if (isOnlineAvailable) {
        const answer = await this.online.ask(trimmed, context, signal)
        return {
          ...answer,
          numbers: sanitizeAllowedNumbers(answer.numbers),
        }
      }
    } catch {
      // Seamless fallthrough to offline guidance on any timeout, 5xx, or parse error
    }

    // 3. Tier 2: Offline on-device search & decision trees
    const offlineAnswer = await this.offline.ask(trimmed, context, signal)
    return {
      ...offlineAnswer,
      numbers: sanitizeAllowedNumbers(offlineAnswer.numbers),
    }
  }
}

export interface RawAlertInput {
  readonly id?: unknown
  readonly hazard?: unknown
  readonly level?: unknown
  readonly headline?: unknown
  readonly isDrill?: unknown
}

export interface RawRiskInput {
  readonly level?: unknown
  readonly label?: unknown
  readonly reason?: unknown
}

export interface RawPlaceInput {
  readonly id?: unknown
  readonly name?: unknown
  readonly type?: unknown
  readonly distanceMetres?: unknown
  readonly lat?: unknown
  readonly lon?: unknown
}

/**
 * Builds a clean, sanitized AssistantContext.
 * Guarantees NO personal data or Medical ID is attached.
 */
export function buildAssistantContext(input: {
  language?: string
  zoneId?: string
  connectivity?: 'live' | 'degraded' | 'cellular-only' | 'offline' | 'relay'
  effectiveAlerts?: readonly RawAlertInput[]
  riskSnapshot?: RawRiskInput
  userLocation?: { lat: number; lon: number }
  nearestShelters?: readonly RawPlaceInput[]
  nearestHospitals?: readonly RawPlaceInput[]
}): AssistantContext {
  return {
    language: input.language ?? 'en',
    zoneId: input.zoneId,
    connectivity: input.connectivity ?? 'offline',
    effectiveAlerts: input.effectiveAlerts?.map((a) => ({
      id: typeof a.id === 'string' ? a.id : '',
      hazard: typeof a.hazard === 'string' ? a.hazard : '',
      level: typeof a.level === 'number' ? a.level : null,
      headline: typeof a.headline === 'string' ? a.headline : '',
      isDrill: Boolean(a.isDrill),
    })),
    riskSnapshot: input.riskSnapshot
      ? {
          level: typeof input.riskSnapshot.level === 'number' ? input.riskSnapshot.level : 0,
          label: typeof input.riskSnapshot.label === 'string' ? input.riskSnapshot.label : 'Normal',
          reason: typeof input.riskSnapshot.reason === 'string' ? input.riskSnapshot.reason : undefined,
        }
      : undefined,
    userLocation: input.userLocation
      ? { lat: input.userLocation.lat, lon: input.userLocation.lon }
      : undefined,
    nearestShelters: input.nearestShelters?.map((s) => ({
      id: typeof s.id === 'string' ? s.id : '',
      name: typeof s.name === 'string' ? s.name : null,
      type: 'shelter_candidate',
      distanceMetres: typeof s.distanceMetres === 'number' ? s.distanceMetres : undefined,
      lat: typeof s.lat === 'number' ? s.lat : undefined,
      lon: typeof s.lon === 'number' ? s.lon : undefined,
    })),
    nearestHospitals: input.nearestHospitals?.map((h) => ({
      id: typeof h.id === 'string' ? h.id : '',
      name: typeof h.name === 'string' ? h.name : null,
      type: 'hospital',
      distanceMetres: typeof h.distanceMetres === 'number' ? h.distanceMetres : undefined,
      lat: typeof h.lat === 'number' ? h.lat : undefined,
      lon: typeof h.lon === 'number' ? h.lon : undefined,
    })),
  }
}

export const assistant = new AssistantOrchestrator()
