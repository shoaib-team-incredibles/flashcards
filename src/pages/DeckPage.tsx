import { useLiveQuery } from 'dexie-react-hooks'
import { ClipboardCheck, Download, FileText, Layers, MoreHorizontal, Pause, Play, Plus, RotateCcw, Search, Settings2, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CardEditor } from '../components/CardEditor'
import { DeckDialog } from '../components/DeckDialog'
import { useToast } from '../components/toast'
import { Badge, Button, EmptyState, IconButton, Input, Modal, Panel, Select, Stat } from '../components/ui'
import { db, deleteDeck, resetCards, type Card } from '../lib/db'
import { recallProbability } from '../lib/fsrs'
import { useDeckSummaries, useDecks } from '../lib/hooks'
import { toCSV } from '../lib/importers'
import { stripMarkdown } from '../lib/markdown'
import { cx, downloadFile, plural, relativeTime, slug } from '../lib/utils'

type Filter = 'all' | 'new' | 'learning' | 'review' | 'due' | 'suspended' | 'leech'
type Sort = 'created' | 'due' | 'difficulty' | 'alpha'

const FILTERS: { v: Filter; label: string }[] = [
  { v: 'all', label: 'All' },
  { v: 'due', label: 'Due' },
  { v: 'new', label: 'New' },
  { v: 'learning', label: 'Learning' },
  { v: 'review', label: 'Review' },
  { v: 'leech', label: 'Struggling' },
  { v: 'suspended', label: 'Suspended' },
]

function stateBadge(c: Card) {
  if (c.suspended) return <Badge>Suspended</Badge>
  if (c.state === 0) return <Badge tone="new">New</Badge>
  if (c.state === 1 || c.state === 3) return <Badge tone="learn">Learning</Badge>
  if (c.stability >= 21) return <Badge tone="review">Mature</Badge>
  return <Badge tone="review">Young</Badge>
}

