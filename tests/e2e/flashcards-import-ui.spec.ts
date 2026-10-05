import type { Page, Route } from '@playwright/test'
import { readFileSync } from 'node:fs'

import { test, expect } from './fixtures'
import { readStore, seed } from './flashcardHelpers'

const dir = 'tests/fixtures/cards/import'
const cardRows = (page: Page) => page.locator('[data-purpose="card-row"]')
const bulkInput = (page: Page) => page.locator('[data-purpose="bulk-input"]')
const csvInput = (page: Page) => page.locator('[data-purpose="csv-input"]')
const panel = (page: Page) => page.locator('[data-purpose="card-generator"]')

async function openEmptyDeck(page: Page, lng = 'en') {
  await page.goto(`/flashcards?lng=${lng}`)
  await seed(page, [{ id: 'd1', name: 'Words', cards: [] }], `/flashcards/d1?lng=${lng}`)
}

/** A real paste: the text goes to the system clipboard and Ctrl+V is pressed in the focused field. */
async function paste(page: Page, text: string) {
  await page.evaluate((value) => navigator.clipboard.writeText(value), text)
  await bulkInput(page).focus()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Control+V')
}

test.describe('Flashcards — bulk paste', () => {
  test('a real paste with CRLF, spreadsheet tabs and dashes fills the preview and the button count live; adding clears the panel', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openEmptyDeck(page)
    await page.getByRole('button', { name: 'Paste many cards' }).click()
    const add = (count: number) => page.getByRole('button', { name: `Add ${count} card${count === 1 ? '' : 's'}`, exact: true })
    await expect(add(0)).toBeDisabled()

    await paste(page, 'cat - kedi\r\ndog - köpek\r\n\r\nbird - kuş\r\n')
    await expect(add(3)).toBeEnabled()
    // Google Sheets / Excel copy: tab separated, CRLF, quoted cell with a line break.
    await paste(page, 'Şapka Kanunu\t25 Kasım 1925\r\n"Iki\nsatır"\tcevap\r\nÜslü sayılar\tKuvvet\r\n')
    await expect(add(3)).toBeEnabled()
    await expect(page.locator('[data-purpose="bulk-line"]').nth(1)).toContainText('satır')
    // Semicolon, pipe and an en dash.
    await paste(page, 'a ; b\nc | d')
    await expect(add(2)).toBeEnabled()
    await paste(page, 'e – f\ng – h')
    await expect(add(2)).toBeEnabled()

    // The count follows typing too.
    await bulkInput(page).fill('')
    await bulkInput(page).pressSequentially('x ; y')
    await expect(add(1)).toBeEnabled()
    await bulkInput(page).pressSequentially('\nz ; w')
    await expect(add(2)).toBeEnabled()

    await add(2).click()
    await expect(page.getByText('Added 2 cards.')).toBeVisible()
    await expect(page.locator('[data-purpose="bulk-add"]')).toHaveCount(0)
    await expect(cardRows(page)).toHaveCount(2)
    await expect(page.getByRole('heading', { name: /Cards \(2\)|2 cards/i })).toBeVisible()
  })

  test('lines that cannot be split are listed with the line number; cards already in the deck are skipped and counted', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/flashcards?lng=en')
    await seed(page, [{ id: 'd2', name: 'Words', cards: [{ id: 'c1', front: 'apple', back: 'elma' }] }], '/flashcards/d2?lng=en')
    await page.getByRole('button', { name: 'Paste many cards' }).click()
    await paste(page, 'Apple ; ELMA\nbook ; kitap\nno separator here\nbook ; kitap')
    const lines = page.locator('[data-purpose="bulk-line"]')
    await expect(lines).toHaveCount(4)
    await expect(lines.nth(0)).toContainText('Already in the deck')
    await expect(lines.nth(2)).toContainText('Line 3')
    await expect(lines.nth(2)).toContainText('No separator')
    await expect(page.locator('[data-purpose="bulk-duplicates"]')).toContainText('2 cards already in the deck were skipped')
    await page.getByRole('button', { name: 'Add 1 card', exact: true }).click()
    await expect(page.getByText('Added 1 card. 2 cards already in the deck were skipped.')).toBeVisible()
    await expect(cardRows(page)).toHaveCount(2)
  })

  test('Turkish UI: paste, count and success message', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openEmptyDeck(page, 'tr')
    await page.getByRole('button', { name: 'Toplu kart ekle' }).click()
    await paste(page, 'kedi\tcat\r\nköpek\tdog')
    await page.getByRole('button', { name: '2 kart ekle', exact: true }).click()
    await expect(page.getByText('2 kart eklendi.')).toBeVisible()
    await expect(cardRows(page)).toHaveCount(2)
  })

  test('Western Armenian UI: paste, count and success message', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await openEmptyDeck(page, 'hyw')
    await page.getByRole('button', { name: 'Միանգամէն շատ քարտ' }).click()
    await paste(page, 'cat ; կատու\ndog ; շուն')
    await page.getByRole('button', { name: 'Աւելցնել 2 քարտ', exact: true }).click()
    await expect(page.getByText('2 քարտ աւելցուեցաւ։')).toBeVisible()
    await expect(cardRows(page)).toHaveCount(2)
  })
})

