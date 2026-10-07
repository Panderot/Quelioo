import { useEffect, useSyncExternalStore } from 'react'

import { getAuthState, useAuth } from './auth/authStore'
import { enqueueFlashcardWrites, fetchFlashcards } from './remote/flashcardsRemote'
import { isFakeBackend } from './supabase'
import { DEFAULT_NEW_PER_DAY, buildStudyQueue, resetProgress } from './srs'
import type { LeitnerBox, SrsCard, SrsProgress } from './srs'
import { MAX_BACK_CHARS, MAX_DECK_DESCRIPTION_CHARS, MAX_DECK_NAME_CHARS, MAX_FRONT_CHARS } from './flashcardText'

/** Flashcards live in the account (Supabase `decks`, `cards`, `card_progress`). Everything is held in an
 * in-memory cache that the UI reads synchronously; writes update the cache first and are sent through
 * the write queue, so a dropped connection only delays saving. The UI-logic test build (fake backend)
 * and the one-time import use the original IndexedDB database (`quelio-flashcards`) instead. */

const DB_NAME = 'quelio-flashcards'
const DB_VERSION = 1
const DECKS = 'decks'
const CARDS = 'cards'
export const UNDO_WINDOW_MS = 6000

export type DeckSource = 'manual' | 'topic' | 'text' | 'quiz' | 'solution'

export interface Deck {
  id: string
  name: string
  description: string
  source: DeckSource
  sourceRef: string | null
  language: string
  newPerDay: number
  createdAt: number
  updatedAt: number
}

export interface Card extends SrsCard {
  deckId: string
}

export interface DeletedDeck {
  deck: Deck
  cards: Card[]
}

export interface FlashcardState {
  loaded: boolean
  decks: Deck[]
  cards: Card[]
  /** The account copy could not be loaded (network); `reloadFlashcards()` retries. */
  loadFailed: boolean
  /** IndexedDB could not be opened — everything lives in memory for this tab only. */
  storageUnavailable: boolean
  /** A write failed (e.g. quota) — the change is kept in memory but not saved. */
  saveFailed: boolean
  /** The most recently deleted deck, kept until its undo toast closes. */
  deletedDeck: DeletedDeck | null
  /** Time of the last change — "due now" checks use max(clock tick, this) so a card graded a
   * moment ago counts as due without waiting for the next clock tick. */
  changedAt: number
}

let state: FlashcardState = { loaded: false, loadFailed: false, decks: [], cards: [], storageUnavailable: false, saveFailed: false, deletedDeck: null, changedAt: 0 }
const listeners = new Set<() => void>()
let dbPromise: Promise<IDBDatabase | null> | null = null
let writeChain: Promise<void> = Promise.resolve()

function setState(patch: Partial<FlashcardState>) {
  state = { ...state, ...patch, changedAt: Date.now() }
  listeners.forEach((listener) => listener())
}

function makeId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(DECKS)) db.createObjectStore(DECKS, { keyPath: 'id' })
        if (!db.objectStoreNames.contains(CARDS)) db.createObjectStore(CARDS, { keyPath: 'id' }).createIndex('deckId', 'deckId', { unique: false })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function readAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error)
  })
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '')
const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
const numOrNull = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const SOURCES: DeckSource[] = ['manual', 'topic', 'text', 'quiz', 'solution']

/** Reads tolerate records written by older versions: missing or malformed fields get defaults. */
function deckWithDefaults(raw: Partial<Deck>): Deck | null {
  if (typeof raw.id !== 'string') return null
  const createdAt = num(raw.createdAt, Date.now())
  return {
    id: raw.id,
    name: text(raw.name, MAX_DECK_NAME_CHARS),
    description: text(raw.description, MAX_DECK_DESCRIPTION_CHARS),
    source: SOURCES.includes(raw.source as DeckSource) ? (raw.source as DeckSource) : 'manual',
    sourceRef: typeof raw.sourceRef === 'string' ? raw.sourceRef : null,
    language: typeof raw.language === 'string' ? raw.language : 'en',
    newPerDay: Math.max(1, Math.round(num(raw.newPerDay, DEFAULT_NEW_PER_DAY))),
    createdAt,
    updatedAt: num(raw.updatedAt, createdAt),
  }
}

