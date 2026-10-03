import type { Page } from '@playwright/test'

import { test, expect } from './fixtures'
import { fillText, SHORT_TEXT } from './helpers'
import { SAMPLE_QUIZ } from '../fixtures/quiz'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }

// Unfinished work must survive switching pages from the menu, browser back/forward and a reload.

const MOCK_RESULT = {
  topic: 'Linear equations',
  question: 'Solve for x: $3x + 7 = 2x + 15$',
  intro: 'The goal is to isolate $x$.',
  steps: ['Subtract $2x$ from both sides: $x + 7 = 15$', 'Subtract $7$ from both sides: $x = 8$'],
  answer: '$x = 8$',
  tip: 'Do the same operation on both sides.',
  mistakes: [],
  provider: 'openai',
  fallbackUsed: false,
}

const nav = (page: Page, label: string) => page.locator('aside').getByRole('link', { name: new RegExp(`^${label}`) }).click()

async function makePng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 640, 480)
    ctx.fillStyle = '#c33'
    ctx.fillRect(0, 0, 320, 240)
    ctx.fillStyle = '#33c'
    ctx.fillRect(320, 240, 320, 240)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  return Buffer.from(base64, 'base64')
}

async function uploadPhoto(page: Page) {
  await page.goto('/solve?lng=en')
  await page.locator('input[type="file"]').setInputFiles({ name: 'q.png', mimeType: 'image/png', buffer: await makePng(page) })
  await expect(page.locator('[data-purpose="crop-box"]')).toBeVisible({ timeout: 15_000 })
}

/** The crop box relative to the stage, in percent — independent of layout timing. */
async function cropBoxPercent(page: Page) {
  return page.locator('[data-purpose="crop-box"]').evaluate((box: HTMLElement) => {
    const stage = box.parentElement!.getBoundingClientRect()
    const rect = box.getBoundingClientRect()
    const round = (value: number) => Math.round(value * 100)
    return {
      x: round((rect.left - stage.left) / stage.width),
      y: round((rect.top - stage.top) / stage.height),
      w: round(rect.width / stage.width),
      h: round(rect.height / stage.height),
    }
  })
}

/** Resolves once the Solve draft in IndexedDB matches `check` (saves are debounced). */
async function waitForSolveDraft(page: Page, check: 'photo' | 'result' | 'none') {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string>((resolve) => {
            const request = indexedDB.open('quelio-page-drafts')
            request.onerror = () => resolve('none')
            request.onsuccess = () => {
              const db = request.result
              if (!db.objectStoreNames.contains('drafts')) return resolve('none')
              const get = db.transaction('drafts').objectStore('drafts').get('solve')
              get.onsuccess = () => {
                const data = get.result?.data
                resolve(!data ? 'none' : data.result ? 'result' : 'photo')
              }
              get.onerror = () => resolve('none')
            }
          }),
      ),
    )
    .toBe(check)
}

/** Moves and shrinks the crop box with the keyboard, then rotates the photo. */
async function editCrop(page: Page) {
  await page.getByRole('button', { name: en.crop.rotateRight }).click()
  const box = page.locator('[data-purpose="crop-box"]')
  await box.focus()
  for (let i = 0; i < 8; i += 1) await page.keyboard.press('Shift+ArrowLeft')
  for (let i = 0; i < 6; i += 1) await page.keyboard.press('Shift+ArrowUp')
  for (let i = 0; i < 4; i += 1) await page.keyboard.press('ArrowRight')
}

async function solveWholePhoto(page: Page) {
  await page.getByRole('button', { name: en.crop.useWhole }).click()
  await expect(page.locator('[data-purpose="solve-cropped-preview"]')).toBeVisible()
  await page.getByRole('button', { name: en.solve.cta.solve }).click()
  await expect(page.locator('[data-purpose="solve-answer"]')).toBeVisible()
}