test.describe('Flashcards — CSV import', () => {
  const formats: [string, number][] = [
    ['excel-tr-utf8-bom.csv', 3],
    ['excel-windows-1254.csv', 3],
    ['google-sheets-comma.csv', 3],
    ['libreoffice-quoted.csv', 3],
    ['quizlet-tab.txt', 3],
    ['anki-export.txt', 3],
    ['excel-unicode-utf16.txt', 3],
    ['multiline-quoted.csv', 2],
    ['extra-columns-no-header.csv', 2],
    ['term-definition.csv', 2],
  ]

  for (const [name, count] of formats) {
    test(`@cross ${name}: previews exactly what will be saved, then saves it`, async ({ page }) => {
      await openEmptyDeck(page)
      await csvInput(page).setInputFiles(`${dir}/${name}`)
      const preview = page.locator('[data-purpose="csv-preview"]')
      await expect(preview).toContainText(`${count} cards will be added`)
      await expect(preview.locator('li')).toHaveCount(count)
      // No mojibake from a wrong encoding.
      await expect(preview).not.toContainText(/Ã|Ä|Å|�/)
      if (name === 'excel-windows-1254.csv') await expect(preview).toContainText('Şapka Kanunu ne zaman çıkarıldı?')
      if (name === 'anki-export.txt') {
        await expect(preview).toContainText('1 extra column is ignored.')
        await expect(preview).not.toContainText(/<br>|&nbsp;|<div>/)
      }
      // Nothing is saved before the student confirms.
      expect((await readStore(page)).cards).toHaveLength(0)
      await preview.getByRole('button', { name: `Add ${count} cards` }).click()
      await expect(cardRows(page)).toHaveCount(count)
    })
  }

  test('@cross export opens as UTF-8 BOM + semicolon, and re-importing gives identical cards', async ({ page }, testInfo) => {
    const original = [
      { id: 'x1', front: 'Şapka Kanunu', back: '25 Kasım 1925' },
      { id: 'x2', front: 'Բարեւ', back: 'Merhaba, "selam"; hello' },
      { id: 'x3', front: 'ığüşöç', back: 'İĞÜŞÖÇ\nikinci satır' },
    ]
    await page.goto('/flashcards?lng=en')
    await seed(page, [{ id: 'src', name: 'Source', cards: original }, { id: 'dst', name: 'Target', cards: [] }], '/flashcards/src?lng=en')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()])
    const file = testInfo.outputPath('export.csv')
    await download.saveAs(file)
    const bytes = readFileSync(file)
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(bytes.toString('utf-8').slice(1, 12)).toBe('front;back\r')

    await page.goto('/flashcards/dst?lng=en')
    await csvInput(page).setInputFiles(file)
    await page.locator('[data-purpose="csv-preview"]').getByRole('button', { name: 'Add 3 cards' }).click()
    await expect(cardRows(page)).toHaveCount(3)
    const store = await readStore(page)
    expect(store.cards.filter((card) => (card as { deckId?: string }).deckId === 'dst').map(({ front, back }) => ({ front, back })).sort((a, b) => a.front.localeCompare(b.front))).toEqual(
      original.map(({ front, back }) => ({ front, back })).sort((a, b) => a.front.localeCompare(b.front)),
    )
  })

  test('a row with one column gets a row-numbered error and nothing is imported', async ({ page }) => {
    await openEmptyDeck(page)
    await csvInput(page).setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('front,back\r\na,b\r\nsingle\r\n') })
    await expect(page.getByRole('status').filter({ hasText: 'Line 3' })).toBeVisible()
    await expect(page.locator('[data-purpose="csv-preview"]')).toHaveCount(0)
  })
})

