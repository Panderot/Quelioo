import type { StoredSong } from '../songStorage'

/** The original browser-local song store (IndexedDB `quelio-songs`). It backs the UI-logic test build
 * (fake backend) and the one-time import of songs made before accounts existed. */

const DB_NAME = 'quelio-songs'
const DB_VERSION = 1
const STORE = 'songs'
const QUIZ_ID_INDEX = 'quizId'
const CREATED_AT_INDEX = 'createdAt'

/** Latest N songs kept per quiz (oldest for that quiz evicted beyond this). */
/** A quiz split into a numbered series needs one stored song per part (up to 3 parts). */
const MAX_PER_QUIZ = 6
/** Oldest songs evicted globally once the store holds more than this many, regardless of quiz. */
const MAX_TOTAL = 30

/** Fills in defaults for fields added after some records were already saved — every read goes
 * through this so older songs render instead of breaking. */
function withDefaults(raw: Omit<StoredSong, 'quizTitle' | 'tone' | 'factCheckPassed' | 'audioPath'> & Partial<StoredSong>): StoredSong {
  return {
    ...raw,
    audioPath: null,
    quizTitle: raw.quizTitle ?? raw.title,
    tone: raw.tone ?? 'normal',
    factCheckPassed: raw.factCheckPassed ?? true,
  }
}

class SongStorageError extends Error {}

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new SongStorageError('IndexedDB unavailable'))
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex(QUIZ_ID_INDEX, 'quizId', { unique: false })
        store.createIndex(CREATED_AT_INDEX, 'createdAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new SongStorageError(request.error?.message ?? 'open failed'))
  })
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new SongStorageError(request.error?.message ?? 'request failed'))
  })
}

async function getAllForQuiz(db: IDBDatabase, quizId: string): Promise<StoredSong[]> {
  const tx = db.transaction(STORE, 'readonly')
  const index = tx.objectStore(STORE).index(QUIZ_ID_INDEX)
  const all = await promisifyRequest(index.getAll(IDBKeyRange.only(quizId)))
  return all.map(withDefaults).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function deleteById(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(new SongStorageError(tx.error?.message ?? 'delete failed'))
  })
}

/** Corrects a stored song's duration to the length measured from its audio file. Best effort: a
 * missing record or an unavailable IndexedDB leaves the song as it was. */
export async function updateSongDurationLocal(id: string, durationSeconds: number): Promise<void> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const existing = await promisifyRequest(store.get(id))
    if (!existing) return
    store.put({ ...existing, durationSeconds })
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(new SongStorageError(tx.error?.message ?? 'update failed'))
    })
  } catch {
    // Keep the old value; it is corrected again the next time the songs load.
  }
}

/** Saves a new song, then evicts down to MAX_PER_QUIZ for this quiz and MAX_TOTAL overall (oldest
 * first). Throws SongStorageError if IndexedDB is unavailable or the write fails (e.g. quota) — the
 * caller still has the audio in memory for the current session and shows a localized note. */
export async function saveSongLocal(entry: Omit<StoredSong, 'id' | 'createdAt' | 'audioPath'>): Promise<StoredSong> {
  const db = await openDb()
  const record: StoredSong = { ...entry, audioPath: null, id: makeId(), createdAt: new Date().toISOString() }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(new SongStorageError(tx.error?.message ?? 'save failed'))
  })

  const forQuiz = await getAllForQuiz(db, entry.quizId)
  for (const stale of forQuiz.slice(MAX_PER_QUIZ)) {
    await deleteById(db, stale.id)
  }

  const totalTx = db.transaction(STORE, 'readonly')
  const allSortedByAge = await promisifyRequest(totalTx.objectStore(STORE).index(CREATED_AT_INDEX).getAll())
  if (allSortedByAge.length > MAX_TOTAL) {
    const oldestFirst = allSortedByAge.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    for (const stale of oldestFirst.slice(0, allSortedByAge.length - MAX_TOTAL)) {
      await deleteById(db, stale.id)
    }
  }

  return record
}

export async function getSongsForQuizLocal(quizId: string): Promise<StoredSong[]> {
  try {
    const db = await openDb()
    return await getAllForQuiz(db, quizId)
  } catch {
    return []
  }
}

/** Every song in the store, newest first — backs the Songs page (/songs). */
export async function getAllSongsLocal(): Promise<StoredSong[]> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readonly')
    const all = await promisifyRequest(tx.objectStore(STORE).getAll())
    return all.map(withDefaults).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}

export async function deleteSongLocal(id: string): Promise<void> {
  try {
    const db = await openDb()
    await deleteById(db, id)
  } catch {
    // Best-effort — if IndexedDB is unavailable there's nothing stored to delete anyway.
  }
}

/** Every quiz id that currently has at least one saved song — used to show the music icon on
 * Archive rows without opening a song for each one. */
export async function getQuizIdsWithSongsLocal(): Promise<Set<string>> {
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readonly')
    // The store is capped at MAX_TOTAL records, so reading them all and mapping to quizId is
    // simpler (and cheap) compared to IDBIndex.getAllKeys(), which returns primary keys, not the
    // index's own key values.
    const all = await promisifyRequest(tx.objectStore(STORE).getAll())
    return new Set(all.map((entry) => entry.quizId))
  } catch {
    return new Set()
  }
}


/** Empties the browser-local song database (after a verified import, when the student agrees). */
export async function clearAllLocalSongs(): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    // Nothing stored.
  }
}
