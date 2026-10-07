import type { StoredSolution } from '../solutionStorage'
import { makeThumbnail, normalizeSolution } from '../solutionStorage'

/** The original browser-local solution store (IndexedDB `quelio-solutions`). It backs the UI-logic test
 * build (fake backend) and the one-time import of solutions saved before accounts existed. */

const DB_NAME = 'quelio-solutions'
const DB_VERSION = 1
const STORE = 'solutions'
const CREATED_AT_INDEX = 'createdAt'

/** Oldest solutions are evicted once the store holds more than this many. */
const MAX_SOLUTIONS = 300
const SOLUTION_SCHEMA_VERSION = 1

class SolutionStorageError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function withDefaults(raw: unknown): StoredSolution | null {
  return normalizeSolution(raw, thumbnailFromStored)
}

/** Thumbnails are stored as raw bytes, not Blobs: some IndexedDB engines (e.g. WebKit builds)
 * refuse Blob values, while ArrayBuffers are stored everywhere. */
interface StoredThumbnail {
  type: string
  bytes: ArrayBuffer
}

function thumbnailFromStored(value: unknown): Blob | null {
  if (value instanceof Blob) return value
  if (isRecord(value) && value.bytes instanceof ArrayBuffer) {
    return new Blob([value.bytes], { type: typeof value.type === 'string' ? value.type : 'image/jpeg' })
  }
  return null
}

async function toStoredRecord(solution: StoredSolution): Promise<Record<string, unknown>> {
  const thumbnail: StoredThumbnail | null = solution.thumbnail
    ? { type: solution.thumbnail.type || 'image/jpeg', bytes: await solution.thumbnail.arrayBuffer() }
    : null
  return { ...solution, thumbnail }
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new SolutionStorageError('IndexedDB unavailable'))
  }
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (error) {
      reject(new SolutionStorageError(error instanceof Error ? error.message : 'open failed'))
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex(CREATED_AT_INDEX, 'createdAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new SolutionStorageError(request.error?.message ?? 'open failed'))
    request.onblocked = () => reject(new SolutionStorageError('open blocked'))
  })
}

function runTransaction(db: IDBDatabase, mode: IDBTransactionMode, work: (store: IDBObjectStore) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction
    try {
      tx = db.transaction(STORE, mode)
      work(tx.objectStore(STORE))
    } catch (error) {
      reject(new SolutionStorageError(error instanceof Error ? error.message : 'transaction failed'))
      return
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(new SolutionStorageError(tx.error?.message ?? 'transaction failed'))
    tx.onabort = () => reject(new SolutionStorageError(tx.error?.message ?? 'transaction aborted'))
  })
}

async function readAll(db: IDBDatabase): Promise<StoredSolution[]> {
  const raw = await new Promise<unknown[]>((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new SolutionStorageError(request.error?.message ?? 'read failed'))
  })
  return raw
    .map(withDefaults)
    .filter((entry): entry is StoredSolution => entry !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Writes a record, then evicts the oldest beyond MAX_SOLUTIONS. Throws SolutionStorageError when
 * IndexedDB is unavailable or full — callers keep working and show a localized note. */
async function putAndEvict(record: StoredSolution): Promise<void> {
  const stored = await toStoredRecord(record)
  const db = await openDb()
  try {
    await runTransaction(db, 'readwrite', (store) => store.put(stored))
    const all = await readAll(db)
    const stale = all.slice(MAX_SOLUTIONS)
    if (stale.length > 0) {
      await runTransaction(db, 'readwrite', (store) => stale.forEach((entry) => store.delete(entry.id)))
    }
  } finally {
    db.close()
  }
}

export async function saveSolutionLocal(input: { result: StoredSolution['result']; imageDataUrl: string; language: string }): Promise<StoredSolution> {
  const record: StoredSolution = {
    id: makeId(),
    schemaVersion: SOLUTION_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    thumbnail: await makeThumbnail(input.imageDataUrl),
    thumbnailUrl: null,
    language: input.language,
    result: input.result,
    extras: {},
  }
  await putAndEvict(record)
  return record
}

/** Puts a previously deleted record back with its original id and date (undo). */
export async function restoreSolutionLocal(record: StoredSolution): Promise<void> {
  await putAndEvict(record)
}

/** Every saved solution, newest first; [] when storage is unavailable. */
export async function getAllSolutionsLocal(): Promise<StoredSolution[]> {
  try {
    const db = await openDb()
    try {
      return await readAll(db)
    } finally {
      db.close()
    }
  } catch {
    return []
  }
}

export async function getSolutionLocal(id: string): Promise<StoredSolution | null> {
  try {
    const db = await openDb()
    try {
      const raw = await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(id)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(new SolutionStorageError(request.error?.message ?? 'read failed'))
      })
      return withDefaults(raw)
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

export async function deleteSolutionLocal(id: string): Promise<void> {
  try {
    const db = await openDb()
    try {
      await runTransaction(db, 'readwrite', (store) => store.delete(id))
    } finally {
      db.close()
    }
  } catch {
    // Best-effort — if IndexedDB is unavailable there's nothing stored to delete anyway.
  }
}

/** Merges one feature's data into a saved solution's `extras[key]` (read-modify-write in a single
 * transaction). Throws SolutionStorageError when storage is unavailable; a missing record is a no-op. */
export async function updateSolutionExtrasLocal(id: string, key: string, value: unknown): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      let tx: IDBTransaction
      try {
        tx = db.transaction(STORE, 'readwrite')
      } catch (error) {
        reject(new SolutionStorageError(error instanceof Error ? error.message : 'transaction failed'))
        return
      }
      const store = tx.objectStore(STORE)
      const request = store.get(id)
      request.onsuccess = () => {
        const raw: unknown = request.result
        if (!isRecord(raw)) return
        const extras = isRecord(raw.extras) ? raw.extras : {}
        try {
          store.put({ ...raw, extras: { ...extras, [key]: value } })
        } catch (error) {
          tx.abort()
          reject(new SolutionStorageError(error instanceof Error ? error.message : 'update failed'))
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(new SolutionStorageError(tx.error?.message ?? 'update failed'))
      tx.onabort = () => reject(new SolutionStorageError(tx.error?.message ?? 'update aborted'))
    })
  } finally {
    db.close()
  }
}

/** Empties the browser-local solution database (after a verified import, when the student agrees). */
export async function clearAllLocalSolutions(): Promise<void> {
  try {
    const db = await openDb()
    try {
      await runTransaction(db, 'readwrite', (store) => store.clear())
    } finally {
      db.close()
    }
  } catch {
    // Nothing stored.
  }
}
