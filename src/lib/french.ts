import expressions from '../../decks/french-expressions.json'
import grammar from '../../decks/french-grammar.json'
import vocab from '../../decks/french-vocab.json'
import guideSource from '../../decks/french-guide.md?raw'
import { addCards, createDeck, db, type Card } from './db'
import { diffDeck as diffCore, FRENCH_META, frenchDeckId, type BundledCard, type FrenchDeckMeta } from './french-core'

export type { BundledCard }

export interface FrenchDeck extends FrenchDeckMeta {
  cards: BundledCard[]
}

const CARDS: Record<FrenchDeckMeta['key'], BundledCard[]> = { vocab: vocab.cards, expressions: expressions.cards, grammar: grammar.cards }
export const FRENCH_DECKS: FrenchDeck[] = FRENCH_META.map((m) => ({ ...m, cards: CARDS[m.key] }))

/** The guide's Markdown, without its top-level title (the page renders its own). */
export const FRENCH_GUIDE = guideSource.replace(/^# .*\n+/, '')

export const diffDeck = (d: FrenchDeck, have: Pick<Card, 'id' | 'front' | 'back'>[]) => diffCore(d.key, d.cards, have)

/** The user's copy of a French deck: the fixed id, or (older installs) a deck with the same name. */
export async function findFrenchDeck(d: FrenchDeck) {
  return (await db.decks.get(frenchDeckId(d.key))) ?? (await db.decks.where('name').equals(d.name).first())
}

/**
 * Creates the deck with all its cards. If it already exists, adds the cards it is missing and
 * refreshes the text of corrected ones — review history and scheduling are kept.
 */
export async function installFrenchDeck(d: FrenchDeck) {
  return db.transaction('rw', db.decks, db.cards, async () => {
    const existing = await findFrenchDeck(d)
    if (!existing) {
      const deck = await createDeck({ id: frenchDeckId(d.key), name: d.name, description: d.description, color: d.color })
      const { add } = diffDeck(d, [])
      await addCards(deck.id, add)
      return { deck, added: add.length, updated: 0 }
    }
    if (existing.description !== d.description) await db.decks.update(existing.id, { description: d.description })
    const have = await db.cards.where('deckId').equals(existing.id).toArray()
    const { add, update } = diffDeck(d, have)
    if (add.length) await addCards(existing.id, add)
    const now = Date.now()
    for (const u of update) await db.cards.update(u.id, { front: u.front, back: u.back, updatedAt: now })
    return { deck: existing, added: add.length, updated: update.length }
  })
}
