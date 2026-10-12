import { expect, test } from '@playwright/test'

import { hasCorruptText, restoreLatex } from '../../api/_lib/exam'
import { checkExamQuality } from '../../src/lib/exam/quality'
import type { ExamQuestion } from '../../src/lib/exam/types'

// Maths text from the model: delimiters, corrupt replies, dangling "as below" references.

const mcq = (stem: string): ExamQuestion => ({ id: 'm1', type: 'mcq', stem, options: ['a', 'b', 'c', 'd'], answerIndex: 0, answer: 'a', rubric: [{ text: 'a', points: 1 }], points: 0, topic: 't', difficulty: 'medium', lines: 0 })
const referenceIds = (question: ExamQuestion) => checkExamQuality([question], null).filter((issue) => issue.rule === 'reference').map((issue) => issue.id)

test.describe('maths text from the model', () => {
  test('\\( ... \\) and \\[ ... \\] become $ ... $ and $$ ... $$; plain text stays', () => {
    expect(restoreLatex('Sonuç \\(\\frac{10}{40}\\cdot100=25\\) olur.')).toBe('Sonuç $\\frac{10}{40}\\cdot100=25$ olur.')
    expect(restoreLatex('\\[x^2=4\\]')).toBe('$$x^2=4$$')
    expect(restoreLatex('Düz metin (parantez) ve $x$.')).toBe('Düz metin (parantez) ve $x$.')
  })

  test('a control character inside a text marks the reply as corrupt', () => {
    expect(hasCorruptText({ stem: '$\u0003frac{3}{5}$', rubric: [{ text: 'tamam' }] })).toBe(true)
    expect(hasCorruptText({ stem: '$\\frac{3}{5}$ ve satır\nsonu', rubric: [{ text: 'tamam' }] })).toBe(false)
  })

  test('"aşağıdaki gibi" without the data in the question is a dangling reference', () => {
    expect(referenceIds(mcq('Bir ürünün alış ve satış fiyatları aşağıdaki gibi olduğunda elde edilen sonuç hangisidir?'))).toEqual(['m1'])
    expect(referenceIds(mcq('Maliyeti 120 lira olan mal 150 liraya satılırsa kâr yüzdesi nedir?'))).toEqual([])
  })
})
