import { test, expect } from './fixtures'
import { SAMPLE_QUIZ } from '../fixtures/quiz'

const SEEDED_ENTRY = {
  id: 'seeded-entry-1',
  title: SAMPLE_QUIZ.title,
  createdAt: '2026-01-01T00:00:00.000Z',
  source: 'text' as const,
  questionType: 'mixed',
  difficulty: 'medium',
  questionCount: '6',
  optionsCount: null,
  studyMode: false,
  outputLanguage: 'auto',
  sourceText: 'Seeded source text for the archived quiz.',
  quiz: { title: SAMPLE_QUIZ.title, questions: SAMPLE_QUIZ.questions },
}

test('seeded archive list renders and opening a quiz shows its content; direct load and refresh both work', async ({ page, seedArchive }) => {
  await seedArchive([SEEDED_ENTRY])
  await page.goto('/archive?lng=en')

  await expect(page.getByRole('link', { name: SAMPLE_QUIZ.title })).toBeVisible()
  await page.getByRole('link', { name: SAMPLE_QUIZ.title }).click()
  await expect(page).toHaveURL(`/archive/${SEEDED_ENTRY.id}`)
  await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
  await expect(page.getByText('Name the largest planet in our solar system.').first()).toBeVisible()
  await expect(page.getByText('Jupiter', { exact: true })).not.toBeVisible()

  await page.getByRole('switch', { name: 'Show answers' }).click()
  await expect(page.getByText('Jupiter', { exact: true })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: SAMPLE_QUIZ.title })).toBeVisible()
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
