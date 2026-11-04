import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db, type Card, type Deck } from './db'
import { deckQueue, doneTodayByDeck, queueCounts, type Counts } from './session'
import { startOfDay } from './utils'

export function useDecks() {
  return useLiveQuery(() => db.decks.orderBy('createdAt').toArray(), [])
}

export function useAllCards() {
  return useLiveQuery(() => db.cards.toArray(), [])
}

export function useTodayReviews() {
  // re-evaluated when reviews change; day boundary handled by the `tick` below
  const tick = useMinuteTick()
  const sod = startOfDay(tick)
  return useLiveQuery(() => db.reviews.where('ts').aboveOrEqual(sod).toArray(), [sod])
}

/** A timestamp that updates every minute so "due" counts stay fresh. */
export function useMinuteTick() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    const onFocus = () => setNow(Date.now())
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
    }
  }, [])
  return now
}

export interface DeckSummary {
  deck: Deck
  counts: Counts
  total: number
  mature: number
  suspended: number
}

/** Per-deck due counts + totals, live. */
export function useDeckSummaries() {
  const decks = useDecks()
  const cards = useAllCards()
  const today = useTodayReviews()
  const now = useMinuteTick()
  return useMemo(() => {
    if (!decks || !cards || !today) return undefined
    const done = doneTodayByDeck(today)
    const byDeck = new Map<string, Card[]>()
    for (const c of cards) {
      const arr = byDeck.get(c.deckId) ?? []
      arr.push(c)
      byDeck.set(c.deckId, arr)
    }
    const summaries: DeckSummary[] = decks.map((deck) => {
      const list = byDeck.get(deck.id) ?? []
      return {
        deck,
        counts: queueCounts(deckQueue(deck, list, done.get(deck.id), Date.now())),
        total: list.length,
        mature: list.filter((c) => c.state === 2 && c.stability >= 21).length,
        suspended: list.filter((c) => c.suspended).length,
      }
    })
    return summaries
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decks, cards, today, now])
}

export type ThemePref = 'light' | 'dark' | 'system'

// v2 key: older builds auto-saved "system" on first visit, which kept dark-OS users in dark mode.
const THEME_KEY = 'recall-theme-v2'

function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'dark' || v === 'system' || v === 'light' ? v : 'light'
  } catch {
    return 'light'
  }
}

function applyTheme(p: ThemePref) {
  const dark = p === 'dark' || (p === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

/** Light by default. The choice is only saved when the user explicitly picks a theme. */
export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(readTheme)
  useEffect(() => {
    try {
      localStorage.removeItem('recall-theme') // drop legacy auto-saved value
    } catch {
      /* ignore */
    }
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme(readTheme())
    applyTheme(readTheme())
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  const setPref = (p: ThemePref) => {
    try {
      localStorage.setItem(THEME_KEY, p)
    } catch {
      /* ignore */
    }
    setPrefState(p)
    applyTheme(p)
  }
  return [pref, setPref] as const
}

export function useHotkeys(map: Record<string, (e: KeyboardEvent) => void>, opts: { allowInInputs?: boolean; enabled?: boolean } = {}) {
  const ref = useRef(map)
  ref.current = map
  const optsRef = useRef(opts)
  optsRef.current = opts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || optsRef.current.enabled === false) return
      const opts = optsRef.current
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      if (typing && !opts.allowInInputs) return
      if (document.querySelector('[role="dialog"]') && !opts.allowInInputs) return
      const key = (e.metaKey || e.ctrlKey ? 'mod+' : '') + (e.key === ' ' ? 'space' : e.key.toLowerCase())
      const fn = ref.current[key]
      if (fn) {
        e.preventDefault()
        fn(e)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
