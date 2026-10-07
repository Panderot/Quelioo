import { normalizeAnswer, turkishBaseForms } from './answerCheck.js'
import type { QuizQuestion } from './quiz.js'
import type { CoverageFact } from './factCoverage.js'

/**
 * Deterministic, type-aware quality checks for a generated quiz (no model call) plus the pure parts
 * of the facts plan (slot types, fact assignment, batching). The server runs these before and after
 * the cheap-model review in api/_lib/quiz-quality.ts; every issue names the ONE question to rewrite.
 */

export type QualityLanguage = 'tr' | 'en' | 'other'

type QualityIssueCode =
  | 'leak'
  | 'duplicate_stem'
  | 'duplicate_answer'
  | 'answer_in_stem'
  | 'blank_missing'
  | 'blank_count'
  | 'blank_no_accepted'
  | 'blank_stop_word'
  | 'mcq_option_count'
  | 'mcq_duplicate_option'
  | 'mcq_option_contains'
  | 'mcq_long_correct'
  | 'mcq_all_of_above'
  | 'mcq_longest_pattern'
  | 'negative_stem_easy'
  | 'tf_balance'
  | 'tf_giveaway'
  | 'tf_plain_negation'
  | 'matching_duplicate'
  | 'matching_giveaway'
  | 'yes_no_answer'
  | 'keypoints_few'
  | 'keypoints_overlap'

export interface QualityIssue {
  questionId: string
  code: QualityIssueCode
  /** Short English reason, sent to the rewrite call as DATA. */
  reason: string
  /** tf_balance only: the truth value the rewritten statement must have. */
  wantBool?: boolean
}

const STOP_WORDS: Record<QualityLanguage, ReadonlySet<string>> = {
  en: new Set(
    'a an the of to in on at by for with from as and or but is are was were be been being it its this that these those which what who whom whose how why when where not no yes do does did can could will would should may might than then there their they them he she his her we our you your i me my all any each some most more less very also into onto about over under between during after before'.split(
      ' ',
    ),
  ),
  // Already normalized (no diacritics, ı→i).
  tr: new Set(
    've veya ya da de ki ile bir bu o icin gibi daha en cok az her hangi hangisi ne nedir neden nasil niye olan olarak olur olmaz ise mi mu degil degildir var yok kadar sonra once ama fakat ancak tum butun bazi baska diger ayni kendi'.split(
      ' ',
    ),
  ),
  other: new Set(['եւ', 'ու', 'մը', 'է', 'են', 'կը', 'ի', 'որ', 'ինչ', 'այս', 'այդ', 'ալ', 'չէ']),
}

