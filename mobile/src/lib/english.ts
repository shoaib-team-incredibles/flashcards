import vocab from '@/data/english/vocab.json';

import { addCards, createDeck, getCards, getDeck, getDecks, updateCardTexts, updateDeck } from './db';
import { diffBundled, ENGLISH_META, type BundledCard } from './french-core';

export const ENGLISH_DECK = { ...ENGLISH_META, cards: vocab.cards as BundledCard[] };

/** The user's copy of the English deck: the fixed id, or a deck with the same name. */
export function findEnglishDeck() {
  return getDeck(ENGLISH_DECK.id) ?? getDecks().find((x) => x.name === ENGLISH_DECK.name);
}

/** How many cards an update would add or refresh, or null when the deck isn't installed. */
export function englishPending() {
  const deck = findEnglishDeck();
  if (!deck) return null;
  const { add, update } = diffBundled(ENGLISH_DECK.id, ENGLISH_DECK.cards, getCards(deck.id));
  return add.length + update.length;
}

/**
 * Creates the deck with all its cards — with the same ids as the web app, so sync merges them.
 * If it already exists, adds missing cards and refreshes corrected ones; progress is kept.
 */
export function installEnglishDeck() {
  const d = ENGLISH_DECK;
  const existing = findEnglishDeck();
  if (!existing) {
    const deck = createDeck({ id: d.id, name: d.name, description: d.description, color: d.color });
    const { add } = diffBundled(d.id, d.cards, []);
    addCards(deck.id, add);
    return { added: add.length, updated: 0 };
  }
  if (existing.description !== d.description) updateDeck(existing.id, { description: d.description });
  const { add, update } = diffBundled(d.id, d.cards, getCards(existing.id));
  if (add.length) addCards(existing.id, add);
  updateCardTexts(update);
  return { added: add.length, updated: update.length };
}
