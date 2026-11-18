import { Layers } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { DeckSummary } from '../lib/hooks'
import { plural } from '../lib/utils'
import { Progress } from './ui'

/** A deck as a card: name, what's due, and how much of it is mastered. Opens the deck; the button starts studying it. */
export function DeckCard({ summary }: { summary: DeckSummary }) {
  const nav = useNavigate()
  const { deck, counts, total, mature } = summary
  const pct = total ? mature / total : 0
  return (
    <Link
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
            aria-label={`Study ${counts.total} due in ${deck.name}`}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-fg"
          >
            <Layers size={13} /> Study {counts.total}
          </button>
        ) : (
          <span className="shrink-0 rounded-lg bg-subtle px-2.5 py-1.5 text-xs font-medium text-faint">{total ? 'Done' : 'Empty'}</span>
        )}
      </div>
      <div className="mt-5 flex items-center gap-3 text-xs whitespace-nowrap text-muted tabular-nums sm:gap-4">
        <span><b className="font-semibold text-easy">{counts.new}</b> new</span>
        <span><b className="font-semibold text-hard">{counts.learning}</b> learning</span>
        <span><b className="font-semibold text-good">{counts.review}</b> due</span>
        {deck.description && <span className="ml-auto truncate">{plural(total, 'card')}</span>}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Progress className="flex-1" value={pct} color={deck.color} />
        <span className="text-[11px] text-faint tabular-nums" title="Cards with an interval of 21 days or more">{Math.round(pct * 100)}% mastered</span>
      </div>
    </Link>
  )
}
