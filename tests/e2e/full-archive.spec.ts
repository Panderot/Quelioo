import type { Page, TestInfo } from '@playwright/test'

import { test, expect } from './strict'
import { readStore, seed } from './flashcardHelpers'
import { savedSolutionExtras } from './helpers'
import { SAMPLE_QUIZ } from '../fixtures/quiz'
import type { ArchiveEntry } from '../../src/lib/archive'
import type { StudySession } from '../../src/lib/study'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import tr from '../../src/i18n/locales/tr.json' with { type: 'json' }
import hyw from '../../src/i18n/locales/hyw.json' with { type: 'json' }

/**
 * Full coverage of the Archive (quiz list, quiz page, Study entry points, Solutions tab) — gorev 16, section 2.
 * Runs on the fake backend (browser-local stores). Real per-account isolation and the account-backed
 * loading / error states are covered against the test project by tests/supabase/rls.spec.ts and data.spec.ts.
 */

const LOCALES = { en, tr, hyw } as const
type LocaleName = keyof typeof LOCALES
const LOCALE_NAMES = Object.keys(LOCALES) as LocaleName[]
type Strings = (typeof LOCALES)[LocaleName]

const ARCHIVE_KEY = 'quelio.archive.v1'

// ---------------------------------------------------------------------------------------------------
// Locale helpers
// ---------------------------------------------------------------------------------------------------

function lookup(strings: unknown, key: string): string {
  const walk = (path: string) =>
    path.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), strings)
  const value = walk(key) ?? walk(`${key}_other`)
  if (typeof value !== 'string') throw new Error(`missing locale key ${key}`)
  return value
}

/** i18next-style lookup with {{var}} interpolation (plural keys use their `_other` form: all counts here are not 1). */
function tt(strings: unknown, key: string, vars: Record<string, string | number> = {}): string {
  return lookup(strings, key).replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(vars[name]))
}

function flatten(node: unknown, prefix = ''): Record<string, string> {
  if (typeof node === 'string') return { [prefix]: node }
  if (!node || typeof node !== 'object') return {}
  return Object.entries(node as Record<string, unknown>).reduce<Record<string, string>>(
    (all, [name, child]) => ({ ...all, ...flatten(child, prefix ? `${prefix}.${name}` : name) }),
    {},
  )
}

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g
const placeholders = (text: string) => [...text.matchAll(PLACEHOLDER)].map((match) => match[1]).sort()

// ---------------------------------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------------------------------

type Questions = ArchiveEntry['quiz']['questions']

function makeEntry(over: Partial<ArchiveEntry> & { id: string; title: string }, questions: unknown[] = SAMPLE_QUIZ.questions): ArchiveEntry {
  return {
    createdAt: '2026-01-15T12:00:00.000Z',
    source: 'text',
    questionType: 'mixed',
    difficulty: 'medium',
    questionCount: String(questions.length),
    optionsCount: null,
    outputLanguage: 'en',
    sourceText: 'Seeded source text for the archived quiz.',
    ...over,
    quiz: { title: over.title, questions: questions as Questions },
  }
}

const TRIO = SAMPLE_QUIZ.questions.slice(0, 3) // mcq + true/false + fill-blank: 30 + 15 + 20 = 65 s

const mcq = (id: string) => ({
  id,
  type: 'mcq',
  question: `Question ${id}?`,
  explanation: 'Because.',
  options: ['One', 'Two', 'Three', 'Four'],
  answerIndex: 0,
  estimatedSeconds: 20,
  hints: ['A first hint for it.', 'A second hint for it.'],
})
const trueFalse = (id: string) => ({ id, type: 'true-false', question: `Statement ${id}.`, explanation: '', answerBool: true, hints: ['Hint one here.', 'Hint two here.'] })

const day = 86_400_000

function session(over: Partial<StudySession> & { at: string }): StudySession {
  return { id: `s-${over.at}`, kind: 'normal', scope: 'full', total: 6, firstTry: 4, secondTry: 0, ms: 60_000, wrongIds: [], guessIds: [], flaggedIds: [], ...over }
}

function listEntries(): ArchiveEntry[] {
  const now = Date.now()
  return [
    makeEntry({
      id: 'row-a',
      title: 'Alpha quiz',
      createdAt: '2026-01-15T12:00:00.000Z',
      questionType: 'mixed',
      difficulty: 'hard',
      optionsCount: '5',
      questionCount: '6',
      // The latest FULL session counts; the later subset round must not.
      results: {
        v: 1,
        pool: [],
        sessions: [session({ at: new Date(now - 3 * day).toISOString(), total: 6, firstTry: 4 }), session({ at: new Date(now).toISOString(), scope: 'subset', total: 2, firstTry: 2 })],
      },
    }),
    // A stale requested count ("auto") must not decide what the row says: the quiz holds two questions.
    makeEntry({ id: 'row-b', title: 'Bravo quiz', createdAt: '2026-01-10T12:00:00.000Z', questionType: 'mcq', difficulty: 'easy', questionCount: 'auto' }, [mcq('b1'), mcq('b2')]),
    // Asked for 9, five exist (no stored estimates: the formula gives 5 x 15 s).
    makeEntry(
      { id: 'row-c', title: 'Charlie quiz', createdAt: '2026-01-05T12:00:00.000Z', questionType: 'true-false', difficulty: 'medium', questionCount: '9' },
      ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => ({ ...trueFalse(id) })),
    ),
  ]
}

const TYPE_LABEL_KEYS: Record<string, string> = {
  mixed: 'params.questionType.mixed',
  mcq: 'params.questionType.mcq',
  'true-false': 'params.questionType.trueFalse',
}

function expectedTime(strings: Strings, seconds: number): string {
  return seconds < 60 ? tt(strings, 'create.result.timeUnderMinute') : tt(strings, 'create.result.timeTotal', { minutes: Math.max(1, Math.round(seconds / 60)) })
}

function expectedMeta(strings: Strings, entry: ArchiveEntry, seconds: number): string {
  return [
    tt(strings, 'params.questionCount.value', { count: entry.quiz.questions.length }),
    tt(strings, TYPE_LABEL_KEYS[entry.questionType]),
    tt(strings, `params.difficulty.${entry.difficulty}`),
    ...(entry.optionsCount ? [tt(strings, 'params.optionsCount.value', { count: entry.optionsCount })] : []),
    expectedTime(strings, seconds),
  ].join(' • ')
}

/** Seeds the Archive on every page load (the data never changes in the test). */
async function seedEntries(page: Page, entries: ArchiveEntry[]) {
  await page.addInitScript(
    ({ key, data }) => {
      window.localStorage.setItem(key, JSON.stringify(data))
    },
    { key: ARCHIVE_KEY, data: entries },
  )
}

/** Seeds once per browser context: what the app saves afterwards (title, results) survives navigation and reload. */
async function seedOnce(page: Page, entries: ArchiveEntry[]) {
  await page.addInitScript(
    ({ key, data }) => {
      if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, JSON.stringify(data))
    },
    { key: ARCHIVE_KEY, data: entries },
  )
}

async function storedArchive(page: Page): Promise<ArchiveEntry[]> {
  return page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? '[]') as ArchiveEntry[], ARCHIVE_KEY)
}

interface SolutionSeed {
  id: string
  createdAt: string
  topic: string
  question?: string
  extras?: Record<string, unknown>
}

/** Writes solutions straight into the app's IndexedDB store (the page must already be on the app origin). */
async function seedSolutions(page: Page, records: SolutionSeed[]) {
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
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('solutions', 'readwrite')
      const store = tx.objectStore('solutions')
      for (const item of items) {
        store.put({
          id: item.id,
          schemaVersion: 1,
          createdAt: item.createdAt,
          thumbnail: null,
          language: 'en',
          result: {
            topic: item.topic,
            question: item.question ?? 'Solve $3x + 7 = 2x + 15$',
            intro: 'Get x alone.',
            steps: ['Subtract $2x$ from both sides: $x + 7 = 15$', 'Subtract $7$ from both sides: $x = 8$'],
            answer: '$x = 8$',
            tip: 'Check by substituting.',
            mistakes: ['Adding $2x$ instead of subtracting it.'],
          },
          extras: item.extras ?? {},
        })
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, records)
}

async function storedSolutionIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('quelio-solutions', 1)
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

