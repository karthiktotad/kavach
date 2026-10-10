/**
 * Assistant contract and data types (AGENTS.md §2, docs/ASSISTANT_DECISION.md).
 */

export type Mode = 'online-ai' | 'offline-guidance' | 'on-device-ai'

export type AnswerSeverity = 'info' | 'caution' | 'serious'

export interface SourceRef {
  readonly id: string
  readonly title: string
}

export interface Answer {
  readonly mode: Mode
  readonly severity: AnswerSeverity
  readonly answer: string
  /** Imperative action steps, capped at 5 steps. */
  readonly steps: readonly string[]
  readonly sources: readonly SourceRef[]
  readonly escalate: boolean
  /** Only numbers strictly matching emergency numbers in contacts.json. */
  readonly numbers: readonly string[]
}

export interface AssistantPlaceSummary {
  readonly id: string
  readonly name: string | null
  readonly type: string
  readonly distanceMetres?: number
  readonly lat?: number
  readonly lon?: number
}

export interface AssistantAlertSummary {
  readonly id: string
  readonly hazard: string
  readonly level: number | null
  readonly headline: string
  readonly isDrill?: boolean
}

export interface AssistantContext {
  readonly language: string
  readonly zoneId?: string
  readonly connectivity: 'live' | 'degraded' | 'cellular-only' | 'offline' | 'relay'
  readonly effectiveAlerts?: readonly AssistantAlertSummary[]
  readonly riskSnapshot?: {
    readonly level: number
    readonly label: string
    readonly reason?: string
  }
  readonly userLocation?: {
    readonly lat: number
    readonly lon: number
  }
  readonly nearestShelters?: readonly AssistantPlaceSummary[]
  readonly nearestHospitals?: readonly AssistantPlaceSummary[]
}

export interface AssistantProvider {
  readonly id: string
  available(ctx: AssistantContext): Promise<boolean>
  ask(q: string, ctx: AssistantContext, signal?: AbortSignal): Promise<Answer>
}
