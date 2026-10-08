import { test, expect } from './fixtures'
import { fillText, SHORT_TEXT } from './helpers'
import { SAMPLE_QUIZ } from '../fixtures/quiz'

const SEEDED_ENTRY = {
  id: 'seeded-hints-1',
  title: SAMPLE_QUIZ.title,
  createdAt: '2026-01-01T00:00:00.000Z',
  source: 'text' as const,
  questionType: 'mixed',
  difficulty: 'medium',
  questionCount: '6',
  optionsCount: null,
  outputLanguage: 'auto',
  sourceText: 'Seeded source text for the archived quiz.',
  quiz: { title: SAMPLE_QUIZ.title, questions: SAMPLE_QUIZ.questions },
}

function cardByText(page: import('@playwright/test').Page, text: string) {
  return page.locator('[data-purpose="question-card"]', { hasText: text })
}

async function openQuiz(page: import('@playwright/test').Page, lng = 'en') {
  await page.goto(`/?lng=${lng}`)
  await fillText(page, SHORT_TEXT)
}

test.describe('Hints switch', () => {
  test('is ON by default, sends includeHints in the request, and shows Hint buttons', async ({ page, mockGenerate }) => {
    const generate = await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page)

    const hintsSwitch = page.getByRole('switch', { name: 'Hints' })
    await expect(hintsSwitch).toHaveAttribute('aria-checked', 'true')

    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()

    const [payload] = generate.requests() as [Record<string, unknown>]
    expect(payload.includeHints).toBe(true)

    const mcqCard = cardByText(page, 'photosynthesis')
    await expect(mcqCard.getByRole('button', { name: 'Hint' })).toBeVisible()
  })

  test('OFF sends includeHints: false and no Hint button appears anywhere', async ({ page, mockGenerate }) => {
    const noHintsQuiz = { ...SAMPLE_QUIZ, questions: SAMPLE_QUIZ.questions.map((q) => ({ ...q, hints: undefined })) }
    const generate = await mockGenerate(noHintsQuiz)
    await openQuiz(page)

    await page.getByRole('switch', { name: 'Hints' }).click()
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()

    const [payload] = generate.requests() as [Record<string, unknown>]
    expect(payload.includeHints).toBe(false)

    await expect(page.getByRole('button', { name: 'Hint' })).toHaveCount(0)
  })
})

test.describe('Hint button and box', () => {
  test('reveals hint 1 then hint 2, then disables with "No more hints"', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    const card = cardByText(page, 'photosynthesis')

    const hintBox = card.locator('[aria-live="polite"]').filter({ hasText: 'plants take in' })
    await expect(hintBox).toHaveCount(0)

    const hintButton = card.getByRole('button', { name: 'Hint' })
    await hintButton.click()
    await expect(card.getByText('Think about what plants take in from the air to make their food.')).toBeVisible()

    const anotherHint = card.getByRole('button', { name: 'Another hint' })
    await expect(anotherHint).toBeVisible()
    await anotherHint.click()
    await expect(card.getByText('Oxygen is what plants release afterward, not what they take in.')).toBeVisible()

    const noMore = card.getByRole('button', { name: 'No more hints' })
    await expect(noMore).toBeVisible()
    await expect(noMore).toBeDisabled()
  })

  test('is hidden when Show answers is ON', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    const card = cardByText(page, 'photosynthesis')
    await expect(card.getByRole('button', { name: 'Hint' })).toBeVisible()

    await page.getByRole('switch', { name: 'Show answers' }).click()
    await expect(card.getByRole('button', { name: 'Hint' })).toHaveCount(0)
  })

  test('is hidden after the student answers correctly', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    const card = cardByText(page, 'photosynthesis')

    await card.getByRole('radio', { name: /Carbon dioxide/ }).check()
    await card.getByRole('button', { name: 'Check answer' }).click()
    await expect(card.getByText('Correct!')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Hint' })).toHaveCount(0)
  })

  test('resets after the question is edited or regenerated', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    const cards = page.locator('[data-purpose="question-card"]')
    const shortAnswerCard = cards.nth(3)

    await test.step('editing a hint resets the reveal state to unrevealed', async () => {
      await shortAnswerCard.getByRole('button', { name: 'Hint' }).click()
      await expect(shortAnswerCard.getByRole('button', { name: 'Another hint' })).toBeVisible()

      await shortAnswerCard.getByRole('button', { name: 'Edit' }).click()
      const hint1Field = shortAnswerCard.getByLabel('Hint 1')
      await hint1Field.fill('Look at the part of the text about the biggest planet.')
      await shortAnswerCard.getByRole('button', { name: 'Save' }).click()

      await expect(shortAnswerCard.getByRole('button', { name: 'Hint' })).toBeVisible()
      await expect(shortAnswerCard.getByText('Look at the part of the text about the biggest planet.')).not.toBeVisible()
    })

    await test.step('regenerating replaces the hints entirely', async () => {
      const regenerated = {
        question: { ...SAMPLE_QUIZ.questions[3], id: 'q-short-2', question: 'Name the coldest planet.', hints: ['A brand new hint.', 'A second new hint.'] },
      }
      await page.route('**/api/generate', async (route) => {
        const body = route.request().postDataJSON()
        if (body?.mode === 'regenerate_one') {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(regenerated) })
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE_QUIZ) })
        }
      })
      await shortAnswerCard.getByRole('button', { name: 'Regenerate' }).click()
      await expect(shortAnswerCard.getByText('Name the coldest planet.').first()).toBeVisible()
      await expect(shortAnswerCard.getByRole('button', { name: 'Hint' })).toBeVisible()
      await shortAnswerCard.getByRole('button', { name: 'Hint' }).click()
      await expect(shortAnswerCard.getByText('A brand new hint.')).toBeVisible()
    })
  })
})

