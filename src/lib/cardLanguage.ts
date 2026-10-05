/**
 * One language resolver for every card generator (the AI panel, Solve → "Make cards", Quiz → "Make cards"),
 * shared by the client (notes, disabled button) and the server (prompt, output check).
 * Script and word lists decide; nothing here calls a model, and nothing falls back to English or German by itself.
 */

export type Script = 'latin' | 'cyrillic' | 'greek' | 'arabic' | 'hebrew' | 'armenian' | 'georgian' | 'devanagari' | 'bengali' | 'thai' | 'hangul' | 'kana' | 'han'

const SCRIPT_RANGES: [Script, number, number][] = [
  ['cyrillic', 0x0400, 0x052f],
  ['greek', 0x0370, 0x03ff],
  ['greek', 0x1f00, 0x1fff],
  ['armenian', 0x0530, 0x058f],
  ['hebrew', 0x0590, 0x05ff],
  ['arabic', 0x0600, 0x06ff],
  ['arabic', 0x0750, 0x077f],
  ['arabic', 0xfb50, 0xfdff],
  ['arabic', 0xfe70, 0xfeff],
  ['devanagari', 0x0900, 0x097f],
  ['bengali', 0x0980, 0x09ff],
  ['thai', 0x0e00, 0x0e7f],
  ['georgian', 0x10a0, 0x10ff],
  ['hangul', 0x1100, 0x11ff],
  ['hangul', 0xac00, 0xd7af],
  ['kana', 0x3040, 0x30ff],
  ['han', 0x3400, 0x4dbf],
  ['han', 0x4e00, 0x9fff],
]

function scriptOfCode(code: number): Script | null {
  for (const [script, from, to] of SCRIPT_RANGES) if (code >= from && code <= to) return script
  if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a) || (code >= 0xc0 && code <= 0x24f) || (code >= 0x1e00 && code <= 0x1eff)) return 'latin'
  return null
}

/** Letters per script (digits, punctuation, math and spaces are not counted). */
export function scriptCounts(text: string): Record<Script, number> {
  const counts: Record<Script, number> = { latin: 0, cyrillic: 0, greek: 0, arabic: 0, hebrew: 0, armenian: 0, georgian: 0, devanagari: 0, bengali: 0, thai: 0, hangul: 0, kana: 0, han: 0 }
  for (const char of text) {
    const script = scriptOfCode(char.codePointAt(0) ?? 0)
    if (script) counts[script]++
  }
  return counts
}

/** Common function words per Latin-script language (lower case): enough to tell the main languages apart. */
const STOPWORDS: Record<string, string[]> = {
  tr: ['ve', 'bir', 'bu', 'için', 'ile', 'de', 'da', 'olarak', 'gibi', 'daha', 'çok', 'en', 'olan', 'ise', 'ancak', 'veya', 'her', 'ne', 'nedir', 'hangi', 'kadar', 'sonra', 'bazen', 'yüzden', 'şu', 'o', 'ki', 'mi', 'mı'],
  en: ['the', 'and', 'of', 'to', 'in', 'is', 'that', 'it', 'for', 'with', 'as', 'was', 'are', 'by', 'on', 'this', 'which', 'from', 'or', 'an', 'be', 'what', 'when', 'where', 'how', 'why', 'does', 'did', 'its'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'zu', 'den', 'mit', 'von', 'auf', 'für', 'sich', 'auch', 'wird', 'dem', 'des', 'wie', 'was', 'wer', 'bei', 'oder', 'sind'],
  fr: ['le', 'la', 'les', 'des', 'et', 'est', 'un', 'une', 'du', 'que', 'qui', 'dans', 'pour', 'pas', 'sur', 'au', 'avec', 'sont', 'ce', 'quel', 'quelle', 'comment', 'ou'],
  es: ['el', 'los', 'las', 'del', 'y', 'es', 'un', 'una', 'que', 'por', 'con', 'para', 'se', 'su', 'al', 'como', 'más', 'qué', 'cuál', 'son', 'está', 'o'],
  it: ['il', 'lo', 'gli', 'dei', 'della', 'e', 'è', 'un', 'una', 'che', 'per', 'con', 'di', 'non', 'sono', 'come', 'più', 'quale', 'cosa', 'nel', 'alla'],
  pt: ['o', 'os', 'as', 'dos', 'da', 'e', 'é', 'um', 'uma', 'que', 'para', 'com', 'não', 'em', 'por', 'mais', 'como', 'qual', 'são', 'ao', 'nas'],
  nl: ['de', 'het', 'een', 'en', 'van', 'is', 'dat', 'op', 'te', 'voor', 'met', 'zijn', 'niet', 'aan', 'ook', 'als', 'wat', 'welke', 'hoe', 'wordt'],
}
const TURKISH_LETTERS = /[çğışöüÇĞİŞÖÜ]/
const GERMAN_LETTERS = /[äöüßÄÖÜ]/