const SOLUTION_A: SolutionSeed = { id: 'sol-a', createdAt: '2026-03-03T10:00:00.000Z', topic: 'Linear equations' }
const SOLUTION_B: SolutionSeed = { id: 'sol-b', createdAt: '2026-03-02T10:00:00.000Z', topic: 'Geometry', question: 'Find the hypotenuse' }
const SOLUTION_C: SolutionSeed = { id: 'sol-c', createdAt: '2026-03-01T10:00:00.000Z', topic: 'Percentages', question: 'What is 20% of 50?' }

// ---------------------------------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------------------------------

const rowOf = (page: Page, title: string) => page.locator('[data-purpose="archive-list"] li', { hasText: title })
const listRows = (page: Page) => page.locator('[data-purpose="archive-list"] > li')
const solutionRows = (page: Page) => page.locator('[data-purpose="solution-row"]')
const quizzesTab = (page: Page, strings: Strings = en) => page.getByRole('tab', { name: strings.archive.tabs.quizzes })
const solutionsTab = (page: Page, strings: Strings = en) => page.getByRole('tab', { name: strings.archive.tabs.solutions })
const dialog = (page: Page) => page.locator('[data-purpose="add-cards-dialog"]')
const moreMenu = (page: Page, strings: Strings = en) => page.locator('[data-purpose="quiz-result"], [data-purpose="solution-actions"]').getByRole('button', { name: strings.solve.actions.more, exact: true })
const noHorizontalOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

