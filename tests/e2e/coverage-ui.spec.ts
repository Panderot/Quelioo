import type { Page } from '@playwright/test'

import { test, expect } from './fixtures'
import { fillText } from './helpers'
import type { ArchiveEntry } from '../../src/lib/archive'

// Mocked UI checks for full fact coverage: Auto as the default count (numbers still listed, the
// estimate line), the "{n}/{m} key facts covered" line and its panel (labels only while answers are
// hidden), "Add questions for missing facts", the remaining-facts quiz when the maximum count is
// reached, delete/undo/regenerate/edit updates, older Archive entries and drafts, en/tr/hyw, 390px.

const TEXT =
  'Photosynthesis is the process by which green plants make their own food. It needs carbon dioxide, water and light. It takes place in the chloroplasts of leaf cells. Glucose is stored as starch. Plants use the stored starch later when they need energy for growth and repair.'

const FACTS = [
  { id: 1, label: 'Definition', statement: 'Photosynthesis is how green plants make their own food.', span: 'Photosynthesis is the process…', importance: 'core', position: 0 },
  { id: 2, label: 'Inputs', statement: 'Photosynthesis needs carbon dioxide, water and light.', span: 'It needs carbon dioxide, water and light.', importance: 'core', position: 0.25, items: ['carbon dioxide', 'water', 'light'] },
  { id: 3, label: 'Location', statement: 'It takes place in the chloroplasts.', span: 'It takes place in the chloroplasts of leaf cells.', importance: 'core', position: 0.5 },
  { id: 4, label: 'Storage', statement: 'Glucose is stored as starch.', span: 'Glucose is stored as starch.', importance: 'supporting', position: 0.75 },
]

const fill = (id: string, question: string, answer: string, factIds: number[], factItems?: Record<string, number[]>) => ({
  id,
  type: 'fill-blanks',
  question,
  explanation: '',
  answer,
  acceptableAnswers: [answer],
  factIds,
  ...(factItems ? { factItems } : {}),
})

const QUIZ = {
  title: 'Photosynthesis',
  questions: [
    fill('q1', 'The process by which green plants make their own food is ___.', 'photosynthesis', [1]),
    fill('q2', 'The gas plants take from the air to make food is ___.', 'carbon dioxide', [2], { '2': [0] }),
    fill('q3', 'The liquid raw material plants take from the soil is ___.', 'water', [2], { '2': [1] }),
    fill('q4', 'Food is made inside the ___ of leaf cells.', 'chloroplasts', [3]),
  ],
  coverage: { version: 1, facts: FACTS },
  requestedCount: 4,
  incomplete: false,
}

const ADDED = [
  fill('m1', 'Without energy from the sun, in the form of ___, plants cannot make food.', 'light', [2], { '2': [2] }),
  fill('m2', 'Plants keep their extra sugar as ___.', 'starch', [4]),
]

/** One route for /api/generate that answers by mode and records every request. */
async function mockByMode(page: Page, responses: Record<string, unknown>) {
  const requests: Record<string, unknown>[] = []
  await page.route('**/api/generate', async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    requests.push(body)
    const response = responses[String(body.mode ?? 'generate')]
    await route.fulfill({ status: response ? 200 : 400, contentType: 'application/json', body: JSON.stringify(response ?? { error: 'not_supported' }) })
  })
  return requests
}

const line = (page: Page) => page.getByTestId('coverage-line')
const facts = (page: Page) => page.locator('[data-purpose="coverage-fact"]')

