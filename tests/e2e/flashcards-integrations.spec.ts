import type { Page } from '@playwright/test'

import { test, expect } from './fixtures'
import { readStore, seed } from './flashcardHelpers'
import { SAMPLE_QUIZ } from '../fixtures/quiz'

const NOW = new Date(2026, 2, 10, 14, 0, 0)

const ENTRY = {
  id: 'quiz-cards',
  title: SAMPLE_QUIZ.title,
  createdAt: '2026-01-01T00:00:00.000Z',
  source: 'text' as const,
  questionType: 'mixed',
  difficulty: 'medium',
  questionCount: '6',
  optionsCount: null,
  outputLanguage: 'en',
  sourceText: 'Seeded source text.',
  quiz: { title: SAMPLE_QUIZ.title, questions: SAMPLE_QUIZ.questions },
}

/** Every question type of SAMPLE_QUIZ (a Mixed quiz), converted without AI. */
const EXPECTED_CARDS = [
  ['Which gas do plants absorb during photosynthesis?', 'Carbon dioxide'],
  ['True or false: The Great Wall of China is visible from space with the naked eye.', 'False — This is a common myth; it is not visible without aid.'],
  ['Water boils at ______ degrees Celsius at sea level.', '100'],
  ['Name the largest planet in our solar system.', 'Jupiter'],
  ['What matches: Mercury', 'First from the sun'],
  ['What matches: Venus', 'Second from the sun'],
  ['What matches: Earth', 'Third from the sun'],
  ['What matches: Mars', 'Fourth from the sun'],
  ['Explain why the sky appears blue during the day.', '• Sunlight is scattered by the atmosphere\n• Blue light scatters more because of its shorter wavelength'],
]

const SOLUTION_RECORD = {
  id: 'sol-1',
  createdAt: '2026-03-01T10:00:00.000Z',
  language: 'en',
  schemaVersion: 1,
  extras: {},
  result: {
    topic: 'Linear equations',
    question: 'Solve $3x + 7 = 2x + 15$',
    intro: 'Get x alone.',
    steps: ['Subtract $2x$ from both sides: $x + 7 = 15$', 'Subtract $7$ from both sides: $x = 8$'],
    answer: '$x = 8$',
    tip: 'Check by substituting.',
    mistakes: ['Adding $2x$ instead of subtracting it.'],
  },
}

const dialog = (page: Page) => page.locator('[data-purpose="add-cards-dialog"]')
const more = (page: Page) => page.locator('[data-purpose="quiz-result"]').getByRole('button', { name: 'More', exact: true })

async function openArchivedQuiz(page: Page, seedArchive: (entries: unknown[]) => Promise<void>, lng = 'en') {
  await seedArchive([ENTRY])
  await page.clock.setFixedTime(NOW)
  await page.goto(`/archive/${ENTRY.id}?lng=${lng}`)
  await expect(page.locator('[data-purpose="quiz-result"]')).toBeVisible()
}

/** Answers a practice/question card's MCQ or true/false by option label, then checks it. */
async function answer(card: ReturnType<Page['locator']>, option: RegExp) {
  await card.getByRole('radio', { name: option }).check()
  await card.getByRole('button', { name: 'Check answer' }).click()
}