/** Visible interactive controls inside the page body that have no accessible name. */
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.querySelector('[data-purpose="main-layout"]') ?? document.body
    const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="switch"], [role="tab"], [role="radio"], [role="menuitem"]'
    const bad: string[] = []
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
      if (el.getClientRects().length === 0 || getComputedStyle(el).visibility === 'hidden') continue
      const labelledBy = (el.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
      const labels = 'labels' in el ? Array.from((el as HTMLInputElement).labels ?? []).map((label) => label.textContent ?? '') : []
      const name = [
        el.getAttribute('aria-label'),
        labelledBy,
        ...labels,
        el.textContent,
        el.getAttribute('title'),
        el.getAttribute('placeholder'),
        el.querySelector('img')?.getAttribute('alt'),
      ]
        .map((part) => (part ?? '').trim())
        .find((part) => part.length > 0)
      if (!name) bad.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className ? `.${String(el.className).split(' ')[0]}` : ''}`)
    }
    return bad
  })
}

/** Raw translation keys, leftover {{vars}} or "undefined" showing on screen. */
async function untranslatedText(page: Page): Promise<string[]> {
  const text = await page.evaluate(() => document.body.innerText)
  const raw = text.match(/\b(?:archive|study|create|params|data|flashcards|solve|nav|inputCard|crop|topbar|account)\.[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*/g) ?? []
  const leftovers = text.match(/\{\{[^}]*\}\}|\bundefined\b|\bNaN\b/g) ?? []
  return [...raw, ...leftovers]
}

const PRICE_WORDS = /\b(?:price|prices|pricing|cost|costs|fiyat|ücret|maliyet|dollar|dolar)\b/i
const PRICE_SYMBOLS = /[€₺£]|\bUSD\b/

/** The last control of the page must stay clear of the fixed bottom tab bar (phones). */
async function expectClearOfTabBar(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1)).toBe(true)
  const result = await page.evaluate(() => {
    const bar = document.querySelector('[data-purpose="tab-bar"]')?.getBoundingClientRect()
    const root = document.querySelector('[data-purpose="main-layout"]')
    if (!bar || !root) return null
    let last: HTMLElement | null = null
    let bottom = -Infinity
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [role="switch"]'))) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0 || getComputedStyle(el).visibility === 'hidden') continue
      if (rect.bottom > bottom) {
        bottom = rect.bottom
        last = el
      }
    }
    if (!last) return { barTop: bar.top, bottom: -Infinity, covered: false }
    const rect = last.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, Math.min(rect.top + rect.height / 2, window.innerHeight - 1))
    return { barTop: bar.top, bottom, covered: !(hit && (hit === last || last.contains(hit))) }
  })
  expect(result, 'the tab bar must exist on a phone').not.toBeNull()
  expect(result!.bottom, 'the last control sits above the tab bar').toBeLessThanOrEqual(result!.barTop + 0.5)
  expect(result!.covered, 'nothing covers the last control').toBe(false)
}

/** Holds back (or fails) IndexedDB opens of the Solutions store, to see the loading and error states. */
async function controlSolutionsDb(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __idbHold: boolean
      __idbFail: boolean
      __idbQueue: (() => void)[]
      __releaseIdb: () => void
    }
    w.__idbHold = false
    w.__idbFail = false
    w.__idbQueue = []
    const original = IDBFactory.prototype.open
    IDBFactory.prototype.open = function open(this: IDBFactory, ...args: Parameters<IDBFactory['open']>) {
      if (args[0] !== 'quelio-solutions') return original.apply(this, args)
      if (w.__idbFail) throw new DOMException('blocked for the test', 'UnknownError')
      const request = original.apply(this, args)
      const descriptor = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'onsuccess')
      if (!w.__idbHold || !descriptor?.set || !descriptor.get) return request
      Object.defineProperty(request, 'onsuccess', {
        configurable: true,
        get: () => descriptor.get!.call(request),
        set: (handler: ((event: Event) => void) | null) => {
          descriptor.set!.call(request, (event: Event) => {
            if (w.__idbHold) w.__idbQueue.push(() => handler?.call(request, event))
            else handler?.call(request, event)
          })
        },
      })
      return request
    }
    w.__releaseIdb = () => {
      w.__idbHold = false
      w.__idbQueue.splice(0).forEach((run) => run())
    }
  })
}

function skipUnlessPhone(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== 'mobile', 'phone-only: asserts against the 390 px viewport and its tab bar')
}

type DbControl = { __idbHold: boolean; __idbFail: boolean; __releaseIdb: () => void }

// ---------------------------------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------------------------------

test.describe('Archive tabs and state', () => {
  test('the selected tab survives reload, the back button and a trip into a solution', async ({ page }) => {
    await seedEntries(page, listEntries())
    await page.goto('/archive?lng=en')
    await expect(quizzesTab(page)).toHaveAttribute('aria-selected', 'true')
    await expect(listRows(page)).toHaveCount(3)
    await seedSolutions(page, [SOLUTION_A, SOLUTION_B])

    await solutionsTab(page).click()
    await expect(page).toHaveURL(/[?&]tab=solutions/)
    await expect(solutionRows(page)).toHaveCount(2)
    await page.reload()
    await expect(solutionsTab(page)).toHaveAttribute('aria-selected', 'true')
    await expect(solutionRows(page)).toHaveCount(2)

    // Open a solution, go back: still the Solutions tab.
    await solutionRows(page).first().getByRole('link').click()
    await expect(page).toHaveURL(/\/archive\/solutions\/sol-a/)
    await page.goBack()
    await expect(page).toHaveURL(/tab=solutions/)
    await expect(solutionsTab(page)).toHaveAttribute('aria-selected', 'true')

    // Back to the Quizzes tab and forward again.
    await quizzesTab(page).click()
    await expect(listRows(page)).toHaveCount(3)
    await page.goBack()
    await expect(solutionsTab(page)).toHaveAttribute('aria-selected', 'true')
    await page.goForward()
    await expect(quizzesTab(page)).toHaveAttribute('aria-selected', 'true')
  })

  test('an unknown tab value falls back to Quizzes, and the tab roles are wired (tablist, tabpanel)', async ({ page }) => {
    await seedEntries(page, listEntries())
    await page.goto('/archive?tab=nonsense&lng=en')
    await expect(quizzesTab(page)).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tablist', { name: en.archive.tabs.label })).toBeVisible()
    await expect(page.getByRole('tabpanel')).toBeVisible()
    await expect(listRows(page)).toHaveCount(3)
  })

  test('the solution search text lives in the URL: it survives opening a solution, back and reload', async ({ page }) => {
    await page.goto('/archive?tab=solutions&lng=en')
    await seedSolutions(page, [SOLUTION_A, SOLUTION_B, SOLUTION_C])
    await page.reload()
    await expect(solutionRows(page)).toHaveCount(3)
    await page.getByRole('searchbox', { name: en.archive.solutions.searchPlaceholder }).fill('hypotenuse')
    await expect(solutionRows(page)).toHaveCount(1)
    await expect(page).toHaveURL(/q=hypotenuse/)
    await solutionRows(page).first().getByRole('link').click()
    await expect(page).toHaveURL(/\/archive\/solutions\/sol-b/)
    await page.goBack()
    await expect(page.getByRole('searchbox', { name: en.archive.solutions.searchPlaceholder })).toHaveValue('hypotenuse')
    await page.reload()
    await expect(solutionRows(page)).toHaveCount(1)
  })
})

// ---------------------------------------------------------------------------------------------------
// Quiz row data, per language
// ---------------------------------------------------------------------------------------------------

for (const lng of LOCALE_NAMES) {
  test(`quiz rows are computed from the data and localized (${lng}): title, question count, type, difficulty, options, time, date, last study`, async ({ page }) => {
    const strings = LOCALES[lng]
    const entries = listEntries()
    await seedEntries(page, entries)
    await page.goto(`/archive?lng=${lng}`)
    await expect(listRows(page)).toHaveCount(3)
    // Newest first.
    await expect(listRows(page).nth(0)).toContainText('Alpha quiz')
    await expect(listRows(page).nth(1)).toContainText('Bravo quiz')
    await expect(listRows(page).nth(2)).toContainText('Charlie quiz')

    const seconds = [260, 40, 75] // Alpha: stored estimates; Bravo: 2 x 20; Charlie: formula 5 x 15
    for (const [index, entry] of entries.entries()) {
      const row = rowOf(page, entry.title)
      const lines = row.locator('a').first().locator('p')
      await expect(lines.nth(0)).toHaveText(entry.title)
      await expect(lines.nth(1)).toHaveText(expectedMeta(strings, entry, seconds[index]))
      // The date is formatted for the UI language (Intl, medium date + short time).
      // Western Armenian shows numbers only (15.01.2026 14:00), TR / EN keep the Intl medium date.
      const date = await page.evaluate(({ iso, lang }) => {
        const at = new Date(iso)
        if (lang === 'hyw') {
          const two = (value: number) => String(value).padStart(2, '0')
          return `${two(at.getDate())}.${two(at.getMonth() + 1)}.${at.getFullYear()} ${two(at.getHours())}:${two(at.getMinutes())}`
        }
        return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(at)
      }, { iso: entry.createdAt, lang: lng })
      await expect(lines.nth(2)).toHaveText(date)
    }

    // Counts come from the questions that exist, not the requested ones.
    await expect(rowOf(page, 'Bravo quiz')).toContainText(tt(strings, 'params.questionCount.value', { count: 2 }))
    await expect(rowOf(page, 'Charlie quiz')).toContainText(tt(strings, 'params.questionCount.value', { count: 5 }))
    // Only a quiz with a MCQ-capable type and a stored option count shows the option count.
    await expect(rowOf(page, 'Alpha quiz')).toContainText(tt(strings, 'params.optionsCount.value', { count: 5 }))
    await expect(rowOf(page, 'Bravo quiz')).not.toContainText(tt(strings, 'params.optionsCount.value', { count: 5 }))

    // "Last study": the latest FULL session, with its score and age; none for a never-studied quiz.
    await expect(rowOf(page, 'Alpha quiz').locator('[data-purpose="archive-last-study"]')).toHaveText(
      tt(strings, 'study.history.lastWhen', { score: '4/6', when: tt(strings, 'study.when.daysAgo', { count: 3 }) }),
    )
    await expect(rowOf(page, 'Bravo quiz').locator('[data-purpose="archive-last-study"]')).toHaveCount(0)

    // The date text is a real localized date in the two languages the browser knows.
    if (lng === 'tr') await expect(rowOf(page, 'Alpha quiz')).toContainText(/15 Oca 2026/)
    if (lng === 'en') await expect(rowOf(page, 'Alpha quiz')).toContainText(/Jan 15, 2026/)
    if (lng === 'hyw') await expect(rowOf(page, 'Alpha quiz')).toContainText(/15\.01\.2026 \d{2}:\d{2}/)
  })
}

// ---------------------------------------------------------------------------------------------------
// Study from the Archive
// ---------------------------------------------------------------------------------------------------

test.describe('Study from the Archive', () => {
  const studyEntries = (): ArchiveEntry[] => [
    makeEntry(
      {
        id: 'study-d',
        title: 'Delta quiz',
        createdAt: '2026-02-02T12:00:00.000Z',
        results: { v: 1, pool: [], sessions: [session({ at: new Date(Date.now() - 3 * day).toISOString(), total: 3, firstTry: 1 })] },
      },
      TRIO,
    ),
    makeEntry({ id: 'study-e', title: 'Echo quiz', createdAt: '2026-02-01T12:00:00.000Z' }, [mcq('e1'), mcq('e2')]),
  ]

  test('Study opens exactly the chosen quiz in Study mode; a finished run updates "Last session" on the Archive', async ({ page }) => {
    await seedOnce(page, studyEntries())
    await page.goto('/archive?lng=en')
    await expect(rowOf(page, 'Delta quiz').locator('[data-purpose="archive-last-study"]')).toHaveText('Last session: 1/3, 3 days ago')

    // The other quiz's Study button opens the other quiz.
    await page.getByRole('link', { name: `${en.archive.study} — Echo quiz` }).click()
    await expect(page).toHaveURL('/archive/study-e?mode=study')
    await expect(page.locator('[data-purpose="study-start"] h2')).toHaveText('Echo quiz')
    await expect(page.locator('[data-purpose="study-start"]')).toContainText('2 Questions')
    await page.goBack()

    await page.getByRole('link', { name: `${en.archive.study} — Delta quiz` }).click()
    await expect(page).toHaveURL('/archive/study-d?mode=study')
    await expect(page.locator('[data-purpose="study-start"] h2')).toHaveText('Delta quiz')
    await expect(page.locator('[data-purpose="study-start"]')).toContainText('3 Questions')
    await page.getByRole('button', { name: en.study.start.begin, exact: true }).click()

    const ids = ['q-mcq', 'q-tf', 'q-fill']
    for (const [index, id] of ids.entries()) {
      await expect(page.locator('[data-purpose="study-question"]')).toBeVisible()
      if (id === 'q-mcq') await page.getByRole('radio', { name: /Carbon dioxide/ }).click()
      if (id === 'q-tf') await page.getByRole('radio', { name: 'False' }).click()
      if (id === 'q-fill') await page.getByLabel('Your answer').fill('100')
      await page.getByRole('button', { name: 'Check', exact: true }).click()
      await expect(page.locator('[data-purpose="study-feedback"][data-state="correct"]')).toBeVisible()
      await page.getByRole('button', { name: index === ids.length - 1 ? 'Finish' : 'Next', exact: true }).click()
    }
    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('3 / 3 correct')

    await page.getByRole('button', { name: en.study.end.toArchive, exact: true }).click()
    await expect(page).toHaveURL(/\/archive(\?|$)/)
    await expect(rowOf(page, 'Delta quiz').locator('[data-purpose="archive-last-study"]')).toHaveText('Last session: 3/3, today')
    // The other quiz is untouched.
    await expect(rowOf(page, 'Echo quiz').locator('[data-purpose="archive-last-study"]')).toHaveCount(0)

    // And it is saved, not only shown.
    const saved = (await storedArchive(page)).find((entry) => entry.id === 'study-d')
    expect(saved?.results?.sessions.filter((entry) => entry.scope === 'full')).toHaveLength(2)
  })

  test('the quiz page has its own Study link that opens the same quiz, and Study history shows after a run', async ({ page }) => {
    await seedOnce(page, studyEntries())
    await page.goto('/archive/study-d?lng=en')
    const history = page.locator('[data-purpose="study-history"]')
    await expect(history).toBeVisible()
    await history.getByRole('link', { name: en.archive.study }).click()
    await expect(page).toHaveURL('/archive/study-d?mode=study')
    await expect(page.locator('[data-purpose="study-start"] h2')).toHaveText('Delta quiz')
    await page.getByRole('button', { name: en.study.exit }).click()
    await expect(page).toHaveURL(/\/archive\/study-d(\?lng=en)?$/)
  })

  test('a deep link to a missing quiz in study mode shows the not-found card and a way back', async ({ page }) => {
    await seedEntries(page, studyEntries())
    await page.goto('/archive/not-there?mode=study&lng=en')
    await expect(page.locator('[data-purpose="archive-quiz-not-found"]')).toContainText(en.archive.detail.notFoundTitle)
    await page.getByRole('link', { name: en.archive.detail.backToArchive }).click()
    await expect(page).toHaveURL(/\/archive$/)
    await expect(listRows(page)).toHaveCount(2)
  })
})

// ---------------------------------------------------------------------------------------------------
// Quiz page actions: open, edit, delete question, make cards, print
// ---------------------------------------------------------------------------------------------------

test.describe('Quiz page actions', () => {
  const ENTRY = () => makeEntry({ id: 'act-1', title: 'Action quiz', questionType: 'mixed' }, SAMPLE_QUIZ.questions)

  test('opening a quiz from its row shows its title, meta and questions; the quiz can be deleted from here and each question too', async ({ page }) => {
    await seedEntries(page, [ENTRY()])
    await page.goto('/archive?lng=en')
    await rowOf(page, 'Action quiz').getByRole('link').first().click()
    await expect(page).toHaveURL('/archive/act-1')
    await expect(page.getByRole('heading', { name: 'Action quiz' })).toBeVisible()
    await expect(page.locator('[data-purpose="question-card"]')).toHaveCount(6)
    await expect(page.locator('[data-purpose="quiz-result"]')).toContainText('6 Questions')
    await expect(page.getByRole('link', { name: en.archive.detail.backToArchive })).toBeVisible()
    await page.getByRole('link', { name: en.archive.detail.backToArchive }).click()
    await expect(page).toHaveURL(/\/archive$/)
  })

  test('edit the title: Save persists it (list + reload), Cancel keeps the old one, an empty title cannot be saved', async ({ page }) => {
    await seedOnce(page, [ENTRY()])
    await page.goto('/archive/act-1?lng=en')
    const editTitle = page.getByRole('button', { name: en.create.result.titleEditLabel, exact: true })
    const titleBox = page.getByRole('textbox', { name: en.create.result.titleEditLabel })
    const save = page.getByRole('button', { name: en.create.question.saveAction, exact: true })

    await editTitle.click()
    await titleBox.fill('Throw-away title')
    await page.getByRole('button', { name: en.create.question.cancelAction, exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Action quiz' })).toBeVisible()

    await editTitle.click()
    await titleBox.fill('   ')
    await expect(save).toBeDisabled()
    await titleBox.fill('Renamed quiz')
    await save.click()
    await expect(page.getByRole('heading', { name: 'Renamed quiz' })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Renamed quiz' })).toBeVisible()
    await page.goto('/archive?lng=en')
    await expect(rowOf(page, 'Renamed quiz')).toBeVisible()
    await expect(rowOf(page, 'Action quiz')).toHaveCount(0)
    // The Study link label follows the new title.
    await expect(page.getByRole('link', { name: `${en.archive.study} — Renamed quiz` })).toBeVisible()
  })

  test('edit a question: the new text is saved to the quiz and survives reload', async ({ page }) => {
    await seedOnce(page, [ENTRY()])
    await page.goto('/archive/act-1?lng=en')
    const card = page.locator('[data-purpose="question-card"]').first()
    await card.getByRole('button', { name: en.create.question.editAction, exact: true }).click()
    await card.locator('textarea').first().fill('Which gas do green plants take in?')
    await card.getByRole('button', { name: en.create.question.saveAction, exact: true }).click()
    await expect(card).toContainText('Which gas do green plants take in?')
    await page.reload()
    await expect(page.locator('[data-purpose="question-card"]').first()).toContainText('Which gas do green plants take in?')
  })

  test('deleting a question updates the quiz, the row count and can be undone', async ({ page }) => {
    await seedOnce(page, [ENTRY()])
    await page.goto('/archive/act-1?lng=en')
    const cards = page.locator('[data-purpose="question-card"]')
    await expect(cards).toHaveCount(6)
    await cards.nth(1).getByRole('button', { name: en.create.question.deleteAction, exact: true }).click()
    await expect(cards).toHaveCount(5)
    await expect(page.getByRole('status').filter({ hasText: en.create.question.deletedUndo })).toBeVisible()
    await page.getByRole('button', { name: en.create.question.undo, exact: true }).click()
    await expect(cards).toHaveCount(6)

    await cards.nth(1).getByRole('button', { name: en.create.question.deleteAction, exact: true }).click()
    await expect(cards).toHaveCount(5)
    await page.reload()
    await expect(cards).toHaveCount(5)
    await page.goto('/archive?lng=en')
    await expect(rowOf(page, 'Action quiz')).toContainText('5 Questions')
  })

  test('"Turn into flashcards" from a quiz makes one deck named after the quiz; a double click adds it once', async ({ page }) => {
    const quiz = makeEntry({ id: 'cards-1', title: 'Cards quiz', questionType: 'mixed' }, [mcq('k1'), trueFalse('k2')])
    await seedOnce(page, [quiz])
    await page.goto('/archive/cards-1?lng=en')
    await moreMenu(page).click()
    await page.getByRole('menuitem', { name: en.flashcards.convert.action }).click()
    await expect(dialog(page).locator('[data-purpose="review-card"]')).toHaveCount(2)
    await expect(dialog(page).locator('[data-purpose="convert-deck-name"]')).toHaveValue('Cards quiz')

    // Two clicks in the same tick: the second must not add a second deck.
    await dialog(page)
      .getByRole('button', { name: tt(en, 'flashcards.generate.add', { count: 2 }) })
      .evaluate((button: HTMLElement) => {
        button.click()
        button.click()
      })
    await expect(dialog(page).getByRole('status')).toContainText(tt(en, 'flashcards.convert.added', { count: 2, name: 'Cards quiz' }))
    const store = await readStore(page)
    expect(store.decks).toHaveLength(1)
    expect(store.cards).toHaveLength(2)

    await dialog(page).getByRole('link', { name: en.flashcards.convert.openDeck }).click()
    await expect(page).toHaveURL(new RegExp(`/flashcards/${store.decks[0].id}$`))
  })

  test('the card dialog closes with Escape and with Cancel without adding anything', async ({ page }) => {
    await seedEntries(page, [makeEntry({ id: 'cards-2', title: 'Cards quiz' }, [mcq('k1')])])
    await page.goto('/archive/cards-2?lng=en')
    await moreMenu(page).click()
    await page.getByRole('menuitem', { name: en.flashcards.convert.action }).click()
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await moreMenu(page).click()
    await page.getByRole('menuitem', { name: en.flashcards.convert.action }).click()
    await dialog(page).getByRole('button', { name: en.flashcards.common.cancel }).click()
    await expect(dialog(page)).toHaveCount(0)
    expect((await readStore(page)).decks).toHaveLength(0)
  })

  test('Print / PDF opens the chooser, Cancel closes it, and Print calls the browser print with the chosen sheet', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __prints: number }
      w.__prints = 0
      window.print = () => {
        w.__prints += 1
      }
    })
    await seedEntries(page, [ENTRY()])
    await page.goto('/archive/act-1?lng=en')
    const print = page.getByRole('button', { name: en.create.result.print, exact: true })
    const chooser = page.getByRole('dialog', { name: en.create.result.printChooseTitle })

    await print.click()
    await expect(chooser).toBeVisible()
    await expect(chooser.getByRole('radio', { name: en.create.result.printQuestionSheet })).toHaveAttribute('aria-checked', 'true')
    await chooser.getByRole('button', { name: en.create.question.cancelAction, exact: true }).click()
    await expect(chooser).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(0)

    await print.click()
    await chooser.getByRole('radio', { name: en.create.result.printWithAnswers }).click()
    await chooser.getByRole('button', { name: en.create.result.printConfirm, exact: true }).click()
    await expect(chooser).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prints: number }).__prints)).toBe(1)
    await expect(page.locator('[data-print-only]')).toHaveAttribute('data-print-variant', 'with-answers')
    await expect(page.locator('[data-print-only] [data-print-answer-key]')).toBeAttached()
    expect(await page.title()).toBe('Action quiz')
  })

  test('"Show answers" is a labelled switch that reveals the answers and hides them again', async ({ page }) => {
    await seedEntries(page, [ENTRY()])
    await page.goto('/archive/act-1?lng=en')
    const toggle = page.getByRole('switch', { name: en.create.result.showAnswers })
    await expect(page.getByText('Jupiter', { exact: true })).toBeHidden()
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('Jupiter', { exact: true })).toBeVisible()
    await toggle.click()
    await expect(page.getByText('Jupiter', { exact: true })).toBeHidden()
  })

  test('the Copy button copies the quiz as text (clipboard stubbed) and says so', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __copied: string }
      w.__copied = ''
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (text: string) => {
            w.__copied = text
            return Promise.resolve()
          },
        },
      })
    })
    await seedEntries(page, [ENTRY()])
    await page.goto('/archive/act-1?lng=en')
    await page.getByRole('button', { name: en.create.result.copy, exact: true }).click()
    await expect(page.getByRole('button', { name: en.create.result.copied })).toBeVisible()
    const copied = await page.evaluate(() => (window as unknown as { __copied: string }).__copied)
    expect(copied).toContain('Action quiz')
    expect(copied).toContain(en.create.result.answerKeyTitle)
  })
})

// ---------------------------------------------------------------------------------------------------
// Solutions tab
// ---------------------------------------------------------------------------------------------------

test.describe('Solutions tab', () => {
  test('list shows every solution, newest first; Open goes to the solution and its steps and answer render', async ({ page }) => {
    await page.goto('/archive?tab=solutions&lng=en')
    await seedSolutions(page, [SOLUTION_C, SOLUTION_A, SOLUTION_B])
    await page.reload()
    await expect(solutionRows(page)).toHaveCount(3)
    await expect(solutionRows(page).nth(0)).toContainText('Linear equations')
    await expect(solutionRows(page).nth(1)).toContainText('Geometry')
    await expect(solutionRows(page).nth(2)).toContainText('Percentages')

    await solutionRows(page).nth(1).getByRole('link').click()
    await expect(page).toHaveURL(/\/archive\/solutions\/sol-b$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Geometry' })).toBeVisible()
    await expect(page.locator('[data-purpose="solve-result"]')).toContainText('Find the hypotenuse')
    await expect(page.locator('[data-purpose="solve-answer"]')).toBeVisible()
    await page.getByRole('link', { name: en.archive.solutions.detail.backToSolutions }).click()
    await expect(page).toHaveURL(/tab=solutions/)
  })

  test('delete: confirm, Cancel, delete, Undo, and a double click on the confirm button deletes once', async ({ page }) => {
    await page.goto('/archive?tab=solutions&lng=en')
    await seedSolutions(page, [SOLUTION_A, SOLUTION_B, SOLUTION_C])
    await page.reload()
    await expect(solutionRows(page)).toHaveCount(3)
    const del = (topic: string) => page.getByRole('button', { name: tt(en, 'archive.solutions.deleteLabel', { topic }) })

    await del('Geometry').click()
    await expect(page.getByText(en.archive.solutions.confirmDelete)).toBeVisible()
    await page.getByRole('button', { name: en.create.question.cancelAction, exact: true }).click()
    await expect(solutionRows(page)).toHaveCount(3)

    await del('Geometry').click()
    await page
      .getByRole('button', { name: en.archive.solutions.delete, exact: true })
      .evaluate((button: HTMLElement) => {
        button.click()
        button.click()
      })
    await expect(solutionRows(page)).toHaveCount(2)
    await expect.poll(() => storedSolutionIds(page)).toEqual(['sol-a', 'sol-c'])
    await page.getByRole('button', { name: en.create.question.undo, exact: true }).click()
    await expect(solutionRows(page)).toHaveCount(3)
    await expect.poll(() => storedSolutionIds(page)).toEqual(['sol-a', 'sol-b', 'sol-c'])
  })

  test('"Make flashcards" from a solution: cards come from the (mocked) AI, one request, one deck; the deck is reachable', async ({ page }) => {
    const requests: Record<string, unknown>[] = []
    await page.route('**/api/cards', async (route) => {
      requests.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          cards: [
            { front: 'What do you do to both sides of an equation?', back: 'The same operation' },
            { front: 'How do you check a solution?', back: 'Substitute it back' },
          ],
          removed: 0,
        }),
      })
    })
    await page.goto('/archive?lng=en')
    await seedSolutions(page, [SOLUTION_A])
    await page.goto('/archive/solutions/sol-a?lng=en')
    await moreMenu(page).click()
    await page.getByRole('menuitem', { name: en.flashcards.solution.action }).click()
    await expect(dialog(page).locator('[data-purpose="review-card"]')).toHaveCount(2)
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ mode: 'solution', language: 'auto', avoid: [] })
    await expect(dialog(page).locator('[data-purpose="convert-deck-name"]')).toHaveValue('Linear equations')

    await dialog(page)
      .getByRole('button', { name: tt(en, 'flashcards.generate.add', { count: 2 }) })
      .evaluate((button: HTMLElement) => {
        button.click()
        button.click()
      })
    await expect(dialog(page).getByRole('status')).toContainText(tt(en, 'flashcards.convert.added', { count: 2, name: 'Linear equations' }))
    const store = await readStore(page)
    expect(store.decks).toHaveLength(1)
    expect(store.cards).toHaveLength(2)
    await dialog(page).getByRole('link', { name: en.flashcards.convert.openDeck }).click()
    await expect(page).toHaveURL(new RegExp(`/flashcards/${store.decks[0].id}$`))
  })

  test('"Make flashcards" with the network down shows a clear message and "Try again" works', async ({ page }) => {
    let calls = 0
    await page.route('**/api/cards', async (route) => {
      calls += 1
      if (calls === 1) await route.abort('internetdisconnected')
      else await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ cards: [{ front: 'Q', back: 'A' }], removed: 0 }) })
    })
    await page.goto('/archive?lng=en')
    await seedSolutions(page, [SOLUTION_A])
    await page.goto('/archive/solutions/sol-a?lng=en')
    await moreMenu(page).click()
    await page.getByRole('menuitem', { name: en.flashcards.solution.action }).click()
    await expect(dialog(page).getByRole('alert')).toContainText(en.flashcards.generate.errors.network)
    expect((await readStore(page)).cards).toHaveLength(0)
    await dialog(page).getByRole('button', { name: en.flashcards.generate.retry }).click()
    await expect(dialog(page).locator('[data-purpose="review-card"]')).toHaveCount(1)
  })

  test('"Similar problem" (mocked AI): one request even on a double click, the problem shows, "Another one" avoids it, and the practice is saved with the solution', async ({ page }) => {
    const requests: Record<string, unknown>[] = []
    await page.route('**/api/similar', async (route) => {
      requests.push(route.request().postDataJSON() as Record<string, unknown>)
      const n = requests.length
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          question: `Practice ${n}: solve $5x - 3 = 4x + ${n + 4}$`,
          steps: [`Subtract $4x$: $x - 3 = ${n + 4}$`, `Add $3$: $x = ${n + 7}$`],
          answer: `$x = ${n + 7}$`,
          checkValue: String(n + 7),
          provider: 'openai',
          fallbackUsed: false,
        }),
      })
    })
    await page.goto('/archive?lng=en')
    await seedSolutions(page, [SOLUTION_A])
    await page.goto('/archive/solutions/sol-a?lng=en')

    await page.getByRole('button', { name: en.solve.actions.similar, exact: true }).evaluate((button: HTMLElement) => {
      button.click()
      button.click()
    })
    const items = page.locator('[data-purpose="similar-item"]')
    await expect(items).toHaveCount(1)
    await expect(items.first()).toContainText('Practice 1')
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ topic: 'Linear equations', language: 'en', avoid: [] })

    await items.first().getByLabel(en.solve.similar.answerLabel).fill('8')
    await items.first().getByRole('button', { name: en.solve.similar.check, exact: true }).click()
    await expect(items.first().locator('[data-purpose="similar-verdict"]')).toHaveAttribute('data-verdict', 'correct')

    await page.getByRole('button', { name: en.solve.similar.another, exact: true }).click()
    await expect(items).toHaveCount(2)
    expect(requests).toHaveLength(2)
    expect(requests[1].avoid).toEqual([expect.stringContaining('Practice 1')])

    await expect.poll(async () => Object.keys((await savedSolutionExtras(page))[0] ?? {}).length).toBeGreaterThan(0)
    await page.reload()
    await expect(items).toHaveCount(2)
    expect(requests).toHaveLength(2)
  })

  test('"Similar problem" with the network down shows a clear message and the retry works', async ({ page }) => {
    let calls = 0
    await page.route('**/api/similar', async (route) => {
      calls += 1
      if (calls === 1) await route.abort('internetdisconnected')
      else
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ question: 'Practice: $2x = 6$', steps: ['Divide by 2: $x = 3$'], answer: '$x = 3$', checkValue: '3', provider: 'openai', fallbackUsed: false }),
        })
    })
    await page.goto('/archive?lng=en')
    await seedSolutions(page, [SOLUTION_A])
    await page.goto('/archive/solutions/sol-a?lng=en')
    await page.getByRole('button', { name: en.solve.actions.similar, exact: true }).click()
    await expect(page.locator('[data-purpose="similar-error"]')).toContainText(en.solve.similar.errors.network)
    await page.locator('[data-purpose="similar-error"]').getByRole('button', { name: en.solve.explain.retry }).click()
    await expect(page.locator('[data-purpose="similar-item"]')).toHaveCount(1)
  })

  test('a missing solution id shows the not-found card with a way back; a slow store shows a loading skeleton', async ({ page }) => {
    await controlSolutionsDb(page)
    await page.goto('/archive?lng=en')
    await seedSolutions(page, [SOLUTION_A, SOLUTION_B])

    // Loading: the store answers late.
    await page.evaluate(() => {
      ;(window as unknown as DbControl).__idbHold = true
    })
    await solutionsTab(page).click()
    await expect(page.locator('[data-purpose="skeleton-list"]')).toBeVisible()
    await expect(solutionRows(page)).toHaveCount(0)
    await page.evaluate(() => (window as unknown as DbControl).__releaseIdb())
    await expect(solutionRows(page)).toHaveCount(2)
    await expect(page.locator('[data-purpose="skeleton-list"]')).toHaveCount(0)

    await page.goto('/archive/solutions/missing?lng=en')
    await expect(page.locator('[data-purpose="solution-not-found"]')).toContainText(en.archive.solutions.detail.notFoundTitle)
    await page.getByRole('link', { name: en.archive.solutions.detail.backToSolutions }).click()
    await expect(page).toHaveURL(/tab=solutions/)
  })
})

// ---------------------------------------------------------------------------------------------------
// Empty, broken and many records
// ---------------------------------------------------------------------------------------------------

test.describe('Empty, broken and many records', () => {
  for (const lng of LOCALE_NAMES) {
    test(`empty states are localized and lead somewhere (${lng})`, async ({ page }) => {
      const strings = LOCALES[lng]
      await page.goto(`/archive?lng=${lng}`)
      const empty = page.locator('[data-purpose="archive-empty-state"]')
      await expect(empty).toContainText(strings.archive.empty.title)
      await expect(empty).toContainText(strings.archive.empty.subtitle)
      await solutionsTab(page, strings).click()
      await expect(page.locator('[data-purpose="solutions-empty-state"]')).toContainText(strings.archive.solutions.empty.title)
      await page.getByRole('link', { name: strings.archive.solutions.empty.cta }).click()
      await expect(page).toHaveURL(/\/solve/)
      await page.goto(`/archive?lng=${lng}`)
      await page.getByRole('link', { name: strings.archive.empty.cta }).click()
      await expect(page).toHaveURL(/\/(\?|$)/)
    })
  }

  test('unreadable saved data is an empty Archive, and entries without questions are dropped without crashing', async ({ page }) => {
    await page.addInitScript((key) => window.localStorage.setItem(key, '{this is not json'), ARCHIVE_KEY)
    await page.goto('/archive?lng=en')
    await expect(page.locator('[data-purpose="archive-empty-state"]')).toBeVisible()

    const good = makeEntry({ id: 'ok-1', title: 'Survivor quiz' }, [mcq('s1')])
    const broken = { ...makeEntry({ id: 'bad-1', title: 'Broken quiz' }, [mcq('x1')]), quiz: { title: 'Broken quiz', questions: [] } }
    const page2 = await page.context().newPage()
    await page2.addInitScript(
      ({ key, data }) => window.localStorage.setItem(key, JSON.stringify(data)),
      { key: ARCHIVE_KEY, data: [good, broken, null, 7] },
    )
    await page2.goto('/archive?lng=en')
    await expect(page2.locator('[data-purpose="archive-list"] > li')).toHaveCount(1)
    await expect(page2.getByText('Survivor quiz')).toBeVisible()
    await page2.close()
  })

  test('60 quizzes open quickly, stay put (no layout shift), rows are equally tall and long titles never overflow', async ({ page }) => {
    const base = Date.UTC(2026, 0, 1, 12)
    const entries = Array.from({ length: 60 }, (_, index) => {
      const title =
        index === 3
          ? `${'W'.repeat(300)}`
          : index === 4
            ? 'A very long quiz title with many ordinary words that keeps going well past the width of any row on any screen size we support'
            : `Quiz number ${String(index).padStart(2, '0')}`
      return makeEntry({ id: `many-${index}`, title, createdAt: new Date(base + index * 60_000).toISOString(), questionCount: '2' }, [mcq(`m${index}a`), mcq(`m${index}b`)])
    })
    await seedEntries(page, entries)
    await page.goto('/archive?lng=en') // warm the dev server and the module cache
    await expect(listRows(page)).toHaveCount(60)

    await page.goto('/archive?lng=en')
    await expect(listRows(page)).toHaveCount(60, { timeout: 5000 })
    const readyAt = await page.evaluate(() => performance.now())
    expect(readyAt, 'the 60-quiz list is on screen within 5 s of navigation start').toBeLessThan(5000)
    await page.evaluate(() => document.fonts.ready.then(() => undefined))

    const before = await page.evaluate(() => {
      const list = document.querySelector('[data-purpose="archive-list"]')!
      return { height: list.getBoundingClientRect().height, tops: Array.from(list.children).map((child) => Math.round(child.getBoundingClientRect().top - list.getBoundingClientRect().top)) }
    })

    // Scroll down and back up while watching for layout shifts.
    const shift = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0
          const add = (list: PerformanceEntryList) => {
            for (const entry of list) {
              const shiftEntry = entry as unknown as { value: number; hadRecentInput: boolean }
              if (!shiftEntry.hadRecentInput) total += shiftEntry.value
            }
          }
          const observer = new PerformanceObserver((list) => add(list.getEntries()))
          observer.observe({ type: 'layout-shift' })
          window.scrollTo(0, document.documentElement.scrollHeight)
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              window.scrollTo(0, 0)
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  add(observer.takeRecords())
                  observer.disconnect()
                  resolve(total)
                }),
              )
            }),
          )
        }),
    )
    expect(shift).toBeLessThan(0.01)
    const after = await page.evaluate(() => {
      const list = document.querySelector('[data-purpose="archive-list"]')!
      return { height: list.getBoundingClientRect().height, tops: Array.from(list.children).map((child) => Math.round(child.getBoundingClientRect().top - list.getBoundingClientRect().top)) }
    })
    expect(after.height).toBeCloseTo(before.height, 0)
    expect(after.tops).toEqual(before.tops)

    // Equal rows, nothing wider than its row or the window.
    const metrics = await page.evaluate(() => {
      const list = document.querySelector('[data-purpose="archive-list"]')!
      const listRect = list.getBoundingClientRect()
      return Array.from(list.children).map((row) => {
        const rect = row.getBoundingClientRect()
        const study = row.querySelector('a[aria-label]')!.getBoundingClientRect()
        return { height: rect.height, rowOverflow: row.scrollWidth - row.clientWidth, outside: rect.right - listRect.right, studyRight: study.right, studyInRow: study.right <= rect.right + 0.5 }
      })
    })
    const heights = metrics.map((metric) => metric.height)
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2)
    for (const metric of metrics) {
      expect(metric.rowOverflow).toBeLessThanOrEqual(0)
      expect(metric.outside).toBeLessThanOrEqual(0.5)
      expect(metric.studyInRow).toBe(true)
    }
    expect(await noHorizontalOverflow(page)).toBe(true)

    // A very long title on the quiz page and the study screen wraps instead of overflowing.
    await page.goto('/archive/many-3?lng=en')
    await expect(page.getByRole('heading', { name: 'W'.repeat(300) })).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
    await page.goto('/archive/many-3?mode=study&lng=en')
    await expect(page.locator('[data-purpose="study-start"] h2')).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
  })

  test('many solutions (150) list, search and stay inside the window', async ({ page }) => {
    await page.goto('/archive?tab=solutions&lng=en')
    const base = Date.UTC(2026, 0, 1)
    await seedSolutions(
      page,
      Array.from({ length: 150 }, (_, index) => ({
        id: `bulk-${String(index).padStart(3, '0')}`,
        createdAt: new Date(base + index * 60_000).toISOString(),
        topic: index === 7 ? `Topic ${'Z'.repeat(250)}` : `Topic ${index}`,
        question: `Question ${index}`,
      })),
    )
    await page.reload()
    await expect(solutionRows(page)).toHaveCount(150)
    expect(await noHorizontalOverflow(page)).toBe(true)
    await page.getByRole('searchbox', { name: en.archive.solutions.searchPlaceholder }).fill('Topic 149')
    await expect(solutionRows(page)).toHaveCount(1)
  })

  test('one profile never sees another profile\'s Archive (the fake backend keeps data per browser profile; account isolation is tests/supabase/rls.spec.ts)', async ({ page, browser, baseURL }) => {
    await seedEntries(page, listEntries())
    await page.goto('/archive?lng=en')
    await expect(listRows(page)).toHaveCount(3)
    await seedSolutions(page, [SOLUTION_A])

    const other = await browser.newContext({ baseURL })
    const otherPage = await other.newPage()
    await otherPage.goto('/archive?lng=en')
    await expect(otherPage.locator('[data-purpose="archive-empty-state"]')).toBeVisible()
    await otherPage.getByRole('tab', { name: en.archive.tabs.solutions }).click()
    await expect(otherPage.locator('[data-purpose="solutions-empty-state"]')).toBeVisible()
    await otherPage.goto('/archive/row-a?lng=en')
    await expect(otherPage.locator('[data-purpose="archive-quiz-not-found"]')).toBeVisible()
    await otherPage.goto('/archive/solutions/sol-a?lng=en')
    await expect(otherPage.locator('[data-purpose="solution-not-found"]')).toBeVisible()
    await other.close()
  })
})

// ---------------------------------------------------------------------------------------------------
// Languages, labels, keyboard, prices
// ---------------------------------------------------------------------------------------------------

test.describe('Languages, labels and keyboard', () => {
  test('TR, EN and HYW have the same keys and the same {{variables}} for every text the Archive uses', async () => {
    const subtrees = ['archive', 'study', 'data', 'params', 'nav', 'create.result', 'create.question', 'flashcards.convert', 'flashcards.solution', 'flashcards.generate', 'flashcards.common', 'solve.similar', 'solve.actions', 'solve.explain']
    const pick = (strings: unknown, prefix: string) => {
      const all = flatten(strings)
      return Object.fromEntries(Object.entries(all).filter(([key]) => key === prefix || key.startsWith(`${prefix}.`)))
    }
    for (const prefix of subtrees) {
      const reference = pick(en, prefix)
      expect(Object.keys(reference).length, `${prefix} exists`).toBeGreaterThan(0)
      for (const other of [tr, hyw]) {
        const compared = pick(other, prefix)
        expect(Object.keys(compared).sort(), `${prefix}: same keys`).toEqual(Object.keys(reference).sort())
        for (const [key, text] of Object.entries(compared)) {
          expect(text.trim().length, `${key} is not empty`).toBeGreaterThan(0)
          expect(placeholders(text), `${key}: same {{variables}}`).toEqual(placeholders(reference[key]))
        }
      }
    }
  })

  for (const lng of LOCALE_NAMES) {
    test(`every Archive screen is fully translated and every control has a name (${lng})`, async ({ page }) => {
      const strings = LOCALES[lng]
      await seedEntries(page, listEntries())
      await page.goto(`/archive?lng=${lng}`)
      await expect(listRows(page)).toHaveCount(3)

      // Chrome texts really come from the language file (and are not the English fallback in TR / HYW).
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(strings.archive.title)
      await expect(page.getByText(strings.archive.subtitle, { exact: true })).toBeVisible()
      await expect(quizzesTab(page, strings)).toBeVisible()
      await expect(solutionsTab(page, strings)).toBeVisible()
      await expect(page.getByRole('link', { name: `${strings.archive.study} — Alpha quiz` })).toBeVisible()
      if (lng !== 'en') {
        for (const key of ['archive.title', 'archive.subtitle', 'archive.tabs.quizzes', 'archive.tabs.solutions', 'archive.study', 'archive.empty.title', 'archive.solutions.empty.title', 'archive.detail.notFoundTitle', 'study.label', 'create.result.print']) {
          expect(lookup(strings, key), `${key} is translated, not copied from English`).not.toBe(lookup(en, key))
        }
      }
      expect(await untranslatedText(page)).toEqual([])
      expect(await unnamedControls(page)).toEqual([])

      // Solutions tab with data.
      await seedSolutions(page, [SOLUTION_A, SOLUTION_B])
      await solutionsTab(page, strings).click()
      await page.reload()
      await expect(solutionRows(page)).toHaveCount(2)
      await expect(page.getByRole('searchbox', { name: strings.archive.solutions.searchPlaceholder })).toBeVisible()
      await page.getByRole('button', { name: tt(strings, 'archive.solutions.deleteLabel', { topic: 'Geometry' }) }).click()
      await expect(page.getByText(strings.archive.solutions.confirmDelete)).toBeVisible()
      expect(await untranslatedText(page)).toEqual([])
      expect(await unnamedControls(page)).toEqual([])

      // Solution page.
      await page.goto(`/archive/solutions/sol-a?lng=${lng}`)
      await expect(page.locator('[data-purpose="solve-result"]')).toBeVisible()
      await moreMenu(page, strings).click()
      await expect(page.getByRole('menuitem', { name: strings.flashcards.solution.action })).toBeVisible()
      expect(await untranslatedText(page)).toEqual([])
      expect(await unnamedControls(page)).toEqual([])

      // Quiz page, its print chooser and the card dialog.
      await page.goto(`/archive/row-a?lng=${lng}`)
      await expect(page.locator('[data-purpose="quiz-result"]')).toBeVisible()
      await expect(page.getByRole('button', { name: strings.create.result.print, exact: true })).toBeVisible()
      expect(await untranslatedText(page)).toEqual([])
      expect(await unnamedControls(page)).toEqual([])
      await page.getByRole('button', { name: strings.create.result.print, exact: true }).click()
      await expect(page.getByRole('dialog', { name: strings.create.result.printChooseTitle })).toBeVisible()
      await page.getByRole('button', { name: strings.create.question.cancelAction, exact: true }).click()
      await moreMenu(page, strings).click()
      await page.getByRole('menuitem', { name: strings.flashcards.convert.action }).click()
      await expect(dialog(page).getByRole('heading', { name: strings.flashcards.convert.action })).toBeVisible()
      expect(await untranslatedText(page)).toEqual([])
      expect(await unnamedControls(page)).toEqual([])
      await page.keyboard.press('Escape')

      // Study start screen.
      await page.goto(`/archive/row-a?mode=study&lng=${lng}`)
      await expect(page.locator('[data-purpose="study-start"]')).toBeVisible()
      await expect(page.getByRole('button', { name: strings.study.start.begin, exact: true })).toBeVisible()
      expect(await untranslatedText(page)).toEqual([])
      expect(await unnamedControls(page)).toEqual([])
    })
  }

  test('keyboard: Tab reaches the tabs, every row link and every Study button; Enter opens them', async ({ page }) => {
    await seedEntries(page, listEntries())
    await page.goto('/archive?lng=en')
    await expect(listRows(page)).toHaveCount(3)
    const wanted = ['Alpha quiz', 'Bravo quiz', 'Charlie quiz', `${en.archive.study} — Alpha quiz`, `${en.archive.study} — Bravo quiz`, `${en.archive.study} — Charlie quiz`, en.archive.tabs.quizzes]
    const seen: string[] = []
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    for (let press = 0; press < 80 && !wanted.every((name) => seen.some((text) => text.includes(name))); press += 1) {
      await page.keyboard.press('Tab')
      seen.push(await page.evaluate(() => (document.activeElement ? `${document.activeElement.getAttribute('aria-label') ?? ''} ${document.activeElement.textContent ?? ''}` : '')))
    }
    for (const name of wanted) expect(seen.some((text) => text.includes(name)), `Tab reaches "${name}"`).toBe(true)

    const study = page.getByRole('link', { name: `${en.archive.study} — Bravo quiz` })
    await study.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/archive/row-b?mode=study')
    await page.goBack()
    const row = rowOf(page, 'Charlie quiz').locator('a').first()
    await row.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/archive/row-c')
  })

  test('keyboard: Solutions tab arrows, Tab to the row, delete confirm with Enter', async ({ page }) => {
    await page.goto('/archive?lng=en')
    await seedSolutions(page, [SOLUTION_A, SOLUTION_B])
    await quizzesTab(page).focus()
    await page.keyboard.press('ArrowRight')
    await expect(solutionsTab(page)).toBeFocused()
    await expect(solutionsTab(page)).toHaveAttribute('aria-selected', 'true')
    await expect(solutionRows(page)).toHaveCount(2)
    const trash = page.getByRole('button', { name: tt(en, 'archive.solutions.deleteLabel', { topic: 'Linear equations' }) })
    await trash.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText(en.archive.solutions.confirmDelete)).toBeVisible()
    await page.getByRole('button', { name: en.create.question.cancelAction, exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText(en.archive.solutions.confirmDelete)).toHaveCount(0)
    await expect(solutionRows(page)).toHaveCount(2)
  })

  test('no price, currency or cost text anywhere in the Archive', async ({ page }) => {
    await seedEntries(page, listEntries())
    await page.goto('/archive?lng=en')
    await seedSolutions(page, [SOLUTION_A])
    for (const lng of LOCALE_NAMES) {
      for (const path of ['/archive', '/archive?tab=solutions', '/archive/row-a', '/archive/solutions/sol-a', '/archive/row-a?mode=study']) {
        await page.goto(`${path}${path.includes('?') ? '&' : '?'}lng=${lng}`)
        await expect(
          page.locator('[data-purpose="archive-list"], [data-purpose="solutions-list"], [data-purpose="quiz-result"], [data-purpose="solve-result"], [data-purpose="study-start"]').first(),
        ).toBeVisible()
        const text = await page.evaluate(() => document.body.innerText)
        // Seeded content has no money words; any hit is UI text.
        expect(text.match(PRICE_WORDS), `${lng} ${path}`).toBeNull()
        expect(text.match(PRICE_SYMBOLS), `${lng} ${path}`).toBeNull()
      }
    }
  })
})

// ---------------------------------------------------------------------------------------------------
// Phone width
// ---------------------------------------------------------------------------------------------------

test.describe('Phone width (390 px)', () => {
  test('@mobile the tab bar never covers a control on any Archive page, and nothing scrolls sideways', async ({ page }, testInfo) => {
    skipUnlessPhone(testInfo)
    const manyQuizzes = Array.from({ length: 25 }, (_, index) => makeEntry({ id: `ph-${index}`, title: `Phone quiz ${index}`, createdAt: new Date(Date.UTC(2026, 0, 1, 12, index)).toISOString() }, [mcq(`p${index}`)]))
    await seedEntries(page, [...listEntries(), ...manyQuizzes])

    await page.goto('/archive?lng=en')
    await expect(listRows(page)).toHaveCount(28)
    expect(await noHorizontalOverflow(page)).toBe(true)
    await expectClearOfTabBar(page)
    // The last row's Study button can be clicked (not just seen).
    await page.getByRole('link', { name: `${en.archive.study} — Charlie quiz` }).click({ trial: true })

    await page.goto('/archive/row-a?lng=en')
    await expect(page.locator('[data-purpose="quiz-result"]')).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
    await expectClearOfTabBar(page)
    await page.locator('[data-purpose="study-history"]').getByRole('link', { name: en.archive.study }).click({ trial: true })

    await page.goto('/archive?tab=solutions&lng=en')
    await seedSolutions(
      page,
      Array.from({ length: 20 }, (_, index) => ({ id: `ph-s-${index}`, createdAt: new Date(Date.UTC(2026, 2, 1, 12, index)).toISOString(), topic: `Phone topic ${index}` })),
    )
    await page.reload()
    await expect(solutionRows(page)).toHaveCount(20)
    expect(await noHorizontalOverflow(page)).toBe(true)
    await expectClearOfTabBar(page)

    await page.goto('/archive/solutions/ph-s-3?lng=en')
    await expect(page.locator('[data-purpose="solve-result"]')).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
    await expectClearOfTabBar(page)
  })

  test('@mobile empty Archive and empty Solutions fit the phone and clear the tab bar', async ({ page }, testInfo) => {
    skipUnlessPhone(testInfo)
    await page.goto('/archive?lng=en')
    await expect(page.locator('[data-purpose="archive-empty-state"]')).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
    await expectClearOfTabBar(page)
    await solutionsTab(page).click()
    await expect(page.locator('[data-purpose="solutions-empty-state"]')).toBeVisible()
    expect(await noHorizontalOverflow(page)).toBe(true)
    await expectClearOfTabBar(page)
  })

  test('@mobile long titles stay inside the phone on the list, the quiz page and the study screen, in every language', async ({ page }, testInfo) => {
    skipUnlessPhone(testInfo)
    const long = makeEntry({ id: 'long-1', title: `Long ${'W'.repeat(260)}` }, TRIO)
    const spaced = makeEntry({ id: 'long-2', title: 'A very long quiz title that should truncate cleanly instead of wrapping or overflowing the row at any size', createdAt: '2026-01-14T12:00:00.000Z' }, TRIO)
    await seedEntries(page, [long, spaced])
    for (const lng of LOCALE_NAMES) {
      await page.goto(`/archive?lng=${lng}`)
      await expect(listRows(page)).toHaveCount(2)
      expect(await noHorizontalOverflow(page)).toBe(true)
      const study = await rowOf(page, 'Long WWW').getByRole('link', { name: new RegExp(`^${LOCALES[lng].archive.study}`) }).boundingBox()
      expect(study).not.toBeNull()
      expect(study!.x + study!.width).toBeLessThanOrEqual(390)
      await page.goto(`/archive/long-1?lng=${lng}`)
      await expect(page.locator('[data-purpose="quiz-result"]')).toBeVisible()
      expect(await noHorizontalOverflow(page)).toBe(true)
      await page.goto(`/archive/long-1?mode=study&lng=${lng}`)
      await expect(page.locator('[data-purpose="study-start"]')).toBeVisible()
      expect(await noHorizontalOverflow(page)).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------------------------------
// Deleting a quiz
// ---------------------------------------------------------------------------------------------------

test.describe('Delete a quiz', () => {
  const entries = () => [
    makeEntry({ id: 'del-a', title: 'Doomed quiz', createdAt: '2026-01-16T12:00:00.000Z' }),
    makeEntry({ id: 'del-b', title: 'Keeper quiz', createdAt: '2026-01-15T12:00:00.000Z' }),
  ]
  const deleteButton = (page: Page) => page.locator('[data-purpose="archive-quiz-delete"]')
  const dialog = (page: Page) => page.getByRole('dialog')

  test('Delete asks first; Cancel keeps the quiz; confirming removes it and returns to the Archive', async ({ page }) => {
    await seedOnce(page, entries())
    await page.goto('/archive/del-a?lng=en')
    await deleteButton(page).click()
    await expect(dialog(page)).toContainText(en.archive.detail.deleteBody)
    await dialog(page).getByRole('button', { name: en.flashcards.common.cancel, exact: true }).click()
    await expect(dialog(page)).toHaveCount(0)
    expect((await storedArchive(page)).map((entry) => entry.id)).toEqual(['del-a', 'del-b'])

    await deleteButton(page).click()
    await dialog(page).getByRole('button', { name: en.archive.detail.delete, exact: true }).click()
    await expect(page).toHaveURL(/\/archive$/)
    await expect(listRows(page)).toHaveCount(1)
    await expect(listRows(page).first()).toContainText('Keeper quiz')
    expect((await storedArchive(page)).map((entry) => entry.id)).toEqual(['del-b'])
    await page.reload()
    await expect(listRows(page)).toHaveCount(1)
  })

  test('the Create "last quiz" strip follows the deletion, and cards made from the quiz stay', async ({ page }) => {
    await seedOnce(page, entries())
    await page.goto('/archive/del-a?lng=en')
    await seed(page, [{ id: 'deck-1', name: 'Cards from the quiz', sourceRef: 'del-a', cards: [{ id: 'card-1', front: 'Front', back: 'Back' }] }])
    await page.goto('/?lng=en')
    await expect(page.locator('[data-purpose="resume-quiz"]')).toContainText('Doomed quiz')
    await page.goto('/archive/del-a?lng=en')
    await deleteButton(page).click()
    await dialog(page).getByRole('button', { name: en.archive.detail.delete, exact: true }).click()
    await expect(page).toHaveURL(/\/archive$/)
    await page.goto('/?lng=en')
    await expect(page.locator('[data-purpose="resume-quiz"]')).toContainText('Keeper quiz')
    const store = await readStore(page)
    expect(store.decks.map((deck) => deck.name)).toEqual(['Cards from the quiz'])
    expect(store.cards.map((card) => card.front)).toEqual(['Front'])
  })

  test('the quiz page has the delete button in every language, red text, hidden when printing', async ({ page }) => {
    await seedOnce(page, entries())
    for (const lng of LOCALE_NAMES) {
      await page.goto(`/archive/del-a?lng=${lng}`)
      const button = page.locator('[data-purpose="archive-quiz-delete"]')
      await expect(button).toHaveText(LOCALES[lng].archive.detail.delete)
      await expect(button).toBeVisible()
      await expect(button).toHaveCSS('color', 'rgb(194, 58, 58)')
      await expect(page.locator('[data-print-hide]').filter({ has: button })).toHaveCount(1)
    }
  })
})
