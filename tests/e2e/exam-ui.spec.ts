import { unzipSync, strFromU8 } from 'fflate'

import { test, expect } from './fixtures'
import { EXAM_SOURCE, EXAM_SOURCE_LONG, EXAM_SOURCE_SHORT, fakeFacts, mockExamApi, seedExams, storedExams } from './examHelpers'
import { sampleExam } from '../fixtures/exam'
import { SAMPLE_QUIZ } from '../fixtures/quiz'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import tr from '../../src/i18n/locales/tr.json' with { type: 'json' }
import hyw from '../../src/i18n/locales/hyw.json' with { type: 'json' }

// Written exam UI on the fake backend (browser-local store). AI requests are mocked; real accounts and
// database rules are covered by tests/supabase/exams.spec.ts.

const questionCards = (page: import('@playwright/test').Page) => page.locator('[data-purpose="exam-question"]')

/** A real mouse drag: press, nudge so the browser starts the drag, then glide onto the target. */
async function dragOnto(page: import('@playwright/test').Page, handle: import('@playwright/test').Locator, target: import('@playwright/test').Locator) {
  await handle.scrollIntoViewIfNeeded()
  const from = (await handle.boundingBox())!
  const to = (await target.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 4, from.y + from.height / 2 + 12, { steps: 4 })
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 })
  await page.mouse.up()
}

async function fillSource(page: import('@playwright/test').Page, text = EXAM_SOURCE) {
  const box = page.locator('#quiz-content-input')
  await box.click()
  await box.fill(text)
}

async function createViaForm(page: import('@playwright/test').Page, setupId = 'form1') {
  await page.goto(`/exams/new?d=${setupId}&lng=en`)
  await fillSource(page)
  await page.locator('[data-purpose="exam-generate"]').click()
  await expect(page).toHaveURL(/\/exams\/[0-9a-f-]{36}$/)
  await expect(questionCards(page).first()).toBeVisible()
}

test('the sidebar has Written Exam right after Live Game and the page explains it', async ({ page }) => {
  await page.goto('/exams?lng=en')
  await expect(page.getByRole('heading', { name: 'Written Exam', exact: true })).toBeVisible()
  const labels = await page.locator('[data-purpose="sidebar-navigation"] a').allInnerTexts()
  const trimmed = labels.map((label) => label.trim()).filter(Boolean)
  const live = trimmed.indexOf('Live Game')
  expect(live).toBeGreaterThanOrEqual(0)
  expect(trimmed[live + 1]).toBe('Written Exam')
  await expect(page.getByRole('heading', { name: 'Written Exam', exact: true })).toBeVisible()
  await expect(page.locator('[data-purpose="exam-new"]')).toBeVisible()
  await expect(page.locator('[data-purpose="exam-empty"]')).toBeVisible()
})

test('creating an exam: defaults, counts per type respected, total 100, header remembered for the next one', async ({ page }) => {
  const api = await mockExamApi(page)
  await page.goto('/exams/new?d=a1&lng=en')

  // Defaults.
  await expect(page.locator('#exam-count-open-ended')).toHaveValue('5')
  await expect(page.locator('#exam-count-short-answer')).toHaveValue('5')
  await expect(page.locator('#exam-count-true-false')).toHaveValue('5')
  await expect(page.locator('#exam-count-mcq')).toHaveValue('5')
  await expect(page.locator('#exam-count-fill-blanks')).toHaveValue('0')
  await expect(page.locator('#exam-count-matching')).toHaveValue('0')
  await expect(page.locator('#exam-duration')).toHaveValue('40')
  await expect(page.locator('#exam-mix-easy')).toHaveValue('30')
  await expect(page.locator('#exam-mix-medium')).toHaveValue('50')
  await expect(page.locator('#exam-mix-hard')).toHaveValue('20')
  await expect(page.getByLabel('Teacher name (optional)')).toHaveValue('')

  await page.getByLabel('School name').fill('Ataturk Anatolian High School')
  await page.getByLabel('Teacher name (optional)').fill('Ayşe Çelik')
  await page.getByLabel('Course', { exact: true }).fill('Biyoloji')
  await page.locator('#exam-count-short-answer').fill('2')
  await page.locator('#exam-count-mcq').fill('7')
  await page.locator('#exam-count-matching').fill('1')
  await fillSource(page)
  await page.locator('[data-purpose="exam-generate"]').click()
  await expect(page).toHaveURL(/\/exams\/[0-9a-f-]{36}$/)

  // 5 open + 2 short + 5 t/f + 7 mcq + 1 matching = 20.
  await expect(questionCards(page)).toHaveCount(20)
  const stored = (await storedExams(page))[0]
  const counts: Record<string, number> = {}
  for (const question of stored.questions) counts[question.type] = (counts[question.type] ?? 0) + 1
  expect(counts).toEqual({ 'open-ended': 5, 'short-answer': 2, 'true-false': 5, mcq: 7, matching: 1 })
  expect(stored.questions.reduce((sum, question) => sum + question.points, 0)).toBe(100)
  expect(stored.sourceText).toContain('Fotosentez')
  await expect(page.locator('[data-purpose="exam-total"]')).toContainText('100 / 100')

  // Every request was one of the exam modes, each section at most 6 questions, type counts match the request.
  const sections = api.calls().filter((call) => call.mode === 'exam_section')
  expect(sections.length).toBeGreaterThanOrEqual(5)
  for (const call of sections) expect(call.count).toBeLessThanOrEqual(6)
  const requested: Record<string, number> = {}
  for (const call of sections) requested[String(call.type)] = (requested[String(call.type)] ?? 0) + Number(call.count)
  expect(requested).toEqual(counts)

  // The next form starts clean (no old source) but remembers the teacher's header.
  await page.goto('/exams/new?d=a2&lng=en')
  await expect(page.getByLabel('School name')).toHaveValue('Ataturk Anatolian High School')
  await expect(page.getByLabel('Teacher name (optional)')).toHaveValue('Ayşe Çelik')
  await expect(page.locator('#quiz-content-input')).toHaveValue('')
  await expect(page.locator('#exam-count-mcq')).toHaveValue('5')
})

