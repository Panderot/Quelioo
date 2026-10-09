import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import { chooseOption, fillText } from './helpers'
import { SAMPLE_QUIZ } from '../fixtures/quiz'

// Audio Lesson (/lessons, /lessons/:id) with a mocked /api/lesson. Server logic has its own spec
// (lesson-api.spec.ts); this one covers the pages, storage, the shared owner gate and i18n.

const TEXT = Array.from({ length: 8 }, (_, i) => `Photosynthesis sentence ${['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'][i]} explains how plants use light to make sugar.`).join(' ')

const archiveEntry = (id: string, title: string) => ({
  id,
  title,
  createdAt: '2026-01-01T00:00:00.000Z',
  source: 'text' as const,
  questionType: 'mixed',
  difficulty: 'medium',
  questionCount: '6',
  optionsCount: null,
  outputLanguage: 'auto',
  sourceText: TEXT,
  quiz: { title, questions: SAMPLE_QUIZ.questions },
})

const keyPoints = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `K${i + 1}`, text: `Key point ${i + 1} about light`, source: `Sentence ${i + 1}.`, topic: `T${i + 1}` }))

function splitPlan(sizes: number[]) {
  let index = 0
  return sizes.map((size, part) => ({ part: part + 1, keyPointIds: Array.from({ length: size }, () => `K${++index}`) }))
}

function episodeBody(part: number, ids: string[], options: { issueLine?: boolean; missing?: string[] } = {}) {
  let n = 0
  const line = (speaker: string, text: string, extra: Record<string, unknown> = {}) => ({ id: `p${part}-L${++n}`, speaker, text, ...extra })
  const sections = [
    ...(part > 1 ? [{ id: `p${part}-S0`, role: 'recall', title: 'Remember last time', keyPointIds: [], lines: [line('teacher', 'What did we learn last time?'), line('student', 'Light makes sugar.')] }] : []),
    { id: `p${part}-S1`, role: 'opening', title: 'Why is a leaf green?', keyPointIds: [], lines: [line('teacher', 'Why is a leaf green and not red?')] },
    ...ids.map((id, index) => ({
      id: `p${part}-S${index + 2}`,
      role: 'teach',
      title: `All about ${id}`,
      keyPointIds: [id],
      lines: [
        line('teacher', `First line about ${id}.`, options.issueLine && index === 0 ? { issue: 'wrong:Chlorophyll reflects green light.' } : {}),
        line('student', `Second line about ${id}.`),
        line('teacher', `Think about ${id} for a second...`, { pause: true }),
      ],
    })),
    { id: `p${part}-S90`, role: 'selfcheck', title: part === 3 ? 'Whole series check' : 'Quick check', keyPointIds: ids, lines: [line('teacher', 'Where does it happen?')] },
    { id: `p${part}-S91`, role: 'tip', title: 'Tip', keyPointIds: [], lines: [line('teacher', 'Review these with flashcards tomorrow.')] },
  ]
  const missing = options.missing ?? []
  return {
    episode: {
      part,
      title: `Light lesson part ${part}`,
      sections,
      check: { ran: true, passed: !options.issueLine && missing.length === 0, missingKeyPointIds: missing, rewrittenLineIds: options.issueLine ? [`p${part}-L2`] : [] },
      wordCount: 812,
      estimatedSeconds: 361,
    },
    usage: { costUsd: 0.047, cachedShare: 0.21, calls: 2 },
  }
}

interface LessonMock {
  requests: () => { action: string; body: Record<string, unknown>; code: string | undefined }[]
}

