import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { RIGHT_ANSWERS, TYPE_QUESTIONS } from '../fixtures/study-types'
import { readStore } from './flashcardHelpers'
import { getRightOrder, letterFor } from '../../src/lib/matching'
import type { QuizQuestion } from '../../src/lib/quiz'
import en from '../../src/i18n/locales/en.json' with { type: 'json' }
import tr from '../../src/i18n/locales/tr.json' with { type: 'json' }
import hyw from '../../src/i18n/locales/hyw.json' with { type: 'json' }

/** Study Mode audit: every question type through Normal and Exam practice, typed-answer matching,
 * partial credit, resume with half-given answers, one AI call per answer, timers, read aloud, languages. */

const NOW = new Date(2026, 2, 10, 14, 0, 0)
const ENTRY_ID = 'types-entry'
const AUDIT_DIR = '../QUELIO-TEST-STUDY/audit'

const TYPES = Object.keys(TYPE_QUESTIONS)
const TWO_CHOICE = new Set(['mcq2', 'tf', 'tfNoExplanation'])
const HINTLESS = new Set(['mcqPlain', 'tf', 'tfNoExplanation'])
const NO_EXPLANATION = new Set(['mcqPlain', 'tfNoExplanation'])
const TURKISH = new Set(['mcq4', 'fillTr', 'fillDotless'])

function entry(ids: string[], language = 'en', extra: Record<string, unknown> = {}) {
  const questions = ids.map((id, index) => ({ ...TYPE_QUESTIONS[id], id: `${id}#${index}` }))
  return {
    id: ENTRY_ID,
    title: 'Audit Quiz',
    createdAt: '2026-01-01T00:00:00.000Z',
    source: 'text' as const,
    questionType: 'mixed',
    difficulty: 'medium',
    questionCount: String(questions.length),
    optionsCount: null,
    outputLanguage: language,
    sourceText: 'Seeded source text.',
    quiz: { title: 'Audit Quiz', questions },
    ...extra,
  }
}

const URL_STUDY = (lng = 'en') => `/archive/${ENTRY_ID}?mode=study&lng=${lng}`
const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' })
const questionBox = (page: Page) => page.locator('[data-purpose="study-question"]')
const feedback = (page: Page) => page.locator('[data-purpose="study-feedback"]')
const retryNote = (page: Page) => page.getByText('Not yet. Try again.')

async function seed(page: Page, entries: unknown[]) {
  await page.addInitScript((data) => {
    if (!window.localStorage.getItem('quelio.archive.v1')) window.localStorage.setItem('quelio.archive.v1', JSON.stringify(data))
  }, entries)
}

async function begin(page: Page, kind?: 'Exam practice' | 'Quick review') {
  if (kind) await page.getByRole('radio', { name: new RegExp(kind) }).check()
  await button(page, 'Start').click()
  await expect(questionBox(page)).toBeVisible()
}

async function open(page: Page, ids: string[], options: { kind?: 'Exam practice'; language?: string; lng?: string } = {}) {
  await seed(page, [entry(ids, options.language ?? (ids.some((id) => TURKISH.has(id)) ? 'tr' : 'en'))])
  await page.goto(URL_STUDY(options.lng))
  await begin(page, options.kind)
}

/** Gives the answer (right or deliberately wrong) of a fixture type. */
async function give(page: Page, id: string, mode: 'right' | 'wrong') {
  const right = RIGHT_ANSWERS[id]
  const question = TYPE_QUESTIONS[id]
  if (question.type === 'mcq') {
    const picked = mode === 'right' ? (right as number) : ((right as number) + 1) % question.options.length
    await page.getByRole('radio').nth(picked).click()
  } else if (question.type === 'true-false') {
    await page.getByRole('radio', { name: (mode === 'right') === (right as boolean) ? 'True' : 'False' }).click()
  } else if (question.type === 'matching') {
    const letters = mode === 'right' ? (right as string[]) : ['A', 'B', 'C', 'D']
    for (const [index, letter] of letters.entries()) await page.getByLabel(`Match for row ${index + 1}`).selectOption(letter)
  } else {
    await page.getByLabel('Your answer').fill(mode === 'right' ? (right as string) : 'zzzz qqqq')
  }
}

const gradeVerdict = (verdict: 'correct' | 'partial' | 'incorrect') => ({ verdict, feedback: `AI says ${verdict}.`, covered: verdict === 'correct' ? 2 : 1, total: 2 })

// ---------------------------------------------------------------------------------------------------------------------
// 1. Every type, Normal and Exam practice, right and wrong
// ---------------------------------------------------------------------------------------------------------------------

