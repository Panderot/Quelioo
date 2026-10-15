import type { Page } from '@playwright/test'

import { test, expect } from './strict'
import { MOCK_RESULT, pickPhoto, solveButton, solveResult } from './fullSolveHelpers'
import { loc, stored } from './fullCardsHelpers'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }

// The question notebook: one button on a solved problem puts it into the Kartlar notebook deck, where it
// comes back tomorrow with its photo and is graded with "I solved it" / "I couldn't solve it".

/** Tuesday 2026-03-10 14:00 local; `day(n)` is local midnight n days later. */
const NOW = new Date(2026, 2, 10, 14, 0, 0)
const at = (day: number, hour = 8) => new Date(2026, 2, 10 + day, hour, 0, 0)
const midnight = (days: number) => new Date(2026, 2, 10 + days).getTime()

const addButton = (page: Page) => page.getByRole('button', { name: en.solve.notebook.add })
const notebookState = (page: Page) => page.locator('[data-purpose="notebook-state"]')
const openLink = (page: Page) => notebookState(page).getByRole('link', { name: en.solve.notebook.open })
const tomorrowLine = (page: Page) => page.locator('[data-purpose="notebook-tomorrow"]')
const flashcard = (page: Page) => page.locator('[data-purpose="flashcard"]')
const photo = (page: Page) => page.locator('[data-purpose="study-solution-photo"]')

/** Solves the photo with the mocked /api/solve and waits for the saved record (the button needs its id). */
async function solve(page: Page) {
  await pickPhoto(page)
  await solveButton(page).click()
  await expect(solveResult(page)).toBeVisible()
  await expect(addButton(page)).toBeEnabled()
}

/** Ids of the saved solutions, newest first. */
async function solutionIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('quelio-solutions', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const all = await new Promise<{ id: string; createdAt: string }[]>((resolve) => {
      const request = db.transaction('solutions', 'readonly').objectStore('solutions').getAll()
      request.onsuccess = () => resolve(request.result as { id: string; createdAt: string }[])
    })
    db.close()
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((entry) => entry.id)
  })
}

/** Writes one solution into the app's store (same shape the app saves), with no photo. */
async function seedSolution(page: Page, id: string, question: string) {
  await page.evaluate(
    async ({ id: recordId, question: text }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('quelio-solutions', 1)
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore('solutions', { keyPath: 'id' })
          store.createIndex('createdAt', 'createdAt', { unique: false })
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('solutions', 'readwrite')
        tx.objectStore('solutions').put({
          id: recordId,
          schemaVersion: 1,
          createdAt: '2026-03-09T10:00:00.000Z',
          thumbnail: null,
          language: 'en',
          result: { topic: 'Linear equations', question: text, intro: '', steps: ['Subtract $2x$ from both sides.'], answer: '$x = 8$', tip: '', mistakes: [] },
          extras: {},
        })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    },
    { id, question },
  )
}

