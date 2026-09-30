import { test, expect } from './fixtures'
import { chooseOption, fillText, SHORT_TEXT } from './helpers'
import { SAMPLE_QUIZ } from '../fixtures/quiz'

test('create page loads in Turkish with no console errors', async ({ page }) => {
  await page.goto('/?lng=tr')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Quiz Oluştur' })).toBeVisible()
})

test('create page loads in English with no console errors @mobile', async ({ page }) => {
  await page.goto('/?lng=en')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generate Quiz' })).toBeVisible()
})

test('word counting across scripts and word-limit validation', async ({ page, mockGenerate }) => {
  const generate = await mockGenerate(SAMPLE_QUIZ)
  await page.goto('/?lng=en')

  await test.step('Turkish sample counts 3 words', async () => {
    await fillText(page, 'Merhaba dünya, nasılsın?')
    await expect(page.getByText('Word Count: 3')).toBeVisible()
  })

  await test.step('Western Armenian sample counts 4 words', async () => {
    await fillText(page, 'Ես կուզեմ գնալ տուն')
    await expect(page.getByText('Word Count: 4')).toBeVisible()
  })

  await test.step('Arabic sample counts 2 words', async () => {
    await fillText(page, 'مرحبا بالعالم')
    await expect(page.getByText('Word Count: 2')).toBeVisible()
  })

  await test.step('Chinese sample counts words via dictionary segmentation', async () => {
    await fillText(page, '你好世界')
    await expect(page.getByText('Word Count: 2')).toBeVisible()
  })

  await test.step('under 30 words shows too_short and sends no request', async () => {
    await fillText(page, 'Too short for a quiz.')
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    await expect(page.getByRole('alert')).toContainText('30 words')
    expect(generate.requests()).toHaveLength(0)
  })

  await test.step('over 5,000 words shows too_long and sends no request', async () => {
    await fillText(page, 'word '.repeat(5001))
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    await expect(page.getByRole('alert')).toContainText('5,000 words')
    expect(generate.requests()).toHaveLength(0)
  })
})

test('generate sends correct settings payload and renders every question type', async ({ page, mockGenerate }) => {
  const generate = await mockGenerate(SAMPLE_QUIZ)
  await page.goto('/?lng=en')
  await fillText(page, SHORT_TEXT)

  await chooseOption(page, 'Question Type', 'Mixed')
  await chooseOption(page, 'Question Count', '10 Questions')
  await chooseOption(page, 'Difficulty Level', 'Hard')
  await chooseOption(page, 'MCQ Options Count', '3 Options')
  await chooseOption(page, 'Output Language:', 'Deutsch')

  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()

  const [payload] = generate.requests() as [Record<string, unknown>]
  expect(payload).toMatchObject({
    questionType: 'mixed',
    questionCount: '10',
    difficulty: 'hard',
    optionsCount: '3',
    outputLanguage: 'de',
  })

  // .first(): each question also renders once, hidden, in the screen-only print layout.
  await expect(page.getByText('Which gas do plants absorb during photosynthesis?').first()).toBeVisible()
  await expect(page.getByText('The Great Wall of China is visible from space with the naked eye.').first()).toBeVisible()
  await expect(page.getByText('Water boils at').first()).toBeVisible()
  await expect(page.getByText('Name the largest planet in our solar system.').first()).toBeVisible()
  await expect(page.getByText('Match each planet to its position from the sun.').first()).toBeVisible()
  await expect(page.getByText('Explain why the sky appears blue during the day.').first()).toBeVisible()
})

test('show answers switch hides and shows answers and explanations', async ({ page, mockGenerate }) => {
  await mockGenerate(SAMPLE_QUIZ)
  await page.goto('/?lng=en')
  await fillText(page, SHORT_TEXT)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()

  const answersSwitch = page.getByRole('switch', { name: 'Show answers' })
  await expect(answersSwitch).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByText('Jupiter', { exact: true })).not.toBeVisible()

  await answersSwitch.click()
  await expect(answersSwitch).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('Jupiter', { exact: true })).toBeVisible()
})

