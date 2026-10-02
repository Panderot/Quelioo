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
  mistakes: ['Forgetting to change the sign.'],
  provider: 'openai',
  fallbackUsed: false,
}

const similarProblem = (n: number, answer = 8) => ({
  question: `Practice ${n}: solve $5x - 3 = 4x + ${answer - 3}$`,
  steps: [`Subtract $4x$: $x - 3 = ${answer - 3}$`, `Add $3$: $x = ${answer}$`],
  answer: `$x = ${answer}$`,
  checkValue: String(answer),
  provider: 'openai',
  fallbackUsed: false,
})

type Json = Record<string, unknown>

/** Routes an endpoint to a scripted list of replies (the last one repeats); records request bodies. */
async function script(page: Page, url: string, replies: { status?: number; body: unknown }[]) {
  const requests: Json[] = []
  await page.route(url, async (route: Route) => {
    requests.push(route.request().postDataJSON() as Json)
    const reply = replies[Math.min(requests.length - 1, replies.length - 1)]
    await route.fulfill({ status: reply.status ?? 200, contentType: 'application/json', body: JSON.stringify(reply.body) })
  })
  return requests
}

async function solve(page: Page, strings: typeof en = en) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 400
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 800, 400)
    ctx.fillStyle = '#123'
    ctx.font = '48px serif'
    ctx.fillText('3x + 7 = 2x + 15', 80, 220)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await page.locator('input[type="file"]').setInputFiles({ name: 'q.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') })
  await page.getByRole('button', { name: strings.crop.useWhole }).click({ timeout: 15_000 })
  await page.getByRole('button', { name: strings.solve.cta.solve, exact: true }).click()
  await expect(page.locator('[data-purpose="solve-result"]')).toBeVisible()
}

const items = (page: Page) => page.locator('[data-purpose="similar-item"]')

async function openAnotherWay(page: Page, strings: typeof en = en) {
  await page.getByRole('button', { name: strings.solve.actions.more }).click()
  await page.getByRole('menuitem', { name: strings.solve.actions.anotherWay }).click()
}

test.describe('Solve — similar problem', () => {
  test('answers are compared for equivalence; wrong ones are rejected without a server call', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await script(page, '**/api/similar', [{ body: similarProblem(1) }])
    const grades = await script(page, '**/api/grade', [{ body: { verdict: 'incorrect', feedback: 'Not a number.', covered: 0, total: 1 } }])
    await page.goto('/solve?lng=en')
    await solve(page)
    await page.getByRole('button', { name: en.solve.actions.similar }).click()

    const card = items(page).first()
    await expect(card).toContainText('Practice 1')
    const input = card.getByLabel(en.solve.similar.answerLabel)
    const verdict = card.locator('[data-purpose="similar-verdict"]')
    for (const answer of ['8', '8.0', '8,0', '16/2', 'x=8', 'x = 8']) {
      await input.fill(answer)
      await card.getByRole('button', { name: en.solve.similar.check }).click()
      await expect(verdict, answer).toHaveAttribute('data-verdict', 'correct')
      await input.fill('')
      await expect(card.getByRole('button', { name: en.solve.similar.check })).toBeDisabled()
    }
    for (const answer of ['7', 'x = 9', '80', '-8', '0.8']) {
      await input.fill(answer)
      await card.getByRole('button', { name: en.solve.similar.check }).click()
      await expect(verdict, answer).toHaveAttribute('data-verdict', 'incorrect')
    }
    await expect(verdict).toContainText(en.solve.similar.verdict.incorrect)
    expect(grades).toHaveLength(0)

    // Not a simple value: graded on the server.
    await input.fill('eight')
    await input.press('Enter')
    await expect(card).toContainText('Not a number.')
    expect(grades).toHaveLength(1)
    expect(grades[0]).toMatchObject({ type: 'short-answer', studentAnswer: 'eight', modelAnswer: '$x = 8$' })
  })

  test('show solution, explain inside it, and "Another one" sends the avoid list', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    const similar = await script(page, '**/api/similar', [{ body: similarProblem(1) }, { body: similarProblem(2, 5) }])
    const explains = await script(page, '**/api/explain-step', [{ body: { explanation: 'Because both sides change equally.', example: '' } }])
    await page.goto('/solve?lng=en')
    await solve(page)
    await page.getByRole('button', { name: en.solve.actions.similar }).click()
    await expect(items(page)).toHaveCount(1)
    expect(similar[0]).toMatchObject({ question: MOCK_RESULT.question, topic: MOCK_RESULT.topic, avoid: [], language: 'en' })

    const first = items(page).first()
    await expect(first.locator('[data-purpose="similar-solution"]')).toHaveCount(0)
    await first.getByRole('button', { name: en.solve.similar.showSolution }).click()
    await expect(first.locator('[data-purpose="similar-step"]')).toHaveCount(2)
    await expect(first.locator('[data-purpose="similar-answer"]')).toContainText('8')
    await first.locator('[data-purpose="similar-step"]').nth(1).getByRole('button', { name: en.solve.explain.button }).click()
    await expect(first.locator('[data-purpose="step-explanation-simple"]')).toContainText('Because both sides change equally.')
    expect(explains[0]).toMatchObject({ question: similarProblem(1).question, stepIndex: 1 })

    await page.getByRole('button', { name: en.solve.similar.another }).click()
    await expect(items(page)).toHaveCount(2)
    expect(similar[1].avoid).toEqual([similarProblem(1).question])
    // Checking reveals the solution automatically.
    const second = items(page).nth(1)
    await second.getByLabel(en.solve.similar.answerLabel).fill('5')
    await second.getByRole('button', { name: en.solve.similar.check }).click()
    await expect(second.locator('[data-purpose="similar-verdict"]')).toHaveAttribute('data-verdict', 'correct')
    await expect(second.locator('[data-purpose="similar-solution"]')).toBeVisible()

    // Pressing "Similar problem" again keeps the list and makes no request.
    await page.getByRole('button', { name: en.solve.actions.similar }).click()
    await expect(items(page)).toHaveCount(2)
    expect(similar).toHaveLength(2)
  })

  test('errors are localized; retry works; the hourly limit has no retry', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await script(page, '**/api/similar', [
      { status: 422, body: { error: 'unverified' } },
      { body: similarProblem(1) },
      { status: 429, body: { error: 'rate_limited' } },
    ])
    await page.goto('/solve?lng=en')
    await solve(page)
    await page.getByRole('button', { name: en.solve.actions.similar }).click()
    const error = page.locator('[data-purpose="similar-error"]')
    await expect(error).toContainText(en.solve.similar.errors.unverified)
    await error.getByRole('button', { name: en.solve.explain.retry }).click()
    await expect(items(page)).toHaveCount(1)
    await page.getByRole('button', { name: en.solve.similar.another }).click()
    await expect(error).toContainText(en.solve.similar.errors.rate_limited)
    await expect(error.getByRole('button')).toHaveCount(0)
  })
})

