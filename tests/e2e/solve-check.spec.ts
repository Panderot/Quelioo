import type { Page, Route } from '@playwright/test'
import { test, expect } from './fixtures'
import { savedSolutionExtras } from './helpers'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import tr from '../../src/i18n/locales/tr.json' with { type: 'json' }
import hyw from '../../src/i18n/locales/hyw.json' with { type: 'json' }

const MOCK_RESULT = {
  topic: 'Linear equations',
  question: 'Solve for $x$: $3x + 7 = 2x + 15$',
  intro: 'The goal is to isolate $x$.',
  steps: ['Subtract $2x$ from both sides: $x + 7 = 15$', 'Subtract $7$ from both sides: $x = 8$'],
  answer: '$x = 8$',
  tip: 'Do the same operation on both sides.',
  mistakes: [],
  provider: 'openai',
  fallbackUsed: false,
}

const meta = { provider: 'openai', fallbackUsed: false }
const STUDENT_STEPS = ['$3x + 7 = 2x + 15$', '$3x + 2x = 15 - 7$', '$5x = 8$', '$x = 1.6$']

const READING = {
  kind: 'reading',
  lines: STUDENT_STEPS.map((text, index) => ({ text, lowConfidence: index === 1 || index === 3 })),
  problemMatch: 'same',
  ...meta,
}
const CLEAN_READING = { ...READING, lines: ['$3x + 7 = 2x + 15$', '$x = 15 - 7$', '$x = 8$'].map((text) => ({ text, lowConfidence: false })) }

const result = (overrides: Record<string, unknown>) => ({
  kind: 'result',
  verdict: 'correct',
  studentSteps: STUDENT_STEPS,
  stepStates: ['ok', 'ok', 'ok', 'ok'],
  firstWrongStep: null,
  errorType: null,
  explanation: '',
  correctedStep: '',
  unsureStep: null,
  unsureHint: '',
  finalAnswerCorrect: null,
  engineChecks: ['valid', 'invalid', 'valid', 'valid'],
  ...meta,
  ...overrides,
})

const HAS_ERROR = result({
  verdict: 'has_error',
  stepStates: ['ok', 'mistake', 'unchecked', 'unchecked'],
  firstWrongStep: 1,
  errorType: 'sign',
  explanation: 'When $2x$ moves to the left side its sign changes, so it becomes $-2x$.',
  correctedStep: '$3x - 2x = 15 - 7$',
  finalAnswerCorrect: false,
})
const CORRECT = result({ studentSteps: CLEAN_READING.lines.map((line) => line.text), stepStates: ['ok', 'ok', 'ok'], finalAnswerCorrect: true })
const UNSURE = result({
  verdict: 'unsure',
  stepStates: ['ok', 'unsure', 'ok', 'ok'],
  unsureStep: 1,
  unsureHint: 'Look again at what happens to $2x$ when it moves to the other side.',
  finalAnswerCorrect: false,
})

type Json = Record<string, unknown>
type Reply = { status?: number; body: unknown }

/** Scripted /api/check-work: separate reply lists for the read and the grade step. */
async function mockCheck(page: Page, replies: { read: Reply[]; grade?: Reply[] }) {
  const reads: Json[] = []
  const grades: Json[] = []
  await page.route('**/api/check-work', async (route: Route) => {
    const payload = route.request().postDataJSON() as Json
    const list = payload.mode === 'grade' ? grades : reads
    list.push(payload)
    const options = payload.mode === 'grade' ? (replies.grade ?? []) : replies.read
    const reply = options[Math.min(list.length - 1, options.length - 1)]
    await route.fulfill({ status: reply.status ?? 200, contentType: 'application/json', body: JSON.stringify(reply.body) })
  })
  return { reads, grades }
}

async function pngBuffer(page: Page, text: string): Promise<Buffer> {
  const base64 = await page.evaluate((label) => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 400
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 800, 400)
    ctx.fillStyle = '#123'
    ctx.font = '48px serif'
    ctx.fillText(label, 80, 220)
    return canvas.toDataURL('image/png').split(',')[1]
  }, text)
  return Buffer.from(base64, 'base64')
}

