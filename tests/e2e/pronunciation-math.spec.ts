import { expect, test } from '@playwright/test'

import { normalizeForSpeech } from '../../src/lib/pronunciation'

// Spoken math for Audio Lesson TTS (no browser): grouped exponents and fractions must be audibly
// grouped, single exponents stay short.

const tr = (latex: string) => normalizeForSpeech(`$${latex}$`, 'tr').text
const en = (latex: string) => normalizeForSpeech(`$${latex}$`, 'en').text
const hyw = (latex: string) => normalizeForSpeech(`$${latex}$`, 'other').text

test.describe('spoken math: exponents and fractions', () => {
  test('a grouped exponent is bracketed, not read as a^m + n', () => {
    expect(tr(String.raw`a^{m+n}`)).toBe('a üzeri, m artı n, üs sonu')
    expect(en(String.raw`a^{m+n}`)).toBe('a to the power of m plus n, end of exponent')
    expect(tr(String.raw`2^{5+6-9}`)).toBe('iki üzeri, beş artı altı eksi dokuz, üs sonu')
    expect(en(String.raw`2^{5+6-9}`)).toBe('two to the power of five plus six minus nine, end of exponent')
  })

  test('a single exponent stays short and keeps the sum outside it', () => {
    expect(tr('x^2 + 1')).toBe('x üzeri iki artı bir')
    expect(en('x^2 + 1')).toBe('x to the power of two plus one')
    expect(tr('a^{-2}')).toBe('a üzeri eksi iki')
    expect(tr('2^5')).toBe('iki üzeri beş')
  })

  test('a bracketed base is announced before its exponent', () => {
    expect(tr('(x+1)^2')).toBe('parantez içinde x artı bir, üzeri iki')
    expect(en('(x+1)^2')).toBe('the quantity x plus one, to the power of two')
  })

  test('grouped numerators and denominators say which part is which', () => {
    expect(tr(String.raw`\frac{a+b}{c}`)).toBe('pay: a artı b, payda: c, kesir sonu')
    expect(tr(String.raw`\frac{a}{b+c}`)).toBe('pay: a, payda: b artı c, kesir sonu')
    expect(en(String.raw`\frac{a+b}{c}`)).toBe('numerator: a plus b, denominator: c, end of fraction')
    expect(en(String.raw`\frac{a}{b+c}`)).toBe('numerator: a, denominator: b plus c, end of fraction')
  })

  test('simple fractions keep the short form', () => {
    expect(tr(String.raw`\frac{1}{2}`)).toBe('bir bölü iki')
    expect(en(String.raw`\frac{1}{2}`)).toBe('one divided by two')
  })

  test('Western Armenian groups too, without Latin operator symbols', () => {
    const power = hyw(String.raw`a^{m+n}`)
    expect(power).toContain('աստիճան')
    expect(power).toContain('գումարած')
    expect(power).toContain('աստիճանի վերջ')
    const fraction = hyw(String.raw`\frac{a+b}{c}`)
    expect(fraction).toContain('համարիչ')
    expect(fraction).toContain('հայտարար')
    expect(hyw('x^2 + 1')).not.toContain('աստիճան')
  })
})

test.describe('pronunciation dictionary in every language', () => {
  const say = (text: string, language: 'tr' | 'en' | 'other') => normalizeForSpeech(text, language).text

  test('Turkish and English spell DNA, formulas, percentages and units', () => {
    expect(say('DNA ve CO2', 'tr')).toBe('de-en-a ve ce-o-iki')
    expect(say('%20 ve 5 km', 'tr')).toBe('yüzde yirmi ve beş kilometre')
    expect(say('DNA and H2O', 'en')).toBe('D N A and H two O')
    expect(say('20% and 5 km', 'en')).toBe('twenty percent and five kilometres')
  })

  test('other languages (Armenian, German, ...) spell Latin acronyms and formulas, never invent a word', () => {
    expect(say('DNA և mRNA', 'other')).toBe('D N A և m R N A')
    expect(say('CO2 և H2O', 'other')).toBe('C O 2 և H 2 O')
    expect(say('der pH-Wert', 'other')).toBe('der p H-Wert')
    expect(say('NATO und UNESCO', 'other')).toBe('NATO und UNESCO')
    expect(normalizeForSpeech('DNA', 'other').unknownAbbreviations).toEqual(['DNA'])
  })
})