test.describe('Solve — another way', () => {
  test('shows a different method; reopening uses the cache', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    const requests = await script(page, '**/api/another-way', [
      { body: { kind: 'method', method: 'Balance model', steps: ['Take $2x$ off each pan.', 'Take $7$ off each pan: $x = 8$'], answer: '$x = 8$' } },
    ])
    await page.goto('/solve?lng=en')
    await solve(page)
    await openAnotherWay(page)
    const panel = page.locator('[data-purpose="another-way-panel"]')
    await expect(panel.getByRole('heading')).toHaveText('Another way: Balance model')
    await expect(panel.locator('[data-purpose="another-way-step"]')).toHaveCount(2)
    await expect(panel.locator('[data-purpose="another-way-answer"]')).toContainText('8')
    expect(requests[0]).toMatchObject({ question: MOCK_RESULT.question, steps: MOCK_RESULT.steps, answer: MOCK_RESULT.answer })

    await openAnotherWay(page)
    await expect(panel.locator('[data-purpose="another-way-step"]')).toHaveCount(2)
    expect(requests).toHaveLength(1)
  })

  test('"no other method" note, with a localized fallback when the note is empty', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await script(page, '**/api/another-way', [{ body: { kind: 'none', note: '' } }])
    await page.goto('/solve?lng=en')
    await solve(page)
    await openAnotherWay(page)
    await expect(page.locator('[data-purpose="another-way-none"]')).toHaveText(en.solve.anotherWay.noOtherFallback)
  })

  test('a non-equivalent method error is localized and retryable', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await script(page, '**/api/another-way', [
      { status: 422, body: { error: 'mismatch' } },
      { body: { kind: 'none', note: 'This is a one-step equation; there is no other sensible way.' } },
    ])
    await page.goto('/solve?lng=en')
    await solve(page)
    await openAnotherWay(page)
    const error = page.locator('[data-purpose="another-way-error"]')
    await expect(error).toContainText(en.solve.anotherWay.errors.mismatch)
    await error.getByRole('button', { name: en.solve.explain.retry }).click()
    await expect(page.locator('[data-purpose="another-way-none"]')).toContainText('one-step equation')
  })
})

