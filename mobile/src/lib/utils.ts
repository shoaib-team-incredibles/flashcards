export const DAY = 86_400_000;

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function startOfDay(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(t = Date.now()) {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function addDays(t: number, n: number) {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function dayKey(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function plural(n: number, word: string, pluralWord = word + 's') {
  return `${n.toLocaleString()} ${n === 1 ? word : pluralWord}`;
}

export function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function relativeTime(t: number, now = Date.now()) {
  const diff = t - now;
  const abs = Math.abs(diff);
  const min = 60_000;
  let label: string;
  if (abs < min) return 'now';
  else if (abs < 60 * min) label = `${Math.round(abs / min)}m`;
  else if (abs < DAY) label = `${Math.round(abs / (60 * min))}h`;
  else if (abs < 30 * DAY) label = `${Math.round(abs / DAY)}d`;
  else if (abs < 365 * DAY) label = `${Math.round(abs / (30 * DAY))}mo`;
  else label = `${(abs / (365 * DAY)).toFixed(1)}y`;
  return diff > 0 ? `in ${label}` : `${label} ago`;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'deck';
}

export const DECK_COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#64748b',
];
