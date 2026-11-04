import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart3 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { BarChart, dailySeries, Heatmap, StackedBar, type BarDatum } from '../components/Charts'
import { Section } from '../components/Layout'
import { Button, EmptyState, PageHeader, Panel, Segmented, Stat } from '../components/ui'
import { db } from '../lib/db'
import { RATING_LABEL, type Rating } from '../lib/fsrs'
import { useDeckSummaries } from '../lib/hooks'
import { computeStreak } from '../lib/session'
import { addDays, DAY, dayKey, formatDuration, startOfDay } from '../lib/utils'
import { useNavigate } from 'react-router-dom'

export function Stats() {
  const nav = useNavigate()
  const [range, setRange] = useState(30)
  const reviews = useLiveQuery(() => db.reviews.toArray(), [])
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const tests = useLiveQuery(() => db.tests.orderBy('createdAt').toArray(), [])
  const summaries = useDeckSummaries()

  const s = useMemo(() => {
    if (!reviews || !cards) return null
    const since = Date.now() - range * DAY
    const inRange = reviews.filter((r) => r.ts >= since)
    const counts = new Map<string, number>()
    for (const r of reviews) counts.set(dayKey(r.ts), (counts.get(dayKey(r.ts)) ?? 0) + 1)
    const matureReviews = inRange.filter((r) => r.prevState === 2)
    const retention = matureReviews.length ? matureReviews.filter((r) => r.rating > 1).length / matureReviews.length : null
    const ratings: Record<Rating, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
    for (const r of inRange) ratings[r.rating]++
    const time = inRange.reduce((t, r) => t + r.durationMs, 0)
    const studyReviews = inRange.filter((r) => r.source === 'study')
    const avg = studyReviews.length ? studyReviews.reduce((t, r) => t + r.durationMs, 0) / studyReviews.length : 0

    // Forecast
    const sod = startOfDay()
    const forecastDays = Math.min(range, 30)
    const fc = new Array(forecastDays).fill(0)
    for (const c of cards) {
      if (c.state === 0 || c.suspended) continue
      const d = Math.max(0, Math.floor((startOfDay(c.due) - sod) / DAY))
      if (d < forecastDays) fc[d]++
    }
    const forecast: BarDatum[] = fc.map((v, i) => {
      const t = addDays(sod, i)
      return {
        value: v,
        label: i === 0 ? 'Today' : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        hint: i === 0 ? 'Due today (incl. overdue)' : new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      }
    })

    const states = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0 }
    for (const c of cards) {
      if (c.suspended) states.suspended++
      else if (c.state === 0) states.new++
      else if (c.state === 1 || c.state === 3) states.learning++
      else if (c.stability >= 21) states.mature++
      else states.young++
    }

    return {
      inRange,
      counts,
      retention,
      ratings,
      time,
      avg,
      forecast,
      states,
      streak: computeStreak(new Set(counts.keys()), dayKey),
      daysStudied: new Set(inRange.map((r) => dayKey(r.ts))).size,
      series: dailySeries(inRange.map((r) => r.ts), range),
    }
  }, [reviews, cards, range])

  const testSeries: BarDatum[] = useMemo(
    () =>
      (tests ?? []).slice(-30).map((t) => ({
        value: t.total ? Math.round((t.correct / t.total) * 100) : 0,
        label: new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        hint: `% · ${t.correct}/${t.total} on ${new Date(t.createdAt).toLocaleDateString()}`,
      })),
    [tests],
  )

  if (!s) return <div className="h-64" />

  if (!reviews?.length && !cards?.length)
    return (
      <EmptyState icon={<BarChart3 size={22} />} title="No stats yet" body="Study some cards and your progress will show up here.">
        <Button variant="primary" onClick={() => nav('/')}>
          Get started
        </Button>
      </EmptyState>
    )

  return (
    <div>
      <PageHeader
        title="Statistics"
        description="How your memory is doing over time."
        actions={
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: 7, label: '7d' },
              { value: 30, label: '30d' },
              { value: 90, label: '90d' },
              { value: 365, label: '1y' },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Reviews" value={s.inRange.length.toLocaleString()} sub={`${s.daysStudied} of ${range} days studied`} />
        <Stat label="True retention" value={s.retention == null ? '—' : `${Math.round(s.retention * 100)}%`} sub="Review cards recalled" />
        <Stat label="Time studied" value={formatDuration(s.time)} sub={s.avg ? `${(s.avg / 1000).toFixed(1)}s per card` : '—'} />
        <Stat label="Current streak" value={`${s.streak}d`} sub="Consecutive days" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <h3 className="text-sm font-semibold">Reviews per day</h3>
          <div className="mt-3">
            <BarChart data={s.series} />
          </div>
        </Panel>
        <Panel className="p-5">
          <h3 className="text-sm font-semibold">Upcoming reviews</h3>
          <div className="mt-3">
            <BarChart data={s.forecast} color="var(--c-good)" emptyLabel="Nothing scheduled" />
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <h3 className="mb-4 text-sm font-semibold">Card maturity</h3>
          <StackedBar
            parts={[
              { label: 'New', value: s.states.new, color: 'var(--c-easy)' },
              { label: 'Learning', value: s.states.learning, color: 'var(--c-hard)' },
              { label: 'Young', value: s.states.young, color: 'color-mix(in oklab, var(--c-good) 55%, var(--c-subtle))' },
              { label: 'Mature', value: s.states.mature, color: 'var(--c-good)' },
              { label: 'Suspended', value: s.states.suspended, color: 'var(--c-line-strong)' },
            ]}
          />
          <p className="mt-4 text-xs text-muted">Mature cards have an interval of 21 days or more — they’re in long-term memory.</p>
        </Panel>
        <Panel className="p-5">
          <h3 className="mb-4 text-sm font-semibold">Answer buttons</h3>
          <StackedBar
            parts={([1, 2, 3, 4] as Rating[]).map((r) => ({
              label: RATING_LABEL[r],
              value: s.ratings[r],
              color: ['', 'var(--c-again)', 'var(--c-hard)', 'var(--c-good)', 'var(--c-easy)'][r],
            }))}
          />
          <p className="mt-4 text-xs text-muted">Most answers should be “Good”. Lots of “Again” means cards may be too complex — try splitting them.</p>
        </Panel>
      </div>

      {testSeries.length > 0 && (
        <Section title="Test scores">
          <Panel className="p-5">
            <BarChart data={testSeries} color="var(--c-easy)" />
          </Panel>
        </Section>
      )}

      <Section title="Activity · last 12 months">
        <Panel className="p-5">
          <Heatmap counts={s.counts} weeks={53} />
        </Panel>
      </Section>

      {summaries && summaries.length > 0 && (
        <Section title="By deck">
          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-medium">Deck</th>
                  <th className="px-3 py-3 text-right font-medium">Cards</th>
                  <th className="px-3 py-3 text-right font-medium">Due</th>
                  <th className="px-3 py-3 text-right font-medium">Mature</th>
                  <th className="px-5 py-3 text-right font-medium">Mastery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {summaries.map(({ deck, total, mature, counts }) => (
                  <tr key={deck.id}>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="h-2 w-2 rounded-full" style={{ background: deck.color }} />
                        {deck.name}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{total}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{counts.total}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{mature}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{total ? Math.round((mature / total) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </Section>
      )}
    </div>
  )
}
