import { ArrowLeft, ClipboardCheck, EyeOff, Home, PartyPopper, Pencil, Shuffle, Undo2, Volume2, VolumeX, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CardEditor } from '../components/CardEditor'
import { useToast } from '../components/toast'
import { Button, IconButton, Kbd, Markdown, Panel, Progress } from '../components/ui'
import { db, deckOptions, type Card, type Deck } from '../lib/db'
import { formatInterval, previewAll, RATING_LABEL, RATINGS, type Rating } from '../lib/fsrs'
import { useHotkeys } from '../lib/hooks'
import { canSpeak, englishAudio, getAutoSpeak, hasFrenchFront, isFrench, playFrench, setAutoSpeak, speakEnglish, speakMeaning, speakFrench, stopSpeaking } from '../lib/speech'
import { answerCard, getShuffleStudy, LEARN_AHEAD_MS, loadStudyQueue, orderQueue, setShuffleStudy, undoAnswer, type DeckQueue } from '../lib/session'
import { cx, formatDuration, plural } from '../lib/utils'

const RATING_STYLE: Record<Rating, string> = {
  1: 'text-again hover:bg-again/10 border-again/25',
  2: 'text-hard hover:bg-hard/10 border-hard/25',
  3: 'text-good hover:bg-good/10 border-good/25',
  4: 'text-easy hover:bg-easy/10 border-easy/25',
}

interface HistoryEntry {
  prev: Card
  logId: number
  queue: DeckQueue
  rating: Rating
}

function pickNext(q: DeckQueue, counter: number, now = Date.now()): Card | null {
  const learnDue = q.learning.find((c) => c.due <= now)
  if (learnDue) return learnDue
  if (q.fresh.length && (q.review.length === 0 || counter % 4 === 3)) return q.fresh[0]
  if (q.review.length) return q.review[0]
  const ahead = q.learning[0]
  if (ahead && ahead.due <= now + LEARN_AHEAD_MS) return ahead
  return null
}

function removeFrom(q: DeckQueue, id: string): DeckQueue {
  return {
    learning: q.learning.filter((c) => c.id !== id),
    review: q.review.filter((c) => c.id !== id),
    fresh: q.fresh.filter((c) => c.id !== id),
  }
}

