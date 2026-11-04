/**
 * FSRS-5 spaced repetition scheduler (the algorithm modern Anki uses).
 * Self-contained implementation so the scheduling logic is easy to read and tweak.
 */

export const State = { New: 0, Learning: 1, Review: 2, Relearning: 3 } as const
export type CardState = 0 | 1 | 2 | 3
export type Rating = 1 | 2 | 3 | 4

export const RATINGS: Rating[] = [1, 2, 3, 4]
export const RATING_LABEL: Record<Rating, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }
export const STATE_LABEL: Record<CardState, string> = { 0: 'New', 1: 'Learning', 2: 'Review', 3: 'Relearning' }

export interface SchedFields {
  state: CardState
  due: number
  stability: number
  difficulty: number
  reps: number
  lapses: number
  lastReview: number | null
  step: number
}

export interface SchedOptions {
  retention: number // desired probability of recall, e.g. 0.9
  maxInterval: number // days
  learnSteps: number[] // minutes
  relearnSteps: number[] // minutes
}

export const DEFAULT_OPTIONS: SchedOptions = {
  retention: 0.9,
  maxInterval: 36500,
  learnSteps: [1, 10],
  relearnSteps: [10],
}

// Default FSRS-5 weights
const W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605,
  2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
]
const DECAY = -0.5
const FACTOR = 19 / 81
const MIN = 60_000
const DAY = 86_400_000

const clampD = (d: number) => Math.min(10, Math.max(1, d))
const initD = (g: Rating) => clampD(W[4] - Math.exp(W[5] * (g - 1)) + 1)
const initS = (g: Rating) => Math.max(0.1, W[g - 1])

export function retrievability(elapsedDays: number, s: number) {
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / s, DECAY)
}

function rawInterval(s: number, retention: number) {
  return (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1)
}

function nextD(d: number, g: Rating) {
  const delta = -W[6] * (g - 3)
  const dp = d + (delta * (10 - d)) / 9
  return clampD(W[7] * (W[4] - Math.exp(W[5] * 3) + 1) + (1 - W[7]) * dp)
}

function recallS(d: number, s: number, r: number, g: Rating) {
  const hard = g === 2 ? W[15] : 1
  const easy = g === 4 ? W[16] : 1
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hard * easy)
}

function forgetS(d: number, s: number, r: number) {
  const sf = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14])
  return Math.max(0.1, Math.min(s, sf))
}

const shortTermS = (s: number, g: Rating) => Math.max(0.1, s * Math.exp(W[17] * (g - 3 + W[18])))

/** Deterministic pseudo-random in [0,1) so previews match the real outcome. */
function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 13
  h = Math.imul(h, 0x5bd1e995)
  h ^= h >>> 15
  return (h >>> 0) / 4294967296
}

/** Spread reviews out so cards added together don't stay clumped together forever. */
function fuzz(days: number, seed: string) {
  if (days < 2.5) return days
  const f = days < 7 ? 0.15 : days < 20 ? 0.1 : 0.05
  const delta = Math.max(1, Math.round(days * f))
  return Math.max(2, days - delta + Math.round(seeded(seed) * delta * 2))
}

function toDays(s: number, o: SchedOptions, seed: string) {
  const ivl = Math.min(o.maxInterval, Math.max(1, Math.round(rawInterval(s, o.retention))))
  return Math.min(o.maxInterval, fuzz(ivl, seed))
}

export function newSchedFields(now = Date.now()): SchedFields {
  return { state: 0, due: now, stability: 0, difficulty: 0, reps: 0, lapses: 0, lastReview: null, step: 0 }
}

