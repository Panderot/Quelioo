import { test, expect } from './fixtures'
import { SAMPLE_QUIZ } from '../fixtures/quiz'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import tr from '../../src/i18n/locales/tr.json' with { type: 'json' }
import hyw from '../../src/i18n/locales/hyw.json' with { type: 'json' }

const SEEDED_ENTRY = {
  id: 'seeded-entry-1',
  title: SAMPLE_QUIZ.title,
  createdAt: '2026-01-01T00:00:00.000Z',
  source: 'text' as const,
  questionType: 'mixed',
  difficulty: 'medium',
  questionCount: '6',
  optionsCount: null,
  outputLanguage: 'auto',
  sourceText: 'Seeded source text for the archived quiz.',
  quiz: { title: SAMPLE_QUIZ.title, questions: SAMPLE_QUIZ.questions },
}

test('seeded archive list renders and opening a quiz shows its content; direct load and refresh both work', async ({ page, seedArchive }) => {
  await seedArchive([SEEDED_ENTRY])
  await page.goto('/archive?lng=en')

  await expect(page.getByRole('link', { name: SAMPLE_QUIZ.title }).first()).toBeVisible()
  await page.getByRole('link', { name: SAMPLE_QUIZ.title }).first().click()
  await expect(page).toHaveURL(`/archive/${SEEDED_ENTRY.id}`)
  await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
  await expect(page.getByText('Name the largest planet in our solar system.').first()).toBeVisible()
  await expect(page.getByText('Jupiter', { exact: true })).not.toBeVisible()

  await page.getByRole('switch', { name: 'Show answers' }).click()
  await expect(page.getByText('Jupiter', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
})

test('the Study button opens the quiz directly in Study Mode, is keyboard accessible, and no switch remains', async ({ page, seedArchive }) => {
  await seedArchive([SEEDED_ENTRY])
  await page.goto('/archive?lng=en')

  const studyButton = page.getByRole('link', { name: `Study — ${SAMPLE_QUIZ.title}` })
  await expect(studyButton).toBeVisible()
  await expect(page.getByRole('switch')).toHaveCount(0)

  await studyButton.focus()
  await expect(studyButton).toBeFocused()
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(`/archive/${SEEDED_ENTRY.id}?mode=study`)
  await expect(page.locator('[data-purpose="study-start"]')).toBeVisible()
  await expect(page.locator('[data-purpose="question-card"]')).toHaveCount(0)
  await expect(page.getByRole('switch')).toHaveCount(0)
})

test('@mobile archive rows stay aligned at 390px with a long title and localized Study labels', async ({ page, seedArchive }, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'mobile-only: asserts against the 390px viewport')
  const longTitleEntry = {
    ...SEEDED_ENTRY,
    id: 'seeded-entry-long-title',
    title: 'A Very Long Quiz Title That Should Truncate Cleanly Instead Of Wrapping Or Overflowing The Row',
  }
  await seedArchive([longTitleEntry])

  for (const lng of ['en', 'tr', 'hyw']) {
    await page.goto(`/archive?lng=${lng}`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
    const row = page.locator('[data-purpose="archive-list"] li').first()
    await expect(row).toBeVisible()
    const studyLink = row.getByRole('link').last()
    await expect(studyLink).toBeVisible()
    const box = await studyLink.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  }
})

test('unknown archive id and unknown route both show a not-found state', async ({ page, seedArchive }) => {
  await seedArchive([SEEDED_ENTRY])

  await page.goto('/archive/does-not-exist?lng=en')
  await expect(page.getByText('Quiz not found')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Back to Archive' })).toBeVisible()

  await page.goto('/some/unknown/route?lng=en')
  await expect(page.getByText('Page not found')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Go to Create' })).toBeVisible()
})

for (const [lang, strings] of [['tr', tr], ['en', en], ['hyw', hyw]] as const) {
  test(`Archive study button opens study mode in one click even after the detail page was visited, Back returns to Archive, card still opens detail (${lang})`, async ({ page, seedArchive }) => {
    await seedArchive([SEEDED_ENTRY])
    const detailUrl = `/archive/${SEEDED_ENTRY.id}`
    const study = () => page.getByRole('link', { name: `${strings.archive.study} — ${SAMPLE_QUIZ.title}` })
    const card = () => page.locator(`[data-purpose="archive-list"] li a[href="${detailUrl}"]`)
    const studyScreen = page.locator('[data-purpose="study-start"]')
    const editPage = page.locator('[data-purpose="question-card"]').first()

    await page.goto(`/archive?lng=${lang}`)
    // Card click (not the button) opens the plain detail page, which then stays mounted (kept route).
    await card().click()
    await expect(page).toHaveURL(detailUrl)
    await expect(editPage).toBeVisible()
    await expect(studyScreen).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(/\/archive(\?|$)/)

    await study().click()
    await expect(page).toHaveURL(`${detailUrl}?mode=study`)
    await expect(studyScreen).toBeVisible()
    await expect(page.getByText(strings.study.label, { exact: true }).first()).toBeVisible()

    // Back from study returns to Archive; the card body then opens the detail page, never the remembered study screen.
    await page.goBack()
    await expect(page).toHaveURL(/\/archive(\?|$)/)
    await card().click()
    await expect(page).toHaveURL(detailUrl)
    await expect(editPage).toBeVisible()
    await expect(studyScreen).toHaveCount(0)

    // And the study button still needs one click, also right after the detail page was shown.
    await page.goBack()
    await study().click()
    await expect(studyScreen).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(/\/archive(\?|$)/)
    await expect(study()).toBeVisible()
  })
}
