import { test, expect } from './fixtures'
import { fillText, SHORT_TEXT } from './helpers'
import { SAMPLE_QUIZ } from '../fixtures/quiz'

const SEEDED_ENTRY = {
  id: 'seeded-answer-check-1',
  title: SAMPLE_QUIZ.title,
  createdAt: '2026-01-01T00:00:00.000Z',
  source: 'text' as const,
  questionType: 'mixed',
  difficulty: 'medium',
  questionCount: '6',
  optionsCount: null,
  studyMode: false,
  outputLanguage: 'auto',
  sourceText: 'Seeded source text for the archived quiz.',
  quiz: { title: SAMPLE_QUIZ.title, questions: SAMPLE_QUIZ.questions },
}

async function openQuiz(page: import('@playwright/test').Page, lng = 'en') {
  await page.goto(`/?lng=${lng}`)
  await fillText(page, SHORT_TEXT)
}

function cardByText(page: import('@playwright/test').Page, text: string) {
  return page.locator('[data-purpose="question-card"]', { hasText: text })
}

test.describe('Show answers is OFF by default and hides answer content for every type', () => {
  test('no correct answers, model answers or explanations leak before a check', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()

    await expect(page.getByRole('switch', { name: 'Show answers' })).toHaveAttribute('aria-checked', 'false')

    const mcqCard = cardByText(page, 'photosynthesis')
    await expect(mcqCard.getByLabel('Correct answer', { exact: true })).toHaveCount(0)
    await expect(mcqCard.getByRole('button', { name: 'Show explanation' })).toHaveCount(0)

    const shortCard = cardByText(page, 'largest planet')
    await expect(shortCard.getByText('Jupiter', { exact: true })).not.toBeVisible()

    const openCard = cardByText(page, 'sky appears blue')
    await expect(openCard.getByText('Sunlight is scattered', { exact: false })).not.toBeVisible()

    // Every type still exposes a usable check button even with answers hidden.
    for (const text of ['photosynthesis', 'Great Wall', 'boils at', 'largest planet', 'sky appears blue']) {
      await expect(cardByText(page, text).getByRole('button', { name: 'Check answer' })).toBeVisible()
    }
  })
})

test.describe('mcq', () => {
  test('is checkable and retryable, and never reveals the correct option on a wrong guess', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    const card = cardByText(page, 'photosynthesis')
    await expect(card.getByRole('button', { name: 'Show explanation' })).toHaveCount(0)

    await card.getByRole('radio', { name: /Nitrogen/ }).check()
    await card.getByRole('button', { name: 'Check answer' }).click()
    await expect(card.getByText('Not yet. Try again.')).toBeVisible()
    await expect(card.getByLabel('Incorrect answer', { exact: true })).toBeVisible()
    await expect(card.getByLabel('Correct answer', { exact: true })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Show explanation' })).toBeVisible()

    await card.getByRole('radio', { name: /Carbon dioxide/ }).check()
    await card.getByRole('button', { name: 'Check answer' }).click()
    await expect(card.getByText('Correct!')).toBeVisible()
    await expect(card.getByLabel('Correct answer', { exact: true })).toBeVisible()
  })
})

test.describe('true/false', () => {
  test('is checkable and retryable', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    const card = cardByText(page, 'Great Wall')

    await card.getByRole('radio', { name: 'True' }).check()
    await card.getByRole('button', { name: 'Check answer' }).click()
    await expect(card.getByText('Not yet. Try again.')).toBeVisible()

    await card.getByRole('radio', { name: 'False' }).check()
    await card.getByRole('button', { name: 'Check answer' }).click()
    await expect(card.getByText('Correct!')).toBeVisible()
  })
})

test.describe('fill in the blank', () => {
  test('checks locally with lenient normalization (spacing, case, acceptable answers) and no AI call', async ({ page, mockGenerate }) => {
    const generate = await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    const card = cardByText(page, 'boils at')
    const input = card.getByLabel('Your answer')
    const checkButton = card.getByRole('button', { name: 'Check answer' })

    let gradeCalled = false
    await page.route('**/api/grade', () => {
      gradeCalled = true
    })

    await input.fill('  100  ')
    await checkButton.click()
    await expect(card.getByText('Correct!')).toBeVisible()

    await input.fill('200')
    await checkButton.click()
    await expect(card.getByText('Not yet. Try again.')).toBeVisible()

    await input.fill('ONE HUNDRED')
    await checkButton.click()
    await expect(card.getByText('Correct!')).toBeVisible()

    expect(gradeCalled).toBe(false)
    expect(generate.requests().length).toBeGreaterThan(0)
  })
})

