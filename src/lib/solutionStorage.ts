import type { SolveResult } from '../api/solve'

/** Every successful Solve is kept in IndexedDB (thumbnails are Blobs, too big for localStorage) —
 * see CLAUDE.md. Backs the Archive "Solutions" tab and /archive/solutions/:id. */

const DB_NAME = 'quelio-solutions'
const DB_VERSION = 1
const STORE = 'solutions'
const CREATED_AT_INDEX = 'createdAt'

/** Oldest solutions are evicted once the store holds more than this many. */
export const MAX_SOLUTIONS = 300
/** Longest side of the stored thumbnail; the full-size photo is never stored. */
const THUMBNAIL_MAX_SIDE = 800
const THUMBNAIL_QUALITY = 0.75

/** Bump when a new field needs more than a read-time default (see withDefaults). */
export const SOLUTION_SCHEMA_VERSION = 1

export interface StoredSolution {
  id: string
  schemaVersion: number
  createdAt: string
  /** Compressed JPEG of the cropped photo (≤800px), or null when it couldn't be made. */
  thumbnail: Blob | null
  /** Output language requested for this solve ('auto' or a language code). */
  language: string
  result: SolveResult
  /**
   * Open-ended slot for later features (check-my-solution results, similar problems and the
   * student's answers, another method, step explanations). Each feature owns one key here and
   * must tolerate it being absent, so new data never needs a destructive migration.
   */
  extras: Record<string, unknown>
}

export class SolutionStorageError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

/** Normalizes any stored shape (older or partial records) into the current one — every read goes
 * through this so old records render instead of breaking. Returns null for unusable junk. */
export function withDefaults(raw: unknown): StoredSolution | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null
  const result = isRecord(raw.result) ? raw.result : {}
  return {
    id: raw.id,
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
    thumbnail: thumbnailFromStored(raw.thumbnail),
    language: typeof raw.language === 'string' ? raw.language : 'auto',
    result: {
      topic: typeof result.topic === 'string' ? result.topic : '',
      question: typeof result.question === 'string' ? result.question : '',
      intro: typeof result.intro === 'string' ? result.intro : '',
      steps: stringArray(result.steps),
      answer: typeof result.answer === 'string' ? result.answer : '',
      tip: typeof result.tip === 'string' ? result.tip : '',
      mistakes: stringArray(result.mistakes).slice(0, 2),
    },
    extras: isRecord(raw.extras) ? raw.extras : {},
  }
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

/** Shrinks the (already cropped) upload JPEG into a ≤800px thumbnail. Null if it can't be made. */
export async function makeThumbnail(dataUrl: string): Promise<Blob | null> {
  try {
    const img = new Image()
    img.src = dataUrl
    await img.decode()
    const scale = Math.min(1, THUMBNAIL_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', THUMBNAIL_QUALITY))
  } catch {
    return null
  }
}

export async function saveSolution(input: { result: SolveResult; imageDataUrl: string; language: string }): Promise<StoredSolution> {
  const record: StoredSolution = {
    id: makeId(),
    schemaVersion: SOLUTION_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    thumbnail: await makeThumbnail(input.imageDataUrl),
    language: input.language,
    result: input.result,
    extras: {},
  }
  await putAndEvict(record)
  return record
}

/** Puts a previously deleted record back with its original id and date (undo). */
export async function restoreSolution(record: StoredSolution): Promise<void> {
  await putAndEvict(record)
}

/** Every saved solution, newest first; [] when storage is unavailable. */
export async function getAllSolutions(): Promise<StoredSolution[]> {
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

export async function getSolution(id: string): Promise<StoredSolution | null> {
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

export async function deleteSolution(id: string): Promise<void> {
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
export async function updateSolutionExtras(id: string, key: string, value: unknown): Promise<void> {
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
