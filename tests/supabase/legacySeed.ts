import type { Page } from '@playwright/test'

import { SAMPLE_QUIZ } from '../fixtures/quiz'

/** Writes data in the OLD browser-local formats (what Quelio stored before accounts): the Archive in
 * localStorage, decks and solutions in IndexedDB. Run on a page of the app origin. */

export interface LegacyCounts {
  quizzes: number
  decks: number
  cards: number
  solutions: number
}

export const LEGACY_COUNTS: LegacyCounts = { quizzes: 2, decks: 2, cards: 5, solutions: 1 }

export async function seedLegacyData(page: Page): Promise<void> {
  await page.evaluate(
    async ({ quiz }) => {
      const now = Date.now()
      // Archive (localStorage, "quelio.archive.v1").
      const entry = (id: string, title: string, createdAt: string) => ({
        id,
        title,
        createdAt,
        source: 'text',
        questionType: 'mixed',
        difficulty: 'medium',
        questionCount: '6',
        optionsCount: null,
        outputLanguage: 'auto',
        sourceText: `Source text of ${title}.`,
        quiz: { title, questions: quiz.questions },
      })
      localStorage.setItem('quelio.archive.v1', JSON.stringify([entry('legacy-quiz-1', 'Legacy photosynthesis', '2026-01-01T10:00:00.000Z'), entry('not-a-uuid-2', 'Legacy planets', '2026-01-02T10:00:00.000Z')]))

      const open = (name: string, version: number, upgrade: (db: IDBDatabase) => void) =>
        new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(name, version)
          request.onupgradeneeded = () => upgrade(request.result)
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
      const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => ((tx.oncomplete = () => resolve()), (tx.onerror = () => reject(tx.error))))

      // Flashcards.
      const cards = await open('quelio-flashcards', 1, (db) => {
        if (!db.objectStoreNames.contains('decks')) db.createObjectStore('decks', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('cards')) db.createObjectStore('cards', { keyPath: 'id' }).createIndex('deckId', 'deckId')
      })
      const tx = cards.transaction(['decks', 'cards'], 'readwrite')
      const deck = (id: string, name: string, offset: number) => ({ id, name, description: 'Old deck', source: 'manual', sourceRef: null, language: 'en', newPerDay: 15, createdAt: now - offset, updatedAt: now - offset })
      tx.objectStore('decks').put(deck('legacy-deck-1', 'Legacy capitals', 5000))
      tx.objectStore('decks').put(deck('legacy-deck-2', 'Legacy verbs', 4000))
      const card = (id: string, deckId: string, front: string, back: string, box: number, index: number) => ({
        id,
        deckId,
        front,
        back,
        box,
        due: now + box * 86_400_000,
        lapses: box > 2 ? 1 : 0,
        reviews: box * 2,
        lastReviewedAt: now - 1000,
        introducedAt: now - 2000,
        createdAt: now - 100_000 + index,
      })
      tx.objectStore('cards').put(card('legacy-card-1', 'legacy-deck-1', 'France', 'Paris', 3, 1))
      tx.objectStore('cards').put(card('legacy-card-2', 'legacy-deck-1', 'Japan', 'Tokyo', 2, 2))
      tx.objectStore('cards').put(card('legacy-card-3', 'legacy-deck-1', 'Türkiye', 'Ankara', 5, 3))
      tx.objectStore('cards').put(card('legacy-card-4', 'legacy-deck-2', 'go', 'went', 1, 4))
      tx.objectStore('cards').put(card('legacy-card-5', 'legacy-deck-2', 'see', 'saw', 4, 5))
      await done(tx)
      cards.close()

      // Solutions (thumbnail as raw bytes).
      const solutions = await open('quelio-solutions', 1, (db) => {
        if (!db.objectStoreNames.contains('solutions')) db.createObjectStore('solutions', { keyPath: 'id' }).createIndex('createdAt', 'createdAt', { unique: false })
      })
      const solutionTx = solutions.transaction('solutions', 'readwrite')
      solutionTx.objectStore('solutions').put({
        id: 'legacy-solution-1',
        schemaVersion: 1,
        createdAt: '2026-01-04T10:00:00.000Z',
        thumbnail: { type: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer },
        language: 'auto',
        result: { topic: 'Linear equations', question: 'Solve 3x+7=2x+15', intro: 'Move x terms', steps: ['x = 8'], answer: 'x = 8', tip: 'Check by substituting', mistakes: [] },
        extras: { note: 'kept' },
      })
      await done(solutionTx)
      solutions.close()
    },
    { quiz: SAMPLE_QUIZ },
  )
}

/** What the old browser-local stores still hold. */
export async function readLegacyCounts(page: Page): Promise<LegacyCounts> {
  return page.evaluate(async () => {
    const countStore = async (name: string, version: number, store: string): Promise<number> => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, version)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      if (!db.objectStoreNames.contains(store)) return 0
      const count = await new Promise<number>((resolve) => {
        const request = db.transaction(store, 'readonly').objectStore(store).count()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(0)
      })
      db.close()
      return count
    }
    const archive = JSON.parse(localStorage.getItem('quelio.archive.v1') ?? '[]') as unknown[]
    return {
      quizzes: archive.length,
      decks: await countStore('quelio-flashcards', 1, 'decks'),
      cards: await countStore('quelio-flashcards', 1, 'cards'),
      solutions: await countStore('quelio-solutions', 1, 'solutions'),
    }
  })
}
