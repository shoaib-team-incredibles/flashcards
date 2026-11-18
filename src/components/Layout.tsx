import { BarChart3, BookA, ClipboardCheck, Ellipsis, FileText, Home, Languages, Layers, LibraryBig, Plus, Quote, Search, Settings, Upload, X, type LucideIcon } from 'lucide-react'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  /** Shown in the phone tab bar. Everything else lives under "More" there. */
  tab?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true, tab: true },
  { to: '/decks', label: 'Decks', icon: LibraryBig, tab: true },
  { to: '/study', label: 'Study', icon: Layers, tab: true },
  { to: '/test', label: 'Test', icon: ClipboardCheck, tab: true },
  { to: '/french', label: 'French', icon: Languages },
  { to: '/english', label: 'English', icon: BookA },
  { to: '/quotes', label: 'Quotes', icon: Quote },
  { to: '/import', label: 'Import', icon: Upload },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
]
const SETTINGS: NavItem = { to: '/settings', label: 'Settings', icon: Settings }
const TABS = NAV.filter((n) => n.tab)
const MORE = [...NAV.filter((n) => !n.tab), SETTINGS]

const TITLES: Record<string, string> = {
  '/decks': 'Decks',
  '/test': 'Test',
  '/french': 'French',
  '/english': 'English',
  '/quotes': 'Quotes',
  '/notes': 'Notes',
  '/import': 'Import',
  '/stats': 'Stats',
  '/settings': 'Settings',
}

