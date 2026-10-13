import { unzipSync } from 'fflate'

import { test, expect } from './fixtures'
import { E2E_USER_ID, EXAM_SOURCE, fakeFacts, mockExamApi, seedExams, storedExams } from './examHelpers'
import { buildExamDocx, buildExamZip } from '../../src/lib/exam/docx'
import { examFileBase } from '../../src/lib/exam/paperText'
import { buildMemory } from '../../src/lib/exam/sourceMemory'
import type { ExamQuestionType, WrittenExam } from '../../src/lib/exam/types'
import { sampleExam } from '../fixtures/exam'
import { SAMPLE_QUIZ } from '../fixtures/quiz'

// Written exam features on the fake backend: Bloom setting, MEB format, own distribution rows, export check, new questions of every type,
// the one class field, Archive conversion, spell-check language, print hint and title, exam time and the four checkboxes.

type Page = import('@playwright/test').Page

const EXAM_ID = '7b1f6a52-3c1e-4c52-9a53-0d3b2f2a9c01'
const cards = (page: Page) => page.locator('[data-purpose="exam-question"]')

async function pick(page: Page, trigger: string, option: string | RegExp) {
  await page.locator(trigger).click()
  await page.getByRole('option', { name: option }).click()
}

const gradeButton = (page: Page) => page.getByRole('button', { name: 'Grade', exact: true })

async function fillSource(page: Page, text = EXAM_SOURCE) {
  const box = page.locator('#quiz-content-input')
  await box.click()
  await box.fill(text)
}