async function mockLesson(
  page: Page,
  options: { plan: { keyPoints: unknown[]; episodes: { part: number; keyPointIds: string[] }[] }; requiresAccessCode?: boolean; episode?: (part: number, ids: string[]) => unknown; check?: unknown },
): Promise<LessonMock> {
  const requests: { action: string; body: Record<string, unknown>; code: string | undefined }[] = []
  await page.route('**/api/lesson', async (route) => {
    const request = route.request()
    if (request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requiresAccessCode: options.requiresAccessCode ?? false }) })
      return
    }
    const body = request.postDataJSON() as Record<string, unknown>
    const code = request.headers()['x-owner-access']
    requests.push({ action: body.action as string, body, code })
    if (options.requiresAccessCode && code !== 'right-code') {
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'locked' }) })
      return
    }
    let reply: unknown = { ok: true }
    if (body.action === 'plan') reply = { title: 'Light and sugar', ...options.plan, usage: { costUsd: 0.001, cachedShare: 0, calls: 1 } }
    if (body.action === 'script') {
      const part = body.part as number
      const ids = options.plan.episodes[part - 1].keyPointIds
      reply = options.episode ? options.episode(part, ids) : episodeBody(part, ids)
    }
    if (body.action === 'check') reply = options.check
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) })
  })
  return { requests: () => requests }
}

async function mockSongStatus(page: Page, requiresAccessCode = false) {
  await page.route('**/api/song', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, provider: 'demo', maxSeconds: 120, requiresAccessCode }) })
  })
}

async function startNewLesson(page: Page, text = TEXT) {
  await page.getByRole('button', { name: 'New lesson' }).first().click()
  await fillText(page, text)
}

async function writeSingleLesson(page: Page) {
  await page.getByRole('button', { name: 'Plan the lesson' }).click()
  await page.getByRole('button', { name: 'Write the lesson' }).click()
  await expect(page).toHaveURL(/\/lessons\/[\w-]+$/)
}

test.describe('Audio Lesson — navigation', () => {
  test('sidebar order, localized tab title and active item', async ({ page }) => {
    await mockSongStatus(page)
    await mockLesson(page, { plan: { keyPoints: keyPoints(4), episodes: splitPlan([4]) } })
    await page.goto('/lessons')
    const sidebar = page.locator('[data-purpose="sidebar-navigation"]')
    await expect(sidebar.locator('nav a')).toHaveText(['Create', 'Solve', 'Songs', 'Flashcards', 'Live Game', 'Audio Lesson'])
    await expect(sidebar.locator('[data-purpose="sidebar-footer"] a')).toHaveText(['Archive'])
    await expect(page).toHaveTitle('Audio Lesson - Quelio')
    await expect(page.getByRole('heading', { level: 1, name: 'Audio Lesson' })).toBeVisible()
    await expect(page.getByText('Turn any text into a short lesson you can listen to')).toBeVisible()
    await expect(sidebar.getByRole('link', { name: 'Audio Lesson' }).locator('span.bg-amber')).toHaveCount(1)
  })

  test('mobile drawer has the Audio Lesson item @mobile', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile-only: the drawer trigger is hidden at desktop width')
    await mockSongStatus(page)
    await page.goto('/')
    await page.getByRole('button', { name: 'Open navigation menu' }).click()
    await page.locator('[data-purpose="sidebar-navigation"]').getByRole('link', { name: 'Audio Lesson' }).click()
    await expect(page).toHaveURL(/\/lessons$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Audio Lesson' })).toBeVisible()
  })
})

