import { hashText } from './hash'
import { isLessonLevel, isLessonStyle, isLessonTone, isRecord } from './lesson'
import type { EpisodePlan, EpisodeScript, KeyPoint, LessonOptions } from './lesson'

/** Audio lessons live in their own IndexedDB database (`quelio-lessons`), so adding them never
 * migrates the other stores. `lessons` holds one record per lesson (all its parts); `plans` caches
 * the extracted key points per source + level + language, so changing only style or tone never
 * pays for a second extraction. Without IndexedDB everything works in memory for the session. */

const DB_NAME = 'quelio-lessons'
/** v2 adds the `segments` store (recorded audio); upgrades only create missing stores. */
const DB_VERSION = 2
const LESSONS = 'lessons'
const PLANS = 'plans'
const SEGMENTS = 'segments'
const SPEND_KEY = 'quelio.lessonSpend.v1'
const LESSON_SCHEMA_VERSION = 1
/** Oldest lessons are evicted beyond this many. */
const MAX_LESSONS = 200

export type LessonSourceKind = 'text' | 'file' | 'url' | 'quiz' | 'solution'

export interface StoredEpisode extends EpisodePlan {
  script: EpisodeScript | null
  /** Real cost of generating this part's script (owner-only info), null before it exists. */
  costUsd: number | null
  cachedShare: number | null
  /** Every line of this part has recorded audio for its current text and voices. */
  hasAudio?: boolean
  /** The student changed the script since its last check; it is re-checked before the next step. */
  pendingCheck?: boolean
  /** The student approved the script; only approved scripts are recorded. */
  approved?: boolean
  /** Voice per speaker id. */
  voices?: Record<string, string>
  /** Real cost of the audio recorded for this part so far. */
  audioCostUsd?: number
  /** Unknown abbreviations the pronunciation pass spelled out (owner info). */
  unknownAbbreviations?: string[]
}

export interface StoredLesson {
  id: string
  schemaVersion: number
  createdAt: string
  updatedAt: string
  title: string
  sourceKind: LessonSourceKind
  /** File name, URL, quiz title or solution topic; empty for pasted text. */
  sourceLabel: string
  sourceText: string
  /** Hash of source text + options, to offer an existing lesson instead of paying again. */
  sourceHash: string
  options: LessonOptions
  keyPoints: KeyPoint[]
  episodes: StoredEpisode[]
  planCostUsd: number
}

export interface CachedPlan {
  key: string
  title: string
  keyPoints: KeyPoint[]
  episodes: EpisodePlan[]
}

export function lessonSourceHash(sourceText: string, options: LessonOptions): string {
  return hashText(JSON.stringify([sourceText.trim(), options.style, options.level, options.tone, options.language]))
}

