/**
 * Online AI Provider (Tier 1).
 *
 * Calls the Supabase Edge Function `ai-proxy`.
 *
 * Strict invariants:
 *  1. 8-second hard timeout via AbortController.
 *  2. Zod validation of response schema.
 *  3. Client-side number sanitization against contacts.json (stripping hallucinated numbers).
 *  4. NEVER transmits Medical ID or personal identification data.
 *  5. Any failure/timeout immediately throws so the orchestrator falls back to offline guidance.
 */
import { z } from 'zod'
import { envConfig, isBackendConfigured } from '../../config/env'
import { packManager } from '../pack'
import { sanitizeAllowedNumbers } from './router'
import type { Answer, AssistantContext, AssistantProvider } from './types'

export const apiAnswerSchema = z.object({
  severity: z.enum(['info', 'caution', 'serious']).default('info'),
  answer: z.string().min(1),
  steps: z.array(z.string()).default([]),
  sources: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
      }),
    )
    .default([]),
  escalate: z.boolean().default(false),
  numbers: z.array(z.string()).default([]),
})

export type ApiAnswerPayload = z.infer<typeof apiAnswerSchema>

export const AI_PROXY_TIMEOUT_MS = 8000

export class ApiAssistantProvider implements AssistantProvider {
  readonly id = 'online-ai'
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  private readonly baseUrl: string

  constructor(options?: { timeoutMs?: number; fetchImpl?: typeof fetch; baseUrl?: string }) {
    this.timeoutMs = options?.timeoutMs ?? AI_PROXY_TIMEOUT_MS
    this.fetchImpl = options?.fetchImpl ?? ((...a) => fetch(...a))
    this.baseUrl = options?.baseUrl ?? envConfig.supabaseUrl ?? 'http://localhost:54321'
  }

  available(ctx: AssistantContext): Promise<boolean> {
    if (!isBackendConfigured || !envConfig.aiEnabled) return Promise.resolve(false)
    // Only available on live or degraded network
    return Promise.resolve(ctx.connectivity === 'live' || ctx.connectivity === 'degraded')
  }

  async ask(q: string, ctx: AssistantContext, signal?: AbortSignal): Promise<Answer> {
    const endpoint = `${this.baseUrl.replace(/\/$/, '')}/functions/v1/ai-proxy`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    // Forward external signal if provided
    if (signal) {
      signal.addEventListener('abort', () => controller.abort())
    }

    try {
      // Build sanitized context — ABSOLUTELY NO PERSONAL DATA OR MEDICAL ID
      const safeContext = {
        language: ctx.language,
        zoneId: ctx.zoneId,
        connectivity: ctx.connectivity,
        effectiveAlerts: ctx.effectiveAlerts,
        riskSnapshot: ctx.riskSnapshot,
        nearestShelters: ctx.nearestShelters?.slice(0, 3),
        nearestHospitals: ctx.nearestHospitals?.slice(0, 3),
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (envConfig.supabaseAnonKey) {
        headers['Authorization'] = `Bearer ${envConfig.supabaseAnonKey}`
        headers['apikey'] = envConfig.supabaseAnonKey
      }

      const response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question: q,
          context: safeContext,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`ai-proxy HTTP ${response.status}: ${response.statusText}`)
      }

      const rawJson: unknown = await response.json()
      const parsed = apiAnswerSchema.parse(rawJson)

      // Fetch official contacts to strip any hallucinated phone numbers
      let contacts = null
      try {
        contacts = await packManager.getContacts()
      } catch {
        // Fallback
      }

      const validNumbers = sanitizeAllowedNumbers(parsed.numbers, contacts)

      return {
        mode: 'online-ai',
        severity: parsed.severity,
        answer: parsed.answer,
        steps: parsed.steps.slice(0, 5),
        sources: parsed.sources,
        escalate: parsed.escalate,
        numbers: validNumbers,
      }
    } finally {
      clearTimeout(timer)
    }
  }
}

export const apiAssistantProvider = new ApiAssistantProvider()
