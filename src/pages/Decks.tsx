import { Layers, Plus, Search, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DeckCard } from '../components/DeckCard'
import { useShell } from '../components/Layout'
import { Button, EmptyState, Input, PageHeader, Panel, Select } from '../components/ui'
import { useDeckSummaries } from '../lib/hooks'
import { plural } from '../lib/utils'

type Sort = 'due' | 'recent' | 'alpha' | 'size'
const SORT_KEY = 'recall-decks-sort'

function readSort(): Sort {
  try {
    const v = localStorage.getItem(SORT_KEY)
    if (v === 'due' || v === 'recent' || v === 'alpha' || v === 'size') return v
  } catch {
    /* ignore */
  }
  return 'due'
}

/** Every deck in one place: search, sort, study or open. */
export function Decks() {
  const summaries = useDeckSummaries()
  const shell = useShell()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [sort, setSortState] = useState<Sort>(readSort)

  const setSort = (s: Sort) => {
    setSortState(s)
    try {
      localStorage.setItem(SORT_KEY, s)
    } catch {
      /* ignore */
    }
  }

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase()
    const list = (summaries ?? []).filter((s) => !query || s.deck.name.toLowerCase().includes(query) || (s.deck.description ?? '').toLowerCase().includes(query))
    return list.slice().sort((a, b) => {
      if (sort === 'alpha') return a.deck.name.localeCompare(b.deck.name)
      if (sort === 'size') return b.total - a.total || a.deck.name.localeCompare(b.deck.name)
      if (sort === 'recent') return b.deck.createdAt - a.deck.createdAt
      return b.counts.total - a.counts.total || a.deck.name.localeCompare(b.deck.name)
    })
  }, [summaries, q, sort])

  if (!summaries) return <div className="h-64" />

  const cards = summaries.reduce((n, s) => n + s.total, 0)
  const due = summaries.reduce((n, s) => n + s.counts.total, 0)

  return (
    <div>
      <PageHeader
        title="Decks"
        description={
          summaries.length
            ? `${plural(summaries.length, 'deck')} · ${plural(cards, 'card')}${due ? ` · ${due.toLocaleString()} due today` : ''}`
            : 'One deck per subject. Each one keeps its own schedule and daily limits.'
        }
        actions={
          <>
            <Button onClick={() => nav('/import')}>
              <Upload size={16} /> Import
            </Button>
            <Button variant="primary" onClick={shell.newDeck}>
              <Plus size={16} /> New deck
            </Button>
          </>
        }
      />

      {summaries.length === 0 ? (
        <Panel>
          <EmptyState icon={<Layers size={22} />} title="No decks yet" body="Create a deck and add cards one by one, or import a whole set from notes, a spreadsheet or Anki.">
            <Button variant="primary" onClick={shell.newDeck}>
              <Plus size={16} /> Create a deck
            </Button>
            <Button onClick={() => nav('/import')}>
              <Upload size={16} /> Import cards
            </Button>
          </EmptyState>
        </Panel>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search decks…" aria-label="Search decks" className="pl-9" />
            </div>
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="sm:w-44" aria-label="Sort decks">
              <option value="due">Most due first</option>
              <option value="recent">Newest first</option>
              <option value="alpha">A → Z</option>
              <option value="size">Largest first</option>
            </Select>
          </div>

          {shown.length === 0 ? (
            <Panel className="mt-4">
              <EmptyState icon={<Search size={22} />} title={`No decks match “${q.trim()}”`} body="Try a different name, or clear the search to see every deck.">
                <Button onClick={() => setQ('')}>Clear search</Button>
              </EmptyState>
            </Panel>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {shown.map((s) => (
                <DeckCard key={s.deck.id} summary={s} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
