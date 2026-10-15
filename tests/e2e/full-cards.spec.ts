import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

import { seed } from './flashcardHelpers'
import type { SeedDeck } from './flashcardHelpers'
import {
  LANGUAGES,
  cardRows,
  deckRows,
  expectCleanScreen,
  expectEndNotCovered,
  fastDoubleClick,
  flattenLocale,
  focusedName,
  loc,
  openAt,
  stored,
  storedPairs,
  card,
} from './fullCardsHelpers'
import { test, expect } from './strict'

// Kartlar (Flashcards) — decks, cards, "Cards with AI", CSV and the checks every section shares.
// The review session, Leitner dates, limits, speed and overflow are in full-cards-review.spec.ts.

const THREE: SeedDeck = {
  id: 'deck-1',
  name: 'Capitals',
  cards: [
    { id: 'c1', front: 'France', back: 'Paris' },
    { id: 'c2', front: 'Japan', back: 'Tokyo' },
    { id: 'c3', front: 'Türkiye', back: 'Ankara' },
  ],
}

const AI_CARDS = [
  { front: 'Where does photosynthesis happen?', back: 'In the chloroplasts' },
  { front: 'Which gas do plants release?', back: 'Oxygen' },
  { front: 'Which pigment absorbs light?', back: 'Chlorophyll' },
]

const panel = (page: Page) => page.locator('[data-purpose="card-generator"]')
const review = (page: Page) => page.locator('[data-purpose="generator-review"]')
const generateButton = (page: Page) => panel(page).getByRole('button', { name: 'Generate cards', exact: true })
const csvInput = (page: Page) => page.locator('[data-purpose="csv-input"]')
const preview = (page: Page) => page.locator('[data-purpose="csv-preview"]')

async function openEmptyDeck(page: Page, lng = 'en', id = 'empty') {
  await page.goto(`/flashcards?lng=${lng}`)
  await seed(page, [{ id, name: 'Empty', cards: [] }], `/flashcards/${id}?lng=${lng}`)
}