test('points: editing breaks the total, the button spreads them to 100', async ({ page }) => {
  await seedExams(page, [sampleExam()])
  await page.goto('/exams/7b1f6a52-3c1e-4c52-9a53-0d3b2f2a9c01?lng=en')
  const total = page.locator('[data-purpose="exam-total"]')
  await expect(total).toContainText('100 / 100')
  await page.locator('[data-purpose="exam-points"]').first().fill('15')
  await expect(total).toContainText('105 / 100')
  await expect(page.getByText('The points add up to 105; they must add up to 100.')).toBeVisible()
  await page.locator('[data-purpose="exam-redistribute"]').click()
  await expect(total).toContainText('100 / 100')
  const points = await page.locator('[data-purpose="exam-points"]').evaluateAll((inputs) => inputs.map((input) => Number((input as HTMLInputElement).value)))
  expect(points.reduce((a, b) => a + b, 0)).toBe(100)
  expect(points.every((value) => Number.isInteger(value) && value >= 1)).toBe(true)
})

test('editor: edit, reorder (buttons, keyboard, drag), delete with confirmation, add, undo, autosave survives a reload', async ({ page }) => {
  // Tall window: the question cards are tall and a mouse drag cannot leave the window.
  await page.setViewportSize({ width: 1280, height: 3400 })
  await seedExams(page, [sampleExam()])
  await page.goto('/exams/7b1f6a52-3c1e-4c52-9a53-0d3b2f2a9c01?lng=en')
  await expect(questionCards(page)).toHaveCount(22)
  const stems = () => page.locator('[data-purpose="exam-stem"]').evaluateAll((areas) => areas.map((area) => (area as HTMLTextAreaElement).value))

  // Edit a stem.
  const firstStem = page.locator('[data-purpose="exam-stem"]').first()
  await firstStem.fill('Bu soruyu öğretmen değiştirdi')
  await expect(page.locator('[data-purpose="exam-save-state"]')).toHaveAttribute('data-state', 'saved')

  // Reorder with the buttons.
  const before = await stems()
  await page.locator('[data-purpose="exam-move-down"]').first().click()
  expect((await stems()).slice(0, 2)).toEqual([before[1], before[0]])
  // ... and with the keyboard (focus the button, press Enter).
  const up = page.locator('[data-purpose="exam-move-up"]').nth(1)
  await up.focus()
  await page.keyboard.press('Enter')
  expect((await stems()).slice(0, 2)).toEqual([before[0], before[1]])
  // Alt+ArrowDown on the drag handle.
  await page.locator('[data-purpose="exam-drag-handle"]').first().focus()
  await page.keyboard.press('Alt+ArrowDown')
  expect((await stems()).slice(0, 2)).toEqual([before[1], before[0]])
  // Mouse: drag the first card's handle onto the third card.
  const afterKeyboard = await stems()
  await dragOnto(page, page.locator('[data-purpose="exam-drag-handle"]').first(), questionCards(page).nth(2))
  const afterDrag = await stems()
  expect(afterDrag[2]).toBe(afterKeyboard[0])

  // Delete asks first; Cancel keeps it.
  await page.locator('[data-purpose="exam-delete-question"]').first().click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(questionCards(page)).toHaveCount(22)
  await page.locator('[data-purpose="exam-delete-question"]').first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(questionCards(page)).toHaveCount(21)
  await expect(page.locator('[data-purpose="exam-total"]')).not.toContainText('100 / 100')

  // Add a question by hand.
  await page.locator('#exam-add-type').selectOption('mcq')
  await page.locator('[data-purpose="exam-add-question"]').click()
  await expect(questionCards(page)).toHaveCount(22)

  // Undo takes the addition back, then the deletion.
  await page.locator('[data-purpose="exam-undo"]').click()
  await expect(questionCards(page)).toHaveCount(21)
  await page.locator('[data-purpose="exam-undo"]').click()
  await expect(questionCards(page)).toHaveCount(22)

  // Autosave: reload keeps the order and the edit.
  const expected = await stems()
  await expect(page.locator('[data-purpose="exam-save-state"]')).toHaveAttribute('data-state', 'saved')
  await page.reload()
  await expect(questionCards(page)).toHaveCount(22)
  expect(await stems()).toEqual(expected)
})

test('regenerating one question makes one small AI request and keeps its points; a rubric can be generated', async ({ page }) => {
  const exam = sampleExam({ sourceText: EXAM_SOURCE })
  exam.questions[0] = { ...exam.questions[0], rubric: [] }
  await seedExams(page, [exam])
  const api = await mockExamApi(page)
  await page.goto('/exams/7b1f6a52-3c1e-4c52-9a53-0d3b2f2a9c01?lng=en')
  await expect(questionCards(page)).toHaveCount(22)

  await page.locator('[data-purpose="exam-rubric-generate"]').first().click()
  await expect(page.locator('[data-purpose="exam-rubric-sum"]').first()).toContainText('10 / 10')
  expect(api.calls().map((call) => call.mode)).toEqual(['exam_rubric'])

  await page.locator('[data-purpose="exam-regenerate"]').nth(1).click()
  await expect(page.locator('[data-purpose="exam-stem"]').nth(1)).toHaveValue(/Yeniden üretilen soru/)
  expect(api.calls().map((call) => call.mode)).toEqual(['exam_rubric', 'exam_question'])
  await expect(page.locator('[data-purpose="exam-total"]')).toContainText('100 / 100')
})

test('regenerate is unavailable without a source text', async ({ page }) => {
  await seedExams(page, [sampleExam({ sourceText: '' })])
  await page.goto('/exams/7b1f6a52-3c1e-4c52-9a53-0d3b2f2a9c01?lng=en')
  await expect(page.locator('[data-purpose="exam-regenerate"]').first()).toBeDisabled()
})

test('groups A and B: the preview offers group B and the key', async ({ page }) => {
  await seedExams(page, [sampleExam()])
  await page.goto('/exams/7b1f6a52-3c1e-4c52-9a53-0d3b2f2a9c01?lng=en')
  await expect(page.locator('[data-purpose="exam-preview-groupB"]')).toBeVisible()
  await page.locator('[data-purpose="exam-preview-groupB"]').click()
  await expect(page.locator('[data-purpose="exam-paper"]')).toContainText('B GRUBU')
  await page.locator('[data-purpose="exam-preview-exam"]').click()
  await expect(page.locator('[data-purpose="exam-paper"]')).toContainText('A GRUBU')
  await page.locator('[data-purpose="exam-preview-key"]').click()
  await expect(page.locator('[data-purpose="exam-paper"]')).toContainText('CEVAP ANAHTARI')
  await expect(page.locator('[data-purpose="exam-print-b"]')).toBeVisible()
  // Turning groups off hides the B tab and button.
  await page.locator('[data-purpose="exam-details"] summary').click()
  await page.getByLabel('Groups A and B').uncheck()
  await expect(page.locator('[data-purpose="exam-preview-groupB"]')).toHaveCount(0)
  await expect(page.locator('[data-purpose="exam-print-b"]')).toHaveCount(0)
})