test.describe('Bloom setting (E1, E2, E3)', () => {
  test('the dropdown lists every option, shows the info tip and previews the counts of the grade', async ({ page }) => {
    await page.goto('/exams/new?d=bl1&lng=en')
    await page.locator('#exam-bloom').click()
    const options = await page.getByRole('option').allInnerTexts()
    expect(options.map((option) => option.trim())).toEqual([
      'All levels (balanced)',
      '1 · Remember',
      '2 · Understand',
      '3 · Apply',
      '4 · Analyze',
      '5 · Evaluate',
      '6 · Create',
      'Higher-order thinking (Analyze, Evaluate, Create)',
    ])
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: "About Bloom's taxonomy" }).hover()
    await expect(page.getByRole('tooltip')).toContainText("Revised Bloom's taxonomy. Under their old names: Knowledge, Comprehension, Application, Analysis, Synthesis, Evaluation.")
    // Grade 9, 20 questions: 15 / 25 / 25 / 20 / 10 / 5 percent.
    await expect(page.locator('[data-purpose="exam-bloom-preview"]')).toHaveText('Mix: Remember 3 · Understand 5 · Apply 5 · Analyze 4 · Evaluate 2 · Create 1')
    await expect(page.locator('[data-purpose="exam-bloom-note"]')).toHaveCount(0)
  })

  test('the mix follows the class and the number of questions', async ({ page }) => {
    await page.goto('/exams/new?d=bl2&lng=en')
    await gradeButton(page).click()
    await page.getByRole('option', { name: 'Grade 3', exact: true }).click()
    await expect(page.locator('[data-purpose="exam-bloom-preview"]')).toHaveText('Mix: Remember 6 · Understand 7 · Apply 5 · Analyze 2')
    await page.locator('#exam-count-mcq').fill('0')
    await page.locator('#exam-count-true-false').fill('0')
    await expect(page.locator('[data-purpose="exam-bloom-preview"]')).toContainText('Remember')
  })

  test('a level a type cannot reach says so inline, and "Create" for everything caps the other types', async ({ page }) => {
    await page.goto('/exams/new?d=bl3&lng=en')
    await pick(page, '#exam-bloom', '6 · Create')
    const notes = page.locator('[data-purpose="exam-bloom-note"]')
    await expect(notes.filter({ hasText: 'True / false questions can be at most at the Understand level. Evaluate and Create are measured with open-ended questions.' })).toHaveCount(1)
    await expect(notes.filter({ hasText: 'Multiple choice questions can be at most at the Analyze level. Evaluate and Create are measured with open-ended questions.' })).toHaveCount(1)
    await expect(page.locator('[data-purpose="exam-bloom-preview"]')).toHaveText('Mix: Understand 5 · Apply 5 · Analyze 5 · Create 5')
    await pick(page, '#exam-bloom', '1 · Remember')
    await expect(notes).toHaveCount(0)
    await expect(page.locator('[data-purpose="exam-bloom-preview"]')).toHaveText('Mix: Remember 20')
  })

  test('"Adjust question types to this" moves the counts towards open-ended and multiple-choice, and the notes go away', async ({ page }) => {
    await page.goto('/exams/new?d=bl3b&lng=en')
    await pick(page, '#exam-bloom', 'Higher-order thinking (Analyze, Evaluate, Create)')
    const adjust = page.locator('[data-purpose="exam-bloom-adjust"]')
    await expect(adjust).toHaveText('Adjust question types to this')
    await expect(page.locator('[data-purpose="exam-bloom-note"]').first()).toBeVisible()
    await adjust.click()
    await expect(page.locator('[data-purpose="exam-bloom-note"]')).toHaveCount(0)
    await expect(adjust).toHaveCount(0)
    const value = async (type: string) => Number(await page.locator(`#exam-count-${type}`).inputValue())
    expect(await value('true-false')).toBe(0)
    expect(await value('open-ended')).toBeGreaterThanOrEqual(5)
    // The teacher can still change them back.
    await page.locator('#exam-count-true-false').fill('4')
    await expect(page.locator('[data-purpose="exam-bloom-note"]').first()).toBeVisible()
  })

  test('the setting is sent with the slots: every section asks for its levels and the questions store them', async ({ page }) => {
    const api = await mockExamApi(page)
    await page.goto('/exams/new?d=bl4&lng=en')
    await pick(page, '#exam-bloom', '1 · Remember')
    await fillSource(page)
    await page.locator('[data-purpose="exam-generate"]').click()
    await expect(page).toHaveURL(/\/exams\/[0-9a-f-]{36}$/)
    const sections = api.calls().filter((call) => call.mode === 'exam_section')
    expect(sections.length).toBeGreaterThan(0)
    for (const call of sections) {
      const slots = call.slots as { bloom: number; difficulty: string }[]
      expect(slots.every((slot) => slot.bloom === 1)).toBe(true)
      expect(slots.every((slot) => slot.difficulty !== 'hard')).toBe(true)
    }
    const stored = (await storedExams(page))[0]
    expect(stored.settings.bloom).toBe('1')
    // The mocked server returns no level; the editor shows "Not set" for them and lets the teacher choose.
    await expect(page.locator('[data-purpose="exam-bloom-chip"]').first()).toBeVisible()
  })

  test('each question has a Bloom chip the teacher can change; the student paper never shows it', async ({ page }) => {
    const exam = sampleExam()
    await seedExams(page, [exam])
    await page.goto(`/exams/${EXAM_ID}?lng=en`)
    const chip = page.locator('[data-purpose="exam-bloom-chip"]').first()
    await expect(chip).toHaveValue('3')
    await chip.selectOption('6')
    await expect(page.locator('[data-purpose="exam-save-state"]')).toHaveAttribute('data-state', 'saved')
    expect((await storedExams(page))[0].questions[0].bloomLevel).toBe(6)
    // True-false questions cannot be set above Understand.
    const tfChip = page.locator('[data-question-id="tf-1"] [data-purpose="exam-bloom-chip"]')
    expect(await tfChip.locator('option').allInnerTexts()).toEqual(['Not set', 'Remember', 'Understand'])
    const paper = await page.locator('[data-purpose="exam-paper"][data-part="exam"]').innerText()
    expect(paper).not.toContain('Remember')
    expect(paper).not.toContain('Create')
  })

  test('an Archive question has no level until the teacher sets one', async ({ page, seedArchive }) => {
    await seedArchive([
      {
        id: 'q1',
        title: SAMPLE_QUIZ.title,
        createdAt: '2026-01-01T00:00:00.000Z',
        source: 'text',
        questionType: 'mixed',
        difficulty: 'medium',
        questionCount: String(SAMPLE_QUIZ.questions.length),
        optionsCount: null,
        outputLanguage: 'auto',
        sourceText: 'Seeded source text.',
        quiz: { title: SAMPLE_QUIZ.title, questions: SAMPLE_QUIZ.questions },
      },
    ])
    await page.goto('/archive?lng=en')
    await page.getByRole('button', { name: `Turn into written exam — ${SAMPLE_QUIZ.title}` }).click()
    await expect(page).toHaveURL(/\/exams\/[0-9a-f-]{36}$/)
    expect((await storedExams(page))[0].questions.every((question) => question.bloomLevel === undefined)).toBe(true)
    await expect(page.locator('[data-purpose="exam-bloom-chip"]').first()).toHaveValue('')
  })
})

