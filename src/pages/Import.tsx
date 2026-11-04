import { useLiveQuery } from 'dexie-react-hooks'
import { AlertCircle, ArrowRight, Check, ClipboardCopy, FileUp, Sparkles, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../components/toast'
import { Badge, Button, Input, Label, Markdown, PageHeader, Panel, Select, Switch, Textarea } from '../components/ui'
import { addCards, createDeck, db, isBackup, restoreBackup } from '../lib/db'
import { useDecks } from '../lib/hooks'
import { AI_PROMPT, FORMAT_LABELS, parseImport, type ImportFormat } from '../lib/importers'
import { cx, plural } from '../lib/utils'

const EXAMPLES: { label: string; text: string }[] = [
  { label: 'Front :: Back', text: 'mitochondria :: powerhouse of the cell\nosmosis :: diffusion of water across a membrane' },
  { label: 'Tab / CSV', text: 'hola\thello\ngracias\tthank you' },
  { label: 'Q: / A:', text: 'Q: What does HTTP stand for?\nA: HyperText Transfer Protocol\n\nQ: Default HTTPS port?\nA: 443' },
  { label: 'Markdown', text: '# Biology\n## What is ATP?\nThe cell’s energy currency.\n## Where is DNA stored?\nIn the nucleus.' },
]

export function Import() {
  const nav = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const decks = useDecks()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [format, setFormat] = useState<ImportFormat>('auto')
  const [target, setTarget] = useState<string>(params.get('deck') ?? '__new')
  const [newName, setNewName] = useState('')
  const [extraTags, setExtraTags] = useState('')
  const [swap, setSwap] = useState(false)
  const [skipDupes, setSkipDupes] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (target === '__new' && decks?.length && params.get('deck')) setTarget(params.get('deck')!)
  }, [decks, params, target])

  const backup = useMemo(() => {
    try {
      const j = JSON.parse(text)
      return isBackup(j) ? j : null
    } catch {
      return null
    }
  }, [text])

  const result = useMemo(() => (text.trim() && !backup ? parseImport(text, format) : null), [text, format, backup])

  const existingFronts = useLiveQuery(async () => {
    if (target === '__new') return new Set<string>()
    const cards = await db.cards.where('deckId').equals(target).toArray()
    return new Set(cards.map((c) => c.front.trim().toLowerCase()))
  }, [target])

  const prepared = useMemo(() => {
    if (!result) return []
    const tags = extraTags.split(/[\s,]+/).filter(Boolean)
    return result.cards.map((c) => {
      const front = swap ? c.back : c.front
      const back = swap ? c.front : c.back
      const dupe = existingFronts?.has(front.trim().toLowerCase()) ?? false
      return { front, back, tags: [...new Set([...c.tags, ...tags])], dupe }
    })
  }, [result, swap, extraTags, existingFronts])

  const toImport = prepared.filter((c) => !(skipDupes && c.dupe))
  const dupes = prepared.filter((c) => c.dupe).length

  async function readFile(f: File) {
    const content = await f.text()
    setFileName(f.name)
    setText(content)
    if (target === '__new' && !newName) setNewName(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '))
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (ext === 'tsv') setFormat('tab')
    else if (ext === 'csv') setFormat('auto')
    else if (ext === 'md') setFormat('markdown')
    else setFormat('auto')
  }

  async function doImport() {
    if (!toImport.length) return
    setBusy(true)
    try {
      let deckId = target
      if (target === '__new') {
        const d = await createDeck({ name: newName.trim() || fileName.replace(/\.[^.]+$/, '') || 'Imported deck' })
        deckId = d.id
      }
      await addCards(deckId, toImport.map(({ front, back, tags }) => ({ front, back, tags })))
      toast(`Imported ${plural(toImport.length, 'card')}`)
      nav(`/deck/${deckId}`)
    } finally {
      setBusy(false)
    }
  }

  async function doRestore(mode: 'merge' | 'replace') {
    if (!backup) return
    setBusy(true)
    await restoreBackup(backup, mode)
    setBusy(false)
    toast(`Restored ${plural(backup.decks.length, 'deck')} and ${plural(backup.cards.length, 'card')}`)
    nav('/')
  }

  return (
    <div>
      <PageHeader title="Import" description="Bring cards from notes, spreadsheets, Anki exports, Markdown, or JSON." />

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          {/* Source */}
          <Panel
            className={cx('p-5 transition-colors', dragging && 'border-accent bg-accent-soft/40')}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const f = e.dataTransfer.files[0]
              if (f) readFile(f)
            }}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">1 · Paste or drop your data</h3>
              <div className="flex gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.csv,.tsv,.md,.json,text/*,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) readFile(f)
                    e.target.value = ''
                  }}
                />
                <Button size="sm" onClick={() => fileRef.current?.click()}>
                  <FileUp size={15} /> Choose file
                </Button>
              </div>
            </div>
            <Textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setFileName('')
              }}
              rows={10}
              placeholder={'Paste anything like:\n\nphotosynthesis :: how plants turn light into energy\nmitosis :: cell division producing two identical cells\n\n…or drop a .csv / .tsv / .txt / .md / .json file here'}
              className="font-mono text-[13px]"
            />
            {fileName && <p className="mt-2 text-xs text-muted">Loaded {fileName}</p>}
            {!text && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-faint">Try an example:</span>
                {EXAMPLES.map((ex) => (
                  <button key={ex.label} onClick={() => setText(ex.text)} className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted hover:border-line-strong hover:text-fg">
                    {ex.label}
                  </button>
                ))}
              </div>
            )}
          </Panel>

          {backup && (
            <Panel className="animate-in p-5">
              <h3 className="text-sm font-semibold">This is a KnowDeck backup</h3>
              <p className="mt-1 text-sm text-muted">
                {plural(backup.decks.length, 'deck')}, {plural(backup.cards.length, 'card')}, {plural(backup.reviews.length, 'review')} · exported{' '}
                {new Date(backup.exportedAt).toLocaleString()}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" disabled={busy} onClick={() => doRestore('merge')}>
                  Merge into my data
                </Button>
                <Button variant="danger" disabled={busy} onClick={() => doRestore('replace')}>
                  Replace everything
                </Button>
              </div>
            </Panel>
          )}

          {/* Preview */}
          {result && (
            <Panel className="animate-in overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3.5">
                <h3 className="mr-auto text-sm font-semibold">2 · Preview</h3>
                <Badge tone={result.cards.length ? 'review' : 'danger'}>{plural(result.cards.length, 'card')}</Badge>
                {result.skipped > 0 && <Badge tone="learn">{result.skipped} skipped</Badge>}
                {dupes > 0 && <Badge tone="new">{dupes} duplicates</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-3 border-b border-line bg-subtle/50 px-5 py-3">
                <span className="text-[13px] text-muted">Format</span>
                <Select value={format} onChange={(e) => setFormat(e.target.value as ImportFormat)} className="h-9 w-auto text-[13px]">
                  {(Object.keys(FORMAT_LABELS) as ImportFormat[]).map((f) => (
                    <option key={f} value={f}>
                      {f === 'auto' ? `Auto-detect (${FORMAT_LABELS[result.format] ?? result.format})` : FORMAT_LABELS[f]}
                    </option>
                  ))}
                </Select>
              </div>
              {result.error && (
                <div className="flex items-center gap-2 px-5 py-4 text-sm text-again">
                  <AlertCircle size={16} /> {result.error}
                </div>
              )}
              {!result.error && result.cards.length === 0 && (
                <div className="px-5 py-10 text-center text-sm text-muted">No cards found. Try a different format above, or make sure each card has a front and a back.</div>
              )}
              {prepared.length > 0 && (
                <div className="max-h-[420px] overflow-y-auto">
                  <table className="w-full table-fixed text-sm">
                    <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
                      <tr className="border-b border-line">
                        <th className="w-10 py-2 pl-5 font-medium">#</th>
                        <th className="py-2 pr-3 font-medium">Front</th>
                        <th className="py-2 pr-5 font-medium">Back</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {prepared.slice(0, 100).map((c, i) => (
                        <tr key={i} className={cx('align-top', c.dupe && skipDupes && 'opacity-40')}>
                          <td className="py-2.5 pl-5 text-xs text-faint tabular-nums">{i + 1}</td>
                          <td className="py-2.5 pr-3">
                            <Markdown source={c.front} className="line-clamp-4 text-[13px]" />
                            {c.dupe && <span className="text-[11px] text-easy">already in deck</span>}
                          </td>
                          <td className="py-2.5 pr-5">
                            <Markdown source={c.back} className="line-clamp-4 text-[13px] text-muted" />
                            {c.tags.length > 0 && <div className="mt-1 text-[11px] text-faint">{c.tags.map((t) => '#' + t).join(' ')}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {prepared.length > 100 && <p className="border-t border-line py-3 text-center text-xs text-muted">…and {prepared.length - 100} more</p>}
                </div>
              )}
            </Panel>
          )}
        </div>

        {/* Destination */}
        <div className="space-y-4 xl:sticky xl:top-10 xl:self-start">
          <Panel className="space-y-4 p-5">
            <h3 className="text-sm font-semibold">3 · Destination</h3>
            <div>
              <Label htmlFor="target">Deck</Label>
              <Select id="target" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="__new">+ New deck</option>
                {decks?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            {target === '__new' && (
              <div>
                <Label htmlFor="newname">New deck name</Label>
                <Input id="newname" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Biology — chapter 4" />
              </div>
            )}
            <div>
              <Label htmlFor="xtags" hint="optional">
                Add tags
              </Label>
              <Input id="xtags" value={extraTags} onChange={(e) => setExtraTags(e.target.value)} placeholder="e.g. lecture-5" />
            </div>
            <Switch checked={swap} onChange={setSwap} label="Swap front and back" />
            <Switch checked={skipDupes} onChange={setSkipDupes} label="Skip duplicates" description="Cards whose front already exists in the deck." />
            <Button variant="primary" size="lg" className="w-full" disabled={!toImport.length || busy} onClick={doImport}>
              <Upload size={17} /> Import {toImport.length ? plural(toImport.length, 'card') : ''}
            </Button>
          </Panel>

          <Panel className="p-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles size={16} className="text-accent" /> Turn notes into cards with AI
            </div>
            <p className="mt-1.5 text-[13px] text-muted">
              Copy this prompt into Claude or any assistant along with your notes, then paste the result above.
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={async () => {
                await navigator.clipboard.writeText(AI_PROMPT)
                setCopied(true)
                setTimeout(() => setCopied(false), 1800)
              }}
            >
              {copied ? <Check size={14} /> : <ClipboardCopy size={14} />} {copied ? 'Copied' : 'Copy prompt'}
            </Button>
          </Panel>

          <Panel className="p-5 text-[13px] text-muted">
            <div className="mb-2 font-semibold text-fg">Supported formats</div>
            <ul className="space-y-1.5">
              <li><b className="font-medium text-fg">Anki:</b> File → Export → “Notes in Plain Text”.</li>
              <li><b className="font-medium text-fg">Quizlet:</b> Export with tab between term and definition.</li>
              <li><b className="font-medium text-fg">Spreadsheets:</b> CSV/TSV, columns front, back, tags.</li>
              <li><b className="font-medium text-fg">Notes:</b> <code>front :: back</code>, <code>Q:/A:</code>, Markdown headings.</li>
              <li><b className="font-medium text-fg">JSON:</b> array of {'{front, back, tags}'} or a KnowDeck backup.</li>
            </ul>
            <button onClick={() => nav('/settings')} className="mt-3 flex items-center gap-1 font-medium text-accent hover:underline">
              Backup & restore <ArrowRight size={13} />
            </button>
          </Panel>
        </div>
      </div>
    </div>
  )
}
