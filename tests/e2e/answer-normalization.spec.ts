import { test, expect } from '@playwright/test'
import { compareFinalAnswers } from '../../src/lib/mathAnswer'

const OPTIONS_PROBLEM = '(2^5 · 4^3) / 8^3 ifadesinin değeri kaçtır? A) 2 B) 4 C) 8 D) 16'

test.describe('final answer comparison', () => {
  for (const other of ['4', 'B', 'B) 4', '(B) 4', '4 (B)', '$4$', 'x = 4', '4.', '4,0', '$\\frac{8}{2}$', 'Cevap: B']) {
    test(`"4 (B)" equals "${other}"`, () => {
      expect(compareFinalAnswers('4 (B)', other, OPTIONS_PROBLEM)).toBe(true)
      expect(compareFinalAnswers(other, '4 (B)', OPTIONS_PROBLEM)).toBe(true)
    })
  }

  test('different values and different letters are not equal', () => {
    expect(compareFinalAnswers('4 (B)', '8', OPTIONS_PROBLEM)).toBe(false)
    expect(compareFinalAnswers('4 (B)', 'C', OPTIONS_PROBLEM)).toBe(false)
    expect(compareFinalAnswers('B', 'D) 16', OPTIONS_PROBLEM)).toBe(false)
  })

  test('a bare letter without options is left to the AI judge', () => {
    expect(compareFinalAnswers('B', '4', '2 + 2 kaçtır?')).toBeNull()
    expect(compareFinalAnswers('4 (B)', '4', '2 + 2 kaçtır?')).toBe(true)
  })

  test('equation answers', () => {
    expect(compareFinalAnswers('$x = 13$', '13', '3(x − 4) + 2x = 2x + 9')).toBe(true)
    expect(compareFinalAnswers('x = 7', '13', '')).toBe(false)
  })

  test('multi-part answers match part by part', () => {
    const problem = 'AB = 6, BC = 8, B = 90°. AC ve alanı bul.'
    expect(compareFinalAnswers('a) 10 cm, b) 24 cm²', 'a) 10, b) 24', problem)).toBe(true)
    expect(compareFinalAnswers('a) 10 cm, b) 24 cm²', 'b) 24 cm², a) 10 cm', problem)).toBe(true)
    expect(compareFinalAnswers('AC = 10 cm; alan = 24 cm²', 'AC = 10, alan = 24', problem)).toBe(true)
    expect(compareFinalAnswers('a) 10 cm, b) 24 cm²', 'a) 10, b) 48', problem)).toBe(false)
    expect(compareFinalAnswers('10 cm ve 24 cm²', 'a) 10, b) 24', problem)).toBeNull()
  })
})
