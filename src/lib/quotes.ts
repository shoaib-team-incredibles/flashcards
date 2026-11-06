/**
 * Your quotes, stored in IndexedDB and synced with the iOS app. Writes go
 * through Dexie, whose hooks queue them for sync like decks and cards.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Quote } from './db'
import { uid } from './utils'

export { fitsNotification, NOTIFICATION_MAX_CHARS, parseQuotes, type ParsedQuote } from './quote-parse'
export type { Quote } from './db'

/** All quotes, newest first. */
export function useQuotes() {
  return useLiveQuery(() => db.quotes.orderBy('createdAt').reverse().toArray(), [])
}

export async function addQuote(text: string, author: string) {
  const now = Date.now()
  const q: Quote = { id: uid(), text: text.trim(), author: author.trim(), createdAt: now, updatedAt: now }
  await db.quotes.add(q)
  return q
}

/** Add many quotes at once, skipping any whose text is already saved. Returns how many were added. */
export async function addQuotes(items: { text: string; author: string }[]) {
  const existing = await db.quotes.toArray()
  const seen = new Set(existing.map((q) => normalize(q.text)))
  const base = Date.now()
  const fresh: Quote[] = []
  // Newest first in the list, so give the first pasted quote the latest time.
  items.forEach((item, i) => {
    const text = item.text.trim()
    const key = normalize(text)
    if (!text || seen.has(key)) return
    seen.add(key)
    const t = base + (items.length - i)
    fresh.push({ id: uid(), text, author: item.author.trim(), createdAt: t, updatedAt: t })
  })
  if (fresh.length) await db.quotes.bulkAdd(fresh)
  return fresh.length
}

export async function updateQuote(id: string, text: string, author: string) {
  await db.quotes.update(id, { text: text.trim(), author: author.trim(), updatedAt: Date.now() })
}

export async function deleteQuote(id: string) {
  await db.quotes.delete(id)
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

/** "— Author", or empty when the quote has no author. */
export function byline(q: Pick<Quote, 'author'>) {
  return q.author ? `— ${q.author}` : ''
}

/** The same quote all day, a different one tomorrow; goes through every quote before repeating. */
export function quoteOfTheDay(quotes: Quote[], now = new Date()) {
  if (!quotes.length) return undefined
  // A fixed, shuffled-looking order (by a hash of the id) so days don't walk the list in the order you added them.
  const order = [...quotes].sort((a, b) => hash(a.id) - hash(b.id) || a.id.localeCompare(b.id))
  const day = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000)
  return order[day % order.length]
}

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
