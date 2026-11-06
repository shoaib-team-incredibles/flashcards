import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, BookOpen, ClipboardCheck, Flame, Layers, Plus, Quote as QuoteIcon, Sparkles, Target, Upload, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Heatmap } from '../components/Charts'
import { Section, useShell } from '../components/Layout'
import { useToast } from '../components/toast'
import { Button, Kbd, Panel, Progress, Stat } from '../components/ui'
import { db } from '../lib/db'
import { useDeckSummaries, useHotkeys } from '../lib/hooks'
import { loadSampleDecks } from '../lib/sample'
import { byline, quoteOfTheDay, useQuotes } from '../lib/quotes'
import { computeStreak } from '../lib/session'
import { DAY, dayKey, formatDuration, greeting, plural, relativeTime, startOfDay } from '../lib/utils'

export function Dashboard() {
  const summaries = useDeckSummaries()
  const shell = useShell()
  const nav = useNavigate()
  const quotes = useQuotes()
  const todaysQuote = useMemo(() => quoteOfTheDay(quotes ?? []), [quotes])
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  const reviews = useLiveQuery(() => db.reviews.where('ts').above(Date.now() - 366 * DAY).toArray(), [])
  const nextDue = useLiveQuery(async () => {
    const c = await db.cards.where('due').above(Date.now()).filter((c) => c.state !== 0 && !c.suspended).first()
    return c?.due ?? null
  }, [])

  const activity = useMemo(() => {
    const counts = new Map<string, number>()
    let today = 0
    let todayMs = 0
    const sod = startOfDay()
    let recall = 0
    let recallTotal = 0
    for (const r of reviews ?? []) {
      const k = dayKey(r.ts)
      counts.set(k, (counts.get(k) ?? 0) + 1)
      if (r.ts >= sod) {
        today++
        todayMs += r.durationMs
      }
      if (r.prevState === 2 && r.ts > Date.now() - 30 * DAY) {
        recallTotal++
        if (r.rating > 1) recall++
      }
    }
    return { counts, today, todayMs, streak: computeStreak(new Set(counts.keys()), dayKey), retention: recallTotal ? recall / recallTotal : null }
  }, [reviews])

  const totals = useMemo(() => {
    const t = { new: 0, learning: 0, review: 0, total: 0, cards: 0, mature: 0 }
    for (const s of summaries ?? []) {
      t.new += s.counts.new
      t.learning += s.counts.learning
      t.review += s.counts.review
      t.total += s.counts.total
      t.cards += s.total
      t.mature += s.mature
    }
    return t
  }, [summaries])

  useHotkeys({ enter: () => totals.total > 0 && nav('/study'), s: () => totals.total > 0 && nav('/study') })

  if (!summaries) return <div className="h-64" />

  if (summaries.length === 0) {
    return (
      <div className="mx-auto max-w-2xl py-6 sm:py-12">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
          <Sparkles size={13} /> Welcome to KnowDeck
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Learn anything. Remember it for good.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Bring your notes, Anki exports or spreadsheets. KnowDeck schedules each card at the moment you're about to forget it, and tests you to make sure it sticks. Everything stays private in this browser.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            { icon: <Plus size={18} />, title: 'Create a deck', body: 'Start from scratch and add cards.', onClick: shell.newDeck },
            { icon: <Upload size={18} />, title: 'Import cards', body: 'Paste notes, CSV, Anki, Markdown.', onClick: () => nav('/import') },
            {
              icon: <Sparkles size={18} />,
              title: 'Try sample decks',
              body: 'See how it works in 2 minutes.',
              onClick: async () => {
                setLoading(true)
                await loadSampleDecks()
                setLoading(false)
                toast('Added 2 sample decks')
              },
            },
          ].map((o) => (
            <button
              key={o.title}
              disabled={loading}
              onClick={o.onClick}
              className="group rounded-2xl border border-line bg-surface p-5 text-left transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent transition-transform group-hover:scale-105">{o.icon}</div>
              <div className="font-semibold">{o.title}</div>
              <div className="mt-1 text-[13px] text-muted">{o.body}</div>
            </button>
          ))}
        </div>
        <div className="mt-10 grid gap-4 text-[13px] text-muted sm:grid-cols-3">
          <p><span className="font-semibold text-fg">Spaced repetition.</span> FSRS — the same modern algorithm Anki uses.</p>
          <p><span className="font-semibold text-fg">Real tests.</span> Multiple choice, typed answers, true/false.</p>
          <p><span className="font-semibold text-fg">Keyboard first.</span> Space to flip, 1–4 to grade, ⌘K for everything.</p>
        </div>
      </div>
    )
  }

  const est = Math.round((totals.review * 8 + totals.learning * 10 + totals.new * 20) / 60)

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-muted">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-[28px]">{greeting()}</h1>
      </div>

      {/* Hero */}
      <Panel className="relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        {totals.total > 0 ? (
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-muted">Due today</div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="text-5xl font-semibold tracking-tight tabular-nums">{totals.total}</span>
                <span className="text-sm text-muted">{est > 0 ? `~${est} min` : '< 1 min'}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-[13px]">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-easy" />{totals.new} new</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-hard" />{totals.learning} learning</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-good" />{totals.review} review</span>
              </div>
            </div>
            <Button variant="primary" size="lg" onClick={() => nav('/study')} className="sm:min-w-48">
              Start studying <ArrowRight size={17} />
              <Kbd onAccent className="ml-1 max-sm:hidden">↵</Kbd>
            </Button>
          </div>
        ) : (
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xl font-semibold">You're all caught up ✨</div>
              <p className="mt-1 text-sm text-muted">
                {nextDue ? `Next review ${relativeTime(nextDue)}. ` : ''}Add new cards or test yourself to keep the momentum.
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => nav('/test')}>
                <ClipboardCheck size={16} /> Take a test
              </Button>
              <Button variant="primary" onClick={() => shell.newCard()}>
                <Plus size={16} /> Add cards
              </Button>
            </div>
          </div>
        )}
      </Panel>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Flame size={14} className="text-hard" />} label="Streak" value={plural(activity.streak, 'day')} sub={activity.streak ? 'Keep it going' : 'Review today to start'} />
        <Stat icon={<Zap size={14} className="text-accent" />} label="Reviewed today" value={activity.today} sub={activity.todayMs ? formatDuration(activity.todayMs) + ' spent' : 'Nothing yet'} />
        <Stat
          icon={<Target size={14} className="text-good" />}
          label="Retention (30d)"
          value={activity.retention == null ? '—' : `${Math.round(activity.retention * 100)}%`}
          sub="Reviews answered correctly"
        />
        <Stat icon={<BookOpen size={14} className="text-easy" />} label="Cards" value={totals.cards.toLocaleString()} sub={`${totals.mature.toLocaleString()} mature`} />
      </div>

      {todaysQuote && (
        <Link to="/quotes" className="mt-4 flex gap-4 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-line-strong">
          <QuoteIcon size={18} className="mt-1 shrink-0 text-accent" />
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-muted">Quote of the day</div>
            <p className="mt-1 text-[15px] leading-relaxed font-medium whitespace-pre-line">{todaysQuote.text}</p>
            {todaysQuote.author && <p className="mt-1 text-sm text-muted">{byline(todaysQuote)}</p>}
          </div>
        </Link>
      )}

      <Section
        title="Your decks"
        action={
          <Button size="sm" variant="ghost" onClick={shell.newDeck}>
            <Plus size={15} /> New deck
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {summaries.map(({ deck, counts, total, mature }) => (
            <Link
              key={deck.id}
              to={`/deck/${deck.id}`}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg hover:shadow-black/[0.04]"
            >
              <div className="absolute inset-y-0 left-0 w-1" style={{ background: deck.color }} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{deck.name}</div>
                  <div className="mt-0.5 truncate text-[13px] text-muted">{deck.description || plural(total, 'card')}</div>
                </div>
                {counts.total > 0 ? (
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      nav(`/study?deck=${deck.id}`)
                    }}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-fg"
                  >
                    <Layers size={13} /> Study {counts.total}
                  </button>
                ) : (
                  <span className="shrink-0 rounded-lg bg-subtle px-2.5 py-1.5 text-xs font-medium text-faint">Done</span>
                )}
              </div>
              <div className="mt-5 flex items-center gap-4 text-xs text-muted tabular-nums">
                <span><b className="font-semibold text-easy">{counts.new}</b> new</span>
                <span><b className="font-semibold text-hard">{counts.learning}</b> learning</span>
                <span><b className="font-semibold text-good">{counts.review}</b> due</span>
                <span className="ml-auto">{total ? Math.round((mature / total) * 100) : 0}% mastered</span>
              </div>
              <Progress className="mt-2" value={total ? mature / total : 0} color={deck.color} />
            </Link>
          ))}
        </div>
      </Section>

      <Section title="Activity" action={<Link to="/stats" className="text-[13px] font-medium text-accent hover:underline">All stats</Link>}>
        <Panel className="p-5">
          <Heatmap counts={activity.counts} weeks={30} />
        </Panel>
      </Section>
    </div>
  )
}
