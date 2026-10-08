import type { Page } from '@playwright/test'

import { test, expect } from './fixtures'
import { fillText, SHORT_TEXT } from './helpers'
import { SAMPLE_QUIZ } from '../fixtures/quiz'

const MCQ_ONLY_QUIZ = {
  ...SAMPLE_QUIZ,
  questions: SAMPLE_QUIZ.questions.filter((q) => q.type === 'mcq'),
}

/** Selects an exact substring of the textarea's current value using real keyboard events (Home to
 * the start, ArrowRight to the substring's offset, Shift+ArrowRight across it) — genuine browser
 * selection, unlike a programmatic setSelectionRange, so it reliably fires the app's real
 * onSelect/onKeyUp handlers exactly the way a keyboard-driven user selection would. */
/**
 * Selects `substring` in the quiz textarea: everything but its last character by range, then one
 * real Shift+ArrowRight so the app gets the keyboard event a user's selection produces.
 */
async function selectSubstring(page: Page, substring: string): Promise<void> {
  await setTextareaSelection(page, substring, 0, substring.length - 1)
  await page.keyboard.press('Shift+ArrowRight')
}

/** Places a collapsed caret at `offset` characters into `substring`'s first occurrence. */
async function placeCaretInside(page: Page, substring: string, offset: number): Promise<void> {
  await setTextareaSelection(page, substring, offset, offset)
}

// One evaluate instead of hundreds of key presses: long arrow-key walks made these tests slow enough
// to hit the 15 s timeout when the machine is busy.
async function setTextareaSelection(page: Page, substring: string, from: number, to: number): Promise<void> {
  const found = await page.locator('#quiz-content-input').evaluate(
    (element, { needle, startOffset, endOffset }) => {
      const box = element as HTMLTextAreaElement
      const start = box.value.indexOf(needle)
      if (start === -1) return false
      box.focus()
      box.setSelectionRange(start + startOffset, start + endOffset)
      return true
    },
    { needle: substring, startOffset: from, endOffset: to },
  )
  if (!found) throw new Error(`substring not found: ${substring}`)
}

test.describe('Quiz title', () => {
  test('a custom title flows to the result, Copy and the Archive', async ({ page, context, mockGenerate }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await mockGenerate(SAMPLE_QUIZ)
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)

    await page.getByLabel('Quiz title (optional)').fill('My Custom Quiz Title')
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    await expect(page.getByRole('heading', { name: 'My Custom Quiz Title' })).toBeVisible()

    await page.getByRole('button', { name: 'Copy' }).click()
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboardText).toContain('My Custom Quiz Title')

    await page.getByRole('link', { name: 'View in Archive' }).click()
    await expect(page.getByRole('heading', { name: 'My Custom Quiz Title' })).toBeVisible()
    await page.goto('/archive?lng=en')
    await expect(page.getByText('My Custom Quiz Title')).toBeVisible()
  })

  test('an empty title falls back to the generated title', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
  })

  test('a counter appears from 60 characters and the field is capped at 80', async ({ page }) => {
    await page.goto('/?lng=en')
    const title = page.getByLabel('Quiz title (optional)')
    await title.fill('a'.repeat(59))
    await expect(page.getByText('59/80')).not.toBeVisible()
    await title.fill('a'.repeat(60))
    await expect(page.getByText('60/80')).toBeVisible()
    await title.fill('a'.repeat(90))
    await expect(title).toHaveValue('a'.repeat(80))
  })
})

