import { readFileSync } from 'node:fs'
import type { Locator, Page } from '@playwright/test'

import { test, expect } from './fixtures'
import { readStore, seed } from './flashcardHelpers'
import type { SeedDeck } from './flashcardHelpers'

// Fixed local time: Tuesday 2026-03-10 14:00. Timers keep running (debounced autosave works).
const NOW = new Date(2026, 2, 10, 14, 0, 0)
const DAY = 86_400_000

const THREE_NEW: SeedDeck = {
  id: 'deck-1',
  name: 'Capitals',
  cards: [
    { id: 'c1', front: 'France', back: 'Paris' },
    { id: 'c2', front: 'Japan', back: 'Tokyo' },
    { id: 'c3', front: 'Türkiye', back: 'Ankara' },
  ],
}

async function open(page: Page, path: string) {
  await page.clock.setFixedTime(NOW)
  await page.goto(path)
}

const card = (page: Page) => page.locator('[data-purpose="flashcard"]')
const front = (page: Page) => page.locator('[data-purpose="flashcard-front"]')

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
}

async function swipe(target: Locator, dx: number) {
  const box = await target.boundingBox()
  if (!box) throw new Error('card not visible')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const base = { pointerType: 'touch', pointerId: 7, isPrimary: true, bubbles: true }
  await target.dispatchEvent('pointerdown', { ...base, clientX: x, clientY: y })
  await target.dispatchEvent('pointermove', { ...base, clientX: x + dx / 2, clientY: y + 4 })
  await target.dispatchEvent('pointerup', { ...base, clientX: x + dx, clientY: y + 6 })
}

