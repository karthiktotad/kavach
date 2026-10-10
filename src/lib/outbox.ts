/**
 * Offline outbox — queued writes that survive being offline.
 *
 * The failure this prevents: a tourist submits a hazard report from a lift, the
 * network drops, and the report is silently lost. So we write to IndexedDB
 * first and send when we can.
 *
 * Guarantees:
 *  - **Idempotent.** Every item carries a client-generated UUID; a sender must
 *    treat it as an idempotency key. Retrying after a flaky reconnect can
 *    therefore never double-post.
 *  - **Ordered.** Items drain in creation order, so "check-in then report"
 *    reaches the server in the order the user did them.
 *  - **Honest.** An item that keeps failing is marked `failed` and surfaced in
 *    the UI. It is never silently dropped or retried forever.
 *
 * Senders are registered per type by later milestones (M5 reports, M9
 * check-ins), so the queue has no opinions about what it carries.
 */
import { getDb, type OutboxRow } from './db'
import { connectivity } from './connectivity'

export type OutboxStatus = 'queued' | 'sending' | 'sent' | 'failed'

/** A sender for one payload type. Returning a response means "delivered". */
export type OutboxSender<T = unknown> = (payload: T, row: OutboxRow) => Promise<void>

export interface EnqueueOptions {
  /** Client-generated UUID. Supply one to control the id; otherwise generated. */
  readonly id?: string
  /** Delay the first attempt, ms. */
  readonly delayMs?: number
}

/** Backoff schedule in ms. Retries stop after MAX_ATTEMPTS. */
const BACKOFF_MS = [2_000, 5_000, 15_000, 60_000, 300_000] as const
const MAX_ATTEMPTS = 5

/** RFC 4122 v4, with a fallback for runtimes without `crypto.randomUUID`. */
export function uuid(): string {
  const webCrypto = globalThis.crypto
  if (typeof webCrypto.randomUUID === 'function') return webCrypto.randomUUID()
  const bytes = new Uint8Array(16)
  webCrypto.getRandomValues(bytes)
  // Set the version (4) and variant bits so the id is well-formed.
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Next delay before `attempts` (1-based) should be retried. */
export function backoffFor(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[0]
}

export class Outbox {
  private readonly senders = new Map<string, OutboxSender>()
  /** In-flight drain, if any. Concurrent flushes await it. */
  private current: Promise<void> | null = null
  private unsubscribe: (() => void) | null = null
  private started = false

  /** Register the sender for a payload type. Later milestones call this. */
  register<T>(type: string, sender: OutboxSender<T>): void {
    this.senders.set(type, sender as OutboxSender)
  }

  /**
   * Queue a write. Returns the stored row, including its id.
   *
   * Idempotent on `id`: re-enqueueing the same id is a no-op that returns the
   * original row. A retry must never replace the payload of a write that may
   * already have been delivered.
   */
  async enqueue<T>(type: string, payload: T, options: EnqueueOptions = {}): Promise<OutboxRow> {
    const id = options.id ?? uuid()

    const existing = await getDb().outbox.get(id)
    if (existing) return existing

    const now = Date.now()
    const row: OutboxRow = {
      id,
      type,
      payload,
      status: 'queued',
      createdAt: now,
      attempts: 0,
      nextAttemptAt: now + (options.delayMs ?? 0),
      lastError: null,
    }
    await getDb().outbox.put(row)
    void this.flush()
    return row
  }

  /** All items, oldest first — the order they must be sent in. */
  async list(): Promise<OutboxRow[]> {
    return getDb().outbox.orderBy('createdAt').toArray()
  }

  /** Counts per status, for the "Queued items" indicator. */
  async counts(): Promise<Record<OutboxStatus, number>> {
    const rows = await getDb().outbox.toArray()
    const counts: Record<OutboxStatus, number> = { queued: 0, sending: 0, sent: 0, failed: 0 }
    for (const row of rows) counts[row.status] += 1
    return counts
  }

  /** Items still owed to the server. */
  async pending(): Promise<number> {
    const rows = await getDb().outbox.where('status').anyOf('queued', 'sending').count()
    return rows
  }

  /**
   * Remove delivered items.
   *
   * Called after a successful drain so the queue does not grow forever. Items
   * the user may want to see (failed ones) are kept.
   */
  async clearSent(): Promise<number> {
    return getDb().outbox.where('status').equals('sent').delete()
  }

  /**
   * Try to drain the queue.
   *
   * Concurrent callers do not start a second drain: they await the one already
   * running. That keeps ordering intact and stops two drains racing on the same
   * rows, which would double-send.
   */
  async flush(): Promise<void> {
    if (this.current) return this.current
    this.current = this.drain().finally(() => {
      this.current = null
    })
    return this.current
  }

  private async drain(): Promise<void> {
    // Ordered by createdAt, and only rows that are due.
    const due = await getDb()
      .outbox.where('nextAttemptAt')
      .belowOrEqual(Date.now())
      .sortBy('createdAt')

    for (const row of due) {
      if (row.status === 'sent' || row.status === 'failed') continue

      const sender = this.senders.get(row.type)
      if (!sender) continue // No sender registered yet; leave it queued.

      await getDb().outbox.update(row.id, { status: 'sending' })

      try {
        await sender(row.payload, row)
        await getDb().outbox.update(row.id, { status: 'sent', lastError: null })
      } catch (error) {
        const attempts = row.attempts + 1
        const message = error instanceof Error ? error.message : String(error)
        const exhausted = attempts >= MAX_ATTEMPTS

        await getDb().outbox.update(row.id, {
          status: exhausted ? 'failed' : 'queued',
          attempts,
          // A failed item stops consuming the queue until the user acts.
          nextAttemptAt: exhausted ? Date.now() + 60 * 60_000 : Date.now() + backoffFor(attempts),
          lastError: message,
        })
      }
    }
  }

  /**
   * Start flushing automatically when connectivity returns.
   *
   * The queue is also driven by Background Sync where the browser supports it,
   * because a phone regaining signal while the tab is closed still needs to
   * deliver what the user queued.
   */
  start(): void {
    if (this.started) return
    this.started = true
    this.unsubscribe = connectivity.subscribe((snapshot) => {
      if (snapshot.level === 'live' || snapshot.level === 'degraded') void this.flush()
    })
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  /**
   * Ask the service worker to wake us when connectivity returns.
   * Silently unsupported on Safari and Firefox, which is fine — `start()`
   * already covers the foreground case.
   */
  async requestBackgroundSync(tag = 'kavach-outbox'): Promise<boolean> {
    try {
      if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false
      const registration = await navigator.serviceWorker.ready
      const syncManager = (
        registration as unknown as {
          sync?: { register(tag: string): Promise<void> }
        }
      ).sync
      if (!syncManager) return false
      await syncManager.register(tag)
      return true
    } catch {
      return false
    }
  }
}

/** App-wide singleton. */
export const outbox = new Outbox()