/** The Latin-script language of a text when its function words make it clear, else null. */
export function detectLatinLanguage(text: string): string | null {
  const words = text.toLocaleLowerCase('en').match(/[\p{L}']+/gu) ?? []
  if (words.length < 3) return null
  const scores: [string, number][] = Object.entries(STOPWORDS).map(([code, list]) => {
    const set = new Set(list)
    let score = 0
    for (const word of words) if (set.has(word)) score++
    return [code, score / words.length]
  })
  // Letters that only some languages use (ı ş ğ for Turkish, ß for German) settle close calls.
  const turkish = scores.find(([code]) => code === 'tr')
  if (turkish && /[ışğİŞĞ]/.test(text)) turkish[1] += 0.15
  const german = scores.find(([code]) => code === 'de')
  if (german && /ß/.test(text)) german[1] += 0.15
  if (TURKISH_LETTERS.test(text) && !GERMAN_LETTERS.test(text) && turkish) turkish[1] += 0.03
  scores.sort((a, b) => b[1] - a[1])
  const [best, second] = scores
  if (best[1] < 0.06 || best[1] - (second?.[1] ?? 0) < 0.025) return null
  return best[0]
}

/** The language code of a source text: by script for non-Latin scripts, by function words for Latin ones.
 * null when it cannot be told (a short topic, mixed or unknown). */
export function detectTextLanguage(text: string): string | null {
  const counts = scriptCounts(text)
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
  if (total < 3) return null
  const ranked = (Object.entries(counts) as [Script, number][]).sort((a, b) => b[1] - a[1])
  const [script, count] = ranked[0]
  if (count / total < 0.5) return null
  switch (script) {
    case 'latin':
      return detectLatinLanguage(text)
    case 'cyrillic':
      return 'ru'
    case 'greek':
      return 'el'
    case 'arabic':
      return /[پچژگ]/.test(text) ? 'fa' : 'ar'
    case 'hebrew':
      return 'he'
    case 'armenian':
      return 'hyw'
    case 'georgian':
      return 'ka'
    case 'devanagari':
      return 'hi'
    case 'bengali':
      return 'bn'
    case 'thai':
      return 'th'
    case 'hangul':
      return 'ko'
    case 'kana':
      return 'ja'
    case 'han':
      return counts.kana > 0 ? 'ja' : 'zh-Hans'
  }
}

/** "pt-BR" -> "pt", "zh-Hans" stays: the part that identifies the language for comparisons. */
export function baseLanguage(code: string): string {
  return code.startsWith('zh') ? 'zh' : code.split('-')[0]
}

export function sameLanguage(a: string, b: string): boolean {
  const left = baseLanguage(a)
  const right = baseLanguage(b)
  return left === right || (left === 'hy' && right === 'hyw') || (left === 'hyw' && right === 'hy')
}

const EXPECTED_SCRIPT: Record<string, Script[]> = {
  ar: ['arabic'],
  fa: ['arabic'],
  he: ['hebrew'],
  ru: ['cyrillic'],
  bg: ['cyrillic'],
  uk: ['cyrillic'],
  kk: ['cyrillic'],
  el: ['greek'],
  hy: ['armenian'],
  hyw: ['armenian'],
  ka: ['georgian'],
  hi: ['devanagari'],
  bn: ['bengali'],
  th: ['thai'],
  ko: ['hangul'],
  ja: ['kana', 'han'],
  zh: ['han'],
}

/** Does `text` look like it is written in language `code`? true/false when it can be told (script, or function
 * words for the main Latin languages), null when it cannot (no check possible, treat as fine). */
export function textMatchesLanguage(text: string, code: string): boolean | null {
  const base = baseLanguage(code)
  const counts = scriptCounts(text)
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)
  if (total < 3) return null
  const expected = EXPECTED_SCRIPT[base]
  if (expected) {
    const share = expected.reduce((sum, script) => sum + counts[script], 0) / total
    if (base === 'ja' && counts.kana === 0 && share >= 0.5) return null
    if (base === 'zh' && counts.kana > 0) return false
    return share >= 0.5
  }
  if (counts.latin / total < 0.6) {
    // Latin target but the text is mostly another script.
    return base in STOPWORDS || /^(sr|sq|az|bs|hr|cs|da|et|fi|hu|id|ms|no|pl|ro|sk|sl|lv|lt|ca|kmr)$/.test(base) ? false : null
  }
  if (!(base in STOPWORDS)) return null
  const detected = detectLatinLanguage(text)
  if (!detected) return null
  return detected === base
}

/** UI languages the app ships; other i18n values fall back to English. */
export function normalizeUiLanguage(language: string | undefined): string {
  const base = (language ?? 'en').split('-')[0]
  return base === 'tr' || base === 'hyw' || base === 'en' ? base : 'en'
}

export interface ResolvedLanguage {
  code: string
  /** False when the source did not reveal its language and the UI language was used instead. */
  certain: boolean
}

/** The language the cards are written in. A chosen language always wins; "auto" is the language of the
 * source text (or the typed topic or solved question), else the UI language. Never a silent English. */
export function resolveCardLanguage(params: { selected: string; sourceText: string; uiLanguage?: string }): ResolvedLanguage {
  if (params.selected && params.selected !== 'auto') return { code: params.selected, certain: true }
  const detected = detectTextLanguage(params.sourceText)
  if (detected) return { code: detected, certain: true }
  return { code: normalizeUiLanguage(params.uiLanguage), certain: false }
}

/** Foreign word → translation: the language the translations are written in. A chosen language wins; with
 * "auto" it is the UI language when that differs from the source, otherwise English (Turkish for an English source). */
export function resolveTranslationTarget(params: { selected: string; sourceLanguage: string | null; uiLanguage?: string }): string {
  if (params.selected && params.selected !== 'auto') return params.selected
  const ui = normalizeUiLanguage(params.uiLanguage)
  if (!params.sourceLanguage || !sameLanguage(ui, params.sourceLanguage)) return ui
  return sameLanguage(params.sourceLanguage, 'en') ? 'tr' : 'en'
}

/** Foreign word → translation into the language the text is written in teaches nothing: true when the chosen
 * output language is the source language. */
export function translationLanguageConflict(params: { selected: string; sourceLanguage: string | null }): boolean {
  return params.selected !== 'auto' && params.sourceLanguage !== null && sameLanguage(params.selected, params.sourceLanguage)
}