test.describe('Audio Lesson — create, list and edit', () => {
  test('new lesson from text with every option; list, search, delete with undo @cross', async ({ page }) => {
    const mock = await mockLesson(page, { plan: { keyPoints: keyPoints(4), episodes: splitPlan([4]) } })
    await page.goto('/lessons')
    await expect(page.locator('[data-purpose="lessons-empty"]')).toBeVisible()
    await startNewLesson(page)
    await expect(page.getByText('Use 30 to 5,000 words per lesson.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mark as focus' })).toHaveCount(0)
    await expect(page.getByText('Length follows your text (up to about 6 minutes per episode)')).toBeVisible()

    await page.getByRole('radio', { name: 'Teacher and student' }).click()
    await chooseOption(page, 'Level', 'YKS')
    await page.getByRole('radio', { name: 'Fun' }).click()
    await expect(page.getByText('Playful, but every fact stays correct and age-appropriate.')).toBeVisible()
    await chooseOption(page, 'Output Language:', 'Türkçe')

    await page.getByRole('button', { name: 'Plan the lesson' }).click()
    const plan = page.locator('[data-purpose="lesson-plan"]')
    await expect(plan).toContainText(/This text will be one episode of about \d+ minutes/)
    await expect(plan).toContainText('4 key points')
    await expect(plan).not.toContainText('$')
    await expect(plan).not.toContainText(/cost/i)
    expect(mock.requests()[0].body).toMatchObject({ action: 'plan', level: 'yks', language: 'tr', text: TEXT })

    await page.getByRole('button', { name: 'Write the lesson' }).click()
    await expect(page).toHaveURL(/\/lessons\/[\w-]+$/)
    expect(mock.requests()[1].body).toMatchObject({ action: 'script', part: 1, style: 'teacher_student', level: 'yks', tone: 'fun', language: 'tr' })
    expect((mock.requests()[1].body.episodes as unknown[]).length).toBe(1)
    await expect(page.getByRole('heading', { level: 1, name: 'Light and sugar' })).toBeVisible()
    await expect(page.locator('[data-purpose="coverage-summary"]')).toHaveText('4/4 key points covered')
    await expect(page.getByText('Every line was fact-checked against your text.')).toBeVisible()
    await expect(page.getByText('About 6:01 · 812 words')).toBeVisible()
    await expect(page.locator('[data-purpose="lesson-part-cost"]')).toHaveCount(0)
    await expect(page.locator('[data-purpose="lesson-total-cost"]')).toHaveCount(0)
    await expect(page.locator('[data-purpose="script-line"]').first()).toContainText('Teacher')
    await page.locator('[data-purpose="coverage-summary"]').click()
    await expect(page.locator('[data-purpose="key-point-list"] li').first()).toContainText('Taught in: All about K1')

    await page.getByRole('link', { name: 'Back to lessons' }).click()
    const row = page.locator('[data-purpose="lesson-row"]')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Light and sugar')
    await expect(row).toContainText('Script ready')
    await expect(row).toContainText('1 episode')
    await expect(row).toContainText('Teacher and student')

    const search = page.getByRole('textbox', { name: 'Search lessons...' })
    await search.fill('volcano')
    await expect(page.getByText('No lessons match your search.')).toBeVisible()
    await search.fill('light')
    await expect(row).toHaveCount(1)

    await row.getByRole('button', { name: 'Delete' }).click()
    await expect(row.getByText('Delete this lesson?')).toBeVisible()
    await row.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(row).toHaveCount(0)
    await page.getByRole('status').getByRole('button', { name: 'Undo' }).click()
    await expect(row).toHaveCount(1)
    await page.reload()
    await expect(page.locator('[data-purpose="lesson-row"]')).toHaveCount(1)

    // Same source and options again: key points come from the cache and the existing lesson is offered.
    await startNewLesson(page)
    await page.getByRole('radio', { name: 'Teacher and student' }).click()
    await chooseOption(page, 'Level', 'YKS')
    await page.getByRole('radio', { name: 'Fun' }).click()
    await chooseOption(page, 'Output Language:', 'Türkçe')
    await page.getByRole('button', { name: 'Plan the lesson' }).click()
    await expect(page.locator('[data-purpose="lesson-existing"]')).toBeVisible()
    expect(mock.requests().filter((entry) => entry.action === 'plan')).toHaveLength(1)
    await page.locator('[data-purpose="lesson-existing"]').getByRole('link', { name: 'Open it' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Light and sugar' })).toBeVisible()
    expect(mock.requests().filter((entry) => entry.action === 'script')).toHaveLength(1)
  })

  test('fact-check warnings, line editing, reorder and re-check @cross', async ({ page }) => {
    const mock = await mockLesson(page, {
      plan: { keyPoints: keyPoints(4), episodes: splitPlan([4]) },
      episode: (part, ids) => episodeBody(part, ids, { issueLine: true, missing: ['K2'] }),
      check: { ...episodeBody(1, ['K1', 'K2', 'K3', 'K4']).episode, usage: { costUsd: 0.001, cachedShare: 0, calls: 1 } },
    })
    await page.goto('/lessons')
    await startNewLesson(page)
    await page.getByRole('radio', { name: 'Teacher and student' }).click()
    await writeSingleLesson(page)

    const status = page.locator('[data-purpose="check-status"]')
    await expect(status).toContainText('1 line needs checking before you rely on it.')
    await expect(status).toContainText('Key points still missing: Key point 2 about light')
    await expect(page.locator('[data-purpose="coverage-summary"]')).toHaveText('3/4 key points covered')
    await expect(page.locator('[data-purpose="line-issue"]')).toHaveText('Check this line: Chlorophyll reflects green light.')
    await expect(page.getByText('The fact-checker rewrote 1 line.')).toBeVisible()
    await page.locator('[data-purpose="coverage-summary"]').click()
    await expect(page.locator('[data-purpose="key-point-list"] li').nth(1)).toContainText('Taught in: not covered yet')

    const lines = page.locator('[data-purpose="script-line"]')
    // Edit
    await lines.filter({ hasText: 'Second line about K1.' }).getByRole('button', { name: 'Edit line' }).click()
    await page.getByRole('textbox', { name: 'Line text' }).fill('Chlorophyll absorbs red and blue light.')
    await chooseOption(page, 'Speaker', 'Teacher')
    await page.getByRole('button', { name: 'Save' }).click()
    const edited = lines.filter({ hasText: 'Chlorophyll absorbs red and blue light.' })
    await expect(edited).toContainText('edited')
    await expect(edited).toContainText('Teacher')
    // Add
    await lines.filter({ hasText: 'First line about K3.' }).getByRole('button', { name: 'Add a line after this one' }).click()
    await page.getByRole('textbox', { name: 'Line text' }).fill('A brand new line.')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(lines.filter({ hasText: 'A brand new line.' })).toHaveCount(1)
    // Delete
    await lines.filter({ hasText: 'Second line about K4.' }).getByRole('button', { name: 'Delete line' }).click()
    await expect(lines.filter({ hasText: 'Second line about K4.' })).toHaveCount(0)
    // Reorder
    const k2 = page.locator('[data-purpose="script-section"]').filter({ hasText: 'All about K2' }).locator('[data-purpose="script-line"]')
    await k2.first().getByRole('button', { name: 'Move down' }).click()
    await expect(k2.first()).toContainText('Second line about K2.')
    await expect(k2.nth(1)).toContainText('First line about K2.')

    await expect(status).toContainText('You changed the script (2 edited lines).')
    await page.reload()
    await expect(lines.filter({ hasText: 'A brand new line.' })).toHaveCount(1)
    await expect(k2.first()).toContainText('Second line about K2.')

    await page.getByRole('button', { name: 'Check my edits' }).click()
    await expect(page.getByText('Every line was fact-checked against your text.')).toBeVisible()
    const check = mock.requests().find((entry) => entry.action === 'check')!
    const lineIds = check.body.lineIds as string[]
    expect(lineIds).toContain('p1-L2') // still flagged
    expect(lineIds.length).toBe(3) // flagged + edited + added
    const sent = (check.body.sections as { lines: { text: string }[] }[]).flatMap((section) => section.lines.map((line) => line.text))
    expect(sent).toContain('A brand new line.')
    expect(sent).not.toContain('Second line about K4.')
  })
})

test.describe('Audio Lesson — storage', () => {
  test('IndexedDB unavailable: a short note, and lessons still work in memory', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', {
        get() {
          throw new Error('blocked')
        },
      })
    })
    await mockLesson(page, { plan: { keyPoints: keyPoints(4), episodes: splitPlan([4]) } })
    await page.goto('/lessons')
    await expect(page.getByText("Lessons can't be saved in this browser, so they last until you close this tab.")).toBeVisible()
    await startNewLesson(page)
    await writeSingleLesson(page)
    await expect(page.locator('[data-purpose="coverage-summary"]')).toHaveText('4/4 key points covered')
    await page.getByRole('link', { name: 'Back to lessons' }).click()
    await expect(page.locator('[data-purpose="lesson-row"]')).toHaveCount(1)
  })
})