test('similar problems, answers and the other method are saved and reopen from the Archive', { tag: '@cross' }, async ({ page, mockSolve }) => {
  await mockSolve(MOCK_RESULT)
  const similar = await script(page, '**/api/similar', [{ body: similarProblem(1) }])
  const another = await script(page, '**/api/another-way', [{ body: { kind: 'method', method: 'Guess and check', steps: ['Try $x = 8$: $31 = 31$.'], answer: '$x = 8$' } }])
  await page.goto('/solve?lng=en')
  await solve(page)
  await page.getByRole('button', { name: en.solve.actions.similar }).click()
  await items(page).first().getByLabel(en.solve.similar.answerLabel).fill('x = 7')
  await items(page).first().getByRole('button', { name: en.solve.similar.check }).click()
  await expect(items(page).first().locator('[data-purpose="similar-verdict"]')).toHaveAttribute('data-verdict', 'incorrect')
  await openAnotherWay(page)
  await expect(page.locator('[data-purpose="another-way-step"]')).toHaveCount(1)
  await expect
    .poll(() => savedSolutionExtras(page).then((all) => all.some((extras) => 'similarProblems' in extras && 'anotherWay' in extras)))
    .toBe(true)

  await page.goto('/archive?tab=solutions&lng=en')
  await page.locator('[data-purpose="solution-row"] a').first().click()
  await expect(items(page)).toHaveCount(1)
  await expect(items(page).first().getByLabel(en.solve.similar.answerLabel)).toHaveValue('x = 7')
  await expect(items(page).first().locator('[data-purpose="similar-verdict"]')).toHaveAttribute('data-verdict', 'incorrect')
  await expect(items(page).first().locator('[data-purpose="similar-solution"]')).toBeVisible()
  await expect(page.locator('[data-purpose="another-way-panel"]')).toContainText('Guess and check')
  expect(similar).toHaveLength(1)
  expect(another).toHaveLength(1)

  // A new answer in the reopened view is saved too.
  await items(page).first().getByLabel(en.solve.similar.answerLabel).fill('8')
  await items(page).first().getByRole('button', { name: en.solve.similar.check }).click()
  await expect(items(page).first().locator('[data-purpose="similar-verdict"]')).toHaveAttribute('data-verdict', 'correct')
  await expect.poll(() => savedSolutionExtras(page).then((all) => JSON.stringify(all[0]?.similarProblems ?? []).includes('"verdict":"correct"'))).toBe(true)
  await page.reload()
  await expect(items(page).first().locator('[data-purpose="similar-verdict"]')).toHaveAttribute('data-verdict', 'correct')
})

test('the More menu works with the keyboard', async ({ page, mockSolve }) => {
  await mockSolve(MOCK_RESULT)
  const requests = await script(page, '**/api/another-way', [{ body: { kind: 'none', note: 'Only one way.' } }])
  await page.goto('/solve?lng=en')
  await solve(page)
  const more = page.getByRole('button', { name: en.solve.actions.more })
  await more.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitem', { name: en.solve.actions.anotherWay })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(more).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-purpose="another-way-none"]')).toContainText('Only one way.')
  expect(requests).toHaveLength(1)
})

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`@mobile actions row layout at ${viewport.width}px`, async ({ page, mockSolve }) => {
    await page.setViewportSize(viewport)
    await mockSolve(MOCK_RESULT)
    await script(page, '**/api/similar', [{ body: similarProblem(1) }])
    await page.goto('/solve?lng=en')
    await solve(page)
    const row = page.locator('[data-purpose="solution-actions"]')
    const buttons = row.locator(':scope > button, :scope > div > button')
    await expect(buttons).toHaveCount(3)
    const boxes = await Promise.all([0, 1, 2].map(async (index) => (await buttons.nth(index).boundingBox())!))
    const rowBox = (await row.boundingBox())!
    if (viewport.width > 640) {
      expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1)
    } else {
      for (const box of boxes) expect(box.width).toBeGreaterThan(rowBox.width - 2)
      expect(boxes[1].y).toBeGreaterThan(boxes[0].y)
    }
    await page.getByRole('button', { name: en.solve.actions.similar }).click()
    await expect(items(page)).toHaveCount(1)
    await page.getByRole('button', { name: en.solve.actions.more }).click()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    expect(overflow).toBe(false)
  })
}

for (const { lng, strings } of [
  { lng: 'en', strings: en },
  { lng: 'tr', strings: tr },
  { lng: 'hyw', strings: hyw },
]) {
  test(`similar and another way are localized in ${lng}`, async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    const similar = await script(page, '**/api/similar', [{ body: similarProblem(1) }])
    await script(page, '**/api/another-way', [{ body: { kind: 'none', note: '' } }])
    await page.goto(`/solve?lng=${lng}`)
    await solve(page, strings)
    await page.getByRole('button', { name: strings.solve.actions.similar }).click()
    await expect(page.getByRole('heading', { name: strings.solve.similar.title })).toBeVisible()
    await expect(items(page).first().getByLabel(strings.solve.similar.answerLabel)).toBeVisible()
    await expect(page.getByRole('button', { name: strings.solve.similar.another })).toBeVisible()
    expect(similar[0].language).toBe(lng)
    await openAnotherWay(page, strings)
    await expect(page.locator('[data-purpose="another-way-none"]')).toHaveText(strings.solve.anotherWay.noOtherFallback)
  })
}
