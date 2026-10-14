import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'

import { SAMPLE_QUIZ } from '../fixtures/quiz'
import { missingCards, quizToCards } from '../../src/lib/quizToCards'
import type { GeneratedQuiz } from '../../src/lib/quiz'
import { seed } from './flashcardHelpers'
import type { SeedCard, SeedDeck } from './flashcardHelpers'
import { NOW, card, cardRows, deckRows, expectNoPageOverflow, gradeByKeyboard, gradeByMouse, loc, openAt, progress, stored } from './fullCardsHelpers'
import { test, expect } from './strict'

// Kartlar — the review session: Leitner dates with a fake clock, the daily new-card limit, the end screens,
// speed with 500 cards, long text, and the quiz / mistakes conversion rules.

const summary = (page: Page) => page.locator('[data-purpose="study-summary"]')
const allDone = (page: Page) => page.locator('[data-purpose="all-done"]')
const nextDue = (page: Page) => page.locator('[data-purpose="next-due"]')

/** Local midnight `days` after Tuesday 2026-03-10. */
const midnight = (days: number) => new Date(2026, 2, 10 + days).getTime()
const at = (day: number, hour = 8, minute = 0, second = 0) => new Date(2026, 2, 10 + day, hour, minute, second)

async function storedCard(page: Page, id: string) {
  const found = (await stored(page)).cards.find((entry) => entry.id === id)
  if (!found) throw new Error(`card ${id} is not in the store`)
  return found
}

test.describe('Kartlar — Leitner dates (fake clock)', () => {
  test('Know moves a card up one box and schedules 1 / 3 / 7 / 16 / 16 days at local midnight', async ({ page }) => {
    await openAt(page, '/flashcards?lng=en')
    const cards: SeedCard[] = [1, 2, 3, 4, 5].map((box) => ({ id: `b${box}`, front: `Box ${box}`, back: `Answer ${box}`, box, reviews: 1 }))
    await seed(page, [{ id: 'leitner', name: 'Leitner', cards }], '/flashcards/leitner/study?lng=en')
    await expect(progress(page)).toHaveText('1 / 5')
    for (let i = 0; i < 5; i++) {
      await gradeByKeyboard(page, true)
      if (i < 4) await expect(progress(page)).toHaveText(`${i + 2} / 5`)
    }
    await expect(summary(page)).toContainText('You knew 5 of 5.')
    await expect(nextDue(page)).toHaveText('Next review: tomorrow')
    await expect(summary(page).getByRole('button', { name: 'Study again' })).toHaveCount(0)

    const expected = [
      { id: 'b1', box: 2, days: 1 },
      { id: 'b2', box: 3, days: 3 },
      { id: 'b3', box: 4, days: 7 },
      { id: 'b4', box: 5, days: 16 },
      { id: 'b5', box: 5, days: 16 },
    ]
    for (const { id, box, days } of expected) {
      const saved = await storedCard(page, id)
      expect({ id, box, due: saved.due, reviews: saved.reviews }, id).toEqual({ id, box, due: midnight(days), reviews: 2 })
    }
  })

  test("Don't know sends any card back to box 1, due again today (0 days), and counts a lapse", async ({ page }) => {
    await openAt(page, '/flashcards?lng=en')
    const cards: SeedCard[] = [2, 3, 4, 5].map((box) => ({ id: `b${box}`, front: `Box ${box}`, back: `Answer ${box}`, box, reviews: 1 }))
    await seed(page, [{ id: 'lapse', name: 'Lapse', cards }], '/flashcards/lapse/study?lng=en')
    await expect(progress(page)).toHaveText('1 / 4')
    for (let i = 0; i < 4; i++) await gradeByMouse(page, false)
    // Each missed card is queued again at the end of the same session.
    await expect(progress(page)).toHaveText('5 / 8')
    for (const box of [2, 3, 4, 5]) {
      const saved = await storedCard(page, `b${box}`)
      expect(saved, `b${box}`).toMatchObject({ box: 1, lapses: 1, reviews: 2 })
      expect(saved.due).toBeGreaterThanOrEqual(NOW.getTime() - 1000)
      expect(saved.due).toBeLessThanOrEqual(NOW.getTime() + 5000)
    }
  })

  test('one card across days: not due a minute before midnight, due at midnight, stays in box 5, a miss starts again', async ({ page }) => {
    await openAt(page, '/flashcards?lng=en', at(0, 14))
    await seed(page, [{ id: 'chain', name: 'Chain', cards: [{ id: 'only', front: 'Q', back: 'A' }] }])
    const studyAt = async (when: Date) => {
      await page.clock.setFixedTime(when)
      await page.goto('/flashcards/chain/study?lng=en')
    }
    const dueOn = async (when: Date, next: string) => {
      await studyAt(when)
      await expect(allDone(page)).toBeVisible()
      await expect(nextDue(page)).toHaveText(`Next review: ${next}`)
    }
    const knowOn = async (when: Date) => {
      await studyAt(when)
      await expect(progress(page)).toHaveText('1 / 1')
      await gradeByKeyboard(page, true)
      await expect(summary(page)).toBeVisible()
    }

    // Day 0: a new card, known -> box 2, back tomorrow.
    await knowOn(at(0, 14))
    await expect.poll(async () => (await storedCard(page, 'only')).due).toBe(midnight(1))
    expect(await storedCard(page, 'only')).toMatchObject({ box: 2, reviews: 1 })
    await dueOn(at(0, 23, 59, 30), 'tomorrow')

    // Day 1, 30 seconds after midnight: due. Known -> box 3, 3 days.
    await knowOn(at(1, 0, 0, 30))
    await expect.poll(async () => (await storedCard(page, 'only')).due).toBe(midnight(4))
    expect((await storedCard(page, 'only')).box).toBe(3)
    await dueOn(at(3, 23, 59, 30), 'tomorrow')

    // Day 4: known -> box 4, 7 days.
    await knowOn(at(4, 8))
    await expect.poll(async () => (await storedCard(page, 'only')).due).toBe(midnight(11))
    expect((await storedCard(page, 'only')).box).toBe(4)
    await dueOn(at(8, 12), 'in 3 days')

    // Day 11: known -> box 5, 16 days.
    await knowOn(at(11, 8))
    await expect.poll(async () => (await storedCard(page, 'only')).due).toBe(midnight(27))
    expect((await storedCard(page, 'only')).box).toBe(5)
    await dueOn(at(26, 12), 'tomorrow')

    // Day 27: known again -> still box 5, 16 more days.
    await knowOn(at(27, 9))
    await expect.poll(async () => (await storedCard(page, 'only')).due).toBe(midnight(43))
    expect(await storedCard(page, 'only')).toMatchObject({ box: 5, reviews: 5 })

    // Day 43: a miss -> box 1, due now, one lapse; known on the repeat -> box 2, tomorrow.
    await studyAt(at(43, 9))
    await expect(progress(page)).toHaveText('1 / 1')
    await gradeByKeyboard(page, false)
    await expect(progress(page)).toHaveText('2 / 2')
    await expect.poll(async () => (await storedCard(page, 'only')).box).toBe(1)
    expect(await storedCard(page, 'only')).toMatchObject({ lapses: 1, reviews: 6 })
    await gradeByKeyboard(page, true)
    await expect(summary(page)).toContainText('You knew 1 of 1.')
    await expect.poll(async () => (await storedCard(page, 'only')).due).toBe(midnight(44))
    expect((await storedCard(page, 'only')).box).toBe(2)
  })
})