/** Apply a rating to a card and return its new scheduling fields. */
export function schedule(
  card: SchedFields & { id?: string },
  g: Rating,
  now = Date.now(),
  o: SchedOptions = DEFAULT_OPTIONS,
): SchedFields {
  const seed = `${card.id ?? ''}:${card.reps}:${g}`
  const base = { reps: card.reps + 1, lapses: card.lapses, lastReview: now }
  const elapsed = card.lastReview ? (now - card.lastReview) / DAY : 0

  const toReview = (s: number, d: number, days: number): SchedFields => ({
    ...base,
    state: 2,
    stability: s,
    difficulty: d,
    step: 0,
    due: now + days * DAY,
  })

  switch (card.state) {
    case 0: {
      const d = initD(g)
      const s = initS(g)
      const steps = o.learnSteps
      if (g === 4 || steps.length === 0) {
        const goodDays = toDays(initS(3), o, seed)
        const days = g === 4 ? Math.max(toDays(s, o, seed), goodDays + 1) : goodDays
        return toReview(s, d, days)
      }
      if (g === 1) return { ...base, state: 1, stability: s, difficulty: d, step: 0, due: now + steps[0] * MIN }
      if (g === 2) {
        const mins = steps.length > 1 ? (steps[0] + steps[1]) / 2 : steps[0] * 1.5
        return { ...base, state: 1, stability: s, difficulty: d, step: 0, due: now + mins * MIN }
      }
      // Good
      if (steps.length > 1) return { ...base, state: 1, stability: s, difficulty: d, step: 1, due: now + steps[1] * MIN }
      return toReview(s, d, toDays(s, o, seed))
    }

    case 1:
    case 3: {
      const steps = card.state === 1 ? o.learnSteps : o.relearnSteps
      const d = nextD(card.difficulty, g)
      const s = shortTermS(card.stability, g)
      const state = card.state
      if (g === 1) return { ...base, state, stability: s, difficulty: d, step: 0, due: now + (steps[0] ?? 1) * MIN }
      if (g === 2) {
        const cur = steps[card.step] ?? steps[steps.length - 1] ?? 1
        const mins = card.step === 0 && steps.length > 1 ? (steps[0] + steps[1]) / 2 : cur
        return { ...base, state, stability: s, difficulty: d, step: card.step, due: now + mins * MIN }
      }
      const goodDays = toDays(shortTermS(card.stability, 3), o, seed)
      if (g === 3) {
        const next = card.step + 1
        if (next < steps.length) return { ...base, state, stability: s, difficulty: d, step: next, due: now + steps[next] * MIN }
        return toReview(s, d, goodDays)
      }
      return toReview(s, d, Math.max(toDays(s, o, seed), goodDays + 1))
    }

    case 2:
    default: {
      const r = retrievability(elapsed, card.stability)
      if (g === 1) {
        const s = forgetS(card.difficulty, card.stability, r)
        const d = nextD(card.difficulty, 1)
        const steps = o.relearnSteps
        if (steps.length === 0) return { ...toReview(s, d, toDays(s, o, seed)), lapses: card.lapses + 1 }
        return { ...base, lapses: card.lapses + 1, state: 3, stability: s, difficulty: d, step: 0, due: now + steps[0] * MIN }
      }
      const sHard = recallS(card.difficulty, card.stability, r, 2)
      const sGood = recallS(card.difficulty, card.stability, r, 3)
      const sEasy = recallS(card.difficulty, card.stability, r, 4)
      let hard = toDays(sHard, o, seed)
      let good = toDays(sGood, o, seed)
      let easy = toDays(sEasy, o, seed)
      hard = Math.min(hard, good)
      good = Math.max(good, hard + 1)
      easy = Math.max(easy, good + 1)
      const d = nextD(card.difficulty, g)
      if (g === 2) return toReview(sHard, d, hard)
      if (g === 3) return toReview(sGood, d, good)
      return toReview(sEasy, d, easy)
    }
  }
}

export function previewAll(card: SchedFields & { id?: string }, now = Date.now(), o = DEFAULT_OPTIONS) {
  return {
    1: schedule(card, 1, now, o),
    2: schedule(card, 2, now, o),
    3: schedule(card, 3, now, o),
    4: schedule(card, 4, now, o),
  } as Record<Rating, SchedFields>
}

/** Current probability of recall for a reviewed card (null for new cards). */
export function recallProbability(card: SchedFields, now = Date.now()) {
  if (card.state === 0 || !card.lastReview || card.stability <= 0) return null
  return retrievability((now - card.lastReview) / DAY, card.stability)
}

export function formatInterval(ms: number) {
  const m = (Math.max(0, ms) + 1000) / MIN
  if (m < 1) return '<1m'
  if (m < 60) return `${Math.round(m)}m`
  const h = m / 60
  if (h < 24) return `${Math.round(h)}h`
  const d = h / 24
  if (d < 30) return `${Math.round(d)}d`
  if (d < 365) return `${(d / 30).toFixed(d < 300 ? 1 : 0).replace(/\.0$/, '')}mo`
  return `${(d / 365).toFixed(1).replace(/\.0$/, '')}y`
}
