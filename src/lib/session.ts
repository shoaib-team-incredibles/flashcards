import { db, deckOptions, type Card, type Deck, type ReviewLog } from './db'
import { schedule, type Rating } from './fsrs'
import { endOfDay, startOfDay } from './utils'

export const LEARN_AHEAD_MS = 20 * 60_000

export interface Counts {
  new: number
  learning: number
  review: number
  total: number
}

export interface DayDone {
  newDone: number
  reviewDone: number
}

/** How many new cards / reviews each deck already did today. */
export function doneTodayByDeck(reviewsToday: ReviewLog[]) {
  const map = new Map<string, DayDone>()
  for (const r of reviewsToday) {
    if (r.source !== 'study') continue
    const m = map.get(r.deckId) ?? { newDone: 0, reviewDone: 0 }
    if (r.prevState === 0) m.newDone++
    else if (r.prevState === 2) m.reviewDone++
    map.set(r.deckId, m)
  }
  return map
}

export interface DeckQueue {
  learning: Card[]
  review: Card[]
  fresh: Card[]
}

/** Cards due for study in one deck right now, honoring daily limits. */
export function deckQueue(deck: Deck, cards: Card[], done: DayDone | undefined, now = Date.now()): DeckQueue {
  const eod = endOfDay(now)
  const learning: Card[] = []
  const review: Card[] = []
  const fresh: Card[] = []
  for (const c of cards) {
    if (c.suspended || c.deckId !== deck.id) continue
    if (c.state === 1 || c.state === 3) {
      if (c.due <= eod) learning.push(c)
    } else if (c.state === 2) {
      if (c.due < eod) review.push(c)
    } else fresh.push(c)
  }
  learning.sort((a, b) => a.due - b.due)
  review.sort((a, b) => a.due - b.due)
  fresh.sort((a, b) => a.createdAt - b.createdAt)
  const newLeft = Math.max(0, deck.newPerDay - (done?.newDone ?? 0))
  const reviewLeft = Math.max(0, deck.reviewsPerDay - (done?.reviewDone ?? 0))
  return { learning, review: review.slice(0, reviewLeft), fresh: fresh.slice(0, newLeft) }
}

export function queueCounts(q: DeckQueue): Counts {
  return {
    new: q.fresh.length,
    learning: q.learning.length,
    review: q.review.length,
    total: q.fresh.length + q.learning.length + q.review.length,
  }
}

export function mergeQueues(qs: DeckQueue[]): DeckQueue {
  const out: DeckQueue = { learning: [], review: [], fresh: [] }
  for (const q of qs) {
    out.learning.push(...q.learning)
    out.review.push(...q.review)
    out.fresh.push(...q.fresh)
  }
  out.learning.sort((a, b) => a.due - b.due)
  out.review.sort((a, b) => a.due - b.due)
  return out
}

export async function loadStudyQueue(deckIds: string[] | null) {
  const decks = deckIds ? await db.decks.bulkGet(deckIds) : await db.decks.toArray()
  const valid = decks.filter(Boolean) as Deck[]
  const cards = deckIds
    ? await db.cards.where('deckId').anyOf(deckIds).toArray()
    : await db.cards.toArray()
  const today = await db.reviews.where('ts').aboveOrEqual(startOfDay()).toArray()
  const done = doneTodayByDeck(today)
  const byDeck = new Map<string, Card[]>()
  for (const c of cards) {
    const arr = byDeck.get(c.deckId) ?? []
    arr.push(c)
    byDeck.set(c.deckId, arr)
  }
  const queue = mergeQueues(valid.map((d) => deckQueue(d, byDeck.get(d.id) ?? [], done.get(d.id))))
  return { decks: valid, queue }
}

function shuffled<T>(items: T[]): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Shuffle review and new cards, or put them back in their usual order
 * (reviews by due date, new cards as added). Learning cards always stay in
 * due order: their short steps are timed, so shuffling them would break that.
 */
export function orderQueue(q: DeckQueue, shuffle: boolean): DeckQueue {
  if (shuffle) return { learning: q.learning, review: shuffled(q.review), fresh: shuffled(q.fresh) }
  return {
    learning: q.learning,
    review: [...q.review].sort((a, b) => a.due - b.due),
    fresh: [...q.fresh].sort((a, b) => a.createdAt - b.createdAt),
  }
}

const SHUFFLE_KEY = 'recall-shuffle-study'
export function getShuffleStudy() {
  try {
    return localStorage.getItem(SHUFFLE_KEY) === '1'
  } catch {
    return false
  }
}
export function setShuffleStudy(on: boolean) {
  try {
    localStorage.setItem(SHUFFLE_KEY, on ? '1' : '0')
  } catch {}
}

/** Save a rating: updates the card and writes a review log. Returns the log id for undo. */
export async function answerCard(card: Card, rating: Rating, deck: Deck | undefined, durationMs: number, source: 'study' | 'test' = 'study') {
  const now = Date.now()
  const next = schedule(card, rating, now, deckOptions(deck))
  const updated: Card = { ...card, ...next, updatedAt: now }
  let logId = 0
  await db.transaction('rw', db.cards, db.reviews, async () => {
    await db.cards.put(updated)
    logId = (await db.reviews.add({
      cardId: card.id,
      deckId: card.deckId,
      rating,
      prevState: card.state,
      ts: now,
      durationMs: Math.min(durationMs, 5 * 60_000),
      source,
    })) as number
  })
  return { updated, logId }
}

export async function undoAnswer(previous: Card, logId: number) {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    await db.cards.put(previous)
    await db.reviews.delete(logId)
  })
}

/** Day streak: consecutive days with at least one review, ending today or yesterday. */
export function computeStreak(reviewDays: Set<string>, dayKeyFn: (t: number) => string) {
  let streak = 0
  let t = Date.now()
  if (!reviewDays.has(dayKeyFn(t))) t -= 86_400_000
  while (reviewDays.has(dayKeyFn(t))) {
    streak++
    const d = new Date(t)
    d.setDate(d.getDate() - 1)
    t = d.getTime()
  }
  return streak
}