test.describe('MEB common written exam and own distribution (E7, E8)', () => {
  test('MEB format: only open-ended and short-answer, the key stays on, the old counts come back', async ({ page }) => {
    await page.goto('/exams/new?d=meb1&lng=en')
    await pick(page, '#exam-format', 'MEB common written exam')
    await expect(page.locator('[data-purpose="exam-meb-hint"]')).toBeVisible()
    for (const type of ['true-false', 'mcq', 'fill-blanks', 'matching']) {
      await expect(page.locator(`#exam-count-${type}`)).toBeDisabled()
      await expect(page.locator(`#exam-count-${type}`)).toHaveValue('0')
    }
    await expect(page.locator('#exam-count-open-ended')).toBeEnabled()
    await expect(page.locator('#exam-count-open-ended')).toHaveValue('5')
    await expect(page.getByLabel('Answer key and grading criteria')).toBeChecked()
    await expect(page.getByLabel('Answer key and grading criteria')).toBeDisabled()
    await pick(page, '#exam-format', 'Free')
    await expect(page.locator('#exam-count-mcq')).toHaveValue('5')
    await expect(page.locator('#exam-count-mcq')).toBeEnabled()
  })

  test('a MEB exam asks the server only for those two types and forces the key on', async ({ page }) => {
    const api = await mockExamApi(page)
    await page.goto('/exams/new?d=meb2&lng=en')
    await page.getByLabel('Answer key and grading criteria').uncheck()
    await pick(page, '#exam-format', 'MEB common written exam')
    await fillSource(page)
    await page.locator('[data-purpose="exam-generate"]').click()
    await expect(page).toHaveURL(/\/exams\/[0-9a-f-]{36}$/)
    const types = new Set(api.calls().filter((call) => call.mode === 'exam_section').map((call) => call.type))
    expect([...types].sort()).toEqual(['open-ended', 'short-answer'])
    const stored = (await storedExams(page))[0]
    expect(stored.settings.format).toBe('meb')
    expect(stored.settings.answerKey).toBe(true)
    expect(new Set(stored.questions.map((question) => question.type))).toEqual(new Set(['open-ended', 'short-answer']))
  })

  test('the distribution rows: add and remove, the live sum must equal the question count', async ({ page }) => {
    await page.goto('/exams/new?d=dist1&lng=en')
    await expect(page.locator('[data-purpose="exam-distribution"]')).toHaveCount(0)
    await page.locator('[data-purpose="exam-distribution-toggle"]').check()
    const rows = page.locator('[data-purpose="exam-distribution-row"]')
    await expect(rows).toHaveCount(1)
    await expect(page.locator('[data-purpose="exam-distribution-sum"]')).toHaveText('Total 20 / 20')
    await rows.nth(0).getByLabel('Row 1, outcome').fill('Cell organelles')
    await rows.nth(0).getByLabel('Row 1, number of questions').fill('12')
    await expect(page.locator('[data-purpose="exam-distribution-sum"]')).toHaveText('Total 12 / 20')
    await expect(page.locator('[data-purpose="exam-generate"]')).toBeDisabled()
    await page.locator('[data-purpose="exam-distribution-add"]').click()
    await rows.nth(1).getByLabel('Row 2, outcome').fill('Cell theory')
    await rows.nth(1).getByLabel('Row 2, number of questions').fill('8')
    await expect(page.locator('[data-purpose="exam-distribution-sum"]')).toHaveText('Total 20 / 20')
    await fillSource(page)
    await expect(page.locator('[data-purpose="exam-generate"]')).toBeEnabled()
    await page.getByLabel('Remove row 2').click()
    await expect(rows).toHaveCount(1)
    await expect(page.locator('[data-purpose="exam-generate"]')).toBeDisabled()
  })

  test('a row the source has no content for is named before any question is written', async ({ page }) => {
    const sections: unknown[] = []
    await page.route('**/api/generate', async (route) => {
      const payload = route.request().postDataJSON() as { mode: string; count: number; topics?: string[] }
      if (payload.mode === 'exam_plan') {
        // Every fact belongs to the first row; the second row has no content.
        expect(payload.topics).toEqual(['Photosynthesis', 'Mitosis'])
        const facts = fakeFacts(payload.count).map((entry) => ({ ...entry, topic: 'Photosynthesis' }))
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ facts }) })
      }
      sections.push(payload)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ wrong: [], fixes: [], same: [], reviews: [] }) })
    })
    await page.goto('/exams/new?d=dist2&lng=en')
    await page.locator('#exam-count-short-answer').fill('0')
    await page.locator('#exam-count-true-false').fill('0')
    await page.locator('#exam-count-mcq').fill('0')
    await page.locator('#exam-count-open-ended').fill('10')
    await page.locator('[data-purpose="exam-distribution-toggle"]').check()
    const rows = page.locator('[data-purpose="exam-distribution-row"]')
    await rows.nth(0).getByLabel('Row 1, outcome').fill('Photosynthesis')
    await rows.nth(0).getByLabel('Row 1, number of questions').fill('6')
    await page.locator('[data-purpose="exam-distribution-add"]').click()
    await rows.nth(1).getByLabel('Row 2, outcome').fill('Mitosis')
    await rows.nth(1).getByLabel('Row 2, number of questions').fill('4')
    await fillSource(page)
    await page.locator('[data-purpose="exam-generate"]').click()
    const warning = page.locator('[data-purpose="exam-short-rows"]')
    await expect(warning).toContainText('The text does not hold enough content for “Mitosis” (0 / 4 questions).')
    expect(sections).toHaveLength(0)
    expect(await storedExams(page)).toEqual([])
    for (const purpose of ['exam-rows-add-text', 'exam-rows-continue', 'exam-rows-dismiss']) await expect(page.locator(`[data-purpose="${purpose}"]`)).toBeVisible()
  })
})