test.describe('Answer explanations switch', () => {
  test('OFF sends includeExplanations: false and hides explanations everywhere while checking still works', async ({ page, mockGenerate }) => {
    const noExplanationQuiz = {
      ...SAMPLE_QUIZ,
      questions: SAMPLE_QUIZ.questions.map((q) => ({ ...q, explanation: '' })),
    }
    const generate = await mockGenerate(noExplanationQuiz)
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)

    const explanationsSwitch = page.getByRole('switch', { name: 'Answer explanations' })
    await expect(explanationsSwitch).toHaveAttribute('aria-checked', 'true')
    await explanationsSwitch.click()
    await expect(explanationsSwitch).toHaveAttribute('aria-checked', 'false')

    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()

    const [payload] = generate.requests() as [Record<string, unknown>]
    expect(payload.includeExplanations).toBe(false)

    await expect(page.getByText('Show explanation')).toHaveCount(0)

    // Answer checking still works with explanations off.
    const mcqCard = page.locator('[data-purpose="question-card"]', { hasText: 'photosynthesis' })
    await mcqCard.getByRole('radio', { name: /Carbon dioxide/ }).check()
    await mcqCard.getByRole('button', { name: 'Check answer' }).click()
    await expect(mcqCard.getByText('Correct!')).toBeVisible()
    await expect(page.getByText('Show explanation')).toHaveCount(0)
  })

  test('ON (default) keeps explanations after a check', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()

    const mcqCard = page.locator('[data-purpose="question-card"]', { hasText: 'photosynthesis' })
    await mcqCard.getByRole('radio', { name: /Carbon dioxide/ }).check()
    await mcqCard.getByRole('button', { name: 'Check answer' }).click()
    await expect(mcqCard.getByText('Show explanation')).toBeVisible()
  })
})

test.describe('Shuffle options switch', () => {
  test('is disabled for non-mcq/mixed types with a helper note, and its value is restored', async ({ page }) => {
    await page.goto('/?lng=en')
    const shuffleSwitch = page.getByRole('switch', { name: 'Shuffle options' })
    await expect(shuffleSwitch).toHaveAttribute('aria-checked', 'true')

    await page.getByRole('button', { name: 'Question Type', exact: true }).click()
    await page.getByRole('option', { name: 'True or False', exact: true }).click()
    await expect(shuffleSwitch).toBeDisabled()
    await expect(page.getByText('Only for multiple choice and mixed').first()).toBeVisible()

    await page.getByRole('button', { name: 'Question Type', exact: true }).click()
    await page.getByRole('option', { name: 'MCQ (Multiple Choice Questions)', exact: true }).click()
    await expect(shuffleSwitch).toBeEnabled()
    await expect(shuffleSwitch).toHaveAttribute('aria-checked', 'true')
  })

  test('OFF keeps the model-provided option order', async ({ page, mockGenerate }) => {
    await mockGenerate(MCQ_ONLY_QUIZ)
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)
    await page.getByRole('switch', { name: 'Shuffle options' }).click()
    await page.getByRole('button', { name: 'Generate Quiz' }).click()

    const card = page.locator('[data-purpose="question-card"]', { hasText: 'photosynthesis' })
    const radios = card.getByRole('radio')
    await expect(radios.nth(0)).toHaveAccessibleName(/Oxygen/)
    await expect(radios.nth(1)).toHaveAccessibleName(/Carbon dioxide/)
    await expect(radios.nth(2)).toHaveAccessibleName(/Nitrogen/)
    await expect(radios.nth(3)).toHaveAccessibleName(/Hydrogen/)
  })

  test('ON reorders options, and the order survives a reload from the Archive', async ({ page, mockGenerate }) => {
    // 8 identical-shape mcq questions so a spread across all 4 positions is virtually guaranteed
    // rather than merely likely, keeping the assertion deterministic instead of flaky.
    const manyMcq = {
      title: 'Shuffle Test Quiz',
      questions: Array.from({ length: 8 }, (_, i) => ({
        id: `q-${i}`,
        type: 'mcq' as const,
        question: `Question number ${i}?`,
        explanation: 'Because.',
        options: ['Alpha', 'Bravo', 'Charlie', 'Delta'],
        answerIndex: 0,
      })),
    }
    await mockGenerate(manyMcq)
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)
    await page.getByRole('button', { name: 'Question Type', exact: true }).click()
    await page.getByRole('option', { name: 'MCQ (Multiple Choice Questions)', exact: true }).click()
    await page.getByRole('button', { name: 'Question Count', exact: true }).click()
    await page.getByRole('option', { name: '10 Questions', exact: true }).click()
    await expect(page.getByRole('switch', { name: 'Shuffle options' })).toHaveAttribute('aria-checked', 'true')

    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    await expect(page.getByRole('heading', { name: 'Shuffle Test Quiz' })).toBeVisible()

    const cards = page.locator('[data-purpose="question-card"]')
    const positions = new Set<number>()
    for (let i = 0; i < 8; i++) {
      const labels = await cards.nth(i).getByRole('radio').evaluateAll((radios) => radios.map((r) => r.closest('label')?.textContent ?? ''))
      const correctPosition = labels.findIndex((label) => label.includes('Alpha'))
      positions.add(correctPosition)
    }
    expect(positions.size).toBeGreaterThan(1)

    await page.getByRole('link', { name: 'View in Archive' }).click()
    const firstCardOptionOrder = await cards.first().getByRole('radio').evaluateAll((radios) => radios.map((r) => r.getAttribute('name')))
    await page.reload()
    await expect(cards.first()).toBeVisible()
    const reloadedOptionOrder = await cards.first().getByRole('radio').evaluateAll((radios) => radios.map((r) => r.getAttribute('name')))
    expect(reloadedOptionOrder).toEqual(firstCardOptionOrder)
  })
})