function cardWithDefaults(raw: Partial<Card>): Card | null {
  if (typeof raw.id !== 'string' || typeof raw.deckId !== 'string') return null
  const createdAt = num(raw.createdAt, Date.now())
  const box = Math.min(5, Math.max(1, Math.round(num(raw.box, 1)))) as LeitnerBox
  return {
    id: raw.id,
    deckId: raw.deckId,
    front: text(raw.front, MAX_FRONT_CHARS),
    back: text(raw.back, MAX_BACK_CHARS),
    box,
    due: num(raw.due, createdAt),
    lapses: Math.max(0, num(raw.lapses, 0)),
    reviews: Math.max(0, num(raw.reviews, 0)),
    lastReviewedAt: numOrNull(raw.lastReviewedAt),
    introducedAt: numOrNull(raw.introducedAt),
    createdAt,
  }
}

let loadPromise: Promise<void> | null = null

/** Reads the account copy. A blank deck left over from an earlier visit is dropped for good. */
async function loadRemoteFlashcards(): Promise<void> {
  const userId = getAuthState().user?.id
  const fetched = await fetchFlashcards()
  if (getAuthState().user?.id !== userId) return
  if (!fetched) {
    loadPromise = null
    setState({ loaded: true, loadFailed: true })
    return
  }
  const validDecks = fetched.decks.map(deckWithDefaults).filter((deck): deck is Deck => deck !== null)
  const deckIds = new Set(validDecks.map((deck) => deck.id))
  const validCards = fetched.cards.map(cardWithDefaults).filter((card): card is Card => card !== null && deckIds.has(card.deckId))
  const blankIds = validDecks.filter((deck) => isBlankDeck(deck, validCards) && !state.decks.some((entry) => entry.id === deck.id)).map((deck) => deck.id)
  if (blankIds.length > 0) {
    validDecks.splice(0, validDecks.length, ...validDecks.filter((deck) => !blankIds.includes(deck.id)))
    persist({ deleteDecks: blankIds })
  }
  const known = (ids: Set<string>) => (entry: { id: string }) => !ids.has(entry.id)
  setState({
    loaded: true,
    loadFailed: false,
    decks: [...validDecks, ...state.decks.filter(known(deckIds))],
    cards: [...validCards, ...state.cards.filter(known(new Set(validCards.map((card) => card.id))))],
  })
}

/** Retries a failed load of the account copy. */
export function reloadFlashcards(): void {
  loadPromise = null
  setState({ loadFailed: false, loaded: false })
  void loadFlashcards()
}

/** Forgets the account copy (sign-out, other account). */
export function resetFlashcardCache(): void {
  loadPromise = null
  state = { loaded: false, loadFailed: false, decks: [], cards: [], storageUnavailable: false, saveFailed: false, deletedDeck: null, changedAt: Date.now() }
  listeners.forEach((listener) => listener())
}

function loadFlashcards(): Promise<void> {
  if (loadPromise) return loadPromise
  if (!isFakeBackend) {
    loadPromise = loadRemoteFlashcards()
    return loadPromise
  }
  loadPromise = (async () => {
    const db = await openDb()
    if (!db) {
      setState({ loaded: true, storageUnavailable: true })
      return
    }
    try {
      const [decks, cards] = await Promise.all([readAll<Partial<Deck>>(db, DECKS), readAll<Partial<Card>>(db, CARDS)])
      const validDecks = decks.map(deckWithDefaults).filter((deck): deck is Deck => deck !== null)
      const deckIds = new Set(validDecks.map((deck) => deck.id))
      const validCards = cards.map(cardWithDefaults).filter((card): card is Card => card !== null && deckIds.has(card.deckId))
      // A blank deck left over from an earlier visit (the tab was closed before it was named) is dropped for good.
      const blankIds = validDecks.filter((deck) => isBlankDeck(deck, validCards) && !state.decks.some((entry) => entry.id === deck.id)).map((deck) => deck.id)
      if (blankIds.length > 0) {
        validDecks.splice(0, validDecks.length, ...validDecks.filter((deck) => !blankIds.includes(deck.id)))
        persist({ deleteDecks: blankIds })
      }
      // Merge rather than replace, in case something was created before the load finished.
      const known = (ids: Set<string>) => (entry: { id: string }) => !ids.has(entry.id)
      setState({
        loaded: true,
        decks: [...validDecks, ...state.decks.filter(known(deckIds))],
        cards: [...validCards, ...state.cards.filter(known(new Set(validCards.map((card) => card.id))))],
      })
    } catch {
      setState({ loaded: true, storageUnavailable: true })
    }
  })()
  return loadPromise
}

interface WriteOps {
  putDecks?: Deck[]
  deleteDecks?: string[]
  putCards?: Card[]
  /** Cards whose progress changed (a review); in IndexedDB the whole card is rewritten. */
  putProgress?: Card[]
  deleteCards?: string[]
}