test('"Turn into written exam" from the Archive makes no AI request', async ({ page, seedArchive }) => {
  await seedArchive([
    {
      id: 'seeded-1',
      title: SAMPLE_QUIZ.title,
      createdAt: '2026-01-01T00:00:00.000Z',
      source: 'text',
      questionType: 'mixed',
      difficulty: 'medium',
      questionCount: String(SAMPLE_QUIZ.questions.length),
      optionsCount: null,
      outputLanguage: 'auto',
      sourceText: 'Seeded source text.',
      quiz: { title: SAMPLE_QUIZ.title, questions: SAMPLE_QUIZ.questions },
    },
  ])
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url())
  })
  await page.goto('/archive?lng=en')
  await page.getByRole('button', { name: `Turn into written exam — ${SAMPLE_QUIZ.title}` }).click()
  await expect(page).toHaveURL(/\/exams\/[0-9a-f-]{36}$/)
  await expect(questionCards(page)).toHaveCount(SAMPLE_QUIZ.questions.length)
  await expect(page.locator('[data-purpose="exam-total"]')).toContainText('100 / 100')
  expect(requests).toEqual([])
  const stored = (await storedExams(page))[0]
  expect(stored.sourceQuizId).toBe('seeded-1')

  // The quiz detail page has the same action.
  await page.goto('/archive/seeded-1?lng=en')
  await expect(page.getByRole('button', { name: 'Turn into written exam' })).toBeVisible()
})

test('list actions: rename, duplicate, delete with an in-app confirmation', async ({ page }) => {
  await seedExams(page, [sampleExam()])
  await page.goto('/exams?lng=en')
  const items = page.locator('[data-purpose="exam-item"]')
  await expect(items).toHaveCount(1)
  await expect(items.first()).toContainText('Biyoloji')
  await expect(items.first()).toContainText('22 questions')

  await items.first().locator('[data-purpose="exam-rename"]').click()
  await page.getByLabel('Exam name').fill('Benim sınavım')
  await page.keyboard.press('Enter')
  await expect(items.first().locator('[data-purpose="exam-open"]')).toHaveText('Benim sınavım')

  await items.first().locator('[data-purpose="exam-duplicate"]').click()
  await expect(items).toHaveCount(2)
  await expect(page.getByText('Benim sınavım (copy)')).toBeVisible()

  let nativeDialogs = 0
  page.on('dialog', async (dialog) => {
    nativeDialogs += 1
    await dialog.dismiss()
  })
  await items.first().locator('[data-purpose="exam-delete"]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  await expect(items).toHaveCount(2)
  await items.first().locator('[data-purpose="exam-delete"]').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(items).toHaveCount(1)
  expect(nativeDialogs).toBe(0)
})

test('Word download: the file has the exam text, points and Turkish letters', async ({ page }) => {
  await seedExams(page, [sampleExam()])
  await page.goto('/exams/7b1f6a52-3c1e-4c52-9a53-0d3b2f2a9c01?lng=en')
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-purpose="exam-docx"]').click()])
  expect(download.suggestedFilename()).toBe('Biyoloji-10-Sinif-Yazili-A-Grubu.docx')
  const path = await download.path()
  const { readFileSync } = await import('node:fs')
  const files = unzipSync(new Uint8Array(readFileSync(path)))
  const xml = strFromU8(files['word/document.xml'])
  expect(xml).toContain('(10 puan)')
  expect(xml).toContain('ğüşıöçİ')
  expect(xml).toContain('ATATÜRK ANADOLU LİSESİ')
  expect(xml).toMatch(/w:cantSplit|w:keepLines|w:keepNext/)
  expect(xml).toContain('<m:oMath>')

  // The key (both groups, since groups are on) starts on its own page and has a part for each group.
  const [keyDownload] = await Promise.all([page.waitForEvent('download'), page.locator('[data-purpose="exam-docx-key"]').click()])
  const keyFiles = unzipSync(new Uint8Array(readFileSync(await keyDownload.path())))
  const keyXml = strFromU8(keyFiles['word/document.xml'])
  expect(keyXml).toMatch(/w:br w:type="page"|w:pageBreakBefore/)
  expect(keyXml).toContain('A GRUBU')
  expect(keyXml).toContain('B GRUBU')
})

test('opening Print saves first and opens the print view of the saved copy', async ({ page, context }) => {
  await seedExams(page, [sampleExam()])
  await page.goto('/exams/7b1f6a52-3c1e-4c52-9a53-0d3b2f2a9c01?lng=en')
  await page.getByLabel('Exam name').fill('Yazdırılacak sınav')
  const [popup] = await Promise.all([context.waitForEvent('page'), page.locator('[data-purpose="exam-print"]').click()])
  await expect(popup).toHaveURL(/\/exams\/7b1f6a52-3c1e-4c52-9a53-0d3b2f2a9c01\/print\?part=exam&group=A$/)
  await expect(popup.locator('[data-purpose="exam-paper"]')).toContainText('A GRUBU')
  await popup.close()
})

test('signed out: the exam pages need sign-in and no AI request is made', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('quelio.fake.signedOut.v1', '1'))
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url())
  })
  for (const path of ['/exams', '/exams/new?d=x', '/exams/7b1f6a52-3c1e-4c52-9a53-0d3b2f2a9c01', '/exams/7b1f6a52-3c1e-4c52-9a53-0d3b2f2a9c01/print']) {
    await page.goto(path)
    await expect(page).toHaveURL((url) => url.pathname === '/sign-in')
  }
  expect(requests).toEqual([])
})

