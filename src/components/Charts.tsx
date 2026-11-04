import { useMemo, useState } from 'react'
import { DAY, addDays, cx, dayKey, startOfDay } from '../lib/utils'

export interface BarDatum {
  label: string
  value: number
  hint?: string
}

export function BarChart({ data, height = 140, color = 'var(--c-accent)', emptyLabel = 'No data yet' }: { data: BarDatum[]; height?: number; color?: string; emptyLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const total = data.reduce((s, d) => s + d.value, 0)
  const shown = hover != null ? data[hover] : null
  return (
    <div>
      <div className="mb-2 h-5 text-xs text-muted tabular-nums">
        {shown ? (
          <>
            <span className="font-semibold text-fg">{shown.value.toLocaleString()}</span> · {shown.hint ?? shown.label}
          </>
        ) : total === 0 ? (
          emptyLabel
        ) : null}
      </div>
      <div className="flex items-end gap-[3px]" style={{ height }} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
            <div
              className={cx('w-full rounded-t-[4px] transition-opacity', hover != null && hover !== i && 'opacity-40')}
              style={{ height: d.value ? `${Math.max(3, (d.value / max) * 100)}%` : 2, background: d.value ? color : 'var(--c-line)' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-faint">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  )
}

/** GitHub-style activity heatmap. */
export function Heatmap({ counts, weeks = 26 }: { counts: Map<string, number>; weeks?: number }) {
  const cells = useMemo(() => {
    const today = startOfDay()
    const dow = new Date(today).getDay()
    const start = addDays(today, -(weeks - 1) * 7 - dow)
    const out: { key: string; t: number; n: number; future: boolean }[] = []
    for (let i = 0; i < weeks * 7; i++) {
      const t = addDays(start, i)
      const key = dayKey(t)
      out.push({ key, t, n: counts.get(key) ?? 0, future: t > today })
    }
    return out
  }, [counts, weeks])
  const max = Math.max(1, ...cells.map((c) => c.n))
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)))
  const shades = ['var(--c-subtle)', 'color-mix(in oklab, var(--c-accent) 28%, var(--c-subtle))', 'color-mix(in oklab, var(--c-accent) 50%, var(--c-subtle))', 'color-mix(in oklab, var(--c-accent) 75%, var(--c-subtle))', 'var(--c-accent)']
  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]">
          {cells.map((c) => (
            <div
              key={c.key}
              title={c.future ? '' : `${c.n} review${c.n === 1 ? '' : 's'} · ${new Date(c.t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`}
              className="h-[13px] w-[13px] rounded-[3px]"
              style={{ background: c.future ? 'transparent' : shades[level(c.n)] }}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-faint">
        Less
        {shades.map((s) => (
          <span key={s} className="h-[11px] w-[11px] rounded-[3px]" style={{ background: s }} />
        ))}
        More
      </div>
    </div>
  )
}

export function Ring({ value, size = 120, stroke = 10, color = 'var(--c-accent)', children }: { value: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--c-subtle)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  )
}

export function StackedBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-subtle">
        {parts.map((p) => (p.value ? <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} /> : null))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-2 text-[13px]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
            <span className="text-muted">{p.label}</span>
            <span className="font-semibold tabular-nums">{p.value.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function dailySeries(timestamps: number[], days: number) {
  const today = startOfDay()
  const map = new Map<string, number>()
  for (const t of timestamps) {
    if (t < today - days * DAY) continue
    const k = dayKey(t)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  const out: BarDatum[] = []
  for (let i = days - 1; i >= 0; i--) {
    const t = addDays(today, -i)
    const n = map.get(dayKey(t)) ?? 0
    out.push({
      label: i === 0 ? 'Today' : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: n,
      hint: new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    })
  }
  return out
}