function csvFile(name: string, content: string | Buffer) {
  return { name, mimeType: 'text/csv', buffer: Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8') }
}

test.describe('Kartlar — decks', () => {
  for (const lng of LANGUAGES) {
    test(`a new user sees the empty state; the seven sample decks are added once in ${lng}`, async ({ page }) => {
      await openAt(page, `/flashcards?lng=${lng}`)
      const empty = page.locator('[data-purpose="flashcards-empty"]')
      await expect(empty).toBeVisible()
      await expect(deckRows(page)).toHaveCount(0)
      await expect(page.locator('[data-purpose="flashcards-due-badge"]')).toHaveCount(0)

      await empty.getByRole('button', { name: loc(lng, 'flashcards.samples.add'), exact: true }).click()
      await expect(deckRows(page)).toHaveCount(7)
      await expect(empty).toHaveCount(0)
      // Nothing is left to add: the button is gone.
      await expect(page.locator('[data-purpose="add-samples"]')).toHaveCount(0)

      const names = await deckRows(page).locator('a.truncate').allInnerTexts()
      expect(new Set(names).size, `seven different deck names in ${lng}: ${names.join(' | ')}`).toBe(7)
      for (const name of names) expect(name.trim()).not.toBe('')
      await expect(page.locator('[data-purpose="samples-notice"]')).not.toBeEmpty()
      await expectCleanScreen(page, `sample deck list (${lng})`)

      await page.reload()
      await expect(deckRows(page)).toHaveCount(7)
      const { decks, cards } = await stored(page)
      expect(decks).toHaveLength(7)
      for (const deck of decks) expect(cards.filter((entry) => entry.deckId === deck.id).length, deck.name).toBeGreaterThan(0)
    })
  }

  test('create a deck, rename it, reload, go back and forth, then delete it with a confirmation', async ({ page }) => {
    await openAt(page, '/flashcards?lng=en')
    await page.getByRole('button', { name: 'New deck' }).first().click()
    await expect(page).toHaveURL(/\/flashcards\/[0-9a-f-]{36}$/)
    const name = page.locator('[data-purpose="deck-name"]')
    await expect(name).toBeFocused()

    await name.fill('Biology')
    await name.blur()
    await expect.poll(async () => (await stored(page)).decks.map((deck) => deck.name)).toEqual(['Biology'])

    // Rename; the 80-character limit holds.
    await name.fill('Biology 101')
    await name.blur()
    await expect(page.getByRole('heading', { name: 'Biology 101', level: 1 })).toBeVisible()
    await expect(page).toHaveTitle('Biology 101 - Quelio')
    await expect.poll(async () => (await stored(page)).decks.map((deck) => deck.name)).toEqual(['Biology 101'])
    await name.fill('x'.repeat(100))
    await expect(name).toHaveValue('x'.repeat(80))
    await name.fill('Biology 101')
    await name.blur()

    await page.reload()
    await expect(name).toHaveValue('Biology 101')

    await page.getByRole('link', { name: /Back to decks/ }).click()
    await expect(page).toHaveURL(/\/flashcards$/)
    await expect(deckRows(page)).toHaveCount(1)
    await expect(deckRows(page).first()).toContainText('Biology 101')
    await page.goBack()
    await expect(page).toHaveURL(/\/flashcards\/[0-9a-f-]{36}$/)
    await expect(name).toHaveValue('Biology 101')

    // Cancel keeps the deck; the confirmation deletes it and offers an undo.
    await page.getByRole('button', { name: 'Delete deck' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete this deck?' })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    expect((await stored(page)).decks).toHaveLength(1)

    await page.getByRole('button', { name: 'Delete deck' }).click()
    await dialog.getByRole('button', { name: 'Delete deck' }).click()
    await expect(page).toHaveURL(/\/flashcards$/)
    await expect(page.locator('[data-purpose="flashcards-empty"]')).toBeVisible()
    await expect.poll(async () => (await stored(page)).decks).toHaveLength(0)
    await page.getByRole('status').filter({ hasText: 'Deck “Biology 101” deleted' }).getByRole('button', { name: 'Undo' }).click()
    await expect(deckRows(page)).toHaveCount(1)
    await page.reload()
    await expect(deckRows(page).first()).toContainText('Biology 101')
  })

  test('a fast double click on "New deck" and on the delete confirmation changes exactly one deck', async ({ page }) => {
    await openAt(page, '/flashcards?lng=en')
    await seed(page, [THREE])
    await fastDoubleClick(page.getByRole('button', { name: 'New deck' }).first())
    await expect(page).toHaveURL(/\/flashcards\/[0-9a-f-]{36}$/)
    await page.locator('[data-purpose="deck-name"]').fill('Second')
    await page.locator('[data-purpose="deck-name"]').blur()
    await expect.poll(async () => (await stored(page)).decks.map((deck) => deck.name).sort()).toEqual(['Capitals', 'Second'])

    await page.goto('/flashcards/deck-1?lng=en')
    await page.getByRole('button', { name: 'Delete deck' }).click()
    await fastDoubleClick(page.getByRole('dialog', { name: 'Delete this deck?' }).getByRole('button', { name: 'Delete deck' }))
    await expect(page).toHaveURL(/\/flashcards$/)
    await expect(page.getByRole('status').filter({ hasText: 'Deck “Capitals” deleted' })).toHaveCount(1)
    await expect.poll(async () => (await stored(page)).decks.map((deck) => deck.name)).toEqual(['Second'])
  })

  test('the deck list keeps its search in the URL through reload and back, orders decks by what is due, and matches the Create strip', async ({ page }) => {
    const tomorrow = new Date(2026, 2, 11).getTime()
    await openAt(page, '/flashcards?lng=en')
    await seed(page, [
      { id: 'alpha', name: 'Alpha', cards: [{ id: 'a1', front: 'a1', back: 'b' }, { id: 'a2', front: 'a2', back: 'b' }, { id: 'a3', front: 'a3', back: 'b' }] },
      { id: 'beta', name: 'Beta', newPerDay: 2, cards: Array.from({ length: 5 }, (_, i) => ({ id: `b${i}`, front: `b${i}`, back: 'b' })) },
      { id: 'gamma', name: 'Gamma', cards: [{ id: 'g1', front: 'g1', back: 'b', box: 2, reviews: 1, due: tomorrow }, { id: 'g2', front: 'g2', back: 'b', box: 3, reviews: 2, due: tomorrow }] },
      { id: 'delta', name: 'Delta', cards: [] },
    ])
    await expect(deckRows(page)).toHaveCount(4)
    expect(await deckRows(page).locator('a.truncate').allInnerTexts()).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta'])
    await expect(deckRows(page).nth(0)).toContainText('3 cards · 0 learned · 3 cards to review today')
    await expect(deckRows(page).nth(1)).toContainText('5 cards · 0 learned · 2 cards to review today')
    await expect(deckRows(page).nth(2)).toContainText('2 cards · 2 learned')
    await expect(deckRows(page).nth(2)).not.toContainText('to review')
    await expect(deckRows(page).nth(3).locator('[aria-disabled="true"]')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Study Alpha, 3 due' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edit Gamma' })).toBeVisible()

    // The number on Create's "Continue where you left off" strip is the sum of the due counts here, and so is the nav badge.
    const texts = await deckRows(page).allInnerTexts()
    const due = texts.reduce((sum, text) => sum + Number(/(\d+) cards? to review today/.exec(text)?.[1] ?? 0), 0)
    expect(due).toBe(5)
    await expect(page.locator('[data-purpose="flashcards-due-badge"] [aria-hidden]')).toHaveText(String(due))
    await page.goto('/?lng=en')
    await expect(page.locator('[data-purpose="resume-strip"] [data-purpose="resume-due"]')).toHaveText(`${due} cards to review today`)

    // Search lives in the URL.
    await page.goto('/flashcards?lng=en')
    await page.getByRole('searchbox', { name: 'Search decks' }).fill('bet')
    await expect(page).toHaveURL(/q=bet/)
    await expect(deckRows(page)).toHaveCount(1)
    await page.reload()
    await expect(page.getByRole('searchbox', { name: 'Search decks' })).toHaveValue('bet')
    await expect(deckRows(page)).toHaveCount(1)
    await page.getByRole('link', { name: 'Study Beta, 2 due' }).click()
    await expect(page).toHaveURL(/\/flashcards\/beta\/study$/)
    await page.goBack()
    await expect(page.getByRole('searchbox', { name: 'Search decks' })).toHaveValue('bet')
    await expect(deckRows(page)).toHaveCount(1)
  })

  test('an unknown deck or study address says so, with a way back', async ({ page }) => {
    await openAt(page, '/flashcards/nope?lng=en')
    await expect(page.getByText(loc('en', 'flashcards.deck.notFound'))).toBeVisible()
    await page.getByRole('link', { name: loc('en', 'flashcards.backToDecks') }).click()
    await expect(page).toHaveURL(/\/flashcards$/)
    await page.goto('/flashcards/nope/study?lng=en')
    await expect(page.getByText(loc('en', 'flashcards.deck.notFound'))).toBeVisible()
  })

  test('an empty deck: no cards yet, Study / Export / Reset are off', async ({ page }) => {
    await openAt(page, '/flashcards?lng=en')
    await openEmptyDeck(page)
    await expect(page.getByText(loc('en', 'flashcards.editor.noCards'))).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Reset progress' })).toBeDisabled()
    await expect(page.locator('[aria-disabled="true"]').filter({ hasText: 'Study' })).toBeVisible()
    await page.goto('/flashcards/empty/study?lng=en')
    await expect(page.locator('[data-purpose="all-done"]')).toContainText(loc('en', 'flashcards.study.emptyDeck'))
  })

  test('loading: the list shows a placeholder and a disabled "New deck" until the cards are read', async ({ page }) => {
    // Holds the IndexedDB open of the cards store until the test releases it.
    await page.addInitScript(() => {
      const original = IDBFactory.prototype.open
      IDBFactory.prototype.open = function (this: IDBFactory, name: string, version?: number) {
        if (name !== 'quelio-flashcards') return original.call(this, name, version)
        const held: Record<string, unknown> = { result: null, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null }
        ;(window as unknown as Record<string, () => void>).__releaseFlashcards = () => {
          const real = original.call(indexedDB, name, version)
          real.onupgradeneeded = () => {
            held.result = real.result
            ;(held.onupgradeneeded as (() => void) | null)?.()
          }
          real.onsuccess = () => {
            held.result = real.result
            ;(held.onsuccess as (() => void) | null)?.()
          }
          real.onerror = () => {
            held.error = real.error
            ;(held.onerror as (() => void) | null)?.()
          }
        }
        return held as unknown as IDBOpenDBRequest
      }
    })
    await page.goto('/flashcards?lng=en')
    await expect(page.locator('[data-purpose="skeleton-list"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'New deck' }).first()).toBeDisabled()
    await expect(page.locator('[data-purpose="flashcards-empty"]')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => typeof (window as unknown as Record<string, unknown>).__releaseFlashcards)).toBe('function')
    await page.evaluate(() => (window as unknown as Record<string, () => void>).__releaseFlashcards())
    await expect(page.locator('[data-purpose="skeleton-list"]')).toHaveCount(0)
    await expect(page.locator('[data-purpose="flashcards-empty"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'New deck' }).first()).toBeEnabled()
  })
})

test.describe('Kartlar — cards', () => {
  test('add, edit, delete with undo and bulk add: every change lands in the store exactly once', async ({ page }) => {
    await openAt(page, '/flashcards?lng=en')
    await openEmptyDeck(page)

    await page.getByRole('button', { name: 'Add card', exact: true }).click()
    const front = page.getByLabel('Front of card 1')
    await expect(front).toBeFocused()
    // A card with an empty side says it will be skipped.
    await expect(page.getByText(loc('en', 'flashcards.editor.incomplete'))).toBeVisible()
    await expect(cardRows(page).first()).toContainText('New')
    await front.fill('Cell')
    await page.getByLabel('Back of card 1').fill('Unit of life')
    await page.getByLabel('Back of card 1').blur()
    await expect.poll(() => storedPairs(page, 'empty')).toEqual([{ front: 'Cell', back: 'Unit of life' }])
    const [firstId] = (await stored(page)).cards.map((entry) => entry.id)

    // Edit keeps the same record.
    await front.fill('Cell membrane')
    await front.blur()
    await expect.poll(() => storedPairs(page, 'empty')).toEqual([{ front: 'Cell membrane', back: 'Unit of life' }])
    expect((await stored(page)).cards.map((entry) => entry.id)).toEqual([firstId])

    // Bulk add.
    await page.getByRole('button', { name: 'Paste many cards' }).click()
    await page.locator('[data-purpose="bulk-input"]').fill('Nucleus ; Stores DNA\nRibosome ; Makes protein')
    await page.getByRole('button', { name: 'Add 2 cards', exact: true }).click()
    await expect(page.getByText('Added 2 cards.')).toBeVisible()
    await expect(cardRows(page)).toHaveCount(3)
    await expect.poll(async () => (await stored(page)).cards.length).toBe(3)

    // Delete one, undo it.
    await page.getByRole('button', { name: 'Delete card 2' }).click()
    await expect(cardRows(page)).toHaveCount(2)
    await expect.poll(async () => (await stored(page)).cards.length).toBe(2)
    await page.getByRole('status').filter({ hasText: 'Card deleted' }).getByRole('button', { name: 'Undo' }).click()
    await expect(cardRows(page)).toHaveCount(3)
    await expect.poll(async () => (await stored(page)).cards.length).toBe(3)

    await page.reload()
    await expect(cardRows(page)).toHaveCount(3)
    expect((await storedPairs(page, 'empty')).map((pair) => pair.front).sort()).toEqual(['Cell membrane', 'Nucleus', 'Ribosome'])
  })

  test('a fast double click on the bulk, CSV and AI "Add" buttons saves each card once', async ({ page }) => {
    await openAt(page, '/flashcards?lng=en')
    await seed(page, [{ id: 'words', name: 'Words', cards: [{ id: 'w1', front: 'apple', back: 'elma' }] }], '/flashcards/words?lng=en')
    const count = async () => (await stored(page)).cards.length

    await page.getByRole('button', { name: 'Paste many cards' }).click()
    await page.locator('[data-purpose="bulk-input"]').fill('book ; kitap\npen ; kalem')
    await fastDoubleClick(page.getByRole('button', { name: 'Add 2 cards', exact: true }))
    await expect(cardRows(page)).toHaveCount(3)
    await expect.poll(count).toBe(3)

    await csvInput(page).setInputFiles(csvFile('two.csv', 'front,back\r\ntable,masa\r\nchair,sandalye\r\n'))
    await fastDoubleClick(preview(page).getByRole('button', { name: 'Add 2 cards', exact: true }))
    await expect(cardRows(page)).toHaveCount(5)
    await expect.poll(count).toBe(5)

    await page.route('**/api/cards', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ cards: AI_CARDS, removed: 0, provider: 'openai', fallbackUsed: false }) }))
    await page.getByRole('button', { name: 'Generate cards automatically' }).click()
    await panel(page).getByRole('tab', { name: 'Topic' }).click()
    await panel(page).locator('[data-purpose="generator-topic"]').fill('Photosynthesis')
    await generateButton(page).click()
    await expect(review(page).locator('[data-purpose="review-card"]')).toHaveCount(3)
    await fastDoubleClick(review(page).getByRole('button', { name: 'Add 3 cards' }))
    await expect(cardRows(page)).toHaveCount(8)
    await expect.poll(count).toBe(8)
    expect(new Set((await stored(page)).cards.map((entry) => entry.id)).size).toBe(8)
  })

  test('Cards with AI (mocked): one request per click, review before saving, a dropped connection is retryable', async ({ page }) => {
    const requests: unknown[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let mode: 'ok' | 'abort' = 'ok'
    await page.route('**/api/cards', async (route) => {
      requests.push(route.request().postDataJSON())
      if (mode === 'abort') {
        await route.abort('internetdisconnected')
        return
      }
      await gate
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ cards: AI_CARDS, removed: 0, provider: 'openai', fallbackUsed: false }) })
    })
    await openAt(page, '/flashcards?lng=en')
    await seed(page, [{ id: 'geo', name: 'Geo', cards: [{ id: 'g1', front: 'Capital of Türkiye', back: 'Ankara' }] }], '/flashcards/geo?lng=en')

    await page.getByRole('button', { name: 'Generate cards automatically' }).click()
    await panel(page).getByRole('tab', { name: 'Topic' }).click()
    await panel(page).locator('[data-purpose="generator-topic"]').fill('Photosynthesis')
    // A real double click: the second click lands on a button that is already disabled.
    await generateButton(page).dblclick()
    await expect(panel(page).getByRole('button', { name: 'Generating cards…' })).toBeDisabled()
    release()
    await expect(review(page).locator('[data-purpose="review-card"]')).toHaveCount(3)
    expect(requests).toHaveLength(1)
    // Nothing is saved before "Add".
    expect(await storedPairs(page, 'geo')).toHaveLength(1)
    await review(page).getByRole('button', { name: 'Add 3 cards' }).click()
    await expect(cardRows(page)).toHaveCount(4)
    await expect.poll(async () => (await stored(page)).cards.length).toBe(4)

    // The connection drops: a clear message, nothing added, and "Try again" works.
    mode = 'abort'
    await page.getByRole('button', { name: 'Generate cards automatically' }).click()
    await panel(page).getByRole('tab', { name: 'Topic' }).click()
    await panel(page).locator('[data-purpose="generator-topic"]').fill('Cell biology')
    await generateButton(page).click()
    const alert = panel(page).getByRole('alert')
    await expect(alert).toContainText(loc('en', 'flashcards.generate.errors.network'))
    expect((await stored(page)).cards).toHaveLength(4)
    mode = 'ok'
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(review(page).locator('[data-purpose="review-card"]')).toHaveCount(3)
    expect(requests).toHaveLength(3)
  })
})

