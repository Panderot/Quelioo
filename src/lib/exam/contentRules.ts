import { STOP_WORDS, contentStems, normalize, plainText, wordCountOf, wordShare } from './text.js'
import type { ExamQuestion } from './types.js'

/** Per-type content rules of the written exam (A1, A3, A5, A7): pure checks that say what is wrong with a question, or with a group of questions. */

// ---------------------------------------------------------------------------
// A1: the scenario and the stem must not give the answer away
// ---------------------------------------------------------------------------

const LEAK_ITEM_COVERAGE = 0.6
const LEAK_POINTS_SHARE = 0.4
const MIN_ITEM_TERMS = 2

/** Key terms of the expected answer: for an open-ended question those of every rubric item (the topic's own words are not a giveaway). */
function leakTerms(question: ExamQuestion): Set<string> {
  return contentStems(question.topic ?? '')
}

/** Does the stem or the scenario hold the key terms of the answer, so a student can copy them? */
export function answerLeaks(question: ExamQuestion): boolean {
  const given = contentStems(`${question.context ?? ''} ${question.stem.replace(/___/g, ' ')}`)
  if (given.size === 0) return false
  const topic = leakTerms(question)
  const termsOf = (text: string): string[] => [...contentStems(text)].filter((term) => !topic.has(term))
  const covered = (terms: string[]): number => (terms.length === 0 ? 0 : terms.filter((term) => given.has(term)).length / terms.length)

  if (question.type === 'open-ended') {
    const items = question.rubric.length > 0 ? question.rubric : [{ text: question.answer, points: 1 }]
    let total = 0
    let leaked = 0
    for (const item of items) {
      const terms = termsOf(item.text)
      const weight = Math.max(1, item.points)
      total += weight
      if (terms.length >= MIN_ITEM_TERMS && covered(terms) >= LEAK_ITEM_COVERAGE) leaked += weight
    }
    return total > 0 && leaked / total >= LEAK_POINTS_SHARE
  }
  if (question.type === 'short-answer') {
    const answers = [question.answer, ...(question.acceptableAnswers ?? [])]
    const heard = normalize(plainText(`${question.context ?? ''} ${question.stem}`)).split(' ').map((word) => word.slice(0, 5))
    return answers.some((answer) => {
      const words = normalize(plainText(answer)).split(' ').filter((word) => word.length >= 4).map((word) => word.slice(0, 5))
      if (words.length === 0) return false
      // One term of the answer in the question gives it away; several terms only when the question holds them one after the other (a phrase copied from it).
      if (words.length === 1) return heard.includes(words[0]) && !topic.has(words[0])
      for (let at = 0; at + words.length <= heard.length; at += 1) if (words.every((word, offset) => heard[at + offset] === word)) return true
      return false
    })
  }
  if (question.type === 'mcq' && question.options && question.answerIndex !== undefined) {
    const correct = termsOf(question.options[question.answerIndex] ?? '')
    if (correct.length === 0 || covered(correct) < 1) return false
    // A giveaway only when the wrong options are not in the scenario as well.
    const others = question.options.filter((_, index) => index !== question.answerIndex).map((option) => termsOf(option))
    return others.every((terms) => terms.length === 0 || covered(terms) < 1)
  }
  return false
}

// ---------------------------------------------------------------------------
// A3: short-answer questions are really short
// ---------------------------------------------------------------------------

export const SHORT_ANSWER_MAX_WORDS = 4
export const SHORT_ANSWER_MAX_ACCEPTED = 3
const EXPLAIN_WORDS = /(?:^|[^\p{L}])(?:açıkla\p{L}*|neden|nedenini|niçin|niye|explain|why|describe)(?![\p{L}])/iu