/** Removes a solution the way deleting it in the Archive does. */
async function removeSolution(page: Page, id: string) {
  await page.evaluate(async (recordId) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('quelio-solutions', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('solutions', 'readwrite')
      tx.objectStore('solutions').delete(recordId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, id)
}

async function notebookDeckId(page: Page): Promise<string> {
  const href = await openLink(page).getAttribute('href')
  const id = href?.split('/').pop()
  if (!id) throw new Error(`no notebook deck in the link ${href}`)
  return id
}

test.describe('Solve — question notebook', () => {
  test('one button adds the solved problem, links to Kartlar and promises it for tomorrow', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.clock.setFixedTime(NOW)
    await page.goto('/solve?lng=en')
    await solve(page)

    await addButton(page).click()
    await expect(notebookState(page)).toContainText(en.solve.notebook.added)
    await expect(addButton(page)).toHaveCount(0)
    await expect(tomorrowLine(page)).toHaveText(en.solve.notebook.tomorrow)

    const deckId = await notebookDeckId(page)
    const [solutionId] = await solutionIds(page)
    await expect.poll(async () => (await stored(page)).cards.filter((entry) => entry.deckId === deckId).length).toBe(1)
    const store = await stored(page)
    expect(store.decks.find((deck) => deck.id === deckId)?.name).toBe(en.flashcards.notebook.deckName)
    const [card] = store.cards.filter((entry) => entry.deckId === deckId)
    expect(card).toMatchObject({ front: MOCK_RESULT.question, back: `Answer: ${MOCK_RESULT.answer}`, box: 2, due: midnight(1), reviews: 0, solutionId })

    // The link opens the notebook deck in Kartlar.
    await openLink(page).click()
    await expect(page).toHaveURL(new RegExp(`/flashcards/${deckId}$`))
  })

  test('the same solution is never added twice, and the state survives a reload and the Archive page', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.clock.setFixedTime(NOW)
    await page.goto('/solve?lng=en')
    await solve(page)
    await addButton(page).click()
    const deckId = await notebookDeckId(page)
    const [solutionId] = await solutionIds(page)

    await page.reload()
    await expect(notebookState(page)).toContainText(en.solve.notebook.added)
    // The one-off line belongs to the moment of adding only.
    await expect(tomorrowLine(page)).toHaveCount(0)

    await page.goto(`/archive/solutions/${solutionId}?lng=en`)
    await expect(notebookState(page)).toContainText(en.solve.notebook.added)
    await expect(addButton(page)).toHaveCount(0)
    expect((await stored(page)).cards.filter((entry) => entry.deckId === deckId)).toHaveLength(1)
  })

  test('the new card is not due today but comes back tomorrow with its photo, the answer and the solution link', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.clock.setFixedTime(NOW)
    await page.goto('/solve?lng=en')
    await solve(page)
    await addButton(page).click()
    const deckId = await notebookDeckId(page)
    const [solutionId] = await solutionIds(page)

    // Today: nothing to study (the card waits for tomorrow).
    await page.goto(`/flashcards/${deckId}/study?lng=en`)
    await expect(page.locator('[data-purpose="all-done"]')).toBeVisible()
    await expect(page.locator('[data-purpose="next-due"]')).toHaveText(`Next review: ${en.flashcards.when.tomorrow}`)

    // Tomorrow: the front shows the photo of the problem next to its text.
    await page.clock.setFixedTime(at(1))
    await page.goto(`/flashcards/${deckId}/study?lng=en`)
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('1 / 1')
    await expect(flashcard(page)).toContainText('Solve for')
    await expect(photo(page)).toBeVisible()
    await expect(photo(page)).toHaveAttribute('alt', en.solve.upload.croppedAlt)

    await flashcard(page).click()
    await expect(flashcard(page).locator('[data-purpose="flashcard-back"]')).toContainText('Answer:')
    const link = page.locator('[data-purpose="open-solution"]')
    await expect(link).toHaveText(en.flashcards.notebook.openSolution)
    await expect(link).toHaveAttribute('href', `/archive/solutions/${solutionId}`)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noopener/)

    // The notebook deck grades with its own wording; the Leitner steps stay the same (box 2 -> 3, 3 days).
    await expect(page.getByRole('button', { name: en.flashcards.notebook.notSolved })).toBeVisible()
    await page.getByRole('button', { name: en.flashcards.notebook.solved }).click()
    await expect(page.locator('[data-purpose="study-summary"]')).toBeVisible()
    await expect
      .poll(async () => {
        const card = (await stored(page)).cards.find((entry) => entry.deckId === deckId)
        return { box: card?.box, due: card?.due }
      })
      .toEqual({ box: 3, due: midnight(4) })
  })

  test('a question longer than the card limit is cut at a word boundary', async ({ page }) => {
    await page.clock.setFixedTime(NOW)
    await page.goto('/archive?lng=en')
    const question = `Solve the following equation and explain every single step of your reasoning in full detail ${'because the teacher asks for it '.repeat(8)}today`
    expect(question.length).toBeGreaterThan(300)
    await seedSolution(page, 'long-q', question)

    await page.goto('/archive/solutions/long-q?lng=en')
    await addButton(page).click()
    await expect(notebookState(page)).toContainText(en.solve.notebook.added)

    const deckId = await notebookDeckId(page)
    await expect.poll(async () => (await stored(page)).cards.filter((entry) => entry.deckId === deckId).length).toBe(1)
    const [card] = (await stored(page)).cards.filter((entry) => entry.deckId === deckId)
    expect(card.front.length).toBeLessThanOrEqual(300)
    expect(card.front.endsWith('…')).toBe(true)
    expect(card.front.slice(0, -1).endsWith(' ')).toBe(false)
    expect(question.startsWith(card.front.slice(0, -1))).toBe(true)
  })

  test('a deleted solution leaves the card studyable as text, with no solution link', async ({ page }) => {
    await page.clock.setFixedTime(NOW)
    await page.goto('/archive?lng=en')
    await seedSolution(page, 'gone-q', 'Solve $3x + 7 = 2x + 15$')
    await page.goto('/archive/solutions/gone-q?lng=en')
    await addButton(page).click()
    const deckId = await notebookDeckId(page)
    await removeSolution(page, 'gone-q')

    await page.clock.setFixedTime(at(1))
    await page.goto(`/flashcards/${deckId}/study?lng=en`)
    await expect(flashcard(page)).toContainText('Solve')
    await expect(photo(page)).toHaveCount(0)
    await flashcard(page).click()
    await expect(flashcard(page).locator('[data-purpose="flashcard-back"]')).toContainText('Answer:')
    await expect(page.locator('[data-purpose="open-solution"]')).toHaveCount(0)
  })

  test('deleting the card in Kartlar brings the Solve button back', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.clock.setFixedTime(NOW)
    await page.goto('/solve?lng=en')
    await solve(page)
    await addButton(page).click()
    const deckId = await notebookDeckId(page)
    const [solutionId] = await solutionIds(page)

    await page.goto(`/flashcards/${deckId}?lng=en`)
    await page.getByRole('button', { name: loc('en', 'flashcards.editor.deleteCard', { number: 1 }) }).click()
    await expect(page.locator('[data-purpose="card-row"]')).toHaveCount(0)

    await page.goto(`/archive/solutions/${solutionId}?lng=en`)
    await expect(addButton(page)).toBeEnabled()
    await expect(notebookState(page)).toHaveCount(0)
  })
})
