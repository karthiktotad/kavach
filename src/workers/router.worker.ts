/**
 * Offline Router Web Worker (FE-5).
 *
 * Runs graph search in a background thread to prevent UI freezing during large graph traversals.
 */
import { computeOfflineRoute, type RouteRequest, type RouteResult } from '../lib/map/route'

export interface RouterWorkerMessage {
  readonly id: string
  readonly request: RouteRequest
}

export interface RouterWorkerResponse {
  readonly id: string
  readonly result?: RouteResult
  readonly error?: string
}

self.onmessage = (event: MessageEvent<RouterWorkerMessage>) => {
  const { id, request } = event.data
  try {
    const result = computeOfflineRoute(request)
    const response: RouterWorkerResponse = { id, result }
    self.postMessage(response)
  } catch (err) {
    const response: RouterWorkerResponse = {
      id,
      error: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(response)
  }
}