test.describe('Edit form hint fields', () => {
  test('blocks saving a hint that reveals the answer, with a localized message', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    const card = cardByText(page, 'photosynthesis')

    await card.getByRole('button', { name: 'Edit' }).click()
    await card.getByLabel('Hint 1').fill('The correct answer is carbon dioxide.')
    await card.getByRole('button', { name: 'Save' }).click()

    await expect(card.getByText('This hint reveals the answer — please rewrite it.')).toBeVisible()
    // Still in edit mode — the leaking hint was not saved.
    await expect(card.getByLabel('Hint 1')).toHaveValue('The correct answer is carbon dioxide.')

    await card.getByLabel('Hint 1').fill('Think about the gas plants absorb from the air.')
    await card.getByRole('button', { name: 'Save' }).click()
    await expect(card.getByText('This hint reveals the answer — please rewrite it.')).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Edit' })).toBeVisible()
  })
})

test.describe('Turkish and Western Armenian', () => {
  test('Turkish: hints switch and button labels are localized', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page, 'tr')
    await expect(page.getByRole('switch', { name: 'İpucu' })).toHaveAttribute('aria-checked', 'true')

    await page.getByRole('button', { name: 'Quiz Oluştur' }).click()
    const card = cardByText(page, 'photosynthesis')
    await card.getByRole('button', { name: 'İpucu' }).click()
    await expect(card.getByRole('button', { name: 'Bir ipucu daha' })).toBeVisible()
  })

  test('Western Armenian: hints switch and button labels render with no console errors', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page, 'hyw')
    await expect(page.getByRole('switch', { name: 'Հուշումներ' })).toHaveAttribute('aria-checked', 'true')

    await page.getByRole('button', { name: 'Ստեղծել քուիզ' }).click()
    const card = cardByText(page, 'photosynthesis')
    await card.getByRole('button', { name: 'Հուշում' }).click()
    await expect(card.getByRole('button', { name: 'Ուրիշ հուշում մը' })).toBeVisible()
  })
})

test('@mobile hint box and buttons have no horizontal overflow at 390px', async ({ page, mockGenerate }) => {
  await mockGenerate(SAMPLE_QUIZ)
  await openQuiz(page)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  const card = cardByText(page, 'photosynthesis')

  await card.getByRole('button', { name: 'Hint' }).click()
  await card.getByRole('button', { name: 'Another hint' }).click()
  await expect(card.getByText('Oxygen is what plants release afterward, not what they take in.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})