test.describe('Kartlar — daily new-card limit', () => {
  test('at most 20 new cards come per day; reviews do not count against it; the next day brings the rest', async ({ page }) => {
    await openAt(page, '/flashcards?lng=en')
    const cards: SeedCard[] = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, front: `Question ${i}`, back: `Answer ${i}` }))
    await seed(page, [{ id: 'thirty', name: 'Thirty', cards }])
    await expect(deckRows(page).first()).toContainText('30 cards · 0 learned · 20 cards to review today')

    await page.goto('/flashcards/thirty/study?lng=en')
    await expect(progress(page)).toHaveText('1 / 20')
    for (let i = 0; i < 20; i++) {
      await gradeByKeyboard(page, true)
      if (i < 19) await expect(progress(page)).toHaveText(`${i + 2} / 20`)
    }
    await expect(summary(page)).toContainText('You knew 20 of 20.')
    await expect(nextDue(page)).toHaveText('Next review: tomorrow')
    await expect(summary(page).getByRole('button', { name: 'Study again' })).toHaveCount(0)
    expect((await stored(page)).cards.filter((entry) => entry.introducedAt !== null)).toHaveLength(20)

    // The same day nothing more is offered.
    await page.goto('/flashcards/thirty/study?lng=en')
    await expect(allDone(page)).toBeVisible()
    await page.goto('/flashcards?lng=en')
    await expect(deckRows(page).first()).toContainText('30 cards · 20 learned')
    await expect(deckRows(page).first()).not.toContainText('to review')

    // The next morning: the 20 reviews are due again and 10 new cards join them.
    await page.clock.setFixedTime(at(1, 8))
    await page.goto('/flashcards?lng=en')
    await expect(deckRows(page).first()).toContainText('30 cards · 20 learned · 30 cards to review today')
    await page.goto('/flashcards/thirty/study?lng=en')
    await expect(progress(page)).toHaveText('1 / 30')
  })

  test('cards already introduced today use up the allowance', async ({ page }) => {
    const tomorrow = midnight(1)
    await openAt(page, '/flashcards?lng=en')
    const introduced: SeedCard[] = Array.from({ length: 15 }, (_, i) => ({ id: `i${i}`, front: `Done ${i}`, back: 'a', box: 2, reviews: 1, due: tomorrow, introducedAt: NOW.getTime() }))
    const fresh: SeedCard[] = Array.from({ length: 25 }, (_, i) => ({ id: `f${i}`, front: `Fresh ${i}`, back: 'a' }))
    await seed(page, [{ id: 'mix', name: 'Mix', cards: [...introduced, ...fresh] }])
    await expect(deckRows(page).first()).toContainText('40 cards · 15 learned · 5 cards to review today')
    await page.goto('/flashcards/mix/study?lng=en')
    await expect(progress(page)).toHaveText('1 / 5')
  })
})

