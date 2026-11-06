/**
 * Cloud sync with the KnowDeck web app through Firebase. The engine lives in
 * sync-core.ts (shared with the web); this file adapts it to expo-sqlite.
 */
import { initializeApp } from 'firebase/app';
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { getDeck, insertReview, notify, onLocalChange, putCard, putDeck, sqlite, type Card, type Deck, type ReviewLog } from './db';
import { createSyncController, keyOf, parseReviewSyncId, reviewSyncId, type OutboxEntry, type SyncAdapter } from './sync-core';
import { firebaseConfig } from './firebase-config';
import { getQuote, putQuote, quotesChangedRemotely, type Quote } from './quotes';
import { uid } from './utils';

const app = initializeApp(firebaseConfig);
// Keep the signed-in user across launches in the app's SQLite key-value store.
const auth = initializeAuth(app, { persistence: getReactNativePersistence(Storage) });
const backend = { app, auth };

const getMeta = (key: string) => sqlite.getFirstSync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])?.value;
const setMeta = (key: string, value: string) => sqlite.runSync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);

function deviceId() {
  let id = getMeta('device');
  if (!id) {
    id = `ios-${uid()}`;
    setMeta('device', id);
  }
  return id;
}

type CardRow = Omit<Card, 'tags'> & { tags: string };

const adapter: SyncAdapter = {
  device: deviceId(),

  getOutbox: async () => sqlite.getAllSync<OutboxEntry>('SELECT key, kind, id, ts FROM outbox'),

  async readRecord(kind, id) {
    if (kind === 'deck') return getDeck(id) as unknown as Record<string, unknown> | undefined;
    if (kind === 'card') {
      const r = sqlite.getFirstSync<CardRow>('SELECT * FROM cards WHERE id = ?', [id]);
      if (!r) return undefined;
      let tags: string[] = [];
      try {
        tags = JSON.parse(r.tags);
      } catch {}
      return { ...r, tags } as unknown as Record<string, unknown>;
    }
    if (kind === 'review') {
      const { cardId, ts } = parseReviewSyncId(id);
      const r = sqlite.getFirstSync<ReviewLog>('SELECT * FROM reviews WHERE cardId = ? AND ts = ?', [cardId, ts]);
      if (!r) return undefined;
      const { id: _local, ...rest } = r;
      return rest as unknown as Record<string, unknown>;
    }
    if (kind === 'quote') return getQuote(id) as unknown as Record<string, unknown> | undefined;
    return undefined; // tests only exist on the web
  },

  async clearOutbox(pushed) {
    sqlite.withTransactionSync(() => {
      for (const e of pushed) sqlite.runSync('DELETE FROM outbox WHERE key = ? AND ts = ?', [e.key, e.ts]);
    });
  },

  async applyRemote(records) {
    sqlite.withTransactionSync(() => {
      for (const r of records) {
        if (r.kind === 'test') continue;
        const key = keyOf(r.kind, r.id);
        const mine = sqlite.getFirstSync<{ ts: number }>('SELECT ts FROM outbox WHERE key = ?', [key]);
        if (mine && mine.ts > r.updated_at) continue; // our newer edit wins; it is pushed next
        const data = r.deleted ? null : r.data;
        if (r.kind === 'deck') {
          if (data) putDeck(data as unknown as Deck);
          else sqlite.runSync('DELETE FROM decks WHERE id = ?', [r.id]);
        } else if (r.kind === 'card') {
          if (data) putCard({ ...(data as unknown as Card), tags: ((data as { tags?: string[] }).tags ?? []) });
          else sqlite.runSync('DELETE FROM cards WHERE id = ?', [r.id]);
        } else if (r.kind === 'quote') {
          if (data) putQuote(data as unknown as Quote);
          else sqlite.runSync('DELETE FROM quotes WHERE id = ?', [r.id]);
        } else {
          const { cardId, ts } = parseReviewSyncId(r.id);
          if (data) insertReview(data as unknown as ReviewLog);
          else sqlite.runSync('DELETE FROM reviews WHERE cardId = ? AND ts = ?', [cardId, ts]);
        }
        if (mine) sqlite.runSync('DELETE FROM outbox WHERE key = ?', [key]);
      }
    });
    notify();
    if (records.some((r) => r.kind === 'quote')) quotesChangedRemotely();
  },

  async enqueueAll() {
    sqlite.withTransactionSync(() => {
      const put = (kind: string, id: string, ts: number) =>
        sqlite.runSync('INSERT OR REPLACE INTO outbox (key, kind, id, ts) VALUES (?,?,?,?)', [`${kind}:${id}`, kind, id, ts]);
      sqlite.getAllSync<{ id: string; createdAt: number }>('SELECT id, createdAt FROM decks').forEach((d) => put('deck', d.id, d.createdAt));
      sqlite.getAllSync<{ id: string; updatedAt: number }>('SELECT id, updatedAt FROM cards').forEach((c) => put('card', c.id, c.updatedAt));
      sqlite
        .getAllSync<{ cardId: string; ts: number }>('SELECT cardId, ts FROM reviews')
        .forEach((r) => put('review', reviewSyncId(r.cardId, r.ts), r.ts));
      sqlite.getAllSync<{ id: string; updatedAt: number }>('SELECT id, updatedAt FROM quotes').forEach((q) => put('quote', q.id, q.updatedAt));
    });
  },

  getMeta: async (key) => getMeta(key),
  setMeta: async (key, value) => {
    setMeta(key, value);
  },
};

export const sync = createSyncController(backend, adapter);

sync.start();
onLocalChange(() => sync.schedule());
AppState.addEventListener('change', (state) => {
  if (state === 'active') sync.schedule(0);
});

export function useSyncStatus() {
  return useSyncExternalStore(sync.subscribe, sync.getStatus);
}
