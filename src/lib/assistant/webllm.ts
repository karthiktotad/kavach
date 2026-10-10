/**
 * WebLLM On-Device Provider (Tier 3 - Stub).
 *
 * Designed for optional, local client-side execution via WebGPU.
 * Default: disabled / not-implemented in initial phase to conserve bandwidth.
 *
 * Dynamic lazy import is supported so this does not inflate the bundle size.
 */
import type { Answer, AssistantContext, AssistantProvider } from './types'

export class WebLlmAssistantProvider implements AssistantProvider {
  readonly id = 'on-device-ai'

  available(_ctx: AssistantContext): Promise<boolean> {
    if (typeof navigator === 'undefined') return Promise.resolve(false)
    const hasGpu = Boolean('gpu' in navigator && (navigator as unknown as { gpu?: unknown }).gpu !== undefined)
    return Promise.resolve(hasGpu)
  }

  ask(_q: string, _ctx: AssistantContext, _signal?: AbortSignal): Promise<Answer> {
    return Promise.reject(new Error('WebLLM provider not implemented'))
  }
}

export const webLlmProvider = new WebLlmAssistantProvider()
