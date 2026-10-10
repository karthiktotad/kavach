/**
 * Outbox behaviour: ordering, idempotency and backoff.
 *
 * These are the properties that decide whether a report a tourist filed from a
 * lift during a flood survives the network coming back.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KavachDb, __setDbForTests } from '../src/lib/db'
import { Outbox, backoffFor, uuid } from '../src/lib/outbox'

function freshDb(): KavachDb {
  const db = new KavachDb()
  __setDbForTests(db)
  return db
}

describe('outbox', () => {
  let outbox: Outbox

  beforeEach(async () => {
    const db = freshDb()
    await db.open()
    await Promise.all(db.tables.map((t) => t.clear()))
    outbox = new Outbox()
  })

  it('enqueues with a generated id and queued status', async () => {
    const row = await outbox.enqueue('report', { hazard: 'FL' })
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(row.status).toBe('queued')
    expect(row.attempts).toBe(0)
    expect(row.nextAttemptAt).toBeLessThanOrEqual(Date.now())
  })

  it('honours a caller-supplied id so a retry cannot duplicate', async () => {
    const id = uuid()
    await outbox.enqueue('report', { a: 1 }, { id })
    await outbox.enqueue('report', { a: 2 }, { id })

    const rows = await outbox.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.payload).toEqual({ a: 1 })
  })

  it('drains in creation-timestamp order, whatever order rows landed in', async () => {
    const sent: number[] = []
    outbox.register<number>('seq', async (payload) => {
      sent.push(payload)
    })

    // Insert with deliberately scrambled createdAt values, so insertion order
    // and creation order disagree. The drain must follow createdAt.
    const db = freshDb()
    const due = Date.now() - 1
    const rows = [
      { payload: 3, createdAt: 300 },
      { payload: 1, createdAt: 100 },
      { payload: 2, createdAt: 200 },
    ]
    for (const [i, r] of rows.entries()) {
      await db.outbox.put({
        id: `seed-${i}`,
        type: 'seq',
        payload: r.payload,
        status: 'queued',
        createdAt: r.createdAt,
        attempts: 0,
        nextAttemptAt: due,
        lastError: null,
      })
    }

    await outbox.flush()
    expect(sent).toEqual([1, 2, 3])
  })

  it('leaves items queued when no sender is registered for their type', async () => {
    await outbox.enqueue('report', { a: 1 })
    outbox.register('checkin', async () => undefined)

    await outbox.flush()
    const rows = await outbox.list()
    expect(rows[0]?.status).toBe('queued')
    expect(await outbox.pending()).toBe(1)
  })

  it('marks an item sent only after the sender resolves', async () => {
    // Held in a mutable box so the test can release the sender from outside.
    const gate: { release: () => void } = { release: () => undefined }
    outbox.register('slow', async () => {
      await new Promise<void>((r) => {
        gate.release = r
      })
    })

    await outbox.enqueue('slow', { a: 1 })
    const flushing = outbox.flush()
    // Let the drain reach the await inside the sender.
    await new Promise((r) => setTimeout(r, 5))
    expect((await outbox.list())[0]?.status).toBe('sending')

    gate.release()
    await flushing
    expect((await outbox.list())[0]?.status).toBe('sent')
  })

  it('backs off and retries a failing sender without losing the item', async () => {
    let attempts = 0
    outbox.register('flaky', async () => {
      attempts += 1
      if (attempts < 3) throw new Error('network down')
    })

    await outbox.enqueue('flaky', { a: 1 })
    await outbox.flush()
    expect((await outbox.list())[0]?.status).toBe('queued')
    expect((await outbox.list())[0]?.attempts).toBe(1)
    expect((await outbox.list())[0]?.lastError).toBe('network down')

    // Make it due again so the next flush picks it up.
    const db = freshDb()
    await db.outbox.update((await outbox.list())[0]!.id, { nextAttemptAt: Date.now() - 1 })
    await outbox.flush()
    expect((await outbox.list())[0]?.attempts).toBe(2)

    await db.outbox.update((await outbox.list())[0]!.id, { nextAttemptAt: Date.now() - 1 })
    await outbox.flush()
    expect((await outbox.list())[0]?.status).toBe('sent')
  })

  it('gives up after MAX_ATTEMPTS and marks the item failed', async () => {
    outbox.register('dead', async () => {
      throw new Error('rejected')
    })

    await outbox.enqueue('dead', { a: 1 })

    for (let i = 0; i < 5; i += 1) {
      const db = freshDb()
      const row = (await outbox.list())[0]!
      await db.outbox.update(row.id, { nextAttemptAt: Date.now() - 1 })
      await outbox.flush()
    }

    const row = (await outbox.list())[0]
    expect(row?.status).toBe('failed')
    expect(row?.attempts).toBe(5)
    // A failed item is no longer counted as pending work.
    expect(await outbox.pending()).toBe(0)
  })

  it('counts by status and clears only sent items', async () => {
    outbox.register('ok', async () => undefined)
    outbox.register('bad', async () => {
      throw new Error('nope')
    })

    await outbox.enqueue('ok', { a: 1 })
    await outbox.enqueue('bad', { b: 2 })
    await outbox.flush()

    // bad is queued-with-attempts, not sent, so clearSent must keep it.
    const cleared = await outbox.clearSent()
    expect(cleared).toBe(1)
    const remaining = await outbox.list()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.type).toBe('bad')
  })

  it('does not flush concurrently', async () => {
    let inFlight = 0
    let maxInFlight = 0
    outbox.register('slow', async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 10))
      inFlight -= 1
    })

    await outbox.enqueue('slow', { a: 1 })
    await Promise.all([outbox.flush(), outbox.flush(), outbox.flush()])
    // Two concurrent drains would double-send the same row.
    expect(maxInFlight).toBe(1)
    expect((await outbox.list())[0]?.status).toBe('sent')
  })

  it('skips items that are not yet due', async () => {
    const sender = vi.fn(async () => undefined)
    outbox.register('later', sender)

    await outbox.enqueue('later', { a: 1 }, { delayMs: 60_000 })
    await outbox.flush()
    expect(sender).not.toHaveBeenCalled()
  })

  it('uses increasing backoff, capped', () => {
    const first = backoffFor(1)
    const second = backoffFor(2)
    const third = backoffFor(3)
    expect(second).toBeGreaterThan(first)
    expect(third).toBeGreaterThan(second)
    // Capped, not unbounded.
    expect(backoffFor(99)).toBe(backoffFor(10))
  })

  it('generates distinct well-formed ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => uuid()))
    expect(ids.size).toBe(50)
    for (const id of ids)
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