test('a failed or timed-out generation shows an error, saves nothing and can be retried', async ({ page }) => {
  await page.goto('/exams/new?d=f1&lng=en')
  await fillSource(page)
  // 1) The server fails.
  await page.route('**/api/generate', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"upstream"}' }))
  await page.locator('[data-purpose="exam-generate"]').click()
  await expect(page.locator('[data-purpose="exam-generate-error"]')).toContainText('The exam could not be made. Nothing was saved')
  expect(await storedExams(page)).toEqual([])
  // 2) A gateway timeout (not JSON).
  await page.unroute('**/api/generate')
  await page.route('**/api/generate', (route) => route.fulfill({ status: 504, contentType: 'text/plain', body: 'An error occurred' }))
  await page.locator('[data-purpose="exam-retry"]').click()
  await expect(page.locator('[data-purpose="exam-generate-error"]')).toBeVisible()
  expect(await storedExams(page)).toEqual([])
  await expect(page).toHaveURL(/\/exams\/new/)
  // 3) Retry works once the server is back.
  await page.unroute('**/api/generate')
  await mockExamApi(page)
  await page.locator('[data-purpose="exam-retry"]').click()
  await expect(page).toHaveURL(/\/exams\/[0-9a-f-]{36}$/)
  expect((await storedExams(page)).length).toBe(1)
})

test('a retry after a failed section only repeats the sections that failed', async ({ page }) => {
  await page.goto('/exams/new?d=f2&lng=en')
  await page.locator('#exam-count-open-ended').fill('0')
  await page.locator('#exam-count-short-answer').fill('0')
  await page.locator('#exam-count-mcq').fill('0')
  await page.locator('#exam-count-true-false').fill('3')
  await page.locator('#exam-count-fill-blanks').fill('3')
  await fillSource(page)
  let attempt = 0
  const types: string[] = []
  await page.route('**/api/generate', async (route) => {
    const payload = route.request().postDataJSON() as { mode: string; type: string; count: number }
    if (payload.mode === 'exam_plan') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ facts: fakeFacts(payload.count) }) })
      return
    }
    if (payload.mode === 'exam_verify') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ wrong: [], fixes: [], same: [] }) })
      return
    }
    types.push(payload.type)
    if (payload.type === 'fill-blanks' && attempt === 0) {
      attempt += 1
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"upstream"}' })
      return
    }
    const { fakeQuestion } = await import('./examHelpers')
    const questions = Array.from({ length: payload.count }, (_, index) => fakeQuestion(payload.type as never, `${payload.type}-${index}`))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions }) })
  })
  await page.locator('[data-purpose="exam-generate"]').click()
  await expect(page.locator('[data-purpose="exam-retry"]')).toBeVisible()
  await page.locator('[data-purpose="exam-retry"]').click()
  await expect(page).toHaveURL(/\/exams\/[0-9a-f-]{36}$/)
  expect(types.filter((type) => type === 'true-false')).toHaveLength(1)
  expect(types.filter((type) => type === 'fill-blanks')).toHaveLength(2)
})

async function onlyTrueFalse(page: import('@playwright/test').Page, setupId: string, count: number) {
  await page.goto(`/exams/new?d=${setupId}&lng=en`)
  for (const type of ['open-ended', 'short-answer', 'mcq']) await page.locator(`#exam-count-${type}`).fill('0')
  await page.locator('#exam-count-true-false').fill(String(count))
  await fillSource(page)
}

test('a quality-check failure (the model ignores the planned answers and writes only "true") is rewritten by one targeted call, only for the surplus', async ({ page }) => {
  await onlyTrueFalse(page, 'q1', 4)
  const calls: { mode: string; count: number; facts?: { fact: string }[]; trueFalseAnswers?: boolean[]; avoidAnswers?: string[]; avoidStems?: string[] }[] = []
  let serial = 100
  await page.route('**/api/generate', async (route) => {
    const payload = route.request().postDataJSON() as (typeof calls)[number] & { type: string }
    if (payload.mode === 'exam_plan') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ facts: fakeFacts(payload.count) }) })
      return
    }
    if (payload.mode === 'exam_verify') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ wrong: [], fixes: [], same: [] }) })
      return
    }
    calls.push(payload)
    const { fakeQuestion } = await import('./examHelpers')
    const questions = Array.from({ length: payload.count }, (_, index) => ({ ...fakeQuestion('true-false', `${(serial += 1)}`), fact: payload.facts?.[index]?.fact, answerBool: calls.length === 1 ? true : (payload.trueFalseAnswers?.[index] ?? true) }))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions }) })
  })
  await page.locator('[data-purpose="exam-generate"]').click()
  await expect(page).toHaveURL(/\/exams\/[0-9a-f-]{36}$/)
  expect(calls).toHaveLength(2)
  // The plan decided the answers before anything was written: two true, two false.
  expect(calls[0].trueFalseAnswers).toEqual([false, true, false, true])
  expect(calls[1].count).toBe(2)
  expect(calls[1].trueFalseAnswers).toEqual([false, false])
  // Only the questions that stay are avoided.
  expect(calls[1].avoidStems?.length).toBe(2)
  const stored = (await storedExams(page))[0]
  expect(stored.questions.filter((question) => question.answerBool === true)).toHaveLength(2)
  expect(stored.questions.filter((question) => question.answerBool === false)).toHaveLength(2)
  expect(stored.questions.reduce((sum, question) => sum + question.points, 0)).toBe(100)
})

test('questions that still break a rule after three rewrites are left out: the screen says what is ready and nothing is saved yet', async ({ page }) => {
  await onlyTrueFalse(page, 'q2', 4)
  let calls = 0
  let serial = 200
  await page.route('**/api/generate', async (route) => {
    const payload = route.request().postDataJSON() as { mode: string; count: number; facts?: { fact: string }[] }
    if (payload.mode === 'exam_plan') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ facts: fakeFacts(payload.count) }) })
      return
    }
    if (payload.mode === 'exam_verify') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ wrong: [], fixes: [], same: [] }) })
      return
    }
    calls += 1
    const { fakeQuestion } = await import('./examHelpers')
    const questions = Array.from({ length: payload.count }, (_, index) => ({ ...fakeQuestion('true-false', `${(serial += 1)}`), fact: payload.facts?.[index]?.fact, answerBool: true }))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ questions }) })
  })
  await page.locator('[data-purpose="exam-generate"]').click()
  // Two of the four true-false statements stay (the answers are balanced by the plan), two never pass: half is missing.
  await expect(page.locator('[data-purpose="exam-partial"]')).toContainText('2 questions are ready. For the remaining 2')
  await expect(page.locator('[data-purpose="exam-partial-recommend"]')).toBeVisible()
  expect(calls).toBeGreaterThanOrEqual(2)
  expect(await storedExams(page)).toEqual([])
  await expect(page).toHaveURL(/\/exams\/new/)
})

