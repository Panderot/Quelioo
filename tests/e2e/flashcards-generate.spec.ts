import type { Page, Route } from '@playwright/test'

import { test, expect } from './fixtures'
import { readStore, seed } from './flashcardHelpers'

const LONG_TEXT = Array.from({ length: 12 }, (_, i) => `Plants use light in step ${i} to turn water and carbon dioxide into sugar.`).join(' ')
const CARDS = [
  { front: 'Where does photosynthesis happen?', back: 'In the chloroplasts' },
  { front: 'Which gas do plants release?', back: 'Oxygen' },
  { front: 'Which pigment absorbs light?', back: 'Chlorophyll' },
]

interface CardsMock {
  requests: Record<string, unknown>[]
}

/** Mocks /api/cards; `replies` are used in order, the last one repeats. */
async function mockCards(page: Page, replies: { status?: number; body: unknown }[]): Promise<CardsMock> {
  const mock: CardsMock = { requests: [] }
  await page.route('**/api/cards', async (route: Route) => {
    mock.requests.push(route.request().postDataJSON() as Record<string, unknown>)
    const reply = replies[Math.min(mock.requests.length - 1, replies.length - 1)]
    await route.fulfill({ status: reply.status ?? 200, contentType: 'application/json', body: JSON.stringify(reply.body) })
  })
  return mock
}

const ok = (cards = CARDS, removed = 0) => ({ body: { cards, removed, provider: 'openai', fallbackUsed: false } })
const panel = (page: Page) => page.locator('[data-purpose="card-generator"]')
const review = (page: Page) => page.locator('[data-purpose="generator-review"]')
const generateButton = (page: Page) => panel(page).getByRole('button', { name: 'Generate cards', exact: true })

async function openNewDeck(page: Page) {
  await page.goto('/flashcards?lng=en')
  await page.getByRole('button', { name: 'New deck' }).first().click()
  await expect(panel(page)).toBeVisible()
}