export function DeckPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const deck = useLiveQuery(() => db.decks.get(id), [id])
  const cards = useLiveQuery(() => db.cards.where('deckId').equals(id).toArray(), [id])
  const summary = useDeckSummaries()?.find((s) => s.deck.id === id)
  const decks = useDecks()

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('created')
  const [limit, setLimit] = useState(100)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Card | null>(null)
  const [adding, setAdding] = useState(false)
  const [settings, setSettings] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [menu, setMenu] = useState(false)
  const [moveTo, setMoveTo] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSelected(new Set())
    setQ('')
    setFilter('all')
  }, [id])

  // Deep link to a card (from search)
  useEffect(() => {
    const cid = params.get('card')
    if (cid && cards) {
      const c = cards.find((x) => x.id === cid)
      if (c) setEditing(c)
      params.delete('card')
      setParams(params, { replace: true })
    }
  }, [params, cards, setParams])

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])

  const filtered = useMemo(() => {
    if (!cards) return []
    const now = Date.now()
    const query = q.trim().toLowerCase()
    let list = cards.filter((c) => {
      if (query && !c.front.toLowerCase().includes(query) && !c.back.toLowerCase().includes(query) && !c.tags.some((t) => t.toLowerCase().includes(query))) return false
      switch (filter) {
        case 'new':
          return c.state === 0 && !c.suspended
        case 'learning':
          return (c.state === 1 || c.state === 3) && !c.suspended
        case 'review':
          return c.state === 2 && !c.suspended
        case 'due':
          return c.state !== 0 && c.due <= now && !c.suspended
        case 'suspended':
          return !!c.suspended
        case 'leech':
          return c.lapses >= 3 || (c.difficulty >= 8 && c.reps > 2)
        default:
          return true
      }
    })
    list = list.slice().sort((a, b) => {
      if (sort === 'due') return a.due - b.due
      if (sort === 'difficulty') return b.difficulty - a.difficulty
      if (sort === 'alpha') return a.front.localeCompare(b.front)
      return b.createdAt - a.createdAt
    })
    return list
  }, [cards, q, filter, sort])

  if (deck === undefined || cards === undefined) return <div className="h-64" />
  if (deck === null || !deck)
    return (
      <EmptyState icon={<Layers size={22} />} title="Deck not found" body="It may have been deleted.">
        <Button onClick={() => nav('/')}>Go home</Button>
      </EmptyState>
    )

  const counts = summary?.counts ?? { new: 0, learning: 0, review: 0, total: 0 }
  const editIndex = editing ? filtered.findIndex((c) => c.id === editing.id) : -1
  const editNav =
    editIndex >= 0
      ? {
          index: editIndex,
          total: filtered.length,
          onPrev: editIndex > 0 ? () => setEditing(filtered[editIndex - 1]) : undefined,
          onNext: editIndex < filtered.length - 1 ? () => setEditing(filtered[editIndex + 1]) : undefined,
        }
      : undefined
  const allSelected = filtered.length > 0 && filtered.slice(0, limit).every((c) => selected.has(c.id))
  const sel = [...selected]

  const toggle = (cid: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(cid)) n.delete(cid)
      else n.add(cid)
      return n
    })

  async function bulk(action: 'delete' | 'suspend' | 'unsuspend' | 'reset') {
    if (!sel.length) return
    if (action === 'delete') {
      const backup = await db.cards.bulkGet(sel)
      await db.cards.bulkDelete(sel)
      toast(`Deleted ${plural(sel.length, 'card')}`, {
        action: { label: 'Undo', onClick: () => db.cards.bulkPut(backup.filter(Boolean) as Card[]) },
      })
    } else if (action === 'reset') {
      await resetCards(sel)
      toast(`Reset ${plural(sel.length, 'card')} to new`)
    } else {
      await db.cards.where('id').anyOf(sel).modify({ suspended: action === 'suspend' ? 1 : 0 })
      toast(`${action === 'suspend' ? 'Suspended' : 'Unsuspended'} ${plural(sel.length, 'card')}`)
    }
    setSelected(new Set())
  }

  async function doMove() {
    if (!moveTo) return
    await db.cards.where('id').anyOf(sel).modify({ deckId: moveTo })
    toast(`Moved ${plural(sel.length, 'card')}`)
    setSelected(new Set())
    setMoveTo(null)
  }

  const exportDeck = () => {
    downloadFile(`${slug(deck.name)}.tsv`, toCSV(cards), 'text/tab-separated-values')
    setMenu(false)
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link to="/" className="text-[13px] text-muted hover:text-fg">
            Decks
          </Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold tracking-tight sm:text-[28px]">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: deck.color }} />
            <span className="truncate">{deck.name}</span>
          </h1>
          {deck.description && <p className="mt-1 text-sm text-muted">{deck.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => nav(`/study?deck=${deck.id}`)} disabled={!counts.total}>
            <Layers size={16} /> Study{counts.total ? ` ${counts.total}` : ''}
          </Button>
          <Button onClick={() => nav(`/test?deck=${deck.id}`)} disabled={cards.length < 1}>
            <ClipboardCheck size={16} /> Test
          </Button>
          <Button onClick={() => setAdding(true)}>
            <Plus size={16} /> Add
          </Button>
          <div className="relative" ref={menuRef}>
            <IconButton label="More" onClick={() => setMenu((m) => !m)} className="h-10 w-10 border border-line bg-surface">
              <MoreHorizontal size={18} />
            </IconButton>
            {menu && (
              <div className="absolute right-0 z-30 mt-2 w-52 animate-pop rounded-xl border border-line bg-surface p-1.5 shadow-xl">
                {[
                  { icon: <Upload size={15} />, label: 'Import into deck', onClick: () => nav(`/import?deck=${deck.id}`) },
                  { icon: <Download size={15} />, label: 'Export as TSV', onClick: exportDeck },
                  { icon: <Settings2 size={15} />, label: 'Deck settings', onClick: () => (setSettings(true), setMenu(false)) },
                  { icon: <Trash2 size={15} />, label: 'Delete deck', onClick: () => (setConfirmDelete(true), setMenu(false)), danger: true },
                ].map((m) => (
                  <button
                    key={m.label}
                    onClick={m.onClick}
                    className={cx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-subtle', m.danger ? 'text-again' : 'text-fg')}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Due now" value={<span className="text-good">{counts.review + counts.learning}</span>} sub={`${counts.new} new available`} />
        <Stat label="Total cards" value={cards.length} sub={summary?.suspended ? `${summary.suspended} suspended` : 'in this deck'} />
        <Stat label="Mastered" value={`${cards.length ? Math.round(((summary?.mature ?? 0) / cards.length) * 100) : 0}%`} sub="interval ≥ 21 days" />
        <Stat label="Daily limit" value={deck.newPerDay} sub={`new cards · ${Math.round(deck.retention * 100)}% target`} />
      </div>

      {cards.length === 0 ? (
        <Panel className="mt-6">
          <EmptyState icon={<FileText size={22} />} title="This deck is empty" body="Add cards one by one, or bring in a whole set from notes, CSV, or Anki.">
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add cards
            </Button>
            <Button onClick={() => nav(`/import?deck=${deck.id}`)}>
              <Upload size={16} /> Import
            </Button>
          </EmptyState>
        </Panel>
      ) : (
        <div className="mt-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cards and tags…" className="pl-9" />
            </div>
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="md:w-44" aria-label="Sort">
              <option value="created">Newest first</option>
              <option value="due">Due date</option>
              <option value="difficulty">Hardest first</option>
              <option value="alpha">A → Z</option>
            </Select>
          </div>
          <div className="mt-3 -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {FILTERS.map((f) => (
              <button
                key={f.v}
                onClick={() => setFilter(f.v)}
                className={cx(
                  'h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium transition-colors',
                  filter === f.v ? 'border-fg bg-fg text-bg' : 'border-line bg-surface text-muted hover:text-fg',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {sel.length > 0 && (
            <div className="sticky top-16 z-10 mt-3 flex animate-in flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2 md:top-3">
              <span className="mr-auto text-sm font-medium text-accent">{sel.length} selected</span>
              <Button size="sm" variant="ghost" onClick={() => bulk('suspend')}>
                <Pause size={14} /> Suspend
              </Button>
              <Button size="sm" variant="ghost" onClick={() => bulk('unsuspend')}>
                <Play size={14} /> Unsuspend
              </Button>
              <Button size="sm" variant="ghost" onClick={() => bulk('reset')}>
                <RotateCcw size={14} /> Reset
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMoveTo(decks?.find((d) => d.id !== id)?.id ?? null)} disabled={(decks?.length ?? 0) < 2}>
                Move
              </Button>
              <Button size="sm" variant="ghost" className="text-again hover:bg-again/10 hover:text-again" onClick={() => bulk('delete')}>
                <Trash2 size={14} /> Delete
              </Button>
            </div>
          )}

          <Panel className="mt-3 overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line bg-subtle/60 px-4 py-2.5 text-xs font-medium text-muted">
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.slice(0, limit).map((c) => c.id)))}
                className="h-4 w-4 accent-[var(--c-accent)]"
              />
              <span className="flex-1">{plural(filtered.length, 'card')}</span>
              <span className="hidden w-24 sm:block">Status</span>
              <span className="hidden w-20 text-right sm:block">Due</span>
            </div>
            {filtered.length === 0 && <div className="px-4 py-12 text-center text-sm text-muted">No cards match.</div>}
            <ul className="divide-y divide-line">
              {filtered.slice(0, limit).map((c) => {
                const r = recallProbability(c)
                return (
                  <li key={c.id} className={cx('group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-subtle/50', selected.has(c.id) && 'bg-accent-soft/50')}>
                    <input
                      type="checkbox"
                      aria-label="Select card"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="mt-1 h-4 w-4 accent-[var(--c-accent)]"
                    />
                    <button className="min-w-0 flex-1 text-left" onClick={() => setEditing(c)}>
                      <div className="truncate text-sm font-medium">{stripMarkdown(c.front) || '—'}</div>
                      <div className="truncate text-[13px] text-muted">{stripMarkdown(c.back)}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
                        {stateBadge(c)}
                        {c.state !== 0 && <span className="text-[11px] text-faint">{relativeTime(c.due)}</span>}
                      </div>
                      {c.tags.length > 0 && (
                        <div className="mt-1 hidden flex-wrap gap-1 sm:flex">
                          {c.tags.slice(0, 4).map((t) => (
                            <span key={t} className="text-[11px] text-faint">#{t}</span>
                          ))}
                        </div>
                      )}
                    </button>
                    <div className="hidden w-24 pt-0.5 sm:block">{stateBadge(c)}</div>
                    <div className="hidden w-20 pt-0.5 text-right text-xs text-muted tabular-nums sm:block" title={r != null ? `${Math.round(r * 100)}% chance you remember it now` : undefined}>
                      {c.state === 0 ? '—' : relativeTime(c.due)}
                    </div>
                  </li>
                )
              })}
            </ul>
            {filtered.length > limit && (
              <button onClick={() => setLimit((l) => l + 200)} className="w-full border-t border-line py-3 text-sm font-medium text-accent hover:bg-subtle">
                Show more ({filtered.length - limit} remaining)
              </button>
            )}
          </Panel>
        </div>
      )}

      <CardEditor open={adding} deckId={deck.id} onClose={() => setAdding(false)} />
      <CardEditor open={!!editing} card={editing} onClose={() => setEditing(null)} nav={editNav} />
      <DeckDialog open={settings} deck={deck} onClose={() => setSettings(false)} />

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        size="sm"
        title={`Delete “${deck.name}”?`}
        description={`This permanently removes the deck, its ${plural(cards.length, 'card')} and their review history. Export a backup first if you might want them later.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await deleteDeck(deck.id)
                toast(`Deleted “${deck.name}”`)
                nav('/')
              }}
            >
              Delete deck
            </Button>
          </>
        }
      />

      <Modal
        open={moveTo !== null}
        onClose={() => setMoveTo(null)}
        size="sm"
        title={`Move ${plural(sel.length, 'card')}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveTo(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={doMove}>
              Move
            </Button>
          </>
        }
      >
        <Select value={moveTo ?? ''} onChange={(e) => setMoveTo(e.target.value)}>
          {decks
            ?.filter((d) => d.id !== id)
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </Select>
      </Modal>
    </div>
  )
}
