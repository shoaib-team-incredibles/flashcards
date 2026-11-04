import { deckOptions, getCards, getDeck, getDecks, getReviewsSince, recordReview, undoReview, type Card, type Deck, type ReviewLog } from './db';
import { schedule, type Rating } from './fsrs';
import { dayKey, endOfDay, startOfDay } from './utils';

export const LEARN_AHEAD_MS = 20 * 60_000;

export interface DayDone {
  newDone: number;
  reviewDone: number;
}

export interface DeckQueue {
  learning: Card[];
  review: Card[];
  fresh: Card[];
}

export interface Counts {
  new: number;
  learning: number;
  review: number;
  total: number;
}

export function doneTodayByDeck(reviewsToday: ReviewLog[]) {
  const map = new Map<string, DayDone>();
  for (const r of reviewsToday) {
    if (r.source !== 'study') continue;
    const m = map.get(r.deckId) ?? { newDone: 0, reviewDone: 0 };
    if (r.prevState === 0) m.newDone++;
    else if (r.prevState === 2) m.reviewDone++;
    map.set(r.deckId, m);
  }
  return map;
}

/** Cards due for study in one deck right now, honoring daily limits. */
export function deckQueue(deck: Deck, cards: Card[], done: DayDone | undefined, now = Date.now()): DeckQueue {
  const eod = endOfDay(now);
  const learning: Card[] = [];
  const review: Card[] = [];
  const fresh: Card[] = [];
  for (const c of cards) {
    if (c.suspended || c.deckId !== deck.id) continue;
    if (c.state === 1 || c.state === 3) {
      if (c.due <= eod) learning.push(c);
    } else if (c.state === 2) {
      if (c.due < eod) review.push(c);
    } else fresh.push(c);
  }
  learning.sort((a, b) => a.due - b.due);
  review.sort((a, b) => a.due - b.due);
  fresh.sort((a, b) => a.createdAt - b.createdAt);
  const newLeft = Math.max(0, deck.newPerDay - (done?.newDone ?? 0));
  const reviewLeft = Math.max(0, deck.reviewsPerDay - (done?.reviewDone ?? 0));
  return { learning, review: review.slice(0, reviewLeft), fresh: fresh.slice(0, newLeft) };
}

export function queueCounts(q: DeckQueue): Counts {
  return { new: q.fresh.length, learning: q.learning.length, review: q.review.length, total: q.fresh.length + q.learning.length + q.review.length };
}

export function mergeQueues(qs: DeckQueue[]): DeckQueue {
  const out: DeckQueue = { learning: [], review: [], fresh: [] };
  for (const q of qs) {
    out.learning.push(...q.learning);
    out.review.push(...q.review);
    out.fresh.push(...q.fresh);
  }
  out.learning.sort((a, b) => a.due - b.due);
  out.review.sort((a, b) => a.due - b.due);
  return out;
}

export function loadStudyQueue(deckId: string | null) {
  const decks = deckId ? [getDeck(deckId)].filter(Boolean) as Deck[] : getDecks();
  const cards = getCards(deckId ?? undefined);
  const done = doneTodayByDeck(getReviewsSince(startOfDay()));
  const byDeck = new Map<string, Card[]>();
  for (const c of cards) {
    const arr = byDeck.get(c.deckId) ?? [];
    arr.push(c);
    byDeck.set(c.deckId, arr);
  }
  return { decks, queue: mergeQueues(decks.map((d) => deckQueue(d, byDeck.get(d.id) ?? [], done.get(d.id)))) };
}

export interface DeckSummary {
  deck: Deck;
  counts: Counts;
  total: number;
  mature: number;
}

export function deckSummaries(): DeckSummary[] {
  const decks = getDecks();
  const cards = getCards();
  const done = doneTodayByDeck(getReviewsSince(startOfDay()));
  return decks.map((deck) => {
    const own = cards.filter((c) => c.deckId === deck.id);
    return {
      deck,
      counts: queueCounts(deckQueue(deck, own, done.get(deck.id))),
      total: own.length,
      mature: own.filter((c) => c.state === 2 && c.stability >= 21).length,
    };
  });
}

export function answerCard(card: Card, rating: Rating, deck: Deck | undefined, durationMs: number) {
  const now = Date.now();
  const next = schedule(card, rating, now, deckOptions(deck));
  const updated: Card = { ...card, ...next, updatedAt: now };
  const logId = recordReview(updated, {
    cardId: card.id,
    deckId: card.deckId,
    rating,
    prevState: card.state,
    ts: now,
    durationMs: Math.min(durationMs, 5 * 60_000),
    source: 'study',
  });
  return { updated, logId };
}

export const undoAnswer = undoReview;

export function pickNext(q: DeckQueue, counter: number, now = Date.now()): Card | null {
  const learnDue = q.learning.find((c) => c.due <= now);
  if (learnDue) return learnDue;
  if (q.fresh.length && (q.review.length === 0 || counter % 4 === 3)) return q.fresh[0];
  if (q.review.length) return q.review[0];
  const ahead = q.learning[0];
  if (ahead && ahead.due <= now + LEARN_AHEAD_MS) return ahead;
  return null;
}

export function removeFrom(q: DeckQueue, id: string): DeckQueue {
  return {
    learning: q.learning.filter((c) => c.id !== id),
    review: q.review.filter((c) => c.id !== id),
    fresh: q.fresh.filter((c) => c.id !== id),
  };
}

/** Consecutive days with at least one review, ending today or yesterday. */
export function computeStreak(reviews: ReviewLog[]) {
  const days = new Set(reviews.map((r) => dayKey(r.ts)));
  let streak = 0;
  let t = Date.now();
  if (!days.has(dayKey(t))) t -= 86_400_000;
  while (days.has(dayKey(t))) {
    streak++;
    const d = new Date(t);
    d.setDate(d.getDate() - 1);
    t = d.getTime();
  }
  return streak;
}