async function solve(page: Page, strings: typeof en = en) {
  await page.locator('input[type="file"]').setInputFiles({ name: 'q.png', mimeType: 'image/png', buffer: await pngBuffer(page, '3x + 7 = 2x + 15') })
  await page.getByRole('button', { name: strings.crop.useWhole }).click({ timeout: 15_000 })
  await page.getByRole('button', { name: strings.solve.cta.solve, exact: true }).click()
  await expect(page.locator('[data-purpose="solve-result"]')).toBeVisible()
}

const panel = (page: Page) => page.locator('[data-purpose="check-work-panel"]')
const steps = (page: Page) => panel(page).locator('[data-purpose="check-work-step"]')
const confirmBox = (page: Page) => panel(page).locator('[data-purpose="check-work-confirm"]')
const summary = (page: Page) => panel(page).locator('[data-purpose="check-work-summary"]')

/** Opens "Check my solution" (if needed), uploads a photo through the crop step and sends it to be read. */
async function readWork(page: Page, strings: typeof en = en, open = true) {
  if (open) await page.getByRole('button', { name: strings.solve.actions.checkWork }).click()
  await panel(page).locator('input[type="file"]').setInputFiles({ name: 'work.png', mimeType: 'image/png', buffer: await pngBuffer(page, '3x + 2x = 15 - 7') })
  await panel(page).getByRole('button', { name: strings.crop.useWhole }).click({ timeout: 15_000 })
  await expect(panel(page).locator('[data-purpose="check-work-preview"]')).toBeVisible()
  await panel(page).getByRole('button', { name: strings.solve.check.submit, exact: true }).click()
}

/** Reads the photo and confirms the reading as-is ("Yes, check it"). */
async function checkWork(page: Page, strings: typeof en = en, open = true) {
  await readWork(page, strings, open)
  await confirmBox(page).getByRole('button', { name: strings.solve.check.confirm.yes }).click()
}

const fill = (template: string, step: number) => template.replace('{{step}}', String(step))