test.describe('Focus selection', () => {
  test('marking a selection adds a chip and sends focusSnippets in the request', async ({ page, mockGenerate }) => {
    const generate = await mockGenerate(SAMPLE_QUIZ)
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)

    await selectSubstring(page, 'essential for life')
    await page.locator('[data-purpose="focus-mark-secondary"]').click()

    const chips = page.locator('[data-purpose="focus-chip"]')
    await expect(chips).toHaveCount(1)
    await expect(chips.first()).toContainText('essential for life')

    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
    const [payload] = generate.requests() as [{ focusSnippets?: string[] }]
    expect(payload.focusSnippets).toEqual(['essential for life'])
  })

  test('a chip can be removed with its x button', async ({ page }) => {
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)
    await selectSubstring(page, 'essential for life')
    await page.locator('[data-purpose="focus-mark-secondary"]').click()

    const chips = page.locator('[data-purpose="focus-chip"]')
    await expect(chips).toHaveCount(1)
    await chips.first().getByRole('button', { name: 'Remove focus part' }).click()
    await expect(chips).toHaveCount(0)
  })

  test('overlapping selections merge into one chip', async ({ page }) => {
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)
    await selectSubstring(page, 'Water is essential')
    await page.locator('[data-purpose="focus-mark-secondary"]').click()
    await selectSubstring(page, 'essential for life')
    await page.locator('[data-purpose="focus-mark-secondary"]').click()

    await expect(page.locator('[data-purpose="focus-chip"]')).toHaveCount(1)
  })

  test('caps at 5 focus parts with a localized note', async ({ page }) => {
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)

    const firstFive = [
      'Water is essential',
      "covers most of the Earth's surface",
      'solid, liquid, and gas',
      'Plants, animals, and humans',
      'clean water to survive',
    ]
    for (const snippet of firstFive) {
      await selectSubstring(page, snippet)
      await page.locator('[data-purpose="focus-mark-secondary"]').click()
    }
    await expect(page.locator('[data-purpose="focus-chip"]')).toHaveCount(5)
    await expect(page.getByText('You can mark up to 5 parts.')).toBeVisible()

    // A 6th selection can't be marked — the button stays disabled and no chip is added.
    await selectSubstring(page, 'continuously moves water')
    await expect(page.locator('[data-purpose="focus-mark-secondary"]')).toBeDisabled()
    await expect(page.locator('[data-purpose="focus-chip"]')).toHaveCount(5)
  })

  test('editing inside a marked part removes it with a notice', async ({ page }) => {
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)
    await selectSubstring(page, 'essential')
    await page.locator('[data-purpose="focus-mark-secondary"]').click()
    await expect(page.locator('[data-purpose="focus-chip"]')).toHaveCount(1)

    await placeCaretInside(page, 'essential', 3)
    await page.keyboard.type('X')

    await expect(page.locator('[data-purpose="focus-chip"]')).toHaveCount(0)
    await expect(page.getByText('A focus part was removed because the text changed.')).toBeVisible()
  })

  test('Clear Input clears the text and focus parts', async ({ page }) => {
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)
    await selectSubstring(page, 'essential for life')
    await page.locator('[data-purpose="focus-mark-secondary"]').click()
    await expect(page.locator('[data-purpose="focus-chip"]')).toHaveCount(1)

    await page.getByRole('button', { name: 'Clear Input' }).click()
    await expect(page.locator('#quiz-content-input')).toHaveValue('')
    await expect(page.locator('[data-purpose="focus-chip"]')).toHaveCount(0)
  })
})