export function Study() {
  const nav = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const deckParam = params.get('deck')
  const [decks, setDecks] = useState<Map<string, Deck>>(new Map())
  const [queue, setQueue] = useState<DeckQueue | null>(null)
  const [current, setCurrent] = useState<Card | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [autoSpeak, setAuto] = useState(getAutoSpeak)
  const [shuffle, setShuffle] = useState(getShuffleStudy)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [counter, setCounter] = useState(0)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const shownAt = useRef(Date.now())
  const startedAt = useRef(Date.now())
  const [ratings, setRatings] = useState<Record<Rating, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 })
  const [initialTotal, setInitialTotal] = useState(0)

  useEffect(() => {
    loadStudyQueue(deckParam ? [deckParam] : null).then(({ decks, queue: loaded }) => {
      const queue = orderQueue(loaded, getShuffleStudy())
      setDecks(new Map(decks.map((d) => [d.id, d])))
      setQueue(queue)
      setInitialTotal(queue.learning.length + queue.review.length + queue.fresh.length)
      const first = pickNext(queue, 0)
      setCurrent(first)
      shownAt.current = Date.now()
      startedAt.current = Date.now()
    })
  }, [deckParam])

  /** Turn shuffle on or off mid-session. The card on screen stays unless its answer isn't shown yet. */
  const toggleShuffle = () => {
    const on = !shuffle
    setShuffle(on)
    setShuffleStudy(on)
    toast(on ? 'Shuffling cards' : 'Cards back in order', { tone: 'info' })
    if (!queue) return
    const next = orderQueue(queue, on)
    setQueue(next)
    if (!revealed) {
      setCurrent(pickNext(next, counter))
      shownAt.current = Date.now()
    }
  }

  const exit = () => nav(deckParam ? `/deck/${deckParam}` : '/')
  const deck = current ? decks.get(current.deckId) : undefined
  const preview = useMemo(() => (current && revealed ? previewAll(current, Date.now(), deckOptions(deck)) : null), [current, revealed, deck])

  const remaining = queue ? queue.learning.length + queue.review.length + queue.fresh.length : 0
  const reviewed = history.length
  const progress = reviewed + remaining ? reviewed / (reviewed + remaining) : 0

  const rate = useCallback(
    async (rating: Rating) => {
      if (!current || !queue || !revealed || busy) return
      setBusy(true)
      try {
        const { updated, logId } = await answerCard(current, rating, deck, Date.now() - shownAt.current)
        let next = removeFrom(queue, current.id)
        if (updated.state === 1 || updated.state === 3) {
          next = { ...next, learning: [...next.learning, updated].sort((a, b) => a.due - b.due) }
        }
        setHistory((h) => [...h, { prev: current, logId, queue, rating }])
        setRatings((r) => ({ ...r, [rating]: r[rating] + 1 }))
        setQueue(next)
        const nc = counter + 1
        setCounter(nc)
        let nextCard = pickNext(next, nc)
        // avoid showing the exact same card twice in a row if anything else is available
        if (nextCard?.id === current.id) {
          const alt = pickNext(removeFrom(next, current.id), nc)
          if (alt) nextCard = alt
        }
        setCurrent(nextCard)
        setRevealed(false)
        shownAt.current = Date.now()
      } finally {
        setBusy(false)
      }
    },
    [current, queue, revealed, busy, deck, counter],
  )

  const undo = useCallback(async () => {
    const last = history[history.length - 1]
    if (!last || busy) return
    await undoAnswer(last.prev, last.logId)
    setHistory((h) => h.slice(0, -1))
    setRatings((r) => ({ ...r, [last.rating]: Math.max(0, r[last.rating] - 1) }))
    setQueue(last.queue)
    setCurrent(last.prev)
    setRevealed(true)
    toast('Undid last answer', { tone: 'info' })
  }, [history, busy, toast])

  const suspend = useCallback(async () => {
    if (!current || !queue) return
    await db.cards.update(current.id, { suspended: 1 })
    const next = removeFrom(queue, current.id)
    setQueue(next)
    setCurrent(pickNext(next, counter))
    setRevealed(false)
    toast('Card suspended — it won’t show up until you unsuspend it', { tone: 'info' })
  }, [current, queue, counter, toast])

  // Read French fronts aloud when a card appears (toggle in the header); stop when leaving.
  // Every French card has audio. Vocab & expressions: French front, English meaning on the back.
  // Grammar: English question on the front, French examples on the back.
  const speakable = !!current && canSpeak && isFrench(current.tags)
  const frenchFront = speakable && hasFrenchFront(current!.tags)
  const playFront = () => current && (frenchFront ? speakFrench(current.front) : speakEnglish(current.front))
  const playBack = (queue = false) =>
    current && (frenchFront ? speakMeaning(current.back, queue) : playFrench(current))
  useEffect(() => {
    if (speakable && autoSpeak && current && !editing) playFront()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, speakable])
  useEffect(() => {
    if (revealed && speakable && autoSpeak && current) playBack(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed])
  useEffect(() => stopSpeaking, [])

  /** Tap any French example (the italic text) on a French card to hear it. */
  function speakExample(e: React.MouseEvent) {
    if (!current || !isFrench(current.tags) || !canSpeak) return
    const em = (e.target as HTMLElement).closest('em')
    if (!em) return
    e.stopPropagation()
    speakFrench(em.textContent ?? '')
  }

  useHotkeys(
    {
      space: () => (revealed ? rate(3) : setRevealed(true)),
      enter: () => (revealed ? rate(3) : setRevealed(true)),
      '1': () => rate(1),
      '2': () => rate(2),
      '3': () => rate(3),
      '4': () => rate(4),
      z: () => undo(),
      'mod+z': () => undo(),
      e: () => current && setEditing(true),
      s: () => toggleShuffle(),
      // R = French, M = English (meaning, or a grammar card's question). Never reveals the answer early.
      r: () => speakable && (frenchFront ? playFront() : revealed && playBack()),
      m: () => speakable && current && (frenchFront ? revealed && playBack() : speakEnglish(englishAudio(current))),
      '-': () => suspend(),
      escape: () => exit(),
    },
    { enabled: !editing },
  )

  // When waiting only on learning cards that become due soon, re-check periodically.
  useEffect(() => {
    if (current || !queue || !queue.learning.length) return
    const id = setInterval(() => {
      const c = pickNext(queue, counter)
      if (c) {
        setCurrent(c)
        shownAt.current = Date.now()
      }
    }, 5000)
    return () => clearInterval(id)
  }, [current, queue, counter])

  const title = deckParam ? decks.get(deckParam)?.name ?? 'Study' : 'All decks'

  if (!queue) return <div className="min-h-dvh bg-bg" />

  const front = current?.front ?? ''
  const compact = front.length < 140 && !front.includes('\n') && !front.includes('```')

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-3 sm:px-4">
          <IconButton label="Exit (Esc)" onClick={() => exit()}>
            <X size={19} />
          </IconButton>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{title}</div>
          </div>
          <div className="flex items-center gap-3 text-[13px] font-semibold tabular-nums">
            <span className={cx('text-easy', current?.state === 0 && 'underline underline-offset-4')} title="New">{queue.fresh.length}</span>
            <span className={cx('text-hard', (current?.state === 1 || current?.state === 3) && 'underline underline-offset-4')} title="Learning">{queue.learning.length}</span>
            <span className={cx('text-good', current?.state === 2 && 'underline underline-offset-4')} title="Review">{queue.review.length}</span>
          </div>
          <div className="ml-1 flex">
            {canSpeak && current && isFrench(current.tags) && (
              <IconButton
                label={autoSpeak ? 'Auto-play audio: on' : 'Auto-play audio: off'}
                onClick={() => {
                  setAuto(!autoSpeak)
                  setAutoSpeak(!autoSpeak)
                  if (autoSpeak) stopSpeaking()
                }}
              >
                {autoSpeak ? <Volume2 size={17} /> : <VolumeX size={17} />}
              </IconButton>
            )}
            <IconButton
              label={shuffle ? 'Shuffle: on (S)' : 'Shuffle: off (S)'}
              aria-pressed={shuffle}
              onClick={toggleShuffle}
              className={cx(shuffle && 'bg-accent-soft text-accent hover:bg-accent-soft')}
            >
              <Shuffle size={16} />
            </IconButton>
            <IconButton label="Undo (Z)" onClick={undo} disabled={!history.length}>
              <Undo2 size={17} />
            </IconButton>
            <IconButton label="Edit card (E)" onClick={() => setEditing(true)} disabled={!current}>
              <Pencil size={16} />
            </IconButton>
            <IconButton label="Suspend card (-)" onClick={suspend} disabled={!current} className="hidden sm:inline-flex">
              <EyeOff size={16} />
            </IconButton>
          </div>
        </div>
        <Progress value={progress} className="h-[3px] rounded-none bg-transparent" />
      </header>

      {current ? (
        <>
          <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 pb-48 sm:pt-12">
            <div className="mb-3 flex items-center justify-between text-xs text-faint">
              <span className="flex items-center gap-2">
                {!deckParam && deck && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: deck.color }} />
                    {deck.name}
                  </span>
                )}
                {current.tags.slice(0, 3).map((t) => (
                  <span key={t} className="rounded-md bg-subtle px-1.5 py-0.5">#{t}</span>
                ))}
              </span>
              <span>{current.state === 0 ? 'New card' : current.lapses > 0 ? `Lapsed ${current.lapses}×` : ''}</span>
            </div>
            <Panel
              key={current.id + String(history.length)}
              className={cx('animate-pop cursor-pointer p-6 shadow-sm sm:p-10', !revealed && 'hover:border-line-strong')}
              onClick={() => !revealed && setRevealed(true)}
            >
              <div className={cx(speakable && 'flex flex-col gap-3', speakable && (compact ? 'items-center' : 'items-start'))}>
                <Markdown source={current.front} className={cx(compact ? 'text-center text-xl font-medium sm:text-2xl' : 'text-base sm:text-[17px]')} />
                {speakable && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      playFront()
                    }}
                    title={frenchFront ? 'Listen in French (R)' : 'Listen to the question (M)'}
                    aria-label={frenchFront ? 'Listen in French' : 'Listen to the question'}
                    className="flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[13px] font-medium text-muted transition hover:border-accent/40 hover:text-accent"
                  >
                    <Volume2 size={15} /> Listen
                  </button>
                )}
              </div>
              {revealed && (
                <div className="animate-in">
                  <div className="my-6 border-t border-dashed border-line-strong sm:my-8" />
                  {speakable && (
                    <div className="-mt-2 mb-3 flex justify-end sm:-mt-4">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          playBack()
                        }}
                        title={frenchFront ? 'Listen to the meaning (M)' : 'Listen to the French examples (R)'}
                        className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-faint transition hover:bg-accent-soft hover:text-accent"
                      >
                        <Volume2 size={13} /> {frenchFront ? 'Meaning' : 'Examples'}
                      </button>
                    </div>
                  )}
                  <Markdown source={current.back} onClick={speakExample} className={cx(isFrench(current.tags) && canSpeak && 'speak-em', current.back.length < 140 && !current.back.includes('\n') ? 'text-center text-lg sm:text-xl' : 'text-base sm:text-[17px]')} />
                </div>
              )}
            </Panel>
          </main>

          {/* Answer bar */}
          <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
            <div className="mx-auto max-w-3xl px-3 py-3 sm:px-4 sm:py-4">
              {!revealed ? (
                <Button variant="primary" size="lg" className="w-full" onClick={() => setRevealed(true)}>
                  Show answer
                  <Kbd onAccent className="ml-1 max-sm:hidden">Space</Kbd>
                </Button>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {RATINGS.map((r) => (
                    <button
                      key={r}
                      disabled={busy}
                      onClick={() => rate(r)}
                      className={cx('flex h-16 flex-col items-center justify-center rounded-xl border bg-surface transition-all active:scale-[0.97]', RATING_STYLE[r])}
                    >
                      <span className="text-sm font-semibold">{RATING_LABEL[r]}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-muted tabular-nums">
                        {preview ? formatInterval(preview[r].due - Date.now()) : ''}
                        <span className="hidden text-faint sm:inline">· {r}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </footer>
        </>
      ) : (
        <Finished
          reviewed={reviewed}
          ms={Date.now() - startedAt.current}
          ratings={ratings}
          waiting={queue.learning.length}
          nothingToDo={initialTotal === 0}
          deckId={deckParam}
          onUndo={history.length ? undo : undefined}
        />
      )}

      <CardEditor
        open={editing}
        card={current}
        onClose={() => setEditing(false)}
        onSaved={(c) => {
          setCurrent(c)
          setQueue((q) =>
            q && {
              learning: q.learning.map((x) => (x.id === c.id ? c : x)),
              review: q.review.map((x) => (x.id === c.id ? c : x)),
              fresh: q.fresh.map((x) => (x.id === c.id ? c : x)),
            },
          )
        }}
      />
    </div>
  )
}

function Finished({
  reviewed,
  ms,
  ratings,
  waiting,
  nothingToDo,
  deckId,
  onUndo,
}: {
  reviewed: number
  ms: number
  ratings: Record<Rating, number>
  waiting: number
  nothingToDo: boolean
  deckId: string | null
  onUndo?: () => void
}) {
  const nav = useNavigate()
  const correct = ratings[2] + ratings[3] + ratings[4]
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 animate-in flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <PartyPopper size={30} />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{nothingToDo ? 'Nothing due right now' : 'Session complete'}</h1>
      <p className="mt-2 text-sm text-muted">
        {nothingToDo
          ? 'You’re all caught up. Come back later, or test yourself to strengthen what you know.'
          : `You reviewed ${plural(reviewed, 'card')} in ${formatDuration(ms)}.`}
        {waiting > 0 && ` ${plural(waiting, 'learning card')} will be back shortly.`}
      </p>
      {reviewed > 0 && (
        <div className="mt-8 grid w-full grid-cols-4 gap-2">
          {RATINGS.map((r) => (
            <div key={r} className="rounded-xl border border-line bg-surface py-3">
              <div className={cx('text-xl font-semibold tabular-nums', ['', 'text-again', 'text-hard', 'text-good', 'text-easy'][r])}>{ratings[r]}</div>
              <div className="text-[11px] text-muted">{RATING_LABEL[r]}</div>
            </div>
          ))}
        </div>
      )}
      {reviewed > 0 && <p className="mt-4 text-[13px] text-muted">{Math.round((correct / reviewed) * 100)}% recalled</p>}
      <div className="mt-8 flex w-full flex-col gap-2 sm:flex-row">
        <Button className="flex-1" onClick={() => nav('/')}>
          <Home size={16} /> Home
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => nav(deckId ? `/test?deck=${deckId}` : '/test')}>
          <ClipboardCheck size={16} /> Test yourself
        </Button>
      </div>
      {onUndo && (
        <button onClick={onUndo} className="mt-4 flex items-center gap-1.5 text-[13px] text-muted hover:text-fg">
          <ArrowLeft size={14} /> Undo last answer
        </button>
      )}
    </main>
  )
}