test.describe('Solve — check my solution', () => {
  test('shows the reading to confirm first; only then grades and marks the verified mistake', { tag: '@cross' }, async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    const calls = await mockCheck(page, { read: [{ body: READING }, { body: CLEAN_READING }], grade: [{ body: HAS_ERROR }, { body: CORRECT }] })
    await page.goto('/solve?lng=en')
    await solve(page)

    await expect(page.locator('[data-purpose="solution-actions"] > button').first()).toHaveText(en.solve.actions.checkWork)
    await readWork(page)

    // "Did I read your work correctly?" — nothing graded yet.
    await expect(confirmBox(page).getByRole('heading', { name: en.solve.check.confirm.title })).toBeVisible()
    const lines = confirmBox(page).locator('[data-purpose="check-work-read-line"]')
    await expect(lines).toHaveCount(4)
    await expect(lines.nth(0).locator('.katex')).not.toHaveCount(0)
    // Low-confidence lines are marked with an icon and text, and several of them suggest a retake.
    await expect(confirmBox(page).locator('[data-low="true"]')).toHaveCount(2)
    await expect(lines.nth(1)).toContainText(en.solve.check.confirm.lowLine)
    await expect(lines.nth(1).locator('svg')).toHaveCount(1)
    await expect(confirmBox(page).locator('[data-purpose="check-work-many-low"]')).toHaveText(en.solve.check.confirm.manyLow)
    await expect(confirmBox(page).getByRole('button', { name: en.solve.check.confirm.retake })).toBeVisible()
    await expect(confirmBox(page).getByRole('button', { name: en.solve.check.confirm.fix })).toBeVisible()
    expect(calls.reads[0]).toMatchObject({ mode: 'read', mimeType: 'image/jpeg', question: MOCK_RESULT.question, steps: MOCK_RESULT.steps, answer: MOCK_RESULT.answer, language: 'en' })
    expect(String(calls.reads[0].imageBase64)).toMatch(/^data:image\/jpeg;base64,/)
    expect(calls.grades).toHaveLength(0)

    await confirmBox(page).getByRole('button', { name: en.solve.check.confirm.yes }).click()
    const resultView = panel(page).locator('[data-purpose="check-work-result"]')
    await expect(resultView).toHaveAttribute('data-verdict', 'has_error')
    // Grading uses the confirmed text, never the photo.
    expect(calls.grades[0]).toMatchObject({ mode: 'grade', studentSteps: STUDENT_STEPS, question: MOCK_RESULT.question, answer: MOCK_RESULT.answer })
    expect(calls.grades[0].imageBase64).toBeUndefined()
    await expect(confirmBox(page)).toHaveCount(0)

    await expect(summary(page)).toHaveText(fill(en.solve.check.verdict.has_error, 2))
    await expect(steps(page)).toHaveCount(4)
    await expect(steps(page).nth(0)).toHaveAttribute('data-state', 'ok')
    await expect(steps(page).nth(0).locator('[data-purpose="check-work-ok"]')).toHaveText(en.solve.check.levels.ok)
    const wrong = steps(page).nth(1)
    await expect(wrong).toHaveAttribute('data-state', 'mistake')
    await expect(wrong.locator('[data-purpose="check-work-wrong"] svg')).toHaveCount(1)
    await expect(wrong).toContainText(en.solve.check.levels.mistake)
    await expect(wrong.locator('[data-purpose="check-work-error-type"]')).toHaveText(en.solve.check.errorTypes.sign)
    await expect(wrong.locator('[data-purpose="check-work-explanation"]')).toContainText('sign changes')
    await expect(wrong.locator('[data-purpose="check-work-corrected"] .katex')).not.toHaveCount(0)
    for (const index of [2, 3]) await expect(steps(page).nth(index)).toHaveAttribute('data-state', 'unchecked')

    // Upload again after fixing.
    await panel(page).getByRole('button', { name: en.solve.check.uploadAgain }).click()
    await checkWork(page, en, false)
    await expect(resultView).toHaveAttribute('data-verdict', 'correct')
    await expect(summary(page)).toHaveText(en.solve.check.verdict.correct)
    for (const index of [0, 1, 2]) await expect(steps(page).nth(index)).toHaveAttribute('data-state', 'ok')
    expect(calls.reads).toHaveLength(2)
    expect(calls.grades).toHaveLength(2)
  })

  test('"Fix and check" lets the student correct a misread line, with a math preview, and grades the fixed text', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    const calls = await mockCheck(page, { read: [{ body: READING }], grade: [{ body: CORRECT }] })
    await page.goto('/solve?lng=en')
    await solve(page)
    await readWork(page)

    await confirmBox(page).getByRole('button', { name: en.solve.check.confirm.fix }).click()
    const line2 = confirmBox(page).getByRole('textbox', { name: en.solve.check.confirm.lineLabel.replace('{{n}}', '2') })
    await expect(confirmBox(page).getByRole('textbox')).toHaveCount(4)

    // Cancel restores the reading.
    await line2.fill('$9$')
    await confirmBox(page).getByRole('button', { name: en.solve.cta.cancel }).click()
    await expect(confirmBox(page).getByRole('textbox')).toHaveCount(0)
    await expect(confirmBox(page).locator('[data-purpose="check-work-read-line"]').nth(1)).toContainText('15')

    await confirmBox(page).getByRole('button', { name: en.solve.check.confirm.fix }).click()
    await line2.fill('$3x - 2x = 15 - 7$')
    const preview = confirmBox(page).locator('[data-purpose="check-work-read-line"]').nth(1).locator('[data-purpose="check-work-line-preview"]')
    await expect(preview.locator('.katex')).not.toHaveCount(0)
    // An edited line is no longer flagged as hard to read.
    await expect(confirmBox(page).locator('[data-purpose="check-work-read-line"]').nth(1)).toHaveAttribute('data-low', 'false')
    await confirmBox(page).getByRole('button', { name: en.solve.check.confirm.removeLine.replace('{{n}}', '4') }).click()
    await confirmBox(page).getByRole('button', { name: en.solve.check.confirm.removeLine.replace('{{n}}', '3') }).click()
    await confirmBox(page).getByRole('button', { name: new RegExp(en.solve.check.confirm.addLine) }).click()
    await confirmBox(page).getByRole('textbox', { name: en.solve.check.confirm.lineLabel.replace('{{n}}', '3') }).fill('$x = 8$')
    await confirmBox(page).getByRole('button', { name: en.solve.check.confirm.checkEdited }).click()

    await expect(panel(page).locator('[data-purpose="check-work-result"]')).toHaveAttribute('data-verdict', 'correct')
    expect(calls.grades[0].studentSteps).toEqual(['$3x + 7 = 2x + 15$', '$3x - 2x = 15 - 7$', '$x = 8$'])
  })

  test('three wording levels: mistake, check again (never "wrong"), correct — and honest "not sure"', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await mockCheck(page, {
      read: [{ body: READING }],
      grade: [
        { body: UNSURE },
        { body: result({ ...UNSURE, verdict: 'correct', finalAnswerCorrect: true }) },
        { body: result({ verdict: 'uncertain', stepStates: ['ok', 'unchecked', 'unchecked', 'unchecked'] }) },
        { body: result({ verdict: 'has_error', stepStates: ['ok', 'unchecked', 'unchecked', 'unchecked'], finalAnswerCorrect: false }) },
        { body: result({ verdict: 'has_error', stepStates: ['ok', 'mistake', 'unchecked', 'unchecked'], firstWrongStep: 1, errorType: 'arithmetic', finalAnswerCorrect: true }) },
      ],
    })
    await page.goto('/solve?lng=en')
    await solve(page)
    const again = async () => {
      await panel(page).getByRole('button', { name: en.solve.check.uploadAgain }).click()
      await checkWork(page, en, false)
    }

    await checkWork(page)
    await expect(summary(page)).toHaveText(fill(en.solve.check.verdict.unsure, 2))
    const unsure = steps(page).nth(1)
    await expect(unsure).toHaveAttribute('data-state', 'unsure')
    await expect(unsure.locator('[data-purpose="check-work-unsure"]')).toContainText(en.solve.check.levels.unsure)
    await expect(unsure.locator('[data-purpose="check-work-unsure"] svg')).toHaveCount(1)
    await expect(unsure.locator('[data-purpose="check-work-hint"]')).toContainText('Look again')
    await expect(panel(page)).not.toContainText(en.solve.check.levels.mistake)
    await expect(panel(page).locator('[data-purpose="check-work-wrong"]')).toHaveCount(0)

    await again()
    await expect(summary(page)).toHaveText(fill(en.solve.check.verdict.correctWithUnsure, 2))
    await expect(panel(page).locator('[data-purpose="check-work-result"]')).toHaveAttribute('data-verdict', 'correct')

    await again()
    await expect(summary(page)).toHaveText(en.solve.check.verdict.uncertain)
    const reference = panel(page).locator('[data-purpose="check-work-reference"]')
    await expect(reference).toContainText(en.solve.check.referenceHeading)
    await expect(reference.locator('li')).toHaveCount(MOCK_RESULT.steps.length)

    await again()
    await expect(summary(page)).toHaveText(en.solve.check.verdict.hasErrorNoStep)
    await expect(reference).toBeVisible()
    await expect(steps(page).locator('[data-state="mistake"]')).toHaveCount(0)

    await again()
    await expect(summary(page)).toHaveText(fill(en.solve.check.verdict.finalRightStepWrong, 2))
    await expect(reference).toHaveCount(0)
  })

  test('unreadable and different-problem readings end without a confirm step', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    const calls = await mockCheck(page, {
      read: [
        { body: result({ verdict: 'unreadable', studentSteps: [], stepStates: [] }) },
        { body: result({ verdict: 'different_problem', studentSteps: ['$2x = 10$'], stepStates: ['unchecked'] }) },
      ],
    })
    await page.goto('/solve?lng=en')
    await solve(page)
    await readWork(page)
    await expect(summary(page)).toHaveText(en.solve.check.verdict.unreadable)
    await panel(page).getByRole('button', { name: en.solve.check.uploadAgain }).click()
    await readWork(page, en, false)
    await expect(summary(page)).toHaveText(en.solve.check.verdict.different_problem)
    await expect(steps(page)).toHaveCount(0)
    expect(calls.grades).toHaveLength(0)
  })

  test('errors are localized and retryable at both steps; the hourly limit has no retry', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    const calls = await mockCheck(page, {
      read: [{ status: 502, body: { error: 'upstream' } }, { body: READING }],
      grade: [{ status: 502, body: { error: 'upstream' } }, { body: HAS_ERROR }, { status: 429, body: { error: 'rate_limited' } }],
    })
    await page.goto('/solve?lng=en')
    await solve(page)
    await readWork(page)
    const error = panel(page).locator('[data-purpose="check-work-error"]')
    await expect(error).toContainText(en.solve.check.errors.upstream)
    await error.getByRole('button', { name: en.solve.explain.retry }).click()
    await confirmBox(page).getByRole('button', { name: en.solve.check.confirm.yes }).click()
    await expect(error).toContainText(en.solve.check.errors.upstream)
    // Retry grades the same confirmed reading again — no new photo read.
    await error.getByRole('button', { name: en.solve.explain.retry }).click()
    await expect(panel(page).locator('[data-purpose="check-work-result"]')).toHaveAttribute('data-verdict', 'has_error')
    expect(calls.reads).toHaveLength(2)

    await panel(page).getByRole('button', { name: en.solve.check.uploadAgain }).click()
    await checkWork(page, en, false)
    await expect(error).toContainText(en.solve.check.errors.rate_limited)
    await expect(error.getByRole('button')).toHaveCount(0)
    await expect(panel(page).locator('[data-purpose="check-work-result"]')).toHaveAttribute('data-verdict', 'has_error')
    expect(calls.grades).toHaveLength(3)
  })

  test('a pasted image goes to the open check panel, not to Solve', { tag: '@cross' }, async ({ page, mockSolve }) => {
    const solveMock = await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await solve(page)
    await page.getByRole('button', { name: en.solve.actions.checkWork }).click()
    const png = (await pngBuffer(page, 'x = 8')).toString('base64')
    await page.evaluate(async (data) => {
      const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }))
      // Firefox ignores `clipboardData` in the ClipboardEvent constructor; attach it explicitly.
      const event = new ClipboardEvent('paste', { bubbles: true })
      Object.defineProperty(event, 'clipboardData', { value: transfer })
      document.body.dispatchEvent(event)
    }, png)
    await expect(panel(page).getByRole('button', { name: en.crop.useWhole })).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-purpose="solve-cropped-preview"]')).toBeVisible()
    expect(solveMock.requests()).toHaveLength(1)
  })
})

