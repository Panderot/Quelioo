import type { QuizPair, QuizQuestion } from './quiz.js'
import { normalizeAnswer } from './answerCheck.js'

/** Every question gets exactly this many progressive hints (gentle, then stronger) when the
 * Hints setting is on. Shared by generation, sanitization and the UI so the number never drifts. */
export const MAX_HINTS = 2
/** Soft display/storage cap — hints are meant to be one short sentence. */
export const MAX_HINT_CHARS = 140
/** Hard ceiling used only by the accuracy guard to flag a hint as having rambled far past the
 * ~140 char guidance (and therefore worth a rewrite attempt) — well above MAX_HINT_CHARS so a
 * merely-a-bit-long hint is just trimmed, not rejected. */
const OVERLONG_HINT_CHARS = 220

export function getHints(question: Pick<QuizQuestion, 'hints'>): string[] {
  return question.hints ?? []
}

function normalizeForLeak(text: string): string {
  return normalizeAnswer(text)
}

/** Counts actual letters (Unicode "letter" category) in text, ignoring spaces/punctuation —
 * Turkish letters (ç, ş, ö, ü, ğ, ı, İ) are each already a single code point, so no
 * special-casing is needed beyond excluding non-letters. */
export function countLetters(text: string): number {
  return [...text].filter((char) => /\p{L}/u.test(char)).length
}

/** The answer's first letter (original case) and total letter count — used to build the
 * deterministic fill-blanks hint 2 template server-side, so it's always exactly right no matter
 * what the model wrote. Returns null for an answer with no letters at all (e.g. a bare number). */
export function firstLetterAndCount(answer: string): { letter: string; count: number } | null {
  const firstLetter = [...answer.trim()].find((char) => /\p{L}/u.test(char))
  if (!firstLetter) return null
  return { letter: firstLetter, count: countLetters(answer) }
}

// Only en/tr/hyw are guaranteed accurate translations (the app's own UI languages); every other
// quiz output language falls back to the English template, which is still factually correct even
// though it isn't localized — a deliberate, documented trade-off rather than silently guessing.
const FILL_BLANK_HINT2_TEMPLATES: Record<string, (letter: string, count: number) => string> = {
  en: (letter, count) => `It starts with "${letter}" and has ${count} letters.`,
  tr: (letter, count) => `"${letter}" harfiyle başlıyor ve ${count} harfli.`,
  hyw: (letter, count) => `Կը սկսի "${letter}" տառով եւ ունի ${count} տառ։`,
}

export function fillBlankHint2Template(outputLanguage: string, letter: string, count: number): string {
  const template = FILL_BLANK_HINT2_TEMPLATES[outputLanguage] ?? FILL_BLANK_HINT2_TEMPLATES.en
  return template(letter, count)
}

function wordsOf(normalized: string): string[] {
  return normalized.split(' ').filter(Boolean)
}

// Short function words ("the", "is", "of", "ve", "bir"...) inflate the word-order ratio below
// without carrying any of the target's actual meaning — a hint that merely shares a few common
// short words with the answer isn't a leak. Only words longer than this count toward the ratio;
// falls back to every word when the target has no word longer than this (e.g. a short target).
const STOPWORD_MAX_LENGTH = 3

/** True if `ratio` or more of `targetNormalized`'s meaningful (longer-than-stopword) words appear
 * inside `hintNormalized`, in the same relative order (not necessarily contiguous) — approximates
 * "60%+ of its words in order" while ignoring common short function words. */
function containsWordsInOrder(hintNormalized: string, targetNormalized: string, ratio: number): boolean {
  const allTargetWords = wordsOf(targetNormalized)
  const meaningfulWords = allTargetWords.filter((word) => word.length > STOPWORD_MAX_LENGTH)
  const targetWords = meaningfulWords.length > 0 ? meaningfulWords : allTargetWords
  if (targetWords.length === 0) return false
  const hintWords = wordsOf(hintNormalized)
  let cursor = 0
  let matched = 0
  for (const word of targetWords) {
    const foundAt = hintWords.indexOf(word, cursor)
    if (foundAt !== -1) {
      matched++
      cursor = foundAt + 1
    }
  }
  return matched / targetWords.length >= ratio
}

/** True if `hint` leaks `target` outright: exact (normalized) containment, or `ratio`+ of
 * target's words appearing in the same order. A single-word target is checked by containment
 * only, since the word-order ratio is meaningless below two words. */
