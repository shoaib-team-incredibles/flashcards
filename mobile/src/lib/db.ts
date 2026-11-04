/**
 * Local-first storage on SQLite. Same data model as the KnowDeck web app (Dexie),
 * so JSON backups move freely between web and phone.
 *
 * Reads are synchronous (small data, no loading flashes); every write bumps a
 * version counter so `useQuery` hooks re-run.
 */
import * as SQLite from 'expo-sqlite';
import { useMemo, useSyncExternalStore } from 'react';

import { DEFAULT_OPTIONS, newSchedFields, type CardState, type Rating, type SchedFields, type SchedOptions } from './fsrs';
import { keyOf, reviewSyncId, type SyncKind } from './sync-core';
import { DECK_COLORS, uid } from './utils';

export interface Deck {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: number;
  newPerDay: number;
  reviewsPerDay: number;
  retention: number;
}

export interface Card extends SchedFields {
  id: string;
  deckId: string;
  front: string;
  back: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  suspended: 0 | 1;
}

export interface ReviewLog {
  id?: number;
  cardId: string;
  deckId: string;
  rating: Rating;
  prevState: CardState;
  ts: number;
  durationMs: number;
  source: 'study' | 'test';
}

export const sqlite = SQLite.openDatabaseSync('recall.db');

sqlite.execSync(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL, createdAt INTEGER NOT NULL, newPerDay INTEGER NOT NULL,
  reviewsPerDay INTEGER NOT NULL, retention REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY NOT NULL, deckId TEXT NOT NULL, front TEXT NOT NULL, back TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]', createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL,
  suspended INTEGER NOT NULL DEFAULT 0, state INTEGER NOT NULL, due INTEGER NOT NULL,
  stability REAL NOT NULL, difficulty REAL NOT NULL, reps INTEGER NOT NULL, lapses INTEGER NOT NULL,
  lastReview INTEGER, step INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cards_deck ON cards(deckId);
CREATE INDEX IF NOT EXISTS cards_due ON cards(due);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT, cardId TEXT NOT NULL, deckId TEXT NOT NULL,
  rating INTEGER NOT NULL, prevState INTEGER NOT NULL, ts INTEGER NOT NULL,
  durationMs INTEGER NOT NULL, source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reviews_ts ON reviews(ts);
