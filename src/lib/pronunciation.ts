/**
 * Deterministic pronunciation pass for Audio Lesson text-to-speech. The stored script stays as
 * written (it is the transcript); only the text sent to TTS goes through `normalizeForSpeech`.
 * Shared by the server (what is spoken) and the browser (segment cache keys), so both always agree.
 *
 * Extend the per-language tables below; matching is on whole words only and case-sensitive.
 */

import { mathToPlainText } from './mathPlain.js'

export type SpeechLanguage = 'tr' | 'en' | 'other'

/** Known abbreviations, acronyms and symbols -> what should be said. */
const DICTIONARY: Record<'tr' | 'en', Record<string, string>> = {
  tr: {
    DNA: 'de-en-a',
    RNA: 're-en-a',
    mRNA: 'em-re-en-a',
    ATP: 'a-te-pe',
    ADP: 'a-de-pe',
    NADPH: 'en-a-de-pe-ha',
    NADH: 'en-a-de-ha',
    pH: 'pe-ha',
    TBMM: 'te-be-me-me',
    LGS: 'le-ge-se',
    YKS: 'ye-ka-se',
    TYT: 'te-ye-te',
    AYT: 'a-ye-te',
    KPSS: 'ke-pe-se-se',
    YDS: 'ye-de-se',
    ABD: 'a-be-de',
    AB: 'a-be',
    BM: 'be-me',
    TL: 'Türk lirası',
    NATO: 'nato',
    UNESCO: 'yunesko',
    NASA: 'nasa',
    vb: 've benzeri',
    vs: 've saire',
    örn: 'örneğin',
    'km/sa': 'kilometre bölü saat',
    'm/s': 'metre bölü saniye',
    '°C': 'santigrat derece',
    '°': 'derece',
    '²': 'kare',
    '³': 'küp',
    '≈': 'yaklaşık',
    '≠': 'eşit değildir',
    '≤': 'küçük eşittir',
    '≥': 'büyük eşittir',
    π: 'pi',
    '&': 've',
  },
  en: {
    DNA: 'D N A',
    RNA: 'R N A',
    mRNA: 'm R N A',
    ATP: 'A T P',
    ADP: 'A D P',
    NADPH: 'N A D P H',
    NADH: 'N A D H',
    pH: 'p H',
    USA: 'U S A',
    UK: 'U K',
    EU: 'E U',
    UN: 'U N',
    NATO: 'nato',
    UNESCO: 'unesco',
    NASA: 'nasa',
    'e.g.': 'for example',
    'i.e.': 'that is',
    etc: 'et cetera',
    'km/h': 'kilometres per hour',
    'm/s': 'metres per second',
    '°C': 'degrees Celsius',
    '°': 'degrees',
    '²': 'squared',
    '³': 'cubed',
    '≈': 'approximately',
    '≠': 'is not equal to',
    '≤': 'is less than or equal to',
    '≥': 'is greater than or equal to',
    π: 'pi',
    '&': 'and',
  },
}

/** Units, spoken only right after a number. */
const UNITS: Record<'tr' | 'en', Record<string, string>> = {
  tr: { mm: 'milimetre', cm: 'santimetre', m: 'metre', km: 'kilometre', mg: 'miligram', g: 'gram', kg: 'kilogram', mL: 'mililitre', L: 'litre', sn: 'saniye', s: 'saniye', dk: 'dakika', sa: 'saat', h: 'saat', W: 'vat', V: 'volt', A: 'amper', J: 'jul', N: 'nevton', Hz: 'hertz' },
  en: { mm: 'millimetres', cm: 'centimetres', m: 'metres', km: 'kilometres', mg: 'milligrams', g: 'grams', kg: 'kilograms', mL: 'millilitres', L: 'litres', s: 'seconds', min: 'minutes', h: 'hours', W: 'watts', V: 'volts', A: 'amperes', J: 'joules', N: 'newtons', Hz: 'hertz' },
}

const OPERATORS: Record<'tr' | 'en', Record<string, string>> = {
  tr: { '+': 'artı', '-': 'eksi', '−': 'eksi', '×': 'çarpı', '*': 'çarpı', '÷': 'bölü', '/': 'bölü', '=': 'eşittir', '<': 'küçüktür', '>': 'büyüktür' },
  en: { '+': 'plus', '-': 'minus', '−': 'minus', '×': 'times', '*': 'times', '÷': 'divided by', '/': 'divided by', '=': 'equals', '<': 'is less than', '>': 'is greater than' },
}

