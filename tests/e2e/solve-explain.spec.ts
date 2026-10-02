import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { savedSolutionExtras } from './helpers'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import tr from '../../src/i18n/locales/tr.json' with { type: 'json' }
import hyw from '../../src/i18n/locales/hyw.json' with { type: 'json' }

const MOCK_RESULT = {
  topic: 'Linear equations',
  question: 'Solve for $x$: $3x + 7 = 2x + 15$',
  intro: 'The goal is to isolate $x$.',
  steps: ['Subtract $2x$ from both sides: $x + 7 = 15$', 'Subtract $7$ from both sides: $x = 8$', 'Check: $3(8) + 7 = 31 = 2(8) + 15$'],
  answer: '$x = 8$',
  tip: 'Do the same operation on both sides.',
  mistakes: ['Forgetting to change the sign when moving $7$ across.'],
  provider: 'openai',
  fallbackUsed: false,
}

interface ExplainRequest {
  question: string
  steps: string[]
  answer: string
  stepIndex: number
  level: 'simple' | 'simpler'
  previousExplanation?: string
  language: string
}

/** Mocks /api/explain-step; `respond` decides each reply from the request (default: a success echoing step + level). */
async function mockExplain(
  page: Page,
  respond: (request: ExplainRequest, call: number) => { status: number; body: unknown } = (request) => ({
    status: 200,
    body: {
      explanation: `${request.level === 'simple' ? 'Simple' : 'Simpler'} explanation of step ${request.stepIndex + 1}.`,
      example: request.level === 'simple' ? 'Mini example: $5 - 2 = 3$' : '',
      provider: 'openai',
      fallbackUsed: false,
    },
  }),
) {
  const requests: ExplainRequest[] = []
  await page.route('**/api/explain-step', async (route) => {
    const request = route.request().postDataJSON() as ExplainRequest
    requests.push(request)
    const { status, body } = respond(request, requests.length)
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
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

const steps = (page: Page) => page.locator('[data-purpose="solve-step"]')
const answer = (page: Page) => page.locator('[data-purpose="solve-answer"]')
const tryFirstSwitch = (page: Page, strings: typeof en = en) => page.getByRole('switch', { name: strings.solve.reveal.toggle })

test.describe('Solve — let me try first', () => {
  test('reveals one step at a time, answer last, moving focus to each new item', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await solve(page)
    await expect(steps(page)).toHaveCount(3)
    await expect(tryFirstSwitch(page)).toHaveAttribute('aria-checked', 'false')

    await tryFirstSwitch(page).click()
    await expect(tryFirstSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await expect(steps(page)).toHaveCount(0)
    await expect(answer(page)).toHaveCount(0)
    await expect(page.locator('[data-purpose="solve-mistakes"]')).toHaveCount(0)
    await expect(page.getByText(MOCK_RESULT.tip)).toHaveCount(0)
    await expect(page.locator('[data-purpose="solve-result"]')).toContainText('Solve for')

    const next = page.getByRole('button', { name: en.solve.reveal.next })
    for (let index = 0; index < 3; index += 1) {
      // Keyboard: Enter on the focused button reveals the next step.
      await next.focus()
      await page.keyboard.press('Enter')
      await expect(steps(page)).toHaveCount(index + 1)
      await expect(steps(page).nth(index)).toBeFocused()
      await expect(answer(page)).toHaveCount(0)
    }
    await next.click()
    await expect(answer(page)).toBeVisible()
    await expect(answer(page)).toBeFocused()
    await expect(page.locator('[data-purpose="reveal-controls"]')).toHaveCount(0)
    await expect(page.locator('[data-purpose="solve-mistakes"]')).toBeVisible()
    await expect(page.getByText(MOCK_RESULT.tip)).toBeVisible()
  })

  test('"Show all" reveals everything and focuses the first newly shown step', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await solve(page)
    await tryFirstSwitch(page).click()
    await page.getByRole('button', { name: en.solve.reveal.next }).click()
    await page.getByRole('button', { name: en.solve.reveal.showAll }).click()
    await expect(steps(page)).toHaveCount(3)
    await expect(answer(page)).toBeVisible()
    await expect(steps(page).nth(1)).toBeFocused()
  })

  test('the switch is remembered across reloads and new solutions', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await solve(page)
    await tryFirstSwitch(page).click()
    expect(await page.evaluate(() => localStorage.getItem('quelio.solveTryFirst.v1'))).toBe('1')

    await page.reload()
    await solve(page)
    await expect(tryFirstSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await expect(steps(page)).toHaveCount(0)

    await tryFirstSwitch(page).click()
    await expect(steps(page)).toHaveCount(3)
    expect(await page.evaluate(() => localStorage.getItem('quelio.solveTryFirst.v1'))).toBe('0')
  })

  test('works when localStorage throws', { tag: '@cross' }, async ({ page, mockSolve }) => {
    await page.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new Error('blocked')
      }
      Storage.prototype.setItem = () => {
        throw new Error('blocked')
      }
    })
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await solve(page)
    await tryFirstSwitch(page).click()
    await expect(steps(page)).toHaveCount(0)
  })
})