test.describe('Flashcards from a quiz', () => {
  test('@cross every question type converts; review, edit, uncheck, then a new deck named after the quiz', async ({ page, seedArchive }) => {
    await openArchivedQuiz(page, seedArchive as (entries: unknown[]) => Promise<void>)
    await more(page).click()
    await page.getByRole('menuitem', { name: 'Turn into flashcards' }).click()

    const rows = dialog(page).locator('[data-purpose="review-card"]')
    await expect(rows).toHaveCount(EXPECTED_CARDS.length)
    for (const [index, [front, back]] of EXPECTED_CARDS.entries()) {
      await expect(dialog(page).getByLabel(`Front of card ${index + 1}`, { exact: true })).toHaveValue(front)
      await expect(dialog(page).getByLabel(`Back of card ${index + 1}`, { exact: true })).toHaveValue(back)
    }
    await expect(dialog(page).locator('[data-purpose="convert-deck-name"]')).toHaveValue('Sample Quiz')
    expect((await readStore(page)).cards).toHaveLength(0)

    await dialog(page).getByLabel('Back of card 3', { exact: true }).fill('100 °C')
    await dialog(page).getByRole('checkbox', { name: 'Include card 5' }).uncheck()
    await dialog(page).getByRole('button', { name: 'Add 8 cards' }).click()
    await expect(dialog(page).getByRole('status')).toContainText('Added 8 cards to “Sample Quiz”.')

    const stored = await readStore(page)
    expect(stored.decks).toEqual([expect.objectContaining({ name: 'Sample Quiz', source: 'quiz', sourceRef: ENTRY.id })])
    expect(stored.cards).toHaveLength(8)
    expect(stored.cards.map((card) => card.back)).toContain('100 °C')
    expect(stored.cards.map((card) => card.front)).not.toContain('What matches: Mercury')

    await dialog(page).getByRole('link', { name: 'Open deck' }).click()
    await expect(page.getByRole('heading', { name: 'Sample Quiz', level: 1 })).toBeVisible()
  })

  test('converting the same quiz twice warns and offers only the missing cards', async ({ page, seedArchive }) => {
    await seedArchive([ENTRY])
    await page.goto('/flashcards?lng=en')
    await seed(page, [
      {
        id: 'deck-old',
        name: 'Sample Quiz',
        cards: [
          { id: 'o1', front: 'Which gas do plants absorb during photosynthesis?', back: 'Carbon dioxide' },
          { id: 'o2', front: 'What matches: Mercury', back: 'First from the sun' },
        ],
      },
    ], '/flashcards')
    // Mark the seeded deck as made from this quiz.
    await page.evaluate(async (quizId) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('quelio-flashcards', 1)
        request.onsuccess = () => resolve(request.result)
      })
      await new Promise<void>((resolve) => {
        const tx = db.transaction('decks', 'readwrite')
        const store = tx.objectStore('decks')
        const get = store.get('deck-old')
        get.onsuccess = () => store.put({ ...get.result, source: 'quiz', sourceRef: quizId })
        tx.oncomplete = () => resolve()
      })
      db.close()
    }, ENTRY.id)
    await page.goto(`/archive/${ENTRY.id}?lng=en`)

    await more(page).click()
    await page.getByRole('menuitem', { name: 'Turn into flashcards' }).click()
    await expect(dialog(page).locator('[data-purpose="already-converted"]')).toContainText('You already made flashcards from this in “Sample Quiz”.')
    await dialog(page).getByRole('button', { name: 'Add only the 7 missing cards there' }).click()
    await expect(dialog(page).locator('[data-purpose="review-card"]')).toHaveCount(7)
    await expect(dialog(page).getByRole('radio', { name: 'Existing deck' })).toHaveAttribute('aria-checked', 'true')
    await dialog(page).getByRole('button', { name: 'Add 7 cards' }).click()
    await expect(dialog(page).getByRole('status')).toContainText('Added 7 cards to “Sample Quiz”.')
    const stored = await readStore(page)
    expect(stored.decks).toHaveLength(1)
    expect(stored.cards).toHaveLength(9)
  })

  test('add to an existing deck chosen from the list', async ({ page, seedArchive }) => {
    await seedArchive([ENTRY])
    await page.goto('/flashcards?lng=en')
    await seed(page, [
      { id: 'deck-a', name: 'Astronomy', cards: [{ id: 'a1', front: 'What matches: Mars', back: 'Red planet' }] },
      { id: 'deck-b', name: 'Biology', cards: [] },
    ], `/archive/${ENTRY.id}?lng=en`)
    await more(page).click()
    await page.getByRole('menuitem', { name: 'Turn into flashcards' }).click()
    await dialog(page).getByRole('radio', { name: 'Existing deck' }).click()
    await dialog(page).getByRole('button', { name: 'Deck' }).click()
    await page.getByRole('option', { name: 'Astronomy' }).click()
    // "Mars" already exists in Astronomy, so it is flagged as a duplicate.
    await expect(dialog(page).getByText('Same front as another card in this deck')).toHaveCount(1)
    await dialog(page).getByRole('button', { name: 'Add 9 cards' }).click()
    await expect(dialog(page).getByRole('status')).toContainText('Added 9 cards to “Astronomy”.')
    const stored = await readStore(page)
    expect(stored.cards.filter((card) => (card as unknown as { deckId: string }).deckId === 'deck-a')).toHaveLength(10)
  })
})