test('Auto is the default, the estimate handles it, and the coverage line and panel follow every change', async ({ page }) => {
  const requests = await mockByMode(page, {
    generate: QUIZ,
    cover_missing: { questions: ADDED, replaced: [] },
    regenerate_one: { question: fill('r2', 'Plants take in this gas through their leaves: ___.', 'carbon dioxide', [2], { '2': [0] }) },
  })
  await page.goto('/?lng=en')

  const countTrigger = page.getByRole('button', { name: 'Question Count', exact: true })
  await expect(countTrigger).toContainText('Auto (cover everything)')
  await countTrigger.click()
  for (const label of ['Auto (cover everything)', '3 Questions', '5 Questions', '10 Questions', '15 Questions', '20 Questions']) {
    await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible()
  }
  await page.keyboard.press('Escape')

  // No text yet: no estimate; with text, the count is guessed from the word count.
  await expect(page.locator('#generate-time-estimate')).toHaveCount(0)
  await fillText(page, TEXT)
  await expect(page.locator('#generate-time-estimate')).toHaveText(/^About \d+ questions · This quiz takes/)

  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  await expect(line(page)).toHaveText('2/4 key facts covered')
  expect(requests[0]).toMatchObject({ mode: 'generate', questionCount: 'auto' })

  // Panel: labels with question numbers and status (icon + text); statements only with Show answers.
  await line(page).click()
  await expect(line(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(facts(page)).toHaveCount(4)
  await expect(facts(page).nth(0)).toContainText('Definition')
  await expect(facts(page).nth(0)).toContainText('Covered')
  await expect(facts(page).nth(0)).toContainText('Question 1')
  await expect(facts(page).nth(1)).toContainText('Partly covered')
  await expect(facts(page).nth(1)).toContainText('Questions 2, 3')
  await expect(facts(page).nth(3)).toContainText('Missing')
  await expect(facts(page).nth(3)).toContainText('Not asked yet')
  await expect(page.locator('[data-purpose="coverage-statement"]')).toHaveCount(0)
  await expect(page.getByText('Turn on Show answers to see each fact.')).toBeVisible()
  await page.getByRole('switch', { name: 'Show answers' }).click()
  await expect(page.locator('[data-purpose="coverage-statement"]').nth(1)).toHaveText('Photosynthesis needs carbon dioxide, water and light.')

  // Add questions for missing facts: only the missing ones are requested, then appended.
  await page.getByRole('button', { name: 'Add questions for missing facts' }).click()
  await expect(line(page)).toHaveText('4/4 key facts covered')
  await expect(page.locator('[data-purpose="question-card"]')).toHaveCount(6)
  const addRequest = requests.find((request) => request.mode === 'cover_missing')!
  expect(addRequest.missing).toEqual([{ id: 2, items: [2] }, { id: 4 }])
  expect((addRequest.plan as unknown[]).length).toBe(4)
  expect(addRequest.existingCount).toBe(4)
  await expect(page.getByRole('button', { name: 'Add questions for missing facts' })).toHaveCount(0)

  // Delete makes its fact missing, undo restores it.
  const card = (index: number) => page.locator('[data-purpose="question-card"]').nth(index)
  await card(3).getByRole('button', { name: 'Delete' }).click()
  await expect(line(page)).toHaveText('3/4 key facts covered')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(line(page)).toHaveText('4/4 key facts covered')

  // Regenerate keeps the question's facts (sent with their plan entries) and re-verifies.
  await card(1).getByRole('button', { name: 'Regenerate' }).click()
  await expect(card(1)).toContainText('Plants take in this gas through their leaves')
  const regenerate = requests.find((request) => request.mode === 'regenerate_one')!
  expect(regenerate).toMatchObject({ factIds: [2], factItems: { '2': [0] } })
  expect((regenerate.plan as { id: number }[]).map((entry) => entry.id)).toEqual([2])
  await expect(line(page)).toHaveText('4/4 key facts covered')

  // An edited question keeps its facts, counted as covered with an "edited" state.
  await card(0).getByRole('button', { name: 'Edit' }).click()
  await card(0).getByRole('button', { name: 'Save' }).click()
  await expect(facts(page).nth(0)).toContainText('Covered · edited')
  await expect(line(page)).toHaveText('4/4 key facts covered')

  // The Archive entry stores the plan, factIds and the coverage state; its view shows the line too.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('quelio.archive.v1') ?? '[]') as ArchiveEntry[])
  expect(stored[0].quiz.coverage?.facts.map((entry) => entry.label)).toEqual(['Definition', 'Inputs', 'Location', 'Storage'])
  expect(stored[0].quiz.questions[0]).toMatchObject({ factIds: [1], edited: true })
  await page.getByRole('link', { name: 'View in Archive' }).click()
  await expect(line(page)).toHaveText('4/4 key facts covered')
})

test('@cross a cached plan of the same source is reused', async ({ page, seedArchive }) => {
  await seedArchive([
    {
      id: 'earlier',
      title: 'Earlier',
      createdAt: '2026-01-01T00:00:00.000Z',
      source: 'text',
      questionType: 'fill-blanks',
      difficulty: 'medium',
      questionCount: 'auto',
      optionsCount: null,
      outputLanguage: 'auto',
      sourceText: TEXT,
      quiz: { title: 'Earlier', questions: QUIZ.questions, coverage: QUIZ.coverage } as never,
    },
  ])
  const requests = await mockByMode(page, { generate: QUIZ })
  await page.goto('/?lng=en')
  await fillText(page, TEXT)
  await page.getByRole('button', { name: 'Generate Quiz' }).click()
  await expect(line(page)).toBeVisible()
  expect((requests[0].plan as { id: number }[]).map((entry) => entry.id)).toEqual([1, 2, 3, 4])
})

test('@cross when the maximum count is reached, the remaining facts become a new quiz "{title} · 2"', async ({ page, seedArchive }) => {
  // 30 questions on facts 1-3 (all list items); fact 4 needs one more question than the maximum allows.
  const thirty = Array.from({ length: 30 }, (_, index) => fill(`f${index}`, `Fact question ${index} about the source ___.`, `answer${index}`, [1 + (index % 3)]))
  await seedArchive([
    {
      id: 'full',
      title: 'Big quiz',
      createdAt: '2026-01-02T00:00:00.000Z',
      source: 'text',
      questionType: 'fill-blanks',
      difficulty: 'medium',
      questionCount: 'auto',
      optionsCount: null,
      outputLanguage: 'en',
      sourceText: TEXT,
      sourceHash: 'abc',
      quiz: { title: 'Big quiz', questions: thirty, coverage: QUIZ.coverage } as never,
    },
  ])
  const requests = await mockByMode(page, {
    generate: { title: 'Storage', questions: [ADDED[1]], coverage: { version: 1, facts: [FACTS[3]] }, requestedCount: 1, incomplete: false },
  })
  await page.goto('/archive/full?lng=en')
  await expect(line(page)).toHaveText('3/4 key facts covered')
  await line(page).click()
  await expect(page.getByText('This quiz has no room for more questions, so they go into a new quiz.')).toBeVisible()
  await page.getByRole('button', { name: 'Add questions for missing facts' }).click()

  await expect(page).toHaveURL(/\/archive\/(?!full)[^/?]+/)
  await expect(page.getByRole('heading', { name: 'Big quiz · 2' })).toBeVisible()
  await expect(line(page)).toHaveText('1/1 key facts covered')
  expect(requests[0]).toMatchObject({ mode: 'generate', questionCount: 'auto', onlyFactIds: [4] })
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('quelio.archive.v1') ?? '[]') as ArchiveEntry[])
  expect(stored.map((entry) => entry.title).sort()).toEqual(['Big quiz', 'Big quiz · 2'])
})