test('the check result is saved and reopens from the Archive', { tag: '@cross' }, async ({ page, mockSolve }) => {
  await mockSolve(MOCK_RESULT)
  const calls = await mockCheck(page, { read: [{ body: READING }], grade: [{ body: HAS_ERROR }] })
  await page.goto('/solve?lng=en')
  await solve(page)
  await checkWork(page)
  await expect(panel(page).locator('[data-purpose="check-work-result"]')).toHaveAttribute('data-verdict', 'has_error')
  await expect.poll(() => savedSolutionExtras(page).then((all) => JSON.stringify(all.map((extras) => extras.checkMyWork ?? null)))).toContain('"verdict":"has_error"')

  await page.goto('/archive?tab=solutions&lng=en')
  await page.locator('[data-purpose="solution-row"] a').first().click()
  await expect(panel(page).locator('[data-purpose="check-work-result"]')).toHaveAttribute('data-verdict', 'has_error')
  await expect(steps(page).nth(1)).toHaveAttribute('data-state', 'mistake')
  await expect(panel(page).locator('[data-purpose="check-work-corrected"]')).toBeVisible()
  expect(calls.grades).toHaveLength(1)

  // Checking again from the Archive works and is saved too.
  await page.unroute('**/api/check-work')
  await mockCheck(page, { read: [{ body: CLEAN_READING }], grade: [{ body: CORRECT }] })
  await panel(page).getByRole('button', { name: en.solve.check.uploadAgain }).click()
  await checkWork(page, en, false)
  await expect(panel(page).locator('[data-purpose="check-work-result"]')).toHaveAttribute('data-verdict', 'correct')
  await expect.poll(() => savedSolutionExtras(page).then((all) => JSON.stringify(all[0]?.checkMyWork ?? null))).toContain('"verdict":"correct"')
})