/** Letter names for spelling unknown abbreviations. */
const LETTERS: Record<'tr' | 'en', Record<string, string>> = {
  tr: { A: 'a', B: 'be', C: 'ce', Ç: 'çe', D: 'de', E: 'e', F: 'fe', G: 'ge', Ğ: 'yumuşak ge', H: 'he', I: 'ı', İ: 'i', J: 'je', K: 'ke', L: 'le', M: 'me', N: 'ne', O: 'o', Ö: 'ö', P: 'pe', Q: 'kü', R: 're', S: 'se', Ş: 'şe', T: 'te', U: 'u', Ü: 'ü', V: 've', W: 'çift ve', X: 'iks', Y: 'ye', Z: 'ze' },
  en: Object.fromEntries('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => [letter, letter])),
}

const TR_ONES = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz']
const TR_TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan']
const EN_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

function trBelowThousand(n: number): string {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  return [hundreds === 0 ? '' : hundreds === 1 ? 'yüz' : `${TR_ONES[hundreds]} yüz`, TR_TENS[Math.floor(rest / 10)], TR_ONES[rest % 10]].filter(Boolean).join(' ')
}

function enBelowThousand(n: number): string {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const restWords = rest < 20 ? EN_ONES[rest] : [EN_TENS[Math.floor(rest / 10)], EN_ONES[rest % 10]].filter(Boolean).join('-')
  return [hundreds ? `${EN_ONES[hundreds]} hundred` : '', restWords].filter(Boolean).join(' ')
}

/** Whole numbers 0 - 999,999,999,999 in words. */
function integerToWords(value: number, language: 'tr' | 'en'): string {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e12) return String(value)
  if (value < 0) return `${language === 'tr' ? 'eksi' : 'minus'} ${integerToWords(-value, language)}`
  if (value === 0) return language === 'tr' ? 'sıfır' : 'zero'
  const scales = language === 'tr' ? ['', 'bin', 'milyon', 'milyar'] : ['', 'thousand', 'million', 'billion']
  const parts: string[] = []
  let rest = Math.floor(value)
  for (let scale = 0; rest > 0; scale += 1) {
    const chunk = rest % 1000
    rest = Math.floor(rest / 1000)
    if (chunk === 0) continue
    // Turkish says "bin", not "bir bin".
    const words = language === 'tr' ? (scale === 1 && chunk === 1 ? '' : trBelowThousand(chunk)) : enBelowThousand(chunk)
    parts.unshift([words, scales[scale]].filter(Boolean).join(' '))
  }
  return parts.join(' ')
}

/** Turkish ordinal ("üçüncü"), by vowel harmony on the last word. */
function trOrdinal(words: string): string {
  const lastVowel = [...words].reverse().find((char) => 'aeıioöuü'.includes(char)) ?? 'i'
  const harmony: Record<string, string> = { a: 'ıncı', ı: 'ıncı', e: 'inci', i: 'inci', o: 'uncu', u: 'uncu', ö: 'üncü', ü: 'üncü' }
  const suffix = harmony[lastVowel]
  // Vowel-final words drop the suffix's first vowel ("iki" -> "ikinci", "altı" -> "altıncı").
  return 'aeıioöuü'.includes(words.slice(-1)) ? words + suffix.slice(1) : words + suffix
}

function numberToWords(raw: string, language: 'tr' | 'en'): string {
  // Turkish writes 1.000 for a thousand and 2,5 for two and a half; English the other way round.
  const thousands = language === 'tr' ? '.' : ','
  const decimal = language === 'tr' ? ',' : '.'
  const clean = raw.split(thousands).join('')
  const [whole, fraction] = clean.split(decimal)
  const wholeWords = integerToWords(Number(whole), language)
  if (!fraction) return wholeWords
  if (language === 'tr') return `${wholeWords} virgül ${fraction.startsWith('0') ? fraction.split('').map((digit) => integerToWords(Number(digit), 'tr')).join(' ') : integerToWords(Number(fraction), 'tr')}`
  return `${wholeWords} point ${fraction.split('').map((digit) => integerToWords(Number(digit), 'en')).join(' ')}`
}

