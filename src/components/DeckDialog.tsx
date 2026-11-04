import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createDeck, db, type Deck } from '../lib/db'
import { DECK_COLORS, cx } from '../lib/utils'
import { useToast } from './toast'
import { Button, Input, Label, Modal, Textarea } from './ui'

export function DeckDialog({ open, onClose, deck }: { open: boolean; onClose: () => void; deck?: Deck | null }) {
  const nav = useNavigate()
  const toast = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(DECK_COLORS[0])
  const [newPerDay, setNewPerDay] = useState(20)
  const [reviewsPerDay, setReviewsPerDay] = useState(200)
  const [retention, setRetention] = useState(90)

  useEffect(() => {
    if (!open) return
    setName(deck?.name ?? '')
    setDescription(deck?.description ?? '')
    setColor(deck?.color ?? DECK_COLORS[Math.floor(Math.random() * DECK_COLORS.length)])
    setNewPerDay(deck?.newPerDay ?? 20)
    setReviewsPerDay(deck?.reviewsPerDay ?? 200)
    setRetention(Math.round((deck?.retention ?? 0.9) * 100))
  }, [open, deck])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    const fields = {
      name: name.trim(),
      description: description.trim(),
      color,
      newPerDay: Math.max(0, newPerDay),
      reviewsPerDay: Math.max(0, reviewsPerDay),
      retention: Math.min(0.99, Math.max(0.7, retention / 100)),
    }
    if (deck) {
      await db.decks.update(deck.id, fields)
      toast('Deck updated')
      onClose()
    } else {
      const d = await createDeck(fields)
      toast(`Created “${d.name}”`)
      onClose()
      nav(`/deck/${d.id}`)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={deck ? 'Deck settings' : 'New deck'}
      description={deck ? undefined : 'One deck per subject keeps things tidy. Use tags for finer topics.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="deck-form" disabled={!name.trim()}>
            {deck ? 'Save' : 'Create deck'}
          </Button>
        </>
      }
    >
      <form id="deck-form" onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="deck-name">Name</Label>
          <Input id="deck-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spanish vocabulary" />
        </div>
        <div>
          <Label htmlFor="deck-desc" hint="optional">
            Description
          </Label>
          <Textarea id="deck-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this deck for?" />
        </div>
        <div>
          <Label>Color</Label>
          <div className="flex flex-wrap gap-2">
            {DECK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
                className={cx('flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110', color === c && 'ring-2 ring-fg ring-offset-2 ring-offset-surface')}
                style={{ background: c }}
              >
                {color === c && <Check size={15} className="text-white" />}
              </button>
            ))}
          </div>
        </div>
        <details className="group rounded-xl border border-line px-4 py-3" open={!!deck}>
          <summary className="cursor-pointer text-sm font-medium select-none">Study settings</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="npd" hint="per day">
                New cards
              </Label>
              <Input id="npd" type="number" min={0} value={newPerDay} onChange={(e) => setNewPerDay(+e.target.value)} />
            </div>
            <div>
              <Label htmlFor="rpd" hint="per day">
                Max reviews
              </Label>
              <Input id="rpd" type="number" min={0} value={reviewsPerDay} onChange={(e) => setReviewsPerDay(+e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="ret" hint={`${retention}%`}>
                Desired retention
              </Label>
              <input id="ret" type="range" min={75} max={97} value={retention} onChange={(e) => setRetention(+e.target.value)} className="w-full accent-[var(--c-accent)]" />
              <p className="mt-1 text-xs text-muted">
                Higher = you remember more, but review more often. 90% is a good balance.
              </p>
            </div>
          </div>
        </details>
      </form>
    </Modal>
  )
}