test.describe('Audio Lesson — series', () => {
  test('a 2-episode series writes part 1 only; part 2 on demand opens with recall', async ({ page }) => {
    const mock = await mockLesson(page, { plan: { keyPoints: keyPoints(9), episodes: splitPlan([5, 4]) } })
    await page.goto('/lessons')
    await startNewLesson(page)
    await page.getByRole('button', { name: 'Plan the lesson' }).click()
    await expect(page.locator('[data-purpose="lesson-plan"]')).toContainText('This text will be a 2-episode series')
    await page.getByRole('button', { name: '9 key points' }).click()
    await expect(page.locator('[data-purpose="lesson-plan"]')).toContainText('Key point 9 about light')
    await page.getByRole('button', { name: 'Write part 1' }).click()
    await expect(page).toHaveURL(/\/lessons\/[\w-]+$/)
    expect(mock.requests().filter((entry) => entry.action === 'script').map((entry) => entry.body.part)).toEqual([1])

    const tabs = page.getByRole('tab')
    await expect(tabs).toHaveText(['Part 1', 'Part 2 · not written'])
    await expect(page.locator('[data-purpose="coverage-summary"]')).toHaveText('5/5 key points covered')
    await page.locator('[data-purpose="coverage-summary"]').click()
    await expect(page.locator('[data-purpose="key-point-list"] li').nth(6)).toContainText('part 2 (not written yet)')

    await tabs.nth(1).click()
    await expect(page.locator('[data-purpose="part-not-written"]')).toContainText("Part 2 isn't written yet")
    await page.getByRole('button', { name: 'Prepare part 2' }).click()
    await expect(page.getByText('Quick recall')).toBeVisible()
    expect(mock.requests().filter((entry) => entry.action === 'script').map((entry) => entry.body.part)).toEqual([1, 2])
    await expect(tabs).toHaveText(['Part 1', 'Part 2'])
    await expect(page.getByText('Part 2 of 2')).toBeVisible()
  })

  test('a 4-episode series: the plan says so and only part 1 is paid for', async ({ page }) => {
    const mock = await mockLesson(page, { plan: { keyPoints: keyPoints(18), episodes: splitPlan([5, 4, 5, 4]) } })
    await page.goto('/lessons')
    await startNewLesson(page)
    await page.getByRole('button', { name: 'Plan the lesson' }).click()
    await expect(page.locator('[data-purpose="lesson-plan"]')).toContainText('This text will be a 4-episode series')
    await expect(page.getByText('Each later part is written only when you ask for it.')).toBeVisible()
    await page.getByRole('button', { name: 'Write part 1' }).click()
    await expect(page.getByRole('tab')).toHaveCount(4)
    await page.getByRole('button', { name: 'Prepare next part (2)' }).click()
    await expect(page.getByText('Part 2 of 4')).toBeVisible()
    expect(mock.requests().filter((entry) => entry.action === 'script').map((entry) => entry.body.part)).toEqual([1, 2])
    await page.getByRole('link', { name: 'Back to lessons' }).click()
    await expect(page.locator('[data-purpose="lesson-row"]')).toContainText('4 episodes')
  })
})