test.describe('Solve — explain this step', () => {
  test('explain, then even simpler; repeats are served from cache', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    const requests = await mockExplain(page)
    await page.goto('/solve?lng=en')
    await solve(page)

    const step2 = steps(page).nth(1)
    const explainButton = step2.getByRole('button', { name: en.solve.explain.button })
    await explainButton.click()
    await expect(step2.locator('[data-purpose="step-explanation-simple"]')).toContainText('Simple explanation of step 2.')
    await expect(step2.locator('[data-purpose="step-explanation-simple"]')).toContainText(en.solve.explain.exampleLabel)
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ stepIndex: 1, level: 'simple', question: MOCK_RESULT.question, steps: MOCK_RESULT.steps, language: 'en' })

    await step2.getByRole('button', { name: en.solve.explain.simpler }).click()
    await expect(step2.locator('[data-purpose="step-explanation-simpler"]')).toContainText('Simpler explanation of step 2.')
    expect(requests).toHaveLength(2)
    expect(requests[1].level).toBe('simpler')
    expect(requests[1].previousExplanation).toContain('Simple explanation of step 2.')

    // Hide and show again: no new request.
    await explainButton.click()
    await expect(step2.locator('[data-purpose="step-explanation-simple"]')).toHaveCount(0)
    await expect(explainButton).toHaveAttribute('aria-expanded', 'false')
    await explainButton.click()
    await expect(step2.locator('[data-purpose="step-explanation-simple"]')).toBeVisible()
    await expect(step2.locator('[data-purpose="step-explanation-simpler"]')).toBeVisible()
    expect(requests).toHaveLength(2)
  })

  test('errors are localized and retryable; rate limit has no retry', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    const requests = await mockExplain(page, (_request, call) =>
      call === 1
        ? { status: 502, body: { error: 'upstream' } }
        : call === 2
          ? { status: 200, body: { explanation: 'Now it works.', example: '' } }
          : { status: 429, body: { error: 'rate_limited' } },
    )
    await page.goto('/solve?lng=en')
    await solve(page)

    const step1 = steps(page).nth(0)
    await step1.getByRole('button', { name: en.solve.explain.button }).click()
    const error = step1.locator('[data-purpose="step-explanation-error"]')
    await expect(error).toContainText(en.solve.explain.errors.upstream)
    await error.getByRole('button', { name: en.solve.explain.retry }).click()
    await expect(step1.locator('[data-purpose="step-explanation-simple"]')).toContainText('Now it works.')

    const step3 = steps(page).nth(2)
    await step3.getByRole('button', { name: en.solve.explain.button }).click()
    await expect(step3.locator('[data-purpose="step-explanation-error"]')).toContainText(en.solve.explain.errors.rate_limited)
    await expect(step3.getByRole('button', { name: en.solve.explain.retry })).toHaveCount(0)
    expect(requests).toHaveLength(3)
  })

  test('explanations are saved with the solution and reused when reopened from the Archive', { tag: '@cross' }, async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    const requests = await mockExplain(page)
    await page.goto('/solve?lng=en')
    await solve(page)
    await steps(page).nth(0).getByRole('button', { name: en.solve.explain.button }).click()
    await expect(steps(page).nth(0).locator('[data-purpose="step-explanation-simple"]')).toBeVisible()
    expect(requests).toHaveLength(1)
    // The write lands asynchronously (after the solution's own save); wait for it before navigating away.
    await expect.poll(() => savedSolutionExtras(page).then((all) => all.some((extras) => 'stepExplanations' in extras))).toBe(true)

    await page.goto('/archive?tab=solutions&lng=en')
    await page.locator('[data-purpose="solution-row"] a').first().click()
    await expect(page.locator('[data-purpose="solve-result"]')).toBeVisible()
    await steps(page).nth(0).getByRole('button', { name: en.solve.explain.button }).click()
    await expect(steps(page).nth(0).locator('[data-purpose="step-explanation-simple"]')).toContainText('Simple explanation of step 1.')
    expect(requests).toHaveLength(1)

    // A new explanation in the reopened view is saved too.
    await steps(page).nth(2).getByRole('button', { name: en.solve.explain.button }).click()
    await steps(page).nth(2).getByRole('button', { name: en.solve.explain.simpler }).click()
    await expect(steps(page).nth(2).locator('[data-purpose="step-explanation-simpler"]')).toBeVisible()
    expect(requests).toHaveLength(3)
    await expect
      .poll(() => savedSolutionExtras(page).then((all) => JSON.stringify(all[0]?.stepExplanations ?? {}).includes('Simpler explanation of step 3.')))
      .toBe(true)
    await page.reload()
    const step3 = steps(page).nth(2)
    await step3.getByRole('button', { name: en.solve.explain.button }).click()
    await step3.getByRole('button', { name: en.solve.explain.simpler }).click()
    await expect(step3.locator('[data-purpose="step-explanation-simpler"]')).toContainText('Simpler explanation of step 3.')
    expect(requests).toHaveLength(3)

    // "Let me try first" works in the reopened view as well.
    await tryFirstSwitch(page).click()
    await expect(steps(page)).toHaveCount(0)
    await page.getByRole('button', { name: en.solve.reveal.next }).click()
    await expect(steps(page).nth(0)).toBeFocused()
  })

  for (const { lng, strings } of [
    { lng: 'en', strings: en },
    { lng: 'tr', strings: tr },
    { lng: 'hyw', strings: hyw },
  ]) {
    test(`reveal and explain are localized in ${lng}`, async ({ page, mockSolve }) => {
      await mockSolve(MOCK_RESULT)
      const requests = await mockExplain(page)
      await page.goto(`/solve?lng=${lng}`)
      await solve(page, strings)
      await steps(page).nth(1).getByRole('button', { name: strings.solve.explain.button }).click()
      await expect(steps(page).nth(1).getByRole('button', { name: strings.solve.explain.simpler })).toBeVisible()
      expect(requests[0].language).toBe(lng)
      await tryFirstSwitch(page, strings).click()
      await expect(page.getByRole('button', { name: strings.solve.reveal.next })).toBeVisible()
      await expect(page.getByRole('button', { name: strings.solve.reveal.showAll })).toBeVisible()
    })
  }

  test('@mobile reveal and explain fit at 390px with stacked full-width actions', async ({ page, mockSolve }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mockSolve(MOCK_RESULT)
    await mockExplain(page)
    await page.goto('/solve?lng=en')
    await solve(page)
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
    await steps(page).nth(0).getByRole('button', { name: en.solve.explain.button }).click()
    await steps(page).nth(0).getByRole('button', { name: en.solve.explain.simpler }).click()
    await expect(steps(page).nth(0).locator('[data-purpose="step-explanation-simpler"]')).toBeVisible()
    expect(await overflow()).toBe(false)

    await tryFirstSwitch(page).click()
    const card = (await page.locator('[data-purpose="solve-result"] section').boundingBox())!
    for (const name of [en.solve.reveal.next, en.solve.reveal.showAll]) {
      const box = (await page.getByRole('button', { name }).boundingBox())!
      expect(box.width).toBeGreaterThan(card.width - 60)
    }
    expect(await overflow()).toBe(false)
  })
})
