import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, BookOpen, Check, Plus, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/toast'
import { Button, PageHeader, Panel } from '../components/ui'
import { db } from '../lib/db'
import { diffEnglish, ENGLISH_DECK, installEnglishDeck } from '../lib/english'
import { useDeckSummaries } from '../lib/hooks'
import { stripMarkdown } from '../lib/markdown'

export function English() {
  const summaries = useDeckSummaries()
  const toast = useToast()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const d = ENGLISH_DECK

  // id of the user's copy: the fixed id, or a deck with the same name.
  const deckId = useMemo(() => {
    const list = summaries ?? []
    return list.find((s) => s.deck.id === d.id)?.deck.id ?? list.find((s) => s.deck.name === d.name)?.deck.id
  }, [summaries, d.id, d.name])

  // How many bundled cards the installed deck doesn't have yet, or has in an older wording.
  const pending = useLiveQuery(async () => {
    if (!deckId) return 0
    const { add, update } = diffEnglish(await db.cards.where('deckId').equals(deckId).toArray())
    return add.length + update.length
  }, [deckId])

  async function add() {
    setBusy(true)
    try {
      const r = await installEnglishDeck()
      const what = [r.added && `added ${r.added} cards`, r.updated && `updated ${r.updated}`].filter(Boolean).join(' · ') || 'already up to date'
      toast(`English vocabulary · ${what}`)
    } finally {
      setBusy(false)
    }
  }

  const sample = d.cards[0]
  return (
    <div>
      <PageHeader title="English" description="A ready-made deck of rich, uncommon English words." />
      <div className="grid gap-3 md:grid-cols-3">
        <Panel className="relative flex flex-col overflow-hidden p-5">
          <div className="absolute inset-x-0 top-0 h-1" style={{ background: d.color }} />
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: d.color }}>
              <BookOpen size={18} />
            </div>
            <div className="min-w-0">
              <div className="font-semibold leading-tight">{d.name.replace('English — ', '')}</div>
              <div className="text-[13px] text-muted tabular-nums">{d.cards.length} cards</div>
            </div>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">{d.description}</p>
          <div className="mt-4 rounded-xl border border-line bg-subtle/60 px-3.5 py-3 text-[13px]">
            <div className="font-medium">{stripMarkdown(sample.front)}</div>
            <div className="mt-0.5 truncate text-muted">{stripMarkdown(sample.back.split('\n')[0])}</div>
          </div>
          <div className="mt-auto pt-4">
            {deckId && (pending ?? 0) > 0 ? (
              <Button variant="soft" className="w-full" disabled={busy} onClick={add} title="Adds new cards and refreshes corrected ones. Your progress is kept.">
                <RefreshCw size={16} /> {busy ? 'Updating…' : `Update ${(pending ?? 0).toLocaleString()} cards`}
              </Button>
            ) : deckId ? (
              <Button variant="soft" className="w-full" onClick={() => nav(`/deck/${deckId}`)}>
                <Check size={16} /> In your decks <ArrowRight size={15} className="ml-auto" />
              </Button>
            ) : (
              <Button className="w-full" disabled={busy} onClick={add}>
                <Plus size={16} /> {busy ? 'Adding…' : 'Add deck'}
              </Button>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