test.describe('Audio Lesson — sources', () => {
  test('file, URL, Archive quiz and saved solution', async ({ page, seedArchive, mockExtractUrl }) => {
    const entry = archiveEntry('quiz-1', 'Cell organelles quiz')
    await seedArchive([entry])
    await mockExtractUrl({ title: 'Leaves article', text: `${TEXT} From the web.`, wordCount: 106, truncated: false })
    const mock = await mockLesson(page, { plan: { keyPoints: keyPoints(4), episodes: splitPlan([4]) } })
    await page.goto('/lessons')
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('quelio-solutions', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('solutions', { keyPath: 'id' }).createIndex('createdAt', 'createdAt', { unique: false })
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      await new Promise<void>((resolve) => {
        const tx = db.transaction('solutions', 'readwrite')
        tx.objectStore('solutions').put({
          id: 'sol-1',
          schemaVersion: 1,
          createdAt: new Date().toISOString(),
          thumbnail: null,
          language: 'en',
          result: {
            topic: 'Linear equations',
            question: 'Solve 3x + 7 = 2x + 15 for x and check the answer by putting it back into the equation.',
            intro: 'We collect the x terms on one side and the numbers on the other side of the equals sign.',
            steps: ['Subtract 2x from both sides to get x + 7 = 15.', 'Subtract 7 from both sides to get x = 8.'],
            answer: 'x = 8',
            tip: 'Always check by substituting the value back.',
            mistakes: [],
          },
          extras: {},
        })
        tx.oncomplete = () => resolve()
      })
      db.close()
    })
    const planText = () => mock.requests().filter((request) => request.action === 'plan').at(-1)!.body.text as string

    await page.getByRole('button', { name: 'New lesson' }).first().click()
    // File
    await page.getByRole('tab', { name: 'File' }).click()
    await page.locator('input[type="file"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from(TEXT) })
    await page.getByRole('button', { name: 'Plan the lesson' }).click()
    await expect(page.locator('[data-purpose="lesson-plan"]')).toBeVisible()
    expect(planText()).toBe(TEXT)
    // URL
    await page.getByRole('tab', { name: 'URL' }).click()
    await page.getByPlaceholder('Paste a link to an article or webpage...').fill('https://example.com/leaves')
    await page.getByRole('button', { name: 'Fetch' }).click()
    await expect(page.getByText('Leaves article')).toBeVisible()
    await page.getByRole('button', { name: 'Plan the lesson' }).click()
    await expect(page.locator('[data-purpose="lesson-plan"]')).toBeVisible()
    expect(planText()).toContain('From the web.')
    // Archive quiz
    await page.getByRole('button', { name: 'From an Archive quiz' }).click()
    await page.locator('[data-purpose="lesson-source-picker"]').getByRole('button', { name: /Cell organelles quiz/ }).click()
    await expect(page.getByText('Using: Cell organelles quiz')).toBeVisible()
    await page.getByRole('button', { name: 'Plan the lesson' }).click()
    await expect(page.locator('[data-purpose="lesson-plan"]')).toBeVisible()
    expect(planText()).toContain(TEXT)
    expect(planText()).toContain(entry.quiz.questions[0].question)
    // Saved solution
    await page.getByRole('button', { name: 'From a saved solution' }).click()
    await page.locator('[data-purpose="lesson-source-picker"]').getByRole('button', { name: /Linear equations/ }).click()
    await expect(page.getByText('Using: Linear equations')).toBeVisible()
    await page.getByRole('button', { name: 'Plan the lesson' }).click()
    await expect(page.locator('[data-purpose="lesson-plan"]')).toBeVisible()
    expect(planText()).toContain('Answer: x = 8')
    await page.getByRole('button', { name: 'Write the lesson' }).click()
    await page.getByRole('link', { name: 'Back to lessons' }).click()
    await expect(page.locator('[data-purpose="lesson-row"]')).toContainText('Saved solution: Linear equations')
  })
})