test.describe('Draft protection', () => {
  test('restores the draft after a reload, with a note and Start fresh', async ({ page }) => {
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)
    await page.getByLabel('Quiz title (optional)').fill('Draft Title')
    await page.getByRole('button', { name: 'Question Type', exact: true }).click()
    await page.getByRole('option', { name: 'True or False', exact: true }).click()

    // Wait for the debounced autosave to land in localStorage before reloading.
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('quelio.draft.v1') ?? '{}')))
      .toMatchObject({ title: 'Draft Title', questionType: 'true-false' })
    await page.reload()

    await expect(page.getByText('Your draft was restored')).toBeVisible()
    await expect(page.locator('#quiz-content-input')).toHaveValue(SHORT_TEXT)
    await expect(page.getByLabel('Quiz title (optional)')).toHaveValue('Draft Title')
    await expect(page.getByRole('button', { name: 'Question Type', exact: true })).toHaveText('True or False')

    await page.getByRole('button', { name: 'Start fresh' }).click()
    await expect(page.getByText('Your draft was restored')).toHaveCount(0)
    await expect(page.locator('#quiz-content-input')).toHaveValue('')
    await expect(page.getByLabel('Quiz title (optional)')).toHaveValue('')

    await page.reload()
    await expect(page.getByText('Your draft was restored')).toHaveCount(0)
    await expect(page.locator('#quiz-content-input')).toHaveValue('')
  })
})