test.describe('Flashcards — decks', () => {
  test('sidebar item with a live due-today badge and localized tab title', async ({ page }) => {
    await open(page, '/flashcards?lng=en')
    // Its position (after Songs, or after Archive without Songs) is covered in songs-page.spec.ts.
    const sidebar = page.locator('[data-purpose="sidebar-navigation"]')
    await expect(sidebar.getByRole('link', { name: /^Flashcards/ })).toBeVisible()
    await expect(page.locator('[data-purpose="flashcards-due-badge"]')).toHaveCount(0)
    await expect(page).toHaveTitle('Flashcards - Quelio')

    await seed(page, [THREE_NEW])
    const badge = page.locator('[data-purpose="flashcards-due-badge"]')
    await expect(badge.locator('[aria-hidden]')).toHaveText('3')
    await expect(sidebar.getByRole('link', { name: /Flashcards.*3 cards to review today/ })).toBeVisible()

    // Grading a card updates the badge live.
    await page.getByRole('link', { name: 'Study Capitals, 3 due' }).click()
    await card(page).click()
    await page.getByRole('button', { name: 'Know', exact: true }).click()
    await expect(badge.locator('[aria-hidden]')).toHaveText('2')
  })

  test('empty state adds the seven sample decks once; search and sort by due', async ({ page }) => {
    await open(page, '/flashcards?lng=tr')
    await expect(page.getByRole('heading', { name: 'Kartlar' })).toBeVisible()
    await expect(page.getByText('Bir kere öğren, kalıcı hatırla')).toBeVisible()
    await page.getByRole('button', { name: 'Örnek desteler ekle' }).click()
    const rows = page.locator('[data-purpose="deck-row"]')
    await expect(rows).toHaveCount(7)
    await expect(page.getByRole('button', { name: 'Örnek desteler ekle' })).toHaveCount(0)
    await expect(rows.filter({ hasText: 'Türk tarihi: inkılaplar' })).toContainText('10 kart · 0 öğrenildi · Bugün 10 kart tekrar bekliyor')

    await page.getByRole('searchbox', { name: 'Destelerde ara' }).fill('coğrafya')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Türkiye coğrafyası')
    await page.getByRole('searchbox', { name: 'Destelerde ara' }).fill('zzz')
    await expect(page.getByText('Aramanla eşleşen deste yok.')).toBeVisible()
  })

  test('create a deck, add and edit cards, duplicate warning, delete card with undo, ids stay unique across reloads', async ({ page }) => {
    await open(page, '/flashcards?lng=en')
    await page.getByRole('button', { name: 'New deck' }).first().click()
    await expect(page).toHaveURL(/\/flashcards\/[0-9a-f-]{36}$/)
    const name = page.locator('[data-purpose="deck-name"]')
    await expect(name).toBeFocused()
    await name.fill('Biology')
    await expect(page.getByRole('heading', { name: 'Biology', level: 1 })).toBeVisible()

    await page.getByRole('button', { name: 'Add card' }).click()
    await expect(page.getByLabel('Front of card 1')).toBeFocused()
    await page.getByLabel('Front of card 1').fill('Cell')
    await page.getByLabel('Back of card 1').fill('Basic unit of life')
    await page.getByRole('button', { name: 'Add card' }).click()
    await page.getByLabel('Front of card 2').fill('  cell ')
    await page.getByLabel('Back of card 2').fill('duplicate')
    await expect(page.locator('[data-purpose="duplicate-warning"]')).toHaveCount(2)

    await page.getByLabel('Front of card 2').fill('Mitochondria')
    await expect(page.locator('[data-purpose="duplicate-warning"]')).toHaveCount(0)
    await page.getByLabel('Back of card 2').fill('Powerhouse of the cell')
    await page.getByLabel('Back of card 2').blur()

    await page.getByRole('button', { name: 'Delete card 1' }).click()
    await expect(page.locator('[data-purpose="card-row"]')).toHaveCount(1)
    await page.getByRole('status').filter({ hasText: 'Card deleted' }).getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('[data-purpose="card-row"]')).toHaveCount(2)
    await expect(page.getByLabel('Front of card 1')).toHaveValue('Cell')

    await page.reload()
    await expect(page.getByLabel('Back of card 2')).toHaveValue('Powerhouse of the cell')
    await page.getByRole('button', { name: 'Add card' }).click()
    await page.getByLabel('Front of card 3').fill('Nucleus')
    await page.getByLabel('Front of card 3').blur()
    await expect.poll(async () => (await readStore(page)).cards.length).toBe(3)
    const ids = (await readStore(page)).cards.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(3)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  test('bulk paste shows a live preview with invalid lines highlighted, then adds only valid cards', async ({ page }) => {
    await open(page, '/flashcards?lng=en')
    await seed(page, [{ id: 'deck-b', name: 'Words', cards: [{ id: 'w1', front: 'apple', back: 'elma' }] }], '/flashcards/deck-b')
    await page.getByRole('button', { name: 'Paste many cards' }).click()
    await page.locator('[data-purpose="bulk-input"]').fill('book ; kitap\npen\tkalem\nno separator\nApple ; elma again\n ; missing')
    const lines = page.locator('[data-purpose="bulk-line"]')
    await expect(lines).toHaveCount(5)
    await expect(page.locator('[data-purpose="bulk-line"][data-valid="false"]')).toHaveCount(2)
    await expect(lines.nth(2)).toContainText('No separator')
    await expect(lines.nth(3)).toContainText('Same front as another card in this deck')
    await page.getByRole('button', { name: 'Add 3 cards' }).click()
    await expect(page.getByText('Added 3 cards.')).toBeVisible()
    await expect(page.locator('[data-purpose="card-row"]')).toHaveCount(4)
    await expect(page.locator('[data-purpose="duplicate-warning"]')).toHaveCount(2)
  })

  test('CSV export and import round trip with Turkish and Western Armenian text', async ({ page }, testInfo) => {
    await open(page, '/flashcards?lng=en')
    await seed(page, [
      {
        id: 'deck-csv',
        name: 'Dil: Türkçe & Հայերէն',
        cards: [
          { id: 'x1', front: 'Şapka Kanunu', back: '25 Kasım 1925' },
          { id: 'x2', front: 'Բարեւ', back: 'Merhaba, "selam"; hello' },
          { id: 'x3', front: 'ığüşöç', back: 'İĞÜŞÖÇ\nikinci satır' },
        ],
      },
      { id: 'deck-empty', name: 'Target', cards: [] },
    ])
    await page.goto('/flashcards/deck-csv')
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export CSV' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe('Dil Türkçe & Հայերէն.csv')
    const path = testInfo.outputPath('deck.csv')
    await download.saveAs(path)
    const csv = readFileSync(path, 'utf-8')
    expect(csv.charCodeAt(0)).toBe(0xfeff)

    await page.goto('/flashcards/deck-empty')
    await page.locator('[data-purpose="csv-input"]').setInputFiles({ name: 'deck.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') })
    await expect(page.locator('[data-purpose="csv-preview"]')).toContainText('3 cards will be added')
    await expect(page.getByLabel('Front of card 1')).toHaveCount(0)
    await page.locator('[data-purpose="csv-preview"]').getByRole('button', { name: 'Add 3 cards' }).click()
    await expect(page.getByText('Imported 3 cards.')).toBeVisible()
    await expect(page.getByLabel('Front of card 2')).toHaveValue('Բարեւ')
    await expect(page.getByLabel('Back of card 2')).toHaveValue('Merhaba, "selam"; hello')
    await expect(page.getByLabel('Back of card 3')).toHaveValue('İĞÜŞÖÇ\nikinci satır')
  })

  test('delete deck asks for confirmation, then offers undo', async ({ page }) => {
    await open(page, '/flashcards?lng=en')
    await seed(page, [THREE_NEW], '/flashcards/deck-1')
    await page.getByRole('button', { name: 'Delete deck' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete this deck?' })
    await expect(dialog).toContainText('“Capitals” and its 3 cards will be deleted.')
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(/\/flashcards\/deck-1$/)

    await page.getByRole('button', { name: 'Delete deck' }).click()
    await dialog.getByRole('button', { name: 'Delete deck' }).click()
    await expect(page).toHaveURL(/\/flashcards$/)
    await expect(page.locator('[data-purpose="flashcards-empty"]')).toBeVisible()
    await page.getByRole('status').filter({ hasText: 'Deck “Capitals” deleted' }).getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('[data-purpose="deck-row"]')).toContainText('3 cards')
    await page.reload()
    await expect(page.locator('[data-purpose="deck-row"]')).toContainText('Capitals')
  })

  test('storage unavailable: a short note, and decks still work in memory', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', {
        get() {
          throw new Error('blocked')
        },
      })
    })
    await open(page, '/flashcards?lng=en')
    await expect(page.locator('[data-purpose="flashcards-storage-note"]')).toContainText('this session lives only in this tab')
    await page.getByRole('button', { name: 'Add sample decks' }).click()
    await expect(page.locator('[data-purpose="deck-row"]')).toHaveCount(7)
  })
})

