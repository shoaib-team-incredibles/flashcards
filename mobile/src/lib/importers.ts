import Papa from 'papaparse'

export interface ParsedCard {
  front: string
  back: string
  tags: string[]
}

export type ImportFormat = 'auto' | 'tab' | 'csv' | 'semicolon' | 'doublecolon' | 'pipe' | 'dash' | 'qa' | 'markdown' | 'blocks' | 'json'

export const FORMAT_LABELS: Record<ImportFormat, string> = {
  auto: 'Auto-detect',
  tab: 'Tab separated (Anki / spreadsheet)',
  csv: 'CSV (comma)',
  semicolon: 'Semicolon separated',
  doublecolon: 'Front :: Back',
  pipe: 'Front | Back',
  dash: 'Front - Back',
  qa: 'Q: / A: blocks',
  markdown: 'Markdown headings',
  blocks: 'Blank-line blocks',
  json: 'JSON',
}

export interface ParseResult {
  cards: ParsedCard[]
  format: ImportFormat
  skipped: number
  error?: string
}

const tagsFrom = (s: string | undefined) =>
  (s ?? '')
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)

const htmlToText = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p)>/gi, '\n')
    .replace(/<(div|p)[^>]*>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

function clean(cards: ParsedCard[]): { cards: ParsedCard[]; skipped: number } {
  const out: ParsedCard[] = []
  let skipped = 0
  for (const c of cards) {
    const front = htmlToText(c.front ?? '')
    const back = htmlToText(c.back ?? '')
    if (!front || !back) {
      skipped++
      continue
    }
    out.push({ front, back, tags: c.tags ?? [] })
  }
  return { cards: out, skipped }
}

/** Strip Anki export headers like "#separator:tab" and pick up their hints. */
function stripAnkiHeaders(text: string) {
  const lines = text.split(/\r?\n/)
  let sep: ImportFormat | null = null
  let tagCol: number | null = null
  let i = 0
  while (i < lines.length && /^#[a-z ]+:/i.test(lines[i])) {
    const [k, v] = lines[i].slice(1).split(':')
    const key = k.trim().toLowerCase()
    const val = (v ?? '').trim().toLowerCase()
    if (key === 'separator') sep = val === 'tab' ? 'tab' : val === 'comma' ? 'csv' : val === 'semicolon' ? 'semicolon' : val === 'pipe' ? 'pipe' : null
    if (key === 'tags column') tagCol = parseInt(val, 10) - 1
    i++
  }
  return { body: lines.slice(i).join('\n'), sep, tagCol }
}

function parseDelimited(text: string, delimiter: string, tagCol: number | null): ParsedCard[] {
  const res = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: true })
  const rows = res.data.filter((r) => r.length >= 2)
  // Drop a header row like "front,back" / "question,answer"
  if (rows.length && /^(front|question|term|q)$/i.test(rows[0][0]?.trim() ?? '') && /^(back|answer|definition|a)$/i.test(rows[0][1]?.trim() ?? ''))
    rows.shift()
  return rows.map((r) => ({
    front: r[0] ?? '',
    back: r[1] ?? '',
    tags: tagsFrom(tagCol != null ? r[tagCol] : r[2]),
  }))
}

function parseSplitFirst(text: string, sep: RegExp): ParsedCard[] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => {
      const m = l.match(sep)
      if (!m || m.index == null) return { front: l, back: '', tags: [] }
      const front = l.slice(0, m.index)
      const rest = l.slice(m.index + m[0].length)
      // optional third segment = tags
      const m2 = rest.match(sep)
      if (m2 && m2.index != null) return { front, back: rest.slice(0, m2.index), tags: tagsFrom(rest.slice(m2.index + m2[0].length)) }
      return { front, back: rest, tags: [] }
    })
}

function parseQA(text: string): ParsedCard[] {
  const cards: ParsedCard[] = []
  let cur: { q: string[]; a: string[] } | null = null
  let mode: 'q' | 'a' = 'q'
  for (const line of text.split(/\r?\n/)) {
    const q = line.match(/^\s*(?:Q|Question)\s*[:.)]\s?(.*)$/i)
    const a = line.match(/^\s*(?:A|Answer)\s*[:.)]\s?(.*)$/i)
    if (q) {
      if (cur) cards.push({ front: cur.q.join('\n'), back: cur.a.join('\n'), tags: [] })
      cur = { q: [q[1]], a: [] }
      mode = 'q'
    } else if (a && cur) {
      cur.a.push(a[1])
      mode = 'a'
    } else if (cur) {
      cur[mode].push(line)
    }
  }
  if (cur) cards.push({ front: cur.q.join('\n'), back: cur.a.join('\n'), tags: [] })
  return cards.map((c) => ({ ...c, front: c.front.trim(), back: c.back.trim() }))
}