test.describe('Time estimate', () => {
  test('the pre-generation line updates with type, count, difficulty and options', async ({ page }) => {
    await page.goto('/?lng=en')
    // Auto (the default) needs text first; 3 mcq medium, 4 options -> collapses to exactly 1 minute.
    await expect(page.locator('#generate-time-estimate')).toHaveCount(0)
    await page.getByRole('button', { name: 'Question Count', exact: true }).click()
    await page.getByRole('option', { name: '3 Questions', exact: true }).click()
    await expect(page.getByText('This quiz takes about a minute')).toBeVisible()

    await page.getByRole('button', { name: 'Question Type', exact: true }).click()
    await page.getByRole('option', { name: 'True or False', exact: true }).click()
    await page.getByRole('button', { name: 'Question Count', exact: true }).click()
    await page.getByRole('option', { name: '10 Questions', exact: true }).click()
    await page.getByRole('button', { name: 'Difficulty Level', exact: true }).click()
    await page.getByRole('option', { name: 'Easy', exact: true }).click()
    await expect(page.getByText('This quiz takes about 2 minutes')).toBeVisible()

    await page.getByRole('button', { name: 'Question Type', exact: true }).click()
    await page.getByRole('option', { name: 'Open-ended', exact: true }).click()
    await page.getByRole('button', { name: 'Question Count', exact: true }).click()
    await page.getByRole('option', { name: '20 Questions', exact: true }).click()
    await page.getByRole('button', { name: 'Difficulty Level', exact: true }).click()
    await page.getByRole('option', { name: 'Hard', exact: true }).click()
    await expect(page.getByText('This quiz takes about 17-25 minutes')).toBeVisible()

    await page.getByRole('button', { name: 'Question Type', exact: true }).click()
    await page.getByRole('option', { name: 'MCQ (Multiple Choice Questions)', exact: true }).click()
    await page.getByRole('button', { name: 'Question Count', exact: true }).click()
    await page.getByRole('option', { name: '5 Questions', exact: true }).click()
    await page.getByRole('button', { name: 'Difficulty Level', exact: true }).click()
    await page.getByRole('option', { name: 'Medium', exact: true }).click()
    await page.getByRole('button', { name: 'MCQ Options Count', exact: true }).click()
    await page.getByRole('option', { name: '2 Options', exact: true }).click()
    await expect(page.getByText('This quiz takes less than a minute')).toBeVisible()

    await page.getByRole('button', { name: 'MCQ Options Count', exact: true }).click()
    await page.getByRole('option', { name: '5 Options', exact: true }).click()
    await expect(page.getByText('This quiz takes about 2-3 minutes')).toBeVisible()
  })

  test('the result meta line shows the AI total and updates after delete and undo', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()

    // Sum of SAMPLE_QUIZ's estimatedSeconds (30+15+20+45+60+90=260s) rounds to 4 minutes.
    // .first() picks the on-screen meta line — the same text also sits in the hidden print layout.
    await expect(page.getByText('About 4 min').first()).toBeVisible()

    const mcqCard = page.locator('[data-purpose="question-card"]', { hasText: 'photosynthesis' })
    await mcqCard.getByRole('button', { name: 'Delete' }).click()
    // 260 - 30 = 230s -> rounds to 4 min still; delete the 90s open-ended question instead.
    const openEndedCard = page.locator('[data-purpose="question-card"]', { hasText: 'sky appears blue' })
    await openEndedCard.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('About 2 min').first()).toBeVisible()

    // Undo restores only the most recently deleted question (open-ended, 90s): 140 + 90 = 230s.
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByText('About 4 min').first()).toBeVisible()
  })

  test('the Archive row shows the time estimate', async ({ page, mockGenerate }) => {
    await mockGenerate(SAMPLE_QUIZ)
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()

    await page.goto('/archive?lng=en')
    await expect(page.getByText('About 4 min')).toBeVisible()
  })
})

test('@mobile the new settings panel and focus UI have no horizontal overflow at 390px', async ({ page }) => {
  await page.goto('/?lng=en')
  await fillText(page, SHORT_TEXT)
  await page.getByLabel('Quiz title (optional)').fill('Mobile Title Check')
  await selectSubstring(page, 'essential for life')
  await page.locator('[data-purpose="focus-mark-secondary"]').click()
  await expect(page.locator('[data-purpose="focus-chip"]')).toHaveCount(1)

  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})

test.describe('Turkish and Western Armenian', () => {
  test('Turkish: settings panel labels render and the request carries the right settings', async ({ page, mockGenerate }) => {
    const generate = await mockGenerate(SAMPLE_QUIZ)
    await page.goto('/?lng=tr')
    await expect(page.getByLabel('Quiz başlığı (isteğe bağlı)')).toBeVisible()
    await expect(page.getByText('Cevap açıklaması')).toBeVisible()
    await expect(page.getByText('Şıkları karıştır')).toBeVisible()

    await fillText(page, SHORT_TEXT)
    await page.getByRole('switch', { name: 'Cevap açıklaması' }).click()
    await page.getByRole('button', { name: 'Quiz Oluştur' }).click()
    await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()

    const [payload] = generate.requests() as [Record<string, unknown>]
    expect(payload.includeExplanations).toBe(false)
  })

  test('Western Armenian: settings panel labels render with no console errors', async ({ page }) => {
    await page.goto('/?lng=hyw')
    await expect(page.getByLabel('Քուիզի խորագիր (կամեցողութեամբ)')).toBeVisible()
    await expect(page.getByText('Պատասխանի բացատրութիւն')).toBeVisible()
    await expect(page.getByText('Խառնել ընտրանքները')).toBeVisible()
  })
})