/** Persists in order; a failure keeps the in-memory change and raises the "not saved" note. */
function persist(ops: WriteOps) {
  if (!isFakeBackend) {
    enqueueFlashcardWrites(ops)
    return
  }
  if (state.storageUnavailable) return
  writeChain = writeChain.then(async () => {
    const db = await openDb()
    if (!db) {
      setState({ saveFailed: true })
      return
    }
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction([DECKS, CARDS], 'readwrite')
        const decks = tx.objectStore(DECKS)
        const cards = tx.objectStore(CARDS)
        ops.putDecks?.forEach((deck) => decks.put(deck))
        ops.deleteDecks?.forEach((id) => decks.delete(id))
        ops.putCards?.forEach((card) => cards.put(card))
        ops.putProgress?.forEach((card) => cards.put(card))
        ops.deleteCards?.forEach((id) => cards.delete(id))
        tx.oncomplete = () => resolve()
        tx.onerror = () => {
          setState({ saveFailed: true })
          resolve()
        }
        tx.onabort = () => {
          setState({ saveFailed: true })
          resolve()
        }
      } catch {
        setState({ saveFailed: true })
        resolve()
      }
    })
  })
}

function touchDeck(deckId: string, now: number): Deck[] {
  return state.decks.map((deck) => (deck.id === deckId ? { ...deck, updatedAt: now } : deck))
}

export function createDeck(input: Pick<Deck, 'name'> & Partial<Pick<Deck, 'description' | 'source' | 'sourceRef' | 'language' | 'newPerDay'>>): Deck {
  const now = Date.now()
  const deck: Deck = {
    id: makeId(),
    name: input.name.slice(0, MAX_DECK_NAME_CHARS),
    description: (input.description ?? '').slice(0, MAX_DECK_DESCRIPTION_CHARS),
    source: input.source ?? 'manual',
    sourceRef: input.sourceRef ?? null,
    language: input.language ?? 'en',
    newPerDay: input.newPerDay ?? DEFAULT_NEW_PER_DAY,
    createdAt: now,
    updatedAt: now,
  }
  setState({ decks: [...state.decks, deck] })
  persist({ putDecks: [deck] })
  return deck
}

const isBlankDeck = (deck: Deck, cards: Card[]) => deck.name.trim() === '' && deck.description.trim() === '' && deck.source === 'manual' && !cards.some((card) => card.deckId === deck.id)

/** Removes a deck the student created with "New deck" and left untouched (no name, no description, no cards). A deck with cards is never removed. */
export function discardBlankDeck(deckId: string) {
  const deck = state.decks.find((entry) => entry.id === deckId)
  if (!deck || !isBlankDeck(deck, state.cards)) return
  setState({ decks: state.decks.filter((entry) => entry.id !== deckId) })
  persist({ deleteDecks: [deckId] })
}

export function updateDeck(deckId: string, patch: Partial<Pick<Deck, 'name' | 'description' | 'newPerDay'>>) {
  const current = state.decks.find((deck) => deck.id === deckId)
  if (!current) return
  const next: Deck = {
    ...current,
    ...patch,
    name: (patch.name ?? current.name).slice(0, MAX_DECK_NAME_CHARS),
    description: (patch.description ?? current.description).slice(0, MAX_DECK_DESCRIPTION_CHARS),
    updatedAt: Date.now(),
  }
  setState({ decks: state.decks.map((deck) => (deck.id === deckId ? next : deck)) })
  persist({ putDecks: [next] })
}

export function deleteDeck(deckId: string) {
  const deck = state.decks.find((entry) => entry.id === deckId)
  if (!deck) return
  const cards = state.cards.filter((card) => card.deckId === deckId)
  setState({
    decks: state.decks.filter((entry) => entry.id !== deckId),
    cards: state.cards.filter((card) => card.deckId !== deckId),
    deletedDeck: { deck, cards },
  })
  persist({ deleteDecks: [deckId], deleteCards: cards.map((card) => card.id) })
  // The undo window is global, so a toast never reappears long after the delete on a later visit.
  setTimeout(() => {
    if (state.deletedDeck?.deck.id === deckId) setState({ deletedDeck: null })
  }, UNDO_WINDOW_MS)
}

export function undoDeleteDeck() {
  const deleted = state.deletedDeck
  if (!deleted) return
  setState({ decks: [...state.decks, deleted.deck], cards: [...state.cards, ...deleted.cards], deletedDeck: null })
  persist({ putDecks: [deleted.deck], putCards: deleted.cards })
}

