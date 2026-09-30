import { test, expect } from './fixtures'
import { fillText, SHORT_TEXT } from './helpers'
import { SAMPLE_QUIZ } from '../fixtures/quiz'

const SEEDED_ENTRY = {
  id: 'seeded-matching-1',
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

// The fixture's matching question has rightOrder [1,2,3,0], so the correct student answer
// (left number -> displayed letter) is 1-D, 2-A, 3-B, 4-C. See tests/fixtures/quiz.ts.
const CORRECT_ANSWER = '1-D, 2-A, 3-B, 4-C'

async function openMatchingCard(page: import('@playwright/test').Page) {
  await page.goto('/?lng=en')
  await fillText(page, SHORT_TEXT)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
  return page.locator('[data-purpose="question-card"]', { hasText: 'Match each planet' })
}

test('matching card: answer field hidden state, no marks or explanation before a check', async ({ page, mockGenerate }) => {
  await mockGenerate(SAMPLE_QUIZ)
  const card = await openMatchingCard(page)

  await expect(card.getByPlaceholder('Write your matches, e.g. 1-A, 2-B, 3-C')).toBeVisible()
  await expect(card.getByRole('button', { name: 'Check answer' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Show explanation' })).toHaveCount(0)
})

test('matching card: accepts many input formats and grades correctly', async ({ page, mockGenerate }) => {
  await mockGenerate(SAMPLE_QUIZ)
  const card = await openMatchingCard(page)
  const input = card.getByPlaceholder('Write your matches, e.g. 1-A, 2-B, 3-C')
  const checkButton = card.getByRole('button', { name: 'Check answer' })

  const formats = ['1-D, 2-A, 3-B, 4-C', '1D 2A 3B 4C', '1=D\n2=A\n3=B\n4=C', 'd-1, a-2, b-3, c-4']
  for (const format of formats) {
    await test.step(`format: ${JSON.stringify(format)}`, async () => {
      await input.fill(format)
      await checkButton.click()
      await expect(card.getByText('Correct!')).toBeVisible()
      await input.fill('')
    })
  }
})

test('matching card: incomplete and unreadable input never count as wrong', async ({ page, mockGenerate }) => {
  await mockGenerate(SAMPLE_QUIZ)
  const card = await openMatchingCard(page)
  const input = card.getByPlaceholder('Write your matches, e.g. 1-A, 2-B, 3-C')
  const checkButton = card.getByRole('button', { name: 'Check answer' })

  await test.step('unreadable input shows format hint, not a wrong result', async () => {
    await input.fill('not a matching answer')
    await checkButton.click()
    await expect(card.getByText('Use a number and a letter like 1-A, 2-B.')).toBeVisible()
    await expect(card.getByText('Not quite. Check the marked pairs and try again.')).toHaveCount(0)
  })

  await test.step('incomplete input shows a count hint, not a wrong result', async () => {
    await input.fill('1-D, 2-A')
    await checkButton.click()
    await expect(card.getByText('Write all 4 matches.')).toBeVisible()
    await expect(card.getByText('Not quite. Check the marked pairs and try again.')).toHaveCount(0)
  })

  await expect(card.getByRole('button', { name: 'Show explanation' })).toHaveCount(0)
})

test('matching card: wrong answer shows per-pair marks, unlocks explanation, and can be retried', async ({ page, mockGenerate }) => {
  await mockGenerate(SAMPLE_QUIZ)
  const card = await openMatchingCard(page)
  const input = card.getByPlaceholder('Write your matches, e.g. 1-A, 2-B, 3-C')
  const checkButton = card.getByRole('button', { name: 'Check answer' })

  await test.step('a wrong answer shows the incorrect line and per-pair marks, never revealing letters', async () => {
    await input.fill('1-A, 2-B, 3-C, 4-D')
    await checkButton.click()
    await expect(card.getByText('Not quite. Check the marked pairs and try again.')).toBeVisible()
    await expect(card.getByLabel('Incorrect match').first()).toBeVisible()
    // Wrong-answer state must not reveal the answer key line (that only appears with Show answers on).
    await expect(card.getByText('1 → D', { exact: false })).toHaveCount(0)
  })

  await test.step('the explanation link unlocks after the first check, even though it was wrong', async () => {
    await card.getByRole('button', { name: 'Show explanation' }).click()
    await expect(card.getByText('Planet order from the sun: Mercury, Venus, Earth, Mars.')).toBeVisible()
  })

  await test.step('editing the answer and rechecking updates the result', async () => {
    await input.fill(CORRECT_ANSWER)
    await checkButton.click()
    await expect(card.getByText('Correct!')).toBeVisible()
    await expect(card.getByLabel('Correct match').first()).toBeVisible()
  })
})

test('matching card: Show answers on reveals the answer key with → N badges and leaves the input usable', async ({ page, mockGenerate }) => {
  await mockGenerate(SAMPLE_QUIZ)
  const card = await openMatchingCard(page)

  await page.getByRole('switch', { name: 'Show answers' }).click()
  await expect(card.getByText('1 → D · 2 → A · 3 → B · 4 → C')).toBeVisible()
  await expect(card.getByText('→ 2', { exact: true })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Show explanation' })).toBeVisible()

  const input = card.getByPlaceholder('Write your matches, e.g. 1-A, 2-B, 3-C')
  await input.fill(CORRECT_ANSWER)
  await card.getByRole('button', { name: 'Check answer' }).click()
  await expect(card.getByText('Correct!')).toBeVisible()
})

test('matching card: Enter without Shift checks the answer', async ({ page, mockGenerate }) => {
  await mockGenerate(SAMPLE_QUIZ)
  const card = await openMatchingCard(page)
  const input = card.getByPlaceholder('Write your matches, e.g. 1-A, 2-B, 3-C')

  await input.fill(CORRECT_ANSWER)
  await input.press('Enter')
  await expect(card.getByText('Correct!')).toBeVisible()
})

test('study mode: matching uses the check field directly (no Reveal answer) and auto-grades', async ({ page, seedArchive }) => {
  await seedArchive([SEEDED_ENTRY])
  await page.goto(`/archive/${SEEDED_ENTRY.id}?lng=en`)
  await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()

  await page.getByRole('switch', { name: 'Study Mode' }).click()
  const card = page.locator('[data-purpose="practice-question-card"]', { hasText: 'Match each planet' })
  await expect(card.getByRole('button', { name: 'Reveal answer' })).toHaveCount(0)

  const input = card.getByPlaceholder('Write your matches, e.g. 1-A, 2-B, 3-C')
  await input.fill('1-A, 2-B, 3-C, 4-D')
  await card.getByRole('button', { name: 'Check answer' }).click()
  await expect(card.getByText('Not quite. Check the marked pairs and try again.')).toBeVisible()

  await input.fill(CORRECT_ANSWER)
  await card.getByRole('button', { name: 'Check answer' }).click()
  await expect(card.getByText('Correct!')).toBeVisible()
})

test('matching card: localized in Turkish', async ({ page, mockGenerate }) => {
  await mockGenerate(SAMPLE_QUIZ)
  await page.goto('/?lng=tr')
  await fillText(page, SHORT_TEXT)
  await page.getByRole('button', { name: 'Quiz Oluştur' }).click()
  const card = page.locator('[data-purpose="question-card"]', { hasText: 'Match each planet' })
  await expect(card).toBeVisible()

  const input = card.getByPlaceholder('Eşleştirmelerini yaz, örn. 1-A, 2-B, 3-C')
  const checkButton = card.getByRole('button', { name: 'Cevabı kontrol et' })
  await expect(input).toBeVisible()
  await expect(checkButton).toBeVisible()

  await input.fill('1-A')
  await checkButton.click()
  await expect(card.getByText('4 eşleştirmenin hepsini yaz.')).toBeVisible()

  await input.fill(CORRECT_ANSWER)
  await checkButton.click()
  await expect(card.getByText('Doğru!')).toBeVisible()
})

test('matching card: localized in Western Armenian', async ({ page, mockGenerate }) => {
  await mockGenerate(SAMPLE_QUIZ)
  await page.goto('/?lng=hyw')
  await fillText(page, SHORT_TEXT)
  await page.getByRole('button', { name: 'Ստեղծել քուիզ' }).click()
  const card = page.locator('[data-purpose="question-card"]', { hasText: 'Match each planet' })
  await expect(card).toBeVisible()

  const input = card.getByPlaceholder('Գրէ քու զուգակցումներդ, օրինակ՝ 1-A, 2-B, 3-C')
  const checkButton = card.getByRole('button', { name: 'Ստուգել պատասխանը' })
  await expect(input).toBeVisible()
  await expect(checkButton).toBeVisible()

  await input.fill('nope')
  await checkButton.click()
  await expect(card.getByText('Գործածէ թիւ մը եւ տառ մը՝ ինչպէս 1-A, 2-B։')).toBeVisible()

  await input.fill('1-A, 2-B, 3-C, 4-D')
  await checkButton.click()
  await expect(card.getByText('Լման ճիշդ չէ։ Նշուած զոյգերը ստուգէ ու կրկին փորձէ։')).toBeVisible()
})

test('@mobile matching card check field and result are usable at 390px', async ({ page, mockGenerate }) => {
  await mockGenerate(SAMPLE_QUIZ)
  const card = await openMatchingCard(page)
  const input = card.getByPlaceholder('Write your matches, e.g. 1-A, 2-B, 3-C')

  await expect(input).toBeVisible()
  await input.fill(CORRECT_ANSWER)
  await card.getByRole('button', { name: 'Check answer' }).click()
  await expect(card.getByText('Correct!')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})
