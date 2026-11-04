import { Cloud, CloudOff, LogOut, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { sync, useSyncStatus } from '../lib/sync'
import { cx, relativeTime } from '../lib/utils'
import { useToast } from './toast'
import { Button, Input, Panel } from './ui'

/** Settings → Sync: sign in with an emailed code, then decks sync with the iOS app. */
export function SyncPanel() {
  const status = useSyncStatus()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  if (status.state === 'off') {
    return (
      <Panel className="flex items-start gap-3 p-5">
        <CloudOff size={16} className="mt-0.5 shrink-0 text-muted" />
        <div>
          <div className="text-sm font-medium">Sync isn’t set up</div>
          <div className="mt-0.5 text-[13px] text-muted">
            Add <code className="font-mono text-[12px]">VITE_SUPABASE_URL</code> and <code className="font-mono text-[12px]">VITE_SUPABASE_ANON_KEY</code> to{' '}
            <code className="font-mono text-[12px]">.env.local</code> to sync decks with the iOS app.
          </div>
        </div>
      </Panel>
    )
  }

  if (status.state === 'signed-out') {
    const problem = !/.+@.+\..+/.test(email.trim())
      ? 'Enter your email address'
      : password.length < 6
        ? 'Use a password with at least 6 characters'
        : null
    const guard = (fn: () => Promise<void>) => () => (problem ? toast(problem, { tone: 'error' }) : run(fn))
    return (
      <Panel className="p-5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Cloud size={15} className="text-muted" /> Sync across devices
        </div>
        <div className="mt-0.5 text-[13px] text-muted">
          {notice ?? 'Sign in with the same email and password on each device to keep decks, cards and progress in step with the iOS app.'}
        </div>
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            guard(() => sync.signIn(email, password))()
          }}
        >
          <Input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="sm:flex-1" />
          <Input
            type="password"
            autoComplete="current-password"
            placeholder="Password (6+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="sm:flex-1"
          />
          <Button type="submit" variant="primary" disabled={busy}>
            Sign in
          </Button>
          <Button
            disabled={busy}
            onClick={guard(async () => {
              const signedIn = await sync.signUp(email, password)
              if (!signedIn) setNotice('Account created. Confirm your email, then sign in here.')
            })}
          >
            Create account
          </Button>
        </form>
      </Panel>
    )
  }

  const syncing = status.state === 'syncing'
  return (
    <Panel className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={cx('h-2 w-2 rounded-full', status.state === 'error' ? 'bg-again' : 'bg-easy')} />
          Syncing as <span className="truncate">{status.email}</span>
        </div>
        <div className={cx('mt-0.5 text-[13px]', status.state === 'error' ? 'text-again' : 'text-muted')}>
          {status.state === 'error'
            ? status.error
            : syncing
              ? 'Syncing…'
              : status.lastSync
                ? `Up to date · synced ${relativeTime(status.lastSync)}`
                : 'Waiting for first sync'}
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={syncing} onClick={() => sync.syncNow()}>
          <RefreshCw size={14} className={cx(syncing && 'animate-spin')} /> Sync now
        </Button>
        <Button size="sm" variant="ghost" onClick={() => run(() => sync.signOut())}>
          <LogOut size={14} /> Sign out
        </Button>
      </div>
    </Panel>
  )
}
