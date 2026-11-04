import type { Card } from './db'
import { recallProbability } from './fsrs'
import { shuffle } from './utils'

export type QType = 'mc' | 'typed' | 'tf' | 'self'
export type Direction = 'forward' | 'reverse' | 'mixed'
export type Focus = 'all' | 'weak' | 'new-ish'

export const QTYPE_LABEL: Record<QType, string> = {
  mc: 'Multiple choice',
  typed: 'Type the answer',
  tf: 'True / False',
  self: 'Self-check',
}

export interface QuizConfig {
  deckIds: string[]
  count: number // 0 = all
  types: QType[]
  direction: Direction
  focus: Focus
  updateSchedule: boolean
}

export interface Question {
  id: string
  cardId: string
  type: QType
  prompt: string
  answer: string
  options?: string[]
  correctIndex?: number
  shown?: string // TF: the candidate answer being judged
  truth?: boolean
}

export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[*_`~#>[\]()!]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[b.length]
}

export function similarity(a: string, b: string) {
  const x = normalize(a)
  const y = normalize(b)
  if (!x && !y) return 1
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length)
}

/** Grade a typed answer. Tolerates small typos and accepts any listed alternative ("a / b", "a; b", "a or b"). */
export function gradeTyped(given: string, answer: string): { correct: boolean; score: number } {
  const g = normalize(given)
  const alts = [answer, ...answer.split(/\s*(?:;|\/|,|\bor\b)\s*/i)].map(normalize).filter(Boolean)
  let best = 0
  for (const a of alts) {
    const dist = levenshtein(g, a)
    const len = Math.max(g.length, a.length)
    const sim = 1 - dist / len
    best = Math.max(best, sim)
    if (dist === 0 || (len >= 4 && dist <= 1) || (len >= 8 && dist <= 2) || sim >= 0.85) return { correct: true, score: sim }
  }
  return { correct: false, score: best }
}

const isShort = (s: string) => normalize(s).length > 0 && s.length <= 40 && s.trim().split(/\s+/).length <= 5 && !s.includes('\n')

function pickDistractors(answer: string, pool: string[], n: number) {
  const target = normalize(answer)
  const seen = new Set([target])
  const candidates: string[] = []
  for (const p of shuffle(pool)) {
    const k = normalize(p)
    if (!k || seen.has(k)) continue
    seen.add(k)
    candidates.push(p)
  }
  // Prefer options of similar length so the correct answer doesn't stand out.
  const len = answer.length
  candidates.sort((a, b) => Math.abs(a.length - len) - Math.abs(b.length - len) + (Math.random() - 0.5) * 20)
  return candidates.slice(0, n)
}

function weakness(c: Card, now: number) {
  const r = recallProbability(c, now)
  if (r == null) return 0.6 + Math.random() * 0.1
  return 1 - r + c.lapses * 0.1 + c.difficulty / 50
}

export function buildQuiz(cards: Card[], cfg: QuizConfig): Question[] {
  const now = Date.now()
  let selected = cards.filter((c) => !c.suspended)
  if (cfg.focus === 'weak') selected = selected.slice().sort((a, b) => weakness(b, now) - weakness(a, now))
  else if (cfg.focus === 'new-ish') selected = selected.filter((c) => c.state !== 2 || c.stability < 21).sort(() => Math.random() - 0.5)
  else selected = shuffle(selected)
  if (cfg.count > 0) selected = selected.slice(0, cfg.count)
  if (cfg.focus === 'weak') selected = shuffle(selected)

  const types = cfg.types.length ? cfg.types : (['mc'] as QType[])
  const byDeck = new Map<string, Card[]>()
  for (const c of cards) byDeck.set(c.deckId, [...(byDeck.get(c.deckId) ?? []), c])

  return selected.map((card, i) => {
    const reverse = cfg.direction === 'reverse' || (cfg.direction === 'mixed' && Math.random() < 0.5)
    const prompt = reverse ? card.back : card.front
    const answer = reverse ? card.front : card.back
    const side = (c: Card) => (reverse ? c.front : c.back)
    // Same-deck options first so wrong answers are plausible; top up from other decks if needed.
    let distractors = pickDistractors(answer, (byDeck.get(card.deckId) ?? []).map(side), 3)
    if (distractors.length < 3) {
      const extra = pickDistractors(answer, cards.filter((c) => c.deckId !== card.deckId).map(side), 3)
      distractors = [...distractors, ...extra.filter((x) => !distractors.includes(x))].slice(0, 3)
    }

    // Pick a type that actually works for this card.
    let options = shuffle(types)
    options = options.filter((t) => {
      if (t === 'mc') return distractors.length >= 2
      if (t === 'tf') return distractors.length >= 1
      if (t === 'typed') return isShort(answer)
      return true
    })
    const type: QType = options[0] ?? 'self'
    const base = { id: `${card.id}-${i}`, cardId: card.id, type, prompt, answer }

    if (type === 'mc') {
      const opts = shuffle([answer, ...distractors])
      return { ...base, options: opts, correctIndex: opts.indexOf(answer) }
    }
    if (type === 'tf') {
      const truth = Math.random() < 0.5
      return { ...base, truth, shown: truth ? answer : distractors[0] }
    }
    return base
  })
}

export function scoreMessage(pct: number) {
  if (pct >= 95) return { title: 'Outstanding', body: "You've really got this material down." }
  if (pct >= 80) return { title: 'Great work', body: 'Strong recall. Review the few you missed.' }
  if (pct >= 60) return { title: 'Solid progress', body: 'You know the core. The misses are now queued for review.' }
  if (pct >= 40) return { title: 'Getting there', body: 'Keep studying — spaced repetition will close the gap.' }
  return { title: 'Early days', body: "That's normal for new material. Your misses are queued up for review." }
}
