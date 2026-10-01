import { test, expect } from './fixtures'
import { SAMPLE_QUIZ } from '../fixtures/quiz'

const MIXED_ENTRY = {
  id: 'seeded-print-mixed',
  title: SAMPLE_QUIZ.title,
  createdAt: '2026-01-01T00:00:00.000Z',
  source: 'text' as const,
  questionType: 'mixed',
  difficulty: 'medium',
  questionCount: '6',
  optionsCount: null,
  outputLanguage: 'auto',
  sourceText: 'Seeded source text for the archived quiz.',
  includeExplanations: true,
  quiz: { title: SAMPLE_QUIZ.title, questions: SAMPLE_QUIZ.questions },
}

/** A deliberately tiny quiz — short enough to fit on one printed page on its own — so a
 * forced page-break before the answer key can be told apart from one that only happens
 * because the content was long enough to overflow naturally. */
function tinyEntry(id: string, explanations: boolean) {
  return {
    id,
    title: 'Tiny Quiz',
    createdAt: '2026-01-01T00:00:00.000Z',
    source: 'text' as const,
    questionType: 'mixed',
    difficulty: 'medium',
    questionCount: '2',
    optionsCount: null,
    outputLanguage: 'auto',
    sourceText: 'Tiny seeded source text.',
    includeExplanations: explanations,
    quiz: {
      title: 'Tiny Quiz',
      questions: SAMPLE_QUIZ.questions.slice(0, 2).map((question) => ({
        ...question,
        explanation: explanations ? question.explanation : '',
      })),
    },
  }
}

async function countPdfPages(pdf: Buffer): Promise<number> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), useWorkerFetch: false, isEvalSupported: false }).promise
  const pages = doc.numPages
  await doc.destroy()
  return pages
}

test.describe('Print / PDF', () => {
  test('the print dialog defaults to Question sheet and offers both variants', async ({ page, seedArchive }) => {
    await seedArchive([MIXED_ENTRY])
    await page.goto(`/archive/${MIXED_ENTRY.id}?lng=en`)

    await page.getByRole('button', { name: 'Print / PDF' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('radio', { name: 'Question sheet' })).toHaveAttribute('aria-checked', 'true')
    await expect(dialog.getByRole('radio', { name: 'With answer key' })).toHaveAttribute('aria-checked', 'false')

    await dialog.getByLabel('Close').click()
    await expect(dialog).toHaveCount(0)
  })

  test('question sheet variant hides app chrome and never reveals an answer, for every question type', async ({ page, seedArchive }) => {
    await seedArchive([MIXED_ENTRY])
    await page.goto(`/archive/${MIXED_ENTRY.id}?lng=en`)
    await page.getByRole('button', { name: 'Print / PDF' }).click()

    await page.emulateMedia({ media: 'print' })

    await expect(page.locator('[data-purpose="sidebar-navigation"]')).toBeHidden()
    await expect(page.getByRole('dialog')).toBeHidden()

    const printOnly = page.locator('[data-print-only]')
    await expect(printOnly).toBeVisible()
    await expect(printOnly.locator('[data-print-answer-key]')).toHaveCount(0)

    await expect(printOnly.getByText('Name', { exact: true })).toBeVisible()
    await expect(printOnly.getByText('Class', { exact: true })).toBeVisible()
    await expect(printOnly.getByText('Date', { exact: true })).toBeVisible()

    await expect(printOnly.locator('.print-options', { hasText: 'B) Carbon dioxide' })).toBeVisible()
    await expect(printOnly.locator('.print-truefalse')).toContainText('True')
    await expect(printOnly.locator('.print-truefalse')).toContainText('False')
    await expect(printOnly.locator('.print-matching')).toContainText('Mercury')
    await expect(printOnly.locator('.print-matching-right')).toBeVisible()

    // No model answer / correct-option text leaks anywhere on the question sheet.
    await expect(printOnly).not.toContainText('Jupiter')
    await expect(printOnly).not.toContainText('Rayleigh')
  })

  test('with-answer-key variant forces the answer key onto its own page and keeps every question break-inside: avoid', async ({ page, seedArchive }) => {
    await seedArchive([tinyEntry('tiny-with-explanations', true)])
    await page.goto('/archive/tiny-with-explanations?lng=en')
    await page.getByRole('button', { name: 'Print / PDF' }).click()
    await page.getByRole('radio', { name: 'With answer key' }).click()
    await page.emulateMedia({ media: 'print' })

    const answerKey = page.locator('[data-print-answer-key]')
    await expect(answerKey).toBeVisible()
    await expect(answerKey).toContainText('carbon dioxide and release oxygen')

    // "page-break-before: always" computes to the standard "break-before: page".
    const pageBreak = await answerKey.evaluate((el) => getComputedStyle(el).breakBefore)
    expect(pageBreak).toBe('page')

    const questionBreakInside = await page
      .locator('.print-question')
      .first()
      .evaluate((el) => getComputedStyle(el).breakInside)
    expect(questionBreakInside).toBe('avoid')

    // A deliberately tiny quiz would fit on one page on its own — reaching 2 pages anyway proves
    // the break-before is actually forcing a new page, not just long content overflowing.
    const pages = await countPdfPages(await page.pdf())
    expect(pages).toBeGreaterThanOrEqual(2)
  })

  test('explanations in the answer key only appear when the quiz has them (includeExplanations)', async ({ page, seedArchive }) => {
    await seedArchive([tinyEntry('tiny-without-explanations', false)])
    await page.goto('/archive/tiny-without-explanations?lng=en')
    await page.getByRole('button', { name: 'Print / PDF' }).click()
    await page.getByRole('radio', { name: 'With answer key' }).click()
    await page.emulateMedia({ media: 'print' })

    const answerKey = page.locator('[data-print-answer-key]')
    await expect(answerKey).toBeVisible()
    await expect(answerKey).not.toContainText('carbon dioxide and release oxygen')
    await expect(answerKey).not.toContainText('—')
  })

  test('print dialog and header labels are localized in Turkish', async ({ page, seedArchive }) => {
    await seedArchive([MIXED_ENTRY])
    await page.goto(`/archive/${MIXED_ENTRY.id}?lng=tr`)
    await page.getByRole('button', { name: 'Yazdır / PDF' }).click()
    await expect(page.getByRole('radio', { name: 'Soru kağıdı' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Cevap anahtarıyla' })).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('[data-print-only]').getByText('Ad Soyad', { exact: true })).toBeVisible()
  })

  test('print dialog and header labels are localized in Western Armenian', async ({ page, seedArchive }) => {
    await seedArchive([MIXED_ENTRY])
    await page.goto(`/archive/${MIXED_ENTRY.id}?lng=hyw`)
    await page.getByRole('button', { name: 'Տպել / PDF' }).click()
    await expect(page.getByRole('radio', { name: 'Հարցումներու թերթիկ' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'Պատասխաններու բանալիով' })).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('[data-print-only]').getByText('Անուն', { exact: true })).toBeVisible()
  })
})