test.describe('Solve keeps its work', () => {
  test('photo, rotation and crop box survive going to Create and back, and a reload @cross', async ({ page }) => {
    await uploadPhoto(page)
    await editCrop(page)
    const before = await cropBoxPercent(page)
    expect(before.w).toBeLessThan(100)

    await nav(page, en.nav.create)
    await expect(page.getByRole('button', { name: 'Generate Quiz' })).toBeVisible()
    await expect(page.locator('[data-purpose="crop-box"]')).toHaveCount(0)
    await nav(page, en.nav.solve)
    await expect(page.locator('[data-purpose="crop-box"]')).toBeVisible()
    expect(await cropBoxPercent(page)).toEqual(before)

    await waitForSolveDraft(page, 'photo')
    await page.reload()
    await expect(page.locator('[data-purpose="crop-box"]')).toBeVisible({ timeout: 15_000 })
    const after = await cropBoxPercent(page)
    for (const key of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(after[key] - before[key])).toBeLessThanOrEqual(1)
    // Rotated 90°: the 640×480 photo is shown portrait.
    const stage = await page.locator('[data-purpose="crop-stage"]').boundingBox()
    expect(stage!.height).toBeGreaterThan(stage!.width)
  })

  test('a confirmed crop and the result survive navigation, back/forward and a reload', async ({ page, mockSolve }) => {
    const solve = await mockSolve(MOCK_RESULT)
    await uploadPhoto(page)
    await solveWholePhoto(page)

    await nav(page, en.nav.archive)
    await expect(page.locator('[data-purpose="solve-result"]')).toHaveCount(0)
    await page.goBack()
    await expect(page.locator('[data-purpose="solve-answer"]')).toBeVisible()
    await expect(page.locator('[data-purpose="solve-cropped-preview"]')).toBeVisible()
    await page.goForward()
    await expect(page.locator('[data-purpose="solve-result"]')).toHaveCount(0)
    await page.goBack()
    await expect(page.locator('[data-purpose="solve-answer"]')).toBeVisible()

    await waitForSolveDraft(page, 'result')
    await page.reload()
    await expect(page.locator('[data-purpose="solve-answer"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-purpose="solve-cropped-preview"]')).toBeVisible()
    await expect(page.getByRole('button', { name: en.solve.cta.solve })).toBeEnabled()
    expect(solve.requests()).toHaveLength(1)
  })

  test('leaving while Solve is running still shows the result on return, with one request', async ({ page, mockSolve }) => {
    const solve = await mockSolve(MOCK_RESULT, { delayMs: 1500 })
    await uploadPhoto(page)
    await page.getByRole('button', { name: en.crop.useWhole }).click()
    await page.getByRole('button', { name: en.solve.cta.solve }).click()
    await expect(page.getByRole('button', { name: en.solve.cta.solving })).toBeVisible()

    await nav(page, en.nav.create)
    await expect(page.getByRole('button', { name: 'Generate Quiz' })).toBeVisible()
    await expect.poll(() => solve.requests().length).toBe(1)
    await nav(page, en.nav.solve)
    await expect(page.locator('[data-purpose="solve-answer"]')).toBeVisible({ timeout: 10_000 })
    expect(solve.requests()).toHaveLength(1)
  })

  test('"New question" clears the photo and result, also after a reload', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await uploadPhoto(page)
    await solveWholePhoto(page)
    await waitForSolveDraft(page, 'result')

    await page.getByRole('button', { name: en.solve.upload.newQuestion }).click()
    await expect(page.locator('[data-purpose="solve-result"]')).toHaveCount(0)
    await expect(page.locator('[data-purpose="solve-cropped-preview"]')).toHaveCount(0)
    await waitForSolveDraft(page, 'none')
    await page.reload()
    await expect(page.getByRole('button', { name: en.solve.cta.solve })).toBeDisabled()
    await expect(page.locator('[data-purpose="crop-box"]')).toHaveCount(0)
  })

  test('a draft older than 24 hours is dropped', async ({ page }) => {
    await uploadPhoto(page)
    await waitForSolveDraft(page, 'photo')
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('quelio-page-drafts')
          request.onsuccess = () => {
            const store = request.result.transaction('drafts', 'readwrite').objectStore('drafts')
            const get = store.get('solve')
            get.onsuccess = () => {
              const put = store.put({ ...get.result, savedAt: Date.now() - 25 * 60 * 60 * 1000 })
              put.onsuccess = () => resolve()
              put.onerror = () => reject(put.error)
            }
          }
          request.onerror = () => reject(request.error)
        }),
    )
    await page.reload()
    await expect(page.getByRole('button', { name: en.solve.cta.solve })).toBeDisabled()
    await expect(page.locator('[data-purpose="crop-box"]')).toHaveCount(0)
    await waitForSolveDraft(page, 'none')
  })
})

