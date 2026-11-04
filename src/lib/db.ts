import Dexie, { type Table } from 'dexie'
import { DEFAULT_OPTIONS, newSchedFields, type CardState, type Rating, type SchedFields, type SchedOptions } from './fsrs'
import { keyOf, reviewSyncId, type OutboxEntry, type SyncKind } from './sync-core'
import { DECK_COLORS, uid } from './utils'

export interface Deck {
  id: string
  name: string
  description: string
  color: string
  createdAt: number
  newPerDay: number
  reviewsPerDay: number
  retention: number
}

export interface Card extends SchedFields {
  id: string
  deckId: string
  front: string
  back: string
  tags: string[]
  createdAt: number
  updatedAt: number
  suspended: 0 | 1
}

export interface ReviewLog {
  id?: number
  cardId: string
  deckId: string
  rating: Rating
  prevState: CardState
  ts: number
  durationMs: number
  source: 'study' | 'test'
}

export interface TestItemResult {
  cardId: string
  type: string
  prompt: string
  answer: string
  given: string
  correct: boolean
}

export interface TestResult {
  id: string
  createdAt: number
  deckIds: string[]
  total: number
  correct: number
  durationMs: number
  items: TestItemResult[]
}

class RecallDB extends Dexie {
  decks!: Table<Deck, string>
  cards!: Table<Card, string>
  reviews!: Table<ReviewLog, number>
  tests!: Table<TestResult, string>
  outbox!: Table<OutboxEntry, string>
  meta!: Table<{ key: string; value: string }, string>

  constructor() {
    super('recall')
    this.version(1).stores({
      decks: 'id, name, createdAt',
      cards: 'id, deckId, due, state, createdAt, *tags',
      reviews: '++id, cardId, deckId, ts',
      tests: 'id, createdAt',
    })
    this.version(2).stores({
      outbox: 'key',
      meta: 'key',
    })
  }
}

export const db = new RecallDB()

// ---------- change tracking for sync ----------

/** Keys being written by a remote apply; their hooks must not re-queue them. */
export const applyingRemote = new Set<string>()
const changeListeners = new Set<() => void>()
/** Called after any local change to synced data has been committed. */
export function onLocalChange(fn: () => void) {
  changeListeners.add(fn)
  return () => changeListeners.delete(fn)
}

const pending = new WeakMap<object, Map<string, OutboxEntry>>()

function track(kind: SyncKind, id: string, trans: { on: (ev: 'complete', fn: () => void) => void }) {
  const key = keyOf(kind, id)
  if (applyingRemote.has(key)) return
  let batch = pending.get(trans)
  if (!batch) {
    const b = new Map<string, OutboxEntry>()
    pending.set(trans, b)
    batch = b
    trans.on('complete', () => {
      void Dexie.ignoreTransaction(() => db.outbox.bulkPut([...b.values()])).then(() => changeListeners.forEach((l) => l()))
    })
  }
  batch.set(key, { key, kind, id, ts: Date.now() })
}

type Tx = Parameters<typeof track>[2]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function watch<T>(table: Table<T, any>, kind: SyncKind, idOf: (obj: T) => string) {
  table.hook('creating', function (_k, obj, trans) {
    track(kind, idOf(obj), trans as unknown as Tx)
  })
  table.hook('updating', function (_m, _k, obj, trans) {
    track(kind, idOf(obj), trans as unknown as Tx)
  })
  table.hook('deleting', function (_k, obj, trans) {
    track(kind, idOf(obj), trans as unknown as Tx)
  })
}
watch(db.decks, 'deck', (d) => d.id)
watch(db.cards, 'card', (c) => c.id)
watch(db.reviews, 'review', (r) => reviewSyncId(r.cardId, r.ts))
watch(db.tests, 'test', (t) => t.id)

export function deckOptions(deck?: Deck): SchedOptions {
  return { ...DEFAULT_OPTIONS, retention: deck?.retention ?? DEFAULT_OPTIONS.retention }
}

export async function createDeck(input: Partial<Deck> & { name: string }) {
  const count = await db.decks.count()
  const deck: Deck = {
    id: uid(),
    description: '',
    color: DECK_COLORS[count % DECK_COLORS.length],
    createdAt: Date.now(),
    newPerDay: 20,
    reviewsPerDay: 200,
    retention: 0.9,
    ...input,
    name: input.name.trim() || 'Untitled deck',
  }
  await db.decks.add(deck)
  return deck
}

export async function deleteDeck(id: string) {
  await db.transaction('rw', db.decks, db.cards, db.reviews, async () => {
    await db.cards.where('deckId').equals(id).delete()
    await db.reviews.where('deckId').equals(id).delete()
    await db.decks.delete(id)
  })
}

export function makeCard(deckId: string, front: string, back: string, tags: string[] = []): Card {
  const now = Date.now()
  return {
    id: uid(),
    deckId,
    front: front.trim(),
    back: back.trim(),
    tags,
    createdAt: now,
    updatedAt: now,
    suspended: 0,
    ...newSchedFields(now),
  }
}

export async function addCards(deckId: string, items: { front: string; back: string; tags?: string[]; id?: string }[]) {
  const cards = items.map((it, i) => {
    const c = makeCard(deckId, it.front, it.back, it.tags ?? [])
    if (it.id) c.id = it.id
    c.createdAt += i // keep import order stable for "new" queue
    c.due += i
    return c
  })
  await db.cards.bulkAdd(cards)
  return cards
}

export async function resetCards(ids: string[]) {
  const now = Date.now()
  await db.cards.where('id').anyOf(ids).modify((c: Card) => {
    Object.assign(c, newSchedFields(now), { updatedAt: now })
  })
}

// ---------- Backup ----------

export interface Backup {
  app: 'recall'
  version: 1
  exportedAt: number
  decks: Deck[]
  cards: Card[]
  reviews: ReviewLog[]
  tests: TestResult[]
}

export async function exportBackup(): Promise<Backup> {
  const [decks, cards, reviews, tests] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.reviews.toArray(),
    db.tests.toArray(),
  ])
  return { app: 'recall', version: 1, exportedAt: Date.now(), decks, cards, reviews, tests }
}

export function isBackup(x: unknown): x is Backup {
  return !!x && typeof x === 'object' && (x as Backup).app === 'recall' && Array.isArray((x as Backup).decks)
}

export async function restoreBackup(b: Backup, mode: 'merge' | 'replace') {
  await db.transaction('rw', db.decks, db.cards, db.reviews, db.tests, async () => {
    if (mode === 'replace') {
      await clearSynced()
    }
    await db.decks.bulkPut(b.decks)
    await db.cards.bulkPut(b.cards)
    await db.reviews.bulkPut(b.reviews.map(({ id: _id, ...r }) => (mode === 'replace' ? { ...r, id: _id } : r)))
    await db.tests.bulkPut(b.tests ?? [])
  })
}

// Collection.delete() (unlike Table.clear()) runs the deleting hooks, so erasures sync as tombstones.
function clearSynced() {
  return Promise.all([db.decks.toCollection().delete(), db.cards.toCollection().delete(), db.reviews.toCollection().delete(), db.tests.toCollection().delete()])
}

export async function wipeAll() {
  await db.transaction('rw', db.decks, db.cards, db.reviews, db.tests, clearSynced)
}