test('when not one question passes there is nothing to keep: the error stays, with Try again', async ({ page }) => {
  await page.goto('/exams/new?d=q3&lng=en')
  for (const type of ['open-ended', 'short-answer', 'true-false']) await page.locator(`#exam-count-${type}`).fill('0')
  await page.locator('#exam-count-mcq').fill('4')
  const box = page.locator('#quiz-content-input')
  await box.click()
  await box.fill(EXAM_SOURCE)
  await page.route('**/api/generate', async (route) => {
    const payload = route.request().postDataJSON() as { mode: string; type: string; count: number; facts?: { fact: string }[] }
    const reply = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (payload.mode === 'exam_plan') return reply({ facts: fakeFacts(payload.count) })
    if (payload.mode === 'exam_verify') return reply({ wrong: [], fixes: [], same: [], reviews: [] })
    const { fakeQuestion } = await import('./examHelpers')
    return reply({ questions: Array.from({ length: payload.count }, (_, index) => ({ ...fakeQuestion('mcq', `m${index}-${Math.random()}`), fact: payload.facts?.[index]?.fact, stem: 'Bu modele göre hangi şık doğrudur?' })) })
  })
  await page.locator('[data-purpose="exam-generate"]').click()
  await expect(page.locator('[data-purpose="exam-generate-error"]')).toContainText('did not pass the quality check')
  await expect(page.locator('[data-purpose="exam-retry"]')).toBeVisible()
  expect(await storedExams(page)).toEqual([])
})

test('old drafts never open in a new exam; drafts of other users or older than 7 days are dropped', async ({ page }) => {
  const exam = sampleExam()
  const now = Date.now()
  await page.addInitScript(
    ({ exam: seeded, now: at }) => {
      if (window.localStorage.getItem('seeded.drafts') === '1') return
      window.localStorage.setItem('seeded.drafts', '1')
      window.localStorage.setItem('quelio.exams.v1', JSON.stringify([seeded]))
      // An old setup form (other id), a draft of another user for this exam, and a stale draft of ours.
      window.localStorage.setItem('quelio.examSetup.v1.e2e-user.old-setup', JSON.stringify({ value: { textValue: 'ESKI KAYNAK', settings: {}, topicsText: '' }, savedAt: at }))
      window.localStorage.setItem(`quelio.examDraft.v1.someone-else.${seeded.id}`, JSON.stringify({ exam: { ...seeded, title: 'BASKA KULLANICI' }, baseUpdatedAt: seeded.updatedAt, savedAt: at }))
      window.localStorage.setItem(`quelio.examDraft.v1.e2e-user.${seeded.id}`, JSON.stringify({ exam: { ...seeded, title: 'ESKI TASLAK' }, baseUpdatedAt: seeded.updatedAt, savedAt: at - 8 * 24 * 3_600_000 }))
    },
    { exam, now },
  )
  await page.goto('/exams/new?d=brand-new&lng=en')
  await expect(page.locator('#quiz-content-input')).toHaveValue('')
  await page.goto(`/exams/${exam.id}?lng=en`)
  await expect(page.getByLabel('Exam name')).toHaveValue(exam.title)
  await expect(page.locator('[data-purpose="exam-draft-choice"]')).toHaveCount(0)
  // The stale draft was removed, the other user's is untouched.
  const keys = await page.evaluate(() => Object.keys(window.localStorage))
  expect(keys).not.toContain(`quelio.examDraft.v1.e2e-user.${exam.id}`)
  expect(keys).toContain(`quelio.examDraft.v1.someone-else.${exam.id}`)

  // Deleting an exam clears its draft.
  await page.getByLabel('Exam name').fill('Taslağı olan sınav')
  await expect(page.locator('[data-purpose="exam-save-state"]')).toHaveAttribute('data-state', 'saved')
  await page.goto('/exams?lng=en')
  await page.locator('[data-purpose="exam-delete"]').first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expect(page.locator('[data-purpose="exam-item"]')).toHaveCount(0)
  const left = await page.evaluate((id) => window.localStorage.getItem(`quelio.examDraft.v1.e2e-user.${id}`), exam.id)
  expect(left).toBeNull()
})

test('a newer unsaved draft asks which copy to keep', async ({ page }) => {
  const exam = sampleExam()
  await page.addInitScript(
    ({ exam: seeded }) => {
      if (window.localStorage.getItem('seeded.draft2') === '1') return
      window.localStorage.setItem('seeded.draft2', '1')
      window.localStorage.setItem('quelio.exams.v1', JSON.stringify([seeded]))
      window.localStorage.setItem(`quelio.examDraft.v1.e2e-user.${seeded.id}`, JSON.stringify({ exam: { ...seeded, title: 'TASLAK BASLIK' }, baseUpdatedAt: seeded.updatedAt, savedAt: Date.now() }))
    },
    { exam },
  )
  await page.goto(`/exams/${exam.id}?lng=en`)
  await expect(page.locator('[data-purpose="exam-draft-choice"]')).toBeVisible()
  await page.locator('[data-purpose="exam-use-draft"]').click()
  await expect(page.getByLabel('Exam name')).toHaveValue('TASLAK BASLIK')
  await expect(page.locator('[data-purpose="exam-draft-choice"]')).toHaveCount(0)
})

test('two tabs: the older tab is told the exam changed and offers a reload instead of overwriting', async ({ page, context }) => {
  await seedExams(page, [sampleExam()])
  const url = '/exams/7b1f6a52-3c1e-4c52-9a53-0d3b2f2a9c01?lng=en'
  await page.goto(url)
  await expect(questionCards(page)).toHaveCount(22)
  const other = await context.newPage()
  await other.goto(url)
  await expect(other.locator('[data-purpose="exam-question"]')).toHaveCount(22)

  await other.getByLabel('Exam name').fill('İkinci sekme')
  await expect(other.locator('[data-purpose="exam-save-state"]')).toHaveAttribute('data-state', 'saved')

  await page.getByLabel('Exam name').fill('Birinci sekme')
  await expect(page.locator('[data-purpose="exam-conflict"]')).toContainText('This exam was changed in another tab')
  expect((await storedExams(page))[0].title).toBe('İkinci sekme')

  await page.locator('[data-purpose="exam-reload"]').click()
  await expect(page.getByLabel('Exam name')).toHaveValue('İkinci sekme')
  await expect(page.locator('[data-purpose="exam-conflict"]')).toHaveCount(0)
  // After the reload, saving works again.
  await page.getByLabel('Exam name').fill('Üçüncü')
  await expect(page.locator('[data-purpose="exam-save-state"]')).toHaveAttribute('data-state', 'saved')
  expect((await storedExams(page))[0].title).toBe('Üçüncü')
  await other.close()
})

