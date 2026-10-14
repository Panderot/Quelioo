import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { SAMPLE_QUIZ } from '../fixtures/quiz'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import tr from '../../src/i18n/locales/tr.json' with { type: 'json' }
import hyw from '../../src/i18n/locales/hyw.json' with { type: 'json' }

// The app keeps Create, Solve, Flashcards, the Archive and the account; everything else is gone and its old addresses lead home.

const ENTRY = {
  id: 'kept-entry-1',
  title: SAMPLE_QUIZ.title,
  createdAt: '2026-01-01T00:00:00.000Z',
  source: 'text' as const,
  questionType: 'mixed',
  difficulty: 'medium',
  questionCount: String(SAMPLE_QUIZ.questions.length),
  optionsCount: null,
  outputLanguage: 'en',
  sourceText: 'Seeded source text for the archived quiz.',
  quiz: { title: SAMPLE_QUIZ.title, questions: SAMPLE_QUIZ.questions },
}

const REMOVED_PREFIXES = ['/songs', '/lessons', '/live', '/katil', '/exams']
const REMOVED_PATHS = ['/songs', '/lessons', '/lessons/abc', '/live', '/live/new', '/live/abc', '/live/abc/results', '/katil', '/katil/123456', '/exams', '/exams/new', '/exams/abc', '/exams/abc/print']

/** Every link of the page that leads to a removed feature's address. */
async function removedLinks(page: Page): Promise<string[]> {
  return page.evaluate((prefixes) => {
    return [...document.querySelectorAll('a[href]')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => prefixes.some((prefix) => href === prefix || href.startsWith(`${prefix}/`) || href.startsWith(`${prefix}?`)))
  }, REMOVED_PREFIXES)
}

test('the menu lists Create, Solve and Flashcards, with the Archive on the right', async ({ page, seedLanguage }) => {
  await seedLanguage('en')
  await page.goto('/')
  const bar = page.locator('[data-purpose="top-nav"]')
  await expect(bar.locator('nav a')).toHaveText([en.nav.create, en.nav.solve, new RegExp(`^${en.nav.flashcards}`)])
  await expect(bar.getByRole('link', { name: en.nav.archive })).toHaveCount(1)
  // The logo links to Create too, so "/" appears twice.
  await expect(bar.locator('a[href="/"], a[href="/solve"], a[href="/flashcards"], a[href="/archive"]')).toHaveCount(5)
  expect(await removedLinks(page)).toEqual([])
})

for (const path of REMOVED_PATHS) {
  test(`the old address ${path} leads to Create`, async ({ page, seedLanguage }) => {
    await seedLanguage('en')
    await page.goto(path)
    await page.waitForURL((url) => url.pathname === '/')
    await expect(page.locator('#quiz-content-input')).toBeVisible()
  })
}

test('the old addresses lead a signed-out visitor to the landing page', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('quelio.fake.signedOut.v1', '1')
    localStorage.setItem('quelio_lang', 'en')
  })
  await page.goto('/katil/123456')
  await page.waitForURL((url) => url.pathname === '/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.landing.hero.title)
})

test('no button or link of the kept pages leads to a removed feature', async ({ page, seedArchive, seedLanguage }) => {
  await seedLanguage('en')
  await seedArchive([ENTRY])
  for (const path of ['/', '/solve', '/archive', '/archive?tab=solutions', '/flashcards', `/archive/${ENTRY.id}`, `/archive/${ENTRY.id}?mode=study`, '/account']) {
    await page.goto(path)
    await expect(page.locator('main')).toBeVisible()
    expect(await removedLinks(page), path).toEqual([])
    const text = (await page.locator('body').innerText()).toLowerCase()
    expect(text, path).not.toMatch(/\bsongs?\b|audio lesson|live game|written exam|start a live|make a song/)
  }
})

test('the quiz page has no song, lesson, live game or exam buttons', async ({ page, seedArchive, seedLanguage }) => {
  await seedLanguage('en')
  await seedArchive([ENTRY])
  await page.goto(`/archive/${ENTRY.id}`)
  await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /song|lesson|live|exam/i })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /song|lesson|live|exam/i })).toHaveCount(0)
})

for (const [lang, locale] of [['tr', tr], ['en', en], ['hyw', hyw]] as const) {
  test(`the landing page does not mention the removed features in ${lang}`, async ({ page }) => {
    await page.addInitScript((l) => {
      localStorage.setItem('quelio.fake.signedOut.v1', '1')
      localStorage.setItem('quelio_lang', l)
    }, lang)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(locale.landing.hero.title)
    await expect(page.getByRole('tab', { name: locale.landing.features.tabs.cards })).toBeVisible()
    expect(Object.keys(locale.landing.features.tabs)).toEqual(['create', 'solve', 'cards'])
    const html = (await page.locator('body').innerHTML()).toLowerCase()
    expect(html).not.toMatch(/lesson-sample|\.mp3|katil|lp-bar/)
    const text = (await page.locator('body').innerText()).toLowerCase()
    expect(text).not.toMatch(/şarkı|sesli ders|canlı yarışma|yazılı sınav|\bsongs?\b|audio lesson|live game|written exam|(?<![Ա-և])երգ|ձայնային դաս/)
  })
}