test.describe('Kartlar — CSV', () => {
  test('comma file, Turkish-Excel semicolon file with a BOM, Turkish letters and blank lines are all read', async ({ page }) => {
    await openAt(page, '/flashcards?lng=en')
    await openEmptyDeck(page)

    await csvInput(page).setInputFiles(csvFile('comma.csv', 'front,back\r\nİstanbul,"Boğaziçi, köprü"\r\n\r\n\r\nÇanakkale,Gelibolu\r\n\r\n'))
    await expect(preview(page)).toContainText('2 cards will be added')
    await expect(preview(page).locator('li')).toHaveCount(2)
    await expect.poll(async () => (await stored(page)).cards.length).toBe(0)
    await preview(page).getByRole('button', { name: 'Add 2 cards' }).click()
    await expect(page.getByText('Imported 2 cards.')).toBeVisible()

    const bom = Buffer.from([0xef, 0xbb, 0xbf])
    await csvInput(page).setInputFiles(csvFile('excel.csv', Buffer.concat([bom, Buffer.from('ÖN;ARKA\r\nŞapka Kanunu;25 Kasım 1925\r\n\r\nığüşöç;İĞÜŞÖÇ\r\n', 'utf-8')])))
    await expect(preview(page)).toContainText('2 cards will be added')
    await expect(preview(page)).not.toContainText(/Ã|Ä|Å|�|﻿/)
    await preview(page).getByRole('button', { name: 'Add 2 cards' }).click()

    await expect(cardRows(page)).toHaveCount(4)
    await expect.poll(() => storedPairs(page, 'empty')).toEqual([
      { front: 'İstanbul', back: 'Boğaziçi, köprü' },
      { front: 'Çanakkale', back: 'Gelibolu' },
      { front: 'Şapka Kanunu', back: '25 Kasım 1925' },
      { front: 'ığüşöç', back: 'İĞÜŞÖÇ' },
    ])
  })

  test('bad rows are skipped with a message, in English and Turkish; a file over 2 MB is refused', async ({ page }) => {
    await openAt(page, '/flashcards?lng=en')
    await openEmptyDeck(page)
    const rows = `front,back\r\nok1,a\r\n,missing front\r\nok2,b\r\n${'x'.repeat(301)},too long\r\n`

    await csvInput(page).setInputFiles(csvFile('bad.csv', rows))
    await expect(preview(page)).toContainText('2 cards will be added')
    await expect(preview(page)).toContainText(loc('en', 'flashcards.csv.skipped_other', { count: 2 }))
    await preview(page).getByRole('button', { name: 'Add 2 cards' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Imported 2 cards.' })).toContainText(loc('en', 'flashcards.csv.skipped_other', { count: 2 }))
    await expect.poll(() => storedPairs(page, 'empty')).toEqual([
      { front: 'ok1', back: 'a' },
      { front: 'ok2', back: 'b' },
    ])

    await csvInput(page).setInputFiles(csvFile('huge.csv', Buffer.alloc(2 * 1024 * 1024 + 16, 'a,b\n')))
    await expect(page.getByText(loc('en', 'flashcards.csv.tooLarge'))).toBeVisible()
    await expect(preview(page)).toHaveCount(0)

    await openEmptyDeck(page, 'tr', 'empty-tr')
    await expect(cardRows(page)).toHaveCount(0)
    await csvInput(page).setInputFiles(csvFile('bad.csv', rows))
    await expect(preview(page)).toContainText(loc('tr', 'flashcards.csv.previewTitle_other', { count: 2 }))
    await expect(preview(page)).toContainText(loc('tr', 'flashcards.csv.skipped_other', { count: 2 }))
  })

  test('@cross a sample deck exported to CSV and imported into a new deck gives the same cards', async ({ page }, testInfo) => {
    await openAt(page, '/flashcards?lng=tr')
    await page.locator('[data-purpose="flashcards-empty"]').getByRole('button', { name: loc('tr', 'flashcards.samples.add'), exact: true }).click()
    await expect(deckRows(page)).toHaveCount(7)
    await deckRows(page).filter({ hasText: 'Türk tarihi: inkılaplar' }).locator('a.truncate').click()
    await expect(page).toHaveURL(/\/flashcards\/[0-9a-f-]{36}$/)

    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: loc('tr', 'flashcards.csv.export'), exact: true }).click()])
    expect(download.suggestedFilename()).toBe('Türk tarihi inkılaplar.csv')
    const file = testInfo.outputPath('deck.csv')
    await download.saveAs(file)
    const bytes = readFileSync(file)
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])

    const state = await stored(page)
    const source = state.decks.find((deck) => deck.name === 'Türk tarihi: inkılaplar')!
    const original = state.cards
      .filter((entry) => entry.deckId === source.id)
      .map(({ front, back }) => ({ front, back }))
      .sort((a, b) => a.front.localeCompare(b.front))
    expect(original.length).toBeGreaterThan(0)

    await page.goto('/flashcards?lng=tr')
    await page.getByRole('button', { name: loc('tr', 'flashcards.newDeck') }).first().click()
    await expect(page).toHaveURL(/\/flashcards\/[0-9a-f-]{36}$/)
    await csvInput(page).setInputFiles(file)
    await preview(page).getByRole('button', { name: loc('tr', 'flashcards.bulk.add_other', { count: original.length }) }).click()
    await expect(cardRows(page)).toHaveCount(original.length)
    const after = await stored(page)
    const copy = after.decks.find((deck) => deck.id !== source.id && deck.name === '')!
    expect(
      after.cards
        .filter((entry) => entry.deckId === copy.id)
        .map(({ front, back }) => ({ front, back }))
        .sort((a, b) => a.front.localeCompare(b.front)),
    ).toEqual(original)
  })
})