test('the Turkish conflict message is exactly the specified one', async () => {
  expect(tr.exam.edit.conflict.startsWith('Bu sınav başka bir sekmede değişti')).toBe(true)
  expect(tr.exam.edit.redistribute).toBe("Puanları 100'e dağıt")
  expect(tr.exam.fromQuiz.action).toBe('Yazılı sınava çevir')
  expect(tr.exam.list.new).toBe('Yeni yazılı sınav')
  expect(tr.nav.exams).toBe('Yazılı Sınav')
  expect(en.nav.exams).toBe('Written Exam')
})

test('the exam strings exist in TR, EN and HYW with the same keys', async () => {
  const keys = (value: unknown, prefix = ''): string[] =>
    typeof value === 'object' && value !== null ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`)) : [prefix]
  const trKeys = keys(tr.exam).sort()
  expect(keys(en.exam).sort()).toEqual(trKeys)
  expect(keys(hyw.exam).sort()).toEqual(trKeys)
})

for (const [lng, strings] of [
  ['tr', tr],
  ['en', en],
  ['hyw', hyw],
] as const) {
  test(`pages render in ${lng} without raw keys`, async ({ page }) => {
    await seedExams(page, [sampleExam()])
    await page.goto(`/exams?lng=${lng}`)
    await expect(page.getByRole('heading', { name: strings.exam.list.title, exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: strings.nav.exams })).toBeVisible()
    await page.goto(`/exams/new?d=l1&lng=${lng}`)
    await expect(page.getByRole('heading', { name: strings.exam.setup.title, exact: true })).toBeVisible()
    await expect(page.locator('[data-purpose="exam-generate"]')).toContainText(strings.exam.setup.generate)
    await page.goto(`/exams/7b1f6a52-3c1e-4c52-9a53-0d3b2f2a9c01?lng=${lng}`)
    await expect(page.locator('[data-purpose="exam-redistribute"]')).toHaveText(strings.exam.edit.redistribute)
    const text = await page.locator('main').innerText()
    expect(text).not.toMatch(/\bexam\.(list|setup|edit|header|errors)\./)
  })
}

test('@mobile the editor is usable at 360px: question list and preview tabs, nothing wider than the screen', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'mobile-only: asserts against the phone viewport')
  await page.setViewportSize({ width: 360, height: 800 })
  await seedExams(page, [sampleExam()])
  await page.goto('/exams/7b1f6a52-3c1e-4c52-9a53-0d3b2f2a9c01?lng=en')
  await expect(questionCards(page).first()).toBeVisible()
  await expect(page.locator('[data-purpose="exam-view-edit"]')).toBeVisible()
  await page.locator('[data-purpose="exam-view-preview"]').click()
  const paper = page.locator('[data-purpose="exam-paper"]')
  await expect(paper).toBeVisible()
  const box = await paper.boundingBox()
  expect(box!.width).toBeLessThanOrEqual(360)
  await page.locator('[data-purpose="exam-view-edit"]').click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.locator('[data-purpose="exam-move-down"]').first().click()
})

test('@mobile the creation form fits 360px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'mobile-only: asserts against the phone viewport')
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/exams/new?d=m1&lng=en')
  await expect(page.locator('[data-purpose="exam-generate"]')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test('creating through the form and then editing keeps working after a reload', async ({ page }) => {
  await mockExamApi(page)
  await createViaForm(page, 'r1')
  await page.getByLabel('Exam name').fill('Kaydedilen başlık')
  await expect(page.locator('[data-purpose="exam-save-state"]')).toHaveAttribute('data-state', 'saved')
  await page.reload()
  await expect(page.getByLabel('Exam name')).toHaveValue('Kaydedilen başlık')
  await expect(questionCards(page)).toHaveCount(20)
})

test('a source that holds fewer distinct facts than questions warns first; continuing writes the smaller exam from the same plan', async ({ page }) => {
  await page.goto('/exams/new?d=s1&lng=en')
  await fillSource(page)
  let plans = 0
  const sections: number[] = []
  await page.route('**/api/generate', async (route) => {
    const payload = route.request().postDataJSON() as { mode: string; type: string; count: number; facts?: { fact: string }[]; trueFalseAnswers?: boolean[] }
    const reply = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (payload.mode === 'exam_plan') {
      plans += 1
      return reply({ facts: fakeFacts(8) })
    }
    if (payload.mode === 'exam_verify') return reply({ wrong: [], fixes: [], same: [], reviews: [] })
    sections.push(payload.count)
    const { fakeQuestion } = await import('./examHelpers')
    return reply({
      questions: Array.from({ length: payload.count }, (_, index) => ({
        ...fakeQuestion(payload.type as never, `${payload.type}-${sections.length}-${index}`),
        fact: payload.facts?.[index]?.fact,
        ...(payload.type === 'true-false' ? { answerBool: payload.trueFalseAnswers?.[index] ?? true } : {}),
      })),
    })
  })
  await page.locator('[data-purpose="exam-generate"]').click()
  await expect(page.locator('[data-purpose="exam-short-source"]')).toContainText('at most 8 different questions')
  expect(sections).toHaveLength(0)
  await page.locator('[data-purpose="exam-short-continue"]').click()
  await expect(page).toHaveURL(/\/exams\/[0-9a-f-]{36}$/)
  expect(plans).toBe(1)
  const stored = (await storedExams(page))[0]
  expect(stored.questions).toHaveLength(8)
  expect(stored.questions.reduce((sum, question) => sum + question.points, 0)).toBe(100)
  expect(new Set(stored.questions.map((question) => question.fact)).size).toBe(8)
})

test('dismissing the short-source notice changes nothing', async ({ page }) => {
  await page.goto('/exams/new?d=s2&lng=en')
  await fillSource(page)
  await page.route('**/api/generate', async (route) => {
    const payload = route.request().postDataJSON() as { mode: string }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload.mode === 'exam_plan' ? { facts: fakeFacts(5) } : { wrong: [], fixes: [], same: [] }) })
  })
  await page.locator('[data-purpose="exam-generate"]').click()
  await expect(page.locator('[data-purpose="exam-short-source"]')).toBeVisible()
  await page.locator('[data-purpose="exam-short-dismiss"]').click()
  await expect(page.locator('[data-purpose="exam-short-source"]')).toBeHidden()
  await expect(page.locator('#exam-count-mcq')).toHaveValue('5')
  expect(await storedExams(page)).toEqual([])
})

// ---------------------------------------------------------------------------
// Partial results: a 40-question exam where some questions keep failing the quality check
// ---------------------------------------------------------------------------

interface FortyOptions {
  /** How many multiple-choice questions of the first pass break a rule (a stem that points at a model that is not there). */
  brokenFirst: number
  /** While true, every rewritten multiple-choice question breaks the rule again. */
  failRewrites: { value: boolean }
  /** While true, rewrite calls fail with a server error. */
  outage?: { value: boolean }
}

interface SectionCall {
  type: string
  count: number
  facts: string[]
  rewrite: boolean
}

async function mockForty(page: import('@playwright/test').Page, options: FortyOptions): Promise<{ sections: SectionCall[]; plans: () => number }> {
  const sections: SectionCall[] = []
  let plans = 0
  let brokenLeft = options.brokenFirst
  await page.route('**/api/generate', async (route) => {
    const payload = route.request().postDataJSON() as { mode: string; type: string; count: number; facts?: { fact: string }[]; trueFalseAnswers?: boolean[]; avoidAnswers?: string[] }
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (payload.mode === 'exam_plan') {
      plans += 1
      return reply({ facts: fakeFacts(payload.count) })
    }
    if (payload.mode === 'exam_verify') return reply({ wrong: [], fixes: [], same: [], reviews: [] })
    const rewrite = payload.avoidAnswers !== undefined
    if (rewrite && options.outage?.value) return reply({ error: 'upstream' }, 502)
    sections.push({ type: payload.type, count: payload.count, facts: (payload.facts ?? []).map((entry) => entry.fact), rewrite })
    const { fakeQuestion } = await import('./examHelpers')
    return reply({
      questions: Array.from({ length: payload.count }, (_, index) => {
        const tag = `${payload.type}-${sections.length}-${index}`
        const base = { ...fakeQuestion(payload.type as never, tag), fact: payload.facts?.[index]?.fact }
        if (payload.type === 'true-false') return { ...base, answerBool: payload.trueFalseAnswers?.[index] ?? true }
        const breaks = payload.type === 'mcq' && (rewrite ? options.failRewrites.value : brokenLeft > 0 && (brokenLeft -= 1) >= 0)
        return breaks ? { ...base, stem: `Bu modele göre hangi şık doğrudur? ${tag}` } : base
      }),
    })
  })
  return { sections, plans: () => plans }
}

async function startForty(page: import('@playwright/test').Page, setupId: string) {
  await page.goto(`/exams/new?d=${setupId}&lng=en`)
  for (const type of ['open-ended', 'short-answer', 'true-false', 'mcq']) await page.locator(`#exam-count-${type}`).fill('10')
  await fillSource(page, EXAM_SOURCE_LONG)
}

test('an early warning after the plan: Add text, Continue and Cancel; the text stays and nothing was written yet', async ({ page }) => {
  await page.goto('/exams/new?d=w1&lng=en')
  await fillSource(page)
  const sections: number[] = []
  await page.route('**/api/generate', async (route) => {
    const payload = route.request().postDataJSON() as { mode: string; count: number }
    if (payload.mode === 'exam_plan') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ facts: fakeFacts(8) }) })
    sections.push(payload.count)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ wrong: [], fixes: [], same: [] }) })
  })
  await page.locator('[data-purpose="exam-generate"]').click()
  const notice = page.locator('[data-purpose="exam-short-source"]')
  await expect(notice).toContainText('at most 8 different questions')
  for (const purpose of ['exam-short-continue', 'exam-short-add-text', 'exam-short-dismiss']) await expect(page.locator(`[data-purpose="${purpose}"]`)).toBeVisible()
  expect(sections).toHaveLength(0)
  await page.locator('[data-purpose="exam-short-add-text"]').click()
  await expect(notice).toBeHidden()
  await expect(page.locator('#quiz-content-input')).toBeFocused()
  await expect(page.locator('#quiz-content-input')).toHaveValue(EXAM_SOURCE)
  await expect(page.locator('#exam-count-mcq')).toHaveValue('5')
  expect(await storedExams(page)).toEqual([])
})

