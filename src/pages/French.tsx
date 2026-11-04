import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, BookOpen, Check, MessageCircle, Plus, RefreshCw, Sparkles } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/toast'
import { Button, Markdown, PageHeader, Panel } from '../components/ui'
import { db } from '../lib/db'
import { FRENCH_DECKS, FRENCH_GUIDE, diffDeck, installFrenchDeck, type FrenchDeck } from '../lib/french'
import { frenchDeckId } from '../lib/french-core'
import { useDeckSummaries } from '../lib/hooks'
import { stripMarkdown } from '../lib/markdown'

const ICONS: Record<string, ReactNode> = {
  vocab: <BookOpen size={18} />,
  expressions: <MessageCircle size={18} />,
  grammar: <Sparkles size={18} />,
}

export function French() {
  const summaries = useDeckSummaries()
  const toast = useToast()
  const nav = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const guideRef = useRef<HTMLDivElement>(null)

  // name → id of the user's copy: the fixed French id, or (older installs) a deck with the same name.
  const installed = useMemo(() => {
    const ids = new Set((summaries ?? []).map((s) => s.deck.id))
    const byName = new Map((summaries ?? []).map((s) => [s.deck.name, s.deck.id]))
    const m = new Map<string, string>()
    for (const d of FRENCH_DECKS) {
      const id = ids.has(frenchDeckId(d.key)) ? frenchDeckId(d.key) : byName.get(d.name)
      if (id) m.set(d.name, id)
    }
    return m
  }, [summaries])

  // How many bundled cards each installed deck doesn't have yet (e.g. after the decks grow).
  const ids = FRENCH_DECKS.map((d) => installed.get(d.name)).filter((x): x is string => !!x)
  const pending = useLiveQuery(async () => {
    const cards = await db.cards.where('deckId').anyOf(ids).toArray()
    const out: Record<string, number> = {}
    for (const d of FRENCH_DECKS) {
      const id = installed.get(d.name)
      if (!id) continue
      const { add, update } = diffDeck(d, cards.filter((c) => c.deckId === id))
      out[d.key] = add.length + update.length
    }
    return out
  }, [ids.join()])

  const todo = FRENCH_DECKS.filter((d) => !installed.has(d.name) || (pending?.[d.key] ?? 0) > 0)
  const allNew = todo.length === FRENCH_DECKS.length && todo.every((d) => !installed.has(d.name))
  const sections = useMemo(() => [...FRENCH_GUIDE.matchAll(/^## (.+)$/gm)].map((m) => m[1]), [])

  async function add(decks: FrenchDeck[], key: string) {
    setBusy(key)
    try {
      let added = 0
      let updated = 0
      for (const d of decks) {
        const r = await installFrenchDeck(d)
        added += r.added
        updated += r.updated
      }
      const what = [added && `added ${added} cards`, updated && `updated ${updated}`].filter(Boolean).join(' · ') || 'already up to date'
      toast(decks.length === 1 ? `${decks[0].name.replace('French — ', '')} · ${what}` : `French decks · ${what}`)
    } finally {
      setBusy(null)
    }
  }

  function jumpTo(i: number) {
    guideRef.current?.querySelectorAll('h2')[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span aria-hidden className="flex h-7 w-10 overflow-hidden rounded-md shadow-sm ring-1 ring-black/5">
              <span className="flex-1 bg-[#0055a4]" />
              <span className="flex-1 bg-white" />
              <span className="flex-1 bg-[#ef4135]" />
            </span>
            French
          </span>
        }
        description="Three ready-made decks and a complete roadmap from your first bonjour to fluency."
        actions={
          pending &&
          todo.length > 0 && (
            <Button variant="primary" disabled={!!busy} onClick={() => add(todo, 'all')}>
              {allNew ? <Plus size={16} /> : <RefreshCw size={16} />} {allNew ? 'Add all 3 decks' : 'Update all decks'}
            </Button>
          )
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        {FRENCH_DECKS.map((d) => {
          const deckId = installed.get(d.name)
          const sample = d.cards[0]
          return (
            <Panel key={d.key} className="relative flex flex-col overflow-hidden p-5">
              <div className="absolute inset-x-0 top-0 h-1" style={{ background: d.color }} />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: d.color }}>
                  {ICONS[d.key]}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold leading-tight">{d.name.replace('French — ', '')}</div>
                  <div className="text-[13px] text-muted tabular-nums">{d.cards.length} cards</div>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{d.description}</p>
              <div className="mt-4 rounded-xl border border-line bg-subtle/60 px-3.5 py-3 text-[13px]">
                <div className="font-medium">{stripMarkdown(sample.front)}</div>
                <div className="mt-0.5 truncate text-muted">{stripMarkdown(sample.back.split('\n')[0])}</div>
              </div>
              <div className="mt-auto pt-4">
                {deckId && (pending?.[d.key] ?? 0) > 0 ? (
                  <Button variant="soft" className="w-full" disabled={!!busy} onClick={() => add([d], d.key)} title="Adds new cards and refreshes corrected ones. Your progress is kept.">
                    <RefreshCw size={16} /> {busy === d.key ? 'Updating…' : `Update ${(pending?.[d.key] ?? 0).toLocaleString()} cards`}
                  </Button>
                ) : deckId ? (
                  <Button variant="soft" className="w-full" onClick={() => nav(`/deck/${deckId}`)}>
                    <Check size={16} /> In your decks <ArrowRight size={15} className="ml-auto" />
                  </Button>
                ) : (
                  <Button className="w-full" disabled={!!busy} onClick={() => add([d], d.key)}>
                    <Plus size={16} /> {busy === d.key ? 'Adding…' : 'Add deck'}
                  </Button>
                )}
              </div>
            </Panel>
          )
        })}
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">How to master French</h2>
        <p className="mt-1 text-sm text-muted">Everything you need: timeline, daily routine, what to learn in each phase, and where to find it.</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {sections.map((s, i) => (
            <button
              key={s}
              onClick={() => jumpTo(i)}
              className="rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              {s}
            </button>
          ))}
        </div>
        <Panel className="mt-4 p-5 sm:p-8">
          <div ref={guideRef} className="guide">
            <Markdown source={FRENCH_GUIDE} className="text-[15px]" />
          </div>
        </Panel>
      </section>
    </div>
  )
}
