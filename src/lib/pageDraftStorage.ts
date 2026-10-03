/** Unfinished page work (Solve photo + crop + result, Create's extracted file/URL text) kept in
 * IndexedDB so a reload doesn't lose it — photos are far too big for localStorage. Every call
 * swallows storage errors: without storage the pages still work, they just don't survive a reload. */

const DB_NAME = 'quelio-page-drafts'
const DB_VERSION = 1
const STORE = 'drafts'

/** Drafts older than this are dropped instead of restored. */
export const PAGE_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

export type PageDraftKey = 'solve' | 'create'

interface StoredPageDraft {
  key: PageDraftKey
  savedAt: number
  data: unknown
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('open failed'))
    request.onblocked = () => reject(new Error('open blocked'))
  }).catch((error: unknown) => {
    dbPromise = null
    throw error
  })
  return dbPromise
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb()
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = work(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(request ? request.result : undefined)
    tx.onerror = () => reject(tx.error ?? new Error('transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'))
  })
}

/** The saved draft's data, or null when missing, unreadable or older than 24 hours (then also deleted). */
export async function readPageDraft(key: PageDraftKey): Promise<unknown> {
  try {
    const record = (await run<StoredPageDraft | undefined>('readonly', (store) => store.get(key))) as StoredPageDraft | undefined
    if (!record || typeof record.savedAt !== 'number') return null
    if (Date.now() - record.savedAt > PAGE_DRAFT_MAX_AGE_MS) {
      void deletePageDraft(key)
      return null
    }
    return record.data ?? null
  } catch {
    return null
  }
}

// Writes and deletes run one after another, so a slow save can never resurrect a cleared draft.
let writeQueue: Promise<void> = Promise.resolve()

function enqueue(work: () => Promise<unknown>): Promise<void> {
  writeQueue = writeQueue.then(work).then(
    () => undefined,
    // Storage full or blocked — the page keeps working from memory.
    () => undefined,
  )
  return writeQueue
}

export function writePageDraft(key: PageDraftKey, data: unknown): Promise<void> {
  return enqueue(() => run('readwrite', (store) => store.put({ key, savedAt: Date.now(), data } satisfies StoredPageDraft)))
}

export function deletePageDraft(key: PageDraftKey): Promise<void> {
  return enqueue(() => run('readwrite', (store) => store.delete(key)))
}
