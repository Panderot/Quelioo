import { isRecord } from '../lesson'
import { LESSON_SCHEMA_VERSION, normalizeLesson } from '../lessonStorage'
import type { CachedPlan, StoredLesson, StoredSegment } from '../lessonStorage'

/** The original browser-local lesson store (IndexedDB `quelio-lessons`: lessons, plans, recorded
 * segments). It backs the UI-logic test build (fake backend) and the one-time import of lessons made
 * before accounts existed. Without IndexedDB everything works in memory for the session. */

const DB_NAME = 'quelio-lessons'
/** v2 adds the `segments` store (recorded audio); upgrades only create missing stores. */
const DB_VERSION = 2
const LESSONS = 'lessons'
const PLANS = 'plans'
const SEGMENTS = 'segments'
/** Oldest lessons are evicted beyond this many. */
const MAX_LESSONS = 200

// ---------------------------------------------------------------------------
// IndexedDB with an in-memory fallback
// ---------------------------------------------------------------------------

const memoryLessons = new Map<string, StoredLesson>()
const memoryPlans = new Map<string, CachedPlan>()
/** Some privacy modes throw on any access to `indexedDB`, so even the existence check is guarded. */
function detectIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined'
  } catch {
    return false
  }
}

let indexedDbWorks = detectIndexedDb()

/** False once IndexedDB turned out to be unavailable (lessons then last for this session only). */
export function isLocalLessonStoragePersistent(): boolean {
  return indexedDbWorks
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!indexedDbWorks) {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (error) {
      reject(error instanceof Error ? error : new Error('open failed'))
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(LESSONS)) db.createObjectStore(LESSONS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(PLANS)) db.createObjectStore(PLANS, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(SEGMENTS)) db.createObjectStore(SEGMENTS, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('open failed'))
    request.onblocked = () => reject(new Error('open blocked'))
  })
}

async function withStore<T>(store: string, mode: IDBTransactionMode, work: (objectStore: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const request = work(tx.objectStore(store))
      let result: T | undefined
      if (request) request.onsuccess = () => (result = request.result)
      tx.oncomplete = () => resolve(result)
      tx.onerror = () => reject(tx.error ?? new Error('transaction failed'))
      tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'))
    })
  } finally {
    db.close()
  }
}

/** Runs the IndexedDB path; on failure switches to memory for the rest of the session. */
async function persistent<T>(idb: () => Promise<T>, memory: () => T): Promise<T> {
  if (indexedDbWorks) {
    try {
      return await idb()
    } catch {
      indexedDbWorks = false
    }
  }
  return memory()
}