test('a short source warns before any AI call: 136 words carry at most 6 of 20 questions', async ({ page }) => {
  await page.goto('/exams/new?d=ws1&lng=en')
  await fillSource(page, `${EXAM_SOURCE_SHORT} ${EXAM_SOURCE_SHORT}`)
  const api = await mockExamApi(page)
  await page.locator('[data-purpose="exam-generate"]').click()
  await expect(page.locator('[data-purpose="exam-short-source"]')).toContainText('at most 6 different questions')
  expect(api.calls()).toHaveLength(0)
  for (const purpose of ['exam-short-continue', 'exam-short-add-text', 'exam-short-dismiss']) await expect(page.locator(`[data-purpose="${purpose}"]`)).toBeVisible()
  await page.locator('[data-purpose="exam-short-dismiss"]').click()
  await expect(page.locator('[data-purpose="exam-short-source"]')).toBeHidden()
  expect(api.calls()).toHaveLength(0)
})

test('the settings screen estimates the time of a large exam', async ({ page }) => {
  await page.goto('/exams/new?d=e1&lng=en')
  await expect(page.locator('[data-purpose="exam-estimate"]')).toHaveCount(0)
  for (const type of ['open-ended', 'short-answer', 'true-false', 'mcq']) await page.locator(`#exam-count-${type}`).fill('10')
  await expect(page.locator('[data-purpose="exam-estimate"]')).toHaveText('40 questions take about 3 minutes.')
})