const ENGLISH_SUFFIX = /^(s|es|'s|ed|d|ing|er|ers|al|ly)?$/

/** Lowercased, diacritic-free words of `text` (Turkish-aware, see normalizeAnswer). */
export function wordsOf(text: string): string[] {
  return normalizeAnswer(text)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

export function contentWordsOf(text: string, language: QualityLanguage): string[] {
  const stop = STOP_WORDS[language]
  return wordsOf(text).filter((word) => !stop.has(word) && !STOP_WORDS.en.has(word) && (word.length >= 3 || /^\d{2,}$/.test(word)))
}

/** Picks the language rules for a quiz from its output language, or from its text when auto. */
export function qualityLanguageFor(outputLanguage: string, sampleText: string): QualityLanguage {
  if (outputLanguage === 'tr') return 'tr'
  if (outputLanguage === 'en') return 'en'
  if (outputLanguage !== 'auto') return 'other'
  if (/[çğışöüİ]/i.test(sampleText) || /\b(ve|bir|nedir|hangi|olarak)\b/i.test(sampleText)) return 'tr'
  if (/\b(the|and|which|what|of)\b/i.test(sampleText)) return 'en'
  return 'other'
}

const SOFTENED: Record<string, string> = { k: 'g', p: 'b', t: 'd', c: 'c' }

/** True when `word` is `term` or an inflected form of it under the language's rules. */
export function wordMatchesTerm(word: string, term: string, language: QualityLanguage): boolean {
  if (word === term) return true
  if (term.length < 3) return false
  if (language === 'tr') {
    const softened = SOFTENED[term.slice(-1)] ? term.slice(0, -1) + SOFTENED[term.slice(-1)] : term
    for (const variant of [term, softened]) {
      if (word.startsWith(variant) && word.length - variant.length <= 8 && (variant !== softened || word.length > variant.length)) return true
    }
    return turkishBaseForms(word).includes(term)
  }
  if (word.startsWith(term)) {
    const rest = word.slice(term.length)
    if (language === 'en' ? ENGLISH_SUFFIX.test(rest) : rest.length <= 3) return true
  }
  // Irregular singular/plural pairs (mitochondrion/mitochondria, nucleus/nuclei): a long shared stem.
  let shared = 0
  while (shared < word.length && shared < term.length && word[shared] === term[shared]) shared += 1
  return shared >= 6 && shared >= Math.min(word.length, term.length) - 2 && Math.abs(word.length - term.length) <= 2
}

/** True when every content word of `phrase` appears (in some inflected form) among `words`. */
function phraseAppearsIn(phraseWords: string[], words: string[], language: QualityLanguage): boolean {
  return phraseWords.length > 0 && phraseWords.every((term) => words.some((word) => wordMatchesTerm(word, term, language)))
}

const MAX_ANSWER_TERM_WORDS = 4

/** The short answer forms of a question whose appearance elsewhere would give the answer away, each
 * as its content words (Turkish answers also as their base form). Empty for true/false, matching and
 * open-ended, and for long sentence answers. */
function answerTerms(question: QuizQuestion, language: QualityLanguage): string[][] {
  let forms: string[] = []
  if (question.type === 'fill-blanks' || question.type === 'short-answer') forms = [question.answer, ...(question.acceptableAnswers ?? [])]
  else if (question.type === 'mcq') forms = [question.options[question.answerIndex] ?? '']
  const terms: string[][] = []
  for (const form of forms) {
    // A one-word answer always counts, even a short one ("su"); short terms only match exactly.
    const all = wordsOf(form)
    const words = all.length === 1 && !STOP_WORDS[language].has(all[0]) ? all : contentWordsOf(form, language)
    if (words.length === 0 || words.length > MAX_ANSWER_TERM_WORDS) continue
    if (language === 'tr') {
      const last = words[words.length - 1]
      const bases = turkishBaseForms(last)
      const shortest = bases.length > 0 ? bases[bases.length - 1] : last
      terms.push([...words.slice(0, -1), shortest])
    } else {
      terms.push(words)
    }
  }
  const seen = new Set<string>()
  return terms.filter((term) => {
    const key = term.join(' ')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Everything a student sees for a question besides its options: the stem, and matching pairs. */
function visibleText(question: QuizQuestion): string {
  if (question.type === 'matching') return [question.question, ...question.pairs.flatMap((pair) => [pair.left, pair.right])].join(' ')
  return question.question
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a)
  const setB = new Set(b)
  if (setA.size === 0 || setB.size === 0) return 0
  let shared = 0
  for (const word of setA) if (setB.has(word)) shared += 1
  return shared / (setA.size + setB.size - shared)
}

const NEAR_DUPLICATE_STEM = 0.75
const SAME_FACT = 0.5

/** The correct answer as text (true/false statements have none beyond the stem). */
function answerSummaryText(question: QuizQuestion): string {
  switch (question.type) {
    case 'mcq':
      return question.options[question.answerIndex] ?? ''
    case 'fill-blanks':
    case 'short-answer':
    case 'open-ended':
      return question.answer
    default:
      return ''
  }
}
const KEYPOINT_OVERLAP = 0.6

/** Leakage: a question whose short answer appears (in any inflected form) in another question's text. */
export function findLeaks(questions: QuizQuestion[], language: QualityLanguage): QualityIssue[] {
  const issues: QualityIssue[] = []
  const texts = questions.map((question) => wordsOf(visibleText(question)))
  questions.forEach((question, index) => {
    const terms = answerTerms(question, language)
    const leakedInto = questions.filter((_, other) => other !== index && terms.some((term) => phraseAppearsIn(term, texts[other], language)))
    if (leakedInto.length > 0) {
      issues.push({
        questionId: question.id,
        code: 'leak',
        reason: `Its answer also appears in the text of ${leakedInto.length} other question(s); ask about a different fact or concept whose answer is not written anywhere else in the quiz.`,
      })
    }
  })
  return issues
}

/** Answer key used to spot two questions with the same answer (normalized; Turkish base form). */
function answerKey(question: QuizQuestion, language: QualityLanguage): string | null {
  const [first] = answerTerms(question, language)
  return first ? first.join(' ') : null
}

/** True when both questions test the same list fact, each through different items. */
function areListSiblings(a: QuizQuestion, b: QuizQuestion): boolean {
  if (!a.factItems || !b.factItems) return false
  return Object.entries(a.factItems).some(([id, items]) => {
    const other = b.factItems?.[id]
    return Boolean(other) && items.length > 0 && other!.length > 0 && !items.some((item) => other!.includes(item))
  })
}

/** True when both questions claim facts from a facts plan and test nothing in common. */
function testDifferentFacts(a: QuizQuestion, b: QuizQuestion): boolean {
  if (!a.factIds?.length || !b.factIds?.length) return false
  return a.factIds.every((id) => !b.factIds!.includes(id) || areListSiblings(a, b))
}

/** Near-duplicate stems and repeated answers — the later question of each pair is flagged. */
export function findDuplicates(questions: QuizQuestion[], language: QualityLanguage): QualityIssue[] {
  const issues: QualityIssue[] = []
  const stems = questions.map((question) => contentWordsOf(question.question, language))
  const keys = questions.map((question) => answerKey(question, language))
  // Stem + answer together: two wordings of the same fact with a long (sentence) answer.
  const facts = questions.map((question, index) =>
    question.type === 'matching' ? [] : [...stems[index], ...contentWordsOf(answerSummaryText(question), language)],
  )
  // Matching: a pair repeated (same left or same left+right meaning) in an earlier matching question.
  const pairWords = questions.map((question) =>
    question.type === 'matching' ? question.pairs.map((pair) => ({ left: normalizeAnswer(pair.left), words: contentWordsOf(`${pair.left} ${pair.right}`, language) })) : [],
  )
  questions.forEach((question, index) => {
    for (let earlier = 0; earlier < index; earlier++) {
      // Two questions on different items of one list fact are deliberate, not a repeat (their
      // answers still must differ, see below).
      const listSiblings = areListSiblings(question, questions[earlier])
      const repeatedPair = pairWords[index].some((pair) =>
        pairWords[earlier].some((other) => pair.left === other.left || (pair.words.length >= 3 && jaccard(pair.words, other.words) >= SAME_FACT)),
      )
      if (repeatedPair) {
        issues.push({ questionId: question.id, code: 'duplicate_answer', reason: 'A matching pair repeats a pair of another matching question; use different facts.' })
        return
      }
      const same = normalizeAnswer(question.question) === normalizeAnswer(questions[earlier].question)
      const sameFact = facts[index].length >= 6 && facts[earlier].length >= 6 && jaccard(facts[index], facts[earlier]) >= SAME_FACT
      if (same || (!listSiblings && (sameFact || (stems[index].length >= 3 && jaccard(stems[index], stems[earlier]) >= NEAR_DUPLICATE_STEM)))) {
        issues.push({ questionId: question.id, code: 'duplicate_stem', reason: 'It is a near-duplicate of another question; test a different fact.' })
        return
      }
      const key = keys[index]
      const earlierKey = keys[earlier]
      // Two planned questions on different facts may share a word ("light" / "light intensity"); only
      // the same answer is a repeat then. Otherwise one answer inside the other counts as the same.
      const containment = !testDifferentFacts(question, questions[earlier])
      if (
        key &&
        earlierKey &&
        (key === earlierKey ||
          (containment && (phraseAppearsIn(key.split(' '), earlierKey.split(' '), language) || phraseAppearsIn(earlierKey.split(' '), key.split(' '), language))))
      ) {
        issues.push({ questionId: question.id, code: 'duplicate_answer', reason: 'It has the same answer as another question (a hidden repeat); test a different fact.' })
        return
      }
    }
  })
  return issues
}

const BLANK_PATTERN = /_{2,}|\.{4,}|…{2,}|\[\s*\]/g
const ALL_OF_ABOVE = /\b(all|none|both|neither) of (the )?(above|these|them)\b|hepsi|hicbiri|yukaridakiler|ikisi de|բոլորը|ոչ մէկը/
const NEGATIVE_STEM = /\b(not|except|false|incorrect)\b|degildir|yanlistir|haric|disinda|olamaz|չէ|սխալ/
const ABSOLUTE_WORDS = /\b(always|never|only|all|none|every)\b|her zaman|asla|hicbir|sadece|yalnizca|daima|tum |butun|միշտ|երբեք|միայն/
const PLAIN_NEGATION = /\b(not|n't|cannot|no longer)\b|\bdegil(dir)?\b|\byoktur\b/
const YES_NO = new Set(['yes', 'no', 'evet', 'hayir', 'այո', 'ոչ'])

export interface QualityCheckOptions {
  language: QualityLanguage
  difficulty: string
  /** Required mcq option count ("2".."5") when the quiz has mcq questions. */
  optionsCount?: string
}

function perQuestionIssues(question: QuizQuestion, options: QualityCheckOptions): QualityIssue[] {
  const { language } = options
  const issues: QualityIssue[] = []
  const add = (code: QualityIssueCode, reason: string) => issues.push({ questionId: question.id, code, reason })
  const stemWords = wordsOf(question.question)
  const normalizedStem = normalizeAnswer(question.question)

  if (options.difficulty === 'easy' && question.type !== 'true-false' && NEGATIVE_STEM.test(normalizedStem)) {
    add('negative_stem_easy', 'Negative stems ("which is NOT") are not used on easy; ask directly.')
  }

  switch (question.type) {
    case 'fill-blanks': {
      const blanks = question.question.match(BLANK_PATTERN)?.length ?? 0
      if (blanks === 0) add('blank_missing', 'The sentence has no blank (write exactly one "___").')
      if (blanks > 1) add('blank_count', 'The sentence has more than one blank; use exactly one.')
      if (!question.acceptableAnswers || question.acceptableAnswers.length === 0) add('blank_no_accepted', 'acceptableAnswers is empty; list the base form, fitting inflected forms and true synonyms.')
      const answerWords = wordsOf(question.answer)
      if (answerWords.length === 0 || answerWords.every((word) => STOP_WORDS[language].has(word) || (language === 'en' && STOP_WORDS.en.has(word)))) {
        add('blank_stop_word', 'The blank is on a filler or function word; blank a key concept instead.')
      }
      if (answerTerms(question, language).some((term) => phraseAppearsIn(term, stemWords, language))) {
        add('answer_in_stem', 'The answer (or a form of it) is written in the sentence itself.')
      }
      break
    }
    case 'short-answer': {
      if (YES_NO.has(normalizeAnswer(question.answer))) add('yes_no_answer', 'It can be answered with yes or no; ask for an explanation or a term.')
      if (answerTerms(question, language).some((term) => phraseAppearsIn(term, stemWords, language))) {
        add('answer_in_stem', 'The answer (or a form of it) is written in the question itself.')
      }
      break
    }
    case 'mcq': {
      const required = options.optionsCount ? Number.parseInt(options.optionsCount, 10) : undefined
      if (required && question.options.length !== required) add('mcq_option_count', `It must have exactly ${required} options.`)
      const normalized = question.options.map((option) => normalizeAnswer(option))
      if (new Set(normalized).size !== normalized.length || normalized.some((option) => !option)) {
        add('mcq_duplicate_option', 'Two options are the same (or one is empty).')
      } else {
        const optionWords = question.options.map(wordsOf)
        const contains = optionWords.some((words, i) =>
          optionWords.some((other, j) => i !== j && words.length > 0 && words.length < other.length && ` ${other.join(' ')} `.includes(` ${words.join(' ')} `)),
        )
        if (contains) add('mcq_option_contains', 'One option is contained in another option.')
      }
      if (question.options.some((option) => ALL_OF_ABOVE.test(normalizeAnswer(option)))) add('mcq_all_of_above', 'Do not use "all/none of the above" style options.')
      const correct = question.options[question.answerIndex] ?? ''
      const longestOther = Math.max(0, ...question.options.filter((_, index) => index !== question.answerIndex).map((option) => option.length))
      if (correct.length > longestOther * 1.5 && correct.length - longestOther >= 12) {
        add('mcq_long_correct', 'The correct option is much longer than the others; make options similar in length and detail.')
      }
      break
    }
    case 'true-false': {
      if (!question.answerBool && ABSOLUTE_WORDS.test(` ${normalizedStem} `)) {
        add('tf_giveaway', 'A false statement uses an absolute word (always/never/only) that gives it away; change one key fact instead.')
      }
      if (!question.answerBool && PLAIN_NEGATION.test(normalizedStem)) {
        add('tf_plain_negation', 'The false statement is a plain negation ("not"); make it a realistic misconception by changing one key fact.')
      }
      break
    }
    case 'matching': {
      const lefts = question.pairs.map((pair) => normalizeAnswer(pair.left))
      const rights = question.pairs.map((pair) => normalizeAnswer(pair.right))
      if (new Set(lefts).size !== lefts.length || new Set(rights).size !== rights.length) add('matching_duplicate', 'Two left or two right items are the same; every item must match exactly one partner.')
      const giveaway = question.pairs.some((pair) => {
        const left = contentWordsOf(pair.left, language).filter((word) => word.length >= 4)
        const right = wordsOf(pair.right)
        return left.some((term) => right.some((word) => wordMatchesTerm(word, term, language)))
      })
      // A left item written inside another pair's right item also gives a match away.
      const crossGiveaway = question.pairs.some((pair, i) => {
        const left = contentWordsOf(pair.left, language).filter((word) => word.length >= 4)
        return left.length > 0 && question.pairs.some((other, j) => i !== j && phraseAppearsIn(left, wordsOf(other.right), language))
      })
      if (giveaway || crossGiveaway) add('matching_giveaway', 'A left item shares a word with a right item (its own or another), which gives a match away.')
      break
    }
    case 'open-ended': {
      if ((question.keyPoints ?? []).length < 3) add('keypoints_few', 'It needs 3-5 specific, checkable keyPoints.')
      break
    }
  }
  return issues
}

/** True/false balance: 40-60 % true for 4+ statements, both values for 2-3. Flags just enough of the
 * majority to fix it, asking for the opposite truth value. */
export function findTrueFalseImbalance(questions: QuizQuestion[]): QualityIssue[] {
  const statements = questions.filter((question) => question.type === 'true-false')
  const count = statements.length
  if (count < 2) return []
  const trues = statements.filter((question) => question.answerBool)
  const falses = statements.filter((question) => !question.answerBool)
  const minEach = count >= 4 ? Math.ceil(count * 0.4) : 1
  const [minority, majority, wantBool] = trues.length < falses.length ? [trues, falses, true] : [falses, trues, false]
  const needed = Math.max(0, minEach - minority.length)
  return (needed === 0 ? [] : majority.slice(-needed)).map((question) => ({
    questionId: question.id,
    code: 'tf_balance' as const,
    reason: `The quiz has too many ${wantBool ? 'false' : 'true'} statements; rewrite this one as a ${wantBool ? 'TRUE' : 'FALSE'} statement about a different fact.`,
    wantBool,
  }))
}

/** Correct option systematically the longest (4+ mcq, more than 75 %): flags enough to break it. */
function findLongestPattern(questions: QuizQuestion[]): QualityIssue[] {
  const mcqs = questions.filter((question) => question.type === 'mcq')
  if (mcqs.length < 4) return []
  const longest = mcqs.filter((question) => {
    const correct = question.options[question.answerIndex]?.length ?? 0
    return question.options.every((option, index) => index === question.answerIndex || option.length < correct)
  })
  if (longest.length / mcqs.length <= 0.75) return []
  const excess = longest.length - Math.floor(mcqs.length / 2)
  return longest.slice(0, excess).map((question) => ({
    questionId: question.id,
    code: 'mcq_longest_pattern' as const,
    reason: 'The correct option is the longest one in most questions; make a distractor as long and detailed as the correct option.',
  }))
}

function findKeyPointOverlap(questions: QuizQuestion[], language: QualityLanguage): QualityIssue[] {
  const issues: QualityIssue[] = []
  const openEnded = questions.filter((question) => question.type === 'open-ended')
  openEnded.forEach((question, index) => {
    const points = (question.keyPoints ?? []).map((point) => contentWordsOf(point, language))
    const overlaps = openEnded.slice(0, index).some((earlier) =>
      (earlier.keyPoints ?? []).some((point) => {
        const words = contentWordsOf(point, language)
        return points.some((mine) => mine.length >= 2 && jaccard(mine, words) >= KEYPOINT_OVERLAP)
      }),
    )
    if (overlaps) issues.push({ questionId: question.id, code: 'keypoints_overlap', reason: 'Its keyPoints repeat another open-ended question; cover a different part of the source.' })
  })
  return issues
}

/** All deterministic checks for a quiz; at most one issue per question per code. */
export function checkQuizQuality(questions: QuizQuestion[], options: QualityCheckOptions): QualityIssue[] {
  const all = [
    ...findLeaks(questions, options.language),
    ...findDuplicates(questions, options.language),
    ...questions.flatMap((question) => perQuestionIssues(question, options)),
    ...findTrueFalseImbalance(questions),
    ...findLongestPattern(questions),
    ...findKeyPointOverlap(questions, options.language),
  ]
  const seen = new Set<string>()
  return all.filter((issue) => {
    const key = `${issue.questionId}|${issue.code}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Issues the server fixes in place without a model call (the rest need a rewrite). */
export function applyDeterministicFixes(question: QuizQuestion): QuizQuestion {
  if (question.type === 'fill-blanks' && (!question.acceptableAnswers || question.acceptableAnswers.length === 0)) {
    return { ...question, acceptableAnswers: [question.answer] }
  }
  return question
}

// ---------------------------------------------------------------------------------------------
// Facts plan (pure parts)
// ---------------------------------------------------------------------------------------------

export type { PlannedFact, QuestionSlot } from './factCoverage.js'

/** Marks facts that a question the student already saw (avoid list) asks: at least half of the fact's
 * content words (two or more) appear in one earlier stem. Deterministic, so a cached plan works with
 * any avoid list. */
export function markUsedBefore<T extends CoverageFact>(facts: T[], previousStems: string[], language: QualityLanguage): (T & { usedBefore: boolean })[] {
  const stems = previousStems.map((stem) => wordsOf(stem))
  return facts.map((fact) => {
    const words = [...new Set(contentWordsOf(fact.statement, language))]
    const usedBefore =
      words.length >= 2 &&
      stems.some((stem) => {
        const shared = words.filter((term) => stem.some((word) => wordMatchesTerm(word, term, language))).length
        return shared >= 2 && shared / words.length >= 0.5
      })
    return { ...fact, usedBefore }
  })
}

const MAX_BATCH_SIZE = 10

/** Splits a total into near-equal batches of at most MAX_BATCH_SIZE. */
export function planBatches(totalCount: number, maxBatch = MAX_BATCH_SIZE): number[] {
  if (totalCount <= maxBatch) return [totalCount]
  const batchCount = Math.ceil(totalCount / maxBatch)
  const base = Math.floor(totalCount / batchCount)
  const remainder = totalCount % batchCount
  return Array.from({ length: batchCount }, (_, index) => base + (index < remainder ? 1 : 0))
}

/** Splits slots into consecutive batches sized by planBatches. */
export function batchSlots<T>(slots: T[], maxBatch = MAX_BATCH_SIZE): T[][] {
  const sizes = planBatches(slots.length, maxBatch)
  const batches: T[][] = []
  let start = 0
  for (const size of sizes) {
    batches.push(slots.slice(start, start + size))
    start += size
  }
  return batches.filter((batch) => batch.length > 0)
}

/** Issues of ONE question against the rest of its quiz (regenerate-one and quality-pass rewrites):
 * its own type checks, its answer leaking into the others, another answer leaking into it, and a
 * repeated stem or answer. Quiz-level balance checks are left out. */
export function checkAgainstOthers(target: QuizQuestion, others: QuizQuestion[], options: QualityCheckOptions): QualityIssue[] {
  const issues = checkQuizQuality([...others, target], options).filter(
    (issue) => issue.questionId === target.id && issue.code !== 'tf_balance' && issue.code !== 'mcq_longest_pattern',
  )
  const targetWords = wordsOf(visibleText(target))
  const leakedIn = others.some((other) => answerTerms(other, options.language).some((term) => phraseAppearsIn(term, targetWords, options.language)))
  if (leakedIn && !issues.some((issue) => issue.code === 'leak')) {
    issues.push({ questionId: target.id, code: 'leak', reason: 'It contains the answer of another question in the quiz; word it without that term or test a different fact.' })
  }
  return issues
}