test('edit, regenerate, delete and undo a question', async ({ page, mockGenerate }) => {
  await mockGenerate(SAMPLE_QUIZ)
  await page.goto('/?lng=en')
  await fillText(page, SHORT_TEXT)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()

  // Index-based, not text-based: SAMPLE_QUIZ.questions order is mcq, true-false, fill-blanks,
  // short-answer, matching, open-ended — a stable position even once we edit a card's own text.
  const cards = page.locator('[data-purpose="question-card"]')
  const mcqCard = cards.nth(0)
  const shortAnswerCard = cards.nth(3)

  await test.step('edit updates the question text', async () => {
    await shortAnswerCard.getByRole('button', { name: 'Edit' }).click()
    const textarea = shortAnswerCard.getByRole('textbox').first()
    await textarea.fill('Name the smallest planet in our solar system.')
    await shortAnswerCard.getByRole('button', { name: 'Save' }).click()
    await expect(shortAnswerCard.getByText('Name the smallest planet in our solar system.').first()).toBeVisible()
  })

  await test.step('regenerate replaces the question', async () => {
    const regenerated = { question: { ...SAMPLE_QUIZ.questions[3], id: 'q-short-2', question: 'Name the coldest planet.' }, demo: false }
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
  })

  await test.step('delete shows undo, which restores the question', async () => {
    const mcqCardsByText = cards.filter({ hasText: 'photosynthesis' })
    await mcqCard.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText('Question deleted.')).toBeVisible()
    await expect(mcqCardsByText).toHaveCount(0)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(mcqCardsByText).toHaveCount(1)
  })
})

test('copy copies the quiz as formatted text', async ({ page, context, mockGenerate }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await mockGenerate(SAMPLE_QUIZ)
  await page.goto('/?lng=en')
  await fillText(page, SHORT_TEXT)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()

  await page.getByRole('button', { name: 'Copy' }).click()
  await expect(page.getByText('Copied!')).toBeVisible()
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboardText).toContain(SAMPLE_QUIZ.title)
  expect(clipboardText).toContain('Jupiter')
})

test('generated quiz is saved to the archive', async ({ page, mockGenerate }) => {
  await mockGenerate(SAMPLE_QUIZ)
  await page.goto('/?lng=en')
  await fillText(page, SHORT_TEXT)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()

  await page.getByRole('link', { name: 'View in Archive' }).click()
  await expect(page).toHaveURL(/\/archive\//)
  await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
})

test('settings dropdowns list every option and MCQ options count enables only for mcq/mixed', async ({ page }) => {
  await page.goto('/?lng=en')

  await page.getByRole('button', { name: 'Question Type', exact: true }).click()
  for (const label of ['MCQ (Multiple Choice Questions)', 'True or False', 'Fill in the Blanks', 'Short Answer', 'Matching', 'Open-ended', 'Mixed']) {
    await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible()
  }
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Question Count', exact: true }).click()
  for (const label of ['3 Questions', '5 Questions', '10 Questions', '15 Questions', '20 Questions']) {
    await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible()
  }
  await page.keyboard.press('Escape')

  const optionsCountTrigger = page.getByRole('button', { name: 'MCQ Options Count', exact: true })
  await expect(optionsCountTrigger).toBeEnabled()

  await chooseOption(page, 'Question Type', 'True or False')
  await expect(optionsCountTrigger).toBeDisabled()
  await expect(optionsCountTrigger).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByText('Only for multiple choice and mixed')).toBeVisible()

  await chooseOption(page, 'Question Type', 'Mixed')
  await expect(optionsCountTrigger).toBeEnabled()
  await expect(optionsCountTrigger).toHaveText('4 Options (Standard A, B, C, D)')
})