test.describe('Flashcards from my mistakes', () => {
  test('only first-attempt wrong answers, in "{title} · Mistakes", due today — from the result view and Study Mode', async ({ page, seedArchive }) => {
    await openArchivedQuiz(page, seedArchive as (entries: unknown[]) => Promise<void>)
    await more(page).click()
    await expect(page.getByRole('menuitem', { name: /Flashcards from my mistakes/ })).toHaveCount(0)
    await page.keyboard.press('Escape')

    const mcq = page.locator('[data-purpose="question-card"]', { hasText: 'photosynthesis' })
    await answer(mcq, /Nitrogen/)
    await answer(mcq, /Carbon dioxide/)
    // Right on the first attempt: never a mistake, even after a later wrong re-check.
    const tf = page.locator('[data-purpose="question-card"]', { hasText: 'Great Wall' })
    await answer(tf, /^False/)
    await answer(tf, /^True/)

    await more(page).click()
    await page.getByRole('menuitem', { name: 'Flashcards from my mistakes (1)' }).click()
    await expect(page.locator('[data-purpose="mistakes-result"]')).toContainText('Added 1 card to “Sample Quiz · Mistakes”.')

    let stored = await readStore(page)
    expect(stored.decks).toEqual([expect.objectContaining({ name: 'Sample Quiz · Mistakes', source: 'quiz', sourceRef: `${ENTRY.id}#mistakes` })])
    expect(stored.cards.map((card) => [card.front, card.back])).toEqual([['Which gas do plants absorb during photosynthesis?', 'Carbon dioxide']])
    expect(stored.cards[0].due).toBeLessThanOrEqual(NOW.getTime())

    // Study Mode keeps the same first attempts: a later wrong answer there is not a new mistake.
    await page.getByRole('button', { name: 'Study', exact: true }).click()
    const practice = (text: string) => page.locator('[data-purpose="practice-question-card"]', { hasText: text })
    await answer(practice('Great Wall'), /^True/)

    // A second run only adds what's missing to the same deck.
    await more(page).click()
    await page.getByRole('menuitem', { name: 'Flashcards from my mistakes (1)' }).click()
    await expect(page.locator('[data-purpose="mistakes-result"]')).toContainText('These mistakes are already in “Sample Quiz · Mistakes”.')
    stored = await readStore(page)
    expect(stored.cards).toHaveLength(1)

    await page.goto('/flashcards?lng=en')
    await expect(page.locator('[data-purpose="deck-row"]')).toContainText('1 card · 0 learned · 1 card to review today')
  })

  test('Study Mode summary offers the mistakes deck once every question is answered', async ({ page, seedArchive }) => {
    await seedArchive([{ ...ENTRY, quiz: { title: ENTRY.title, questions: SAMPLE_QUIZ.questions.slice(0, 2) } }])
    await page.clock.setFixedTime(NOW)
    await page.goto(`/archive/${ENTRY.id}?mode=study&lng=en`)
    const practice = (text: string) => page.locator('[data-purpose="practice-question-card"]', { hasText: text })
    await answer(practice('photosynthesis'), /Oxygen/)
    await answer(practice('Great Wall'), /^False/)
    await page.getByRole('button', { name: 'Flashcards from my mistakes (1)' }).click()
    await expect(page.locator('[data-purpose="mistakes-result"]')).toContainText('Added 1 card')
  })
})

test.describe('Flashcards from a solution', () => {
  test('@cross "Make flashcards" sends the solution to /api/cards and adds reviewed cards, also from Archive > Solutions', async ({ page }) => {
    const requests: Record<string, unknown>[] = []
    await page.route('**/api/cards', async (route) => {
      requests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          cards: [
            { front: 'What must you do to both sides of an equation?', back: 'The same operation' },
            { front: 'How do you check a solution?', back: 'Substitute it back into both sides' },
            { front: 'Common mistake when moving $2x$?', back: 'Adding it instead of subtracting' },
          ],
          removed: 0,
        }),
      })
    })
    await page.goto('/archive?lng=en')
    await page.evaluate(async (record) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('quelio-solutions', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('solutions', { keyPath: 'id' }).createIndex('createdAt', 'createdAt')
        request.onsuccess = () => resolve(request.result)
      })
      await new Promise<void>((resolve) => {
        const tx = db.transaction('solutions', 'readwrite')
        tx.objectStore('solutions').put(record)
        tx.oncomplete = () => resolve()
      })
      db.close()
    }, SOLUTION_RECORD)
    await page.goto(`/archive/solutions/${SOLUTION_RECORD.id}?lng=en`)
    await page.locator('[data-purpose="solution-actions"]').getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'Make flashcards' }).click()

    await expect(dialog(page).locator('[data-purpose="review-card"]')).toHaveCount(3)
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ mode: 'solution', language: 'auto', avoid: [] })
    expect(String(requests[0].text)).toContain('Solve $3x + 7 = 2x + 15$')
    expect(String(requests[0].text)).toContain('2. Subtract $7$ from both sides: $x = 8$')
    await expect(dialog(page).locator('[data-purpose="convert-deck-name"]')).toHaveValue('Linear equations')
    await dialog(page).getByRole('button', { name: 'Add 3 cards' }).click()
    await expect(dialog(page).getByRole('status')).toContainText('Added 3 cards to “Linear equations”.')
    expect((await readStore(page)).decks).toEqual([expect.objectContaining({ source: 'solution', sourceRef: SOLUTION_RECORD.id })])
  })

  test('a failed generation shows a retryable error and adds nothing', async ({ page }) => {
    let calls = 0
    await page.route('**/api/cards', async (route) => {
      calls += 1
      await route.fulfill(
        calls === 1
          ? { status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'upstream' }) }
          : { contentType: 'application/json', body: JSON.stringify({ cards: [{ front: 'Q', back: 'A' }], removed: 0 }) },
      )
    })
    await page.goto('/archive?lng=en')
    await page.evaluate(async (record) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open('quelio-solutions', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('solutions', { keyPath: 'id' }).createIndex('createdAt', 'createdAt')
        request.onsuccess = () => resolve(request.result)
      })
      await new Promise<void>((resolve) => {
        const tx = db.transaction('solutions', 'readwrite')
        tx.objectStore('solutions').put(record)
        tx.oncomplete = () => resolve()
      })
      db.close()
    }, SOLUTION_RECORD)
    await page.goto(`/archive/solutions/${SOLUTION_RECORD.id}?lng=en`)
    await page.locator('[data-purpose="solution-actions"]').getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'Make flashcards' }).click()
    await expect(dialog(page).getByRole('alert')).toContainText("The AI service didn't respond.")
    expect((await readStore(page)).cards).toHaveLength(0)
    await dialog(page).getByRole('button', { name: 'Try again' }).click()
    await expect(dialog(page).locator('[data-purpose="review-card"]')).toHaveCount(1)
  })
})