/** What is wrong with a short-answer question (empty = fine). */
export function shortAnswerProblems(question: ExamQuestion): string[] {
  const problems: string[] = []
  const answer = question.answer.trim()
  const hasFormula = /\$|\d|[=²³√]/.test(answer)
  if (wordCountOf(answer) > (hasFormula ? SHORT_ANSWER_MAX_WORDS + 2 : SHORT_ANSWER_MAX_WORDS)) problems.push('answer-long')
  if (EXPLAIN_WORDS.test(question.stem)) problems.push('stem-explain')
  const accepted = (question.acceptableAnswers ?? []).filter((value) => value.trim() && normalize(value) !== normalize(answer))
  if (accepted.length > SHORT_ANSWER_MAX_ACCEPTED) problems.push('accepted-many')
  if (question.rubric.length !== 1) problems.push('rubric-items')
  return problems
}

/** "Kabul edilebilir": at most three real alternatives, each without trailing punctuation, none the answer itself or a rewording of it. */
export function cleanAccepted(answer: string, accepted: string[] | undefined, max = SHORT_ANSWER_MAX_ACCEPTED): string[] {
  const seen = new Set([normalize(answer)])
  const result: string[] = []
  for (const raw of accepted ?? []) {
    const value = raw.trim().replace(/[\s.;,:!]+$/u, '')
    const key = normalize(value)
    if (!value || seen.has(key)) continue
    // The same sentence reworded is not an alternative: it shares almost every word with the answer.
    if (wordCountOf(value) > SHORT_ANSWER_MAX_WORDS + 2) continue
    seen.add(key)
    result.push(value)
    if (result.length >= max) break
  }
  return result
}

// ---------------------------------------------------------------------------
// A5: rubric items are real
// ---------------------------------------------------------------------------

const NOT_LETTER_BEFORE = '(?<![\\p{L}])'
const NOT_LETTER_AFTER = '(?![\\p{L}])'
const EMPTY_RUBRIC_PATTERNS: RegExp[] = [
  new RegExp(`${NOT_LETTER_BEFORE}bu ifadenin.*(?:açıkladığını|belirttiğini|söylediğini|ifade ettiğini)${NOT_LETTER_AFTER}`, 'iu'),
  new RegExp(`(?:açıkladığını|belirttiğini|söylediğini|ifade ettiğini)\\s+(?:belirtir|söyler|ifade eder|yazar)${NOT_LETTER_AFTER}`, 'iu'),
  new RegExp(`ölçütü olarak (?:açıklar|belirtir)${NOT_LETTER_AFTER}`, 'iu'),
  new RegExp(`(?:doğru|uygun) (?:bir )?şekilde (?:ifade eder|yazar)${NOT_LETTER_AFTER}`, 'iu'),
  /states? that (?:the|this) (?:statement|expression)/iu,
]

function sentenceCount(text: string): number {
  return text.split(/(?<=[.!?;])\s+/u).filter((part) => wordCountOf(part) >= 3).length || 1
}

/** A rubric item that says nothing a grader can check. */
export function isEmptyRubricItem(text: string): boolean {
  return wordCountOf(text) < 2 || EMPTY_RUBRIC_PATTERNS.some((pattern) => pattern.test(text))
}

/** Rubric items without the empty ones and the ones that repeat an earlier item. */
export function cleanRubric<T extends { text: string }>(items: T[]): T[] {
  const kept: T[] = []
  for (const item of items) {
    if (isEmptyRubricItem(item.text)) continue
    const key = normalize(item.text)
    if (kept.some((other) => wordShare(normalize(other.text), key) >= 0.6 || contentOverlap(other.text, item.text) >= 0.75)) continue
    kept.push(item)
  }
  return kept
}

/** The verbs every rubric item ends with ("belirtir", "açıklar", "yazar") say nothing about what is graded. */
const RUBRIC_VERBS = new Set(['belir', 'açıkl', 'yazar', 'söyle', 'verir', 'göste', 'ifade', 'eder', 'bahse', 'dile', 'state', 'expla', 'menti', 'descr', 'says', 'write', 'ident'])

function itemTerms(text: string): Set<string> {
  const terms = new Set<string>()
  for (const word of normalize(plainText(text)).split(' ')) {
    if (word.length < 3 || STOP_WORDS.has(word)) continue
    const key = word.slice(0, 5)
    if (!RUBRIC_VERBS.has(key)) terms.add(key)
  }
  return terms
}