test.describe('Flashcards — deck lifecycle and small fixes', () => {
  test('"Study" is disabled with a tooltip on an empty deck, in the list and on the deck page', async ({ page }) => {
    await page.goto('/flashcards?lng=en')
    await seed(page, [{ id: 'empty', name: 'Empty deck', cards: [] }, { id: 'full', name: 'Full deck', cards: [{ id: 'f1', front: 'a', back: 'b' }] }], '/flashcards?lng=en')
    const emptyRow = page.locator('[data-purpose="deck-row"]').filter({ hasText: 'Empty deck' })
    const study = emptyRow.locator('[aria-disabled="true"]')
    await expect(study).toHaveText('Study · 0')
    await expect(study).toHaveAttribute('title', 'Add cards to this deck first.')
    await expect(emptyRow.getByRole('link', { name: /Study/ })).toHaveCount(0)
    await expect(page.locator('[data-purpose="deck-row"]').filter({ hasText: 'Full deck' }).getByRole('link', { name: /Study/ })).toBeVisible()
    await page.goto('/flashcards/empty?lng=en')
    await expect(page.locator('[aria-disabled="true"]').filter({ hasText: 'Study · 0' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Study/ })).toHaveCount(0)
  })

  test('a "New deck" left blank disappears; named decks and decks with cards stay', async ({ page }) => {
    await page.goto('/flashcards?lng=en')
    const rows = page.locator('[data-purpose="deck-row"]')
    await seed(page, [{ id: 'keep', name: 'Keep me', cards: [{ id: 'k1', front: 'a', back: 'b' }] }], '/flashcards?lng=en')
    await expect(rows).toHaveCount(1)

    // Left untouched: gone after going back.
    await page.getByRole('button', { name: 'New deck' }).first().click()
    await expect(page.locator('[data-purpose="deck-name"]')).toHaveAttribute('placeholder', 'Untitled deck')
    await page.getByRole('link', { name: 'Back to decks' }).click()
    await expect(rows).toHaveCount(1)
    await expect(rows.filter({ hasText: 'Untitled deck' })).toHaveCount(0)

    // Named: stays.
    await page.getByRole('button', { name: 'New deck' }).first().click()
    await page.locator('[data-purpose="deck-name"]').fill('Fresh deck')
    await page.locator('[data-purpose="deck-name"]').blur()
    await page.getByRole('link', { name: 'Back to decks' }).click()
    await expect(rows.filter({ hasText: 'Fresh deck' })).toHaveCount(1)

    // Unnamed but with a card: stays (shown as "Untitled deck").
    await page.getByRole('button', { name: 'New deck' }).first().click()
    await page.getByRole('button', { name: 'Add card' }).first().click()
    await expect(cardRows(page)).toHaveCount(1)
    await page.getByRole('link', { name: 'Back to decks' }).click()
    await expect(rows.filter({ hasText: 'Untitled deck' })).toHaveCount(1)
    await expect(rows).toHaveCount(3)
  })

  test('a blank deck left behind by a closed tab is dropped on the next visit', async ({ page }) => {
    await page.goto('/flashcards?lng=en')
    await seed(page, [{ id: 'blank', name: '', cards: [] }, { id: 'real', name: 'Real', cards: [] }], '/flashcards?lng=en')
    await expect(page.locator('[data-purpose="deck-row"]')).toHaveCount(1)
    await expect(page.locator('[data-purpose="deck-row"]')).toContainText('Real')
    await expect.poll(async () => (await readStore(page)).decks.map((deck) => deck.id)).toEqual(['real'])
  })

  test('the generator selects are one height and style; the review "Add" is the amber primary button', async ({ page }) => {
    await page.route('**/api/cards', (route: Route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ cards: [{ front: 'What is X?', back: 'Y' }], removed: 0, provider: 'openai', fallbackUsed: false, requested: 5 }) }),
    )
    await page.goto('/flashcards?lng=en')
    await page.getByRole('button', { name: 'New deck' }).first().click()
    const triggers = panel(page).locator('[data-select-trigger], button[aria-haspopup="listbox"]')
    await expect(triggers).toHaveCount(3)
    const looks = await triggers.evaluateAll((nodes) =>
      nodes.map((node) => {
        const style = getComputedStyle(node)
        return { height: Math.round(node.getBoundingClientRect().height), background: style.backgroundColor, radius: style.borderRadius, size: style.fontSize, color: style.color }
      }),
    )
    expect(new Set(looks.map((look) => JSON.stringify(look))).size).toBe(1)

    await panel(page).locator('[data-purpose="generator-text"]').fill(Array.from({ length: 40 }, (_, i) => `Word${i}`).join(' '))
    await panel(page).getByRole('button', { name: 'Generate cards', exact: true }).click()
    const addButton = page.locator('[data-purpose="generator-review"]').getByRole('button', { name: /^Add \d+ card/ })
    await expect(addButton).toHaveClass(/bg-amber/)
    // Only one amber primary button at a time.
    await expect(panel(page).getByRole('button', { name: 'Generate cards', exact: true })).not.toHaveClass(/bg-amber/)
  })

  test('@mobile the generator and bulk paste fit a phone screen', async ({ page }) => {
    await openEmptyDeck(page)
    await page.getByRole('button', { name: 'Paste many cards' }).click()
    await bulkInput(page).fill('a ; b\nc ; d')
    await expect(page.getByRole('button', { name: 'Add 2 cards', exact: true })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
})

test.describe('Flashcards — generator options', () => {
  const ok = (cards: { front: string; back: string }[], requested?: number) => ({ cards, removed: 0, provider: 'openai', fallbackUsed: false, ...(requested ? { requested } : {}) })
  const TEXT = Array.from({ length: 40 }, (_, i) => `Light bends in step ${i} when it passes through water drops.`).join(' ')

  test('the text tab starts on "Automatic (cover the whole text)" and sends it; the topic tab has fixed counts; a new deck starts on Automatic language', async ({ page }) => {
    const requests: Record<string, unknown>[] = []
    await page.route('**/api/cards', async (route: Route) => {
      requests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(ok([{ front: 'What bends light?', back: 'Water drops.' }], 3)) })
    })
    await page.goto('/flashcards?lng=en')
    await page.getByRole('button', { name: 'New deck' }).first().click()
    const count = panel(page).getByRole('combobox').or(panel(page).locator('button[aria-haspopup="listbox"]'))
    await expect(count.nth(0)).toContainText('Automatic (cover the whole text)')
    await expect(count.nth(2)).toContainText('Auto')
    await panel(page).locator('[data-purpose="generator-text"]').fill(TEXT)
    await panel(page).getByRole('button', { name: 'Generate cards', exact: true }).click()
    await expect(page.locator('[data-purpose="generator-review"]')).toBeVisible()
    expect(requests[0]).toMatchObject({ mode: 'text', count: 'auto', language: 'auto', uiLanguage: 'en' })
    // The service made fewer cards than asked: the student is told how many were possible.
    await expect(page.locator('[data-purpose="generator-shortfall"]')).toHaveText('Only 1 distinct card could be made from this text.')

    await panel(page).getByRole('tab', { name: 'Topic' }).click()
    // The topic tab has a level select first, then the count.
    await expect(count.nth(1)).toContainText('10')
    await count.nth(1).click()
    await expect(page.getByRole('option', { name: /Automatic/ })).toHaveCount(0)
  })

  test('foreign words into the text\'s own language: a note under the selector and "Generate cards" is disabled', async ({ page }) => {
    await page.goto('/flashcards?lng=en')
    await page.getByRole('button', { name: 'New deck' }).first().click()
    const german = 'Die Brücke ist sehr alt und die Stadt liegt an dem Fluss. Der Mann geht mit dem Hund in den Park und das Kind spielt auf der Wiese. Es ist ein schöner Tag und die Sonne scheint über der Stadt. '
    await panel(page).locator('[data-purpose="generator-text"]').fill(german.repeat(2))
    await panel(page).locator('button[aria-haspopup="listbox"]').nth(1).click()
    await page.getByRole('option', { name: /Foreign word/ }).click()
    await panel(page).locator('button[aria-haspopup="listbox"]').nth(2).click()
    await page.getByRole('searchbox').fill('Deutsch')
    await page.getByRole('option', { name: /Deutsch/ }).first().click()
    await expect(panel(page).locator('[data-purpose="same-language-note"]')).toBeVisible()
    await expect(panel(page).getByRole('button', { name: 'Generate cards', exact: true })).toBeDisabled()
    await panel(page).locator('button[aria-haspopup="listbox"]').nth(2).click()
    await page.getByRole('option', { name: /^Auto/ }).click()
    await expect(panel(page).locator('[data-purpose="same-language-note"]')).toHaveCount(0)
    await expect(panel(page).getByRole('button', { name: 'Generate cards', exact: true })).toBeEnabled()
  })

  test('@cross right-to-left cards show with dir="auto" in the review, the card list and study mode', async ({ page }) => {
    await page.route('**/api/cards', (route: Route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(ok([{ front: 'ما هو قوس قزح؟', back: 'ظاهرة ضوئية تحدث عند انكسار الضوء.' }])) }),
    )
    await page.goto('/flashcards?lng=en')
    await page.getByRole('button', { name: 'New deck' }).first().click()
    await panel(page).locator('[data-purpose="generator-text"]').fill(TEXT)
    await panel(page).getByRole('button', { name: 'Generate cards', exact: true }).click()
    await expect(page.getByLabel('Front of card 1')).toHaveAttribute('dir', 'auto')
    await expect(page.getByLabel('Back of card 1')).toHaveAttribute('dir', 'auto')
    await page.locator('[data-purpose="generator-review"]').getByRole('button', { name: /^Add \d+ card/ }).click()
    await expect(cardRows(page)).toHaveCount(1)
    await expect(cardRows(page).locator('[dir="auto"]').first()).toBeVisible()
    await page.getByRole('link', { name: /Study/ }).first().click()
    await expect(page.locator('[data-purpose="flashcard-front"] [dir="auto"]')).toContainText('ما هو قوس قزح؟')
  })
})
