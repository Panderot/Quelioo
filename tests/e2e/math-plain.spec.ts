import { test, expect } from '@playwright/test'
import { deepMathToPlain, mathToPlainText } from '../../src/lib/mathPlain'

test.describe('mathToPlainText', () => {
  const cases: [string, string][] = [
    ['İşlemin sonucu kaçtır? $$\\frac{2^5\\cdot 4^3}{8^3}$$', 'İşlemin sonucu kaçtır? (2⁵ · 4³) / 8³'],
    ['$$4=2^2,\\qquad 8=2^3.$$', '4 = 2², 8 = 2³.'],
    ['Cevap: $4$ (B)', 'Cevap: 4 (B)'],
    ['$(a^m)^n=a^{m\\cdot n}$', '(a^m)^n = a^(m · n)'],
    ['$\\frac{a^m}{a^n}=a^{m-n}$.', 'a^m/a^n = a^(m-n).'],
    ['$a^{m+n}$ ve $x_1$', 'a^(m+n) ve x₁'],
    ['$\\angle B=90^\\circ$', '∠B = 90°'],
    ['$\\sqrt{AB^2+BC^2}=10$', '√(AB²+BC²) = 10'],
    ['$4^3 = 4\\cdot4\\cdot4 = 64$', '4³ = 4 · 4 · 4 = 64'],
    ['$(2^2)^3 = 2^6 \\text{ ve } (2^3)^3 = 2^9$', '(2²)³ = 2⁶ ve (2³)³ = 2⁹'],
    ['Fiyat $5 and $6', 'Fiyat $5 and $6'],
    ['Düz metin, math yok.', 'Düz metin, math yok.'],
  ]
  for (const [input, expected] of cases) {
    test(JSON.stringify(input), () => {
      expect(mathToPlainText(input)).toBe(expected)
    })
  }

  test('never leaves LaTeX markers, even for broken input', () => {
    for (const input of ['broken $\\frac{1}{ ok', '$\\frac{\\frac{1}{2}}{3}$', '$\\unknown{x}$ and $a^{$']) {
      const output = mathToPlainText(input)
      expect(output).not.toMatch(/\\|\\frac|\^\{/)
    }
  })

  test('deepMathToPlain converts nested strings only', () => {
    expect(deepMathToPlain({ a: ['$2^3$', 5], b: { c: '$\\cdot$' } })).toEqual({ a: ['2³', 5], b: { c: '·' } })
  })
})

test('quiz questions from the writer never keep LaTeX', async () => {
  const { sanitizeQuizQuestion } = await import('../../src/lib/quiz')
  const question = sanitizeQuizQuestion(
    { type: 'mcq', question: 'Sonuç? $\\frac{2^5\\cdot 4^3}{8^3}$', options: ['$2$', '$4$', '$8$'], answerIndex: 1, explanation: '$4=2^2$ ve $8=2^3$', hints: ['$a^{m+n}$'] },
    () => 'q1',
  )
  expect(question).toMatchObject({ question: 'Sonuç? (2⁵ · 4³) / 8³', options: ['2', '4', '8'], explanation: '4 = 2² ve 8 = 2³', hints: ['a^(m+n)'] })
})
