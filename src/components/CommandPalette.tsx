import { BarChart3, ClipboardCheck, CornerDownLeft, FileText, Home, Layers, Plus, Search, Settings, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAllCards, useDecks } from '../lib/hooks'
import { stripMarkdown } from '../lib/markdown'
import { cx } from '../lib/utils'

interface Item {
  id: string
  label: string
  sub?: string
  icon: ReactNode
  group: string
  run: () => void
}

export function CommandPalette({ open, onClose, onNewDeck, onNewCard }: { open: boolean; onClose: () => void; onNewDeck: () => void; onNewCard: () => void }) {
  const nav = useNavigate()
  const decks = useDecks()
  const cards = useAllCards()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const go = (path: string) => () => nav(path)
    const actions: Item[] = [
      { id: 'study', label: 'Study all due cards', icon: <Layers size={16} />, group: 'Actions', run: go('/study') },
      { id: 'test', label: 'Take a test', icon: <ClipboardCheck size={16} />, group: 'Actions', run: go('/test') },
      { id: 'card', label: 'Add a card', icon: <Plus size={16} />, group: 'Actions', run: onNewCard },
      { id: 'deck', label: 'Create a deck', icon: <Plus size={16} />, group: 'Actions', run: onNewDeck },
      { id: 'import', label: 'Import cards', icon: <Upload size={16} />, group: 'Actions', run: go('/import') },
      { id: 'home', label: 'Home', icon: <Home size={16} />, group: 'Go to', run: go('/') },
      { id: 'stats', label: 'Statistics', icon: <BarChart3 size={16} />, group: 'Go to', run: go('/stats') },
      { id: 'settings', label: 'Settings', icon: <Settings size={16} />, group: 'Go to', run: go('/settings') },
    ]
    const deckItems: Item[] = (decks ?? []).map((d) => ({
      id: `d-${d.id}`,
      label: d.name,
      sub: d.description,
      icon: <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />,
      group: 'Decks',
      run: go(`/deck/${d.id}`),
    }))
    const query = q.trim().toLowerCase()
    const match = (s: string) => s.toLowerCase().includes(query)
    if (!query) return [...actions, ...deckItems]
    const deckName = new Map((decks ?? []).map((d) => [d.id, d.name]))
    const cardItems: Item[] = []
    if (query.length >= 2 && cards) {
      for (const c of cards) {
        if (match(c.front) || match(c.back) || c.tags.some(match)) {
          cardItems.push({
            id: `c-${c.id}`,
            label: stripMarkdown(c.front).slice(0, 90),
            sub: `${deckName.get(c.deckId) ?? ''} · ${stripMarkdown(c.back).slice(0, 60)}`,
            icon: <FileText size={16} />,
            group: 'Cards',
            run: go(`/deck/${c.deckId}?card=${c.id}`),
          })
          if (cardItems.length >= 8) break
        }
      }
    }
    return [...actions.filter((a) => match(a.label)), ...deckItems.filter((d) => match(d.label)), ...cardItems]
  }, [q, decks, cards, nav, onNewCard, onNewDeck])

  useEffect(() => setActive(0), [q])
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const run = (it: Item) => {
    onClose()
    it.run()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(items.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[active]) run(items[active])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  let lastGroup = ''
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-xl animate-pop overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl" role="dialog" aria-label="Command palette">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search cards, decks, or actions…"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
          <kbd className="rounded-md border border-line px-1.5 text-[11px] text-faint">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 && <div className="px-3 py-10 text-center text-sm text-muted">No results for “{q}”</div>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null
            lastGroup = it.group
            return (
              <div key={it.id}>
                {header && <div className="px-3 pt-3 pb-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase">{header}</div>}
                <button
                  data-idx={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(it)}
                  className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm', i === active ? 'bg-accent-soft text-fg' : 'text-fg')}
                >
                  <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center', i === active ? 'text-accent' : 'text-muted')}>{it.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{it.label}</span>
                    {it.sub && <span className="block truncate text-xs text-muted">{it.sub}</span>}
                  </span>
                  {i === active && <CornerDownLeft size={14} className="text-faint" />}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
  )
}
