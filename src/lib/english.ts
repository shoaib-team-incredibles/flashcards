import vocab from '../../decks/english-vocab.json'
import { addCards, createDeck, db, type Card } from './db'
import { diffBundled, ENGLISH_META, type BundledCard } from './french-core'

export const ENGLISH_DECK = { ...ENGLISH_META, cards: vocab.cards as BundledCard[] }

export const diffEnglish = (have: Pick<Card, 'id' | 'front' | 'back'>[]) => diffBundled(ENGLISH_DECK.id, ENGLISH_DECK.cards, have)

/** The user's copy of the English deck: the fixed id, or a deck with the same name. */
export async function findEnglishDeck() {
  return (await db.decks.get(ENGLISH_DECK.id)) ?? (await db.decks.where('name').equals(ENGLISH_DECK.name).first())
}

/**
 * Creates the deck with all its cards. If it already exists, adds the cards it is missing and
 * refreshes the text of corrected ones — review history and scheduling are kept.
 */
export async function installEnglishDeck() {
  const d = ENGLISH_DECK
  return db.transaction('rw', db.decks, db.cards, async () => {
    const existing = await findEnglishDeck()
    if (!existing) {
      const deck = await createDeck({ id: d.id, name: d.name, description: d.description, color: d.color })
      const { add } = diffEnglish([])
      await addCards(deck.id, add)
      return { deck, added: add.length, updated: 0 }
    }
    if (existing.description !== d.description) await db.decks.update(existing.id, { description: d.description })
    const have = await db.cards.where('deckId').equals(existing.id).toArray()
    const { add, update } = diffEnglish(have)
    if (add.length) await addCards(existing.id, add)
    const now = Date.now()
    for (const u of update) await db.cards.update(u.id, { front: u.front, back: u.back, updatedAt: now })
    return { deck: existing, added: add.length, updated: update.length }
  })
}
