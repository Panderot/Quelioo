import { test, expect } from '@playwright/test'
import { fixTurkishMathTerms, TURKISH_MATH_TERMS_RULE } from '../../api/_lib/turkish-math-terms'

test.describe('fixTurkishMathTerms', () => {
  const cases: [string, string][] = [
    ['Bir asal fonksiyon F(x) = x seçelim.', 'Bir ilkel fonksiyon F(x) = x seçelim.'],
    ['Asal fonksiyon bulunur.', 'İlkel fonksiyon bulunur.'],
    ['ASAL FONKSİYON', 'İLKEL FONKSİYON'],
    ['asal fonksiyonu türevi', 'ilkel fonksiyonu türevi'],
    ['asal fonksiyonlar', 'ilkel fonksiyonlar'],
    ['"asal fonksiyon"', '"ilkel fonksiyon"'],
    ['asal sayı', 'asal sayı'],
    ['asal çarpan', 'asal çarpan'],
    ['asal köşegen', 'asal köşegen'],
    ['asal sayma fonksiyonu', 'asal sayma fonksiyonu'],
    ['xasal fonksiyon', 'xasal fonksiyon'],
  ]
  for (const [input, expected] of cases) {
    test(JSON.stringify(input), () => {
      expect(fixTurkishMathTerms(input)).toBe(expected)
    })
  }

  test('fixes the term inside a JSON string value', () => {
    const json = JSON.stringify({ steps: ['Bir asal fonksiyon seçelim.'] })
    expect(JSON.parse(fixTurkishMathTerms(json))).toEqual({ steps: ['Bir ilkel fonksiyon seçelim.'] })
  })

  test('the system prompt rule names the correct term', () => {
    expect(TURKISH_MATH_TERMS_RULE).toContain('ilkel fonksiyon')
    expect(TURKISH_MATH_TERMS_RULE).toContain('never')
  })
})