test.describe('Kartlar — shared checks', () => {
  test('TR, EN and HYW have the same flashcards keys with the same variables, and none is empty', async () => {
    const maps = Object.fromEntries(LANGUAGES.map((lng) => [lng, flattenLocale(lng)]))
    const relevant = (key: string) => key.startsWith('flashcards.') || key.startsWith('create.resume.')
    const keys = (lng: (typeof LANGUAGES)[number]) => Object.keys(maps[lng]).filter(relevant).sort()
    expect(keys('tr')).toEqual(keys('en'))
    expect(keys('hyw')).toEqual(keys('en'))
    // A singular form ("_one") may legitimately say "a card" instead of "{{count}} card".
    const variables = (key: string, text: string) =>
      (text.match(/\{\{\w+\}\}/g) ?? [])
        .filter((name) => !(key.endsWith('_one') && name === '{{count}}'))
        .sort()
        .join(',')
    for (const key of keys('en')) {
      for (const lng of LANGUAGES) {
        expect(maps[lng][key].trim(), `${lng}:${key} is empty`).not.toBe('')
        expect(variables(key, maps[lng][key]), `${lng}:${key} variables`).toBe(variables(key, maps.en[key]))
      }
    }
  })

  for (const lng of LANGUAGES) {
    test(`every Cards screen in ${lng}: real labels, no translation keys, no cost wording`, async ({ page }) => {
      await openAt(page, `/flashcards?lng=${lng}`)
      await expectCleanScreen(page, 'empty list')
      await seed(page, [THREE])
      await expect(deckRows(page)).toHaveCount(1)
      await expectCleanScreen(page, 'list')

      await page.goto(`/flashcards/deck-1?lng=${lng}`)
      await expect(cardRows(page)).toHaveCount(3)
      await expectCleanScreen(page, 'deck')
      await page.getByRole('button', { name: loc(lng, 'flashcards.generate.title'), exact: true }).click()
      await expect(panel(page)).toBeVisible()
      await expectCleanScreen(page, 'generator')
      await page.getByRole('button', { name: loc(lng, 'flashcards.bulk.open'), exact: true }).click()
      await page.locator('[data-purpose="bulk-input"]').fill('a ; b\nno separator')
      await expect(page.locator('[data-purpose="bulk-line"]')).toHaveCount(2)
      await expectCleanScreen(page, 'bulk paste')
      await csvInput(page).setInputFiles(csvFile('x.csv', 'front,back\r\nx,y\r\n'))
      await expect(preview(page)).toBeVisible()
      await expectCleanScreen(page, 'csv preview')
      await page.getByRole('button', { name: loc(lng, 'flashcards.deck.delete'), exact: true }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectCleanScreen(page, 'delete dialog')

      await page.goto(`/flashcards/deck-1/study?lng=${lng}`)
      await expect(card(page)).toBeVisible()
      await expectCleanScreen(page, 'study front')
      await card(page).click()
      await expect(card(page)).toHaveAttribute('aria-pressed', 'true')
      await expectCleanScreen(page, 'study back')
      const buttons = page.locator('section[data-purpose="study-session"] .grid button')
      for (let i = 0; i < 3; i++) {
        if (i > 0) await card(page).click()
        await buttons.nth(1).click()
      }
      await expect(page.locator('[data-purpose="study-summary"]')).toBeVisible()
      await expectCleanScreen(page, 'summary')
      await page.goto(`/flashcards/deck-1/study?lng=${lng}`)
      await expect(page.locator('[data-purpose="all-done"]')).toBeVisible()
      await expectCleanScreen(page, 'all done')
    })
  }

  test('keyboard: Tab reaches every control of a deck in order, the fields have names, Enter adds a card', async ({ page }) => {
    await openAt(page, '/flashcards?lng=en')
    await seed(page, [{ id: 'kb', name: 'Keys', cards: [{ id: 'k1', front: 'one', back: 'uno' }] }], '/flashcards/kb?lng=en')
    await expect(cardRows(page)).toHaveCount(1)
    const targets = [
      'Back to decks',
      'Study',
      'Deck name',
      'Description',
      'New cards per day',
      'Generate cards automatically',
      'Paste many cards',
      'Export CSV',
      'Import CSV',
      'Reset progress',
      'Delete deck',
      'Add card',
      'Delete card 1',
      'Front of card 1',
      'Back of card 1',
    ]
    const seen: string[] = []
    for (let i = 0; i < 80 && !seen.some((name) => name === 'Back of card 1'); i++) {
      await page.keyboard.press('Tab')
      seen.push(await focusedName(page))
    }
    let from = 0
    for (const target of targets) {
      const index = seen.findIndex((name, position) => position >= from && name.includes(target))
      expect(index, `Tab never reaches "${target}" in order. Reached: ${seen.join(' | ')}`).toBeGreaterThanOrEqual(0)
      from = index
    }
    await expectCleanScreen(page, 'keyboard deck')

    await page.getByRole('button', { name: 'Add card', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(cardRows(page)).toHaveCount(2)
    await expect(page.getByLabel('Front of card 2')).toBeFocused()
  })

  test('reload and the back button keep the state of a deck and of a study session', async ({ page }) => {
    await openAt(page, '/flashcards?lng=en')
    await seed(page, [THREE], '/flashcards?lng=en')
    await page.getByRole('link', { name: 'Study Capitals, 3 due' }).click()
    await expect(page).toHaveURL(/\/flashcards\/deck-1\/study$/)
    await card(page).click()
    await page.getByRole('button', { name: 'Know', exact: true }).click()
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('2 / 3')
    await page.reload()
    // The graded card was saved; the session restarts with what is still due.
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('1 / 2')
    await page.goBack()
    await expect(page).toHaveURL(/\/flashcards(\?.*)?$/)
    await expect(deckRows(page).first()).toContainText('3 cards · 1 learned · 2 cards to review today')
    await page.goForward()
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('1 / 2')
  })

  test('@mobile at 390px the tab bar never covers the last control of the list, the deck and the study screens', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openAt(page, '/flashcards?lng=en')
    const decks: SeedDeck[] = Array.from({ length: 12 }, (_, i) => ({
      id: `d${i}`,
      name: `Deck ${i}`,
      cards: [{ id: `d${i}a`, front: `q${i}a`, back: 'a' }, { id: `d${i}b`, front: `q${i}b`, back: 'b' }],
    }))
    decks.push({ id: 'many', name: 'Many', cards: Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, front: `front ${i}`, back: `back ${i}` })) })
    await seed(page, decks)
    await expect(deckRows(page)).toHaveCount(13)
    await expect(page.locator('[data-purpose="tab-bar"]')).toBeVisible()
    await expectEndNotCovered(page)

    await page.goto('/flashcards/many?lng=en')
    await expect(cardRows(page)).toHaveCount(8)
    await expectEndNotCovered(page)
    await page.getByRole('button', { name: 'Paste many cards' }).click()
    await page.locator('[data-purpose="bulk-input"]').fill('a ; b\nc ; d')
    await expectEndNotCovered(page)

    await page.goto('/flashcards/empty-none?lng=en')
    await expectEndNotCovered(page)

    await page.goto('/flashcards/many/study?lng=en')
    await card(page).click()
    await expect(page.getByRole('button', { name: 'Know', exact: true })).toBeVisible()
    await expectEndNotCovered(page)
    for (let i = 0; i < 8; i++) {
      if (i > 0) await card(page).click()
      await page.getByRole('button', { name: 'Know', exact: true }).click()
    }
    await expect(page.locator('[data-purpose="study-summary"]')).toBeVisible()
    await expectEndNotCovered(page)
    await page.goto('/flashcards/many/study?lng=en')
    await expect(page.locator('[data-purpose="all-done"]')).toBeVisible()
    await expectEndNotCovered(page)
  })

  test('@mobile at 390px the deck list, a deck and a study card fit without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openAt(page, '/flashcards?lng=hyw')
    await seed(page, [{ ...THREE, name: 'Աշխարհագրութիւն եւ մայրաքաղաքներ — շատ երկար տրցակի անուն' }])
    for (const path of ['/flashcards?lng=hyw', '/flashcards/deck-1?lng=hyw', '/flashcards/deck-1/study?lng=hyw']) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), path).toBe(false)
    }
  })
})