/** How much two rubric items share of what they ask for, 0 to 1 (shared / the smaller item). */
function contentOverlap(a: string, b: string): number {
  const first = itemTerms(a)
  const second = itemTerms(b)
  if (first.size === 0 || second.size === 0) return 0
  let shared = 0
  for (const term of first) if (second.has(term)) shared += 1
  return shared / Math.min(first.size, second.size)
}

/** What is wrong with the rubric of an open-ended question (empty = fine). */
export function rubricProblems(question: ExamQuestion): string[] {
  if (question.type !== 'open-ended') return []
  const problems: string[] = []
  const items = question.rubric
  if (items.some((item) => isEmptyRubricItem(item.text))) problems.push('empty-item')
  // An open-ended question with one gradable idea is a short question in disguise.
  if (items.length < 2) problems.push('one-item')
  for (let i = 1; i < items.length; i += 1) {
    if (items.slice(0, i).some((other) => wordShare(normalize(other.text), normalize(items[i].text)) >= 0.6 || contentOverlap(other.text, items[i].text) >= 0.75)) {
      problems.push('repeated-item')
      break
    }
  }
  // One sentence of answer cannot carry four independent gradable ideas.
  if (items.length > Math.max(2, sentenceCount(question.answer) + 1)) problems.push('too-many-items')
  if (question.bloomLevel === 1 && items.length > 3) problems.push('recall-heavy')
  return problems
}

// ---------------------------------------------------------------------------
// A7: fill-in-the-blank
// ---------------------------------------------------------------------------

const FILLER_ANSWERS = new Set(
  ['ve', 'ile', 'bir', 'bu', 'şu', 'o', 'de', 'da', 'ki', 'için', 'gibi', 'daha', 'çok', 'en', 'olan', 'olarak', 'veya', 'ise', 'her', 'the', 'a', 'an', 'of', 'to', 'in', 'is', 'are', 'and', 'or', 'it', 'that', 'this'].map((word) => word.toLocaleLowerCase('tr-TR')),
)

export function blankCount(stem: string): number {
  return (stem.match(/_{3,}/g) ?? []).length
}

/** What is wrong with a fill-in question (empty = fine). Giving the answer elsewhere in the sentence is the `blank-leak` rule. */
export function fillBlankProblems(question: ExamQuestion): string[] {
  const problems: string[] = []
  const blanks = blankCount(question.stem)
  if (blanks !== 1) problems.push(blanks === 0 ? 'no-blank' : 'many-blanks')
  const answer = normalize(question.answer)
  if (!answer || wordCountOf(question.answer) > 3) problems.push('answer-long')
  if (FILLER_ANSWERS.has(answer) || (answer.length < 3 && !/\d/.test(answer) && !question.answer.includes('$'))) problems.push('filler')
  return problems
}

// ---------------------------------------------------------------------------
// A7: true-false
// ---------------------------------------------------------------------------

const ABSOLUTE_WORDS = /(?:^|[^\p{L}])(?:her zaman|hiçbir|hiç bir|asla|daima|kesinlikle|yalnızca|yalnız|sadece|tamamen|bütün|tüm|hepsi|mutlaka|always|never|only|all|none|every|entirely|completely)(?![\p{L}])/iu

export function hasAbsoluteWord(statement: string): boolean {
  return ABSOLUTE_WORDS.test(statement)
}

/** A false statement written as a plain negation of the true one ("X değil, Y'dir", "X is not Y"): too easy to spot. */
export function isPlainNegation(statement: string): boolean {
  return /(?<![\p{L}])değil(?:dir)?[,;]/iu.test(statement) || /\b(?:is|are|was|were|does|do) not\b/i.test(statement)
}

// "X yapar ve Y eder": the part before "ve" ends in a finite verb, so two claims are joined.
const FINITE_VERB = /(?:d[ıiuü]r|t[ıiuü]r|yor|[ıiuü]yor|m[ıiuü]ş|m[ıiuü]ştır|ar|er|[ıiuü]r|d[ıiuü]|t[ıiuü]|ecek|acak|ur|ür)$/iu
const ENGLISH_VERB = /\b(?:is|are|was|were|has|have|can|does|do|contains|produces|makes)\b/iu

