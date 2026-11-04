import expressions from '@/data/french/expressions.json';
import grammar from '@/data/french/grammar.json';
import vocab from '@/data/french/vocab.json';

import { addCards, createDeck, getCards, getDeck, getDecks, updateCardTexts, updateDeck } from './db';
import { diffDeck, FRENCH_META, frenchDeckId, type BundledCard, type FrenchDeckMeta } from './french-core';

export { FRENCH_GUIDE } from '@/data/french/guide';

export interface FrenchDeck extends FrenchDeckMeta {
  cards: BundledCard[];
}

const CARDS: Record<FrenchDeckMeta['key'], BundledCard[]> = { vocab: vocab.cards, expressions: expressions.cards, grammar: grammar.cards };
export const FRENCH_DECKS: FrenchDeck[] = FRENCH_META.map((m) => ({ ...m, cards: CARDS[m.key] }));

/** The user's copy of a French deck: the fixed id, or (older installs) a deck with the same name. */
export function findFrenchDeck(d: FrenchDeck) {
  return getDeck(frenchDeckId(d.key)) ?? getDecks().find((x) => x.name === d.name);
}

/** How many cards would be added or refreshed by an update. */
export function pendingChanges(d: FrenchDeck) {
  const deck = findFrenchDeck(d);
  if (!deck) return null;
  const { add, update } = diffDeck(d.key, d.cards, getCards(deck.id));
  return add.length + update.length;
}

/**
 * Creates the deck with all its cards — with the same ids as the web app, so sync merges them.
 * If it already exists, adds missing cards and refreshes corrected ones; progress is kept.
 */
export function installFrenchDeck(d: FrenchDeck) {
  const existing = findFrenchDeck(d);
  if (!existing) {
    const deck = createDeck({ id: frenchDeckId(d.key), name: d.name, description: d.description, color: d.color });
    const { add } = diffDeck(d.key, d.cards, []);
    addCards(deck.id, add);
    return { added: add.length, updated: 0 };
  }
  if (existing.description !== d.description) updateDeck(existing.id, { description: d.description });
  const { add, update } = diffDeck(d.key, d.cards, getCards(existing.id));
  if (add.length) addCards(existing.id, add);
  updateCardTexts(update);
  return { added: add.length, updated: update.length };
}