test('40 questions where 2 keep failing: "38 questions are ready"; Continue opens the editor with 38 questions and exactly 100 points', async ({ page }) => {
  test.setTimeout(120_000)
  const server = await mockForty(page, { brokenFirst: 2, failRewrites: { value: true } })
  await startForty(page, 'p1')
  await page.locator('[data-purpose="exam-generate"]').click()
  const partial = page.locator('[data-purpose="exam-partial"]')
  await expect(partial).toContainText('38 questions are ready. For the remaining 2, the text does not hold enough different content.')
  await expect(page.locator('[data-purpose="exam-partial-recommend"]')).toHaveCount(0)
  for (const purpose of ['exam-partial-continue', 'exam-partial-retry', 'exam-partial-add-text']) await expect(page.locator(`[data-purpose="${purpose}"]`)).toBeVisible()
  // Nothing is saved before the teacher chooses.
  expect(await storedExams(page)).toEqual([])
  expect(server.plans()).toBe(1)
  await page.locator('[data-purpose="exam-partial-continue"]').click()
  await expect(page).toHaveURL(/\/exams\/[0-9a-f-]{36}$/)
  await expect(questionCards(page)).toHaveCount(38)
  await expect(page.locator('[data-purpose="exam-total"]')).toContainText('100 / 100')
  const stored = await storedExams(page)
  expect(stored).toHaveLength(1)
  const counts: Record<string, number> = {}
  for (const question of stored[0].questions) counts[question.type] = (counts[question.type] ?? 0) + 1
  // Only the failing questions are gone; the mix of the rest is untouched and the settings follow what was made.
  expect(counts).toEqual({ 'open-ended': 10, 'short-answer': 10, 'true-false': 10, mcq: 8 })
  expect(stored[0].settings.counts.mcq).toBe(8)
  expect(stored[0].questions.every((question) => Number.isInteger(question.points) && question.points >= 1)).toBe(true)
  expect(stored[0].questions.reduce((sum, question) => sum + question.points, 0)).toBe(100)
  expect(stored[0].questions.some((question) => question.stem.includes('Bu modele göre'))).toBe(false)
})

test('"Retry the missing questions" asks for only those 2, on new facts, and the finished exam is saved once', async ({ page }) => {
  test.setTimeout(120_000)
  const failRewrites = { value: true }
  const server = await mockForty(page, { brokenFirst: 2, failRewrites })
  await startForty(page, 'p2')
  await page.locator('[data-purpose="exam-generate"]').click()
  await expect(page.locator('[data-purpose="exam-partial"]')).toContainText('38 questions are ready')
  const used = new Set(server.sections.flatMap((call) => call.facts))
  const before = server.sections.length
  failRewrites.value = false
  await page.locator('[data-purpose="exam-partial-retry"]').click()
  await expect(page).toHaveURL(/\/exams\/[0-9a-f-]{36}$/)
  const retry = server.sections.slice(before)
  // Only the two missing questions were requested, all of them rewrites, every fact one that had not been used.
  expect(retry.reduce((sum, call) => sum + call.count, 0)).toBe(2)
  expect(retry.every((call) => call.rewrite && call.type === 'mcq')).toBe(true)
  for (const call of retry) for (const fact of call.facts) expect(used.has(fact)).toBe(false)
  expect(server.plans()).toBe(1)
  await expect(questionCards(page)).toHaveCount(40)
  const stored = await storedExams(page)
  expect(stored).toHaveLength(1)
  expect(stored[0].questions.reduce((sum, question) => sum + question.points, 0)).toBe(100)
})

test('"Add text" on the partial screen goes back to the source with the text and settings kept', async ({ page }) => {
  test.setTimeout(120_000)
  await mockForty(page, { brokenFirst: 2, failRewrites: { value: true } })
  await startForty(page, 'p3')
  await page.locator('[data-purpose="exam-generate"]').click()
  await expect(page.locator('[data-purpose="exam-partial"]')).toBeVisible()
  await page.locator('[data-purpose="exam-partial-add-text"]').click()
  await expect(page.locator('[data-purpose="exam-partial"]')).toBeHidden()
  await expect(page.locator('#quiz-content-input')).toBeFocused()
  await expect(page.locator('#quiz-content-input')).toHaveValue(EXAM_SOURCE_LONG)
  await expect(page.locator('#exam-count-mcq')).toHaveValue('10')
  expect(await storedExams(page)).toEqual([])
})

test('more than 20 % missing says so and puts "Add text" first', async ({ page }) => {
  test.setTimeout(120_000)
  // 5 of 10 multiple-choice questions never pass: 5 of 40 is 12 %, so also break the first pass of two more types? Use 9 of 10 instead.
  await mockForty(page, { brokenFirst: 10, failRewrites: { value: true } })
  await startForty(page, 'p4')
  await page.locator('[data-purpose="exam-generate"]').click()
  const partial = page.locator('[data-purpose="exam-partial"]')
  await expect(partial).toContainText('30 questions are ready. For the remaining 10')
  await expect(page.locator('[data-purpose="exam-partial-recommend"]')).toContainText('adding more material first')
  const labels = await partial.locator('button').allInnerTexts()
  expect(labels[0]).toBe('Add text')
})

test('a technical failure keeps what passed: Try again repeats only the rewrites, not the first pass', async ({ page }) => {
  test.setTimeout(120_000)
  const outage = { value: true }
  const server = await mockForty(page, { brokenFirst: 2, failRewrites: { value: false }, outage })
  await startForty(page, 'p5')
  await page.locator('[data-purpose="exam-generate"]').click()
  await expect(page.locator('[data-purpose="exam-generate-error"]')).toContainText('Nothing was saved')
  expect(await storedExams(page)).toEqual([])
  const firstPass = server.sections.filter((call) => !call.rewrite).length
  expect(firstPass).toBeGreaterThanOrEqual(8)
  outage.value = false
  await page.locator('[data-purpose="exam-retry"]').click()
  await expect(page).toHaveURL(/\/exams\/[0-9a-f-]{36}$/)
  // The first pass was not asked again and the plan was made once.
  expect(server.sections.filter((call) => !call.rewrite).length).toBe(firstPass)
  expect(server.plans()).toBe(1)
  await expect(questionCards(page)).toHaveCount(40)
  expect(await storedExams(page)).toHaveLength(1)
})
