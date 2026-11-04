/**
 * Shared French-deck logic for the web and iOS apps. Copied verbatim to mobile/src/lib/ —
 * edit here and re-run `node mobile/scripts/sync-french.mjs`.
 */

/** A card as bundled in decks/french-*.json. `aliases` are earlier fronts of the same card. */
export interface BundledCard {
  front: string
  back: string
  tags: string[]
  aliases?: string[]
}

export interface FrenchDeckMeta {
  key: 'vocab' | 'expressions' | 'grammar'
  name: string
  description: string
  color: string
}

export const FRENCH_META: FrenchDeckMeta[] = [
  {
    key: 'vocab',
    name: 'French — Popular words',
    description: 'The 1,000 most useful words, highest payoff first, each with an example and pronunciation.',
    color: '#2563eb',
  },
  {
    key: 'expressions',
    name: 'French — Cool expressions',
    description: 'Everyday spoken phrases, idioms and slang that make you sound native.',
    color: '#e11d48',
  },
  {
    key: 'grammar',
    name: 'French — Grammar',
    description: 'One rule per card, from the highest-payoff basics to advanced points.',
    color: '#7c3aed',
  },
]

/** FNV-1a, base36 — short, stable ids from text. */
function hash(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/**
 * Fixed ids, identical on every device, so installing the decks on the web and on iOS
 * produces the same records and sync merges them instead of duplicating.
 */
export const frenchDeckId = (key: FrenchDeckMeta['key']) => `french-${key}`
export const frenchCardId = (key: FrenchDeckMeta['key'], c: BundledCard) => `french-${key}-${hash((c.aliases?.[0] ?? c.front).trim())}`

type Have = { id: string; front: string; back: string }

/**
 * Compares the bundled deck with the user's copy: cards to add, and existing cards whose text was
 * corrected or extended since install (matched by id, front, or a former front).
 */
export function diffDeck(key: FrenchDeckMeta['key'], cards: BundledCard[], have: Have[]) {
  const byId = new Map(have.map((c) => [c.id, c]))
  const byFront = new Map(have.map((c) => [c.front, c]))
  const add: (BundledCard & { id: string })[] = []
  const update: { id: string; front: string; back: string }[] = []
  for (const b of cards) {
    const id = frenchCardId(key, b)
    const front = b.front.trim()
    const back = b.back.trim()
    const mine = byId.get(id) ?? byFront.get(front) ?? b.aliases?.map((a) => byFront.get(a.trim())).find(Boolean)
    if (!mine) add.push({ ...b, id })
    else if (mine.front !== front || mine.back !== back) update.push({ id: mine.id, front, back })
  }
  return { add, update }
}

// ---------- audio helpers ----------

/** French cards: everything except grammar has a French front worth reading aloud. */
export const isFrench = (tags: string[]) => tags.includes('french')
export const hasFrenchFront = (tags: string[]) => isFrench(tags) && !tags.includes('grammar')

/** The meaning of a vocab/expression card: the first paragraph of its back. */
export function meaningOf(back: string) {
  return back.split(/\n\s*\n/)[0] ?? ''
}

/** One stretch of text and the voice that should read it. */
export type Spoken = { text: string; lang: 'fr' | 'en' }

/**
 * The meaning, split by voice: many vocab meanings carry a French usage gloss,
 * e.g. "to be necessary (il faut = you have to)", whose French half must not be read in English.
 */
export function meaningParts(back: string): Spoken[] {
  const m = meaningOf(back)
  const out: Spoken[] = []
  let last = 0
  for (const g of m.matchAll(/\(([^()=]+?)\s*=\s*([^()]+)\)/g)) {
    out.push({ text: m.slice(last, g.index), lang: 'en' }, { text: g[1], lang: 'fr' }, { text: g[2], lang: 'en' })
    last = g.index! + g[0].length
  }
  out.push({ text: m.slice(last), lang: 'en' })
  return out.filter((p) => speechText(p.text))
}

/** Turns card text into something a voice reads well: no Markdown, gender markers, slashes or bars. */
export function speechText(src: string) {
  return src
    .replace(/[*_`#>]/g, '')
    .replace(/\((m|f|m\/f)\)/gi, '')
    .replace(/[()]/g, '')
    .replace(/\s*[/|]\s*/g, ', ')
    .replace(/‿/g, ' ')
    .replace(/[—–]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Every *italic* run in Markdown (the decks put all French examples in italics), bold markers removed. */
export function italicRuns(md: string): string[] {
  const out: string[] = []
  const flat = md.replace(/\*\*\*/g, '*\u0001').replace(/\*\*/g, '\u0001')
  const re = /(?<![\w*])\*(?!\s)([^*\n]+?)\*(?![\w*])/g
  for (const m of flat.matchAll(re)) {
    const t = m[1].replace(/\u0001/g, '').trim()
    if (t) out.push(t)
  }
  return out
}

type AudioCard = { front: string; back: string; tags: string[] }
/** What to read in French: the word/phrase on vocab & expression cards, the examples on grammar cards. */
export const frenchAudio = (c: AudioCard): string[] => (hasFrenchFront(c.tags) ? [c.front] : italicRuns(c.back))
/** What to read in English: the meaning on vocab & expression cards, the question on grammar cards. */
export const englishAudio = (c: AudioCard): string => (hasFrenchFront(c.tags) ? meaningOf(c.back) : c.front)
