import { ChevronLeft, ChevronRight, Eye, PenLine, RotateCcw, Volume2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { db, makeCard, type Card } from '../lib/db'
import { useDecks } from '../lib/hooks'
import { Button, Kbd, Markdown, Modal, Select } from './ui'
import { useToast } from './toast'
import { canSpeak, frenchExamples, hasFrenchFront, isFrench, speakEnglish, speakFrench, speakMeaning, speakFrenchList } from '../lib/speech'
import { cx } from '../lib/utils'

const splitTags = (s: string) =>
  s
    .split(/[\s,]+/)
    .map((t) => t.trim().replace(/^#/, ''))
    .filter(Boolean)

export interface CardNav {
  index: number // 0-based position of `card` in the list being browsed
  total: number
  onPrev?: () => void
  onNext?: () => void
}

const isTyping = (el: Element | null) =>
  !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'checkbox') || (el as HTMLElement).isContentEditable)

/** Add or edit a card. With no `card`, works in rapid "add & next" mode. Pass `nav` to browse a list of cards. */
export function CardEditor({
  open,
  onClose,
  card,
  deckId,
  onSaved,
  nav,
}: {
  open: boolean
  onClose: () => void
  card?: Card | null
  deckId?: string
  onSaved?: (c: Card) => void
  nav?: CardNav
}) {
  const decks = useDecks()
  const toast = useToast()
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [deck, setDeck] = useState('')
  const [preview, setPreview] = useState(false)
  const [flipped, setFlipped] = useState(false)
  // Which side shows its raw Markdown for editing; the other side shows the formatted text.
  const [editing, setEditing] = useState<'front' | 'back' | null>(null)
  const [added, setAdded] = useState(0)
  const frontRef = useRef<HTMLTextAreaElement>(null)
  // Which card the form fields currently hold. Guards against saving one card's text onto
  // another in the render between `card` changing and the load effect running.
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const busy = useRef(false)

  // Load the card's content (also runs when browsing to another card)
  useEffect(() => {
    if (!open) return
    setFront(card?.front ?? '')
    setBack(card?.back ?? '')
    setTags(card?.tags ?? [])
    setTagDraft('')
    setDeck(card?.deckId ?? deckId ?? '')
    setFlipped(false)
    setEditing(null)
    setLoadedId(card?.id ?? null)
  }, [open, card, deckId])

  // Fresh modal: start in edit mode. Browsing keeps whichever mode you're in.
  useEffect(() => {
    if (!open) return
    setPreview(false)
    setAdded(0)
  }, [open])

  useEffect(() => {
    if (open && !deck && decks?.length) setDeck((d) => d || card?.deckId || deckId || decks[0].id)
  }, [open, deck, decks])

  const valid = front.trim() && back.trim() && deck
  const allTags = () => [...new Set([...tags, ...splitTags(tagDraft)])]

  function commitDraft() {
    if (!tagDraft.trim()) return
    setTags(allTags())
    setTagDraft('')
  }

  const loaded = !card || loadedId === card.id
  const dirty =
    !!card &&
    loaded &&
    (front.trim() !== card.front || back.trim() !== card.back || deck !== card.deckId || allTags().join(' ') !== card.tags.join(' '))

  async function persist(c: Card) {
    const updated: Card = { ...c, front: front.trim(), back: back.trim(), tags: allTags(), deckId: deck, updatedAt: Date.now() }
    await db.cards.put(updated)
    onSaved?.(updated)
  }

  /** Move to another card, saving edits to this one first (like Anki's browser). */
  async function go(dir: -1 | 1) {
    const fn = dir < 0 ? nav?.onPrev : nav?.onNext
    if (!fn || busy.current || !loaded) return
    busy.current = true
    try {
      if (card && dirty) {
        if (!valid) {
          toast('Fill in both sides before moving on')
          return
        }
        await persist(card)
        toast('Saved')
      }
      fn()
    } finally {
      busy.current = false
    }
  }

  // ← / → browse when you're not typing; ⌥← / ⌥→ work anywhere
  const goRef = useRef(go)
  goRef.current = go
  useEffect(() => {
    if (!open || !nav) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.metaKey || e.ctrlKey || e.shiftKey) return
      if (!e.altKey && isTyping(document.activeElement)) return
      e.preventDefault()
      goRef.current(e.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, nav])

  async function save(keepOpen: boolean) {
    if (!valid || !loaded) return
    const tagList = allTags()
    if (card) {
      await persist(card)
      toast('Card saved')
      onClose()
      return
    }
    const c = makeCard(deck, front, back, tagList)
    await db.cards.add(c)
    onSaved?.(c)
    if (keepOpen) {
      setFront('')
      setBack('')
      setTags(tagList)
      setTagDraft('')
      setPreview(false)
      setFlipped(false)
      setAdded((n) => n + 1)
      frontRef.current?.focus()
    } else {
      toast('Card added')
      onClose()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      save(!card)
    }
  }

  const face = flipped ? back : front

  // Audio on French cards (uses the text as currently edited).
  const curTags = allTags()
  const french = canSpeak && isFrench(curTags)
  const frenchFront = french && hasFrenchFront(curTags)
  const examples = french && back.trim() ? frenchExamples(back) : []
  const frontAudio =
    french && front.trim() ? (
      <AudioChip
        label="Listen"
        title={frenchFront ? 'Listen in French' : 'Listen to the question in English'}
        onPlay={() => (frenchFront ? speakFrench(front) : speakEnglish(front))}
      />
    ) : null
  const backAudio =
    french && back.trim() ? (
      <>
        {frenchFront && <AudioChip label="Meaning" title="Listen to the meaning in English" onPlay={() => speakMeaning(back)} />}
        {examples.length > 0 && <AudioChip label="Examples" title="Listen to the French examples" onPlay={() => speakFrenchList(examples)} />}
      </>
    ) : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        card ? (
          <span className="flex items-baseline gap-2">
            Edit card
            {nav && (
              <span className="text-[13px] font-normal text-faint tabular-nums">
                {nav.index + 1} of {nav.total}
              </span>
            )}
          </span>
        ) : (
          'Add cards'
        )
      }
      description={card ? undefined : added ? `${added} added this session — keep going.` : undefined}
      footer={
        <>
          {nav ? (
            <div className="mr-auto flex items-center gap-2">
              <div className="flex items-center rounded-xl border border-line bg-surface p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  disabled={!nav.onPrev}
                  aria-label="Previous card"
                  title="Previous card (← or ⌥←)"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-subtle hover:text-fg disabled:pointer-events-none disabled:opacity-35"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="min-w-14 px-1 text-center text-xs font-medium text-muted tabular-nums">
                  {nav.index + 1} / {nav.total}
                </span>
                <button
                  type="button"
                  onClick={() => go(1)}
                  disabled={!nav.onNext}
                  aria-label="Next card"
                  title="Next card (→ or ⌥→)"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-subtle hover:text-fg disabled:pointer-events-none disabled:opacity-35"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          ) : (
            <span className="mr-auto" />
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setPreview((p) => !p)
              setFlipped(false)
            }}
            title={preview ? 'Back to editing' : 'See the card as you will study it'}
          >
            {preview ? <PenLine size={15} /> : <Eye size={15} />}
            {preview ? 'Edit' : 'Preview'}
          </Button>
          {!card && (
            <Button variant="ghost" onClick={() => save(false)} disabled={!valid}>
              Add & close
            </Button>
          )}
          <Button variant="primary" onClick={() => save(!card)} disabled={!valid} title={card ? 'Save (⌘↵)' : 'Add and start the next one (⌘↵)'}>
            {card ? 'Save' : 'Add card'}
            <Kbd onAccent className="ml-0.5 max-sm:hidden">⌘↵</Kbd>
          </Button>
        </>
      }
    >
      <div className="space-y-4" onKeyDown={onKeyDown}>
        {preview ? (
          /* Flip-card preview, like the study screen */
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="group relative flex min-h-64 w-full flex-col rounded-2xl border border-line bg-surface p-6 text-left shadow-[0_1px_0_var(--c-line),0_8px_24px_-12px_rgba(0,0,0,0.15)] transition hover:border-line-strong sm:p-8"
          >
            <SideLabel side={flipped ? 'back' : 'front'} />
            <div key={String(flipped)} className="flex flex-1 animate-pop items-center justify-center py-6">
              {face.trim() ? (
                <Markdown
                  source={face}
                  className={cx('w-full', face.length < 60 && !face.includes('\n') ? 'text-center text-2xl font-medium' : 'text-[15px] leading-relaxed')}
                />
              ) : (
                <span className="text-sm text-faint">This side is empty</span>
              )}
            </div>
            <span className="flex items-center justify-center gap-1.5 text-xs text-faint group-hover:text-muted">
              <RotateCcw size={12} /> Click to flip
            </span>
          </button>
        ) : (
          <div className="space-y-3">
            <Face side="front" editing={editing === 'front' || !front.trim()} value={front} onEdit={() => setEditing('front')} audio={frontAudio} big>
              <textarea
                ref={frontRef}
                autoFocus={!card || editing === 'front'}
                aria-label="Front"
                value={front}
                onChange={(e) => setFront(e.target.value)}
                onBlur={() => setEditing((x) => (x === 'front' ? null : x))}
                placeholder="Term or question"
                rows={1}
                className="block max-h-40 min-h-12 w-full resize-none bg-transparent px-5 pb-4 text-xl leading-snug font-medium text-fg outline-none field-sizing-content focus-visible:outline-none! placeholder:font-normal placeholder:text-faint"
              />
            </Face>
            <Face side="back" editing={editing === 'back' || !back.trim()} value={back} onEdit={() => setEditing('back')} audio={backAudio} tapToHear={french}>
              <textarea
                autoFocus={editing === 'back'}
                aria-label="Back"
                value={back}
                onChange={(e) => setBack(e.target.value)}
                onBlur={() => setEditing((x) => (x === 'back' ? null : x))}
                placeholder="Definition or answer"
                rows={5}
                className="block max-h-[42dvh] min-h-32 w-full resize-none bg-transparent px-5 pb-4 text-[15px] leading-relaxed text-fg outline-none field-sizing-content focus-visible:outline-none! placeholder:text-faint"
              />
            </Face>
          </div>
        )}

        {/* Deck + tags */}
        <div className="grid gap-2.5 pt-1 sm:grid-cols-[200px_1fr]">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[11px] font-medium tracking-wide text-faint uppercase">Deck</span>
            <Select id="deck" value={deck} onChange={(e) => setDeck(e.target.value)} className="h-9 text-[13px]">
              {decks?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="tags" className="text-[11px] font-medium tracking-wide text-faint uppercase">
              Tags
            </label>
            <div
              className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-[10px] border border-line bg-surface px-2 py-1.5 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15"
              onClick={() => document.getElementById('tags')?.focus()}
            >
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-md bg-subtle py-0.5 pr-1 pl-2 text-xs font-medium text-muted">
                  {t}
                  <button
                    type="button"
                    aria-label={`Remove tag ${t}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setTags(tags.filter((x) => x !== t))
                    }}
                    className="rounded p-0.5 hover:bg-line hover:text-fg"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              <input
                id="tags"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onBlur={commitDraft}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    commitDraft()
                  } else if ((e.key === ' ' || e.key === ',') && tagDraft.trim()) {
                    e.preventDefault()
                    commitDraft()
                  } else if (e.key === 'Backspace' && !tagDraft && tags.length) {
                    setTags(tags.slice(0, -1))
                  }
                }}
                placeholder={tags.length ? '' : 'Add tags'}
                className="h-6 min-w-24 flex-1 bg-transparent text-[13px] outline-none focus-visible:outline-none! placeholder:text-faint"
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function SideLabel({ side }: { side: 'front' | 'back' }) {
  return (
    <span
      className={cx(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wider uppercase',
        side === 'front' ? 'bg-accent-soft text-accent' : 'bg-good/10 text-good',
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', side === 'front' ? 'bg-accent' : 'bg-good')} />
      {side}
    </span>
  )
}

const MD_HINT = '**bold**  *italic*  - list'

/**
 * One side of the card. Shows the formatted text; click (or Enter) to edit the raw Markdown.
 * Empty sides and the side being edited show the text field.
 */
function Face({
  side,
  editing,
  value,
  onEdit,
  big,
  audio,
  tapToHear,
  children,
}: {
  side: 'front' | 'back'
  editing: boolean
  value: string
  onEdit: () => void
  big?: boolean
  /** Play buttons shown in the side's header (French cards). */
  audio?: React.ReactNode
  /** Clicking italic French text plays it instead of starting an edit. */
  tapToHear?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="group rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-line-strong has-[textarea:focus]:border-accent has-[textarea:focus]:ring-3 has-[textarea:focus]:ring-accent/15">
      <div className="flex items-center justify-between px-5 pt-3.5 pb-1.5">
        <SideLabel side={side} />
        <div className="flex items-center gap-2">
          {editing ? (
            <span className="hidden font-mono text-[11px] text-faint group-focus-within:inline">{MD_HINT}</span>
          ) : (
            <span className="hidden items-center gap-1 text-[11px] text-faint opacity-0 transition group-hover:opacity-100 sm:flex">
              <PenLine size={11} /> Click to edit
            </span>
          )}
          {audio && <div className="flex items-center gap-1">{audio}</div>}
        </div>
      </div>
      {editing ? (
        children
      ) : (
        <button
          type="button"
          onClick={(e) => {
            const em = tapToHear ? (e.target as HTMLElement).closest('em') : null
            if (em) speakFrench(em.textContent ?? '')
            else onEdit()
          }}
          aria-label={`Edit ${side}`}
          className="block w-full cursor-text px-5 pb-4 text-left outline-none focus-visible:outline-none!"
        >
          <Markdown source={value} className={cx(big ? 'text-xl leading-snug font-medium' : 'text-[15px] leading-relaxed', tapToHear && 'speak-em')} />
        </button>
      )}
    </div>
  )
}

function AudioChip({ label, title, onPlay }: { label: string; title: string; onPlay: () => void }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onPlay()
      }}
      className="flex h-7 items-center gap-1 rounded-full border border-line px-2.5 text-[12px] font-medium text-muted transition hover:border-accent/40 hover:bg-accent-soft hover:text-accent"
    >
      <Volume2 size={13} /> {label}
    </button>
  )
}
