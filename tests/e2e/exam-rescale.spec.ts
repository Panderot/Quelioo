import { expect, test } from '@playwright/test'

import { blankQuestion } from '../../src/lib/exam/factory'
import { rescalePoints } from '../../src/lib/exam/points'
import { EXAM_QUESTION_TYPES, totalPoints } from '../../src/lib/exam/types'
import type { ExamQuestion, ExamQuestionType } from '../../src/lib/exam/types'
import { sampleExam } from '../fixtures/exam'
import { seedExams } from './examHelpers'
import { expect as uiExpect, test as uiTest } from './fixtures'

// "Spread points to 100" (the editor button and the export dialog share rescalePoints): exact total, kept ratios, rubrics that add up.

function make(type: ExamQuestionType, index: number, points: number, rubric: number[]): ExamQuestion {
  const base = blankQuestion(type, `${type}-${index}`)
  return { ...base, stem: `Question ${index}`, answer: 'x', points, rubric: rubric.map((item, i) => ({ text: `c${i}`, points: item })) }
}

function check(before: ExamQuestion[], after: ExamQuestion[], label: string): void {
  const oldTotal = before.reduce((sum, q) => sum + q.points, 0)
  expect(totalPoints(after), label).toBe(100)
  expect(after, label).toHaveLength(before.length)
  after.forEach((q, i) => {
    expect(Number.isInteger(q.points) && q.points >= 1, `${label}: question ${i} got ${q.points}`).toBe(true)
    if (oldTotal > 0 && before[i].points > 0) expect(Math.abs(q.points - (before[i].points * 100) / oldTotal), `${label}: question ${i} ratio`).toBeLessThanOrEqual(1)
    if (q.rubric.length > 0) expect(q.rubric.reduce((sum, item) => sum + item.points, 0), `${label}: question ${i} rubric`).toBe(q.points)
  })
}

test.describe('exam rescalePoints', () => {
  test('reported case 1: 41 + 59 (matching with 15/15/15/14), total 101 becomes 100', () => {
    const before = [make('open-ended', 0, 41, [20, 11, 10]), make('matching', 1, 60, [15, 15, 15, 14])]
    check(before, rescalePoints(before), 'case 1')
  })

  test('reported case 2: 42/26/11/21 + matching 5 with no criteria, total 105', () => {
    const before = [make('open-ended', 0, 42, [20, 12, 10]), make('short-answer', 1, 26, []), make('true-false', 2, 11, []), make('mcq', 3, 21, []), make('matching', 4, 5, [])]
    const after = rescalePoints(before)
    check(before, after, 'case 2')
    expect(after.map((q) => q.points)).toEqual([40, 25, 10, 20, 5])
  })

  test('200 random exams', () => {
    let seed = 12345
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1))
    for (let run = 0; run < 200; run += 1) {
      const count = int(1, 40)
      const before = Array.from({ length: count }, (_, i) => {
        const type = EXAM_QUESTION_TYPES[int(0, EXAM_QUESTION_TYPES.length - 1)]
        const rubric = Array.from({ length: int(0, 5) }, () => int(1, 15))
        const points = rubric.length > 0 && random() < 0.7 ? rubric.reduce((a, b) => a + b, 0) : int(1, 40)
        return make(type, i, points, rubric)
      })
      check(before, rescalePoints(before), `run ${run}`)
    }
  })
})

// The same through the editor: the button and the export dialog.
const UI_ID = '7b1f6a52-3c1e-4c52-9a53-0d3b2f2a9c01'

uiTest.describe('exam redistribute in the editor', () => {
  for (const [name, build] of [
    ['case 1', () => [make('open-ended', 0, 41, [20, 11, 10]), make('matching', 1, 60, [15, 15, 15, 14])]],
    ['case 2', () => [make('open-ended', 0, 42, [20, 12, 10]), make('short-answer', 1, 26, []), make('true-false', 2, 11, []), make('mcq', 3, 21, []), make('matching', 4, 5, [])]],
  ] as const) {
    uiTest(`${name}: button gives exactly 100`, async ({ page }) => {
      const questions = build()
      await seedExams(page, [sampleExam({ questions })])
      await page.goto(`/exams/${UI_ID}?lng=en`)
      await uiExpect(page.locator('[data-purpose="exam-total"]')).toContainText(`${questions.reduce((s, q) => s + q.points, 0)} / 100`)
      await page.locator('[data-purpose="exam-redistribute"]').click()
      await uiExpect(page.locator('[data-purpose="exam-total"]')).toContainText('100 / 100')
      const values = await page.locator('[data-purpose="exam-points"]').evaluateAll((nodes) => nodes.map((node) => Number((node as HTMLInputElement).value)))
      const old = questions.reduce((s, q) => s + q.points, 0)
      values.forEach((value, i) => uiExpect(Math.abs(value - (questions[i].points * 100) / old)).toBeLessThanOrEqual(1))
    })
  }
})
