import { Download, HardDrive, Laptop, Moon, Sun, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Section } from '../components/Layout'
import { SyncPanel } from '../components/SyncPanel'
import { useToast } from '../components/toast'
import { Button, Kbd, Modal, PageHeader, Panel, Segmented } from '../components/ui'
import { exportBackup, isBackup, restoreBackup, wipeAll } from '../lib/db'
import { useTheme } from '../lib/hooks'
import { loadSampleDecks } from '../lib/sample'
import { downloadFile, plural } from '../lib/utils'

const SHORTCUTS: [string, string[]][] = [
  ['Search & commands', ['⌘', 'K']],
  ['Add a card', ['N']],
  ['Start studying (home)', ['↵']],
  ['Show answer', ['Space']],
  ['Again / Hard / Good / Easy', ['1', '2', '3', '4']],
  ['Undo last answer', ['Z']],
  ['Edit current card', ['E']],
  ['Suspend current card', ['-']],
  ['Pick option in a test', ['1–4']],
  ['True / False', ['T', 'F']],
  ['Exit study or test', ['Esc']],
]

export function SettingsPage() {
  const [theme, setTheme] = useTheme()
  const toast = useToast()
  const nav = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [usage, setUsage] = useState<string>('')
  const [wipe, setWipe] = useState(false)

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted)
    navigator.storage?.estimate?.().then((e) => e.usage != null && setUsage(`${(e.usage / 1024 / 1024).toFixed(1)} MB used`))
  }, [])

  async function backup() {
    const b = await exportBackup()
    downloadFile(`recall-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b))
    try {
      localStorage.setItem('recall-last-backup', String(Date.now()))
    } catch {
      /* ignore */
    }
    toast(`Backed up ${plural(b.cards.length, 'card')}`)
  }

  async function restore(f: File) {
    try {
      const data = JSON.parse(await f.text())
      if (!isBackup(data)) throw new Error('Not a KnowDeck backup file')
      await restoreBackup(data, 'merge')
      toast(`Restored ${plural(data.cards.length, 'card')}`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read file', { tone: 'error' })
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" />

      <Panel className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium">Appearance</div>
            <div className="text-[13px] text-muted">Match your system or pick a theme.</div>
          </div>
          <Segmented
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: <span className="flex items-center gap-1.5"><Sun size={14} /> Light</span> },
              { value: 'dark', label: <span className="flex items-center gap-1.5"><Moon size={14} /> Dark</span> },
              { value: 'system', label: <span className="flex items-center gap-1.5"><Laptop size={14} /> Auto</span> },
            ]}
          />
        </div>
      </Panel>

      <Section title="Sync">
        <SyncPanel />
      </Section>

      <Section title="Your data">
        <Panel className="divide-y divide-line">
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <HardDrive size={15} className="text-muted" /> Stored privately in this browser
              </div>
              <div className="mt-0.5 text-[13px] text-muted">
                {usage && `${usage} · `}
                {persisted ? 'Protected from automatic cleanup.' : 'Back up regularly — clearing site data would erase it.'}
              </div>
            </div>
            {!persisted && (
              <Button
                size="sm"
                onClick={async () => {
                  const ok = await navigator.storage?.persist?.()
                  setPersisted(!!ok)
                  toast(ok ? 'Storage is now persistent' : 'Your browser declined — keep regular backups', { tone: ok ? 'success' : 'info' })
                }}
              >
                Make persistent
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">Backup</div>
              <div className="mt-0.5 text-[13px] text-muted">Everything — decks, cards, history and tests — as one JSON file.</div>
            </div>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) restore(f)
                  e.target.value = ''
                }}
              />
              <Button size="sm" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> Restore
              </Button>
              <Button size="sm" variant="primary" onClick={backup}>
                <Download size={14} /> Download backup
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">Sample decks</div>
              <div className="mt-0.5 text-[13px] text-muted">Add two small decks to explore features.</div>
            </div>
            <Button
              size="sm"
              onClick={async () => {
                await loadSampleDecks()
                toast('Sample decks added')
                nav('/')
              }}
            >
              Add samples
            </Button>
          </div>
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-again">Erase all data</div>
              <div className="mt-0.5 text-[13px] text-muted">Permanently delete every deck, card and statistic.</div>
            </div>
            <Button size="sm" className="border-again/30 text-again hover:bg-again/10" onClick={() => setWipe(true)}>
              <Trash2 size={14} /> Erase
            </Button>
          </div>
        </Panel>
      </Section>

      <Section title="Keyboard shortcuts">
        <Panel className="divide-y divide-line">
          {SHORTCUTS.map(([label, keys]) => (
            <div key={label} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <span className="text-muted">{label}</span>
              <span className="flex gap-1">
                {keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </div>
          ))}
        </Panel>
      </Section>

      <Section title="About the scheduler">
        <Panel className="p-5 text-[13px] leading-relaxed text-muted">
          KnowDeck uses <b className="font-medium text-fg">FSRS-5</b>, the Free Spaced Repetition Scheduler that also powers modern Anki. It models each card’s
          <i> stability</i> (how long the memory lasts) and <i>difficulty</i>, then schedules the next review for when your chance of remembering drops to your
          deck’s desired retention (90% by default). New cards go through short learning steps (1m, 10m) before graduating to day-based intervals.
        </Panel>
      </Section>

      <Modal
        open={wipe}
        onClose={() => setWipe(false)}
        size="sm"
        title="Erase all data?"
        description="This cannot be undone. If sync is on, it also erases your data on other devices. Download a backup first if you might want anything back."
        footer={
          <>
            <Button variant="ghost" onClick={() => setWipe(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await wipeAll()
                setWipe(false)
                toast('All data erased')
                nav('/')
              }}
            >
              Erase everything
            </Button>
          </>
        }
      />
    </div>
  )
}
