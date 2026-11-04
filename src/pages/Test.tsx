import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Check, CheckCircle2, ClipboardCheck, Clock, Home, RotateCcw, X, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Ring } from '../components/Charts'
import { Section } from '../components/Layout'
import { useToast } from '../components/toast'
import { Badge, Button, EmptyState, IconButton, Input, Kbd, Markdown, PageHeader, Panel, Progress, Segmented, Switch } from '../components/ui'
import { db, type Card, type TestItemResult } from '../lib/db'
import { useDecks, useHotkeys } from '../lib/hooks'
import { buildQuiz, gradeTyped, QTYPE_LABEL, scoreMessage, type Direction, type Focus, type QType, type Question, type QuizConfig } from '../lib/quiz'
import { answerCard } from '../lib/session'
import { cx, formatDuration, plural, relativeTime, uid } from '../lib/utils'

const CFG_KEY = 'recall-test-config'

function loadCfg(): Omit<QuizConfig, 'deckIds'> {
  try {
    const raw = localStorage.getItem(CFG_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { count: 20, types: ['mc', 'typed', 'tf'], direction: 'forward', focus: 'all', updateSchedule: true }
}

// ---------------- Setup ----------------

export function TestSetup() {
  const decks = useDecks()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const counts = useLiveQuery(async () => {
    const m = new Map<string, number>()
    await db.cards.each((c) => {
      if (!c.suspended) m.set(c.deckId, (m.get(c.deckId) ?? 0) + 1)
    })
    return m
  }, [])
  const history = useLiveQuery(() => db.tests.orderBy('createdAt').reverse().limit(8).toArray(), [])
  const initial = useMemo(loadCfg, [])
  const [deckIds, setDeckIds] = useState<string[]>([])
  const [count, setCount] = useState(initial.count)
  const [types, setTypes] = useState<QType[]>(initial.types)
  const [direction, setDirection] = useState<Direction>(initial.direction)
  const [focus, setFocus] = useState<Focus>(initial.focus)
  const [updateSchedule, setUpdateSchedule] = useState(initial.updateSchedule)

  useEffect(() => {
    if (!decks || deckIds.length) return
    const p = params.get('deck')
    setDeckIds(p ? [p] : decks.map((d) => d.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decks])

  const available = deckIds.reduce((s, id) => s + (counts?.get(id) ?? 0), 0)
  const n = count === 0 ? available : Math.min(count, available)

  async function start() {
    const cfg: QuizConfig = { deckIds, count, types, direction, focus, updateSchedule }
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify({ count, types, direction, focus, updateSchedule }))
    } catch {
      /* ignore */
    }
    const cards = await db.cards.where('deckId').anyOf(deckIds).toArray()
    const questions = buildQuiz(cards, cfg)
    nav('/test/run', { state: { questions, cfg } })
  }

  if (!decks) return <div className="h-64" />
  if (!decks.length)
    return (
      <EmptyState icon={<ClipboardCheck size={22} />} title="Nothing to test yet" body="Create a deck or import some cards first.">
        <Button variant="primary" onClick={() => nav('/import')}>
          Import cards
        </Button>
      </EmptyState>
    )

  const toggleType = (t: QType) => setTypes((ts) => (ts.includes(t) ? (ts.length > 1 ? ts.filter((x) => x !== t) : ts) : [...ts, t]))
  const toggleDeck = (id: string) => setDeckIds((ds) => (ds.includes(id) ? ds.filter((x) => x !== id) : [...ds, id]))

  return (
    <div>
      <PageHeader title="Test yourself" description="Check what you really know. Mistakes are fed back into your review schedule." />

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Panel className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Decks</h3>
              <button
                className="text-[13px] font-medium text-accent hover:underline"
                onClick={() => setDeckIds(deckIds.length === decks.length ? [] : decks.map((d) => d.id))}
              >
                {deckIds.length === decks.length ? 'Clear' : 'Select all'}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {decks.map((d) => {
                const on = deckIds.includes(d.id)
                return (
                  <button
                    key={d.id}
                    onClick={() => toggleDeck(d.id)}
                    className={cx(
                      'flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all',
                      on ? 'border-accent bg-accent-soft/60' : 'border-line hover:border-line-strong',
                    )}
                  >
                    <span className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border', on ? 'border-accent bg-accent text-accent-fg' : 'border-line-strong')}>
                      {on && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.name}</span>
                    <span className="text-xs text-faint tabular-nums">{counts?.get(d.id) ?? 0}</span>
                  </button>
                )
              })}
            </div>
          </Panel>

          <Panel className="space-y-6 p-5">
            <div>
              <h3 className="mb-3 text-sm font-semibold">Question types</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(Object.keys(QTYPE_LABEL) as QType[]).map((t) => {
                  const on = types.includes(t)
                  return (
                    <button
                      key={t}
                      onClick={() => toggleType(t)}
                      className={cx('rounded-xl border px-3 py-2.5 text-[13px] font-medium transition-all', on ? 'border-accent bg-accent-soft/60 text-accent' : 'border-line text-muted hover:text-fg')}
                    >
                      {QTYPE_LABEL[t]}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-muted">Long answers automatically become self-check questions.</p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="mb-3 text-sm font-semibold">Questions</h3>
                <Segmented
                  className="w-full"
                  value={count}
                  onChange={setCount}
                  options={[
                    { value: 10, label: '10' },
                    { value: 20, label: '20' },
                    { value: 50, label: '50' },
                    { value: 0, label: 'All' },
                  ]}
                />
              </div>
              <div>
                <h3 className="mb-3 text-sm font-semibold">Ask with</h3>
                <Segmented
                  className="w-full"
                  value={direction}
                  onChange={setDirection}
                  options={[
                    { value: 'forward', label: 'Front' },
                    { value: 'reverse', label: 'Back' },
                    { value: 'mixed', label: 'Mixed' },
                  ]}
                />
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold">Focus on</h3>
              <Segmented
                className="w-full"
                value={focus}
                onChange={setFocus}
                options={[
                  { value: 'all', label: 'Everything' },
                  { value: 'weak', label: 'Weakest cards' },
                  { value: 'new-ish', label: 'Recently learned' },
                ]}
              />
            </div>
            <Switch
              checked={updateSchedule}
              onChange={setUpdateSchedule}
              label="Feed mistakes into spaced repetition"
              description="Cards you miss are marked “Again” so they come back for review soon."
            />
          </Panel>
        </div>

        <div className="xl:sticky xl:top-10 xl:self-start">
          <Panel className="p-5">
            <div className="text-sm text-muted">Ready</div>
            <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{plural(n, 'question')}</div>
            <div className="mt-1 text-[13px] text-muted">
              from {plural(deckIds.length, 'deck')} · ~{Math.max(1, Math.round((n * 12) / 60))} min
            </div>
            <Button variant="primary" size="lg" className="mt-5 w-full" disabled={!n} onClick={start}>
              Start test <ArrowRight size={17} />
            </Button>
            {available > 0 && available < 4 && types.includes('mc') && <p className="mt-3 text-xs text-muted">Multiple choice works best with at least 4 cards.</p>}
          </Panel>

          {history && history.length > 0 && (
            <Section title="Recent tests" className="mt-6">
              <Panel className="divide-y divide-line">
                {history.map((t) => {
                  const pct = t.total ? Math.round((t.correct / t.total) * 100) : 0
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <div className={cx('w-12 text-lg font-semibold tabular-nums', pct >= 80 ? 'text-good' : pct >= 50 ? 'text-hard' : 'text-again')}>{pct}%</div>
                      <div className="min-w-0 flex-1 text-[13px]">
                        <div className="font-medium">
                          {t.correct}/{t.total} correct
                        </div>
                        <div className="text-xs text-muted">
                          {relativeTime(t.createdAt)} · {formatDuration(t.durationMs)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </Panel>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------- Run ----------------

interface Answer {
  given: string
  correct: boolean
}

export function TestRun() {
  const nav = useNavigate()
  const loc = useLocation() as { state?: { questions: Question[]; cfg: QuizConfig } }
  const toast = useToast()
  const [questions, setQuestions] = useState<Question[]>(loc.state?.questions ?? [])
  const cfg = loc.state?.cfg
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<(Answer | null)[]>(() => questions.map(() => null))
  const [typed, setTyped] = useState('')
  const [revealed, setRevealed] = useState(false) // self-check
  const [finished, setFinished] = useState(false)
  const [startedAt, setStartedAt] = useState(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const savedRef = useRef(false)

  useEffect(() => {
    if (!loc.state?.questions?.length) nav('/test', { replace: true })
  }, [loc.state, nav])

  useEffect(() => {
    if (finished) return
    const id = setInterval(() => setElapsed(Date.now() - startedAt), 1000)
    return () => clearInterval(id)
  }, [finished, startedAt])

  const q = questions[idx]
  const a = answers[idx]

  useEffect(() => {
    setTyped('')
    setRevealed(false)
    if (q?.type === 'typed') requestAnimationFrame(() => inputRef.current?.focus())
  }, [idx, q?.type])

  const correctSoFar = answers.filter((x) => x?.correct).length

  function record(ans: Answer) {
    setAnswers((xs) => xs.map((x, i) => (i === idx ? ans : x)))
  }

  function next() {
    if (!a) return
    if (idx + 1 < questions.length) setIdx(idx + 1)
    else finish()
  }

  async function finish() {
    setFinished(true)
    if (savedRef.current || !cfg) return
    savedRef.current = true
    const items: TestItemResult[] = questions.map((qq, i) => ({
      cardId: qq.cardId,
      type: qq.type,
      prompt: qq.prompt,
      answer: qq.answer,
      given: answers[i]?.given ?? '',
      correct: !!answers[i]?.correct,
    }))
    const total = items.length
    const correct = items.filter((x) => x.correct).length
    await db.tests.add({ id: uid(), createdAt: Date.now(), deckIds: cfg.deckIds, total, correct, durationMs: Date.now() - startedAt, items })
    if (cfg.updateSchedule) {
      const missed = [...new Set(items.filter((x) => !x.correct).map((x) => x.cardId))]
      const cards = (await db.cards.bulkGet(missed)).filter(Boolean) as Card[]
      const decks = new Map((await db.decks.toArray()).map((d) => [d.id, d]))
      let n = 0
      for (const c of cards) {
        if (c.state === 0) continue
        await answerCard(c, 1, decks.get(c.deckId), 0, 'test')
        n++
      }
      if (n) toast(`${plural(n, 'missed card')} scheduled for review`, { tone: 'info' })
    }
  }

  function chooseMC(i: number) {
    if (!q || a || q.type !== 'mc') return
    record({ given: q.options![i], correct: i === q.correctIndex })
  }
  function chooseTF(v: boolean) {
    if (!q || a || q.type !== 'tf') return
    record({ given: v ? 'True' : 'False', correct: v === q.truth })
  }
  function submitTyped() {
    if (!q || a || q.type !== 'typed' || !typed.trim()) return
    const g = gradeTyped(typed, q.answer)
    record({ given: typed, correct: g.correct })
  }
  function selfGrade(ok: boolean) {
    if (!q || a || q.type !== 'self' || !revealed) return
    record({ given: ok ? 'Recalled' : 'Missed', correct: ok })
  }

  useHotkeys(
    {
      '1': () => (q?.type === 'mc' ? chooseMC(0) : q?.type === 'tf' ? chooseTF(true) : q?.type === 'self' && revealed ? selfGrade(false) : undefined),
      '2': () => (q?.type === 'mc' ? chooseMC(1) : q?.type === 'tf' ? chooseTF(false) : q?.type === 'self' && revealed ? selfGrade(true) : undefined),
      '3': () => chooseMC(2),
      '4': () => chooseMC(3),
      t: () => chooseTF(true),
      f: () => chooseTF(false),
      space: () => (a ? next() : q?.type === 'self' && !revealed ? setRevealed(true) : undefined),
      enter: () => (a ? next() : q?.type === 'self' && !revealed ? setRevealed(true) : undefined),
      escape: () => nav('/test'),
    },
    { enabled: !finished },
  )

  if (!q && !finished) return <div className="min-h-dvh bg-bg" />

  if (finished) {
    return (
      <Results
        questions={questions}
        answers={answers}
        ms={Date.now() - startedAt}
        onRetakeMissed={() => {
          const missed = questions.filter((_, i) => !answers[i]?.correct).map((x, i) => ({ ...x, id: x.id + '-r' + i }))
          savedRef.current = false
          setQuestions(missed)
          setAnswers(missed.map(() => null))
          setIdx(0)
          setFinished(false)
          setStartedAt(Date.now())
          setElapsed(0)
        }}
      />
    )
  }

  const opts = q.type === 'mc' ? q.options! : []

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-3 sm:px-4">
          <IconButton label="Quit test (Esc)" onClick={() => nav('/test')}>
            <X size={19} />
          </IconButton>
          <div className="flex-1 text-sm font-semibold tabular-nums">
            Question {idx + 1} <span className="font-normal text-muted">of {questions.length}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-muted tabular-nums">
            <Clock size={14} /> {formatDuration(elapsed)}
          </div>
          <div className="flex items-center gap-1.5 rounded-lg bg-good/10 px-2 py-1 text-[13px] font-semibold text-good tabular-nums">
            <Check size={14} strokeWidth={3} /> {correctSoFar}
          </div>
        </div>
        <Progress value={(idx + (a ? 1 : 0)) / questions.length} className="h-[3px] rounded-none bg-transparent" />
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-40 sm:pt-12">
        <div key={q.id} className="animate-in">
          <Badge tone="accent">{QTYPE_LABEL[q.type]}</Badge>
          <Panel className="mt-3 p-6 sm:p-8">
            <Markdown source={q.prompt} className="text-lg font-medium sm:text-xl" />
            {q.type === 'tf' && (
              <div className="mt-5 rounded-xl border border-dashed border-line-strong bg-subtle/50 p-4">
                <div className="mb-1 text-[11px] font-semibold tracking-wider text-faint uppercase">Proposed answer</div>
                <Markdown source={q.shown ?? ''} />
              </div>
            )}
          </Panel>

          {/* Multiple choice */}
          {q.type === 'mc' && (
            <div className="mt-4 grid gap-2">
              {opts.map((o, i) => {
                const isCorrect = i === q.correctIndex
                const picked = a && a.given === o
                return (
                  <button
                    key={i}
                    disabled={!!a}
                    onClick={() => chooseMC(i)}
                    className={cx(
                      'flex items-start gap-3 rounded-xl border bg-surface px-4 py-3.5 text-left transition-all',
                      !a && 'hover:-translate-y-px hover:border-accent/60 hover:shadow-sm',
                      a && isCorrect && 'border-good bg-good/8',
                      a && picked && !isCorrect && 'border-again bg-again/8',
                      a && !isCorrect && !picked && 'opacity-50',
                      !a && 'border-line',
                    )}
                  >
                    <span
                      className={cx(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs font-semibold',
                        a && isCorrect ? 'border-good bg-good text-white' : a && picked ? 'border-again bg-again text-white' : 'border-line text-muted',
                      )}
                    >
                      {a && isCorrect ? <Check size={13} strokeWidth={3} /> : a && picked ? <X size={13} strokeWidth={3} /> : i + 1}
                    </span>
                    <Markdown source={o} className="min-w-0 flex-1 text-[15px]" />
                  </button>
                )
              })}
            </div>
          )}

          {/* True / false */}
          {q.type === 'tf' && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[true, false].map((v) => {
                const isRight = v === q.truth
                const picked = a && a.given === (v ? 'True' : 'False')
                return (
                  <button
                    key={String(v)}
                    disabled={!!a}
                    onClick={() => chooseTF(v)}
                    className={cx(
                      'flex h-14 items-center justify-center gap-2 rounded-xl border bg-surface text-[15px] font-semibold transition-all',
                      !a && 'border-line hover:border-accent/60',
                      a && isRight && 'border-good bg-good/8 text-good',
                      a && picked && !isRight && 'border-again bg-again/8 text-again',
                      a && !isRight && !picked && 'border-line opacity-50',
                    )}
                  >
                    {v ? 'True' : 'False'} <Kbd className="max-sm:hidden">{v ? 'T' : 'F'}</Kbd>
                  </button>
                )
              })}
            </div>
          )}

          {/* Typed */}
          {q.type === 'typed' && (
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (a) next()
                else submitTyped()
              }}
            >
              <Input
                ref={inputRef}
                value={typed}
                disabled={!!a}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Type your answer…"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className={cx('h-12 text-base', a && (a.correct ? 'border-good' : 'border-again'))}
              />
              {!a && (
                <Button type="submit" variant="primary" size="lg" disabled={!typed.trim()}>
                  Check
                </Button>
              )}
            </form>
          )}

          {/* Self-check */}
          {q.type === 'self' && !a && (
            <div className="mt-4">
              {!revealed ? (
                <Button size="lg" className="w-full" onClick={() => setRevealed(true)}>
                  Reveal answer <Kbd className="ml-1 max-sm:hidden">Space</Kbd>
                </Button>
              ) : (
                <div className="animate-in">
                  <Panel className="p-5">
                    <Markdown source={q.answer} />
                  </Panel>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button size="lg" className="border-again/30 text-again hover:bg-again/10" onClick={() => selfGrade(false)}>
                      <XCircle size={17} /> Missed it <Kbd className="ml-1 max-sm:hidden">1</Kbd>
                    </Button>
                    <Button size="lg" className="border-good/30 text-good hover:bg-good/10" onClick={() => selfGrade(true)}>
                      <CheckCircle2 size={17} /> Got it <Kbd className="ml-1 max-sm:hidden">2</Kbd>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Feedback */}
          {a && (
            <div className={cx('mt-4 animate-in rounded-xl border p-4', a.correct ? 'border-good/30 bg-good/8' : 'border-again/30 bg-again/8')}>
              <div className={cx('flex items-center gap-2 text-sm font-semibold', a.correct ? 'text-good' : 'text-again')}>
                {a.correct ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                {a.correct ? 'Correct' : 'Not quite'}
              </div>
              {(q.type === 'typed' || q.type === 'tf') && (
                <div className="mt-2 text-sm">
                  <span className="text-muted">Answer: </span>
                  <Markdown source={q.answer} className="inline [&>p]:inline" />
                </div>
              )}
              {q.type === 'typed' && !a.correct && (
                <button
                  onClick={() => record({ given: a.given, correct: true })}
                  className="mt-3 text-[13px] font-medium text-muted underline underline-offset-2 hover:text-fg"
                >
                  I was right — count it
                </button>
              )}
            </div>
          )}
        </div>
      </main>

      {a && (
        <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
          <div className="mx-auto max-w-3xl px-3 py-3 sm:px-4 sm:py-4">
            <Button variant="primary" size="lg" className="w-full" onClick={next}>
              {idx + 1 < questions.length ? 'Next question' : 'See results'} <ArrowRight size={17} />
              <Kbd onAccent className="ml-1 max-sm:hidden">↵</Kbd>
            </Button>
          </div>
        </footer>
      )}
    </div>
  )
}

function Results({ questions, answers, ms, onRetakeMissed }: { questions: Question[]; answers: (Answer | null)[]; ms: number; onRetakeMissed: () => void }) {
  const nav = useNavigate()
  const correct = answers.filter((a) => a?.correct).length
  const pct = questions.length ? Math.round((correct / questions.length) * 100) : 0
  const msg = scoreMessage(pct)
  const missed = questions.length - correct
  const color = pct >= 80 ? 'var(--c-good)' : pct >= 50 ? 'var(--c-hard)' : 'var(--c-again)'
  return (
    <div className="min-h-dvh bg-bg">
      <main className="mx-auto max-w-2xl animate-in px-4 py-10 sm:py-16">
        <div className="flex flex-col items-center text-center">
          <Ring value={pct / 100} size={148} stroke={12} color={color}>
            <span className="text-4xl font-semibold tracking-tight tabular-nums">{pct}%</span>
            <span className="text-xs text-muted">
              {correct}/{questions.length}
            </span>
          </Ring>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">{msg.title}</h1>
          <p className="mt-1.5 text-sm text-muted">
            {msg.body} · {formatDuration(ms)}
          </p>
          <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {missed > 0 && (
              <Button variant="primary" onClick={onRetakeMissed}>
                <RotateCcw size={16} /> Retry {plural(missed, 'miss', 'misses')}
              </Button>
            )}
            <Button onClick={() => nav('/test')}>
              <ClipboardCheck size={16} /> New test
            </Button>
            <Button variant="ghost" onClick={() => nav('/')}>
              <Home size={16} /> Home
            </Button>
          </div>
        </div>

        <h2 className="mt-12 mb-3 text-[15px] font-semibold">Review</h2>
        <Panel className="divide-y divide-line">
          {questions.map((q, i) => {
            const a = answers[i]
            return (
              <div key={q.id} className="flex gap-3 px-4 py-3.5">
                {a?.correct ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-good" /> : <XCircle size={18} className="mt-0.5 shrink-0 text-again" />}
                <div className="min-w-0 flex-1 text-sm">
                  <Markdown source={q.prompt} className="font-medium" />
                  <div className="mt-1 text-[13px] text-muted">
                    <Markdown source={q.answer} />
                  </div>
                  {!a?.correct && a?.given && q.type !== 'self' && <div className="mt-1 text-[13px] text-again">You said: {a.given}</div>}
                </div>
              </div>
            )
          })}
        </Panel>
      </main>
    </div>
  )
}