test.describe('Flashcards — study', () => {
  test('study with the mouse: flip, grade, summary, and progress survives a reload', async ({ page }) => {
    await open(page, '/flashcards?lng=en')
    await seed(page, [THREE_NEW], '/flashcards/deck-1/study')
    await expect(page).toHaveTitle('Study: Capitals - Quelio')
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('1 / 3')
    await expect(page.locator('[data-purpose="progress-dots"] li')).toHaveCount(3)
    await expect(page.getByRole('button', { name: 'Know', exact: true })).toHaveCount(0)

    await expect(card(page)).toHaveAttribute('aria-pressed', 'false')
    await card(page).click()
    await expect(card(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('status').filter({ hasText: 'Answer: Paris' })).toHaveCount(1)
    await page.getByRole('button', { name: 'Know', exact: true }).click()

    await card(page).click()
    await page.getByRole('button', { name: "Don't know" }).click()
    // The missed card comes back at the end of the same session.
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('3 / 4')

    await page.reload()
    const stored = await readStore(page)
    expect(stored.cards.find((entry) => entry.id === 'c1')).toMatchObject({ box: 2, reviews: 1, due: new Date(2026, 2, 11).getTime() })
    expect(stored.cards.find((entry) => entry.id === 'c2')).toMatchObject({ box: 1, reviews: 1, lapses: 1 })

    // After the reload, c2 (missed) and c3 (new) are still due; c1 waits until tomorrow.
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('1 / 2')
    for (let i = 0; i < 2; i++) {
      await card(page).click()
      await page.getByRole('button', { name: 'Know', exact: true }).click()
    }
    const summary = page.locator('[data-purpose="study-summary"]')
    await expect(summary).toContainText('You knew 2 of 2.')
    await expect(summary.locator('[data-purpose="next-due"]')).toHaveText('Next review: tomorrow')
    await expect(summary.getByRole('button', { name: 'Study again' })).toHaveCount(0)
    await summary.getByRole('link', { name: 'Back to decks' }).click()
    await expect(page.locator('[data-purpose="deck-row"]')).toContainText('3 cards · 3 learned')
  })

  test('@cross keyboard: Space flips, arrows and 1/2 grade only after flipping, Esc exits', async ({ page }) => {
    await open(page, '/flashcards?lng=en')
    await seed(page, [THREE_NEW], '/flashcards/deck-1/study')
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('1 / 3')

    await page.keyboard.press('ArrowRight')
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('1 / 3')
    await page.keyboard.press('Space')
    await expect(card(page)).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('ArrowLeft')
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('2 / 4')
    await expect(card(page)).toBeFocused()

    await page.keyboard.press('Space')
    await page.keyboard.press('2')
    await page.keyboard.press('Enter')
    await expect(card(page)).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('1')
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('4 / 5')
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/flashcards\/deck-1$/)
  })

  test('@cross touch: tap flips, swipe right knows, swipe left does not', async ({ page }) => {
    await open(page, '/flashcards?lng=en')
    await seed(page, [THREE_NEW], '/flashcards/deck-1/study')

    // A swipe before flipping does nothing.
    await swipe(card(page), 140)
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('1 / 3')

    await card(page).click()
    await swipe(card(page), 140)
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('2 / 3')
    await expect(card(page)).toHaveAttribute('aria-pressed', 'false')

    await card(page).click()
    await swipe(card(page), -140)
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('3 / 4')
    const stored = await readStore(page)
    expect(stored.cards.find((entry) => entry.id === 'c1')?.box).toBe(2)
    expect(stored.cards.find((entry) => entry.id === 'c2')?.box).toBe(1)
  })

  test('all done for today shows the next review; practice anyway never changes the schedule', async ({ page }) => {
    const tomorrow = new Date(2026, 2, 11).getTime()
    await open(page, '/flashcards?lng=en')
    await seed(page, [
      {
        id: 'deck-done',
        name: 'Done',
        cards: [
          { id: 'd1', front: 'one', back: '1', box: 2, reviews: 1, due: tomorrow },
          { id: 'd2', front: 'two', back: '2', box: 4, reviews: 3, due: tomorrow + 6 * DAY },
        ],
      },
    ])
    await page.goto('/flashcards/deck-done/study')
    const done = page.locator('[data-purpose="all-done"]')
    await expect(done).toContainText('All done for today')
    await expect(done.locator('[data-purpose="next-due"]')).toHaveText('Next review: tomorrow')
    await expect(card(page)).toHaveCount(0)
    const before = await readStore(page)

    await done.getByRole('button', { name: 'Practice anyway' }).click()
    await expect(page.locator('[data-purpose="practice-badge"]')).toBeVisible()
    await card(page).click()
    await page.getByRole('button', { name: "Don't know" }).click()
    await card(page).click()
    await page.getByRole('button', { name: 'Know', exact: true }).click()
    await card(page).click()
    await page.getByRole('button', { name: 'Know', exact: true }).click()
    await expect(page.locator('[data-purpose="study-summary"]')).toContainText('You knew 2 of 2.')
    expect((await readStore(page)).cards).toEqual(before.cards)

    // The next day the first card is due again.
    await page.clock.setFixedTime(new Date(2026, 2, 11, 8, 0))
    await page.reload()
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('1 / 1')
  })

  test('daily new-card limit from the deck setting', async ({ page }) => {
    await open(page, '/flashcards?lng=en')
    await seed(page, [{ id: 'deck-many', name: 'Many', newPerDay: 5, cards: Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, front: `q${i}`, back: `a${i}` })) }])
    await expect(page.locator('[data-purpose="deck-row"]')).toContainText('8 cards · 0 learned · 5 cards to review today')
    await page.goto('/flashcards/deck-many')
    await page.getByRole('button', { name: 'New cards per day' }).click()
    await page.getByRole('option', { name: '10', exact: true }).click()
    await page.goto('/flashcards/deck-many/study')
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('1 / 8')
  })

  test('reduced motion swaps the 3D flip for a crossfade', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, '/flashcards?lng=en')
    await seed(page, [THREE_NEW], '/flashcards/deck-1/study')
    await card(page).click()
    const inner = card(page).locator('.flashcard-inner')
    expect(await inner.evaluate((element) => getComputedStyle(element).transform)).toBe('none')
    await expect(page.locator('[data-purpose="flashcard-back"]')).toHaveCSS('opacity', '1')
    await expect(front(page)).toHaveCSS('opacity', '0')
  })

  test('long text scrolls inside the card and math renders', async ({ page }) => {
    await open(page, '/flashcards?lng=en')
    await seed(page, [{ id: 'deck-long', name: 'Long', cards: [{ id: 'l1', front: 'Solve $x^2 = 4$', back: Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n') }] }], '/flashcards/deck-long/study')
    await expect(front(page).locator('.katex')).toHaveCount(1)
    await card(page).click()
    const back = page.locator('[data-purpose="flashcard-back"]')
    expect(await back.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    const boxSize = await card(page).boundingBox()
    expect(boxSize?.height).toBeGreaterThanOrEqual(300)
  })
})

test.describe('Flashcards — languages and layout', () => {
  for (const { lng, nav, study, know, dontKnow, allDone } of [
    { lng: 'tr', nav: 'Kartlar', study: 'Çalış · 3', know: 'Biliyorum', dontKnow: 'Bilmiyorum', allDone: 'Bugünlük bu kadar' },
    { lng: 'hyw', nav: 'Քարտեր', study: 'Սորվիլ · 3', know: 'Գիտեմ', dontKnow: 'Չեմ գիտեր', allDone: 'Այսօրուան համար վերջացաւ' },
    { lng: 'en', nav: 'Flashcards', study: 'Study · 3', know: 'Know', dontKnow: "Don't know", allDone: 'All done for today' },
  ]) {
    test(`flashcards are localized in ${lng}`, async ({ page }) => {
      await open(page, `/flashcards?lng=${lng}`)
      await seed(page, [THREE_NEW])
      await expect(page.locator('[data-purpose="sidebar-navigation"]')).toContainText(nav)
      await page.locator('[data-purpose="deck-row"]').getByText(study).click()
      for (let i = 0; i < 3; i++) {
        await card(page).click()
        await expect(page.getByRole('button', { name: dontKnow, exact: true })).toBeVisible()
        await page.getByRole('button', { name: know, exact: true }).click()
      }
      await page.goto(`/flashcards/deck-1/study?lng=${lng}`)
      await expect(page.locator('[data-purpose="all-done"]')).toContainText(allDone)
    })
  }

  for (const width of [1440, 390]) {
    test(`@mobile list, editor and study fit at ${width}px with no sideways overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await open(page, '/flashcards?lng=hyw')
      await seed(page, [{ ...THREE_NEW, name: 'Աշխարհագրութիւն եւ մայրաքաղաքներ — շատ երկար տրցակի անուն' }])
      await expectNoOverflow(page)
      await page.goto('/flashcards/deck-1')
      await expectNoOverflow(page)
      await page.goto('/flashcards/deck-1/study')
      await card(page).click()
      await expect(page.locator('[data-purpose="progress-dots"]')).toBeVisible()
      await expectNoOverflow(page)
    })
  }
})