/** A statement that joins two independent claims with "ve" / "and". */
export function joinsTwoClaims(statement: string): boolean {
  const text = plainText(statement)
  const turkish = text.split(/\s+ve\s+/iu)
  if (turkish.length >= 2) {
    const [left, ...rest] = turkish
    const leftWords = left.trim().split(/\s+/)
    const right = rest.join(' ve ')
    const verbAtEnd = FINITE_VERB.test((leftWords[leftWords.length - 1] ?? '').replace(/[^\p{L}]/gu, ''))
    if (leftWords.length >= 3 && wordCountOf(right) >= 3 && verbAtEnd) return true
  }
  const english = text.split(/\s+and\s+/iu)
  if (english.length >= 2) {
    const [left, ...rest] = english
    if (wordCountOf(left) >= 3 && wordCountOf(rest.join(' and ')) >= 3 && ENGLISH_VERB.test(left) && ENGLISH_VERB.test(rest.join(' and '))) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// A7: multiple choice
// ---------------------------------------------------------------------------

const NEGATIVE_STEM = /(?:^|[^\p{L}])(?:değildir|değil|yanlıştır|yanlış|söylenemez|hariç|dışındadır|olmayan|bulunmaz|yoktur|except|not|incorrect|false)(?![\p{L}])/iu
const NEGATIVE_BOLD = new RegExp(NEGATIVE_STEM.source, 'giu')

export function hasNegativeStem(stem: string): boolean {
  return NEGATIVE_STEM.test(stem.replace(/\*\*/g, ''))
}

/** The negative word of a stem in bold (**değildir**), once. A stem already in bold stays as it is. */
export function boldNegative(stem: string): string {
  if (/\*\*[^*]+\*\*/.test(stem)) return stem
  let done = false
  return stem.replace(NEGATIVE_BOLD, (match) => {
    if (done) return match
    done = true
    const lead = /^[^\p{L}]/u.test(match) ? match[0] : ''
    return `${lead}**${match.slice(lead.length)}**`
  })
}

/** The opening words of a multiple-choice stem ("aşağıdakilerden hangisi", "which of the"): the pattern a stem repeats. */
export function stemPattern(stem: string): string {
  const words = normalize(plainText(stem)).split(' ').filter(Boolean)
  const count = words[0] === 'which' || words[0] === 'what' ? 3 : 2
  return words.slice(0, count).join(' ')
}

export function optionLength(option: string): number {
  return plainText(option).trim().length
}

/** Is the correct option strictly the longest one? */
export function correctIsLongest(question: ExamQuestion): boolean {
  const options = question.options ?? []
  if (options.length < 2 || question.answerIndex === undefined) return false
  const correct = optionLength(options[question.answerIndex] ?? '')
  return options.every((option, index) => index === question.answerIndex || optionLength(option) < correct)
}

const OPTION_LENGTH_RATIO = 3.5

/** Options of one kind and similar length. */
export function optionsUneven(question: ExamQuestion): boolean {
  const lengths = (question.options ?? []).map(optionLength).filter((length) => length > 0)
  if (lengths.length < 2) return false
  const longest = Math.max(...lengths)
  const shortest = Math.min(...lengths)
  return longest > 24 && longest / Math.max(1, shortest) > OPTION_LENGTH_RATIO
}

/** At most this many of `total` questions may share one property (40 %), but never fewer than 1. */
export function shareLimit(total: number, share = 0.4): number {
  return Math.max(1, Math.floor(share * total + 1e-9))
}

/** The letter limit of a multiple-choice exam: 40 % of the questions, but at least as many as the letters need. */
export function letterLimit(total: number, optionCount: number): number {
  return Math.max(Math.ceil(total / Math.max(2, optionCount)), shareLimit(total))
}

export interface McqIssueIds {
  longest: string[]
  stems: string[]
  negative: string[]
  letters: string[]
}

/** The multiple-choice questions that break an exam-wide rule: the later ones of an over-used property are reported. */
export function mcqExamIssues(all: ExamQuestion[]): McqIssueIds {
  const mcq = all.filter((question) => question.type === 'mcq' && question.options && question.answerIndex !== undefined)
  const result: McqIssueIds = { longest: [], stems: [], negative: [], letters: [] }
  const negatives = mcq.filter((question) => hasNegativeStem(question.stem))
  result.negative = negatives.slice(1).map((question) => question.id)
  if (mcq.length < 3) return result
  const limit = shareLimit(mcq.length)
  result.longest = mcq.filter(correctIsLongest).slice(limit).map((question) => question.id)
  const patterns = new Map<string, ExamQuestion[]>()
  for (const question of mcq) {
    const key = stemPattern(question.stem)
    patterns.set(key, [...(patterns.get(key) ?? []), question])
  }
  for (const group of patterns.values()) result.stems.push(...group.slice(limit).map((question) => question.id))
  const optionCount = Math.max(...mcq.map((question) => question.options?.length ?? 4))
  const perLetter = new Map<number, ExamQuestion[]>()
  for (const question of mcq) perLetter.set(question.answerIndex ?? 0, [...(perLetter.get(question.answerIndex ?? 0) ?? []), question])
  for (const group of perLetter.values()) result.letters.push(...group.slice(letterLimit(mcq.length, optionCount)).map((question) => question.id))
  return result
}

/** True-false questions that break an exam-wide rule: absolute words that mostly sit in false statements. */
export function trueFalseAbsoluteIds(all: ExamQuestion[]): string[] {
  const absolute = all.filter((question) => question.type === 'true-false' && hasAbsoluteWord(question.stem))
  const falseOnes = absolute.filter((question) => question.answerBool === false)
  const trueOnes = absolute.filter((question) => question.answerBool === true)
  return falseOnes.slice(trueOnes.length).map((question) => question.id)
}

// ---------------------------------------------------------------------------
// A7: matching
// ---------------------------------------------------------------------------

export const MATCHING_MIN_EXTRAS = 2
/** A matching question with fewer pairs is rewritten. */
export const MATCHING_MIN_PAIRS = 4

/** What is wrong with a matching question (empty = fine). */
export function matchingProblems(question: ExamQuestion): string[] {
  const problems: string[] = []
  const pairs = question.pairs ?? []
  const lefts = pairs.map((pair) => normalize(pair.left))
  const rights = [...pairs.map((pair) => normalize(pair.right)), ...(question.extras ?? []).map(normalize)]
  if (new Set(lefts).size !== pairs.length) problems.push('left-repeated')
  if (new Set(rights).size !== rights.length) problems.push('right-repeated')
  if ((question.extras?.length ?? 0) < MATCHING_MIN_EXTRAS) problems.push('extras-missing')
  if (pairs.length < MATCHING_MIN_PAIRS) problems.push('pair-count')
  return problems
}

// ---------------------------------------------------------------------------
// A7: where the correct multiple-choice option sits
// ---------------------------------------------------------------------------

/** Options that point at each other ("all of the above", "A and B") or run in a natural order (numbers) keep their order. */
export const ORDER_BOUND_OPTION = /hepsi|hiçbiri|hiç biri|yukarıdaki|yalnız|\bve\s+[a-e]\b|all of|none of|both|above/iu

export function optionsKeepOrder(options: string[]): boolean {
  if (options.some((option) => ORDER_BOUND_OPTION.test(option))) return true
  const numbers = options.map((option) => Number(plainText(option).replace(',', '.').replace(/[^\d.\-−]/g, '').replace('−', '-')))
  const allNumeric = options.every((option) => /^[\s\d.,\-−+%°$]*[\d][\s\d.,\-−+%°\p{L}/²³]*$/u.test(plainText(option)) && plainText(option).length <= 12)
  if (!allNumeric || numbers.some((value) => !Number.isFinite(value))) return false
  const ascending = numbers.every((value, index) => index === 0 || value >= numbers[index - 1])
  const descending = numbers.every((value, index) => index === 0 || value <= numbers[index - 1])
  return ascending || descending
}