test.describe('every question type', () => {
  for (const id of TYPES) {
    const question = TYPE_QUESTIONS[id]
    const needsAi = question.type === 'open-ended'

    test(`${id}: Normal — right answer, then wrong answers follow the try-again rule`, async ({ page, mockGrade }) => {
      const grade = await mockGrade(gradeVerdict('incorrect'))
      await open(page, [id, id])
      const check = button(page, 'Check')
      // "Check" waits for an answer (matching: every row picked).
      await expect(check).toBeDisabled()
      if (question.type === 'matching') {
        await page.getByLabel('Match for row 1').selectOption('D')
        await expect(check).toBeDisabled()
      }

      // Hint rule: two-choice questions and questions without hints show no Hint button.
      await expect(button(page, /^Hint$/)).toHaveCount(TWO_CHOICE.has(id) || HINTLESS.has(id) ? 0 : 1)

      // First question: wrong twice.
      await give(page, id, 'wrong')
      await expect(check).toBeEnabled()
      await check.click()
      if (TWO_CHOICE.has(id)) {
        await expect(feedback(page)).toHaveAttribute('data-state', 'revealed')
        await expect(retryNote(page)).toHaveCount(0)
      } else {
        await expect(retryNote(page)).toBeVisible()
        await expect(feedback(page)).toHaveCount(0)
        if (question.type === 'matching') await page.getByLabel('Match for row 1').selectOption('B') // changes the answer
        else if (question.type !== 'mcq') await page.getByLabel('Your answer').fill('another wrong answer')
        else await page.getByRole('radio').nth(((RIGHT_ANSWERS[id] as number) + 2) % (question as { options: string[] }).options.length).click()
        await check.click()
        await expect(feedback(page)).toHaveAttribute('data-state', 'revealed')
      }
      await expect(feedback(page)).toContainText('Right answer')
      if (NO_EXPLANATION.has(id)) await expect(feedback(page)).not.toContainText('Explanation')
      else await expect(feedback(page)).toContainText('Explanation')
      await button(page, 'Next').click()

      // Second question: right on the first try.
      const callsBefore = grade.requests().length
      if (needsAi) {
        await mockGrade(gradeVerdict('correct'))
      }
      await give(page, id, 'right')
      await button(page, 'Check').click()
      await expect(feedback(page)).toHaveAttribute('data-state', 'correct')
      await expect(feedback(page)).toContainText('Correct!')
      if (!needsAi) expect(grade.requests().length, 'no AI call for a locally checked type').toBe(callsBefore)
      await button(page, 'Finish').click()

      await expect(page.locator('[data-purpose="study-score"]')).toHaveText('1 / 2 correct')
      const wrongList = page.locator('[data-purpose="study-wrong-list"]')
      await expect(wrongList).toContainText('Your answer')
      await expect(wrongList).toContainText('Right answer')
      await expect(wrongList).not.toContainText(/undefined|NaN|\[object/)
      if (NO_EXPLANATION.has(id)) await expect(wrongList.locator('[data-purpose="study-explanation"]')).toHaveCount(0)
      else await expect(wrongList.locator('[data-purpose="study-explanation"]')).toHaveCount(1)
    })

    test(`${id}: Exam practice — answers are graded at the end`, async ({ page, mockGrade }) => {
      await mockGrade(gradeVerdict('correct'))
      await open(page, [id, id], { kind: 'Exam practice' })
      await give(page, id, 'right')
      await button(page, 'Next').click()
      await give(page, id, 'wrong')
      await button(page, 'Finish').click()
      // Open and short answers go to the (mocked) AI, which says right both times; every other type has its own rule.
      await expect(page.locator('[data-purpose="study-score"]')).toHaveText(needsAi || id === 'short' ? '2 / 2 correct' : '1 / 2 correct')
      const all = page.locator('[data-purpose="study-all-answers"]')
      await expect(all).toContainText('Your answer')
      await expect(all).not.toContainText(/undefined|NaN|\[object/)
      await expect(all.locator('> ol > li')).toHaveCount(2)
    })
  }
})

// ---------------------------------------------------------------------------------------------------------------------
// 2. Typed answers: casing, accents, spaces, numbers
// ---------------------------------------------------------------------------------------------------------------------

test('math is readable, never shown as LaTeX code, in the question, the options, the feedback and the end screen', async ({ page }) => {
  await open(page, ['mcq5'])
  const noCode = (text: string) => {
    expect(text).not.toContain('$')
    expect(text).not.toContain(String.fromCharCode(92))
  }
  await expect(questionBox(page)).toContainText('1/2 + 1/4')
  noCode(await questionBox(page).innerText())
  await page.getByRole('radio').nth(0).click()
  await button(page, 'Check').click()
  await page.getByRole('radio').nth(1).click()
  await button(page, 'Check').click()
  await expect(feedback(page)).toContainText('2/4 + 1/4 = 3/4')
  noCode(await questionBox(page).innerText())
  await button(page, 'Finish').click()
  noCode(await page.locator('[data-purpose="study-wrong-list"]').innerText())
})

test.describe('typed answers', () => {
  const cases: [string, string, boolean][] = [
    ['fillTr', 'istanbul', true],
    ['fillTr', 'İSTANBUL', true],
    ['fillTr', '  istanbul   ', true],
    ['fillTr', 'ıstanbul', true],
    ['fillTr', 'ankara', false],
    ['fillDotless', 'ISIK', true],
    ['fillDotless', 'ışık', true],
    ['fillDotless', 'isik', true],
    ['fillDotless', 'ısık.', true],
    ['fillDotless', 'karanlık', false],
    ['fillNumber', '100', true],
    ['fillNumber', '  100 ', true],
    ['fillNumber', 'One   Hundred', true],
    ['fillNumber', 'hundred.', true],
    ['fillNumber', '1000', false],
    ['fillNumber', 'yüz', false],
  ]
  test('fill in the blank: Turkish i/İ/ı/I, accents, stray spaces, punctuation and numbers written as words', async ({ page }) => {
    const ids = cases.map(([id]) => id)
    await open(page, ids)
    for (const [index, [id, typed, correct]] of cases.entries()) {
      await page.getByLabel('Your answer').fill(typed)
      await page.keyboard.press('Enter')
      if (correct) await expect(feedback(page), `${id}: "${typed}"`).toHaveAttribute('data-state', 'correct')
      else await expect(retryNote(page), `${id}: "${typed}"`).toBeVisible()
      if (!correct) {
        await page.getByLabel('Your answer').fill(String(RIGHT_ANSWERS[id]))
        await button(page, 'Check').click()
      }
      await button(page, index === cases.length - 1 ? 'Finish' : 'Next').click()
    }
    await expect(page.locator('[data-purpose="study-score"]')).toHaveText(`${cases.filter(([, , ok]) => ok).length} / ${cases.length} correct`)
  })

  test('short answer: a close local match needs no AI; a different answer goes to the grader once', async ({ page, mockGrade }) => {
    const grade = await mockGrade(gradeVerdict('incorrect'))
    await open(page, ['short', 'short'])
    await page.getByLabel('Your answer').fill('  JUPİTER ')
    await page.keyboard.press('Enter')
    await expect(feedback(page)).toHaveAttribute('data-state', 'correct')
    expect(grade.requests()).toHaveLength(0)
    await button(page, 'Next').click()
    await page.getByLabel('Your answer').fill('Saturn')
    await page.keyboard.press('Enter')
    await expect(retryNote(page)).toBeVisible()
    expect(grade.requests()).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 3. Partial credit
// ---------------------------------------------------------------------------------------------------------------------

test.describe('partial credit', () => {
  test('matching: pairs that are right are told, the point needs all of them, the end screen shows the rule', async ({ page }) => {
    await open(page, ['matching'])
    // Key: Ankara D, Paris A, Berlin B, Rome C → two right, two swapped.
    for (const [index, letter] of ['D', 'A', 'C', 'B'].entries()) await page.getByLabel(`Match for row ${index + 1}`).selectOption(letter)
    await button(page, 'Check').click()
    await expect(retryNote(page)).toBeVisible()
    await expect(page.locator('[data-purpose="study-partial"]')).toHaveText('2 of 4 pairs are right.')
    await button(page, 'Check').click()
    await expect(feedback(page)).toHaveAttribute('data-state', 'revealed')
    await expect(feedback(page).locator('[data-purpose="study-partial"]')).toHaveText('2 of 4 pairs are right.')
    await button(page, 'Finish').click()
    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('0 / 1 correct')
    await expect(page.locator('[data-purpose="study-partial-rule"]')).toContainText('Partly right answers do not earn the point')
    await expect(page.locator('[data-purpose="study-wrong-list"] [data-purpose="study-partial"]')).toHaveText('2 of 4 pairs are right.')
  })

  test('all pairs right on the first check is a full point and shows no partial rule', async ({ page }) => {
    await open(page, ['matching'])
    await give(page, 'matching', 'right')
    await button(page, 'Check').click()
    await expect(feedback(page)).toHaveAttribute('data-state', 'correct')
    await button(page, 'Finish').click()
    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('1 / 1 correct')
    await expect(page.locator('[data-purpose="study-partial-rule"]')).toHaveCount(0)
  })

  test('open-ended: the grader\'s "partly right" is told and does not earn the point', async ({ page, mockGrade }) => {
    await mockGrade(gradeVerdict('partial'))
    await open(page, ['open'])
    await page.getByLabel('Your answer').fill('The atmosphere scatters light.')
    await button(page, 'Check').click()
    await expect(retryNote(page)).toBeVisible()
    await expect(page.locator('[data-purpose="study-partial"]')).toHaveText('Partly right.')
    await expect(page.getByText('AI says partial.')).toBeVisible()
    await button(page, 'Check').click()
    await button(page, 'Finish').click()
    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('0 / 1 correct')
    await expect(page.locator('[data-purpose="study-wrong-list"] [data-purpose="study-partial"]')).toHaveText('Partly right.')
  })

  test('exam practice: matching rows picked so far are shown as the answer and noted as partly right', async ({ page }) => {
    await open(page, ['matching'], { kind: 'Exam practice' })
    await page.getByLabel('Match for row 1').selectOption('D')
    await page.getByLabel('Match for row 2').selectOption('A')
    await button(page, 'Finish').click()
    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('0 / 1 correct')
    const row = page.locator('[data-purpose="study-wrong-list"]')
    await expect(row).toContainText('1 → D')
    await expect(row.locator('[data-purpose="study-partial"]')).toHaveText('2 of 4 pairs are right.')
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 4. Resume with half-given answers
// ---------------------------------------------------------------------------------------------------------------------

const savedResume = (page: Page) =>
  page.evaluate(() => {
    const entries = JSON.parse(window.localStorage.getItem('quelio.archive.v1') ?? '[]') as { results?: { resume?: { draft?: unknown; index: number; records: Record<string, { attempts: number; hints: number }> } } }[]
    return entries[0]?.results?.resume ?? null
  })

test('resume restores the typed text, the hints taken, a wrong first check and half-matched rows', async ({ page, mockGrade }) => {
  const grade = await mockGrade(gradeVerdict('incorrect'))
  await open(page, ['short', 'matching'])

  // Typed but not checked, one hint taken.
  await page.getByLabel('Your answer').fill('Sat')
  await button(page, /^Hint$/).click()
  await expect.poll(async () => (await savedResume(page))?.draft).toBe('Sat')
  await page.reload()
  await button(page, 'Continue where you left off').click()
  await expect(page.getByLabel('Your answer')).toHaveValue('Sat')
  await expect(page.getByText('A gas giant.')).toBeVisible()
  expect(grade.requests()).toHaveLength(0)

  // A wrong first check: after the reload it is still the second try (no third chance).
  await button(page, 'Check').click()
  await expect(retryNote(page)).toBeVisible()
  await expect.poll(async () => Object.values((await savedResume(page))?.records ?? {})[0]?.attempts).toBe(1)
  await page.reload()
  await button(page, 'Continue where you left off').click()
  await expect(retryNote(page)).toBeVisible()
  await expect(page.getByLabel('Your answer')).toHaveValue('Sat')
  await button(page, 'Check').click()
  await expect(feedback(page)).toHaveAttribute('data-state', 'revealed')
  expect(grade.requests(), 'the same text is graded once, even across a reload').toHaveLength(1)
  await button(page, 'Next').click()

  // Half-matched rows.
  await page.getByLabel('Match for row 1').selectOption('D')
  await page.getByLabel('Match for row 2').selectOption('A')
  await expect.poll(async () => (await savedResume(page))?.draft).toEqual(['D', 'A', '', ''])
  await page.reload()
  await button(page, 'Continue where you left off').click()
  await expect(page.getByLabel('Match for row 1')).toHaveValue('D')
  await expect(page.getByLabel('Match for row 2')).toHaveValue('A')
  await expect(page.getByLabel('Match for row 3')).toHaveValue('')
  await expect(button(page, 'Check')).toBeDisabled()
})

test('opening the first question and touching nothing does not leave an "unfinished session"', async ({ page }) => {
  await open(page, ['tf', 'tf'])
  await page.waitForTimeout(1200) // longer than the draft save delay
  expect(await savedResume(page)).toBeNull()
})

test('exam practice keeps the typed answer of the current question across a reload', async ({ page }) => {
  await open(page, ['short', 'fillNumber'], { kind: 'Exam practice' })
  await page.getByLabel('Your answer').fill('Jupiter')
  await expect.poll(async () => (await savedResume(page))?.draft).toBe('Jupiter')
  await page.reload()
  await button(page, 'Continue where you left off').click()
  await expect(page.getByLabel('Your answer')).toHaveValue('Jupiter')
})

// ---------------------------------------------------------------------------------------------------------------------
// 5. The AI is asked once per answer
// ---------------------------------------------------------------------------------------------------------------------

test.describe('AI grading', () => {
  test('a double click and a repeated check of the same text send one request', async ({ page, mockGrade }) => {
    const grade = await mockGrade(gradeVerdict('incorrect'))
    await open(page, ['open'])
    await page.getByLabel('Your answer').fill('I am not sure about this one.')
    await button(page, 'Check').dblclick()
    await expect(retryNote(page)).toBeVisible()
    expect(grade.requests()).toHaveLength(1)
    await button(page, 'Check').click()
    await expect(feedback(page)).toHaveAttribute('data-state', 'revealed')
    expect(grade.requests()).toHaveLength(1)
  })

  test('exam practice grades each typed answer once, at the end', async ({ page, mockGrade }) => {
    const grade = await mockGrade(gradeVerdict('correct'))
    await open(page, ['short', 'open', 'fillNumber', 'tf'], { kind: 'Exam practice' })
    await page.getByLabel('Your answer').fill('Saturn')
    await button(page, 'Next').click()
    await page.getByLabel('Your answer').fill('Light bends in the air.')
    await button(page, 'Next').click()
    await page.getByLabel('Your answer').fill('100')
    await button(page, 'Next').click()
    await page.getByRole('radio', { name: 'True' }).click()
    await button(page, 'Finish').click()
    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('4 / 4 correct')
    expect(grade.requests(), 'short + open only; fill and true/false are checked locally').toHaveLength(2)
  })

  test('exam practice: when the grader cannot be reached the answer is reported as not checked, not silently wrong', async ({ page, mockGrade }) => {
    const grade = await mockGrade({ error: 'upstream' }, { status: 502 })
    await open(page, ['open', 'tf'], { kind: 'Exam practice' })
    await page.getByLabel('Your answer').fill('Because of scattering.')
    await button(page, 'Next').click()
    await page.getByRole('radio', { name: 'False' }).click()
    await button(page, 'Finish').click()
    await expect(page.locator('[data-purpose="study-score"]')).toHaveText('0 / 2 correct')
    await expect(page.locator('[data-purpose="study-unchecked"]').first()).toHaveText('This answer could not be checked, so it was not counted as right.')
    expect(grade.requests()).toHaveLength(2) // the try and one more try
  })

  test('normal practice: a grader error asks to retry and does not use up a try', async ({ page, mockGrade }) => {
    await mockGrade({ error: 'upstream' }, { status: 502 })
    await open(page, ['open'])
    await page.getByLabel('Your answer').fill('Because of scattering.')
    await button(page, 'Check').click()
    await expect(page.getByRole('alert')).toContainText("Couldn't check your answer")
    await expect(retryNote(page)).toHaveCount(0)
    await mockGrade(gradeVerdict('correct'))
    await page.getByRole('alert').getByRole('button', { name: 'Try again' }).click()
    await expect(feedback(page)).toHaveAttribute('data-state', 'correct')
    await expect(feedback(page)).not.toContainText('second try')
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 6. Keyboard
// ---------------------------------------------------------------------------------------------------------------------

test.describe('keyboard', () => {
  test('5-option multiple choice: letters and digits pick, Enter checks and moves on', async ({ page }) => {
    await open(page, ['mcq5', 'mcq5'])
    await page.keyboard.press('e')
    await expect(page.getByRole('radio').nth(4)).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('3')
    await expect(page.getByRole('radio').nth(2)).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Enter')
    await expect(feedback(page)).toHaveAttribute('data-state', 'correct')
    await page.keyboard.press('Enter')
    await expect(page.locator('[data-purpose="study-progress"]')).toHaveText('2 / 2')
    await page.keyboard.press('ArrowRight') // checking needs an answer first
    await expect(feedback(page)).toHaveCount(0)
  })

  test('arrow keys walk through the options of a choice question', async ({ page }) => {
    await open(page, ['mcq4', 'tf'])
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('radio').nth(0)).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('radio').nth(1)).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect(page.getByRole('radio').nth(3)).toHaveAttribute('aria-checked', 'true') // wraps around
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await expect(feedback(page)).toHaveAttribute('data-state', 'correct') // option B (index 1)
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('radio', { name: 'True' })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('radio', { name: 'False' })).toHaveAttribute('aria-checked', 'true')
  })

  test('true/false: 1 and 2 (or A and B) pick; the letters are not read as typing in a text field', async ({ page }) => {
    await open(page, ['tf', 'short'])
    await page.keyboard.press('2')
    await expect(page.getByRole('radio', { name: 'False' })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('a')
    await expect(page.getByRole('radio', { name: 'True' })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.getByLabel('Your answer').pressSequentially('a1e')
    await expect(page.getByLabel('Your answer')).toHaveValue('a1e')
  })

  test('typed answers: Enter checks short and fill-in, Ctrl+Enter checks open-ended and a plain Enter adds a line', async ({ page, mockGrade }) => {
    await mockGrade(gradeVerdict('correct'))
    await open(page, ['fillNumber', 'short', 'open'])
    await page.getByLabel('Your answer').fill('100')
    await page.keyboard.press('Enter')
    await expect(feedback(page)).toHaveAttribute('data-state', 'correct')
    await button(page, 'Next').click()
    await page.getByLabel('Your answer').fill('Jupiter')
    await page.keyboard.press('Enter')
    await expect(feedback(page)).toHaveAttribute('data-state', 'correct')
    await button(page, 'Next').click()
    await page.getByLabel('Your answer').fill('first line')
    await page.keyboard.press('Enter')
    await page.keyboard.type('second line')
    await expect(page.getByLabel('Your answer')).toHaveValue('first line\nsecond line')
    await expect(feedback(page)).toHaveCount(0)
    await page.keyboard.press('Control+Enter')
    await expect(feedback(page)).toHaveAttribute('data-state', 'correct')
  })

  test('matching: the selects work with the keyboard and Tab reaches Check', async ({ page }) => {
    await open(page, ['matching'])
    for (const [index, letter] of ['D', 'A', 'B', 'C'].entries()) {
      const select = page.getByLabel(`Match for row ${index + 1}`)
      await select.focus()
      await select.selectOption(letter)
    }
    await page.getByLabel('Match for row 4').focus()
    // After the rows come the hint button, then Check.
    for (let tabs = 0; tabs < 3 && !(await button(page, 'Check').evaluate((node) => node === document.activeElement)); tabs += 1) await page.keyboard.press('Tab')
    await expect(button(page, 'Check')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(feedback(page)).toHaveAttribute('data-state', 'correct')
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 7. Per-question timer on every type
// ---------------------------------------------------------------------------------------------------------------------

test.describe('timer per question', () => {
  for (const id of ['mcq4', 'tf', 'fillNumber', 'short', 'matching', 'open']) {
    test(`${id}: running out of time reveals the answer and counts as wrong`, async ({ page }) => {
      await seed(page, [entry([id, id], TURKISH.has(id) ? 'tr' : 'en')])
      await page.clock.install({ time: NOW })
      await page.goto(URL_STUDY())
      await page.getByRole('radio', { name: 'Per question', exact: true }).click()
      await page.getByLabel('Seconds per question').fill('5')
      await button(page, 'Start').click()
      await expect(page.getByRole('timer')).toHaveText('0:05')
      await page.clock.runFor(5500)
      await expect(feedback(page)).toContainText('Time is up')
      await expect(feedback(page)).toContainText('Right answer')
      await button(page, 'Next').click()
      await expect(page.getByRole('timer')).toHaveText('0:05')
      await page.clock.runFor(5500)
      await button(page, 'Finish').click()
      await expect(page.locator('[data-purpose="study-score"]')).toHaveText('0 / 2 correct')
    })
  }
})

// ---------------------------------------------------------------------------------------------------------------------
// 8. Read aloud
// ---------------------------------------------------------------------------------------------------------------------

test.describe('read aloud', () => {
  const speechStub = () => {
    const spoken: string[] = []
    ;(window as unknown as { __spoken: string[] }).__spoken = spoken
    class FakeUtterance {
      text: string
      lang = ''
      voice: unknown = null
      onend: (() => void) | null = null
      onerror: (() => void) | null = null
      constructor(text: string) {
        this.text = text
      }
    }
    ;(window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = FakeUtterance
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { getVoices: () => [{ lang: 'en-US', name: 'Fake' }, { lang: 'tr-TR', name: 'Fake TR' }], speak: (utterance: { text: string }) => spoken.push(utterance.text), cancel: () => undefined },
    })
  }
  const readAloud = async (page: Page) => {
    await page.getByRole('button', { name: 'Read aloud' }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken.length)).toBe(1)
    return page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken[0])
  }

  test('@cross a blank is read as "blank", matching reads both columns, true/false reads both choices', async ({ page }) => {
    await page.addInitScript(speechStub)
    await open(page, ['fillNumber'])
    const fill = await readAloud(page)
    expect(fill).toContain('A century has blank years')
    expect(fill).not.toMatch(/_|underscore/i)
  })

  test('@cross matching pairs and true/false choices are read in full', async ({ page }) => {
    await page.addInitScript(speechStub)
    await open(page, ['matching', 'tf'])
    const matching = await readAloud(page)
    expect(matching).toContain('1. Ankara')
    expect(matching).toContain('4. Rome')
    expect(matching).toContain('A. France')
    expect(matching).toContain('D. Türkiye')
    await give(page, 'matching', 'right')
    await button(page, 'Check').click()
    await button(page, 'Next').click()
    await page.evaluate(() => ((window as unknown as { __spoken: string[] }).__spoken.length = 0))
    const tf = await readAloud(page)
    expect(tf).toContain('Water boils')
    expect(tf).toContain('True')
    expect(tf).toContain('False')
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 9. The mixed quiz end to end: end screen, mistakes list, quick review pool, flashcards from mistakes
// ---------------------------------------------------------------------------------------------------------------------

test('a mixed quiz of every type: wrong answers everywhere, then the end screen, the quick-review pool and the mistake cards', async ({ page, mockGrade }) => {
  await mockGrade(gradeVerdict('incorrect'))
  await open(page, TYPES, { language: 'tr' })
  for (const [index, id] of TYPES.entries()) {
    await give(page, id, 'wrong')
    await button(page, 'Check').click()
    if (!TWO_CHOICE.has(id)) {
      if (TYPE_QUESTIONS[id].type === 'mcq') await page.getByRole('radio').nth(((RIGHT_ANSWERS[id] as number) + 2) % (TYPE_QUESTIONS[id] as { options: string[] }).options.length).click()
      else if (TYPE_QUESTIONS[id].type === 'matching') await page.getByLabel('Match for row 1').selectOption('B')
      else await page.getByLabel('Your answer').fill('still wrong')
      await button(page, 'Check').click()
    }
    await expect(feedback(page)).toHaveAttribute('data-state', 'revealed')
    await button(page, index === TYPES.length - 1 ? 'Finish' : 'Next').click()
  }
  await expect(page.locator('[data-purpose="study-score"]')).toHaveText(`0 / ${TYPES.length} correct`)
  const rows = page.locator('[data-purpose="study-wrong-list"] > li')
  await expect(rows).toHaveCount(TYPES.length)
  const text = await page.locator('[data-purpose="study-wrong-list"]').innerText()
  expect(text).not.toMatch(/undefined|NaN|\[object/)
  expect(text).toContain('still wrong')
  expect(text).toContain('Ankara')

  // The mistakes become readable cards.
  await button(page, /Flashcards from my mistakes/).click()
  await expect(page.locator('[data-purpose="mistakes-result"]')).toContainText(`Added ${TYPES.length + 3} cards`) // 4 matching rows → 4 cards
  const stored = await readStore(page)
  expect(stored.cards.length).toBe(TYPES.length + 3)
  for (const card of stored.cards) {
    expect(card.front.trim().length).toBeGreaterThan(3)
    expect(card.back.trim().length).toBeGreaterThan(0)
    expect(`${card.front} ${card.back}`).not.toMatch(/undefined|NaN|\[object/)
  }

  // Everything missed is in the quick-review pool.
  await button(page, 'Study from the start').click()
  await expect(page.getByText(`${TYPES.length} questions`, { exact: true })).toBeVisible()
})

// ---------------------------------------------------------------------------------------------------------------------
// 10. Languages
// ---------------------------------------------------------------------------------------------------------------------

test.describe('languages', () => {
  const keys = (value: unknown, prefix = ''): string[] =>
    typeof value === 'object' && value !== null ? Object.entries(value).flatMap(([key, inner]) => keys(inner, `${prefix}${key}.`)) : [prefix.slice(0, -1)]

  test('the Study Mode texts have the same keys in English, Turkish and Armenian, none empty', () => {
    const base = keys(en.study).sort()
    expect(keys(tr.study).sort()).toEqual(base)
    expect(keys(hyw.study).sort()).toEqual(base)
    const walk = (value: unknown): string[] => (typeof value === 'object' && value !== null ? Object.values(value).flatMap(walk) : [String(value)])
    for (const locale of [en, tr, hyw]) expect(walk(locale.study).filter((text) => text.trim() === '')).toEqual([])
  })

  for (const lng of ['tr', 'hyw'] as const) {
    test(`${lng}: start, question, feedback and end screens carry no English text`, async ({ page, mockGrade }) => {
      await mockGrade(gradeVerdict('partial'))
      const ids = ['mcq3', 'matching', 'fillNumber', 'open']
      await seed(page, [entry(ids, lng)])
      await page.goto(URL_STUDY(lng))
      const english = /\b(Check|Next|Finish|Start|Exit|Study mode|Right answer|Your answer|Correct|Hint|Explanation|Retry|Try again|Quick review|Exam practice|Time is up|Left blank)\b/
      const noEnglish = async (selector: string) => expect((await page.locator(selector).innerText()).match(english)?.[0]).toBeUndefined()
      const primary = page.locator('[data-purpose="study-question"] button.min-h-12')
      await noEnglish('[data-purpose="study-start"]')
      await page.locator('[data-purpose="study-start"] button.min-h-12').click()
      await expect(questionBox(page)).toBeVisible()
      for (const [index, id] of ids.entries()) {
        await noEnglish('[data-purpose="study-run"]')
        const fill = async (attempt: number) => {
          if (id === 'mcq3') await page.getByRole('radio').nth(attempt === 0 ? 0 : 2).click()
          else if (id === 'matching') for (const [row, letter] of ['A', 'B', 'C', 'D'].entries()) await page.locator('select').nth(row).selectOption(attempt === 0 ? letter : ['B', 'A', 'D', 'C'][row])
          else await page.locator('textarea, input[type="text"]').first().fill(attempt === 0 ? 'xx yy' : 'zz ww')
        }
        await fill(0)
        await primary.click()
        await expect(page.locator('[data-purpose="study-question"] [aria-live="polite"] > *')).not.toHaveCount(0)
        await noEnglish('[data-purpose="study-run"]')
        await fill(1)
        await primary.click()
        await expect(page.locator('[data-purpose="study-feedback"]')).toBeVisible()
        await noEnglish('[data-purpose="study-run"]')
        await primary.click()
        if (index === ids.length - 1) await expect(page.locator('[data-purpose="study-end"]')).toBeVisible()
      }
      await noEnglish('[data-purpose="study-end"]')
    })
  }
})

// ---------------------------------------------------------------------------------------------------------------------
// 11. Layout, 360px
// ---------------------------------------------------------------------------------------------------------------------

test.describe('layout', () => {
  test('@mobile 360px: every type fits, targets are 44px, long text wraps, no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 })
    const ids = ['mcq4', 'mcq5', 'tf', 'fillTr', 'short', 'matching', 'open']
    await open(page, ids)
    const noOverflow = async (label: string) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), label).toBe(true)
    for (const id of ids) {
      await noOverflow(`${id} question`)
      for (const control of await questionBox(page).locator('[role="radio"], select, input, textarea').all()) {
        const box = await control.boundingBox()
        expect(box?.height ?? 0, `${id} control height`).toBeGreaterThanOrEqual(44)
      }
      await give(page, id, 'wrong')
      await button(page, 'Check').click()
      if (!TWO_CHOICE.has(id)) {
        if (TYPE_QUESTIONS[id].type === 'matching') await page.getByLabel('Match for row 1').selectOption('B')
        else if (TYPE_QUESTIONS[id].type === 'mcq') await page.getByRole('radio').nth(3).click()
        else await page.getByLabel('Your answer').fill('still wrong again')
        await button(page, 'Check').click().catch(() => undefined)
      }
      await expect(feedback(page).or(page.getByText('Not yet. Try again.'))).toBeVisible({ timeout: 8000 }).catch(() => undefined)
      await noOverflow(`${id} feedback`)
      if ((await feedback(page).count()) === 0) break
      await button(page, id === ids[ids.length - 1] ? 'Finish' : 'Next').click()
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// 12. Audit screenshots (only when STUDY_AUDIT_SHOTS=1)
// ---------------------------------------------------------------------------------------------------------------------

test.describe('audit screenshots', () => {
  test.skip(!process.env.STUDY_AUDIT_SHOTS, 'set STUDY_AUDIT_SHOTS=1 to regenerate ../QUELIO-TEST-STUDY/audit')

  for (const [device, size] of [['desktop', { width: 1366, height: 900 }], ['mobile', { width: 360, height: 740 }]] as const) {
    test(`${device}: question, feedback and end-screen row of every type`, async ({ page, mockGrade }) => {
      test.setTimeout(240_000)
      mkdirSync(`${AUDIT_DIR}/${device}`, { recursive: true })
      await page.setViewportSize(size)
      await mockGrade(gradeVerdict('partial'))
      await seed(page, [entry(TYPES, 'tr')])
      await page.goto(URL_STUDY())
      await begin(page)
      for (const [index, id] of TYPES.entries()) {
        await page.screenshot({ path: `${AUDIT_DIR}/${device}/${id}-1-question.png`, fullPage: true })
        await give(page, id, 'wrong')
        await button(page, 'Check').click()
        if (!TWO_CHOICE.has(id)) {
          await page.screenshot({ path: `${AUDIT_DIR}/${device}/${id}-2-retry.png`, fullPage: true })
          if (TYPE_QUESTIONS[id].type === 'matching') await page.getByLabel('Match for row 1').selectOption('B')
          else if (TYPE_QUESTIONS[id].type === 'mcq') await page.getByRole('radio').nth(((RIGHT_ANSWERS[id] as number) + 2) % (TYPE_QUESTIONS[id] as { options: string[] }).options.length).click()
          else await page.getByLabel('Your answer').fill('still wrong')
          await button(page, 'Check').click()
        }
        await expect(feedback(page)).toBeVisible()
        await page.screenshot({ path: `${AUDIT_DIR}/${device}/${id}-3-feedback.png`, fullPage: true })
        await button(page, index === TYPES.length - 1 ? 'Finish' : 'Next').click()
      }
      await expect(page.locator('[data-purpose="study-end"]')).toBeVisible()
      await page.screenshot({ path: `${AUDIT_DIR}/${device}/end-screen.png`, fullPage: true })
      const rows = page.locator('[data-purpose="study-wrong-list"] > li')
      for (const [index, id] of TYPES.entries()) await rows.nth(index).screenshot({ path: `${AUDIT_DIR}/${device}/${id}-4-end-row.png` })
    })
  }

  for (const width of [1024, 1280, 1366, 1920]) {
    test(`centring at ${width}px`, async ({ page }) => {
      mkdirSync(`${AUDIT_DIR}/centering`, { recursive: true })
      await page.setViewportSize({ width, height: 900 })
      await seed(page, [entry(['mcq3', 'tf'], 'en')])
      await page.goto(URL_STUDY())
      const margins = (purpose: string) =>
        page.evaluate((name) => {
          const box = document.querySelector(`[data-purpose="${name}"]`)!.getBoundingClientRect()
          return { left: Math.round(box.left), right: Math.round(document.documentElement.clientWidth - box.right) }
        }, purpose)
      const results: Record<string, { left: number; right: number }> = {}
      await expect(page.locator('[data-purpose="study-start"]')).toBeVisible()
      results.start = await margins('study-start')
      await page.screenshot({ path: `${AUDIT_DIR}/centering/${width}-1-start.png` })
      await begin(page)
      results.question = await margins('study-run')
      await page.screenshot({ path: `${AUDIT_DIR}/centering/${width}-2-question.png` })
      await give(page, 'mcq3', 'right')
      await button(page, 'Check').click()
      results.feedback = await margins('study-feedback')
      await page.screenshot({ path: `${AUDIT_DIR}/centering/${width}-3-feedback.png` })
      await button(page, 'Next').click()
      await give(page, 'tf', 'right')
      await button(page, 'Check').click()
      await button(page, 'Finish').click()
      results.end = await margins('study-end')
      await page.screenshot({ path: `${AUDIT_DIR}/centering/${width}-4-end.png` })
      for (const [screen, { left, right }] of Object.entries(results)) expect(Math.abs(left - right), `${screen} at ${width}px: left ${left}, right ${right}`).toBeLessThanOrEqual(2)
    })
  }
})

// ---------------------------------------------------------------------------------------------------------------------
// 13. Real data shapes: a quiz the live generator wrote (kept in ../QUELIO-TEST-STUDY/real-quiz.json by the audit run)
// ---------------------------------------------------------------------------------------------------------------------

test.describe('real generated quiz', () => {
  const file = '../QUELIO-TEST-STUDY/real-quiz.json'
  test.skip(!existsSync(file), 'no generated quiz kept at ../QUELIO-TEST-STUDY/real-quiz.json')

  for (const kind of [undefined, 'Exam practice'] as const) {
    test(`${kind ?? 'Normal'}: every question the live generator wrote can be answered right and is scored right`, async ({ page, mockGrade }) => {
      test.setTimeout(120_000)
      await mockGrade(gradeVerdict('correct'))
      const quiz = JSON.parse(readFileSync(file, 'utf8')) as { title: string; questions: QuizQuestion[] }
      await seed(page, [{ ...entry([]), questionCount: String(quiz.questions.length), quiz, outputLanguage: 'tr' }])
      await page.goto(URL_STUDY('tr'))
      await page.locator('[data-purpose="study-start"] input[type="radio"][value="' + (kind ? 'exam' : 'normal') + '"]').check()
      await page.locator('[data-purpose="study-start"] button.min-h-12').click()
      const primary = page.locator('[data-purpose="study-question"] button.min-h-12')
      for (const [index, question] of quiz.questions.entries()) {
        await expect(page.locator('[data-purpose="study-progress"]')).toHaveText(`${index + 1} / ${quiz.questions.length}`)
        if (question.type === 'mcq') await page.getByRole('radio').nth(question.answerIndex).click()
        else if (question.type === 'true-false') await page.getByRole('radio').nth(question.answerBool ? 0 : 1).click()
        else if (question.type === 'matching') {
          const order = getRightOrder(question)
          for (const [row] of question.pairs.entries()) await page.locator('select').nth(row).selectOption(letterFor(order.indexOf(row)))
        } else await page.locator('textarea, input[type="text"]').first().fill(question.answer)
        await primary.click()
        if (!kind) await expect(page.locator('[data-purpose="study-feedback"]')).toHaveAttribute('data-state', 'correct')
        if (!kind) await primary.click()
      }
      await expect(page.locator('[data-purpose="study-score"]')).toHaveText(`${quiz.questions.length} / ${quiz.questions.length} doğru`)
    })
  }
})
