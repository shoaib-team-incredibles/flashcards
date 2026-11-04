export const DAY = 86_400_000

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export function cx(...c: (string | false | null | undefined | 0)[]) {
  return c.filter(Boolean).join(' ')
}

export function startOfDay(t = Date.now()) {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function endOfDay(t = Date.now()) {
  const d = new Date(startOfDay(t))
  d.setDate(d.getDate() + 1)
  return d.getTime()
}

export function addDays(t: number, n: number) {
  const d = new Date(t)
  d.setDate(d.getDate() + n)
  return d.getTime()
}

export function dayKey(t: number) {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function plural(n: number, word: string, pluralWord = word + 's') {
  return `${n.toLocaleString()} ${n === 1 ? word : pluralWord}`
}

export function formatDuration(ms: number) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function relativeTime(t: number, now = Date.now()) {
  const diff = t - now
  const abs = Math.abs(diff)
  const min = 60_000
  let label: string
  if (abs < min) label = 'now'
  else if (abs < 60 * min) label = `${Math.round(abs / min)}m`
  else if (abs < DAY) label = `${Math.round(abs / (60 * min))}h`
  else if (abs < 30 * DAY) label = `${Math.round(abs / DAY)}d`
  else if (abs < 365 * DAY) label = `${Math.round(abs / (30 * DAY))}mo`
  else label = `${(abs / (365 * DAY)).toFixed(1)}y`
  if (label === 'now') return 'now'
  return diff > 0 ? `in ${label}` : `${label} ago`
}

export function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Up late'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function downloadFile(name: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck'
}

export const DECK_COLORS = [
  '#6366f1', // indigo
  '#0ea5e9', // sky
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#f97316', // orange
  '#64748b', // slate
]

export function isTypingTarget(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}
