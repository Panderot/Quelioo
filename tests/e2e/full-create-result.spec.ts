import type { Page } from '@playwright/test'

import { SAMPLE_QUIZ } from '../fixtures/quiz'
import { readStore } from './flashcardHelpers'
import { chooseOption, fillText, SHORT_TEXT } from './helpers'
import { test, expect } from './strict'

// Create, the generated quiz (mocked AI answer): preview, edit, delete, Save, Archive, Study mode, Print / PDF with answer key,
// quiz to flashcards. Settings -> request and error paths: full-create.spec.ts.

const generateButton = (page: Page) => page.getByRole('button', { name: 'Generate Quiz' })
const result = (page: Page) => page.locator('[data-purpose="quiz-result"]')
const cards = (page: Page) => page.locator('[data-purpose="question-card"]')
const navTo = (page: Page, label: RegExp) => page.locator('[data-purpose="top-nav"], [data-purpose="tab-bar"]').getByRole('link', { name: label }).click()

async function createQuiz(page: Page) {
  await page.goto('/?lng=en')
  await fillText(page, SHORT_TEXT)
  await chooseOption(page, 'Question Type', 'Mixed')
  await generateButton(page).click()
  await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
}

test.describe('Generated quiz: preview and edit', () => {
  test('preview shows the title, a summary line and one card per question; answers are checked in the page', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await createQuiz(page)

    await expect(result(page).getByText(/6 Questions/)).toBeVisible()
    await expect(cards(page)).toHaveCount(SAMPLE_QUIZ.questions.length)
    await expect(result(page).getByRole('link', { name: 'View in Archive' })).toBeVisible()

    const mcq = cards(page).nth(0)
    await mcq.getByRole('radio', { name: /Nitrogen/ }).check()
    await mcq.getByRole('button', { name: 'Check answer' }).click()
    await expect(mcq.getByText('Not yet. Try again.')).toBeVisible()
    await mcq.getByRole('radio', { name: /Carbon dioxide/ }).check()
    await mcq.getByRole('button', { name: 'Check answer' }).click()
    await expect(mcq.getByText('Correct!')).toBeVisible()

    const trueFalse = cards(page).nth(1)
    await trueFalse.getByRole('radio', { name: /^False/ }).check()
    await trueFalse.getByRole('button', { name: 'Check answer' }).click()
    await expect(trueFalse.getByText('Correct!')).toBeVisible()
  })

  test('title edit, question edit and delete are saved to the Archive entry; Cancel changes nothing', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await createQuiz(page)

    await test.step('title: Cancel keeps it, Save renames it', async () => {
      await result(page).getByRole('button', { name: 'Edit title' }).click()
      await result(page).getByLabel('Edit title').fill('Thrown away')
      await result(page).getByRole('button', { name: 'Cancel' }).first().click()
      await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()

      await result(page).getByRole('button', { name: 'Edit title' }).click()
      await result(page).getByLabel('Edit title').fill('Plants quiz')
      await result(page).getByRole('button', { name: 'Save' }).first().click()
      await expect(page.getByRole('heading', { name: 'Plants quiz' })).toBeVisible()
    })

    await test.step('question: Cancel keeps the text, Save changes it', async () => {
      const shortAnswer = cards(page).nth(3)
      await shortAnswer.getByRole('button', { name: 'Edit' }).click()
      await shortAnswer.getByRole('textbox').first().fill('Thrown away too')
      await shortAnswer.getByRole('button', { name: 'Cancel' }).click()
      await expect(shortAnswer.getByText('Name the largest planet in our solar system.').first()).toBeVisible()

      await shortAnswer.getByRole('button', { name: 'Edit' }).click()
      await shortAnswer.getByRole('textbox').first().fill('Name the smallest planet in our solar system.')
      await shortAnswer.getByRole('button', { name: 'Save' }).click()
      await expect(shortAnswer.getByText('Name the smallest planet in our solar system.').first()).toBeVisible()
    })

    await test.step('delete the first question', async () => {
      await cards(page).nth(0).getByRole('button', { name: 'Delete' }).click()
      await expect(page.getByText('Question deleted.')).toBeVisible()
      await expect(cards(page)).toHaveCount(SAMPLE_QUIZ.questions.length - 1)
    })

    await test.step('the Archive entry has the changes', async () => {
      await result(page).getByRole('link', { name: 'View in Archive' }).click()
      await expect(page).toHaveURL(/\/archive\/[^?]+$/)
      await expect(page.getByRole('heading', { name: 'Plants quiz' })).toBeVisible()
      await expect(page.getByText('Name the smallest planet in our solar system.').first()).toBeVisible()
      await expect(page.getByText('Which gas do plants absorb during photosynthesis?')).toHaveCount(0)
      await expect(cards(page)).toHaveCount(SAMPLE_QUIZ.questions.length - 1)
    })
  })
})