test.describe('Flashcards — generate with AI', () => {
  test('@cross new deck: text mode, review, edit, uncheck, then add only the chosen cards', async ({ page }) => {
    const mock = await mockCards(page, [ok()])
    await openNewDeck(page)
    // In an empty deck generating is the screen's primary action.
    await expect(generateButton(page)).toHaveClass(/bg-amber/)
    await expect(generateButton(page)).toBeDisabled()

    await panel(page).locator('[data-purpose="generator-text"]').fill('Too short to use.')
    await expect(panel(page)).toContainText('at least 30 words')
    await expect(generateButton(page)).toBeDisabled()
    await panel(page).locator('[data-purpose="generator-text"]').fill(LONG_TEXT)
    await expect(panel(page)).toContainText('168 / 5,000 words')
    await generateButton(page).click()

    await expect(review(page).locator('[data-purpose="review-card"]')).toHaveCount(3)
    await expect(review(page).getByRole('checkbox')).toHaveCount(3)
    for (const box of await review(page).getByRole('checkbox').all()) await expect(box).toBeChecked()
    expect(mock.requests).toEqual([{ mode: 'text', text: LONG_TEXT, count: 10, style: 'term', language: 'auto', avoid: [] }])
    // Nothing is saved before "Add".
    expect((await readStore(page)).cards).toHaveLength(0)

    await review(page).getByLabel('Back of card 1').fill('Inside chloroplasts')
    await review(page).getByRole('checkbox', { name: 'Include card 2' }).uncheck()
    await review(page).getByRole('button', { name: 'Add 2 cards' }).click()

    await expect(page.getByText('Added 2 cards.')).toBeVisible()
    await expect(panel(page)).toHaveCount(0)
    await expect(page.locator('[data-purpose="card-row"]')).toHaveCount(2)
    await expect(page.getByLabel('Back of card 1')).toHaveValue('Inside chloroplasts')
    await expect(page.getByLabel('Front of card 2')).toHaveValue('Which pigment absorbs light?')
    await expect.poll(async () => (await readStore(page)).cards.length).toBe(2)
  })

  test('topic mode with options sends the avoid list; doubtful cards removed and duplicates flagged', async ({ page }) => {
    await page.goto('/flashcards?lng=en')
    await seed(page, [{ id: 'deck-geo', name: 'Geo', cards: [{ id: 'g1', front: 'Capital of Türkiye', back: 'Ankara' }] }], '/flashcards/deck-geo')
    await expect(panel(page)).toHaveCount(0)
    const mock = await mockCards(page, [ok([{ front: 'capital of türkiye', back: 'Ankara' }, ...CARDS.slice(0, 1)], 2)])
    await page.getByRole('button', { name: 'Generate cards with AI' }).click()
    await expect(generateButton(page)).toHaveClass(/border-navy/)

    await panel(page).getByRole('tab', { name: 'Topic' }).click()
    await panel(page).locator('[data-purpose="generator-topic"]').fill("Türkiye'nin coğrafi bölgeleri")
    await panel(page).getByRole('button', { name: 'Level' }).click()
    await page.getByRole('option', { name: 'KPSS', exact: true }).click()
    await panel(page).getByRole('button', { name: 'Number of cards' }).click()
    await page.getByRole('option', { name: '20', exact: true }).click()
    await panel(page).getByRole('button', { name: 'Card style' }).click()
    await page.getByRole('option', { name: 'Foreign word → translation' }).click()
    await panel(page).getByRole('button', { name: 'Output language' }).click()
    await page.getByRole('option', { name: /Türkçe/ }).first().click()
    await generateButton(page).click()

    await expect(review(page)).toContainText('2 doubtful cards were removed after the fact check.')
    expect(mock.requests).toEqual([{ mode: 'topic', topic: "Türkiye'nin coğrafi bölgeleri", level: 'kpss', count: 20, style: 'translation', language: 'tr', avoid: ['Capital of Türkiye'] }])
    await expect(review(page)).toContainText('Same front as another card in this deck')
  })

  test('loading can be cancelled; Generate is disabled meanwhile (no double submit)', async ({ page }) => {
    let requests = 0
    await page.route('**/api/cards', () => {
      requests += 1
      // Never answered: the request stays pending until the student cancels.
    })
    await openNewDeck(page)
    await panel(page).locator('[data-purpose="generator-text"]').fill(LONG_TEXT)
    await generateButton(page).click()
    const loading = panel(page).getByRole('button', { name: 'Generating cards…' })
    await expect(loading).toBeDisabled()
    await panel(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(loading).toHaveCount(0)
    await expect(generateButton(page)).toBeEnabled()
    await expect(panel(page).getByRole('alert')).toHaveCount(0)
    await expect(review(page)).toHaveCount(0)
    expect(requests).toBe(1)
  })

  test('errors are localized and retryable, nothing is added; the hourly limit has no retry', async ({ page }) => {
    const mock = await mockCards(page, [{ status: 502, body: { error: 'upstream' } }, ok()])
    await openNewDeck(page)
    await panel(page).locator('[data-purpose="generator-text"]').fill(LONG_TEXT)
    await generateButton(page).click()
    const alert = panel(page).getByRole('alert')
    await expect(alert).toContainText("The AI service didn't respond. Please try again.")
    expect((await readStore(page)).cards).toHaveLength(0)
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(review(page).locator('[data-purpose="review-card"]')).toHaveCount(3)
    await expect(alert).toHaveCount(0)
    expect(mock.requests).toHaveLength(2)

    await page.unroute('**/api/cards')
    await mockCards(page, [{ status: 429, body: { error: 'rate_limited' } }])
    await generateButton(page).click()
    await expect(alert).toContainText("You've generated a lot of cards this hour.")
    await expect(alert.getByRole('button', { name: 'Try again' })).toHaveCount(0)
    await expect(review(page)).toHaveCount(0)
    expect((await readStore(page)).cards).toHaveLength(0)
  })

  test('input limits: topic max 120 characters, text max 5,000 words; discard saves nothing', async ({ page }) => {
    await mockCards(page, [ok()])
    await openNewDeck(page)
    await panel(page).locator('[data-purpose="generator-text"]').fill('word '.repeat(5001))
    await expect(panel(page)).toContainText('5,001 / 5,000 words')
    await expect(generateButton(page)).toBeDisabled()

    await panel(page).getByRole('tab', { name: 'Text' }).press('ArrowRight')
    await expect(panel(page).getByRole('tab', { name: 'Topic' })).toHaveAttribute('aria-selected', 'true')
    await panel(page).locator('[data-purpose="generator-topic"]').fill('x'.repeat(130))
    await expect(panel(page).locator('[data-purpose="generator-topic"]')).toHaveValue('x'.repeat(120))
    await expect(panel(page)).toContainText('120/120')
    await generateButton(page).click()
    await review(page).getByRole('button', { name: 'Discard' }).click()
    await expect(review(page)).toHaveCount(0)
    expect((await readStore(page)).cards).toHaveLength(0)
  })

  for (const { lng, title, tabTopic, add } of [
    { lng: 'tr', title: 'Yapay zekâ ile kart üret', tabTopic: 'Konu', add: '3 kartı ekle' },
    { lng: 'hyw', title: 'Արհեստական բանականութեամբ քարտեր ստեղծել', tabTopic: 'Նիւթ', add: 'Աւելցնել 3 քարտերը' },
  ]) {
    test(`the generator is localized in ${lng}`, async ({ page }) => {
      await mockCards(page, [ok()])
      await page.goto(`/flashcards?lng=${lng}`)
      await page.locator('[data-purpose="page-intro"]').getByRole('button').click()
      await expect(panel(page).getByRole('heading', { name: title })).toBeVisible()
      await panel(page).getByRole('tab', { name: tabTopic }).click()
      await panel(page).locator('[data-purpose="generator-topic"]').fill('Fotosentez')
      await panel(page).locator('button.bg-amber').click()
      await expect(review(page).getByRole('button', { name: add })).toBeVisible()
    })
  }

  test('@mobile the generator and review list fit at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockCards(page, [ok()])
    await openNewDeck(page)
    await panel(page).locator('[data-purpose="generator-text"]').fill(LONG_TEXT)
    await generateButton(page).click()
    await expect(review(page).locator('[data-purpose="review-card"]')).toHaveCount(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  })
})