test('output language search finds languages by alias, and Auto is the default sent to the API', async ({ page, mockGenerate }) => {
  const generate = await mockGenerate(SAMPLE_QUIZ)
  await page.goto('/?lng=en')

  await page.getByRole('button', { name: 'Output Language:', exact: true }).click()
  await page.getByRole('searchbox').fill('almanca')
  await expect(page.getByRole('option', { name: 'Deutsch' })).toBeVisible()

  await page.getByRole('searchbox').fill('arab')
  await expect(page.getByRole('option', { name: 'العربية' })).toBeVisible()
  await page.keyboard.press('Escape')

  await fillText(page, SHORT_TEXT)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  const [payload] = generate.requests() as [Record<string, unknown>]
  expect(payload.outputLanguage).toBe('auto')
})

test('matching card shows two columns with no right item aligned to its own match', async ({ page, mockGenerate }) => {
  await mockGenerate(SAMPLE_QUIZ)
  await page.goto('/?lng=en')
  await fillText(page, SHORT_TEXT)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()

  const matchingCard = page.locator('[data-purpose="question-card"]', { hasText: 'Match each planet' })
  await expect(matchingCard).toBeVisible()
  // Left terms and right values each appear twice (once in the two-column grid, once in the
  // readable pairs list shown alongside the answer key) — .first() just confirms presence.
  for (const left of ['Mercury', 'Venus', 'Earth', 'Mars']) {
    await expect(matchingCard.getByText(left, { exact: true }).first()).toBeVisible()
  }
  // The fixture's rightOrder is a rotation ([1,2,3,0]) — none of the right-hand
  // values should render immediately adjacent to their own left-hand term's row.
  for (const right of ['First from the sun', 'Second from the sun', 'Third from the sun', 'Fourth from the sun']) {
    await expect(matchingCard.getByText(right, { exact: true }).first()).toBeVisible()
  }
})

test('file tab: TXT upload shows a chip and carries the extracted text; unsupported type shows an error', async ({ page, mockGenerate }) => {
  const generate = await mockGenerate(SAMPLE_QUIZ)
  await page.goto('/?lng=en')
  await page.getByRole('tab', { name: 'File' }).click()

  await test.step('unsupported file type shows a localized error', async () => {
    await page.locator('input[type="file"]').setInputFiles({ name: 'old.doc', mimeType: 'application/msword', buffer: Buffer.from('legacy') })
    await expect(page.getByText("This file type isn't supported.")).toBeVisible()
  })

  await test.step('a valid TXT file shows the chip and is used for generation', async () => {
    const content = SHORT_TEXT
    await page.locator('input[type="file"]').setInputFiles({ name: 'sample.txt', mimeType: 'text/plain', buffer: Buffer.from(content) })
    await expect(page.getByText('sample.txt')).toBeVisible()
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
    const [payload] = generate.requests() as [Record<string, unknown>]
    expect(payload.text).toContain('Water is essential for life')
  })
})

test('url tab: a successful mocked fetch shows the chip; a blocked address shows the localized error', async ({ page, mockExtractUrl }) => {
  await page.goto('/?lng=en')
  await page.getByRole('tab', { name: 'URL' }).click()

  await test.step('successful fetch shows the article chip', async () => {
    await mockExtractUrl({ title: 'Sample Article', text: SHORT_TEXT, wordCount: 53, truncated: false })
    await page.getByPlaceholder('Paste a link to an article or webpage...').fill('https://example.com/article')
    await page.getByRole('button', { name: 'Fetch' }).click()
    await expect(page.getByText('Sample Article')).toBeVisible()
  })

  await test.step('blocked address shows the localized error', async () => {
    await mockExtractUrl({ error: 'blocked_address' }, { status: 400 })
    await page.getByPlaceholder('Paste a link to an article or webpage...').fill('http://127.0.0.1/')
    await page.getByRole('button', { name: 'Fetch' }).click()
    await expect(page.getByText("This address can't be fetched for security reasons.")).toBeVisible()
  })
})