function romanValue(roman: string): number {
  const values: Record<string, number> = { I: 1, V: 5, X: 10 }
  let total = 0
  for (let index = 0; index < roman.length; index += 1) {
    const current = values[roman[index]]
    const next = values[roman[index + 1]] ?? 0
    total += current < next ? -current : current
  }
  return total
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whole-word boundaries for letters and digits (Unicode aware). */
const before = '(?<![\\p{L}\\p{N}])'
const after = '(?![\\p{L}\\p{N}])'

function spell(token: string, language: 'tr' | 'en'): string {
  const table = LETTERS[language]
  return [...token].map((char) => table[char] ?? char).join(language === 'tr' ? '-' : ' ')
}

/** "tr" / "en" from the lesson language; 'auto' looks at the text. */
export function speechLanguage(language: string, sample: string): SpeechLanguage {
  if (language === 'tr' || language === 'en') return language
  if (language !== 'auto') return 'other'
  if (/[çğışöüÇĞİŞÖÜ]/.test(sample)) return 'tr'
  if (/[԰-֏]/.test(sample)) return 'other'
  return /^[\p{Script=Latin}\p{N}\p{P}\p{Z}\p{S}]*$/u.test(sample) ? 'en' : 'other'
}

export interface SpeechText {
  text: string
  /** Unknown all-caps tokens (2-5 letters) that were spelled out letter by letter. */
  unknownAbbreviations: string[]
}

/** Rewrites abbreviations, symbols, units, Roman numerals, formulas and numbers into spoken words. */
export function normalizeForSpeech(input: string, language: SpeechLanguage): SpeechText {
  // LaTeX never reaches the voice as code: it becomes plain math first.
  let text = mathToPlainText(input).replace(/[*_#`~]+/g, ' ')
  const unknown = new Set<string>()
  if (language === 'other') return { text: text.replace(/\s+/g, ' ').trim(), unknownAbbreviations: [] }
  const lang = language

  // 0. Spoken math: powers ("4⁵", "a^(m+n)"), "·" and a fraction bar after a closing bracket.
  const toPower = lang === 'tr' ? ' üzeri ' : ' to the power of '
  const SUPERSCRIPT_DIGITS = '⁰¹²³⁴⁵⁶⁷⁸⁹'
  // After a unit (m², cm³) a square/cube is said as "kare"/"küp"; any other power is "üzeri".
  text = text.replace(/(?<=[\p{N}\p{L})])([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/gu, (run: string, _group: string, offset: number, whole: string) => {
    const unit = /(?:^|[\s\d])(?:[kcdm]?m)$/.test(whole.slice(0, offset))
    if (unit && run === '²') return lang === 'tr' ? ' kare' : ' squared'
    if (unit && run === '³') return lang === 'tr' ? ' küp' : ' cubed'
    return `${toPower}${[...run].map((char) => SUPERSCRIPT_DIGITS.indexOf(char)).join('')} `
  })
  text = text.replace(/\^\(([^()]*)\)/g, (_m, inner: string) => `${toPower}${inner} `).replace(/\^([\p{L}\p{N}]+)/gu, (_m, inner: string) => `${toPower}${inner} `)
  text = text.replace(/\s*·\s*/g, ' × ').replace(/\)\s*\/\s*(?=[\p{L}\p{N}(])/gu, `) ${OPERATORS[lang]['/']} `)

  // 1. Dictionary entries, longest first, whole words (symbols match anywhere).
  for (const key of Object.keys(DICTIONARY[lang]).sort((a, b) => b.length - a.length)) {
    const isWord = /^[\p{L}\p{N}]/u.test(key)
    const pattern = isWord ? new RegExp(`${before}${escapeRegExp(key)}${/[\p{L}\p{N}]$/u.test(key) ? after : ''}`, 'gu') : new RegExp(escapeRegExp(key), 'g')
    // Words keep their neighbours ("DNA'nın" -> "de-en-a'nın"); symbols get spaces ("25°C").
    text = text.replace(pattern, isWord ? DICTIONARY[lang][key] : ` ${DICTIONARY[lang][key]} `)
  }

  // 2. Percentages: Turkish puts "yüzde" first (%20), English "percent" after (20%).
  text = text.replace(/%\s?(\d+(?:[.,]\d+)?)/g, (_m, number: string) => (lang === 'tr' ? `yüzde ${numberToWords(number, lang)}` : `${numberToWords(number, lang)} percent`))
  text = text.replace(/(\d+(?:[.,]\d+)?)\s?%/g, (_m, number: string) => (lang === 'tr' ? `yüzde ${numberToWords(number, lang)}` : `${numberToWords(number, lang)} percent`))

  // 3. Number + unit.
  const units = Object.keys(UNITS[lang]).sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')
  text = text.replace(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s?(${units})${after}`, 'gu'), (_m, number: string, unit: string) => `${numberToWords(number, lang)} ${UNITS[lang][unit]}`)

  // 4. Chemical formulas with digits (CO2, H2O, C6H12O6): letters by name, digits as numbers.
  text = text.replace(new RegExp(`${before}((?:[A-Z][a-z]?\\d*){1,8})${after}`, 'gu'), (match: string) => {
    if (!/\d/.test(match) || !/^[A-Z]/.test(match)) return match
    const pieces = match.match(/[A-Z][a-z]?|\d+/g) ?? []
    return pieces.map((piece) => (/\d/.test(piece) ? integerToWords(Number(piece), lang) : spell(piece[0], lang) + (piece[1] ? ` ${piece[1]}` : ''))).join(lang === 'tr' ? '-' : ' ')
  })

  // 5. A number range without spaces (1939-1945) is "ile" / "to", not a minus.
  text = text.replace(/(\d)-(?=\d)/g, (_m, digit: string) => `${digit} ${lang === 'tr' ? 'ile' : 'to'} `)
  // A coefficient glued to a variable (3x, 2y) is said as two words.
  text = text.replace(new RegExp(`(\\d)([a-zA-Z])${after}`, 'gu'), '$1 $2')

  // Operators between numbers or single letters (3 + 4, x = 8, 2x - 1).
  text = text.replace(/(?<=[\p{L}\p{N}])\s*([+\-−×÷*/=<>])\s*(?=[\p{L}\p{N}(])/gu, (match: string, operator: string, offset: number, whole: string) => {
    // A hyphen inside a word ("state-of-the-art", "de-en-a") stays a hyphen.
    if (operator === '-' && !/\d/.test(whole[offset - 1] ?? '') && !/\s/.test(match)) return match
    if (operator === '/' && !/\d/.test(whole[offset - 1] ?? '')) return match
    return ` ${OPERATORS[lang][operator]} `
  })

  // 6. Roman numerals made of I, V, X (II-XXXIX); Turkish "II." is an ordinal.
  text = text.replace(new RegExp(`${before}(X{0,3}(?:IX|IV|V?I{0,3}))(\\.?)${after}`, 'gu'), (match: string, roman: string, dot: string) => {
    if (roman.length < 2) return match
    const words = integerToWords(romanValue(roman), lang)
    return lang === 'tr' && dot ? trOrdinal(words) : `${words}${dot}`
  })

  // 7. English years (1945 -> nineteen forty-five), then remaining numbers.
  if (lang === 'en') {
    text = text.replace(new RegExp(`${before}(1[1-9]|20)(\\d\\d)${after}(?![.,]\\d)`, 'gu'), (match: string, head: string, tail: string) => {
      const year = Number(match)
      if (year >= 2000 && year < 2010) return integerToWords(year, 'en')
      if (tail === '00') return `${integerToWords(Number(head), 'en')} hundred`
      return `${integerToWords(Number(head), 'en')} ${tail.startsWith('0') ? `oh ${integerToWords(Number(tail), 'en')}` : integerToWords(Number(tail), 'en')}`
    })
  }
  text = text.replace(lang === 'tr' ? /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g : /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g, (number: string) => numberToWords(number, lang))

  // 8. Unknown all-caps abbreviations (2-5 letters): spelled out and reported.
  text = text.replace(new RegExp(`${before}([A-ZÇĞİÖŞÜ]{2,5})${after}`, 'gu'), (token: string) => {
    unknown.add(token)
    return spell(token, lang)
  })

  return { text: text.replace(/\s+([,.;:!?…])/g, '$1').replace(/\s+/g, ' ').trim(), unknownAbbreviations: [...unknown] }
}
