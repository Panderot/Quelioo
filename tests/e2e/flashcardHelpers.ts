import type { Page } from '@playwright/test'

export interface SeedCard {
  id: string
  front: string
  back: string
  box?: number
  due?: number
  reviews?: number
  introducedAt?: number | null
}

export interface SeedDeck {
  id: string
  name: string
  newPerDay?: number
  cards: SeedCard[]
}

/** Writes decks/cards straight into IndexedDB (same schema as the app), then opens `path` (or reloads). */
export async function seed(page: Page, decks: SeedDeck[], path?: string) {
  await page.evaluate(async (input) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('quelio-flashcards', 1)
      request.onupgradeneeded = () => {
        const upgrade = request.result
        if (!upgrade.objectStoreNames.contains('decks')) upgrade.createObjectStore('decks', { keyPath: 'id' })
        if (!upgrade.objectStoreNames.contains('cards')) upgrade.createObjectStore('cards', { keyPath: 'id' }).createIndex('deckId', 'deckId')
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const now = Date.now()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['decks', 'cards'], 'readwrite')
      input.forEach((deck, deckIndex) => {
        tx.objectStore('decks').put({ id: deck.id, name: deck.name, description: '', source: 'manual', sourceRef: null, language: 'en', newPerDay: deck.newPerDay ?? 20, createdAt: now - deckIndex, updatedAt: now - deckIndex })
        deck.cards.forEach((card, index) =>
          tx.objectStore('cards').put({
            id: card.id,
            deckId: deck.id,
            front: card.front,
            back: card.back,
            box: card.box ?? 1,
            due: card.due ?? now - 1000,
            lapses: 0,
            reviews: card.reviews ?? 0,
            lastReviewedAt: null,
            introducedAt: card.introducedAt ?? null,
            createdAt: now - 100_000 + index,
          }),
        )
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, decks)
  if (path) await page.goto(path)
  else await page.reload()
}

export async function readStore(page: Page): Promise<{ decks: { id: string; name: string }[]; cards: SeedCard[] }> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('quelio-flashcards', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const all = (store: string) =>
      new Promise<unknown[]>((resolve) => {
        const request = db.transaction(store, 'readonly').objectStore(store).getAll()
        request.onsuccess = () => resolve(request.result)
      })
    const result = { decks: (await all('decks')) as { id: string; name: string }[], cards: (await all('cards')) as SeedCard[] }
    db.close()
    return result
  })
}