test.describe('short answer', () => {
  test('matches locally without calling the AI grader when the answer already matches', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    const card = cardByText(page, 'largest planet')

    let gradeCalled = false
    await page.route('**/api/grade', () => {
      gradeCalled = true
    })

    await card.getByLabel('Your answer').fill('jupiter.')
    await card.getByRole('button', { name: 'Check answer' }).click()
    await expect(card.getByText('Correct!')).toBeVisible()
    expect(gradeCalled).toBe(false)
  })

  test('falls back to the AI grader for a second opinion when the local check does not match', async ({ page, mockGenerate, mockGrade }) => {
    await mockGenerate(SAMPLE_QUIZ)
    const grade = await mockGrade({ verdict: 'partial', feedback: 'You named the right planet family.', covered: 1, total: 2 })
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    const card = cardByText(page, 'largest planet')

    await card.getByLabel('Your answer').fill('a big gas giant')
    await card.getByRole('button', { name: 'Check answer' }).click()
    await expect(card.getByText('Partly correct')).toBeVisible()
    await expect(card.getByText('You named the right planet family.')).toBeVisible()
    await expect(card.getByText('1 of 2 key ideas covered')).toBeVisible()

    const [payload] = grade.requests() as [Record<string, unknown>]
    expect(payload).toMatchObject({ type: 'short-answer', studentAnswer: 'a big gas giant', modelAnswer: 'Jupiter' })
  })

  test('shows a localized error with retry when grading fails', async ({ page, mockGenerate, mockGrade }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await mockGrade({ error: 'upstream' }, { status: 502 })
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    const card = cardByText(page, 'largest planet')

    await card.getByLabel('Your answer').fill('a rocky moon')
    await card.getByRole('button', { name: 'Check answer' }).click()
    await expect(card.getByText("Couldn't check your answer. Please try again.")).toBeVisible()
    await expect(card.getByRole('button', { name: 'Try again' })).toBeVisible()
  })
})

test.describe('open-ended', () => {
  test('is always graded by the AI, shows feedback and a coverage counter, and never reveals the model answer', async ({
    page,
    mockGenerate,
    mockGrade,
  }) => {
    await mockGenerate(SAMPLE_QUIZ)
    const grade = await mockGrade({ verdict: 'correct', feedback: 'Nice, you covered the key idea.', covered: 2, total: 2 })
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    const card = cardByText(page, 'sky appears blue')

    const textarea = card.getByLabel('Your answer')
    await textarea.fill('Blue light scatters more in the air because it has a shorter wavelength.')
    await card.getByRole('button', { name: 'Check answer' }).click()
    await expect(card.getByText('Correct!')).toBeVisible()
    await expect(card.getByText('Nice, you covered the key idea.')).toBeVisible()
    await expect(card.getByText('2 of 2 key ideas covered')).toBeVisible()
    await expect(card.getByText('Sunlight is scattered by the atmosphere, and blue light scatters', { exact: false })).not.toBeVisible()

    const [payload] = grade.requests() as [Record<string, unknown>]
    expect(payload).toMatchObject({ type: 'open-ended' })
    expect(payload.keyPoints).toEqual(['Sunlight is scattered by the atmosphere', 'Blue light scatters more because of its shorter wavelength'])
  })

  test('plain Enter inserts a newline; Ctrl+Enter checks the answer', async ({ page, mockGenerate, mockGrade }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await mockGrade({ verdict: 'incorrect', feedback: 'Try mentioning scattering.', covered: 0, total: 2 })
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    const card = cardByText(page, 'sky appears blue')
    const textarea = card.getByLabel('Your answer')

    await textarea.fill('line one')
    await textarea.press('Enter')
    await textarea.pressSequentially('line two')
    await expect(textarea).toHaveValue('line one\nline two')
    await expect(card.getByText('Not yet. Try again.')).toHaveCount(0)

    await textarea.press('Control+Enter')
    await expect(card.getByText('Not yet. Try again.')).toBeVisible()
  })

  test('shows a character counter near the 1,000 character limit', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    const card = cardByText(page, 'sky appears blue')
    const textarea = card.getByLabel('Your answer')

    await expect(card.getByText('/1000')).toHaveCount(0)
    await textarea.fill('a'.repeat(950))
    await expect(card.getByText('950/1000')).toBeVisible()
  })

  test('shows a loading state while grading and disables the check button', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await page.route('**/api/grade', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ verdict: 'correct', feedback: 'Good.', covered: 2, total: 2 }),
      })
    })
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    const card = cardByText(page, 'sky appears blue')

    await card.getByLabel('Your answer').fill('Blue light scatters more.')
    const checkButton = card.getByRole('button', { name: 'Check answer' })
    await checkButton.click()
    await expect(checkButton).toHaveAttribute('aria-busy', 'true')
    await expect(checkButton).toBeDisabled()
    await expect(card.getByText('Correct!')).toBeVisible()
  })
})

