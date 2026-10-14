import type { Page } from '@playwright/test'

import { test, expect } from './strict'
import { fixtureBuffer, MOCK_RESULT, pickPhoto, solveButton, solveError, solveResult } from './fullSolveHelpers'
import { savedSolutionExtras } from './helpers'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import tr from '../../src/i18n/locales/tr.json' with { type: 'json' }
import hyw from '../../src/i18n/locales/hyw.json' with { type: 'json' }

type Reply =
  | { kind: 'json'; status?: number; body: unknown }
  | { kind: 'raw'; status: number; body: string; contentType?: string }
  | { kind: 'offline' }

/** Scripted /api/solve: the n-th request gets the n-th reply (the last one repeats). */
async function scriptSolve(page: Page, replies: Reply[]) {
  const requests: unknown[] = []
  await page.route('**/api/solve', async (route) => {
    requests.push(route.request().postDataJSON())
    const reply = replies[Math.min(requests.length - 1, replies.length - 1)]
    if (reply.kind === 'offline') {
      // Same error name Chromium uses when the device is offline (the shared fixture ignores its console line).
      await route.abort('internetdisconnected')
    } else if (reply.kind === 'raw') {
      await route.fulfill({ status: reply.status, contentType: reply.contentType ?? 'text/plain', body: reply.body })
    } else {
      await route.fulfill({ status: reply.status ?? 200, contentType: 'application/json', body: JSON.stringify(reply.body) })
    }
  })
  return { requests: () => requests }
}

const OK: Reply = { kind: 'json', body: MOCK_RESULT }

const more = (page: Page) => page.locator('[data-purpose="solution-actions"]').getByRole('button', { name: en.solve.actions.more })

