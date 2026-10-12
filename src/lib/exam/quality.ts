import { EXAM_QUESTION_TYPES, EXAM_TOTAL_POINTS } from './types.js'
import type { ExamQuestion, ExamQuestionType } from './types.js'
import { answerLeaks, fillBlankProblems, isPlainNegation, optionsUneven, joinsTwoClaims, matchingProblems, mcqExamIssues, rubricProblems, shortAnswerProblems, trueFalseAbsoluteIds } from './contentRules.js'
import { normalize, overlap, shareOfUnion, stems, wordShare } from './text.js'

/** One whole-exam check, used by the server (api/_lib/exam.ts) and by the generator that stitches sections together.
 * Every rule returns the questions that break it; the later question of a pair is the one reported. */

export type ExamQualityRule =
  | 'count'
  | 'duplicate'
  | 'same-answer'
  | 'true-false-balance'
  | 'reference'
  | 'scenario'
  | 'blank-leak'
  | 'term-repeat'
  | 'concept-cap'
  | 'key-check'
  | 'points'
  /** A1: the scenario or stem gives the answer away. */
  | 'answer-leak'
  /** A3: a short-answer question that is not short. */
  | 'short-answer'
  /** A7: fill-in and matching shape. */
  | 'fill-blank'
  | 'matching'
  /** A5: a rubric that says nothing a grader can check. */
  | 'rubric'
  /** A7: multiple choice, true-false and bloom polish that rewrite once but never leave an exam short. */
  | 'tf-claims'
  | 'tf-absolute'
  | 'mcq-options'
  | 'mcq-longest'
  | 'mcq-stems'
  | 'mcq-negative'
  | 'mcq-balance'
  | 'bloom'

/** Rules that trigger a rewrite but never stop an exam from being saved: a source that really is about one thing, and polish rules that a question may still break after the rewrite rounds. */
export const SOFT_RULES: ExamQualityRule[] = ['term-repeat', 'rubric', 'tf-claims', 'tf-absolute', 'mcq-options', 'mcq-longest', 'mcq-stems', 'mcq-negative', 'mcq-balance', 'bloom']

/** Soft rules that are never worth a rewrite (the plan gives every question its own fact, so a repeated word is a topic). */
export const IGNORED_RULES: ExamQualityRule[] = ['points', 'term-repeat']

export interface ExamQualityIssue {
  rule: ExamQualityRule
  /** Question that must be rewritten; null for exam-wide issues (count, points). */
  id: string | null
  /** For `count`: the type that is short. */
  type?: ExamQuestionType
  /** For `duplicate`: the earlier question it repeats and why (diagnostics). */
  with?: { id: string; how: string }
}

export const TRUE_FALSE_MIN_SHARE = 0.4
export const TRUE_FALSE_MAX_SHARE = 0.6
const STEM_OVERLAP = 0.75
const STEM_UNION_SHARE = 0.5
const RETOLD_SHARE = 0.7
const CONTEXT_OVERLAP = 0.85
const MATCHING_OVERLAP = 0.5
const MIN_ANSWER_CHARS = 4

