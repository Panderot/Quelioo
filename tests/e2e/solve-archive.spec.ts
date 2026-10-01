import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
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
  mistakes: ['Forgetting to change the sign when moving $7$ across.'],
  provider: 'openai',
  fallbackUsed: false,
}

interface SeedRecord {
  id: string
  createdAt: string
  topic: string
  question: string
  /** Omit the newer fields entirely to mimic a record saved before they existed. */
  legacy?: boolean
  thumbnail?: boolean
}

/** Writes records straight into the app's IndexedDB store (the page must already be on the app origin). */
async function seedSolutions(page: Page, records: SeedRecord[]) {
  await page.evaluate(async (items) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('quelio-solutions', 1)
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('solutions', { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    let thumbnail: { type: string; bytes: ArrayBuffer } | null = null
    if (items.some((item) => item.thumbnail)) {
      const canvas = document.createElement('canvas')
      canvas.width = 120
      canvas.height = 80
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#c33'
      ctx.fillRect(0, 0, 120, 80)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
      thumbnail = blob ? { type: 'image/jpeg', bytes: await blob.arrayBuffer() } : null
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('solutions', 'readwrite')
      const store = tx.objectStore('solutions')
      for (const item of items) {
        store.put(
          item.legacy
            ? {
                id: item.id,
                createdAt: item.createdAt,
                result: { topic: item.topic, question: item.question, steps: ['Only step'], answer: '42', tip: 'Old tip' },
              }
            : {
                id: item.id,
                schemaVersion: 1,
                createdAt: item.createdAt,
                thumbnail: item.thumbnail ? thumbnail : null,
                language: 'en',
                result: {
                  topic: item.topic,
                  question: item.question,
                  intro: '',
                  steps: ['Step one'],
                  answer: '1',
                  tip: '',
                  mistakes: [],
                },
                extras: {},
              },
        )
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, records)
}

async function storedIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('quelio-solutions', 1)
      // Same schema as the app, in case this runs before the app first opened the store.
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('solutions', { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const all = await new Promise<{ id: string; createdAt: string }[]>((resolve) => {
      const request = db.transaction('solutions', 'readonly').objectStore('solutions').getAll()
      request.onsuccess = () => resolve(request.result)
    })
    db.close()
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((entry) => entry.id)
  })
}

async function makePng(page: Page, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    ({ w, h }) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#123'
      ctx.font = `${Math.round(h / 8)}px serif`
      ctx.fillText('3x + 7 = 2x + 15', w / 10, h / 2)
      return canvas.toDataURL('image/png').split(',')[1]
    },
    { w: width, h: height },
  )
  return Buffer.from(base64, 'base64')
}

async function solveOnce(page: Page, strings: typeof en = en, size = { width: 2000, height: 1500 }) {
  await page.locator('input[type="file"]').setInputFiles({ name: 'q.png', mimeType: 'image/png', buffer: await makePng(page, size.width, size.height) })
  await page.getByRole('button', { name: strings.crop.useWhole }).click({ timeout: 15_000 })
  await page.getByRole('button', { name: strings.solve.cta.solve, exact: true }).click()
  await expect(page.locator('[data-purpose="solve-result"]')).toBeVisible()
}

const solutionsTab = (page: Page, strings: typeof en = en) => page.getByRole('tab', { name: strings.archive.tabs.solutions })
const quizzesTab = (page: Page, strings: typeof en = en) => page.getByRole('tab', { name: strings.archive.tabs.quizzes })

test.describe('Archive Solutions tab', () => {
  test('tabs keep their state in the URL across reload and back/forward', async ({ page }) => {
    await page.goto('/archive?lng=en')
    await expect(quizzesTab(page)).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[data-purpose="archive-empty-state"]')).toBeVisible()

    await solutionsTab(page).click()
    await expect(page).toHaveURL(/tab=solutions/)
    await expect(solutionsTab(page)).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[data-purpose="solutions-empty-state"]')).toBeVisible()

    await page.reload()
    await expect(solutionsTab(page)).toHaveAttribute('aria-selected', 'true')

    await page.goBack()
    await expect(quizzesTab(page)).toHaveAttribute('aria-selected', 'true')
    await expect(page).not.toHaveURL(/tab=solutions/)
    await page.goForward()
    await expect(solutionsTab(page)).toHaveAttribute('aria-selected', 'true')

    // Keyboard: arrows move between tabs.
    await solutionsTab(page).focus()
    await page.keyboard.press('ArrowLeft')
    await expect(quizzesTab(page)).toHaveAttribute('aria-selected', 'true')
    await expect(quizzesTab(page)).toBeFocused()

    // Empty state links to Solve.
    await solutionsTab(page).click()
    await page.getByRole('link', { name: en.archive.solutions.empty.cta }).click()
    await expect(page).toHaveURL(/\/solve/)
  })

  test('a successful solve is saved automatically and reopens in the same view', async ({ page, mockSolve }) => {
    test.setTimeout(45_000)
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await solveOnce(page)
    const solvedText = await page.locator('[data-purpose="solve-result"] section').innerText()
    await expect.poll(() => storedIds(page).then((ids) => ids.length)).toBe(1)

    await page.goto('/archive?tab=solutions&lng=en')
    const row = page.locator('[data-purpose="solution-row"]')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText(MOCK_RESULT.topic)
    const thumb = row.locator('img')
    await expect(thumb).toBeVisible()
    const natural = await thumb.evaluate(async (img: HTMLImageElement) => {
      await img.decode()
      return { w: img.naturalWidth, h: img.naturalHeight }
    })
    expect(Math.max(natural.w, natural.h)).toBeLessThanOrEqual(800)
    expect(natural.w).toBeGreaterThan(400)

    await row.getByRole('link').click()
    await expect(page).toHaveURL(/\/archive\/solutions\//)
    await expect(page.locator('[data-purpose="solution-thumbnail"]')).toBeVisible()
    await expect(page.locator('[data-purpose="solve-intro"]')).toContainText('The goal is to isolate')
    await expect(page.locator('[data-purpose="solve-mistakes"]')).toBeVisible()
    expect(await page.locator('[data-purpose="solve-result"] section').innerText()).toBe(solvedText)

    await page.reload()
    await expect(page.locator('[data-purpose="solve-result"]')).toBeVisible()
    await page.getByRole('link', { name: en.archive.solutions.detail.backToSolutions }).click()
    await expect(solutionsTab(page)).toHaveAttribute('aria-selected', 'true')
  })

  test('search filters by any solution text', async ({ page }) => {
    await page.goto('/archive?tab=solutions&lng=en')
    await seedSolutions(page, [
      { id: 'a', createdAt: '2026-01-03T10:00:00.000Z', topic: 'Fractions', question: 'Add $1/2 + 1/3$', thumbnail: true },
      { id: 'b', createdAt: '2026-01-02T10:00:00.000Z', topic: 'Geometry', question: 'Find the hypotenuse' },
      { id: 'c', createdAt: '2026-01-01T10:00:00.000Z', topic: 'Percentages', question: 'What is 20% of 50?' },
    ])
    await page.reload()
    const rows = page.locator('[data-purpose="solution-row"]')
    await expect(rows).toHaveCount(3)
    await expect(rows.first()).toContainText('Fractions')

    const search = page.getByRole('searchbox', { name: en.archive.solutions.searchPlaceholder })
    await search.fill('hypoten')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Geometry')
    await search.fill('step one')
    await expect(rows).toHaveCount(3)
    await search.fill('zzz nothing')
    await expect(page.locator('[data-purpose="solutions-no-matches"]')).toBeVisible()
  })

  test('delete asks for confirmation and can be undone', async ({ page }) => {
    await page.goto('/archive?tab=solutions&lng=en')
    await seedSolutions(page, [
      { id: 'a', createdAt: '2026-01-03T10:00:00.000Z', topic: 'Fractions', question: 'Q1' },
      { id: 'b', createdAt: '2026-01-02T10:00:00.000Z', topic: 'Geometry', question: 'Q2' },
      { id: 'c', createdAt: '2026-01-01T10:00:00.000Z', topic: 'Percentages', question: 'Q3' },
    ])
    await page.reload()
    const rows = page.locator('[data-purpose="solution-row"]')
    await expect(rows).toHaveCount(3)

    await page.getByRole('button', { name: en.archive.solutions.deleteLabel.replace('{{topic}}', 'Geometry') }).click()
    await expect(page.getByText(en.archive.solutions.confirmDelete)).toBeVisible()
    await page.getByRole('button', { name: en.create.question.cancelAction }).click()
    await expect(rows).toHaveCount(3)

    await page.getByRole('button', { name: en.archive.solutions.deleteLabel.replace('{{topic}}', 'Geometry') }).click()
    await page.getByRole('button', { name: en.archive.solutions.delete, exact: true }).click()
    await expect(rows).toHaveCount(2)
    await expect(page.getByRole('status')).toContainText(en.archive.solutions.deletedUndo)
    expect(await storedIds(page)).toEqual(['a', 'c'])

    await page.getByRole('button', { name: en.create.question.undo }).click()
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(1)).toContainText('Geometry')
    expect(await storedIds(page)).toEqual(['a', 'b', 'c'])

    // Without undo the delete persists.
    await page.getByRole('button', { name: en.archive.solutions.deleteLabel.replace('{{topic}}', 'Fractions') }).click()
    await page.getByRole('button', { name: en.archive.solutions.delete, exact: true }).click()
    await expect(rows).toHaveCount(2)
    await page.reload()
    await expect(rows).toHaveCount(2)
    await expect(rows.first()).toContainText('Geometry')
  })

  test('the store is capped at the latest 300 solutions', async ({ page, mockSolve }) => {
    test.setTimeout(45_000)
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    const base = Date.UTC(2020, 0, 1)
    await seedSolutions(
      page,
      Array.from({ length: 300 }, (_, index) => ({
        id: `old-${String(index).padStart(3, '0')}`,
        createdAt: new Date(base + index * 60_000).toISOString(),
        topic: `Old ${index}`,
        question: 'Old question',
      })),
    )
    await solveOnce(page, en, { width: 800, height: 600 })
    // Wait for the new (non-seeded) record, then check the oldest one was evicted.
    await expect.poll(() => storedIds(page).then((ids) => ids.some((id) => !id.startsWith('old-')))).toBe(true)
    await expect.poll(() => storedIds(page).then((ids) => ids.length)).toBe(300)
    const ids = await storedIds(page)
    expect(ids).not.toContain('old-000')
    expect(ids).toContain('old-001')
    expect(ids[0].startsWith('old-')).toBe(false)
  })

  test('storage full: Solve still works and the note shows only once', async ({ page, mockSolve }) => {
    await page.addInitScript(() => {
      IDBObjectStore.prototype.put = function put() {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
    })
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await solveOnce(page, en, { width: 800, height: 600 })
    await expect(page.locator('[data-purpose="solve-save-note"]')).toHaveText(en.solve.saveUnavailable)

    await page.getByRole('button', { name: en.solve.cta.solve, exact: true }).click()
    await expect(page.locator('[data-purpose="solve-result"]')).toBeVisible()
    await expect(page.locator('[data-purpose="solve-save-note"]')).toHaveCount(0)
  })

  test('IndexedDB unavailable: Solve still works with the note, Archive shows the empty state', async ({ page, mockSolve }) => {
    test.setTimeout(45_000)
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true })
    })
    await mockSolve(MOCK_RESULT)
    await page.goto('/solve?lng=en')
    await solveOnce(page, en, { width: 800, height: 600 })
    await expect(page.locator('[data-purpose="solve-save-note"]')).toBeVisible()
    await page.goto('/archive?tab=solutions&lng=en')
    await expect(page.locator('[data-purpose="solutions-empty-state"]')).toBeVisible()
  })

  test('an old record without the newer fields still lists and opens', async ({ page }) => {
    await page.goto('/archive?tab=solutions&lng=en')
    await seedSolutions(page, [{ id: 'legacy', createdAt: '2025-05-05T10:00:00.000Z', topic: 'Old topic', question: 'Old question', legacy: true }])
    await page.reload()
    const row = page.locator('[data-purpose="solution-row"]')
    await expect(row).toContainText('Old topic')
    await expect(row.locator('img')).toHaveCount(0)
    await row.getByRole('link').click()
    await expect(page.locator('[data-purpose="solve-result"]')).toContainText('Old question')
    await expect(page.locator('[data-purpose="solve-answer"]')).toContainText('42')
    await expect(page.locator('[data-purpose="solve-mistakes"]')).toHaveCount(0)
    await expect(page.locator('[data-purpose="solve-intro"]')).toHaveCount(0)
  })

  test('an unknown solution id shows the not-found state', async ({ page }) => {
    await page.goto('/archive/solutions/does-not-exist?lng=en')
    await expect(page.locator('[data-purpose="solution-not-found"]')).toContainText(en.archive.solutions.detail.notFoundTitle)
  })

  for (const { lng, strings } of [
    { lng: 'en', strings: en },
    { lng: 'tr', strings: tr },
    { lng: 'hyw', strings: hyw },
  ]) {
    test(`tabs and list are localized in ${lng}`, async ({ page }) => {
      await page.goto(`/archive?lng=${lng}`)
      await expect(quizzesTab(page, strings)).toBeVisible()
      await solutionsTab(page, strings).click()
      await expect(page.getByText(strings.archive.solutions.empty.title)).toBeVisible()
      await seedSolutions(page, [{ id: 'x', createdAt: '2026-01-01T10:00:00.000Z', topic: 'T', question: 'Q' }])
      await page.reload()
      await expect(page.getByRole('searchbox', { name: strings.archive.solutions.searchPlaceholder })).toBeVisible()
      await page.getByRole('button', { name: strings.archive.solutions.deleteLabel.replace('{{topic}}', 'T') }).click()
      await expect(page.getByText(strings.archive.solutions.confirmDelete)).toBeVisible()
    })
  }

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`@mobile rows align with no sideways overflow at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/archive?tab=solutions&lng=en')
      await seedSolutions(page, [
        { id: 'a', createdAt: '2026-01-03T10:00:00.000Z', topic: 'A very long topic name that keeps going and going well past the row width', question: '$\\frac{1}{2} + \\frac{1}{3} = ?$ and a long tail of words that must truncate', thumbnail: true },
        { id: 'b', createdAt: '2026-01-02T10:00:00.000Z', topic: 'Short', question: 'Q' },
      ])
      await page.reload()
      const rows = page.locator('[data-purpose="solution-row"]')
      await expect(rows).toHaveCount(2)
      const thumbs = [await rows.nth(0).locator('a > span').first().boundingBox(), await rows.nth(1).locator('a > span').first().boundingBox()]
      expect(Math.abs(thumbs[0]!.x - thumbs[1]!.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(thumbs[0]!.width - thumbs[1]!.width)).toBeLessThanOrEqual(1)
      const trash = [await rows.nth(0).getByRole('button').boundingBox(), await rows.nth(1).getByRole('button').boundingBox()]
      expect(Math.abs(trash[0]!.x - trash[1]!.x)).toBeLessThanOrEqual(1)

      await rows.nth(0).getByRole('button').click()
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(await overflow()).toBe(false)
      await page.getByRole('button', { name: en.archive.solutions.delete, exact: true }).click()
      expect(await overflow()).toBe(false)
    })
  }
})