test.describe('Kartlar — session and end screens', () => {
  test('flip, know / don\'t know with keys and buttons, at most three repeats, the end screen lists what to repeat', async ({ page }) => {
    await openAt(page, '/flashcards?lng=en')
    await seed(page, [{ id: 'session', name: 'Session', cards: [{ id: 'a', front: 'Alpha', back: 'one' }, { id: 'b', front: 'Beta', back: 'two' }, { id: 'c', front: 'Gamma', back: 'three' }] }], '/flashcards/session/study?lng=en')
    await expect(progress(page)).toHaveText('1 / 3')
    await expect(card(page)).toHaveAttribute('aria-pressed', 'false')
    // Answering is only possible after the flip.
    await expect(page.getByRole('button', { name: 'Know', exact: true })).toHaveCount(0)
    await page.keyboard.press('2')
    await expect(progress(page)).toHaveText('1 / 3')

    await gradeByKeyboard(page, true) // Alpha
    await expect(progress(page)).toHaveText('2 / 3')
    await gradeByMouse(page, false) // Beta, repeat 1
    await expect(progress(page)).toHaveText('3 / 4')
    await page.keyboard.press('Space') // Gamma
    await expect(card(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('status').filter({ hasText: 'Answer: three' })).toHaveCount(1)
    await page.keyboard.press('ArrowRight')
    await expect(progress(page)).toHaveText('4 / 4')
    await gradeByKeyboard(page, false) // Beta, repeat 2
    await expect(progress(page)).toHaveText('5 / 5')
    await gradeByKeyboard(page, false) // Beta, repeat 3
    await expect(progress(page)).toHaveText('6 / 6')
    await gradeByKeyboard(page, false) // Beta again: no fourth repeat

    await expect(summary(page)).toContainText('Session complete')
    await expect(summary(page)).toContainText('You knew 2 of 3.')
    await expect(summary(page)).toContainText('2/3')
    await expect(summary(page).locator('[data-purpose="summary-repeat"] li')).toHaveText(['Beta'])
    await expect(summary(page)).toContainText(loc('en', 'flashcards.summary.toRepeat_one', { count: 1 }))
    // A missed card is due again right away.
    await expect(nextDue(page)).toHaveText(loc('en', 'flashcards.when.dueNow'))
    await summary(page).getByRole('button', { name: 'Study again' }).click()
    await expect(progress(page)).toHaveText('1 / 1')
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/flashcards\/session$/)

    await page.goBack()
    await expect(progress(page)).toHaveText('1 / 1')
    await gradeByKeyboard(page, true)
    await expect(summary(page)).toContainText('You knew 1 of 1.')
    await expect(summary(page).getByRole('button', { name: 'Study again' })).toHaveCount(0)
    await summary(page).getByRole('link', { name: 'Back to decks' }).click()
    await expect(page).toHaveURL(/\/flashcards$/)
    await expect(deckRows(page).first()).toContainText('3 cards · 3 learned')
  })

  test('the date shown on the end screen is right for tomorrow and for later days', async ({ page }) => {
    await openAt(page, '/flashcards?lng=en')
    await seed(page, [
      { id: 'soon', name: 'Soon', cards: [{ id: 's1', front: 'x', back: 'y', box: 2, reviews: 1, due: midnight(1) }] },
      { id: 'later', name: 'Later', cards: [{ id: 'l1', front: 'x', back: 'y', box: 4, reviews: 3, due: midnight(5) }] },
      { id: 'none', name: 'None', cards: [{ id: 'z1', front: 'x', back: 'y', box: 5, reviews: 9, due: midnight(16) }] },
    ])
    await page.goto('/flashcards/soon/study?lng=en')
    await expect(nextDue(page)).toHaveText('Next review: tomorrow')
    await page.goto('/flashcards/later/study?lng=en')
    await expect(nextDue(page)).toHaveText('Next review: in 5 days')
    await page.goto('/flashcards/none/study?lng=en')
    await expect(nextDue(page)).toHaveText('Next review: in 16 days')
  })
})