test('@mobile check panel at 390px: confirm and result fit, actions stack full width, no console errors', async ({ page, mockSolve }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await mockSolve(MOCK_RESULT)
  await mockCheck(page, {
    read: [{ body: READING }],
    grade: [{ body: { ...HAS_ERROR, correctedStep: '$3x - 2x = 15 - 7 \\quad\\Rightarrow\\quad x = 8 \\text{ (a long corrected line)}$' } }],
  })
  await page.goto('/solve?lng=en')
  await solve(page)
  const row = page.locator('[data-purpose="solution-actions"]')
  const rowBox = (await row.boundingBox())!
  expect((await row.locator(':scope > button').first().boundingBox())!.width).toBeGreaterThan(rowBox.width - 2)

  const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  await readWork(page)
  const yes = confirmBox(page).getByRole('button', { name: en.solve.check.confirm.yes })
  await expect(yes).toBeVisible()
  const boxWidth = (await confirmBox(page).boundingBox())!.width
  expect((await yes.boundingBox())!.width).toBeGreaterThan(boxWidth - 40)
  await confirmBox(page).getByRole('button', { name: en.solve.check.confirm.fix }).click()
  await expect(confirmBox(page).getByRole('textbox')).toHaveCount(4)
  expect(await noOverflow()).toBe(true)
  await confirmBox(page).getByRole('button', { name: en.solve.check.confirm.checkEdited }).click()

  await expect(panel(page).locator('[data-purpose="check-work-result"]')).toBeVisible()
  const uploadAgain = (await panel(page).getByRole('button', { name: en.solve.check.uploadAgain }).boundingBox())!
  expect(uploadAgain.width).toBeGreaterThan((await panel(page).boundingBox())!.width - 60)
  expect(await noOverflow()).toBe(true)
  expect(errors).toEqual([])
})