test.describe('Generated quiz: Archive, Study mode, Print / PDF, cards', () => {
  test('the quiz appears in the Archive list, once, and its Study button opens Study mode', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await createQuiz(page)

    await navTo(page, /^Archive/)
    const rows = page.locator('[data-purpose="archive-list"] > li')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText(SAMPLE_QUIZ.title)
    await expect(rows.first()).toContainText('6 Questions')

    await rows.first().getByRole('link', { name: `Study — ${SAMPLE_QUIZ.title}` }).click()
    await expect(page).toHaveURL(/\/archive\/[^?]+\?mode=study/)
    await expect(page.locator('[data-purpose="study-start"]')).toBeVisible()
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.locator('[data-purpose="study-question"]')).toBeVisible()
  })

  test('Print / PDF: the dialog offers both sheets, the answer key holds the answers, Print calls the browser print once', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await createQuiz(page)
    await page.evaluate(() => {
      const holder = window as unknown as { __prints: number }
      holder.__prints = 0
      window.print = () => {
        holder.__prints++
      }
    })

    await page.getByRole('button', { name: 'Print / PDF' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('radio', { name: 'Question sheet' })).toHaveAttribute('aria-checked', 'true')

    await dialog.getByRole('radio', { name: 'With answer key' }).click()
    await expect(dialog.getByRole('radio', { name: 'With answer key' })).toHaveAttribute('aria-checked', 'true')
    await page.emulateMedia({ media: 'print' })
    const answerKey = page.locator('[data-print-answer-key]')
    await expect(answerKey).toBeVisible()
    await expect(answerKey).toContainText('Answer Key')
    await expect(answerKey).toContainText('Jupiter')
    await expect(answerKey).toContainText('Carbon dioxide')
    await page.emulateMedia({ media: 'screen' })

    await dialog.getByRole('button', { name: 'Print', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1)
  })

  test('Print / PDF: the question sheet variant has no answer key', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await createQuiz(page)
    await page.getByRole('button', { name: 'Print / PDF' }).click()
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('[data-print-only]')).toBeVisible()
    await expect(page.locator('[data-print-answer-key]')).toHaveCount(0)
    await page.emulateMedia({ media: 'screen' })
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('the quiz is turned into flashcards and the mistakes into a second deck', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await createQuiz(page)
    const more = result(page).getByRole('button', { name: 'More', exact: true })

    await test.step('whole quiz to a new deck named after it', async () => {
      await more.click()
      await page.getByRole('menuitem', { name: 'Turn into flashcards' }).click()
      const dialog = page.locator('[data-purpose="add-cards-dialog"]')
      await expect(dialog.locator('[data-purpose="convert-deck-name"]')).toHaveValue(SAMPLE_QUIZ.title)
      await expect(dialog.locator('[data-purpose="review-card"]').first()).toBeVisible()
      await dialog.getByRole('button', { name: /^Add \d+ cards?$/ }).click()
      await expect(dialog.getByRole('status')).toContainText(`to “${SAMPLE_QUIZ.title}”.`)
      await dialog.getByRole('link', { name: 'Open deck' }).click()
      await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title, level: 1 })).toBeVisible()
      const stored = await readStore(page)
      expect(stored.decks).toEqual([expect.objectContaining({ name: SAMPLE_QUIZ.title })])
      expect(stored.cards.length).toBeGreaterThan(0)
    })

    await test.step('a first-attempt mistake goes to "{title} · Mistakes"', async () => {
      await navTo(page, /^Create/)
      const mcq = cards(page).nth(0)
      await mcq.getByRole('radio', { name: /Nitrogen/ }).check()
      await mcq.getByRole('button', { name: 'Check answer' }).click()
      await result(page).getByRole('button', { name: 'More', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Flashcards from my mistakes (1)' }).click()
      await expect(page.locator('[data-purpose="mistakes-result"]')).toContainText(`Added 1 card to “${SAMPLE_QUIZ.title} · Mistakes”.`)
    })
  })

  test('@mobile the result actions can be used at the phone width without sideways scrolling', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await createQuiz(page)
    for (const name of ['Copy', 'Print / PDF', 'More']) await expect(result(page).getByRole('button', { name, exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await result(page).getByRole('button', { name: 'Print / PDF' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Print', exact: true })).toBeInViewport()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  })
})