test.describe('Audio Lesson — shared owner gate', () => {
  test('locked until the code is entered; one unlock also opens Songs @cross', async ({ page, seedArchive }) => {
    await seedArchive([archiveEntry('quiz-1', 'Cell organelles quiz')])
    await mockSongStatus(page, true)
    const mock = await mockLesson(page, { plan: { keyPoints: keyPoints(4), episodes: splitPlan([4]) }, requiresAccessCode: true })
    await page.goto('/lessons')
    await expect(page.locator('[data-purpose="lessons-empty"]')).toBeVisible()
    await startNewLesson(page)
    await page.getByRole('button', { name: 'Plan the lesson' }).click()
    const gate = page.locator('[data-purpose="owner-access-gate"]')
    await expect(gate).toContainText('Enter access code')
    expect(mock.requests().filter((entry) => entry.action === 'plan')).toHaveLength(0)

    await gate.getByLabel('Enter access code').fill('wrong-code')
    await gate.getByRole('button', { name: 'Unlock' }).click()
    await expect(gate.getByRole('alert')).toHaveText("That code isn't correct. Please try again.")
    await gate.getByLabel('Enter access code').fill('right-code')
    await gate.getByRole('button', { name: 'Unlock' }).click()
    await expect(page.locator('[data-purpose="lesson-plan"]')).toBeVisible()
    expect(mock.requests().find((entry) => entry.action === 'plan')?.code).toBe('right-code')
    await page.getByRole('button', { name: 'Write the lesson' }).click()
    await expect(page).toHaveURL(/\/lessons\/[\w-]+$/)
    await page.getByRole('link', { name: 'Back to lessons' }).click()
    await expect(page.getByRole('button', { name: 'Lock' })).toHaveCount(0) // owner controls live on the owner page only
    await expect(page.locator('main')).not.toContainText('$')

    // Songs: the same stored code means no lock card in the song panel.
    await page.goto('/songs')
    await page.getByRole('button', { name: 'New song' }).first().click()
    await page.getByRole('button', { name: /Cell organelles quiz/ }).click()
    await expect(page.locator('[data-purpose="owner-access-gate"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Write lyrics' })).toBeVisible()
    await page.keyboard.press('Escape')

    // The owner page (no link anywhere) shows spend and the lock; Lock clears the code for both features.
    await page.goto('/owner')
    await expect(page.locator('[data-purpose="owner-month-spend"]')).toContainText('This month: $')
    await page.getByRole('button', { name: 'Lock' }).click()
    await expect(page.locator('[data-purpose="owner-access-gate"]')).toBeVisible()
    await expect(page.locator('[data-purpose="owner-spend"]')).toHaveCount(0)
  })
})