test.describe('Create keeps its work', () => {
  test('fetched URL text survives navigation and a reload', async ({ page, mockExtractUrl }) => {
    const extract = await mockExtractUrl({ title: 'Sample Article', text: SHORT_TEXT, wordCount: 53, truncated: false })
    await page.goto('/?lng=en')
    await page.getByRole('tab', { name: 'URL' }).click()
    await page.getByPlaceholder('Paste a link to an article or webpage...').fill('https://example.com/article')
    await page.getByRole('button', { name: 'Fetch' }).click()
    await expect(page.getByText('Sample Article')).toBeVisible()

    await nav(page, en.nav.solve)
    await nav(page, en.nav.create)
    await expect(page.getByText('Sample Article')).toBeVisible()

    // Debounced saves (draft 500 ms, page draft 300 ms) — wait for both before reloading.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('quelio.draft.v1')?.includes('example.com') ?? false)).toBe(true)
    await page.waitForFunction(
      () =>
        new Promise<boolean>((resolve) => {
          const request = indexedDB.open('quelio-page-drafts')
          request.onsuccess = () => {
            const get = request.result.transaction('drafts').objectStore('drafts').get('create')
            get.onsuccess = () => resolve(Boolean(get.result?.data?.url))
            get.onerror = () => resolve(false)
          }
          request.onerror = () => resolve(false)
        }),
    )
    await page.reload()
    await expect(page.getByText('Sample Article')).toBeVisible()
    expect(extract.requests()).toHaveLength(1)
  })

  test('a generation in progress finishes while away, and answers survive navigation', async ({ page }) => {
    const requests: unknown[] = []
    await page.route('**/api/generate', async (route) => {
      requests.push(route.request().postDataJSON())
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SAMPLE_QUIZ) })
    })
    await page.goto('/?lng=en')
    await fillText(page, SHORT_TEXT)
    await page.getByRole('button', { name: 'Generate Quiz' }).click()
    await expect.poll(() => requests.length).toBe(1)

    await nav(page, en.nav.solve)
    await expect(page.getByRole('heading', { level: 1, name: en.solve.title })).toBeVisible()
    await nav(page, en.nav.create)
    const card = page.locator('[data-purpose="question-card"]', { hasText: 'Which gas do plants absorb' })
    await expect(card).toBeVisible({ timeout: 10_000 })
    expect(requests).toHaveLength(1)

    await card.getByRole('radio', { name: /Carbon dioxide/ }).check()
    await card.getByRole('button', { name: 'Check answer' }).click()
    await nav(page, en.nav.archive)
    await page.goBack()
    await expect(card.getByRole('radio', { name: /Carbon dioxide/ })).toBeChecked()

    // After a reload the generated quiz comes back (answers are not kept across reloads).
    await page.reload()
    await expect(page.locator('[data-purpose="question-card"]', { hasText: 'Which gas do plants absorb' })).toBeVisible()
    expect(requests).toHaveLength(1)
  })
})

test.describe('Other pages keep their work', () => {
  test('quiz answers in the Archive survive leaving and coming back', async ({ page, seedArchive }) => {
    await seedArchive([
      {
        id: 'keep-state-quiz',
        title: SAMPLE_QUIZ.title,
        createdAt: '2026-01-01T00:00:00.000Z',
        source: 'text',
        questionType: 'mixed',
        difficulty: 'medium',
        questionCount: '6',
        optionsCount: null,
        outputLanguage: 'auto',
        sourceText: 'Seeded source text.',
        quiz: { title: SAMPLE_QUIZ.title, questions: SAMPLE_QUIZ.questions },
      },
    ])
    await page.goto('/archive/keep-state-quiz?lng=en')
    const card = page.locator('[data-purpose="question-card"]', { hasText: 'Great Wall' })
    await card.getByRole('radio', { name: 'False' }).check()

    await nav(page, en.nav.solve)
    await page.goBack()
    await expect(card.getByRole('radio', { name: 'False' })).toBeChecked()
  })

  test('Flashcards search survives navigation and a reload', async ({ page }) => {
    await page.goto('/flashcards?lng=en')
    await page.getByRole('button', { name: 'Add sample decks' }).click()
    const search = page.getByRole('searchbox')
    await search.fill('zzz-no-match')
    await nav(page, en.nav.solve)
    await nav(page, en.nav.flashcards)
    await expect(page.getByRole('searchbox')).toHaveValue('zzz-no-match')
    await page.reload()
    await expect(page.getByRole('searchbox')).toHaveValue('zzz-no-match')
  })

  test('Archive solutions search survives leaving the page and a reload', async ({ page, mockSolve }) => {
    await mockSolve(MOCK_RESULT)
    await uploadPhoto(page)
    await solveWholePhoto(page)
    await nav(page, en.nav.archive)
    await page.getByRole('tab', { name: en.archive.tabs.solutions }).click()
    await page.getByRole('searchbox').fill('linear')
    await nav(page, en.nav.solve)
    await expect(page.locator('[data-purpose="solve-answer"]')).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('searchbox')).toHaveValue('linear')
    await page.reload()
    await expect(page.getByRole('searchbox')).toHaveValue('linear')
  })
})