/** A deck page belongs to the Decks tab. */
const isActive = (item: NavItem, path: string) => (item.to === '/decks' ? path === '/decks' || path.startsWith('/deck/') : item.end ? path === item.to : path.startsWith(item.to))

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
  const [more, setMore] = useState(false)
  const [create, setCreate] = useState(false)
  const createRef = useRef<HTMLDivElement>(null)

  const shell: Shell = {
    newDeck: () => setDeckOpen(true),
    newCard: (deckId) => setCardOpen({ deckId }),
    openSearch: () => setSearch(true),
  }

  useHotkeys({ '/': () => setSearch(true), n: () => setCardOpen({}) })
  useHotkeys({ 'mod+k': () => setSearch((s) => !s) }, { allowInInputs: true })

  // A new page starts at the top, with its own tab title, and without leftover menus.
  const deckName = summaries?.find((s) => loc.pathname === `/deck/${s.deck.id}`)?.deck.name
  useEffect(() => {
    window.scrollTo(0, 0)
    setMore(false)
    setCreate(false)
  }, [loc.pathname])
  useEffect(() => {
    const page = deckName ?? TITLES[loc.pathname]
    document.title = page ? `${page} · KnowDeck` : 'KnowDeck — your learning system'
  }, [loc.pathname, deckName])

  useEffect(() => {
    if (!create) return
    const close = (e: MouseEvent) => !createRef.current?.contains(e.target as Node) && setCreate(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setCreate(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [create])

  const totalDue = summaries?.reduce((s, d) => s + d.counts.total, 0) ?? 0
  const moreActive = MORE.some((n) => isActive(n, loc.pathname))

  return (
    <ShellCtx.Provider value={shell}>
      <a href="#main" className="sr-only rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50">
        Skip to content
      </a>
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
          <nav aria-label="Main" className="mt-4 space-y-0.5">
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
            <Link to="/decks" className="text-[11px] font-semibold tracking-wider text-faint uppercase hover:text-fg">
              Decks
            </Link>
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
            <button onClick={() => setDeckOpen(true)} className="flex h-8 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] text-muted transition-colors hover:bg-subtle hover:text-fg">
              <Plus size={14} className="-ml-0.5 shrink-0" />
              New deck
            </button>
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
            <button onClick={() => setSearch(true)} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-subtle" aria-label="Search">
              <Search size={20} />
            </button>
            <div className="relative" ref={createRef}>
              <button
                onClick={() => setCreate((c) => !c)}
                aria-haspopup="menu"
                aria-expanded={create}
                aria-label="Create"
                className={cx('flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-subtle', create && 'bg-subtle text-fg')}
              >
                <Plus size={22} />
              </button>
              {create && (
                <div role="menu" className="absolute right-0 z-40 mt-2 w-52 animate-pop rounded-xl border border-line bg-surface p-1.5 shadow-xl">
                  {[
                    { icon: <FileText size={16} />, label: 'Add a card', run: () => setCardOpen({}) },
                    { icon: <LibraryBig size={16} />, label: 'New deck', run: () => setDeckOpen(true) },
                  ].map((m) => (
                    <button
                      key={m.label}
                      role="menuitem"
                      onClick={() => {
                        setCreate(false)
                        m.run()
                      }}
                      className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-subtle"
                    >
                      <span className="text-muted">{m.icon}</span>
                      {m.label}
                    </button>
                  ))}
                  <Link to="/import" role="menuitem" className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-subtle">
                    <Upload size={16} className="text-muted" />
                    Import cards
                  </Link>
                </div>
              )}
            </div>
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 pb-24 md:pb-10">
          <div key={loc.pathname} className="mx-auto w-full max-w-5xl animate-in px-4 pt-6 sm:px-6 md:px-10 md:pt-10">
            <Outlet />
          </div>
        </main>

        {/* Mobile tab bar: the four everyday places, everything else under More */}
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
          {TABS.map((n) => {
            const active = isActive(n, loc.pathname)
            return (
              <Link
                key={n.to}
                to={n.to}
                aria-current={active ? 'page' : undefined}
                className={cx('relative flex h-16 min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-accent' : 'text-muted')}
              >
                <n.icon size={22} strokeWidth={active ? 2.25 : 2} />
                {n.label}
                {n.to === '/study' && totalDue > 0 && (
                  <span className="absolute top-2 left-1/2 ml-2 rounded-full bg-accent px-1.5 text-[10px] leading-4 font-semibold text-accent-fg">{totalDue > 99 ? '99+' : totalDue}</span>
                )}
              </Link>
            )
          })}
          <button
            onClick={() => setMore(true)}
            aria-haspopup="dialog"
            aria-expanded={more}
            className={cx('flex h-16 min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium', moreActive || more ? 'text-accent' : 'text-muted')}
          >
            <Ellipsis size={22} />
            More
          </button>
        </nav>
      </div>

      {more && <MoreSheet path={loc.pathname} onClose={() => setMore(false)} />}

      <DeckDialog open={deckOpen} onClose={() => setDeckOpen(false)} />
      <CardEditor open={!!cardOpen} deckId={cardOpen?.deckId} onClose={() => setCardOpen(null)} />
      <CommandPalette open={search} onClose={() => setSearch(false)} onNewDeck={() => setDeckOpen(true)} onNewCard={() => setCardOpen({})} />
    </ShellCtx.Provider>
  )
}

/** Phone only: the rest of the app, as a sheet above the tab bar. */
function MoreSheet({ path, onClose }: { path: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end md:hidden">
      <div className="absolute inset-0 animate-[fade-up_.15s_ease-out_both] bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="More" className="relative w-full animate-in rounded-t-2xl border-t border-line bg-surface px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="flex items-center justify-between px-2 pb-2">
          <h2 className="text-[15px] font-semibold">More</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-subtle">
            <X size={19} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {MORE.map((n) => {
            const active = isActive(n, path)
            return (
              <Link
                key={n.to}
                to={n.to}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex h-20 flex-col items-center justify-center gap-2 rounded-xl border text-[13px] font-medium transition-colors',
                  active ? 'border-accent/30 bg-accent-soft text-accent' : 'border-line bg-bg text-fg hover:bg-subtle',
                )}
              >
                <n.icon size={21} className={active ? '' : 'text-muted'} />
                {n.label}
              </Link>
            )
          })}
        </div>
      </div>
    </div>,
    document.body,
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