test.describe('Due reminder', () => {
  test('shows on Create and Solve when cards are due, links to Flashcards, and stays hidden for the rest of the day', async ({ page }) => {
    await page.clock.setFixedTime(NOW)
    await page.goto('/?lng=en')
    await expect(page.locator('[data-purpose="due-reminder"]')).toHaveCount(0)
    await seed(page, [{ id: 'deck-r', name: 'R', cards: [{ id: 'r1', front: 'a', back: 'b' }, { id: 'r2', front: 'c', back: 'd' }] }], '/?lng=en')
    const reminder = page.locator('[data-purpose="due-reminder"]')
    await expect(reminder).toContainText('2 flashcards are waiting for you today')
    await page.goto('/solve?lng=en')
    await expect(reminder).toBeVisible()
    await reminder.getByRole('button', { name: 'Hide until tomorrow' }).click()
    await expect(reminder).toHaveCount(0)
    await page.goto('/?lng=en')
    await expect(reminder).toHaveCount(0)

    await page.clock.setFixedTime(new Date(2026, 2, 11, 9, 0))
    await page.reload()
    await expect(reminder).toBeVisible()
    await reminder.getByRole('link').click()
    await expect(page).toHaveURL(/\/flashcards$/)
  })
})

test.describe('Languages and layout', () => {
  for (const { lng, check, moreLabel, action, mistakes, deckName, reminder } of [
    { lng: 'tr', check: 'Cevabı kontrol et', moreLabel: 'Daha fazla', action: 'Kartlara dönüştür', mistakes: 'Yanlışlarımdan kart (1)', deckName: 'Sample Quiz · Yanlışlar', reminder: 'Bugün seni bekleyen 1 kart var' },
    { lng: 'hyw', check: 'Ստուգել պատասխանը', moreLabel: 'Աւելին', action: 'Քարտերու վերածել', mistakes: 'Սխալներէս քարտեր (1)', deckName: 'Sample Quiz · Սխալներ', reminder: 'Այսօր քեզ կը սպասէ 1 քարտ' },
  ]) {
    test(`quiz actions and the reminder are localized in ${lng}`, async ({ page, seedArchive }) => {
      await openArchivedQuiz(page, seedArchive as (entries: unknown[]) => Promise<void>, lng)
      const mcq = page.locator('[data-purpose="question-card"]', { hasText: 'photosynthesis' })
      await mcq.getByRole('radio', { name: /Nitrogen/ }).check()
      await mcq.getByRole('button', { name: check }).click()
      await page.locator('[data-purpose="quiz-result"]').getByRole('button', { name: moreLabel, exact: true }).click()
      await expect(page.getByRole('menuitem', { name: action })).toBeVisible()
      await page.getByRole('menuitem', { name: mistakes }).click()
      await expect(page.locator('[data-purpose="mistakes-result"]')).toContainText(deckName)
      await page.goto(`/?lng=${lng}`)
      await expect(page.locator('[data-purpose="due-reminder"]')).toContainText(reminder)
    })
  }

  test('@mobile the convert dialog fits at 390px', async ({ page, seedArchive }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openArchivedQuiz(page, seedArchive as (entries: unknown[]) => Promise<void>)
    await more(page).click()
    await page.getByRole('menuitem', { name: 'Turn into flashcards' }).click()
    await expect(dialog(page).locator('[data-purpose="review-card"]').first()).toBeVisible()
    const box = await dialog(page).boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
  })
})