/** The scenario and the stem both open with the same capitalised first word (a person's name): the stem retells the scenario. */
function opensWithSamePerson(question: ExamQuestion): boolean {
  const first = (text: string) => (/^\s*(\p{Lu}[\p{L}]{2,})/u.exec(text.replace(/^[(\[“"']+/u, ''))?.[1] ?? '').toLocaleLowerCase('tr-TR')
  const name = first(question.context ?? '')
  return name !== '' && name === first(question.stem)
}

function optionsUnevenFor(question: ExamQuestion): boolean {
  return optionsUneven(question)
}

function stemSignature(question: ExamQuestion): Set<string> {
  if (question.type === 'matching') return stems((question.pairs ?? []).map((pair) => pair.left).join(' '))
  return stems(question.stem.replace(/___/g, ' '), 4)
}

/** `yes`: the same question twice. `maybe`: close enough that a judge has to say. `no`: different. */
export type PairTier = 'yes' | 'maybe' | 'no'

const FACT_SAME = 0.75
const FACT_CLOSE = 0.25
const STEM_SAME = 0.9
const STEM_SAME_UNION = 0.7

function factWords(question: ExamQuestion): Set<string> {
  return stems(question.fact ?? '', 4)
}

function numbersIn(text: string): Set<string> {
  return new Set([...text.replace(/−/g, '-').matchAll(/-?\d+(?:[.,]\d+)?/g)].map((match) => match[0].replace(',', '.')))
}

/** Both facts work with numbers and share at most half of them. */
function factNumbersDiffer(a: string, b: string): boolean {
  const first = numbersIn(a)
  const second = numbersIn(b)
  if (first.size === 0 || second.size === 0) return false
  const shared = [...first].filter((value) => second.has(value)).length
  return shared / Math.min(first.size, second.size) <= 0.5
}

/** Do two questions test the same fact? Facts decide when both questions carry one; stems decide otherwise. */
function pairTier(a: ExamQuestion, b: ExamQuestion): PairTier {
  const wordsA = stemSignature(a)
  const wordsB = stemSignature(b)
  let stemTier: PairTier = 'no'
  if (a.type === 'matching' && b.type === 'matching') {
    if (overlap(wordsA, wordsB) >= MATCHING_OVERLAP) stemTier = 'yes'
  } else if (a.type !== 'matching' && b.type !== 'matching') {
    if (wordsA.size < 3 || wordsB.size < 3) {
      if (normalize(a.stem) === normalize(b.stem)) stemTier = 'yes'
    } else {
      // A short statement inside a long question shares all its words without asking the same thing: both directions must agree.
      const shared = overlap(wordsA, wordsB)
      const union = shareOfUnion(wordsA, wordsB)
      if (shared >= STEM_SAME && union >= STEM_SAME_UNION) stemTier = 'yes'
      else if (shared >= STEM_OVERLAP && union >= STEM_UNION_SHARE) stemTier = 'maybe'
    }
  }
  if (!a.fact || !b.fact) return stemTier
  if (normalize(a.fact) === normalize(b.fact)) return 'yes'
  const factShare = shareOfUnion(factWords(a), factWords(b))
  // The same skill on other numbers shares nearly every word: the numbers tell the two facts apart, and a judge decides.
  if (factShare >= FACT_SAME) return factNumbersDiffer(a.fact, b.fact) ? 'maybe' : 'yes'
  if (factShare >= FACT_CLOSE) return 'maybe'
  // The plan gave the two questions different facts: only near-identical wording still counts.
  return stemTier === 'yes' ? 'maybe' : 'no'
}

/** At most this many questions on one concept (one skill, applied to different numbers): and only when they differ in type or difficulty. */
export const MAX_QUESTIONS_PER_CONCEPT = 2

export function conceptKey(concept: string | undefined): string {
  return concept ? normalize(concept) : ''
}

/** How many different questions a plan can carry: every concept counts at most twice, a fact without a concept is its own concept. */
export function conceptCapacity(facts: { concept?: string }[]): number {
  const perConcept = new Map<string, number>()
  let alone = 0
  for (const entry of facts) {
    const key = conceptKey(entry.concept)
    if (key) perConcept.set(key, (perConcept.get(key) ?? 0) + 1)
    else alone += 1
  }
  let total = alone
  for (const count of perConcept.values()) total += Math.min(MAX_QUESTIONS_PER_CONCEPT, count)
  return total
}

/** How alike two fact sentences are, 0 to 1 (shared key words / all key words). */
export function factSimilarity(a: string, b: string): number {
  return shareOfUnion(stems(a, 4), stems(b, 4))
}

/** Stable key of a pair for the judge's verdicts (order of the two ids does not matter). */
export function pairKey(a: ExamQuestion, b: ExamQuestion): string {
  return a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
}

/** Pairs of questions a judge has to look at, the likeliest first. */
export function uncertainPairs(questions: ExamQuestion[]): { first: ExamQuestion; second: ExamQuestion; key: string }[] {
  const pairs: { first: ExamQuestion; second: ExamQuestion; key: string; weight: number }[] = []
  for (let index = 1; index < questions.length; index += 1) {
    for (let earlier = 0; earlier < index; earlier += 1) {
      const first = questions[earlier]
      const second = questions[index]
      if (pairTier(first, second) !== 'maybe') continue
      pairs.push({ first, second, key: pairKey(first, second), weight: shareOfUnion(factWords(first), factWords(second)) + shareOfUnion(stemSignature(first), stemSignature(second)) })
    }
  }
  return pairs.sort((x, y) => y.weight - x.weight).map(({ first, second, key }) => ({ first, second, key }))
}

/** Numbers and formulas a question works with: two questions on the same numbers ask for the same thing. */
function mathTokens(question: ExamQuestion): Set<string> {
  const text = `${question.context ?? ''} ${question.stem}`
  const tokens = new Set<string>()
  for (const match of text.matchAll(/-?\d+(?:[.,]\d+)?/g)) tokens.add(match[0].replace(',', '.'))
  return tokens
}

const MATH_FACT_OVERLAP = 0.9
const MATH_FACT_WORDS = 0.5

/** The same numbers and mostly the same words (in a scenario or a stem): the same worked fact in another type. */
function isSameMathFact(a: ExamQuestion, b: ExamQuestion, tokens: Set<string>[], index: number, earlier: number): boolean {
  if (a.type === 'matching' || b.type === 'matching') return false
  const shared = [...tokens[index]].filter((token) => tokens[earlier].has(token)).length
  if (shared < 2 || shared / Math.min(tokens[index].size, tokens[earlier].size) < MATH_FACT_OVERLAP) return false
  return overlap(stems(`${b.context ?? ''} ${b.stem}`, 4), stems(`${a.context ?? ''} ${a.stem}`, 4)) >= MATH_FACT_WORDS
}

/** The correct answer as text (for a multiple-choice question the right option). */
export function correctAnswerText(question: ExamQuestion): string {
  return question.type === 'mcq' && question.options && question.answerIndex !== undefined ? (question.options[question.answerIndex] ?? question.answer) : question.answer
}

/** The answer a question gives away, in a comparable form; empty when it is too short to compare (numbers, "D"). */
export function answerKey(question: ExamQuestion): string {
  if (question.type === 'true-false' || question.type === 'matching') return ''
  const key = normalize(correctAnswerText(question))
  return key.length >= MIN_ANSWER_CHARS ? key : ''
}

/** How many true statements an exam with `total` true-false questions may hold (inclusive): 40-60 %, never all true. */
export function trueFalseRange(total: number): [number, number] {
  if (total <= 0) return [0, 0]
  if (total < 3) return [0, total - 1]
  const min = Math.ceil(TRUE_FALSE_MIN_SHARE * total - 1e-9)
  const max = Math.floor(TRUE_FALSE_MAX_SHARE * total + 1e-9)
  // A total like 3 has no whole number inside 40-60 %: the two answers nearest the middle are fine.
  return min > max ? [Math.floor(total / 2), Math.ceil(total / 2)] : [min, max]
}

// "this model / according to the table / the text above": only works when that thing is printed in the question itself.
const TR_THING = 'model|şekil|tablo|grafik|diyagram|harita|resim|görsel|şema|metin|parça|paragraf|pasaj'
const REFERENCE_PATTERNS: RegExp[] = [
  // "Verilen tarih ve süreleri kullanarak ..." / "using the given dates": the data must be printed in the question.
  /(?:^|[^\p{L}])verilen\s+([\p{L}]+)/iu,
  /(?:^|[^\p{L}])(bilgilere)\s+göre/iu,
  /(?:^|[^\p{L}])((?:aşağıdaki|yukarıdaki)\s+gibi)/iu,
  /\b(as (?:shown|given) (?:below|above))/i,
  /\bthe given\s+(\w+)/i,
  /(haritada|grafikte|tabloda|diyagramda|şemada|resimde|görselde)(?![\p{L}])/iu,
  new RegExp(`(?:bu|şu|yukarıdaki|aşağıdaki|verilen)\\s+((?:${TR_THING})[\\p{L}]*)`, 'iu'),
  /(şekle|tabloya|grafiğe|diyagrama|haritaya|resme|görsele|şemaya|metne|parçaya|paragrafa|pasaja)\s+göre/iu,
  /(?:according to|based on)\s+the\s+(text|passage|paragraph|table|figure|graph|chart|diagram|model|map|picture|image)\b/iu,
  /the\s+(text|passage|paragraph|table|figure|graph|chart|diagram|model|map|picture|image)\s+(?:above|below)\b/iu,
]
const TEXT_THING = /^(?:metin|metn|parça|paragraf|pasaj|text|passage|paragraph)/iu

const MIN_REFERENCE_CONTEXT = 40

/** "Calculate the density" with no number anywhere in the question cannot be answered on paper. */
const CALCULATION_VERB = /\b(?:calculate|compute|hesaplay[ıi]n[ıi]z|hesaplay[ıi]n|hesapla)\b/iu

function hasBrokenReference(question: ExamQuestion): boolean {
  const context = question.context?.trim() ?? ''
  if (CALCULATION_VERB.test(question.stem) && !/\d/.test(`${question.stem} ${context} ${(question.options ?? []).join(' ')}`)) return true
  for (const pattern of REFERENCE_PATTERNS) {
    const noun = pattern.exec(question.stem)?.[1]
    if (!noun) continue
    // The scenario has to hold what is referred to: a passage for a text, or something that names the model / table / figure.
    if (context.length >= MIN_REFERENCE_CONTEXT && (TEXT_THING.test(noun) || context.toLocaleLowerCase('tr-TR').includes(noun.toLocaleLowerCase('tr-TR').slice(0, 3)))) continue
    return true
  }
  return false
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/u)
    .map(normalize)
    .filter((sentence) => sentence.split(' ').length >= 5)
}

function blankLeaks(question: ExamQuestion): boolean {
  if (question.type !== 'fill-blanks') return false
  const haystack = normalize(`${question.stem.replace(/___/g, ' ')} ${question.context ?? ''}`)
  const words = haystack.split(' ').filter(Boolean)
  const answers = [question.answer, ...(question.acceptableAnswers ?? [])].map(normalize).filter((answer) => answer.length >= 3)
  return answers.some((answer) => {
    if (` ${haystack} `.includes(` ${answer} `)) return true
    if (answer.includes(' ')) return false
    return answer.length >= MIN_ANSWER_CHARS && words.some((word) => word.length >= MIN_ANSWER_CHARS && (word.startsWith(answer) || answer.startsWith(word)))
  })
}

const TERM_MIN_LETTERS = 7
const TERM_PREFIX = 6
const TERM_MAX_SHARE = 0.4
/** Question words that say nothing about the subject. */
const GENERIC_TERMS = new Set(['doğrud', 'belirl', 'kullan', 'hesapl', 'bulunu', 'hakkın', 'arasın', 'sırasın', 'olduğu', 'şeklin', 'nedenl', 'yoluyl', 'bakımı', 'sonucu', 'durumd', 'birbir', 'özelli', 'genell', 'bunlar', 'şunlar', 'ifadel', 'cümlel', 'cevapl', 'aşağıd', 'aşağıd', 'açıkla', 'karşıl', 'hangis', 'belirt', 'yazını', 'sonuçl', 'bulunu', 'örnekl', 'follow', 'explai', 'descri', 'compar', 'becaus', 'accord', 'statem', 'correc'])

/** How many questions may be about the same term: 3 in a short exam, 15 % of the exam in a long one. */
export function termLimit(questionCount: number): number {
  return Math.max(3, Math.ceil(0.15 * questionCount))
}

const PROPER_NOUN_MIN_LETTERS = 4
const PROPER_NOUN_PREFIX = 5

/** Names in the middle of a sentence ("Bumin Kağan'ın", "Avar"): short, but exactly what a repeated question is about. */
function properNouns(text: string): string[] {
  const names: string[] = []
  let sentenceStart = true
  for (const raw of text.split(/\s+/)) {
    const bare = (raw.replace(/^[("'“‘]+/u, '').split(/['’]/)[0] ?? '').replace(/[^\p{L}]/gu, '')
    if (!sentenceStart && bare.length >= PROPER_NOUN_MIN_LETTERS && /^\p{Lu}/u.test(bare)) names.push(bare.toLocaleLowerCase('tr-TR'))
    sentenceStart = /[.!?:]["”’')]*$/u.test(raw)
  }
  return names
}

interface TermUse {
  word: string
  ids: string[]
}

/** Subject words (stem and correct answer of every question) that more questions are built around than `termLimit` allows. */
function overusedTerms(questions: ExamQuestion[], topics: string[]): TermUse[] {
  const topicWords = topics.flatMap((topic) => normalize(topic).split(' '))
  const exempt = new Set([
    ...topicWords.filter((word) => word.length >= TERM_MIN_LETTERS).map((word) => word.slice(0, TERM_PREFIX)),
    ...topicWords.filter((word) => word.length >= PROPER_NOUN_MIN_LETTERS).map((word) => `p:${word.slice(0, PROPER_NOUN_PREFIX)}`),
  ])
  const uses = new Map<string, TermUse>()
  for (const question of questions) {
    const raw = question.type === 'matching' ? (question.pairs ?? []).map((pair) => pair.left).join(' ') : `${question.stem.replace(/___/g, ' ')} ${correctAnswerText(question)}`
    // Formulas are not words.
    const subject = raw.replace(/\$[^$]*\$/g, ' ')
    const words = new Set(normalize(subject).split(' ').filter((word) => word.length >= TERM_MIN_LETTERS))
    const names = new Set(properNouns(subject))
    const keyed = [...[...words].map((word) => ({ word, key: word.slice(0, TERM_PREFIX) })), ...[...names].map((word) => ({ word, key: `p:${word.slice(0, PROPER_NOUN_PREFIX)}` }))]
    const counted = new Set<string>()
    for (const { word, key } of keyed) {
      if (GENERIC_TERMS.has(key) || exempt.has(key) || counted.has(key)) continue
      counted.add(key)
      const use = uses.get(key) ?? { word, ids: [] }
      use.ids.push(question.id)
      uses.set(key, use)
    }
  }
  const limit = termLimit(questions.length)
  return [...uses.values()].filter((use) => use.ids.length > limit && use.ids.length / questions.length <= TERM_MAX_SHARE)
}

/** The words the exam leans on too much, to tell the model what not to ask about again. */
export function repeatedTerms(questions: ExamQuestion[], topics: string[] = []): string[] {
  return overusedTerms(questions, topics).map((use) => use.word)
}

export interface ExamQualityOptions {
  /** Topics the teacher asked for; questions may cluster around them. */
  topics?: string[]
  /** Judge verdicts for uncertain pairs (`pairKey` → "same fact"). */
  judged?: Map<string, boolean>
  /** Count an uncertain pair nobody judged as a repeat (default true). The server's per-reply filter turns this off. */
  uncertainIsDuplicate?: boolean
  /** The judge's blind reading of each question (`id` → can the answer be copied from the stem?). */
  copyable?: Map<string, boolean>
}

/** Whole-exam check. `counts` are the requested questions per type; pass null to skip the count rule (editing, single questions). */
export function checkExamQuality(questions: ExamQuestion[], counts: Record<ExamQuestionType, number> | null, options: ExamQualityOptions = {}): ExamQualityIssue[] {
  const issues: ExamQualityIssue[] = []
  const flagged = new Set<string>()
  const flag = (rule: ExamQualityRule, question: ExamQuestion, repeats?: { id: string; how: string }) => {
    if (flagged.has(`${rule}:${question.id}`)) return
    flagged.add(`${rule}:${question.id}`)
    issues.push({ rule, id: question.id, ...(repeats ? { with: repeats } : {}) })
  }

  if (counts) {
    for (const type of EXAM_QUESTION_TYPES) {
      if (questions.filter((question) => question.type === type).length !== counts[type]) issues.push({ rule: 'count', id: null, type })
    }
  }

  const answers = questions.map(answerKey)
  const tokens = questions.map(mathTokens)
  const contexts = questions.map((question) => (question.context ? stems(question.context) : new Set<string>()))
  const sentences = questions.map((question) => sentencesOf(question.context ?? ''))
  for (let index = 1; index < questions.length; index += 1) {
    const question = questions[index]
    for (let earlier = 0; earlier < index; earlier += 1) {
      const other = questions[earlier]
      // The same template with other numbers is another question; the same words on the same numbers is the same question.
      const sharedNumbers = [...tokens[index]].filter((token) => tokens[earlier].has(token)).length
      const otherNumbers = tokens[index].size > 0 && tokens[earlier].size > 0 && sharedNumbers / Math.min(tokens[index].size, tokens[earlier].size) <= 0.5
      const tier = pairTier(other, question)
      // A "maybe" is settled by the judge; without a verdict it counts as a repeat when `uncertainIsDuplicate` (the default).
      const judged = options.judged?.get(pairKey(other, question))
      const same = tier === 'yes' || (tier === 'maybe' && (judged ?? options.uncertainIsDuplicate ?? true))
      const factsDecide = Boolean(other.fact && question.fact)
      if (same && (factsDecide || !otherNumbers)) flag('duplicate', question, { id: other.id, how: tier === 'yes' ? 'tier-yes' : 'judge-same' })
      else if (!factsDecide && isSameMathFact(question, other, tokens, index, earlier)) flag('duplicate', question, { id: other.id, how: 'same-numbers' })
      if (answers[index] && answers[index] === answers[earlier]) flag('same-answer', question)
      if (question.context && other.context) {
        const sharedSentence = sentences[index].some((sentence) => sentences[earlier].includes(sentence))
        if (sharedSentence || (contexts[index].size >= 6 && overlap(contexts[index], contexts[earlier]) >= CONTEXT_OVERLAP)) flag('scenario', question)
      }
    }
  }

  for (const [index, question] of questions.entries()) {
    if (hasBrokenReference(question)) flag('reference', question)
    if (blankLeaks(question)) flag('blank-leak', question)
    // The stem must not retell its own scenario (not even by opening with the same person).
    if (question.context && (sentencesOf(question.stem).some((sentence) => sentences[index].some((other) => sentence === other || wordShare(sentence, other) >= RETOLD_SHARE)) || opensWithSamePerson(question))) flag('scenario', question)
  }

  for (const question of questions) {
    if (answerLeaks(question) || options.copyable?.get(question.id) === true) flag('answer-leak', question)
    if (question.type === 'short-answer' && shortAnswerProblems(question).some((problem) => problem !== 'rubric-items' && problem !== 'accepted-many')) flag('short-answer', question)
    if (question.type === 'fill-blanks' && fillBlankProblems(question).length > 0) flag('fill-blank', question)
    if (question.type === 'matching' && matchingProblems(question).length > 0) flag('matching', question)
    if (question.type === 'open-ended' && rubricProblems(question).length > 0) flag('rubric', question)
    if (question.type === 'true-false' && (joinsTwoClaims(question.stem) || (question.answerBool === false && isPlainNegation(question.stem)))) flag('tf-claims', question)
    if (question.type === 'mcq' && optionsUnevenFor(question)) flag('mcq-options', question)
  }
  const byId = new Map(questions.map((question) => [question.id, question]))
  for (const id of trueFalseAbsoluteIds(questions)) flag('tf-absolute', byId.get(id)!)
  const mcqIssues = mcqExamIssues(questions)
  for (const id of mcqIssues.longest) flag('mcq-longest', byId.get(id)!)
  for (const id of mcqIssues.stems) flag('mcq-stems', byId.get(id)!)
  for (const id of mcqIssues.negative) flag('mcq-negative', byId.get(id)!)
  for (const id of mcqIssues.letters) flag('mcq-balance', byId.get(id)!)

  const topics = options.topics ?? []
  const limit = termLimit(questions.length)
  for (const use of overusedTerms(questions, topics)) {
    // The first questions on a term stay; the later ones are rewritten.
    for (const id of use.ids.slice(limit)) {
      const question = questions.find((candidate) => candidate.id === id)
      if (question) flag('term-repeat', question)
    }
  }

  // A concept may carry two questions at most, and only when they differ in type or difficulty.
  const perConcept = new Map<string, ExamQuestion[]>()
  for (const question of questions) {
    const key = conceptKey(question.concept)
    if (!key) continue
    const accepted = perConcept.get(key) ?? []
    // Two questions on one concept must differ in type or in cognitive level (difficulty when no level is set).
    const sameKind = (other: ExamQuestion) => other.type === question.type && (question.bloomLevel !== undefined && other.bloomLevel !== undefined ? other.bloomLevel === question.bloomLevel : other.difficulty === question.difficulty)
    const clash = accepted.length >= MAX_QUESTIONS_PER_CONCEPT || accepted.some(sameKind)
    if (clash) flag('concept-cap', question)
    else accepted.push(question)
    perConcept.set(key, accepted)
  }

  const trueFalse = questions.filter((question) => question.type === 'true-false')
  if (trueFalse.length > 0) {
    const trueCount = trueFalse.filter((question) => question.answerBool === true).length
    const [min, max] = trueFalseRange(trueFalse.length)
    if (trueCount > max || trueCount < min) {
      // Rewrite the surplus statements of the answer that is over-represented.
      const surplusAnswer = trueCount > max
      const surplus = surplusAnswer ? trueCount - max : min - trueCount
      const pool = trueFalse.filter((question) => (question.answerBool === true) === surplusAnswer).slice(-surplus)
      for (const question of pool) flag('true-false-balance', question)
    }
  }

  const pointsOk =
    questions.reduce((sum, question) => sum + question.points, 0) === EXAM_TOTAL_POINTS &&
    questions.every((question) => Number.isInteger(question.points) && question.rubric.length > 0 && question.rubric.reduce((sum, item) => sum + item.points, 0) === question.points)
  if (!pointsOk) issues.push({ rule: 'points', id: null })
  return issues
}

/** Ids of the questions that have to be rewritten (the points rule is repaired without the model). */
export function questionsToRewrite(issues: ExamQualityIssue[]): Set<string> {
  const ids = new Set<string>()
  for (const issue of issues) if (issue.id) ids.add(issue.id)
  return ids
}

/** The answer text of a stored question in the same comparable form `answerKey` gives, for lists of answers sent as data. */
export function normalizeAnswer(text: string): string {
  const key = normalize(text)
  return key.length >= MIN_ANSWER_CHARS ? key : ''
}

/** Does `candidate` repeat something already on the exam? Used for a single replacement question. */
export function repeatsExistingQuestion(candidate: ExamQuestion, others: ExamQuestion[]): boolean {
  return checkExamQuality([...others, candidate], null).some((issue) => issue.id === candidate.id && issue.rule !== 'true-false-balance' && !SOFT_RULES.includes(issue.rule))
}