test.describe('one class field (B6) and exam time (B10)', () => {
  test('the form has a single class field with an optional section, and no separate level', async ({ page }) => {
    await page.goto('/exams/new?d=cls1&lng=en')
    await expect(gradeButton(page)).toHaveCount(1)
    await expect(page.getByText('Level', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('Section')).toBeVisible()
    await gradeButton(page).click()
    const options = (await page.getByRole('option').allInnerTexts()).map((text) => text.trim())
    expect(options).toEqual(['Choose', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`), 'University', 'Other'])
  })

  test('the time is a whole number from 5 to 240, and may be empty', async ({ page }) => {
    await page.goto('/exams/new?d=dur1&lng=en')
    await fillSource(page)
    const generate = page.locator('[data-purpose="exam-generate"]')
    for (const [value, valid] of [['4', false], ['241', false], ['5', true], ['240', true], ['', true], ['40.5', false]] as const) {
      await page.locator('#exam-duration').fill(value)
      await (valid ? expect(generate).toBeEnabled() : expect(generate).toBeDisabled())
    }
  })

  test('with a time the header shows "Süre: 40 dakika" (EN "Time: 40 minutes"); empty hides the line; it survives a reload', async ({ page }) => {
    await seedExams(page, [sampleExam()])
    await page.goto(`/exams/${EXAM_ID}?lng=en`)
    const paper = page.locator('[data-purpose="exam-paper"][data-part="exam"]')
    await expect(paper).toContainText('Süre: 40 dakika')
    await page.locator('[data-purpose="exam-details"] summary').click()
    await page.locator('#editor-duration').fill('')
    await expect(paper).not.toContainText('Süre')
    await expect(page.locator('[data-purpose="exam-save-state"]')).toHaveAttribute('data-state', 'saved')
    await page.reload()
    await expect(page.locator('[data-purpose="exam-paper"][data-part="exam"]')).not.toContainText('Süre')
    expect((await storedExams(page))[0].settings.durationMinutes).toBeNull()
    await page.locator('[data-purpose="exam-details"] summary').click()
    await page.locator('#editor-duration').fill('90')
    await expect(page.locator('[data-purpose="exam-paper"][data-part="exam"]')).toContainText('Süre: 90 dakika')
  })
})

test.describe('Archive conversion (B7)', () => {
  test('school, teacher and year are remembered; course and class stay empty with a visible hint', async ({ page, seedArchive }) => {
    await page.addInitScript((userId) => {
      localStorage.setItem(`quelio.examHeader.v1.${userId}`, JSON.stringify({ school: 'Atatürk Anadolu Lisesi', academicYear: '2026-2027', term: 2, examNo: 2, course: 'Biyoloji', grade: '9', section: 'C', teacher: 'Ayşe Çelik' }))
    }, E2E_USER_ID)
    await seedArchive([
      {
        id: 'bees',
        title: 'Arılar ve Kovandaki Görevleri',
        createdAt: '2026-01-01T00:00:00.000Z',
        source: 'text',
        questionType: 'mixed',
        difficulty: 'medium',
        questionCount: String(SAMPLE_QUIZ.questions.length),
        optionsCount: null,
        outputLanguage: 'auto',
        sourceText: 'Arılar kovanda görev paylaşımı yapar.',
        quiz: { title: 'Arılar ve Kovandaki Görevleri', questions: SAMPLE_QUIZ.questions },
      },
    ])
    await page.goto('/archive?lng=en')
    await page.getByRole('button', { name: 'Turn into written exam — Arılar ve Kovandaki Görevleri' }).click()
    await expect(page).toHaveURL(/\/exams\/[0-9a-f-]{36}$/)
    const stored = (await storedExams(page))[0]
    expect(stored.settings.header).toMatchObject({ school: 'Atatürk Anadolu Lisesi', teacher: 'Ayşe Çelik', academicYear: '2026-2027', course: '', grade: '', section: '' })
    await expect(page.locator('[data-purpose="exam-header-hint"]')).toContainText('Enter the course and the class')
    await page.locator('[data-purpose="exam-header-hint-open"]').click()
    await expect(page.locator('[data-purpose="exam-details"]')).toHaveAttribute('open', '')
    // The "New written exam" form may still prefill them: the teacher sees and edits them there.
    await page.goto('/exams/new?d=pre1&lng=en')
    await expect(page.getByLabel('Course', { exact: true })).toHaveValue('Biyoloji')
  })
})

test.describe('adding questions of every type (B9)', () => {
  const TYPES: [ExamQuestionType, string][] = [
    ['open-ended', 'Open-ended'],
    ['short-answer', 'Short answer'],
    ['fill-blanks', 'Fill in the blank'],
    ['true-false', 'True / false'],
    ['mcq', 'Multiple choice'],
    ['matching', 'Matching'],
  ]

  test('"Add" gives a correct empty template for each type, fully editable, and the export check lists what is missing', async ({ page }) => {
    const exam: WrittenExam = { ...sampleExam(), questions: [] }
    await seedExams(page, [exam])
    await page.goto(`/exams/${EXAM_ID}?lng=en`)
    for (const [type] of TYPES) {
      await page.locator('#exam-add-type').selectOption(type)
      await page.locator('[data-purpose="exam-add-question"]').click()
    }
    await expect(cards(page)).toHaveCount(6)
    // Every template says what is missing when exporting.
    await page.locator('[data-purpose="exam-docx"]').click()
    const dialog = page.locator('[data-purpose="exam-export-check"]')
    await expect(dialog).toBeVisible()
    for (const line of [/Question 1: the question text is empty, no answer is written/, /Question 2: .*no answer is written/, /Question 3: .*no blank is marked/, /Question 4: .*true \/ false is not selected/, /Question 5: .*no correct option is selected/, /Question 6: .*a matching item is empty/]) {
      await expect(dialog.getByText(line)).toBeVisible()
    }
    await dialog.locator('[data-purpose="exam-export-cancel"]').click()

    // Fill each template in.
    const card = (index: number) => cards(page).nth(index)
    await card(0).locator('[data-purpose="exam-stem"]').fill('Explain the cell theory.')
    await card(0).locator('[data-purpose="exam-answer"]').fill('All living things consist of cells.')
    await card(1).locator('[data-purpose="exam-stem"]').fill('Which organelle makes proteins?')
    await card(1).locator('[data-purpose="exam-answer"]').fill('ribosome')
    await card(2).locator('[data-purpose="exam-stem"]').fill('The powerhouse is the ')
    await card(2).locator('[data-purpose="exam-insert-blank"]').click()
    await card(2).locator('[data-purpose="exam-answer"]').fill('mitochondrion')
    await expect(card(2).locator('[data-purpose="exam-stem"]')).toHaveValue('The powerhouse is the ___')
    await card(3).locator('[data-purpose="exam-stem"]').fill('Ribosomes make protein.')
    await card(3).getByLabel('True', { exact: true }).check()
    await card(4).locator('[data-purpose="exam-stem"]').fill('Which one is an organelle?')
    for (const [index, text] of ['Nucleus', 'Atom', 'Tissue', 'Organ'].entries()) await card(4).getByLabel(`Option ${String.fromCharCode(65 + index)}`, { exact: true }).fill(text)
    await card(4).getByLabel('Option A is correct').check()
    // Reorder: move the correct option down; the key moves with it.
    await card(4).getByLabel('Move option A down').click()
    await expect(card(4).getByLabel('Option B is correct')).toBeChecked()
    await expect(card(4).getByLabel('Option B', { exact: true })).toHaveValue('Nucleus')
    await card(4).getByLabel('Option D', { exact: true }).fill('Organ')
    await card(5).locator('[data-purpose="exam-stem"]').fill('Match the organelle with its job.')
    for (const [index, [left, right]] of [['Ribosome', 'Protein synthesis'], ['Lysosome', 'Digestion'], ['Golgi', 'Secretion'], ['Chloroplast', 'Photosynthesis']].entries()) {
      await card(5).getByLabel(`Pair ${index + 1}, left`).fill(left)
      await card(5).getByLabel(`Pair ${index + 1}, right`).fill(right)
    }
    await card(5).getByLabel('Extra item 1', { exact: true }).fill('Storage')
    await card(5).getByLabel('Extra item 2', { exact: true }).fill('Excretion')
    // Add and remove a pair and an extra item.
    await card(5).getByText('+ Add pair').click()
    await expect(card(5).getByLabel('Pair 5, left')).toBeVisible()
    await card(5).getByLabel('Remove pair 5').click()
    await card(5).locator('[data-purpose="exam-add-extra"]').click()
    await card(5).getByLabel('Remove extra item 3').click()
    // Points to 100, then the export goes straight through.
    await page.locator('[data-purpose="exam-redistribute"]').click()
    await expect(page.locator('[data-purpose="exam-total"]')).toContainText('100 / 100')
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-purpose="exam-docx"]').click()])
    expect(download.suggestedFilename()).toBe('Biyoloji-10-Sinif-Yazili-A-Grubu.docx')
    await expect(page.locator('[data-purpose="exam-export-check"]')).toHaveCount(0)
    await expect(page.locator('[data-purpose="exam-save-state"]')).toHaveAttribute('data-state', 'saved')
    const stored = (await storedExams(page))[0]
    expect(stored.questions).toHaveLength(6)
    expect(stored.questions[4].answerIndex).toBe(1)
    expect(stored.questions[5].extras).toEqual(['Storage', 'Excretion'])
  })

  test('deleting and reordering keep the numbering, the points and the tables right', async ({ page }) => {
    await seedExams(page, [sampleExam()])
    await page.goto(`/exams/${EXAM_ID}?lng=en`)
    await page.locator('[data-purpose="exam-preview-key"]').click()
    const key = page.locator('[data-purpose="exam-paper"][data-part="key"]')
    await expect(key.locator('[data-table="distribution"]')).toContainText('22')
    await cards(page).first().locator('[data-purpose="exam-delete-question"]').click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await expect(cards(page)).toHaveCount(21)
    await expect(page.locator('[data-purpose="exam-total"]')).toContainText('90 / 100')
    await expect(key.locator('[data-table="distribution"]')).toContainText('21')
    await expect(key.locator('[data-key-question]')).toHaveCount(21)
    // Moving a question changes its number in the key table.
    await cards(page).nth(2).locator('[data-purpose="exam-move-down"]').click()
    await expect(key.locator('[data-table="distribution"] tr', { hasText: 'Fotosentez' })).toContainText('1, 2, 4')
  })
})

test.describe('the export check (B3)', () => {
  const offExam = (): WrittenExam => {
    const exam = sampleExam()
    return { ...exam, questions: exam.questions.map((question, index) => (index === 0 ? { ...question, points: 7, rubric: [{ text: 'bir', points: 4 }, { text: 'iki', points: 3 }] } : question)) }
  }
  const buttons = [
    ['exam-print', 'PDF / Print'],
    ['exam-print-key', 'key'],
    ['exam-print-b', 'group B'],
    ['exam-docx', 'Word'],
    ['exam-docx-key', 'key docx'],
    ['exam-docx-b', 'group B docx'],
    ['exam-docx-zip', 'zip'],
  ] as const

  for (const [purpose, name] of buttons) {
    test(`${name}: with 97 points the dialog offers scale, export anyway and cancel`, async ({ page }) => {
      await seedExams(page, [offExam()])
      await page.goto(`/exams/${EXAM_ID}?lng=en`)
      await expect(page.locator('[data-purpose="exam-total"]')).toContainText('97 / 100')
      await page.locator(`[data-purpose="${purpose}"]`).click()
      const dialog = page.locator('[data-purpose="exam-export-check"]')
      await expect(dialog).toContainText('The points add up to 97.')
      for (const action of ['exam-export-redistribute', 'exam-export-continue', 'exam-export-cancel']) await expect(dialog.locator(`[data-purpose="${action}"]`)).toBeVisible()
      await dialog.locator('[data-purpose="exam-export-cancel"]').click()
      await expect(dialog).toHaveCount(0)
    })
  }

  test('"Scale to 100" keeps the ratios with whole numbers and rescales every rubric; then the export goes on', async ({ page }) => {
    await seedExams(page, [offExam()])
    await page.goto(`/exams/${EXAM_ID}?lng=en`)
    await page.locator('[data-purpose="exam-docx"]').click()
    await page.locator('[data-purpose="exam-export-redistribute"]').click()
    const dialog = page.locator('[data-purpose="exam-export-check"]')
    await expect(dialog.locator('[data-purpose="exam-export-ready"]')).toBeVisible()
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.locator('[data-purpose="exam-export-continue"]').click()])
    expect(download.suggestedFilename()).toContain('Biyoloji')
    await expect(page.locator('[data-purpose="exam-total"]')).toContainText('100 / 100')
    await expect(page.locator('[data-purpose="exam-save-state"]')).toHaveAttribute('data-state', 'saved')
    const stored = (await storedExams(page))[0]
    expect(stored.questions.reduce((sum, question) => sum + question.points, 0)).toBe(100)
    for (const question of stored.questions) {
      expect(Number.isInteger(question.points)).toBe(true)
      expect(question.rubric.reduce((sum, item) => sum + item.points, 0)).toBe(question.points)
    }
  })

  test('"Export anyway" with 97 points downloads the file as it is', async ({ page }) => {
    await seedExams(page, [offExam()])
    await page.goto(`/exams/${EXAM_ID}?lng=en`)
    await page.locator('[data-purpose="exam-docx"]').click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-purpose="exam-export-continue"]').click()])
    expect(download.suggestedFilename()).toBe('Biyoloji-10-Sinif-Yazili-A-Grubu.docx')
    expect((await storedExams(page))[0].questions[0].points).toBe(7)
  })

  test('the dialog also reminds about an empty course or class, and the TR and HYW texts exist', async ({ page }) => {
    const exam = sampleExam()
    await seedExams(page, [{ ...exam, settings: { ...exam.settings, header: { ...exam.settings.header, course: '', grade: '' } } }])
    await page.goto(`/exams/${EXAM_ID}?lng=tr`)
    await page.locator('[data-purpose="exam-docx"]').click()
    await expect(page.locator('[data-purpose="exam-export-header"]')).toContainText('Ders ya da sınıf boş')
    await expect(page.locator('[data-purpose="exam-export-continue"]')).toHaveText('Yine de indir')
    await expect(page.locator('[data-purpose="exam-export-cancel"]')).toHaveText('Vazgeç')
  })
})

test.describe('spell-check language (B8)', () => {
  test('the paper and every editable field carry the language of the paper, not of the app', async ({ page }) => {
    await seedExams(page, [sampleExam()])
    await page.goto(`/exams/${EXAM_ID}?lng=en`)
    await expect(page.locator('[data-purpose="exam-paper"]').first()).toHaveAttribute('lang', 'tr')
    const wrong = await page.locator('[data-purpose="exam-question"] textarea, [data-purpose="exam-question"] input[type="text"], [data-purpose="exam-question"] input:not([type])').evaluateAll((fields) =>
      fields.filter((field) => field.getAttribute('lang') !== 'tr' || !(field as HTMLInputElement).spellcheck).length,
    )
    expect(wrong).toBe(0)
  })

  test('an English exam is checked as English', async ({ page }) => {
    const exam = sampleExam()
    await seedExams(page, [{ ...exam, settings: { ...exam.settings, outputLanguage: 'en' } }])
    await page.goto(`/exams/${EXAM_ID}?lng=tr`)
    await expect(page.locator('[data-purpose="exam-paper"]').first()).toHaveAttribute('lang', 'en')
    await expect(page.locator('[data-purpose="exam-stem"]').first()).toHaveAttribute('lang', 'en')
  })
})

test.describe('print page (B11)', () => {
  test('the hint explains how to save a PDF and the page title becomes the file name (with the group)', async ({ page }) => {
    await seedExams(page, [sampleExam()])
    await page.goto(`/exams/${EXAM_ID}/print?part=exam&group=A&lng=tr`)
    await expect(page.locator('[data-purpose="exam-print-pdf-hint"]')).toHaveText('Açılan pencerede Hedef: “PDF olarak kaydet” seçin.')
    await expect(page).toHaveTitle('Biyoloji-10-Sinif-Yazili-A-Grubu')
    await page.goto(`/exams/${EXAM_ID}/print?part=key&group=B&lng=tr`)
    await expect(page).toHaveTitle('Biyoloji-10-Sinif-Yazili-B-Grubu-Cevap-Anahtari')
    await page.goto(`/exams/${EXAM_ID}/print?part=exam&group=A&lng=en`)
    await expect(page.locator('[data-purpose="exam-print-pdf-hint"]')).toHaveText('In the window that opens, choose Destination: “Save as PDF”.')
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('[data-purpose="exam-print-pdf-hint"]')).toBeHidden()
  })
})

test.describe('the four checkboxes decide every output (B10)', () => {
  const combos = Array.from({ length: 16 }, (_, index) => ({ answerKey: Boolean(index & 1), groups: Boolean(index & 2), topicTable: Boolean(index & 4), footer: Boolean(index & 8) }))

  for (const combo of combos) {
    test(`zip and Word for ${JSON.stringify(combo)}`, async () => {
      const exam = sampleExam()
      const settings = { ...exam.settings, ...combo }
      const custom: WrittenExam = { ...exam, settings }
      const names = Object.keys(unzipSync(await buildExamZip(custom))).sort()
      const expected = [
        examFileBase(custom, 'exam', 'A') + '.docx',
        ...(combo.groups ? [examFileBase(custom, 'exam', 'B') + '.docx'] : []),
        ...(combo.answerKey ? [examFileBase(custom, 'key', 'A') + '.docx', ...(combo.groups ? [examFileBase(custom, 'key', 'B') + '.docx'] : [])] : []),
      ].sort()
      expect(names).toEqual(expected)
      // Tables only in the key, only when asked for; the footer brand follows the box, the page numbers never go away.
      const parts = unzipSync(await buildExamDocx(custom, 'key', combo.groups ? 'both' : 'A'))
      const document = new TextDecoder().decode(parts['word/document.xml'])
      expect(document.includes('Belirtke tablosu')).toBe(combo.topicTable)
      expect(document.includes('Konu-soru dağılım tablosu')).toBe(combo.topicTable)
      expect(document.includes('B GRUBU')).toBe(combo.groups)
      const footer = new TextDecoder().decode(parts['word/footer1.xml'])
      expect(footer.includes('Quelio ile hazırlandı')).toBe(combo.footer)
      expect(footer).toContain('PAGE')
      expect(footer).toContain('NUMPAGES')
    })
  }

  test('in the editor the boxes show or hide the key and group buttons, the preview tabs and the key tables, and survive a reload', async ({ page }) => {
    await seedExams(page, [sampleExam()])
    await page.goto(`/exams/${EXAM_ID}?lng=en`)
    await page.locator('[data-purpose="exam-details"] summary').click()
    const box = (name: string) => page.getByLabel(name)
    await expect(page.locator('[data-purpose="exam-print-key"]')).toBeVisible()
    await expect(page.locator('[data-purpose="exam-print-b"]')).toBeVisible()
    await box('Answer key and grading criteria').uncheck()
    await expect(page.locator('[data-purpose="exam-print-key"]')).toHaveCount(0)
    await expect(page.locator('[data-purpose="exam-docx-key"]')).toHaveCount(0)
    await expect(page.locator('[data-purpose="exam-preview-key"]')).toHaveCount(0)
    await box('Groups A and B').uncheck()
    await expect(page.locator('[data-purpose="exam-print-b"]')).toHaveCount(0)
    await expect(page.locator('[data-purpose="exam-preview-groupB"]')).toHaveCount(0)
    await box('Answer key and grading criteria').check()
    await page.locator('[data-purpose="exam-preview-key"]').click()
    await expect(page.locator('[data-purpose="exam-paper"][data-part="key"] [data-table="specification"]')).toBeVisible()
    await box('Topic and Bloom tables').uncheck()
    await expect(page.locator('[data-purpose="exam-paper"][data-part="key"] [data-table]')).toHaveCount(0)
    await expect(page.locator('[data-purpose="exam-save-state"]')).toHaveAttribute('data-state', 'saved')
    await page.reload()
    const stored = (await storedExams(page))[0].settings
    expect(stored).toMatchObject({ answerKey: true, groups: false, topicTable: false })
  })
})

test.describe('different exams and different questions (V1, V4)', () => {
  test('a new exam from a text used before says so, and sends the facts of the earlier exams last', async ({ page }) => {
    const exam = sampleExam({ sourceText: EXAM_SOURCE })
    const questions = exam.questions.slice(0, 10).map((question, index) => ({ ...question, fact: fakeFacts(10)[index].fact, bloomLevel: 2 as const }))
    exam.settings.sourceMemory = buildMemory(EXAM_SOURCE, questions)
    await seedExams(page, [exam])
    const api = await mockExamApi(page)
    await page.goto('/exams/new?d=mem1&lng=en')
    await expect(page.locator('[data-purpose="exam-previous-note"]')).toHaveCount(0)
    await fillSource(page)
    await expect(page.locator('[data-purpose="exam-previous-note"]')).toHaveText('You have already made 1 exam(s) from this text; some topics may repeat.')
    await page.locator('[data-purpose="exam-generate"]').click()
    await expect(page).toHaveURL(/\/exams\/[0-9a-f-]{36}$/)
    // Every new exam stores what it used for the next one: a hash, not the text.
    const stored = (await storedExams(page)).find((entry) => entry.id !== exam.id)
    expect(stored?.settings.sourceMemory?.facts.length).toBeGreaterThan(0)
    expect(JSON.stringify(stored?.settings.sourceMemory)).not.toContain('Fotosentez')
    expect(api.calls().filter((call) => call.mode === 'exam_plan')).toHaveLength(1)
  })

  test('"regenerate" asks for another fact and rejects a repeat of the replaced question', async ({ page }) => {
    const exam = sampleExam({ sourceText: EXAM_SOURCE })
    await seedExams(page, [exam])
    const calls: Record<string, unknown>[] = []
    await page.route('**/api/generate', async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>
      if (payload.mode !== 'exam_question') return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      calls.push(payload)
      const original = exam.questions[4]
      // First the same answer in new words (a repeat), then a really different question.
      const question = calls.length === 1 ? { ...original, id: 'x1', stem: 'Tamamen başka kelimelerle yazılmış aynı soru burada mı?', fact: undefined } : { ...original, id: 'x2', stem: 'Klorofil hangi renkteki ışığı en az soğurur?', answer: 'Yeşil ışığı', acceptableAnswers: ['Yeşil'], fact: undefined }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ question, provider: 'openai', fallbackUsed: false }) })
    })
    await page.goto(`/exams/${EXAM_ID}?lng=en`)
    await page.locator('[data-purpose="exam-regenerate"]').nth(4).click()
    await expect(page.locator('[data-purpose="exam-stem"]').nth(4)).toHaveValue(/Klorofil hangi renkteki/)
    expect(calls).toHaveLength(2)
    const first = calls[0] as { avoidAnswers: string[]; replaceStem: string; slots: { bloom: number }[] }
    expect(first.avoidAnswers).toContain(exam.questions[4].answer)
    expect(first.replaceStem).toBe(exam.questions[4].stem)
    expect(first.slots).toHaveLength(1)
    expect((calls[1] as { avoidStems: string[] }).avoidStems).toContain('Tamamen başka kelimelerle yazılmış aynı soru burada mı?')
    await expect(page.locator('[data-purpose="exam-total"]')).toContainText('100 / 100')
  })
})

test.describe('colours (B8)', () => {
  test('every piece of text on the paper, in the editor preview and in print, is black or gray (no red or blue)', async ({ page }) => {
    await seedExams(page, [sampleExam()])
    const coloured = (selector: string) =>
      page.evaluate((root) => {
        const bad: string[] = []
        for (const element of document.querySelectorAll(`${root} *`)) {
          if (!Array.from(element.childNodes).some((node) => node.nodeType === 3 && (node.textContent ?? '').trim())) continue
          const match = /rgba?\((\d+), (\d+), (\d+)/.exec(getComputedStyle(element).color)
          if (match && !(match[1] === match[2] && match[2] === match[3])) bad.push(`${element.tagName}:${getComputedStyle(element).color}`)
        }
        return bad
      }, selector)
    await page.goto(`/exams/${EXAM_ID}?lng=en`)
    await expect(page.locator('[data-purpose="exam-paper"]').first()).toBeVisible()
    expect(await coloured('[data-purpose="exam-paper"]')).toEqual([])
    await page.goto(`/exams/${EXAM_ID}/print?part=exam&group=A`)
    await expect(page.locator('[data-purpose="exam-paper"]')).toBeVisible()
    expect(await coloured('[data-purpose="exam-paper"]')).toEqual([])
    await page.goto(`/exams/${EXAM_ID}/print?part=key&group=both`)
    await expect(page.locator('[data-purpose="exam-paper"]')).toBeVisible()
    expect(await coloured('[data-purpose="exam-paper"]')).toEqual([])
  })
})