export async function getAllLessonsLocal(): Promise<StoredLesson[]> {
  const all = await persistent(
    async () => ((await withStore<unknown[]>(LESSONS, 'readonly', (store) => store.getAll())) ?? []).map(normalizeLesson).filter((entry): entry is StoredLesson => entry !== null),
    () => [...memoryLessons.values()],
  )
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getLessonLocal(id: string): Promise<StoredLesson | null> {
  return persistent(
    async () => normalizeLesson(await withStore<unknown>(LESSONS, 'readonly', (store) => store.get(id))),
    () => memoryLessons.get(id) ?? null,
  )
}

/** Saves (or replaces) a lesson, then evicts the oldest beyond MAX_LESSONS. */
export async function putLessonLocal(lesson: StoredLesson): Promise<StoredLesson> {
  const record = { ...lesson, schemaVersion: LESSON_SCHEMA_VERSION, updatedAt: new Date().toISOString() }
  memoryLessons.set(record.id, record)
  await persistent(
    async () => {
      await withStore(LESSONS, 'readwrite', (store) => store.put(record))
      const stale = (await getAllLessonsLocal()).slice(MAX_LESSONS)
      if (stale.length > 0) await withStore(LESSONS, 'readwrite', (store) => stale.forEach((entry) => store.delete(entry.id)))
    },
    () => undefined,
  )
  return record
}

export async function deleteLessonLocal(id: string): Promise<void> {
  memoryLessons.delete(id)
  await persistent(
    async () => {
      await withStore(LESSONS, 'readwrite', (store) => store.delete(id))
    },
    () => undefined,
  )
}

export async function getCachedPlanLocal(key: string): Promise<CachedPlan | null> {
  return persistent(
    async () => {
      const raw = await withStore<unknown>(PLANS, 'readonly', (store) => store.get(key))
      return isRecord(raw) && Array.isArray(raw.keyPoints) && Array.isArray(raw.episodes) ? (raw as unknown as CachedPlan) : null
    },
    () => memoryPlans.get(key) ?? null,
  )
}

export async function putCachedPlanLocal(plan: CachedPlan): Promise<void> {
  memoryPlans.set(plan.key, plan)
  await persistent(
    async () => {
      await withStore(PLANS, 'readwrite', (store) => store.put(plan))
    },
    () => undefined,
  )
}

// ---------------------------------------------------------------------------
// Recorded audio segments, keyed by segmentKey (normalized text, voice, model, instructions)
// ---------------------------------------------------------------------------

const memorySegments = new Map<string, StoredSegment>()

export async function getSegmentsLocal(keys: string[]): Promise<Map<string, StoredSegment>> {
  const wanted = new Set(keys)
  const found = await persistent(
    async () => {
      const db = await openDb()
      try {
        return await new Promise<StoredSegment[]>((resolve, reject) => {
          const tx = db.transaction(SEGMENTS, 'readonly')
          const store = tx.objectStore(SEGMENTS)
          const result: StoredSegment[] = []
          for (const key of wanted) {
            const request = store.get(key)
            request.onsuccess = () => {
              const entry: unknown = request.result
              if (isRecord(entry) && typeof entry.key === 'string' && typeof entry.durationSeconds === 'number') {
                const audio = toBlob(entry.bytes ?? entry.audio)
                if (audio) result.push({ key: entry.key, audio, durationSeconds: entry.durationSeconds, createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '' })
              }
            }
          }
          tx.oncomplete = () => resolve(result)
          tx.onerror = () => reject(tx.error ?? new Error('read failed'))
        })
      } finally {
        db.close()
      }
    },
    () => [...memorySegments.values()].filter((entry) => wanted.has(entry.key)),
  )
  return new Map(found.map((segment) => [segment.key, segment]))
}

/** Stored as plain bytes: Safari refuses Blobs in IndexedDB in private browsing. */
function toBlob(value: unknown): Blob | null {
  if (value instanceof Blob) return value
  if (value instanceof ArrayBuffer) return new Blob([value], { type: 'audio/mpeg' })
  return null
}

export async function putSegmentLocal(segment: StoredSegment): Promise<void> {
  memorySegments.set(segment.key, segment)
  const bytes = await segment.audio.arrayBuffer()
  await persistent(
    async () => {
      await withStore(SEGMENTS, 'readwrite', (store) => store.put({ key: segment.key, bytes, durationSeconds: segment.durationSeconds, createdAt: segment.createdAt }))
    },
    () => undefined,
  )
}

/** Deletes recorded audio that no saved lesson line uses any more. */
export async function pruneSegmentsLocal(keep: Set<string>): Promise<void> {
  for (const key of memorySegments.keys()) if (!keep.has(key)) memorySegments.delete(key)
  await persistent(
    async () => {
      const keys = ((await withStore<IDBValidKey[]>(SEGMENTS, 'readonly', (store) => store.getAllKeys())) ?? []).filter((key) => typeof key === 'string' && !keep.has(key))
      if (keys.length > 0) await withStore(SEGMENTS, 'readwrite', (store) => keys.forEach((key) => store.delete(key)))
    },
    () => undefined,
  )
}

/** Empties the browser-local lesson database (after a verified import, when the student agrees). */
export async function clearAllLocalLessons(): Promise<void> {
  memoryLessons.clear()
  memoryPlans.clear()
  memorySegments.clear()
  await persistent(
    async () => {
      for (const store of [LESSONS, PLANS, SEGMENTS]) await withStore(store, 'readwrite', (objectStore) => objectStore.clear())
    },
    () => undefined,
  )
}

/** Every recorded segment on this device (for the import). */
export async function getAllSegmentsLocal(): Promise<StoredSegment[]> {
  const keys = await persistent(
    async () => ((await withStore<IDBValidKey[]>(SEGMENTS, 'readonly', (store) => store.getAllKeys())) ?? []).filter((key): key is string => typeof key === 'string'),
    () => [...memorySegments.keys()],
  )
  return [...(await getSegmentsLocal(keys)).values()]
}

/** Every cached plan on this device (for the import). */
export async function getAllPlansLocal(): Promise<CachedPlan[]> {
  return persistent(
    async () => ((await withStore<unknown[]>(PLANS, 'readonly', (store) => store.getAll())) ?? []).filter((entry): entry is CachedPlan => isRecord(entry) && typeof entry.key === 'string' && Array.isArray(entry.keyPoints) && Array.isArray(entry.episodes)),
    () => [...memoryPlans.values()],
  )
}