function leaksText(hint: string, target: string, ratio = 0.6): boolean {
  const normalizedTarget = normalizeForLeak(target)
  if (!normalizedTarget) return false
  const normalizedHint = normalizeForLeak(hint)
  if (!normalizedHint) return false
  if (normalizedHint.includes(normalizedTarget)) return true
  if (wordsOf(normalizedTarget).length < 2) return false
  return containsWordsInOrder(normalizedHint, normalizedTarget, ratio)
}

/** "True"/"false" verdict words per output language — deliberately not exhaustive across every
 * supported output language; covers the app's own UI languages plus a broad set of the other
 * quiz output languages. English and Turkish are always checked in addition to the quiz's own
 * language, since a leaked verdict word sometimes slips through in English regardless of target
 * language. Whole-word matched only, never a substring, to avoid false positives. */
const TRUE_FALSE_WORDS: Record<string, [string[], string[]]> = {
  en: [['true'], ['false']],
  tr: [['dogru'], ['yanlis']],
  // Native scripts below are stored lowercase, unromanized — normalizeAnswer lowercases and
  // strips Latin diacritics but never transliterates a non-Latin script, so a romanized entry
  // here would simply never match the model's actual (native-script) output.
  hyw: [['ճիշդ'], ['սխալ']],
  hy: [['ճիշտ'], ['սխալ']],
  ar: [['صحيح', 'صح'], ['خطأ', 'خاطئ']],
  de: [['wahr', 'richtig'], ['falsch']],
  fr: [['vrai'], ['faux']],
  es: [['verdadero'], ['falso']],
  it: [['vero'], ['falso']],
  'pt-BR': [['verdadeiro'], ['falso']],
  'pt-PT': [['verdadeiro'], ['falso']],
  ru: [['верно', 'истина'], ['неверно', 'ложь']],
  el: [['σωστό', 'αληθές'], ['λάθος', 'ψευδές']],
  nl: [['waar'], ['onwaar', 'vals']],
  pl: [['prawda'], ['falsz']],
  uk: [['правда', 'вірно'], ['неправда', 'хибно']],
  fa: [['درست'], ['نادرست']],
  he: [['נכון'], ['שקר']],
  ja: [['正しい', '真'], ['間違い', '偽']],
  ko: [['참', '맞다'], ['거짓', '틀리다']],
  hi: [['सही'], ['गलत']],
  sv: [['sant'], ['falskt']],
  no: [['sant'], ['usant', 'falskt']],
  da: [['sandt'], ['falsk']],
  fi: [['totta', 'tosi'], ['epatotta', 'vaara']],
  cs: [['pravda'], ['nepravda', 'falesne']],
  ro: [['adevarat'], ['fals']],
  hu: [['igaz'], ['hamis']],
  bg: [['вярно', 'истина'], ['невярно', 'лъжа']],
  sr: [['тачно', 'истина'], ['нетачно', 'лаж']],
  hr: [['tocno', 'istina'], ['netocno', 'laz']],
  az: [['dogru'], ['yanlish']],
  ka: [['სწორი'], ['არასწორი']],
  id: [['benar'], ['salah']],
  vi: [['dung'], ['sai']],
  ms: [['benar'], ['salah']],
  sw: [['kweli'], ['uongo']],
  uz: [['togri'], ['notogri']],
  kk: [['дұрыс'], ['бұрыс']],
  kmr: [['rast'], ['chewt']],
  sq: [['e vertete'], ['e gabuar']],
  bs: [['tacno'], ['netacno']],
  sk: [['pravda'], ['nepravda']],
  sl: [['res', 'pravilno'], ['napacno']],
  lv: [['patiess'], ['aplams']],
  lt: [['teisinga'], ['neteisinga']],
  et: [['oige'], ['vale']],
  bn: [['সত্য'], ['মিথ্যা']],
  ur: [['صحیح'], ['غلط']],
  ca: [['veritable', 'cert'], ['fals']],
}

function containsWholeWord(normalizedHint: string, rawWord: string): boolean {
  const normalizedWord = normalizeForLeak(rawWord)
  if (!normalizedWord) return false
  return wordsOf(normalizedHint).includes(normalizedWord)
}

function leaksTrueFalseVerdict(hint: string, outputLanguage: string): boolean {
  const normalizedHint = normalizeForLeak(hint)
  if (!normalizedHint) return false
  const [languageTrue, languageFalse] = TRUE_FALSE_WORDS[outputLanguage] ?? [[], []]
  const [enTrue, enFalse] = TRUE_FALSE_WORDS.en
  const [trTrue, trFalse] = TRUE_FALSE_WORDS.tr
  const allWords = [...languageTrue, ...languageFalse, ...enTrue, ...enFalse, ...trTrue, ...trFalse]
  return allWords.some((word) => containsWholeWord(normalizedHint, word))
}

