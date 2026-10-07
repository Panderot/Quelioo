import { useSyncExternalStore } from 'react'

import { getAuthState, onSessionEnd, onSessionStart } from '../auth/authStore'
import { isFakeBackend, supabase } from '../supabase'
import type { Tables } from '../supabase'

/** Outbox for account writes that must not be lost. Every change the UI makes (card review, rename,
 * delete, a new quiz in the Archive...) is applied to the screen at once and sent through this queue:
 * jobs are kept in localStorage until the server confirms them, so a dropped connection, a closed tab
 * or a restart only delays a write. Network errors retry with a growing pause; a write the server
 * refuses (a rule, a permission) is dropped and reported through `failed` so it is never silent. */

export type TableName = keyof Tables

type Row = Record<string, unknown>

export type WriteJob =
  | { id: string; userId: string; kind: 'upsert'; table: TableName; rows: Row[]; onConflict?: string; ignoreDuplicates?: boolean }
  | { id: string; userId: string; kind: 'delete'; table: TableName; column: string; values: string[] }
  | { id: string; userId: string; kind: 'update'; table: TableName; column: string; value: string; patch: Row }
  | { id: string; userId: string; kind: 'rpc'; fn: 'merge_solve_extras'; args: Row }

export interface SyncStatus {
  /** Writes waiting to be sent (offline or retrying). */
  pending: number
  /** A write was refused by the server and could not be saved. */
  failed: boolean
}

const STORAGE_KEY = 'quelio.writeQueue.v1'
const LOCK_NAME = 'quelio-write-queue'
const CHUNK = 400
const RETRY_DELAYS_MS = [2000, 5000, 10_000, 20_000, 30_000]

let status: SyncStatus = { pending: 0, failed: false }
const listeners = new Set<() => void>()
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryAttempt = 0
let pumping = false

function setStatus(patch: Partial<SyncStatus>) {
  const next = { ...status, ...patch }
  if (next.pending === status.pending && next.failed === status.failed) return
  status = next
  listeners.forEach((listener) => listener())
}

export function getSyncStatus(): SyncStatus {
  return status
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus)
}

export function dismissSyncFailure() {
  setStatus({ failed: false })
}

function readJobs(): WriteJob[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? (parsed as WriteJob[]) : []
  } catch {
    return []
  }
}

/** Jobs that could not be persisted (storage unavailable) still run in this tab. */
let memoryJobs: WriteJob[] | null = null

function loadJobs(): WriteJob[] {
  return memoryJobs ?? readJobs()
}

function saveJobs(jobs: WriteJob[]) {
  try {
    if (jobs.length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs))
    memoryJobs = null
  } catch {
    memoryJobs = jobs
  }
}

function currentUserJobs(jobs: WriteJob[]): WriteJob[] {
  const userId = getAuthState().user?.id
  return userId ? jobs.filter((job) => job.userId === userId) : []
}

function refreshPending() {
  setStatus({ pending: currentUserJobs(loadJobs()).length })
}

function withLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  return locks ? locks.request(LOCK_NAME, work) : work()
}

type Outcome = 'ok' | 'retry' | 'refused'

interface PostgrestLikeError {
  message: string
  code?: string
  status?: number
}

function classify(error: PostgrestLikeError | null, httpStatus: number | undefined): Outcome {
  if (!error) return 'ok'
  const code = httpStatus ?? error.status ?? 0
  if (code === 0 || code >= 500 || code === 408 || code === 429 || code === 401) return 'retry'
  return /fetch|network|timeout/i.test(error.message) && !error.code ? 'retry' : 'refused'
}

interface QueryResult {
  error: PostgrestLikeError | null
  status?: number
}

async function execute(job: WriteJob): Promise<Outcome> {
  if (job.kind === 'rpc') {
    try {
      const result = (await (supabase.rpc as unknown as (fn: string, args: Row) => PromiseLike<QueryResult>)(job.fn, job.args)) as QueryResult
      return classify(result.error, result.status)
    } catch {
      return 'retry'
    }
  }
  const table = supabase.from(job.table) as unknown as {
    upsert: (rows: Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) => PromiseLike<QueryResult>
    delete: () => { in: (column: string, values: string[]) => PromiseLike<QueryResult> }
    update: (patch: Row) => { eq: (column: string, value: string) => PromiseLike<QueryResult> }
  }
  try {
    if (job.kind === 'upsert') {
      for (let index = 0; index < job.rows.length; index += CHUNK) {
        const result = await table.upsert(job.rows.slice(index, index + CHUNK), { onConflict: job.onConflict, ignoreDuplicates: job.ignoreDuplicates })
        const outcome = classify(result.error, result.status)
        if (outcome !== 'ok') return outcome
      }
      return 'ok'
    }
    if (job.kind === 'delete') {
      for (let index = 0; index < job.values.length; index += CHUNK) {
        const result = await table.delete().in(job.column, job.values.slice(index, index + CHUNK))
        const outcome = classify(result.error, result.status)
        if (outcome !== 'ok') return outcome
      }
      return 'ok'
    }
    const result = await table.update(job.patch).eq(job.column, job.value)
    return classify(result.error, result.status)
  } catch {
    return 'retry'
  }
}

function scheduleRetry() {
  if (retryTimer) return
  const delay = RETRY_DELAYS_MS[Math.min(retryAttempt, RETRY_DELAYS_MS.length - 1)]
  retryAttempt += 1
  retryTimer = setTimeout(() => {
    retryTimer = null
    void pump()
  }, delay)
}

/** Sends queued writes in order; stops at the first one that needs a retry. */
export async function pump(): Promise<void> {
  if (isFakeBackend || pumping || !getAuthState().user) return
  pumping = true
  try {
    await withLock(async () => {
      for (;;) {
        const job = currentUserJobs(loadJobs())[0]
        if (!job) {
          retryAttempt = 0
          break
        }
        const outcome = await execute(job)
        if (outcome === 'retry') {
          if (navigator.onLine) void supabase.auth.refreshSession()
          scheduleRetry()
          break
        }
        saveJobs(loadJobs().filter((entry) => entry.id !== job.id))
        if (outcome === 'refused') setStatus({ failed: true })
        refreshPending()
      }
    })
  } finally {
    pumping = false
    refreshPending()
  }
}

function makeJobId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Adds a write for the signed-in user and starts sending right away. */
export function enqueueWrite(job: DistributiveOmit<WriteJob, 'id' | 'userId'>): void {
  const userId = getAuthState().user?.id
  if (!userId || isFakeBackend) return
  void withLock(async () => {
    saveJobs([...loadJobs(), { ...job, id: makeJobId(), userId } as WriteJob])
  }).then(() => {
    refreshPending()
    void pump()
  })
}

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never

/** Resolves once everything queued for the current user was sent (or a retry is needed again). */
export async function flushWrites(): Promise<boolean> {
  await pump()
  return currentUserJobs(loadJobs()).length === 0
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void pump())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void pump()
  })
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) refreshPending()
  })
  onSessionStart(() => {
    refreshPending()
    void pump()
  })
  onSessionEnd(() => {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    retryAttempt = 0
    setStatus({ pending: 0, failed: false })
  })
}
