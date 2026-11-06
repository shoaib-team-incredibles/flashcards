import { BarChart3, BookA, ClipboardCheck, Home, Languages, Layers, Plus, Quote, Search, Settings, Upload } from 'lucide-react'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useDeckSummaries, useHotkeys } from '../lib/hooks'
import { cx } from '../lib/utils'
import { CardEditor } from './CardEditor'
import { CommandPalette } from './CommandPalette'
import { DeckDialog } from './DeckDialog'
import { Kbd } from './ui'

interface Shell {
  newDeck: () => void
  newCard: (deckId?: string) => void
  openSearch: () => void
}
const ShellCtx = createContext<Shell>({ newDeck: () => {}, newCard: () => {}, openSearch: () => {} })
export const useShell = () => useContext(ShellCtx)

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/study', label: 'Study', icon: Layers },
  { to: '/test', label: 'Test', icon: ClipboardCheck },
  { to: '/french', label: 'French', icon: Languages },
  { to: '/english', label: 'English', icon: BookA },
  { to: '/quotes', label: 'Quotes', icon: Quote },
  { to: '/import', label: 'Import', icon: Upload },
  { to: '/stats', label: 'Stats', icon: BarChart3, mobile: false },
]

/** The app logo. Always links home. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" aria-label="KnowDeck — go to home" className={cx('flex w-fit items-center gap-2.5 rounded-xl transition-opacity hover:opacity-80', className)}>
      <div className="relative flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-accent-fg shadow-sm shadow-accent/30">
        <div className="absolute top-[7px] h-[2px] w-3.5 rounded-full bg-accent-fg/60" />
        <div className="mt-1 h-3 w-4 rounded-[3px] border-2 border-accent-fg" />
      </div>
      <span className="text-[17px] font-semibold tracking-tight">KnowDeck</span>
    </Link>
  )
}

export function Layout() {
  const summaries = useDeckSummaries()
  const loc = useLocation()
  const [deckOpen, setDeckOpen] = useState(false)
  const [cardOpen, setCardOpen] = useState<{ deckId?: string } | null>(null)
  const [search, setSearch] = useState(false)

  const shell: Shell = {
    newDeck: () => setDeckOpen(true),
    newCard: (deckId) => setCardOpen({ deckId }),
    openSearch: () => setSearch(true),
  }

  useHotkeys({ '/': () => setSearch(true), n: () => setCardOpen({}) })
  useHotkeys({ 'mod+k': () => setSearch((s) => !s) }, { allowInInputs: true })

  const totalDue = summaries?.reduce((s, d) => s + d.counts.total, 0) ?? 0

  return (
    <ShellCtx.Provider value={shell}>
      <div className="min-h-dvh md:flex">
        {/* Sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-surface/60 px-3 py-4 md:flex">
          <Logo className="px-2" />
          <button
            onClick={() => setSearch(true)}
            className="mt-5 flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13px] text-faint transition-colors hover:border-line-strong"
          >
            <Search size={15} />
            <span className="flex-1 text-left">Search</span>
            <Kbd>⌘K</Kbd>
          </button>
          <nav className="mt-4 space-y-0.5">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx(
                    'flex h-9 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                    isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-subtle hover:text-fg',
                  )
                }
              >
                <n.icon size={17} />
                <span className="flex-1">{n.label}</span>
                {n.to === '/study' && totalDue > 0 && <span className="rounded-md bg-accent px-1.5 text-[11px] leading-5 font-semibold text-accent-fg tabular-nums">{totalDue}</span>}
              </NavLink>
            ))}
          </nav>

          <div className="mt-6 flex items-center justify-between px-3">
            <span className="text-[11px] font-semibold tracking-wider text-faint uppercase">Decks</span>
            <button onClick={() => setDeckOpen(true)} className="rounded-md p-1 text-faint hover:bg-subtle hover:text-fg" aria-label="New deck" title="New deck">
              <Plus size={15} />
            </button>
          </div>
          <div className="mt-1 -mr-1 flex-1 space-y-0.5 overflow-y-auto pr-1">
            {summaries?.map(({ deck, counts }) => (
              <NavLink
                key={deck.id}
                to={`/deck/${deck.id}`}
                className={({ isActive }) =>
                  cx('flex h-8 items-center gap-2.5 rounded-lg px-3 text-[13px] transition-colors', isActive ? 'bg-subtle font-medium text-fg' : 'text-muted hover:bg-subtle hover:text-fg')
                }
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: deck.color }} />
                <span className="flex-1 truncate">{deck.name}</span>
                {counts.total > 0 && <span className="text-[11px] font-medium text-faint tabular-nums">{counts.total}</span>}
              </NavLink>
            ))}
            {summaries && summaries.length === 0 && <p className="px-3 py-2 text-[13px] text-faint">No decks yet</p>}
          </div>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cx('mt-2 flex h-9 items-center gap-3 rounded-xl px-3 text-sm font-medium', isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-subtle hover:text-fg')
            }
          >
            <Settings size={17} /> Settings
          </NavLink>
        </aside>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur-md md:hidden">
          <Logo />
          <div className="flex gap-1">
            <button onClick={() => setSearch(true)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-subtle" aria-label="Search">
              <Search size={19} />
            </button>
            <NavLink to="/stats" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-subtle" aria-label="Stats">
              <BarChart3 size={19} />
            </NavLink>
            <NavLink to="/settings" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-subtle" aria-label="Settings">
              <Settings size={19} />
            </NavLink>
          </div>
        </header>

        <main className="min-w-0 flex-1 pb-24 md:pb-10">
          <div key={loc.pathname} className="mx-auto w-full max-w-5xl animate-in px-4 pt-6 sm:px-6 md:px-10 md:pt-10">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          {NAV.filter((n) => n.mobile !== false).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cx('relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-accent' : 'text-faint')}
            >
              <n.icon size={20} />
              {n.label}
              {n.to === '/study' && totalDue > 0 && (
                <span className="absolute top-2 left-1/2 ml-2 rounded-full bg-accent px-1.5 text-[10px] leading-4 font-semibold text-accent-fg">{totalDue > 99 ? '99+' : totalDue}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <DeckDialog open={deckOpen} onClose={() => setDeckOpen(false)} />
      <CardEditor open={!!cardOpen} deckId={cardOpen?.deckId} onClose={() => setCardOpen(null)} />
      <CommandPalette open={search} onClose={() => setSearch(false)} onNewDeck={() => setDeckOpen(true)} onNewCard={() => setCardOpen({})} />
    </ShellCtx.Provider>
  )
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('mt-10', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
