import type { Page } from '@playwright/test'

import { test, expect } from './fixtures'
import { readStore, seed } from './flashcardHelpers'

const NOW = new Date(2026, 2, 10, 14, 0, 0)
const rows = (page: Page) => page.locator('[data-purpose="deck-row"]')

async function open(page: Page, path: string) {
  await page.clock.setFixedTime(NOW)
  await page.goto(path)
}

async function importCsv(page: Page, content: string) {
  await page.locator('[data-purpose="csv-input"]').setInputFiles({ name: 'cards.csv', mimeType: 'text/csv', buffer: Buffer.from(content, 'utf-8') })
}

test.describe('Flashcards — sample decks', () => {
  test('@cross Turkish UI: seven sample decks with question fronts; a second click adds nothing', async ({ page }) => {
    await open(page, '/flashcards?lng=tr')
    await page.getByRole('button', { name: 'Örnek desteler ekle' }).click()
    await expect(rows(page)).toHaveCount(7)
    for (const name of ['Fotosentez', 'Hücre organelleri', 'Üslü sayılar', 'İngilizce düzensiz fiiller', 'Türkiye coğrafyası', 'Türk tarihi: inkılaplar', 'YDS sık kelimeler']) {
      await expect(rows(page).filter({ hasText: name })).toHaveCount(1)
    }
    await expect(rows(page).filter({ hasText: 'Türk tarihi: inkılaplar' })).toContainText('10 kart · 0 öğrenildi · Bugün 10 kart tekrar bekliyor')
    // Nothing left to add: the button is gone, so no click can duplicate a deck.
    await expect(page.getByRole('button', { name: 'Örnek desteler ekle' })).toHaveCount(0)

    await rows(page).filter({ hasText: 'YDS sık kelimeler' }).getByRole('link', { name: /düzenle/i }).click()
    await expect(page.getByLabel('1. kartın ön yüzü')).toHaveValue('abundant: Türkçe anlamı?')
    const store = await readStore(page)
    expect(store.decks).toHaveLength(7)
    expect(store.cards.filter((entry) => entry.front.endsWith('?'))).toHaveLength(store.cards.length)
  })

  test('a deleted sample deck can be added again, and only that one', async ({ page }) => {
    await open(page, '/flashcards?lng=en')
    await page.getByRole('button', { name: 'Add sample decks' }).click()
    await expect(rows(page)).toHaveCount(7)

    await rows(page).filter({ hasText: 'Exponents' }).getByRole('link', { name: /Edit/ }).click()
    await page.getByRole('button', { name: 'Delete deck' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete deck' }).click()
    await expect(rows(page)).toHaveCount(6)

    await page.getByRole('button', { name: 'Add sample decks' }).click()
    await expect(rows(page)).toHaveCount(7)
    await expect(rows(page).filter({ hasText: 'Exponents' })).toHaveCount(1)
    await page.reload()
    await expect(rows(page)).toHaveCount(7)
  })

  test('@cross students with the first sample decks keep them (content and progress); only new samples are added', async ({ page }) => {
    await open(page, '/flashcards?lng=tr')
    const progress = { box: 3, reviews: 2, due: NOW.getTime() + 86_400_000 * 3, introducedAt: NOW.getTime() - 1000 }
    await seed(page, [
      { id: 'old-reforms', name: 'Türk tarihi: inkılaplar', sourceRef: 'sample:reforms', cards: [{ id: 'o1', front: 'Saltanatın kaldırılması', back: '1 Kasım 1922', ...progress }] },
      { id: 'old-geo', name: 'KPSS coğrafya', sourceRef: 'sample:kpssGeography', cards: [{ id: 'o2', front: 'Yüzölçümü en büyük il', back: 'Konya' }] },
      { id: 'old-yds', name: 'YDS sık kelimeler', sourceRef: 'sample:yds', cards: [{ id: 'o3', front: 'abundant', back: 'bol, bereketli (plentiful)' }] },
    ])
    await expect(rows(page)).toHaveCount(3)
    await page.getByRole('button', { name: 'Örnek desteler ekle' }).click()
    await expect(rows(page)).toHaveCount(8)
    await expect(page.locator('[data-purpose="samples-notice"]')).toHaveText('5 örnek deste eklendi')
    // The old Turkish history deck was not replaced: still one deck of that name, with its one card.
    await expect(rows(page).filter({ hasText: 'Türk tarihi: inkılaplar' })).toHaveCount(1)
    await expect(rows(page).filter({ hasText: 'Türk tarihi: inkılaplar' })).toContainText('1 kart')

    const store = await readStore(page)
    expect(store.cards.find((entry) => entry.id === 'o1')).toMatchObject({ front: 'Saltanatın kaldırılması', box: 3, reviews: 2 })
    expect(store.cards.find((entry) => entry.id === 'o3')).toMatchObject({ front: 'abundant' })
    expect(store.decks.map((deck) => deck.id)).toEqual(expect.arrayContaining(['old-reforms', 'old-geo', 'old-yds']))
  })

  test('the button never replaces or removes a student deck, even one named like a sample or with no cards due', async ({ page }) => {
    await open(page, '/flashcards?lng=tr')
    const later = { box: 2, reviews: 1, due: NOW.getTime() + 86_400_000 * 5, introducedAt: NOW.getTime() - 1000 }
    const cards = Array.from({ length: 7 }, (_, i) => ({ id: `k${i}`, front: `Soru ${i}?`, back: `Cevap ${i}`, ...later }))
    await seed(page, [
      { id: 'mine-kpss', name: 'KPSS coğrafya', cards },
      { id: 'mine-geo', name: 'Türkiye coğrafyası', cards: [{ id: 'g1', front: 'Başkent?', back: 'Ankara' }] },
    ])
    await expect(rows(page)).toHaveCount(2)
    await page.getByRole('button', { name: 'Örnek desteler ekle' }).click()
    await expect(rows(page).filter({ hasText: 'KPSS coğrafya' })).toContainText('7 kart')
    await expect(rows(page).filter({ hasText: 'Türkiye coğrafyası' })).toHaveCount(2)
    await page.reload()
    const store = await readStore(page)
    expect(store.decks.map((deck) => deck.id)).toEqual(expect.arrayContaining(['mine-kpss', 'mine-geo']))
    expect(store.cards.filter((entry) => entry.id.startsWith('k'))).toHaveLength(7)
    expect(store.cards.find((entry) => entry.id === 'g1')).toMatchObject({ front: 'Başkent?' })
  })

  test('Western Armenian UI uses the English sample cards', async ({ page }) => {
    await open(page, '/flashcards?lng=hyw')
    await page.getByRole('button', { name: 'Աւելցնել օրինակ տրցակներ' }).click()
    await expect(rows(page)).toHaveCount(7)
    const store = await readStore(page)
    expect(store.cards.some((entry) => entry.front === 'What is photosynthesis?')).toBe(true)
  })
})

test.describe('Flashcards — wording and card stages', () => {
  test('stage badges say New / Learning / Learned with a tooltip; deck line says how many cards wait', async ({ page }) => {
    await open(page, '/flashcards?lng=en')
    const future = NOW.getTime() + 86_400_000
    await seed(
      page,
      [
        {
          id: 'deck-s',
          name: 'Stages',
          cards: [
            { id: 's1', front: 'fresh', back: 'a' },
            { id: 's2', front: 'missed', back: 'b', box: 1, reviews: 1 },
            { id: 's3', front: 'known', back: 'c', box: 2, reviews: 1, due: future },
          ],
        },
      ],
      '/flashcards/deck-s',
    )
    const badges = page.locator('[data-purpose="card-row"] span[title]')
    await expect(badges).toHaveText(['New', 'Learning', 'Learned'])
    await expect(badges.first()).toHaveAttribute('title', /come back less often/)
    await expect(page.getByText(/Box \d/)).toHaveCount(0)
    await page.goto('/flashcards')
    await expect(rows(page)).toContainText('3 cards · 1 learned · 2 cards to review today')
  })

  test('Turkish labels', async ({ page }) => {
    await open(page, '/flashcards?lng=tr')
    await seed(page, [{ id: 'deck-t', name: 'Aşamalar', cards: [{ id: 't1', front: 'a?', back: 'b' }, { id: 't2', front: 'c?', back: 'd', box: 2, reviews: 1, due: NOW.getTime() + 86_400_000 }] }], '/flashcards/deck-t')
    await expect(page.locator('[data-purpose="card-row"] span[title]')).toHaveText(['Yeni', 'Öğrenildi'])
    await page.goto('/flashcards')
    await expect(rows(page)).toContainText('2 kart · 1 öğrenildi · Bugün 1 kart tekrar bekliyor')
  })
})

test.describe('Flashcards — CSV import', () => {
  const deck = { id: 'deck-i', name: 'Import', cards: [{ id: 'i1', front: 'Elma', back: 'apple' }] }

  test('@cross semicolon file with a BOM and Turkish header: preview first, nothing added until confirmed, duplicates left out', async ({ page }) => {
    await open(page, '/flashcards?lng=en')
    await seed(page, [deck], '/flashcards/deck-i')
    await importCsv(page, '﻿ÖN;ARKA\r\nelma;again\r\nKitap;book\r\n"Çok; satırlı";"iki\r\nsatır"\r\n;boş ön\r\n')
    const preview = page.locator('[data-purpose="csv-preview"]')
    await expect(preview).toContainText('2 cards will be added')
    await expect(preview).toContainText('1 duplicate card left out.')
    await expect(preview).toContainText('1 row skipped')
    expect(await page.locator('[data-purpose="card-row"]').count()).toBe(1)
    await preview.getByRole('button', { name: 'Cancel' }).click()
    await expect(preview).toHaveCount(0)
    expect(await page.locator('[data-purpose="card-row"]').count()).toBe(1)

    await importCsv(page, 'Soru,Cevap\r\nKitap,book\r\n')
    await page.locator('[data-purpose="csv-preview"]').getByRole('button', { name: 'Add 1 card' }).click()
    await expect(page.locator('[data-purpose="card-row"]')).toHaveCount(2)
    await expect(page.getByLabel('Front of card 2')).toHaveValue('Kitap')
  })

  test('an empty file, a wrong column count and too many cards give clear messages with the line', async ({ page }) => {
    await open(page, '/flashcards?lng=en')
    await seed(page, [deck], '/flashcards/deck-i')
    const status = page.getByRole('status').filter({ hasText: /./ })
    await importCsv(page, '')
    await expect(status.first()).toContainText('The file is empty')
    await importCsv(page, 'front,back\r\na,b\r\nsingle\r\n')
    await expect(status.first()).toContainText('Line 3 does not have two columns')
    await importCsv(page, Array.from({ length: 501 }, (_, i) => `q${i},a${i}`).join('\r\n'))
    await expect(status.first()).toContainText('At most 500 cards')
    await expect(page.locator('[data-purpose="csv-preview"]')).toHaveCount(0)
    await expect(page.locator('[data-purpose="card-row"]')).toHaveCount(1)
  })
})

test.describe('Flashcards — decks are never lost', () => {
  test('reset progress, reload, page change and a second sample click keep every deck and card', async ({ page }) => {
    await open(page, '/flashcards?lng=en')
    await page.getByRole('button', { name: 'Add sample decks' }).click()
    await expect(rows(page)).toHaveCount(7)
    await expect.poll(async () => (await readStore(page)).cards.length).toBe(70)
    const before = await readStore(page)

    await rows(page).first().getByRole('link', { name: /Edit/ }).click()
    await page.getByRole('button', { name: 'Reset progress' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Reset progress' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Progress reset.' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to decks' }).first().click()
    await page.reload()
    await expect(rows(page)).toHaveCount(7)
    const after = await readStore(page)
    expect(after.decks.map((entry) => entry.id).sort()).toEqual(before.decks.map((entry) => entry.id).sort())
    expect(after.cards).toHaveLength(before.cards.length)
  })

  test('deleting a deck needs a confirmation; cancelling keeps it, confirming offers undo that restores all its cards', async ({ page }) => {
    await open(page, '/flashcards?lng=en')
    await page.getByRole('button', { name: 'Add sample decks' }).click()
    await rows(page).filter({ hasText: 'Cell organelles' }).getByRole('link', { name: /Edit/ }).click()
    await page.getByRole('button', { name: 'Delete deck' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    expect((await readStore(page)).decks).toHaveLength(7)

    await page.getByRole('button', { name: 'Delete deck' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete deck' }).click()
    await expect(rows(page)).toHaveCount(6)
    await page.getByRole('status').filter({ hasText: 'deleted' }).getByRole('button', { name: 'Undo' }).click()
    await expect(rows(page)).toHaveCount(7)
    await expect(rows(page).filter({ hasText: 'Cell organelles' })).toContainText('10 cards')
    await page.reload()
    await expect(rows(page).filter({ hasText: 'Cell organelles' })).toContainText('10 cards')
  })
})