CREATE INDEX IF NOT EXISTS reviews_card ON reviews(cardId);
CREATE TABLE IF NOT EXISTS outbox (key TEXT PRIMARY KEY NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
`);

// ---------- change notification ----------

let version = 0;
const listeners = new Set<() => void>();
export function notify() {
  version++;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useDbVersion() {
  return useSyncExternalStore(subscribe, () => version);
}

/** Re-runs `fn` whenever the database changes. */
export function useQuery<T>(fn: () => T, deps: unknown[] = []): T {
  'use no memo';
  const v = useDbVersion();
  const key = JSON.stringify(deps);
  // `fn` is re-created every render; re-run only when the DB or the declared deps change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => fn(), [v, key]);
}

// ---------- sync change tracking ----------

const localChangeListeners = new Set<() => void>();
/** Called after a local write that needs to be pushed to the cloud. */
export function onLocalChange(fn: () => void) {
  localChangeListeners.add(fn);
  return () => {
    localChangeListeners.delete(fn);
  };
}
let marked = false;

/** Queue a record for the next sync push. Call inside a write(). */
function mark(kind: SyncKind, id: string) {
  sqlite.runSync('INSERT OR REPLACE INTO outbox (key, kind, id, ts) VALUES (?,?,?,?)', [keyOf(kind, id), kind, id, Date.now()]);
  marked = true;
}
function markReviews(where: string, params: (string | number)[]) {
  for (const r of sqlite.getAllSync<{ cardId: string; ts: number }>(`SELECT cardId, ts FROM reviews WHERE ${where}`, params)) {
    mark('review', reviewSyncId(r.cardId, r.ts));
  }
}
function markAll() {
  getDecks().forEach((d) => mark('deck', d.id));
  sqlite.getAllSync<{ id: string }>('SELECT id FROM cards').forEach((c) => mark('card', c.id));
  markReviews('1', []);
}

function write<T>(fn: () => T): T {
  let out!: T;
  marked = false;
  sqlite.withTransactionSync(() => {
    out = fn();
  });
  notify();
  if (marked) localChangeListeners.forEach((l) => l());
  return out;
}

/** Add a review log unless the same one (card + timestamp) is already stored. */
export function insertReview(r: Omit<ReviewLog, 'id'>) {
  const dup = sqlite.getFirstSync('SELECT id FROM reviews WHERE cardId = ? AND ts = ?', [r.cardId, r.ts]);
  if (dup) return undefined;
  return sqlite.runSync(
    'INSERT INTO reviews (cardId, deckId, rating, prevState, ts, durationMs, source) VALUES (?,?,?,?,?,?,?)',
    [r.cardId, r.deckId, r.rating, r.prevState, r.ts, r.durationMs ?? 0, r.source ?? 'study'],
  ).lastInsertRowId;
}

// ---------- row mapping ----------

type CardRow = Omit<Card, 'tags'> & { tags: string };
const toCard = (r: CardRow): Card => ({ ...r, tags: safeJSON(r.tags) });
const safeJSON = (s: string): string[] => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

const CARD_COLS = 'id, deckId, front, back, tags, createdAt, updatedAt, suspended, state, due, stability, difficulty, reps, lapses, lastReview, step';
const cardParams = (c: Card) => [
  c.id, c.deckId, c.front, c.back, JSON.stringify(c.tags), c.createdAt, c.updatedAt, c.suspended,
  c.state, c.due, c.stability, c.difficulty, c.reps, c.lapses, c.lastReview, c.step,
];
export function putCard(c: Card) {
  sqlite.runSync(`INSERT OR REPLACE INTO cards (${CARD_COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, cardParams(c));
}
export function putDeck(d: Deck) {
  sqlite.runSync(
    'INSERT OR REPLACE INTO decks (id, name, description, color, createdAt, newPerDay, reviewsPerDay, retention) VALUES (?,?,?,?,?,?,?,?)',
    [d.id, d.name, d.description, d.color, d.createdAt, d.newPerDay, d.reviewsPerDay, d.retention],
  );
}

// ---------- reads ----------

export const getDecks = () => sqlite.getAllSync<Deck>('SELECT * FROM decks ORDER BY createdAt');
export const getDeck = (id: string) => sqlite.getFirstSync<Deck>('SELECT * FROM decks WHERE id = ?', [id]) ?? undefined;
export const getCards = (deckId?: string) =>
  (deckId
    ? sqlite.getAllSync<CardRow>('SELECT * FROM cards WHERE deckId = ? ORDER BY createdAt', [deckId])
    : sqlite.getAllSync<CardRow>('SELECT * FROM cards ORDER BY createdAt')
  ).map(toCard);
export const getCard = (id: string) => {
  const r = sqlite.getFirstSync<CardRow>('SELECT * FROM cards WHERE id = ?', [id]);
  return r ? toCard(r) : undefined;
};
export const getReviewsSince = (ts: number) => sqlite.getAllSync<ReviewLog>('SELECT * FROM reviews WHERE ts >= ? ORDER BY ts', [ts]);
export const getAllReviews = () => sqlite.getAllSync<ReviewLog>('SELECT * FROM reviews ORDER BY ts');
export const getCardReviews = (cardId: string) =>
  sqlite.getAllSync<ReviewLog>('SELECT * FROM reviews WHERE cardId = ? ORDER BY ts DESC', [cardId]);

export function searchCards(q: string, limit = 60) {
  const like = `%${q.replace(/[%_]/g, '')}%`;
  return sqlite
    .getAllSync<CardRow>('SELECT * FROM cards WHERE front LIKE ? OR back LIKE ? OR tags LIKE ? ORDER BY updatedAt DESC LIMIT ?', [like, like, like, limit])
    .map(toCard);
}

export function deckOptions(deck?: Deck): SchedOptions {
  return { ...DEFAULT_OPTIONS, retention: deck?.retention ?? DEFAULT_OPTIONS.retention };
}

// ---------- writes ----------

export function createDeck(input: Partial<Deck> & { name: string }) {
  const count = sqlite.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM decks')?.n ?? 0;
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
  };
  write(() => {
    putDeck(deck);
    mark('deck', deck.id);
  });
  return deck;
}

export function updateDeck(id: string, patch: Partial<Deck>) {
  const d = getDeck(id);
  if (!d) return;
  write(() => {
    putDeck({ ...d, ...patch, id });
    mark('deck', id);
  });
}