test('older Archive entries without coverage show no line; older drafts keep their numeric count', async ({ page, seedArchive }) => {
  await seedArchive([
    {
      id: 'old',
      title: 'Old quiz',
      createdAt: '2025-01-01T00:00:00.000Z',
      source: 'text',
      questionType: 'fill-blanks',
      difficulty: 'easy',
      questionCount: '3',
      optionsCount: null,
      quiz: { title: 'Old quiz', questions: [{ id: 'o1', type: 'fill-blanks', question: 'Plants make ___.', explanation: '', answer: 'food' }] } as never,
    },
  ])
  await page.addInitScript(() => {
    localStorage.setItem('quelio.draft.v1', JSON.stringify({ textValue: 'Some draft text', questionCount: '10', questionType: 'mcq' }))
  })
  await page.goto('/archive/old?lng=en')
  await expect(page.getByRole('heading', { name: 'Old quiz' })).toBeVisible()
  await expect(line(page)).toHaveCount(0)

  await page.goto('/?lng=en')
  await expect(page.getByRole('button', { name: 'Question Count', exact: true })).toContainText('10 Questions')
})

for (const [lng, expected] of [
  ['tr', { line: '2/4 ana bilgi soruldu', partial: 'Kısmen soruldu', missing: 'Eksik', add: 'Eksik bilgiler için soru ekle', auto: 'Otomatik (tüm metni kapsa)' }],
  ['hyw', { line: '2/4 հիմնական տեղեկութիւն հարցուեցաւ', partial: 'Մասամբ հարցուած', missing: 'Պակաս', add: 'Պակաս տեղեկութիւններուն համար հարցումներ աւելցնել', auto: 'Ինքնաշխատ (ամբողջ բնագիրը ընդգրկէ)' }],
] as const) {
  test(`coverage line and panel in ${lng}`, async ({ page, seedArchive }) => {
    await seedArchive([
      {
        id: `cov-${lng}`,
        title: 'Fotosentez',
        createdAt: '2026-01-03T00:00:00.000Z',
        source: 'text',
        questionType: 'fill-blanks',
        difficulty: 'medium',
        questionCount: 'auto',
        optionsCount: null,
        outputLanguage: 'auto',
        sourceText: TEXT,
        quiz: { title: 'Fotosentez', questions: QUIZ.questions, coverage: QUIZ.coverage } as never,
      },
    ])
    await page.goto(`/archive/cov-${lng}?lng=${lng}`)
    await expect(line(page)).toHaveText(expected.line)
    await line(page).click()
    await expect(facts(page).nth(1)).toContainText(expected.partial)
    await expect(facts(page).nth(3)).toContainText(expected.missing)
    await expect(page.getByRole('button', { name: expected.add })).toBeVisible()
    await page.goto(`/?lng=${lng}`)
    await expect(page.getByRole('button', { name: /./ }).filter({ hasText: expected.auto }).first()).toBeVisible()
  })
}

test('390px @mobile: the panel opens as a dialog and nothing scrolls sideways', async ({ page, seedArchive }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedArchive([
    {
      id: 'mobile',
      title: 'Photosynthesis',
      createdAt: '2026-01-04T00:00:00.000Z',
      source: 'text',
      questionType: 'fill-blanks',
      difficulty: 'medium',
      questionCount: 'auto',
      optionsCount: null,
      outputLanguage: 'en',
      sourceText: TEXT,
      quiz: { title: 'Photosynthesis', questions: QUIZ.questions, coverage: QUIZ.coverage } as never,
    },
  ])
  await page.goto('/archive/mobile?lng=en')
  await line(page).click()
  const dialog = page.getByRole('dialog', { name: 'Key facts' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[data-purpose="coverage-fact"]')).toHaveCount(4)
  const box = await dialog.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(hasHorizontalScroll).toBe(false)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toHaveCount(0)
})
