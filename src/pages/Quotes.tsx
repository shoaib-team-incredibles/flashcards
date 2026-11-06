import { CheckCircle2, Circle, ClipboardPaste, Plus, Quote as QuoteIcon, Shuffle, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useToast } from '../components/toast'
import { Button, EmptyState, Input, Label, Modal, PageHeader, Panel, Textarea } from '../components/ui'
import { useHotkeys } from '../lib/hooks'
import { addQuote, addQuotes, byline, deleteQuote, fitsNotification, NOTIFICATION_MAX_CHARS, parseQuotes, updateQuote, useQuotes, type Quote } from '../lib/quotes'
import { cx, plural } from '../lib/utils'

export function Quotes() {
  const quotes = useQuotes()
  const [featuredId, setFeaturedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Quote | 'new' | null>(null)
  const [pasting, setPasting] = useState(false)

  useHotkeys({ a: () => setEditing('new'), p: () => setPasting(true) })

  if (!quotes) return null
  const featured = quotes.find((q) => q.id === featuredId) ?? quotes[0]

  const another = () => {
    const others = quotes.filter((q) => q.id !== featured?.id)
    if (others.length) setFeaturedId(others[Math.floor(Math.random() * others.length)].id)
  }

  return (
    <div>
      <PageHeader
        title="Quotes"
        description="Lines worth keeping. They sync with the iOS app, which can send you one each day."
        actions={
          <>
            <Button onClick={() => setPasting(true)}>
              <ClipboardPaste size={16} /> Paste quotes
            </Button>
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus size={16} /> Add quote
            </Button>
          </>
        }
      />

      {!quotes.length ? (
        <Panel>
          <EmptyState icon={<QuoteIcon size={22} />} title="Your quotes live here" body="Paste a whole note at once, one quote per paragraph, or add them one by one.">
            <Button variant="primary" onClick={() => setPasting(true)}>
              <ClipboardPaste size={16} /> Paste quotes from a note
            </Button>
            <Button onClick={() => setEditing('new')}>
              <Plus size={16} /> Add one quote
            </Button>
          </EmptyState>
        </Panel>
      ) : (
        <>
          {featured && (
            <button
              onClick={another}
              disabled={quotes.length < 2}
              className="group relative block w-full overflow-hidden rounded-2xl bg-accent p-6 text-left text-accent-fg shadow-sm shadow-accent/30 transition-transform active:scale-[0.995] sm:p-8"
            >
              <QuoteIcon size={26} className="opacity-50" />
              <p className="mt-3 max-w-3xl text-xl leading-relaxed font-semibold tracking-tight whitespace-pre-line sm:text-2xl">{featured.text}</p>
              <div className="mt-4 flex items-center gap-3">
                <span className="flex-1 truncate text-[15px] opacity-85">{byline(featured)}</span>
                {quotes.length > 1 && (
                  <span className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-[13px] font-semibold transition-colors group-hover:bg-white/30">
                    <Shuffle size={13} /> Show another
                  </span>
                )}
              </div>
            </button>
          )}

          <h2 className="mt-10 mb-3 text-[15px] font-semibold tracking-tight">{plural(quotes.length, 'quote')}</h2>
          <Panel className="divide-y divide-line overflow-hidden">
            {quotes.map((q) => (
              <button key={q.id} onClick={() => setEditing(q)} className="block w-full px-5 py-4 text-left transition-colors hover:bg-subtle">
                <p className="text-[15px] leading-relaxed whitespace-pre-line">{q.text}</p>
                {q.author && <p className="mt-1 text-sm text-muted">{byline(q)}</p>}
                {!fitsNotification(q) && <p className="mt-1.5 text-xs font-medium text-faint">Too long for phone notifications</p>}
              </button>
            ))}
          </Panel>
        </>
      )}

      <QuoteDialog quote={editing} onClose={() => setEditing(null)} />
      <PasteDialog open={pasting} onClose={() => setPasting(false)} />
    </div>
  )
}

function QuoteDialog({ quote, onClose }: { quote: Quote | 'new' | null; onClose: () => void }) {
  const existing = quote && quote !== 'new' ? quote : undefined
  // Remount the form for each quote so its fields start from that quote.
  return (
    <Modal open={!!quote} onClose={onClose} title={existing ? 'Edit quote' : 'New quote'}>
      {quote && <QuoteForm key={existing?.id ?? 'new'} existing={existing} onDone={onClose} />}
    </Modal>
  )
}

function QuoteForm({ existing, onDone }: { existing?: Quote; onDone: () => void }) {
  const toast = useToast()
  const [text, setText] = useState(existing?.text ?? '')
  const [author, setAuthor] = useState(existing?.author ?? '')
  const [confirming, setConfirming] = useState(false)
  const canSave = text.trim().length > 0

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!canSave) return
    if (existing) await updateQuote(existing.id, text, author)
    else await addQuote(text, author)
    toast(existing ? 'Quote saved' : 'Quote added')
    onDone()
  }

  const remove = async () => {
    if (!existing) return
    if (!confirming) return setConfirming(true)
    await deleteQuote(existing.id)
    toast('Quote deleted', { tone: 'info' })
    onDone()
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <Label htmlFor="quote-text">Quote</Label>
        <Textarea
          id="quote-text"
          autoFocus
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save()
          }}
          placeholder="Type or paste a quote"
        />
      </div>
      <div>
        <Label htmlFor="quote-author" hint="Optional">
          Who said it?
        </Label>
        <Input id="quote-author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Mark Twain" />
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {existing && (
          <Button variant="ghost" onClick={remove} className="text-again hover:bg-again/10">
            <Trash2 size={15} /> {confirming ? 'Click again to delete' : 'Delete'}
          </Button>
        )}
        <div className="flex-1" />
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={!canSave}>
          {existing ? 'Save' : 'Add quote'}
        </Button>
      </div>
    </form>
  )
}

function PasteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [raw, setRaw] = useState('')
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const parsed = useMemo(() => parseQuotes(raw), [raw])
  const chosen = parsed.filter((_, i) => !skipped.has(i))
  const long = chosen.filter((q) => !fitsNotification(q)).length

  const close = () => {
    setRaw('')
    setSkipped(new Set())
    onClose()
  }

  const toggle = (i: number) =>
    setSkipped((s) => {
      const next = new Set(s)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const save = async () => {
    const added = await addQuotes(chosen)
    const dupes = chosen.length - added
    toast(`Added ${plural(added, 'quote')}${dupes ? ` · ${dupes} already saved` : ''}`)
    close()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title="Paste quotes"
      description="One quote per paragraph. A name after the quote, like “— Mark Twain”, becomes the author."
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={!chosen.length} onClick={() => void save()}>
            {chosen.length ? `Add ${plural(chosen.length, 'quote')}` : 'Add'}
          </Button>
        </>
      }
    >
      <Textarea
        autoFocus
        rows={raw ? 6 : 12}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value)
          setSkipped(new Set())
        }}
        placeholder={'"Stay hungry, stay foolish." — Steve Jobs\n\nThe best way out is always through. -- Robert Frost'}
        className="font-mono text-[13px]"
      />
      {parsed.length > 0 && (
        <>
          <p className="mt-4 mb-2 text-sm text-muted">
            Found {plural(parsed.length, 'quote')}. Click one to leave it out.
            {long ? ` ${plural(long, 'quote')} over ${NOTIFICATION_MAX_CHARS} characters will be saved but not sent as phone notifications.` : ''}
          </p>
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {parsed.map((q, i) => {
              const off = skipped.has(i)
              return (
                <button key={i} onClick={() => toggle(i)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-subtle">
                  {off ? <Circle size={18} className="mt-0.5 shrink-0 text-faint" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-accent" />}
                  <div className={cx('min-w-0 flex-1', off && 'opacity-45')}>
                    <p className="text-sm leading-relaxed whitespace-pre-line">{q.text}</p>
                    {q.author && <p className="mt-0.5 text-[13px] text-muted">{byline(q)}</p>}
                    {!fitsNotification(q) && <p className="mt-1 text-xs font-medium text-hard">Too long for phone notifications</p>}
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </Modal>
  )
}