test.describe('Kartlar — many cards and long text', () => {
  test('a 500-card deck opens fast, stays responsive, studies 20 new cards and exports 500 rows', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    const cards: SeedCard[] = Array.from({ length: 500 }, (_, i) => ({ id: `k${i}`, front: `Question number ${i}`, back: `Answer number ${i}` }))
    await page.goto('/flashcards?lng=en')
    await seed(page, [{ id: 'big', name: 'Big deck', cards }])
    await expect(deckRows(page).first()).toContainText('500 cards · 0 learned · 20 cards to review today')

    const started = Date.now()
    await page.goto('/flashcards/big?lng=en')
    await expect(page.getByRole('heading', { name: 'Cards (500)' })).toBeVisible()
    await expect(page.getByLabel('Front of card 500', { exact: true })).toBeAttached()
    expect(Date.now() - started, 'the 500-card deck must open in under 8 seconds').toBeLessThan(8000)
    await expect(cardRows(page)).toHaveCount(500)

    // Still responsive: a new card appears at once.
    await page.getByRole('button', { name: 'Add card', exact: true }).click()
    await expect(cardRows(page)).toHaveCount(501)
    await page.getByRole('button', { name: 'Delete card 501' }).click()
    await expect(cardRows(page)).toHaveCount(500)

    const studyStarted = Date.now()
    await page.goto('/flashcards/big/study?lng=en')
    await expect(progress(page)).toHaveText('1 / 20')
    expect(Date.now() - studyStarted, 'study must open in under 5 seconds').toBeLessThan(5000)

    await page.goto('/flashcards/big?lng=en')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()])
    const file = testInfo.outputPath('big.csv')
    await download.saveAs(file)
    const lines = readFileSync(file, 'utf-8').split('\r\n').filter((line) => line !== '')
    expect(lines).toHaveLength(501)
  })

  const LONG_WORDS = 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(6)
  const LONG_BACK = `https://example.com/${'a'.repeat(580)}`
  const WIDE_MATH = `$$${Array.from({ length: 25 }, (_, i) => `x_{${i}}`).join('+')}=0$$`
  const LONG_DECK: SeedDeck = {
    id: 'long',
    name: 'N'.repeat(80),
    cards: [
      { id: 'l1', front: LONG_WORDS, back: LONG_BACK },
      { id: 'l2', front: WIDE_MATH, back: 'A very wide formula must not widen the page.' },
      { id: 'l3', front: 'Many lines', back: Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n') },
    ],
  }

  for (const { width, height, tag } of [
    { width: 1280, height: 800, tag: '' },
    { width: 390, height: 844, tag: '@mobile ' },
  ]) {
    test(`${tag}long text, an 80-character name and a wide formula do not overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await openAt(page, '/flashcards?lng=en')
      await seed(page, [LONG_DECK])

      // List: the name is cut inside its row.
      await expect(deckRows(page)).toHaveCount(1)
      await expectNoPageOverflow(page)
      const rowBox = (await deckRows(page).first().boundingBox())!
      const linkBox = (await deckRows(page).first().locator('a.truncate').boundingBox())!
      expect(linkBox.x + linkBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1)

      // Editor: heading wraps, rows stay inside the screen.
      await page.goto('/flashcards/long?lng=en')
      await expect(cardRows(page)).toHaveCount(3)
      await expectNoPageOverflow(page)
      const heading = page.getByRole('heading', { level: 1 })
      expect(await heading.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      for (const row of await cardRows(page).all()) {
        const box = (await row.boundingBox())!
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
      }

      // Study: the card keeps its size, text wraps inside it, the page never grows sideways.
      await page.goto('/flashcards/long/study?lng=en')
      await expect(card(page)).toBeVisible()
      await expectNoPageOverflow(page)
      const before = (await card(page).boundingBox())!
      expect(before.x).toBeGreaterThanOrEqual(0)
      expect(before.x + before.width).toBeLessThanOrEqual(width + 1)
      const front = page.locator('[data-purpose="flashcard-front"]')
      expect(await front.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), 'long words wrap on the front').toBe(true)
      await card(page).click()
      const back = page.locator('[data-purpose="flashcard-back"]')
      expect(await back.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), 'a link without spaces wraps on the back').toBe(true)
      expect((await card(page).boundingBox())!.height).toBe(before.height)
      await expectNoPageOverflow(page)

      await page.getByRole('button', { name: 'Know', exact: true }).click()
      await expect(progress(page)).toHaveText('2 / 3')
      await expect(front.locator('.katex').first()).toBeVisible()
      await expectNoPageOverflow(page)
      const wide = (await card(page).boundingBox())!
      expect(wide.x + wide.width).toBeLessThanOrEqual(width + 1)
      expect(wide.height).toBe(before.height)

      await gradeByMouse(page, true)
      await expect(progress(page)).toHaveText('3 / 3')
      await card(page).click()
      expect(await back.evaluate((element) => element.scrollHeight > element.clientHeight), 'a long back scrolls inside the card').toBe(true)
      expect((await card(page).boundingBox())!.height).toBe(before.height)
    })
  }
})

test.describe('Kartlar — cards made from a quiz or from mistakes (pure rules)', () => {
  const LABELS = { trueLabel: 'True', falseLabel: 'False', trueFalsePrefix: 'True or false:', matchPrefix: 'What matches:' }
  const quizOf = (questions: unknown[]) => ({ title: SAMPLE_QUIZ.title, questions }) as unknown as GeneratedQuiz
  const sampleQuiz = quizOf(SAMPLE_QUIZ.questions)

  test('every question type maps to a front and a back, matching pairs become one card each', () => {
    expect(quizToCards(sampleQuiz, LABELS)).toEqual([
      { front: 'Which gas do plants absorb during photosynthesis?', back: 'Carbon dioxide' },
      { front: 'True or false: The Great Wall of China is visible from space with the naked eye.', back: 'False — This is a common myth; it is not visible without aid.' },
      { front: 'Water boils at ______ degrees Celsius at sea level.', back: '100' },
      { front: 'Name the largest planet in our solar system.', back: 'Jupiter' },
      { front: 'What matches: Mercury', back: 'First from the sun' },
      { front: 'What matches: Venus', back: 'Second from the sun' },
      { front: 'What matches: Earth', back: 'Third from the sun' },
      { front: 'What matches: Mars', back: 'Fourth from the sun' },
      { front: 'Explain why the sky appears blue during the day.', back: '• Sunlight is scattered by the atmosphere\n• Blue light scatters more because of its shorter wavelength' },
    ])
  })

  test('mistakes: only the wrong questions are converted, in quiz order', () => {
    const cards = quizToCards(sampleQuiz, LABELS, new Set(['q-matching', 'q-mcq']))
    expect(cards.map((entry) => entry.front)).toEqual([
      'Which gas do plants absorb during photosynthesis?',
      'What matches: Mercury',
      'What matches: Venus',
      'What matches: Earth',
      'What matches: Mars',
    ])
    expect(quizToCards(sampleQuiz, LABELS, new Set())).toEqual([])
    expect(quizToCards(sampleQuiz, LABELS, new Set(['unknown-id']))).toEqual([])
  })

  test('the same question twice gives one card; too long text is cut with an ellipsis within the limits', () => {
    const first = SAMPLE_QUIZ.questions[0]
    expect(quizToCards(quizOf([first, { ...first, id: 'copy' }]), LABELS)).toHaveLength(1)
    const long = quizToCards(quizOf([{ ...first, question: 'q'.repeat(400) }]), LABELS)
    expect(long).toHaveLength(1)
    expect(long[0].front).toHaveLength(300)
    expect(long[0].front.endsWith('…')).toBe(true)
  })

  test('cards whose front is already in the deck are left out, ignoring case and spacing', () => {
    const cards = quizToCards(sampleQuiz, LABELS)
    const left = missingCards(cards, ['  which GAS do plants absorb   during photosynthesis? ', 'Not in the quiz'])
    expect(left).toHaveLength(cards.length - 1)
    expect(left.map((entry) => entry.front)).not.toContain('Which gas do plants absorb during photosynthesis?')
    expect(missingCards(cards, [])).toEqual(cards)
  })
})