test.describe('Solve (full) — the solution view', () => {
  test('steps, intro, answer, tip and mistake render, with KaTeX formulas instead of raw LaTeX', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await pickPhoto(page)
    await solveButton(page).click()
    const result = solveResult(page)
    await expect(result).toBeVisible()

    await expect(result).toContainText(MOCK_RESULT.topic)
    await expect(result.locator('ol > li')).toHaveCount(MOCK_RESULT.steps.length)
    await expect(result.locator('[data-purpose="solve-intro"]')).toContainText('The goal is to isolate')
    await expect(result.locator('[data-purpose="solve-answer"]')).toContainText(en.solve.result.answerLabel)
    await expect(result.locator('[data-purpose="solve-mistakes"]')).toContainText('Forgetting to change the sign')
    await expect(result).toContainText(MOCK_RESULT.tip)

    // Every formula is typeset (question 2 + intro 1 + steps 4 + answer 1 + mistake 1 at least) and no "$" is left over.
    expect(await result.locator('.katex').count()).toBeGreaterThanOrEqual(6)
    await expect(result.locator('.katex-error')).toHaveCount(0)
    expect(await result.innerText()).not.toContain('$')
  })

  test('the loading state shows "Solving...", disables the button, and a double click sends one request', async ({ page, mockSolve }) => {
    const handle = await mockSolve(MOCK_RESULT, { delayMs: 600 })
    await page.goto('/solve?lng=en')
    await pickPhoto(page)
    await solveButton(page).dblclick()
    await expect(solveButton(page)).toContainText(en.solve.cta.solving)
    await expect(solveButton(page)).toBeDisabled()
    await expect(solveButton(page)).toHaveAttribute('aria-busy', 'true')
    await expect(solveResult(page)).toBeVisible()
    await expect(solveButton(page)).toBeEnabled()
    expect(handle.requests()).toHaveLength(1)
  })

  test('the request carries the cropped JPEG, the UI language and the note', async ({ page, mockSolve }) => {
    const handle = await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=tr')
    await pickPhoto(page, 'plain.jpg', 'image/jpeg', tr.crop.useWhole)
    await page.getByLabel(tr.solve.note.label).fill('2. adımı anlamadım')
    await solveButton(page).click()
    await expect(solveResult(page)).toBeVisible()
    const [request] = handle.requests() as { imageBase64: string; mimeType: string; language: string; note: string }[]
    expect(request).toMatchObject({ mimeType: 'image/jpeg', language: 'tr', note: '2. adımı anlamadım' })
    expect(request.imageBase64.startsWith('data:image/jpeg')).toBe(true)
  })

  test('the solution is saved and listed in Archive > Solutions', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await pickPhoto(page)
    await solveButton(page).click()
    await expect(solveResult(page)).toBeVisible()
    await expect.poll(() => savedSolutionExtras(page).then((all) => all.length)).toBe(1)

    await page.goto('/archive?tab=solutions&lng=en')
    const rows = page.locator('[data-purpose="solution-row"]')
    await expect(rows).toHaveCount(1)
    await expect(rows).toContainText(MOCK_RESULT.topic)
  })

  test('"Make flashcards" sends the solution to the card maker and the deck shows up in Flashcards', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    const cardRequests: Record<string, unknown>[] = []
    await page.route('**/api/cards', async (route) => {
      cardRequests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          cards: [
            { front: 'What must you do to both sides of an equation?', back: 'The same operation' },
            { front: 'Common mistake when moving $7$?', back: 'Forgetting the sign change' },
          ],
          removed: 0,
        }),
      })
    })
    await page.goto('/solve?lng=en')
    await pickPhoto(page)
    await solveButton(page).click()
    await expect(solveResult(page)).toBeVisible()

    await more(page).click()
    await page.getByRole('menuitem', { name: en.flashcards.solution.action }).click()
    const dialog = page.locator('[data-purpose="add-cards-dialog"]')
    await expect(dialog.locator('[data-purpose="review-card"]')).toHaveCount(2)
    expect(cardRequests).toHaveLength(1)
    expect(cardRequests[0]).toMatchObject({ mode: 'solution' })
    await dialog.getByRole('button', { name: 'Add 2 cards' }).click()
    await expect(dialog.getByRole('status')).toContainText(MOCK_RESULT.topic)

    await page.goto('/flashcards?lng=en')
    const deck = page.locator('[data-purpose="deck-row"]')
    await expect(deck).toHaveCount(1)
    await expect(deck).toContainText(MOCK_RESULT.topic)
    await expect(deck).toContainText('2 cards')
  })

  test('"Create a quiz on this topic" opens Create with the solution as readable text (no LaTeX)', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await pickPhoto(page)
    await solveButton(page).click()
    await expect(solveResult(page)).toBeVisible()

    await more(page).click()
    await page.getByRole('menuitem', { name: en.solve.cta.createQuiz }).click()
    await expect(page).toHaveURL(/\/($|\?)/)
    const box = page.locator('#quiz-content-input')
    await expect(box).toBeVisible()
    await expect(box).toHaveValue(new RegExp(`${en.solve.prefill.topicLabel}: ${MOCK_RESULT.topic}`))
    await expect(box).toHaveValue(new RegExp(`${en.solve.prefill.stepsLabel}:`))
    expect(await box.inputValue()).not.toContain('$')
  })

  test('"Check my solution", "Similar problem" and "Solve another way" are all reachable from the solved view', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await pickPhoto(page)
    await solveButton(page).click()
    await expect(solveResult(page)).toBeVisible()

    const actions = page.locator('[data-purpose="solution-actions"]')
    await expect(actions.getByRole('button', { name: en.solve.actions.checkWork })).toBeEnabled()
    await expect(actions.getByRole('button', { name: en.solve.actions.similar })).toBeEnabled()
    await more(page).click()
    await expect(page.getByRole('menuitem')).toHaveText([en.solve.actions.anotherWay, en.solve.cta.createQuiz, en.flashcards.solution.action])
  })
})