test.describe('Audio Lesson — languages and layout', () => {
  for (const lang of [
    { code: 'tr' as const, title: 'Sesli Ders', subtitle: 'Her metni dinleyebileceğin kısa bir derse dönüştür', newLesson: 'Yeni ders', styles: ['İki sunucu sohbeti', 'Öğretmen ve öğrenci', 'Tek anlatıcı'], plan: 'Dersi planla', series: 'Bu metin 3 bölümlük bir seri olacak', write: '1. bölümü yaz', coverage: '5/5 ana bilgi anlatıldı' },
    { code: 'hyw' as const, title: 'Ձայնային դաս', subtitle: 'Ո՛ր տեքստն ալ ըլլայ, վերածէ զայն կարճ դասի մը, որ կրնաս մտիկ ընել', newLesson: 'Նոր դաս', styles: ['Երկու հաղորդավարի զրոյց', 'Ուսուցիչ եւ աշակերտ', 'Մէկ պատմող'], plan: 'Ծրագրել դասը', series: 'Այս տեքստը 3 բաժինէ բաղկացած շարք մը պիտի ըլլայ', write: 'Գրել 1-ին բաժինը', coverage: '5/5 գլխաւոր կէտ բացատրուեցաւ' },
  ]) {
    test(`localized in ${lang.code}`, async ({ page, seedLanguage }) => {
      await seedLanguage(lang.code)
      await mockLesson(page, { plan: { keyPoints: keyPoints(13), episodes: splitPlan([5, 4, 4]) } })
      await page.goto('/lessons')
      await expect(page.getByRole('heading', { level: 1, name: lang.title })).toBeVisible()
      await expect(page).toHaveTitle(`${lang.title} - Quelio`)
      await expect(page.getByText(lang.subtitle)).toBeVisible()
      await expect(page.locator('[data-purpose="sidebar-navigation"]')).toContainText(lang.title)
      await page.getByRole('button', { name: lang.newLesson }).first().click()
      await fillText(page, TEXT)
      await expect(page.getByRole('radio', { name: lang.styles[0] })).toHaveAttribute('aria-checked', 'true')
      for (const style of lang.styles.slice(1)) await expect(page.getByRole('radio', { name: style })).toBeVisible()
      await page.getByRole('button', { name: lang.plan }).click()
      await expect(page.locator('[data-purpose="lesson-plan"]')).toContainText(lang.series)
      await expect(page.locator('main')).not.toContainText('lessons.')
      await page.getByRole('button', { name: lang.write }).click()
      await expect(page.locator('[data-purpose="coverage-summary"]')).toHaveText(lang.coverage)
      await expect(page.locator('main')).not.toContainText('lessons.')
    })
  }

  for (const width of [1440, 390]) {
    test(`no horizontal overflow at ${width}px on the list, the form and the script`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await mockLesson(page, { plan: { keyPoints: keyPoints(9), episodes: splitPlan([5, 4]) }, episode: (part, ids) => episodeBody(part, ids, { issueLine: true }) })
      await page.goto('/lessons')
      await startNewLesson(page)
      const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      expect(await noOverflow()).toBe(true)
      await page.getByRole('button', { name: 'Plan the lesson' }).click()
      await page.getByRole('button', { name: 'Write part 1' }).click()
      await expect(page.locator('[data-purpose="script-editor"]')).toBeVisible()
      expect(await noOverflow()).toBe(true)
      await page.getByRole('link', { name: 'Back to lessons' }).click()
      await expect(page.locator('[data-purpose="lesson-row"]')).toHaveCount(1)
      expect(await noOverflow()).toBe(true)
    })
  }
})