export function planCacheKey(sourceText: string, level: string, language: string): string {
  return hashText(JSON.stringify([sourceText.trim(), level, language]))
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createLessonId(): string {
  return makeId()
}

/** Normalizes any stored shape; null for unusable records. */
function withDefaults(raw: unknown): StoredLesson | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !isRecord(raw.options) || !Array.isArray(raw.episodes) || !Array.isArray(raw.keyPoints)) return null
  const options = raw.options
  const kinds: LessonSourceKind[] = ['text', 'file', 'url', 'quiz', 'solution']
  return {
    id: raw.id,
    schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : LESSON_SCHEMA_VERSION,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
    title: typeof raw.title === 'string' ? raw.title : '',
    sourceKind: kinds.includes(raw.sourceKind as LessonSourceKind) ? (raw.sourceKind as LessonSourceKind) : 'text',
    sourceLabel: typeof raw.sourceLabel === 'string' ? raw.sourceLabel : '',
    sourceText: typeof raw.sourceText === 'string' ? raw.sourceText : '',
    sourceHash: typeof raw.sourceHash === 'string' ? raw.sourceHash : '',
    options: {
      style: isLessonStyle(options.style) ? options.style : 'two_hosts',
      level: isLessonLevel(options.level) ? options.level : 'general',
      tone: isLessonTone(options.tone) ? options.tone : 'normal',
      language: typeof options.language === 'string' ? options.language : 'auto',
    },
    keyPoints: raw.keyPoints as KeyPoint[],
    episodes: (raw.episodes as unknown[]).filter(isRecord).map((episode, index) => ({
      part: typeof episode.part === 'number' ? episode.part : index + 1,
      keyPointIds: Array.isArray(episode.keyPointIds) ? (episode.keyPointIds as string[]) : [],
      script: isRecord(episode.script) ? (episode.script as unknown as EpisodeScript) : null,
      costUsd: typeof episode.costUsd === 'number' ? episode.costUsd : null,
      cachedShare: typeof episode.cachedShare === 'number' ? episode.cachedShare : null,
      ...(episode.hasAudio === true ? { hasAudio: true } : {}),
      ...(episode.pendingCheck === true ? { pendingCheck: true } : {}),
      ...(episode.approved === true ? { approved: true } : {}),
      ...(isRecord(episode.voices) ? { voices: episode.voices as Record<string, string> } : {}),
      ...(typeof episode.audioCostUsd === 'number' ? { audioCostUsd: episode.audioCostUsd } : {}),
      ...(Array.isArray(episode.unknownAbbreviations) ? { unknownAbbreviations: (episode.unknownAbbreviations as unknown[]).filter((entry): entry is string => typeof entry === 'string') } : {}),
    })),
    planCostUsd: typeof raw.planCostUsd === 'number' ? raw.planCostUsd : 0,
  }
}

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
export function isLessonStoragePersistent(): boolean {
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

const listeners = new Set<() => void>()

export function subscribeLessons(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notify() {
  listeners.forEach((listener) => listener())
}

export async function getAllLessons(): Promise<StoredLesson[]> {
  const all = await persistent(
    async () => ((await withStore<unknown[]>(LESSONS, 'readonly', (store) => store.getAll())) ?? []).map(withDefaults).filter((entry): entry is StoredLesson => entry !== null),
    () => [...memoryLessons.values()],
  )
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getLesson(id: string): Promise<StoredLesson | null> {
  return persistent(
    async () => withDefaults(await withStore<unknown>(LESSONS, 'readonly', (store) => store.get(id))),
    () => memoryLessons.get(id) ?? null,
  )
}

/** Saves (or replaces) a lesson, then evicts the oldest beyond MAX_LESSONS. */
export async function putLesson(lesson: StoredLesson): Promise<StoredLesson> {
  const record = { ...lesson, schemaVersion: LESSON_SCHEMA_VERSION, updatedAt: new Date().toISOString() }
  memoryLessons.set(record.id, record)
  await persistent(
    async () => {
      await withStore(LESSONS, 'readwrite', (store) => store.put(record))
      const stale = (await getAllLessons()).slice(MAX_LESSONS)
      if (stale.length > 0) await withStore(LESSONS, 'readwrite', (store) => stale.forEach((entry) => store.delete(entry.id)))
    },
    () => undefined,
  )
  notify()
  return record
}

export async function deleteLesson(id: string): Promise<void> {
  memoryLessons.delete(id)
  await persistent(
    async () => {
      await withStore(LESSONS, 'readwrite', (store) => store.delete(id))
    },
    () => undefined,
  )
  notify()
}

export async function getCachedPlan(key: string): Promise<CachedPlan | null> {
  return persistent(
    async () => {
      const raw = await withStore<unknown>(PLANS, 'readonly', (store) => store.get(key))
      return isRecord(raw) && Array.isArray(raw.keyPoints) && Array.isArray(raw.episodes) ? (raw as unknown as CachedPlan) : null
    },
    () => memoryPlans.get(key) ?? null,
  )
}

export async function putCachedPlan(plan: CachedPlan): Promise<void> {
  memoryPlans.set(plan.key, plan)
  await persistent(
    async () => {
      await withStore(PLANS, 'readwrite', (store) => store.put(plan))
    },
    () => undefined,
  )
}

/** Status shown in the list: audio is ready once every part has audio (part 2 of the feature). */
export function lessonStatus(lesson: StoredLesson): 'audio' | 'script' | 'none' {
  if (lesson.episodes.length > 0 && lesson.episodes.every((episode) => episode.hasAudio)) return 'audio'
  return lesson.episodes.some((episode) => episode.script) ? 'script' : 'none'
}

export function lessonCostUsd(lesson: StoredLesson): number {
  return lesson.planCostUsd + lesson.episodes.reduce((sum, episode) => sum + (episode.costUsd ?? 0) + (episode.audioCostUsd ?? 0), 0)
}

// ---------------------------------------------------------------------------
// Recorded audio segments, keyed by segmentKey (normalized text, voice, model, instructions)
// ---------------------------------------------------------------------------

export interface StoredSegment {
  key: string
  audio: Blob
  durationSeconds: number
  createdAt: string
}

const memorySegments = new Map<string, StoredSegment>()

export async function getSegments(keys: string[]): Promise<Map<string, StoredSegment>> {
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

export async function putSegment(segment: StoredSegment): Promise<void> {
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
export async function pruneSegments(keep: Set<string>): Promise<void> {
  for (const key of memorySegments.keys()) if (!keep.has(key)) memorySegments.delete(key)
  await persistent(
    async () => {
      const keys = ((await withStore<IDBValidKey[]>(SEGMENTS, 'readonly', (store) => store.getAllKeys())) ?? []).filter((key) => typeof key === 'string' && !keep.has(key))
      if (keys.length > 0) await withStore(SEGMENTS, 'readwrite', (store) => keys.forEach((key) => store.delete(key)))
    },
    () => undefined,
  )
}

// ---------------------------------------------------------------------------
// Owner spend this month (scripts + audio), kept even when a lesson is deleted
// ---------------------------------------------------------------------------

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function monthLessonSpendUsd(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(SPEND_KEY) ?? 'null') as { month?: string; usd?: number } | null
    return raw && raw.month === currentMonth() && typeof raw.usd === 'number' ? raw.usd : 0
  } catch {
    return 0
  }
}

export function addLessonSpend(usd: number): void {
  if (!(usd > 0)) return
  try {
    localStorage.setItem(SPEND_KEY, JSON.stringify({ month: currentMonth(), usd: Math.round((monthLessonSpendUsd() + usd) * 100000) / 100000 }))
  } catch {
    // localStorage unavailable: the total simply isn't kept.
  }
}