function parseMarkdown(text: string): ParsedCard[] {
  const lines = text.split(/\r?\n/)
  const levels = lines.map((l) => l.match(/^(#{1,6})\s+/)?.[1].length ?? 0).filter(Boolean)
  if (!levels.length) return []
  // Use the deepest heading level as "question" level, higher levels become tags (topics).
  const qLevel = Math.max(...levels)
  const cards: ParsedCard[] = []
  const topics: string[] = []
  let cur: { front: string; back: string[]; tags: string[] } | null = null
  const flush = () => {
    if (cur) cards.push({ front: cur.front, back: cur.back.join('\n').trim(), tags: cur.tags })
    cur = null
  }
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.*)$/)
    if (m) {
      const level = m[1].length
      flush()
      if (level === qLevel) {
        cur = { front: m[2].trim(), back: [], tags: topics.filter(Boolean).map((t) => t.toLowerCase().replace(/\s+/g, '-')) }
      } else {
        topics[level - 1] = m[2].trim()
        topics.length = level
      }
    } else if (cur) cur.back.push(line)
  }
  flush()
  return cards
}

function parseBlocks(text: string): ParsedCard[] {
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const [first, ...rest] = b.split(/\r?\n/)
      return { front: first, back: rest.join('\n'), tags: [] }
    })
}

function parseJSON(text: string): ParsedCard[] {
  const data = JSON.parse(text)
  const arr: unknown[] = Array.isArray(data) ? data : Array.isArray(data?.cards) ? data.cards : []
  return arr.map((x) => {
    if (Array.isArray(x)) return { front: String(x[0] ?? ''), back: String(x[1] ?? ''), tags: [] }
    const o = x as Record<string, unknown>
    const front = o.front ?? o.question ?? o.q ?? o.term ?? o.prompt ?? ''
    const back = o.back ?? o.answer ?? o.a ?? o.definition ?? o.response ?? ''
    const tags = Array.isArray(o.tags) ? (o.tags as unknown[]).map(String) : tagsFrom(typeof o.tags === 'string' ? o.tags : '')
    return { front: String(front), back: String(back), tags }
  })
}

function detect(text: string): ImportFormat {
  const t = text.trim()
  if (/^[[{]/.test(t)) {
    try {
      JSON.parse(t)
      return 'json'
    } catch {
      /* not json */
    }
  }
  const lines = t.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return 'tab'
  const share = (re: RegExp) => lines.filter((l) => re.test(l)).length / lines.length
  if (share(/^\s*(Q|Question)\s*[:.)]/i) > 0.15 && share(/^\s*(A|Answer)\s*[:.)]/i) > 0.15) return 'qa'
  if (share(/^#{1,6}\s+/) > 0.1) return 'markdown'
  if (share(/\t/) > 0.6) return 'tab'
  if (share(/::/) > 0.6) return 'doublecolon'
  if (share(/\s\|\s/) > 0.6) return 'pipe'
  if (share(/;/) > 0.6) return 'semicolon'
  if (share(/\s[-–—]\s/) > 0.7 && share(/,/) < 0.5) return 'dash'
  if (share(/,/) > 0.6) return 'csv'
  return 'blocks'
}

export function parseImport(text: string, format: ImportFormat = 'auto'): ParseResult {
  try {
    const { body, sep, tagCol } = stripAnkiHeaders(text)
    const fmt: ImportFormat = format === 'auto' ? (sep ?? detect(body)) : format
    let raw: ParsedCard[]
    switch (fmt) {
      case 'json':
        raw = parseJSON(body)
        break
      case 'tab':
        raw = parseDelimited(body, '\t', tagCol)
        break
      case 'csv':
        raw = parseDelimited(body, ',', tagCol)
        break
      case 'semicolon':
        raw = parseDelimited(body, ';', tagCol)
        break
      case 'doublecolon':
        raw = parseSplitFirst(body, /\s*::\s*/)
        break
      case 'pipe':
        raw = parseSplitFirst(body, /\s+\|\s+/)
        break
      case 'dash':
        raw = parseSplitFirst(body, /\s+[-–—]\s+/)
        break
      case 'qa':
        raw = parseQA(body)
        break
      case 'markdown':
        raw = parseMarkdown(body)
        break
      default:
        raw = parseBlocks(body)
    }
    const { cards, skipped } = clean(raw)
    return { cards, skipped, format: fmt }
  } catch (e) {
    return { cards: [], skipped: 0, format, error: e instanceof Error ? e.message : String(e) }
  }
}

export function toCSV(cards: { front: string; back: string; tags: string[] }[]) {
  return Papa.unparse(cards.map((c) => [c.front, c.back, c.tags.join(' ')]), { delimiter: '\t' })
}

export const AI_PROMPT = `Turn the notes below into high-quality flashcards for spaced repetition.

Rules:
- One fact or idea per card. Keep answers short (ideally under 15 words).
- Questions must be answerable without seeing the other cards.
- Prefer "why" and "how" questions over trivia when the notes allow it.
- Output ONLY lines in this exact format, one card per line:
  question :: answer

Notes:
<paste your notes here>`
