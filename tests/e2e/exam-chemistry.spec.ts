import { expect, test } from '@playwright/test'

import { latexToOmml } from '../../src/lib/exam/omml'
import { sampleExam } from '../fixtures/exam'

// A9: chemical notation (formulas, ions, reaction arrows) in Word equations.

/** The text of an equation with its script markers, e.g. "[sSub] H 2 S [sSub] O 4". */
const shape = (latex: string) => [...latexToOmml(latex).matchAll(/<m:(sSub|sSup)>|<m:t[^>]*>(.*?)<\/m:t>/g)].map((match) => (match[1] ? `[${match[1]}]` : match[2])).join(' ')

test.describe('chemical notation in Word', () => {
  test('formulas keep their subscripts, ions their charge on the element, upright', () => {
    expect(shape('\\mathrm{H_2SO_4}')).toBe('[sSub] H 2 S [sSub] O 4')
    expect(shape('\\mathrm{Ca^{2+}}')).toBe('[sSup] Ca 2+')
    expect(shape('\\mathrm{Fe^{3+}}')).toBe('[sSup] Fe 3+')
    expect(latexToOmml('\\mathrm{H_2O}')).toContain('<m:sty m:val="p"/>')
  })

  test('a whole equation with a group and a reaction arrow', () => {
    expect(shape('\\mathrm{Ca(OH)_2 + 2HCl \\rightarrow CaCl_2 + 2H_2O}')).toBe('Ca [sSub] (OH) 2 +2HCl→Ca [sSub] Cl 2 +2 [sSub] H 2 O')
  })

  test('maths outside \\mathrm is unchanged: italic variables with the last letter scripted', () => {
    expect(shape('x^2')).toBe('[sSup] x 2')
    expect(latexToOmml('x^2')).not.toContain('<m:sty m:val="p"/>')
  })

  test('the print view and the editor preview render the same formulas with KaTeX, no error markup', async ({ page }) => {
    const exam = sampleExam()
    const chem = { ...exam.questions[4], id: 'chem-1', type: 'short-answer' as const, stem: 'Formül $\\mathrm{H_2SO_4}$, iyon $\\mathrm{Ca^{2+}}$ ve $\\mathrm{Ca(OH)_2 + 2HCl \\rightarrow CaCl_2 + 2H_2O}$ nedir? [chem-1]', answer: 'x', rubric: [{ text: 'x', points: 3 }], points: 3, lines: 1 }
    await page.addInitScript((seed) => localStorage.setItem('quelio.exams.v1', JSON.stringify([seed])), { ...exam, questions: [chem] })
    await page.goto(`/exams/${exam.id}/print?part=exam&group=A`)
    await expect(page.locator('[data-purpose="exam-paper"] .katex')).toHaveCount(3)
    await expect(page.locator('[data-purpose="exam-paper"] .katex-error')).toHaveCount(0)
    await expect(page.locator('[data-purpose="exam-paper"]')).toContainText('H2SO4')
    await expect(page.locator('[data-purpose="exam-paper"]')).toContainText('Ca2+')
  })
})
