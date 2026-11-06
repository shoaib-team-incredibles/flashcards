/**
 * Your own quotes, stored on this device in the same SQLite database as decks.
 * Every write calls `notify()` so `useQuery` screens refresh, then reschedules
 * the daily quote notification so it always draws from the current list.
 */
import { markForSync, notify, sqlite } from './db';
import { uid } from './utils';

export { fitsNotification, NOTIFICATION_MAX_CHARS, parseQuotes } from './quote-parse';

export interface Quote {
  id: string;
  text: string;
  author: string;
  createdAt: number;
  updatedAt: number;
}

sqlite.execSync(`
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY NOT NULL, text TEXT NOT NULL, author TEXT NOT NULL DEFAULT '',
  createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL
);
`);

const changeListeners = new Set<() => void>();
/** Runs after any quote is added, edited or deleted. */
export function onQuotesChange(fn: () => void) {
  changeListeners.add(fn);
  return () => {
    changeListeners.delete(fn);
  };
}

/** A local edit: refresh screens, reschedule notifications and queue the quotes for sync. */
function changed(...ids: string[]) {
  ids.forEach((id) => markForSync('quote', id));
  notify();
  changeListeners.forEach((l) => l());
}

/** Quotes arrived from another device: refresh screens and notifications, without re-queuing them. */
export function quotesChangedRemotely() {
  changeListeners.forEach((l) => l());
}

/** Insert or replace a quote as-is (used by sync). */
export function putQuote(q: Quote) {
  sqlite.runSync('INSERT OR REPLACE INTO quotes (id, text, author, createdAt, updatedAt) VALUES (?,?,?,?,?)', [q.id, q.text, q.author ?? '', q.createdAt, q.updatedAt]);
}

export function getQuotes(): Quote[] {
  return sqlite.getAllSync<Quote>('SELECT * FROM quotes ORDER BY createdAt DESC');
}

export function getQuote(id: string): Quote | undefined {
  return sqlite.getFirstSync<Quote>('SELECT * FROM quotes WHERE id = ?', [id]) ?? undefined;
}

export function addQuote(text: string, author: string): Quote {
  const now = Date.now();
  const q: Quote = { id: uid(), text: text.trim(), author: author.trim(), createdAt: now, updatedAt: now };
  sqlite.runSync('INSERT INTO quotes (id, text, author, createdAt, updatedAt) VALUES (?,?,?,?,?)', [q.id, q.text, q.author, q.createdAt, q.updatedAt]);
  changed(q.id);
  return q;
}

/** Add many quotes in one go, skipping any whose text is already saved. Returns how many were added. */
export function addQuotes(items: { text: string; author: string }[]): number {
  const seen = new Set(getQuotes().map((q) => normalize(q.text)));
  const ids: string[] = [];
  const base = Date.now();
  sqlite.withTransactionSync(() => {
    // Insert in reverse so the list (newest first) shows them in pasted order.
    [...items].reverse().forEach((item, i) => {
      const text = item.text.trim();
      const key = normalize(text);
      if (!text || seen.has(key)) return;
      seen.add(key);
      const t = base + i;
      const id = uid();
      sqlite.runSync('INSERT INTO quotes (id, text, author, createdAt, updatedAt) VALUES (?,?,?,?,?)', [id, text, item.author.trim(), t, t]);
      ids.push(id);
    });
  });
  if (ids.length) changed(...ids);
  return ids.length;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export function updateQuote(id: string, text: string, author: string) {
  sqlite.runSync('UPDATE quotes SET text = ?, author = ?, updatedAt = ? WHERE id = ?', [text.trim(), author.trim(), Date.now(), id]);
  changed(id);
}

export function deleteQuote(id: string) {
  sqlite.runSync('DELETE FROM quotes WHERE id = ?', [id]);
  changed(id);
}

/** "— Author" line, or empty when the quote has no author. */
export function byline(q: Pick<Quote, 'author'>) {
  return q.author ? `— ${q.author}` : '';
}

/**
 * Pick `count` quotes at random, going through the whole list before any
 * quote repeats and never showing the same quote twice in a row.
 */
export function shuffledRun<T>(items: T[], count: number): T[] {
  if (!items.length) return [];
  const out: T[] = [];
  while (out.length < count) {
    const deck = [...items];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    if (out.length && deck.length > 1 && deck[0] === out[out.length - 1]) deck.push(deck.shift()!);
    out.push(...deck);
  }
  return out.slice(0, count);
}
