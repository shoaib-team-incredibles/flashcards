/**
 * Supabase sync engine shared by the web and iOS apps (this file is copied verbatim
 * between src/lib and mobile/src/lib — keep the two in step).
 *
 * Model: every synced record (deck, card, review, test) is one row in `sync_records`.
 * Each device keeps a local outbox of keys it changed. A sync pushes the outbox
 * (row present → upsert, row gone → tombstone), then pulls everything whose
 * server_ts moved past this device's cursor. Conflicts are last-write-wins on the
 * client timestamp, enforced by a trigger on the server and by the outbox locally.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type SyncKind = 'deck' | 'card' | 'review' | 'test'

export interface OutboxEntry {
  key: string // `${kind}:${id}`
  kind: SyncKind
  id: string
  ts: number // when it was changed locally (ms)
}

export interface RemoteRecord {
  kind: SyncKind
  id: string
  data: Record<string, unknown> | null
  updated_at: number
  deleted: boolean
  device: string | null
  server_ts: string
}

/** Storage operations each app implements on top of its own database. */
export interface SyncAdapter {
  device: string
  getOutbox(): Promise<OutboxEntry[]>
  /** The record as it should be stored remotely, or undefined when it was deleted locally. */
  readRecord(kind: SyncKind, id: string): Promise<Record<string, unknown> | undefined>
  /** Drop outbox entries that were pushed, unless they changed again since. */
  clearOutbox(pushed: OutboxEntry[]): Promise<void>
  /** Write remote changes locally, without re-queuing them. Skips records with a newer local edit. */
  applyRemote(records: RemoteRecord[]): Promise<void>
  /** Queue every local record (first sync for a user, so both sides merge). */
  enqueueAll(): Promise<void>
  getMeta(key: string): Promise<string | undefined>
  setMeta(key: string, value: string): Promise<void>
}

export const keyOf = (kind: SyncKind, id: string) => `${kind}:${id}`
export const reviewSyncId = (cardId: string, ts: number) => `${cardId}:${ts}`
export function parseReviewSyncId(id: string) {
  const i = id.lastIndexOf(':')
  return { cardId: id.slice(0, i), ts: Number(id.slice(i + 1)) }
}

const PAGE = 1000
const PUSH_BATCH = 500
const OVERLAP_MS = 10_000 // re-read a little behind the cursor so slow commits are never missed

export async function runSync(client: SupabaseClient, userId: string, a: SyncAdapter) {
  if (!(await a.getMeta(`init:${userId}`))) {
    await a.enqueueAll()
    await a.setMeta(`init:${userId}`, '1')
  }

  // ---- push ----
  const outbox = await a.getOutbox()
  let pushed = 0
  for (let i = 0; i < outbox.length; i += PUSH_BATCH) {
    const batch = outbox.slice(i, i + PUSH_BATCH)
    const rows = await Promise.all(
      batch.map(async (e) => {
        const data = await a.readRecord(e.kind, e.id)
        return { user_id: userId, kind: e.kind, id: e.id, data: data ?? null, deleted: !data, updated_at: e.ts, device: a.device }
      }),
    )
    const { error } = await client.from('sync_records').upsert(rows, { onConflict: 'user_id,kind,id' })
    if (error) throw new Error(error.message)
    await a.clearOutbox(batch)
    pushed += batch.length
  }

  // ---- pull ----
  const cursorKey = `cursor:${userId}`
  const cursor = await a.getMeta(cursorKey)
  const since = cursor ? new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString() : '1970-01-01T00:00:00Z'
  let latest = cursor
  let pulled = 0
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('sync_records')
      .select('kind,id,data,updated_at,deleted,device,server_ts')
      .gt('server_ts', since)
      .order('server_ts')
      .order('kind')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as RemoteRecord[]
    const foreign = rows.filter((r) => r.device !== a.device)
    if (foreign.length) await a.applyRemote(foreign)
    pulled += foreign.length
    for (const r of rows) if (!latest || r.server_ts > latest) latest = r.server_ts
    if (rows.length < PAGE) break
  }
  if (latest && latest !== cursor) await a.setMeta(cursorKey, latest)
  return { pushed, pulled }
}

// ---------- controller: auth state, status, scheduling ----------

export type SyncState = 'off' | 'signed-out' | 'idle' | 'syncing' | 'error'

export interface SyncStatus {
  state: SyncState
  email?: string
  lastSync?: number
  error?: string
}

export function createSyncController(client: SupabaseClient | null, adapter: SyncAdapter) {
  let status: SyncStatus = { state: client ? 'signed-out' : 'off' }
  let userId: string | undefined
  let running = false
  let again = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let started = false
  const listeners = new Set<() => void>()

  const set = (patch: Partial<SyncStatus>) => {
    status = { ...status, ...patch }
    listeners.forEach((l) => l())
  }

  async function syncNow(): Promise<void> {
    if (!client || !userId) return
    if (running) {
      again = true
      return
    }
    running = true
    set({ state: 'syncing', error: undefined })
    try {
      await runSync(client, userId, adapter)
      set({ state: 'idle', lastSync: Date.now() })
    } catch (e) {
      set({ state: 'error', error: e instanceof Error ? e.message : String(e) })
    } finally {
      running = false
      if (again) {
        again = false
        schedule(500)
      }
    }
  }

  function schedule(delay = 2000) {
    if (!client || !userId) return
    clearTimeout(timer)
    timer = setTimeout(syncNow, delay)
  }

  function start() {
    if (!client || started) return
    started = true
    client.auth.onAuthStateChange((event, session) => {
      const id = session?.user.id
      const changed = id !== userId
      userId = id
      if (!id) {
        set({ state: 'signed-out', email: undefined, lastSync: undefined, error: undefined })
        return
      }
      set({ email: session?.user.email, state: status.state === 'signed-out' ? 'idle' : status.state })
      if (changed || event === 'SIGNED_IN') schedule(0)
    })
    setInterval(() => schedule(0), 60_000)
  }

  return {
    start,
    schedule,
    syncNow,
    getStatus: () => status,
    subscribe(l: () => void) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    async signIn(email: string, password: string) {
      if (!client) throw new Error('Sync is not configured')
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw new Error(error.message)
    },
    /** Create an account. Returns false when the project still requires email confirmation first. */
    async signUp(email: string, password: string) {
      if (!client) throw new Error('Sync is not configured')
      const { data, error } = await client.auth.signUp({ email: email.trim(), password })
      if (error) throw new Error(error.message)
      if (data.session) return true
      // The account may already be confirmed (e.g. confirmed server-side): try signing straight in.
      const signIn = await client.auth.signInWithPassword({ email: email.trim(), password })
      return !signIn.error
    },
    async signOut() {
      if (!client) return
      await client.auth.signOut()
    },
  }
}

export type SyncController = ReturnType<typeof createSyncController>