test.describe('Show answers ON', () => {
  test('reveals model answers/key ideas while keeping every answer field usable', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    await page.getByRole('switch', { name: 'Show answers' }).click()

    const mcqCard = cardByText(page, 'photosynthesis')
    await expect(mcqCard.getByText('Carbon dioxide', { exact: true }).first()).toBeVisible()
    await expect(mcqCard.getByRole('button', { name: 'Check answer' })).toBeVisible()

    const fillCard = cardByText(page, 'boils at')
    await expect(fillCard.getByText('100', { exact: true })).toBeVisible()
    await expect(fillCard.getByRole('button', { name: 'Check answer' })).toBeVisible()

    const shortCard = cardByText(page, 'largest planet')
    await expect(shortCard.getByText('Jupiter', { exact: true })).toBeVisible()

    const openCard = cardByText(page, 'sky appears blue')
    await expect(openCard.getByText('Sunlight is scattered by the atmosphere', { exact: false })).toBeVisible()

    // Fields stay checkable even with answers shown.
    await fillCard.getByLabel('Your answer').fill('100')
    await fillCard.getByRole('button', { name: 'Check answer' }).click()
    await expect(fillCard.getByText('Correct!')).toBeVisible()
  })
})

test.describe('study mode uses the same checkable, retryable UI as the result view', () => {
  test('mcq and fill-blanks are checkable and retryable in Study Mode', async ({ page, seedArchive }) => {
    await seedArchive([SEEDED_ENTRY])
    await page.goto(`/archive/${SEEDED_ENTRY.id}?lng=en`)
    await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
    await page.getByRole('switch', { name: 'Study Mode' }).click()

    const mcqCard = page.locator('[data-purpose="practice-question-card"]', { hasText: 'photosynthesis' })
    await mcqCard.getByRole('radio', { name: /Oxygen/ }).check()
    await mcqCard.getByRole('button', { name: 'Check answer' }).click()
    await expect(mcqCard.getByText('Not yet. Try again.')).toBeVisible()
    await mcqCard.getByRole('radio', { name: /Carbon dioxide/ }).check()
    await mcqCard.getByRole('button', { name: 'Check answer' }).click()
    await expect(mcqCard.getByText('Correct!')).toBeVisible()

    const fillCard = page.locator('[data-purpose="practice-question-card"]', { hasText: 'boils at' })
    await expect(fillCard.getByRole('button', { name: 'Reveal answer' })).toHaveCount(0)
    await fillCard.getByLabel('Your answer').fill('100')
    await fillCard.getByRole('button', { name: 'Check answer' }).click()
    await expect(fillCard.getByText('Correct!')).toBeVisible()
  })
})

test.describe('localization', () => {
  test('fill-blank checking is localized in Turkish', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page, 'tr')
    await page.getByRole('button', { name: 'Quiz Oluştur' }).click()
    const card = cardByText(page, 'boils at')

    await card.getByLabel('Cevabın').fill('200')
    await card.getByRole('button', { name: 'Cevabı kontrol et' }).click()
    await expect(card.getByText('Henüz değil. Tekrar dene.')).toBeVisible()

    await card.getByLabel('Cevabın').fill('100')
    await card.getByRole('button', { name: 'Cevabı kontrol et' }).click()
    await expect(card.getByText('Doğru!')).toBeVisible()
  })

  test('mcq checking is localized in Western Armenian', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await openQuiz(page, 'hyw')
    await page.getByRole('button', { name: 'Ստեղծել քուիզ' }).click()
    const card = cardByText(page, 'photosynthesis')

    await card.getByRole('radio', { name: /Nitrogen/ }).check()
    await card.getByRole('button', { name: 'Ստուգել պատասխանը' }).click()
    await expect(card.getByText('Դեռ ոչ։ Կրկին փորձէ։')).toBeVisible()
  })
})

test('@mobile open-ended field and result are usable at 390px', async ({ page, mockGenerate, mockGrade }) => {
  await mockGenerate(SAMPLE_QUIZ)
  await mockGrade({ verdict: 'correct', feedback: 'Good.', covered: 2, total: 2 })
  await openQuiz(page)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  const card = cardByText(page, 'sky appears blue')

  const textarea = card.getByLabel('Your answer')
  await expect(textarea).toBeVisible()
  await textarea.fill('Blue light scatters more because of its shorter wavelength.')
  await card.getByRole('button', { name: 'Check answer' }).press('Enter')
  await expect(card.getByText('Correct!')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})

test('keyboard-only: arrow keys move between mcq options, Tab reaches the check button, Enter checks', async ({ page, mockGenerate }) => {
  await mockGenerate(SAMPLE_QUIZ)
  await openQuiz(page)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  const card = cardByText(page, 'photosynthesis')

  await card.getByRole('radio').first().focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(card.getByRole('radio', { name: /Nitrogen/ })).toBeChecked()

  await page.keyboard.press('Tab')
  await expect(card.getByRole('button', { name: 'Check answer' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(card.getByText('Not yet. Try again.')).toBeVisible()
})
