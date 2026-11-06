import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { useSyncExternalStore } from 'react'
import { applyingRemote, db, onLocalChange, type Card, type Deck, type ReviewLog, type TestResult } from './db'
import { createSyncController, keyOf, parseReviewSyncId, reviewSyncId, type OutboxEntry, type SyncAdapter, type SyncKind } from './sync-core'
import { firebaseConfig } from './firebase-config'
import { uid } from './utils'

const app = initializeApp(firebaseConfig)
const backend = { app, auth: getAuth(app) }

function deviceId() {
  try {
    let id = localStorage.getItem('recall-device')
    if (!id) {
      id = `web-${uid()}`
      localStorage.setItem('recall-device', id)
    }
    return id
  } catch {
    return `web-${uid()}`
  }
}

async function findReview(cardId: string, ts: number) {
  return db.reviews.where('cardId').equals(cardId).filter((r) => r.ts === ts).first()
}

const adapter: SyncAdapter = {
  device: deviceId(),

  getOutbox: () => db.outbox.toArray(),

  async readRecord(kind, id) {
    if (kind === 'deck') return (await db.decks.get(id)) as unknown as Record<string, unknown> | undefined
    if (kind === 'card') return (await db.cards.get(id)) as unknown as Record<string, unknown> | undefined
    if (kind === 'test') return (await db.tests.get(id)) as unknown as Record<string, unknown> | undefined
    if (kind === 'quote') return undefined // quotes only exist on iOS for now
    const { cardId, ts } = parseReviewSyncId(id)
    const r = await findReview(cardId, ts)
    if (!r) return undefined
    const { id: _local, ...rest } = r
    return rest as unknown as Record<string, unknown>
  },

  async clearOutbox(pushed) {
    await db.transaction('rw', db.outbox, async () => {
      const now = await db.outbox.bulkGet(pushed.map((e) => e.key))
      const done = pushed.filter((e, i) => now[i]?.ts === e.ts).map((e) => e.key)
      await db.outbox.bulkDelete(done)
    })
  },

  async applyRemote(records) {
    const keys = records.map((r) => keyOf(r.kind, r.id))
    keys.forEach((k) => applyingRemote.add(k))
    try {
      await db.transaction('rw', [db.decks, db.cards, db.reviews, db.tests, db.outbox], async () => {
        const local = await db.outbox.bulkGet(keys)
        const applied: string[] = []
        for (let i = 0; i < records.length; i++) {
          const r = records[i]
          if (r.kind === 'quote') continue // quotes only exist on iOS for now
          const mine = local[i]
          if (mine && mine.ts > r.updated_at) continue // our newer edit wins; it gets pushed next
          const data = r.deleted ? null : r.data
          if (r.kind === 'deck') {
            if (data) await db.decks.put(data as unknown as Deck)
            else await db.decks.delete(r.id)
          } else if (r.kind === 'card') {
            if (data) await db.cards.put(data as unknown as Card)
            else await db.cards.delete(r.id)
          } else if (r.kind === 'test') {
            if (data) await db.tests.put(data as unknown as TestResult)
            else await db.tests.delete(r.id)
          } else {
            const { cardId, ts } = parseReviewSyncId(r.id)
            const existing = await findReview(cardId, ts)
            if (data && !existing) await db.reviews.add(data as unknown as ReviewLog)
            if (!data && existing?.id != null) await db.reviews.delete(existing.id)
          }
          if (mine) applied.push(mine.key)
        }
        await db.outbox.bulkDelete(applied)
      })
    } finally {
      keys.forEach((k) => applyingRemote.delete(k))
    }
  },

  async enqueueAll() {
    const [decks, cards, reviews, tests] = await Promise.all([db.decks.toArray(), db.cards.toArray(), db.reviews.toArray(), db.tests.toArray()])
    const entry = (kind: SyncKind, id: string, ts: number): OutboxEntry => ({ key: keyOf(kind, id), kind, id, ts })
    await db.outbox.bulkPut([
      ...decks.map((d) => entry('deck', d.id, d.createdAt)),
      ...cards.map((c) => entry('card', c.id, c.updatedAt ?? c.createdAt)),
      ...reviews.map((r) => entry('review', reviewSyncId(r.cardId, r.ts), r.ts)),
      ...tests.map((t) => entry('test', t.id, t.createdAt)),
    ])
  },

  getMeta: async (key) => (await db.meta.get(key))?.value,
  setMeta: async (key, value) => {
    await db.meta.put({ key, value })
  },
}

export const sync = createSyncController(backend, adapter)

{
  sync.start()
  onLocalChange(() => sync.schedule())
  window.addEventListener('focus', () => sync.schedule(0))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sync.schedule(0))
  window.addEventListener('online', () => sync.schedule(0))
}

export function useSyncStatus() {
  return useSyncExternalStore(sync.subscribe, sync.getStatus)
}