export function deleteDeck(id: string) {
  write(() => {
    mark('deck', id);
    sqlite.getAllSync<{ id: string }>('SELECT id FROM cards WHERE deckId = ?', [id]).forEach((c) => mark('card', c.id));
    markReviews('deckId = ?', [id]);
    sqlite.runSync('DELETE FROM cards WHERE deckId = ?', [id]);
    sqlite.runSync('DELETE FROM reviews WHERE deckId = ?', [id]);
    sqlite.runSync('DELETE FROM decks WHERE id = ?', [id]);
  });
}

export function makeCard(deckId: string, front: string, back: string, tags: string[] = []): Card {
  const now = Date.now();
  return { id: uid(), deckId, front: front.trim(), back: back.trim(), tags, createdAt: now, updatedAt: now, suspended: 0, ...newSchedFields(now) };
}

export function addCards(deckId: string, items: { front: string; back: string; tags?: string[]; id?: string }[]) {
  const cards = items.map((it, i) => {
    const c = makeCard(deckId, it.front, it.back, it.tags ?? []);
    if (it.id) c.id = it.id;
    c.createdAt += i; // keep import order stable for the "new" queue
    c.due += i;
    return c;
  });
  write(() =>
    cards.forEach((c) => {
      putCard(c);
      mark('card', c.id);
    }),
  );
  return cards;
}

/** Rewrites the text of several cards in one transaction, keeping their scheduling. */
export function updateCardTexts(updates: { id: string; front: string; back: string }[]) {
  if (!updates.length) return;
  const now = Date.now();
  write(() =>
    updates.forEach((u) => {
      const c = getCard(u.id);
      if (!c) return;
      putCard({ ...c, front: u.front, back: u.back, updatedAt: now });
      mark('card', u.id);
    }),
  );
}

export function saveCard(card: Card) {
  write(() => {
    putCard({ ...card, updatedAt: Date.now() });
    mark('card', card.id);
  });
}

export function updateCard(id: string, patch: Partial<Card>) {
  const c = getCard(id);
  if (c) saveCard({ ...c, ...patch });
}

export function deleteCard(id: string) {
  write(() => {
    mark('card', id);
    markReviews('cardId = ?', [id]);
    sqlite.runSync('DELETE FROM cards WHERE id = ?', [id]);
    sqlite.runSync('DELETE FROM reviews WHERE cardId = ?', [id]);
  });
}

export function resetCard(id: string) {
  updateCard(id, newSchedFields(Date.now()));
}

/** Store an answered card plus its review log atomically. Returns the log id (for undo). */
export function recordReview(updated: Card, log: Omit<ReviewLog, 'id'>) {
  return write(() => {
    putCard(updated);
    mark('card', updated.id);
    mark('review', reviewSyncId(log.cardId, log.ts));
    return insertReview(log) ?? 0;
  });
}

export function undoReview(previous: Card, logId: number) {
  write(() => {
    putCard(previous);
    mark('card', previous.id);
    markReviews('id = ?', [logId]);
    sqlite.runSync('DELETE FROM reviews WHERE id = ?', [logId]);
  });
}

// ---------- backup (same format as the web app) ----------

export interface Backup {
  app: 'recall';
  version: 1;
  exportedAt: number;
  decks: Deck[];
  cards: Card[];
  reviews: ReviewLog[];
  tests: unknown[];
}

export function exportBackup(): Backup {
  return { app: 'recall', version: 1, exportedAt: Date.now(), decks: getDecks(), cards: getCards(), reviews: getAllReviews(), tests: [] };
}

export function isBackup(x: unknown): x is Backup {
  return !!x && typeof x === 'object' && (x as Backup).app === 'recall' && Array.isArray((x as Backup).decks);
}

export function restoreBackup(b: Backup, mode: 'merge' | 'replace') {
  write(() => {
    if (mode === 'replace') {
      markAll();
      sqlite.execSync('DELETE FROM decks; DELETE FROM cards; DELETE FROM reviews;');
    }
    for (const d of b.decks) {
      putDeck(d);
      mark('deck', d.id);
    }
    for (const c of b.cards) {
      putCard({ ...newSchedFields(), ...c, tags: c.tags ?? [] });
      mark('card', c.id);
    }
    for (const r of b.reviews ?? []) {
      insertReview(r);
      mark('review', reviewSyncId(r.cardId, r.ts));
    }
  });
}

export function wipeAll() {
  write(() => {
    markAll();
    sqlite.execSync('DELETE FROM decks; DELETE FROM cards; DELETE FROM reviews;');
  });
}