export function dismissDeletedDeck() {
  if (state.deletedDeck) setState({ deletedDeck: null })
}

export function addCards(deckId: string, entries: { front: string; back: string }[]): Card[] {
  if (entries.length === 0) return []
  const now = Date.now()
  // Strictly increasing createdAt keeps card order stable (and undo restoring a card to its place)
  // even when several cards are added within the same millisecond.
  const firstCreatedAt = state.cards.reduce((latest, card) => Math.max(latest, card.createdAt + 1), now)
  const cards: Card[] = entries.map((entry, index) => ({
    id: makeId(),
    deckId,
    front: entry.front.slice(0, MAX_FRONT_CHARS),
    back: entry.back.slice(0, MAX_BACK_CHARS),
    ...resetProgress(now),
    createdAt: firstCreatedAt + index,
    due: now,
  }))
  const decks = touchDeck(deckId, now)
  setState({ cards: [...state.cards, ...cards], decks })
  persist({ putCards: cards, putDecks: decks.filter((deck) => deck.id === deckId) })
  return cards
}

export function updateCard(cardId: string, patch: Partial<Pick<Card, 'front' | 'back'>> | SrsProgress) {
  const current = state.cards.find((card) => card.id === cardId)
  if (!current) return
  const next: Card = { ...current, ...patch }
  next.front = next.front.slice(0, MAX_FRONT_CHARS)
  next.back = next.back.slice(0, MAX_BACK_CHARS)
  setState({ cards: state.cards.map((card) => (card.id === cardId ? next : card)) })
  const textChanged = 'front' in patch || 'back' in patch
  persist(textChanged ? { putCards: [next] } : { putProgress: [next] })
}

export function deleteCard(cardId: string): Card | null {
  const card = state.cards.find((entry) => entry.id === cardId)
  if (!card) return null
  setState({ cards: state.cards.filter((entry) => entry.id !== cardId) })
  persist({ deleteCards: [cardId] })
  return card
}

export function restoreCard(card: Card) {
  if (!state.decks.some((deck) => deck.id === card.deckId) || state.cards.some((entry) => entry.id === card.id)) return
  setState({ cards: [...state.cards, card] })
  persist({ putCards: [card] })
}

export function resetDeckProgress(deckId: string) {
  const now = Date.now()
  const reset = state.cards.filter((card) => card.deckId === deckId).map((card) => ({ ...card, ...resetProgress(now) }))
  const byId = new Map(reset.map((card) => [card.id, card]))
  setState({ cards: state.cards.map((card) => byId.get(card.id) ?? card) })
  persist({ putProgress: reset })
}

export function cardsForDeck(cards: Card[], deckId: string): Card[] {
  return cards.filter((card) => card.deckId === deckId).sort((a, b) => a.createdAt - b.createdAt)
}

export function dueCountForDeck(deck: Deck, cards: Card[], now: number): number {
  return buildStudyQueue(cardsForDeck(cards, deck.id), now, deck.newPerDay).length
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Live flashcard state; triggers the one-time load from IndexedDB. */
export function useFlashcards(): FlashcardState {
  // Re-runs when another account signs in (the cache was reset) so the new account's decks load.
  const userId = useAuth().user?.id
  useEffect(() => {
    void loadFlashcards()
  }, [userId])
  return useSyncExternalStore(subscribe, () => state)
}

/** Decks and cards still stored in this browser (before the account existed), for the import. */
export async function readLegacyFlashcards(): Promise<{ decks: Deck[]; cards: Card[] }> {
  const db = await openDb()
  if (!db) return { decks: [], cards: [] }
  try {
    const [decks, cards] = await Promise.all([readAll<Partial<Deck>>(db, DECKS), readAll<Partial<Card>>(db, CARDS)])
    const validDecks = decks.map(deckWithDefaults).filter((deck): deck is Deck => deck !== null)
    const deckIds = new Set(validDecks.map((deck) => deck.id))
    return { decks: validDecks, cards: cards.map(cardWithDefaults).filter((card): card is Card => card !== null && deckIds.has(card.deckId)) }
  } catch {
    return { decks: [], cards: [] }
  }
}

/** Empties the browser-local flashcard database (after a verified import, when the student agrees). */
export async function clearLegacyFlashcards(): Promise<void> {
  const db = await openDb()
  if (!db) return
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction([DECKS, CARDS], 'readwrite')
      tx.objectStore(DECKS).clear()
      tx.objectStore(CARDS).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}