test.describe('Audio Lesson — i18n files', () => {
  const locale = (lang: string) => JSON.parse(readFileSync(join('src', 'i18n', 'locales', `${lang}.json`), 'utf8')) as Record<string, unknown>
  const leafKeys = (value: unknown, prefix = ''): string[] =>
    typeof value === 'object' && value !== null ? Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key)) : [prefix]

  test('en, tr and hyw have identical key sets', () => {
    const en = leafKeys(locale('en')).sort()
    expect(leafKeys(locale('tr')).sort()).toEqual(en)
    expect(leafKeys(locale('hyw')).sort()).toEqual(en)
  })

  test('no orphan lessons/ownerAccess keys', () => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx?$/.test(name)) files.push(readFileSync(path, 'utf8'))
      }
    }
    walk('src')
    const code = files.join('\n')
    const dynamicParents = new Set([...code.matchAll(/`(lessons\.[\w.]+)\.\$\{/g)].map((match) => match[1]))
    const keys = leafKeys(locale('en')).filter((key) => key.startsWith('lessons.') || key.startsWith('ownerAccess.') || key === 'nav.lessons')
    const orphans = keys
      .map((key) => key.replace(/_(one|other)$/, ''))
      .filter((key) => !code.includes(`'${key}'`) && !code.includes(`"${key}"`) && !dynamicParents.has(key.slice(0, key.lastIndexOf('.'))))
    expect(orphans).toEqual([])
  })
})