for (const { lng, strings } of [
  { lng: 'en', strings: en },
  { lng: 'tr', strings: tr },
  { lng: 'hyw', strings: hyw },
]) {
  test(`check my solution is localized in ${lng}`, async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    const calls = await mockCheck(page, { read: [{ body: READING }], grade: [{ body: HAS_ERROR }, { body: UNSURE }] })
    await page.goto(`/solve?lng=${lng}`)
    await solve(page, strings)
    await page.getByRole('button', { name: strings.solve.actions.checkWork }).click()
    await expect(panel(page).getByRole('heading', { name: strings.solve.check.title })).toBeVisible()
    await expect(panel(page)).toContainText(strings.solve.check.dropTitle)
    await readWork(page, strings, false)
    await expect(confirmBox(page).getByRole('heading', { name: strings.solve.check.confirm.title })).toBeVisible()
    await expect(confirmBox(page)).toContainText(strings.solve.check.confirm.lowLine)
    await expect(confirmBox(page).getByRole('button', { name: strings.solve.check.confirm.fix })).toBeVisible()
    await confirmBox(page).getByRole('button', { name: strings.solve.check.confirm.yes }).click()
    await expect(summary(page)).toHaveText(fill(strings.solve.check.verdict.has_error, 2))
    await expect(panel(page)).toContainText(strings.solve.check.levels.mistake)
    await expect(panel(page)).toContainText(strings.solve.check.levels.ok)
    await expect(panel(page)).toContainText(strings.solve.check.errorTypes.sign)

    await panel(page).getByRole('button', { name: strings.solve.check.uploadAgain }).click()
    await checkWork(page, strings, false)
    await expect(summary(page)).toHaveText(fill(strings.solve.check.verdict.unsure, 2))
    await expect(panel(page)).toContainText(strings.solve.check.levels.unsure)
    expect(calls.reads[0].language).toBe(lng)
    expect(calls.grades[0].language).toBe(lng)
  })
}