test.describe('Solve (full) — errors', () => {
  const cases: { name: string; reply: Reply; statuses: number[]; message: string }[] = [
    { name: 'server error 500 (upstream)', reply: { kind: 'json', status: 500, body: { error: 'upstream' } }, statuses: [500], message: en.solve.errors.upstream },
    { name: 'server error 500 without a known code', reply: { kind: 'json', status: 500, body: { error: 'boom' } }, statuses: [500], message: en.solve.errors.upstream },
    { name: 'rate limit 429', reply: { kind: 'json', status: 429, body: { error: 'rate_limited' } }, statuses: [429], message: en.solve.errors.rate_limited },
    { name: 'gateway timeout 504 with a plain-text body', reply: { kind: 'raw', status: 504, body: 'FUNCTION_INVOCATION_TIMEOUT' }, statuses: [504], message: en.solve.errors.parse },
    { name: 'malformed JSON in a 200', reply: { kind: 'raw', status: 200, body: '{"topic": "Linear', contentType: 'application/json' }, statuses: [], message: en.solve.errors.parse },
    { name: 'valid JSON of the wrong shape', reply: { kind: 'json', body: { hello: 'world' } }, statuses: [], message: en.solve.errors.parse },
    { name: 'unreadable photo', reply: { kind: 'json', status: 422, body: { error: 'unreadable' } }, statuses: [422], message: en.solve.errors.unreadable },
    { name: 'no math in the photo', reply: { kind: 'json', status: 422, body: { error: 'not_math' } }, statuses: [422], message: en.solve.errors.not_math },
    { name: 'solver not configured', reply: { kind: 'json', status: 503, body: { error: 'not_configured' } }, statuses: [503], message: en.solve.errors.not_configured },
    { name: 'the request is cut (offline)', reply: { kind: 'offline' }, statuses: [], message: en.solve.errors.network },
  ]

  for (const { name, reply, statuses, message } of cases) {
    test(`${name}: a clear message, the page stays alive, and Solve works again`, async ({ page, strict }) => {
      if (statuses.length > 0) strict.allow(/\/api\/solve/, statuses)
      const handle = await scriptSolve(page, [reply, OK])
      await page.goto('/solve?lng=en')
      await pickPhoto(page)
      await solveButton(page).click()

      await expect(solveError(page)).toContainText(message)
      await expect(solveError(page)).toHaveAttribute('role', 'alert')
      await expect(solveResult(page)).toHaveCount(0)
      // The photo stays, so "try again" is just pressing Solve again.
      await expect(page.locator('[data-purpose="solve-cropped-preview"]')).toBeVisible()
      await expect(solveButton(page)).toBeEnabled()
      await expect(solveButton(page)).toContainText(en.solve.cta.solve)

      await solveButton(page).click()
      await expect(solveResult(page)).toBeVisible()
      await expect(solveError(page)).toHaveCount(0)
      expect(handle.requests()).toHaveLength(2)
    })
  }

  test('"Try another photo" after an error returns to the empty state', async ({ page, strict }) => {
    strict.allow(/\/api\/solve/, 500)
    await scriptSolve(page, [{ kind: 'json', status: 500, body: { error: 'upstream' } }])
    await page.goto('/solve?lng=en')
    await pickPhoto(page)
    await solveButton(page).click()
    await expect(solveError(page)).toBeVisible()
    await page.getByRole('button', { name: en.solve.errors.tryAnother }).click()
    await expect(solveError(page)).toHaveCount(0)
    await expect(page.locator('[data-purpose="solve-upload-card"] [role="button"]')).toBeVisible()
    await expect(solveButton(page)).toBeDisabled()
  })

  for (const [lng, strings] of [['tr', tr], ['hyw', hyw]] as const) {
    test(`${lng}: a 500 and a cut request show the message in the user's language`, async ({ page, strict }) => {
      strict.allow(/\/api\/solve/, 500)
      await scriptSolve(page, [{ kind: 'json', status: 500, body: { error: 'upstream' } }, { kind: 'offline' }])
      await page.goto(`/solve?lng=${lng}`)
      await pickPhoto(page, 'plain.jpg', 'image/jpeg', strings.crop.useWhole)
      await solveButton(page).click()
      await expect(solveError(page)).toContainText(strings.solve.errors.upstream)
      await solveButton(page).click()
      await expect(solveError(page)).toContainText(strings.solve.errors.network)
      expect(strings.solve.errors.upstream).not.toBe(en.solve.errors.upstream)
    })
  }

  test('a failed photo does not leave a saved solution behind', async ({ page, strict }) => {
    strict.allow(/\/api\/solve/, 500)
    await scriptSolve(page, [{ kind: 'json', status: 500, body: { error: 'upstream' } }])
    await page.goto('/solve?lng=en')
    await pickPhoto(page)
    await solveButton(page).click()
    await expect(solveError(page)).toBeVisible()
    expect(await savedSolutionExtras(page)).toEqual([])
  })

  test('a too-small photo never reaches the server', async ({ page }) => {
    const handle = await scriptSolve(page, [OK])
    await page.goto('/solve?lng=en')
    await page.locator('[data-purpose="solve-upload-card"] input[type="file"]').setInputFiles({
      name: 'too-small.jpg',
      mimeType: 'image/jpeg',
      buffer: fixtureBuffer('too-small.jpg'),
    })
    await expect(solveError(page)).toContainText(en.solve.errors.too_small)
    expect(handle.requests()).toHaveLength(0)
  })
})