function countConfirmedPairs(text: string, pairs: QuizPair[]): number {
  return pairs.filter((pair) => leaksText(text, pair.left, 0.8) && leaksText(text, pair.right, 0.8)).length
}

type HintLeakReason = 'count' | 'empty' | 'overlong' | 'duplicate' | 'answer' | 'verdict' | 'pairs'

export interface HintLeakResult {
  index: number
  reason: HintLeakReason
}

export interface FindHintLeakOptions {
  /** true (generation): hints must be exactly MAX_HINTS non-empty, non-duplicate entries.
   * false (edit form save): each provided (non-empty) hint is checked independently — a blank
   * hint is fine, since hints are optional there. */
  requireComplete?: boolean
}

/**
 * Deterministic accuracy guard: returns the first rule a hint breaks, or null when every hint is
 * clean. Shared by the server (post-generation check + rewrite loop) and the client (edit-form
 * save validation) so the exact same rules apply everywhere — see CLAUDE.md.
 */
export function findHintLeak(
  question: QuizQuestion,
  hints: string[],
  outputLanguage: string,
  options: FindHintLeakOptions = {},
): HintLeakResult | null {
  const requireComplete = options.requireComplete ?? true

  if (requireComplete) {
    if (hints.length !== MAX_HINTS) return { index: hints.length, reason: 'count' }
    for (let i = 0; i < hints.length; i++) {
      if (!hints[i].trim()) return { index: i, reason: 'empty' }
    }
  }

  for (let i = 0; i < hints.length; i++) {
    if (hints[i].trim().length > OVERLONG_HINT_CHARS) return { index: i, reason: 'overlong' }
  }

  if (hints[0]?.trim() && hints[1]?.trim() && normalizeForLeak(hints[0]) === normalizeForLeak(hints[1])) {
    return { index: 1, reason: 'duplicate' }
  }

  for (let i = 0; i < hints.length; i++) {
    const hint = hints[i]
    if (!hint?.trim()) continue
    switch (question.type) {
      case 'mcq':
        if (leaksText(hint, question.options[question.answerIndex])) return { index: i, reason: 'answer' }
        break
      case 'true-false':
        if (leaksTrueFalseVerdict(hint, outputLanguage)) return { index: i, reason: 'verdict' }
        break
      case 'fill-blanks':
      case 'short-answer': {
        const targets = [question.answer, ...(question.acceptableAnswers ?? [])]
        if (targets.some((target) => leaksText(hint, target))) return { index: i, reason: 'answer' }
        break
      }
      case 'open-ended': {
        const targets = [question.answer, ...(question.keyPoints ?? [])]
        if (targets.some((target) => leaksText(hint, target))) return { index: i, reason: 'answer' }
        break
      }
      case 'matching':
        break // checked combined, below
    }
  }

  if (question.type === 'matching') {
    const nonEmptyHints = hints.filter((hint) => hint?.trim())
    if (nonEmptyHints.length > 0) {
      const confirmed = countConfirmedPairs(nonEmptyHints.join(' '), question.pairs)
      const maxAllowed = question.pairs.length >= 4 ? 1 : 0
      if (confirmed > maxAllowed) return { index: nonEmptyHints.length - 1, reason: 'pairs' }
    }
  }

  return null
}

/** Per-type hint-writing rules, shared between the generation prompt and the targeted rewrite
 * prompt used when a question's hints fail the accuracy guard. */
export function hintRulesForType(question: Pick<QuizQuestion, 'type'> & { pairs?: QuizPair[] }): string {
  switch (question.type) {
    case 'mcq':
      return 'Hint 1 points to the key idea; hint 2 may rule out ONE wrong option by describing why it does not fit (by content, never by letter). Never name, quote or paraphrase the correct option.'
    case 'true-false':
      return 'Point to the exact part of the statement that must be checked against the text. Never say or imply whether it is true or false, and never use the words "true"/"false" or their equivalents in the quiz language.'
    case 'fill-blanks':
      return "Hint 1 gives the category or meaning of the missing word; hint 2 gives its first letter and letter count. Never the word itself."
    case 'short-answer':
      return 'Point to the concept and where in the text it appears (e.g. "look at the part about the stomach"). Never state the answer.'
    case 'matching': {
      const pairCount = question.pairs?.length ?? 0
      return `Hint 1 gives a strategy (e.g. "start with where digestion begins"); hint 2 ${pairCount >= 4 ? 'may confirm ONE correct pair, never more' : 'must not confirm any correct pair (this question has fewer than 4 pairs)'}.`
    }
    case 'open-ended':
      return 'Say how many key ideas are expected and which aspects to cover, without stating the ideas.'
  }
}
