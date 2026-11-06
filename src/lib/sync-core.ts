/**
 * Firebase sync engine shared by the web and iOS apps (this file is copied verbatim
 * between src/lib and mobile/src/lib — keep the two in step).
 *
 * Model: every synced record (deck, card, review, test, quote) is one Firestore
 * document at users/{uid}/records/{kind:id}. Each device keeps a local outbox of keys
 * it changed. A sync pushes the outbox (row present → write, row gone → tombstone),
 * then pulls everything whose server_ts moved past this device's cursor. Conflicts are
 * last-write-wins on the client timestamp, enforced by firestore.rules and locally by
 * the outbox.
 */
import type { FirebaseApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type Auth,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  Timestamp,
  where,
  writeBatch,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'

export type SyncKind = 'deck' | 'card' | 'review' | 'test' | 'quote'

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
  server_ts: number // ms
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


export interface SyncBackend {
  app: FirebaseApp
  auth: Auth
}

const records = (db: Firestore, userId: string) => collection(db, 'users', userId, 'records')
const docId = (kind: SyncKind, id: string) => `${kind}:${id}`.replace(/\//g, '%2F')

/** Firestore rejects undefined values; JSON round-trip drops them like the old JSON column did. */
const clean = (data: Record<string, unknown>) => JSON.parse(JSON.stringify(data)) as Record<string, unknown>

export async function runSync(db: Firestore, userId: string, a: SyncAdapter) {
  if (!(await a.getMeta(`init:${userId}`))) {
    await a.enqueueAll()
    await a.setMeta(`init:${userId}`, '1')
  }

  // ---- push ----
  const outbox = await a.getOutbox()
  const col = records(db, userId)
  let pushed = 0
  for (let i = 0; i < outbox.length; i += PUSH_BATCH) {
    const batch = outbox.slice(i, i + PUSH_BATCH)
    const rows = await Promise.all(
      batch.map(async (e) => {
        const data = await a.readRecord(e.kind, e.id)
        return { e, row: { kind: e.kind, id: e.id, data: data ? clean(data) : null, deleted: !data, updated_at: e.ts, device: a.device, server_ts: serverTimestamp() } }
      }),
    )
    const wb = writeBatch(db)
    for (const { e, row } of rows) wb.set(doc(col, docId(e.kind, e.id)), row)
    try {
      await wb.commit()
    } catch (err) {
      // One stale write (another device has a newer edit) rejects the whole batch: retry one by one, dropping the stale ones.
      if ((err as { code?: string }).code !== 'permission-denied') throw err
      for (const { e, row } of rows) {
        const one = writeBatch(db)
        one.set(doc(col, docId(e.kind, e.id)), row)
        try {
          await one.commit()
        } catch (err2) {
          if ((err2 as { code?: string }).code !== 'permission-denied') throw err2
        }
      }
    }
    await a.clearOutbox(batch)
    pushed += batch.length
  }

  // ---- pull ----
  const cursorKey = `cursor:${userId}`
  const cursor = await a.getMeta(cursorKey)
  const sinceMs = cursor ? Number(cursor) - OVERLAP_MS : 0
  let latest = cursor ? Number(cursor) : 0
  let pulled = 0
  let after: QueryDocumentSnapshot | undefined
  for (;;) {
    const parts = [where('server_ts', '>', Timestamp.fromMillis(sinceMs)), orderBy('server_ts'), ...(after ? [startAfter(after)] : []), limit(PAGE)]
    const snap = await getDocs(query(col, ...parts))
    const rows: RemoteRecord[] = snap.docs.map((d) => {
      const v = d.data()
      return { kind: v.kind, id: v.id, data: v.data ?? null, updated_at: v.updated_at, deleted: !!v.deleted, device: v.device ?? null, server_ts: (v.server_ts as Timestamp).toMillis() }
    })
    const foreign = rows.filter((r) => r.device !== a.device)
    if (foreign.length) await a.applyRemote(foreign)
    pulled += foreign.length
    for (const r of rows) if (r.server_ts > latest) latest = r.server_ts
    if (snap.docs.length < PAGE) break
    after = snap.docs[snap.docs.length - 1]
  }
  if (latest && String(latest) !== cursor) await a.setMeta(cursorKey, String(latest))
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

export function createSyncController(backend: SyncBackend | null, adapter: SyncAdapter) {
  const client = backend
  const db = backend ? getFirestore(backend.app) : null
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
    if (!db || !userId) return
    if (running) {
      again = true
      return
    }
    running = true
    set({ state: 'syncing', error: undefined })
    try {
      await runSync(db, userId, adapter)
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
    onAuthStateChanged(client.auth, (user) => {
      const id = user?.uid
      const changed = id !== userId
      userId = id
      if (!id) {
        set({ state: 'signed-out', email: undefined, lastSync: undefined, error: undefined })
        return
      }
      set({ email: user?.email ?? undefined, state: status.state === 'signed-out' ? 'idle' : status.state })
      if (changed) schedule(0)
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
      try {
        await signInWithEmailAndPassword(client.auth, email.trim(), password)
      } catch (e) {
        throw new Error(authMessage(e))
      }
    },
    /** Create an account and sign in. Always true with Firebase (no email confirmation step). */
    async signUp(email: string, password: string) {
      if (!client) throw new Error('Sync is not configured')
      try {
        await createUserWithEmailAndPassword(client.auth, email.trim(), password)
        return true
      } catch (e) {
        throw new Error(authMessage(e))
      }
    },
    async signOut() {
      if (!client) return
      await fbSignOut(client.auth)
    },
  }
}

export type SyncController = ReturnType<typeof createSyncController>

function authMessage(e: unknown) {
  const code = (e as { code?: string }).code ?? ''
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
    'auth/weak-password': 'Use a password of at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/operation-not-allowed': 'Email sign-in isn’t turned on for this app yet.',
  }
  return messages[code] ?? (e instanceof Error ? e.message : String(e))
}
